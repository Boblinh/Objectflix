import { Hono } from "hono";
import { HttpError, apiError, nowSeconds, readBody, withLease } from "./http.js";
import { planFromPrice } from "./config.js";
import { liveMode, stripeId, stripeRequest, verifyStripeSignature } from "./stripe.js";

export const BILLING_EVENTS = new Set([
  "checkout.session.completed", "checkout.session.async_payment_succeeded", "checkout.session.async_payment_failed",
  "customer.subscription.created", "customer.subscription.updated", "customer.subscription.deleted",
  "customer.subscription.paused", "customer.subscription.resumed",
  "invoice.paid", "invoice.payment_failed", "invoice.payment_action_required", "invoice.finalization_failed",
]);

export const invoiceSubscription = (invoice) => stripeId(invoice?.parent?.subscription_details?.subscription || invoice?.subscription, "sub");
const linePrice = (line) => stripeId(line.pricing?.price_details?.price || line.price, "price");

export function eventEnvelope(event) {
  if (!stripeId(event?.id, "evt") || typeof event.type !== "string" || typeof event.livemode !== "boolean" || !event.data?.object) {
    throw new HttpError(400, "Malformed Stripe event.", "invalid_event");
  }
  const object = event.data.object;
  const checkout = event.type.startsWith("checkout.session.");
  const ignored = !BILLING_EVENTS.has(event.type) || (checkout && object.mode !== "subscription");
  return {
    event_id: event.id, event_type: event.type,
    customer_id: stripeId(object.customer, "cus"),
    subscription_id: event.type.startsWith("customer.subscription.") ? stripeId(object.id, "sub") : checkout ? stripeId(object.subscription, "sub") : invoiceSubscription(object),
    object_id: typeof object.id === "string" ? object.id.slice(0, 150) : null,
    livemode: Number(event.livemode), state: ignored ? "ignored" : "pending",
  };
}

export function subscriptionSnapshot(env, subscription, invoice, previous, now = nowSeconds()) {
  const items = subscription.items?.data || [];
  const item = items.length === 1 && !subscription.items?.has_more ? items[0] : null;
  const priceId = stripeId(item?.price, "price");
  const configuredPlan = planFromPrice(env, priceId);
  const interval = item?.price?.recurring;
  const supported = configuredPlan && item && (item.quantity ?? 1) === 1 && interval?.interval === "month" && interval.interval_count === 1;
  const periodEnd = Number(item?.current_period_end || subscription.current_period_end || 0);
  const cancelAt = Number(subscription.cancel_at) || null;
  const canRetain = supported && ["active", "past_due"].includes(subscription.status);
  let entitledPlan = canRetain && previous?.paid_through > now ? previous.entitled_plan_id : "newbie";
  let paidThrough = canRetain ? previous?.paid_through || 0 : 0;

  const paidLines = invoice?.lines?.data?.filter((line) => linePrice(line) === priceId && Number(line.amount) >= 0 && Number(line.period?.start || 0) <= now) || [];
  const paidEnd = Math.max(0, ...paidLines.map((line) => Number(line.period?.end) || 0));
  const invoiceMatches = invoiceSubscription(invoice) === subscription.id && stripeId(invoice?.customer, "cus") === stripeId(subscription.customer, "cus");
  if (supported && subscription.status === "active" && invoice?.status === "paid" && invoiceMatches && paidEnd > now && periodEnd > now) {
    entitledPlan = configuredPlan.id;
    paidThrough = Math.min(paidEnd, periodEnd);
  }
  if (subscription.pause_collection || !canRetain || paidThrough <= now) { entitledPlan = "newbie"; paidThrough = 0; }
  if (cancelAt) paidThrough = Math.min(paidThrough, cancelAt);
  if (paidThrough <= now) { entitledPlan = "newbie"; paidThrough = 0; }
  return { priceId, planId: supported ? configuredPlan.id : "newbie", status: subscription.status,
    entitledPlan, paidThrough, periodEnd, cancelAt, cancelAtPeriodEnd: Boolean(subscription.cancel_at_period_end),
    invoiceStatus: invoice?.status || null };
}

async function markIgnored(env, eventId) {
  await env.DB.prepare("UPDATE stripe_webhook_events SET state = 'ignored', processed_at = ?, last_error_code = NULL WHERE event_id = ? AND state = 'pending'")
    .bind(nowSeconds(), eventId).run();
}

export async function processVerifiedEvent(env, eventId) {
  const event = await env.DB.prepare("SELECT * FROM stripe_webhook_events WHERE event_id = ?").bind(eventId).first();
  if (!event || event.state !== "pending") return;
  if (Boolean(event.livemode) !== liveMode(env)) throw new HttpError(503, "Billing mode mismatch.", "billing_mode_mismatch");
  if (!event.customer_id || !event.subscription_id) { await markIgnored(env, eventId); return; }

  await withLease(env, `stripe:${event.customer_id}`, async (lease) => {
    const customer = await env.DB.prepare("SELECT * FROM billing_customers WHERE stripe_customer_id = ? AND livemode = ?")
      .bind(event.customer_id, event.livemode).first();
    if (!customer) { await markIgnored(env, eventId); return; }
    const previous = await env.DB.prepare("SELECT * FROM billing_subscriptions WHERE stripe_subscription_id = ? AND user_id = ?")
      .bind(event.subscription_id, customer.user_id).first();
    const subscription = await stripeRequest(env, "GET", `/subscriptions/${event.subscription_id}`, { "expand[0]": "latest_invoice" });
    if (stripeId(subscription.customer, "cus") !== event.customer_id) throw new HttpError(409, "Subscription customer mismatch.", "customer_mismatch");
    if (subscription.metadata?.objectflix_user_id !== customer.user_id) {
      if (!previous) { await markIgnored(env, eventId); return; }
      subscription.items = { data: [] };
    }
    let invoice = subscription.latest_invoice;
    if (typeof invoice === "string") invoice = await stripeRequest(env, "GET", `/invoices/${invoice}`);
    if (invoice?.lines?.has_more) {
      const lines = await stripeRequest(env, "GET", `/invoices/${invoice.id}/lines`, { limit: 100 });
      invoice = lines.has_more ? null : { ...invoice, lines };
    }
    const snapshot = subscriptionSnapshot(env, subscription, invoice, previous);
    const now = nowSeconds();
    const guard = "EXISTS (SELECT 1 FROM billing_leases WHERE resource = ? AND token = ? AND expires_at > ?)";
    const result = await env.DB.batch([
      env.DB.prepare(`INSERT INTO billing_subscriptions
        (stripe_subscription_id, user_id, stripe_customer_id, price_id, plan_id, status, entitled_plan_id, paid_through,
         current_period_end, cancel_at_period_end, cancel_at, latest_invoice_status, livemode, verified_at, verified_event_id)
        SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ? WHERE ${guard}
        ON CONFLICT(stripe_subscription_id) DO UPDATE SET price_id = excluded.price_id, plan_id = excluded.plan_id,
        status = excluded.status, entitled_plan_id = excluded.entitled_plan_id, paid_through = excluded.paid_through,
        current_period_end = excluded.current_period_end, cancel_at_period_end = excluded.cancel_at_period_end,
        cancel_at = excluded.cancel_at, latest_invoice_status = excluded.latest_invoice_status,
        verified_at = excluded.verified_at, verified_event_id = excluded.verified_event_id
        WHERE billing_subscriptions.user_id = excluded.user_id AND billing_subscriptions.stripe_customer_id = excluded.stripe_customer_id`)
        .bind(subscription.id, customer.user_id, event.customer_id, snapshot.priceId, snapshot.planId, snapshot.status,
          snapshot.entitledPlan, snapshot.paidThrough, snapshot.periodEnd, Number(snapshot.cancelAtPeriodEnd), snapshot.cancelAt,
          snapshot.invoiceStatus, event.livemode, now, eventId, lease.resource, lease.token, now),
      env.DB.prepare(`UPDATE stripe_webhook_events SET state = 'processed', processed_at = ?, attempts = attempts + 1,
        last_error_code = NULL WHERE event_id = ? AND state = 'pending' AND ${guard}
        AND EXISTS (SELECT 1 FROM billing_subscriptions WHERE stripe_subscription_id = ? AND user_id = ? AND verified_event_id = ?)`)
        .bind(now, eventId, lease.resource, lease.token, now, subscription.id, customer.user_id, eventId),
      env.DB.prepare(`DELETE FROM billing_checkouts WHERE user_id = ? AND session_id = ?
        AND EXISTS (SELECT 1 FROM stripe_webhook_events WHERE event_id = ? AND state = 'processed')`)
        .bind(customer.user_id, stripeId(event.object_id, "cs") || "", eventId),
    ]);
    if (!result[0].meta.changes && result[1].meta.changes) throw new HttpError(409, "Subscription ownership could not be synchronized.", "ownership_conflict");
    if (!result[1].meta.changes) {
      const latest = await env.DB.prepare("SELECT state FROM stripe_webhook_events WHERE event_id = ?").bind(eventId).first();
      if (latest?.state !== "processed") throw new HttpError(409, "Billing synchronization must be retried.", "lease_expired");
    }
  });
}

export async function attemptVerifiedEvent(env, eventId) {
  try { await processVerifiedEvent(env, eventId); }
  catch (error) {
    const safeCode = error instanceof HttpError ? error.code : "synchronization_failed";
    await env.DB.prepare(`UPDATE stripe_webhook_events SET attempts = attempts + 1, next_attempt_at = ?, last_error_code = ?
      WHERE event_id = ? AND state = 'pending'`).bind(nowSeconds() + 60, safeCode, eventId).run();
    console.error(`[membership-webhook] ${eventId}: ${safeCode}`);
  }
}

export async function processPendingWebhooks(env) {
  if (!env.STRIPE_SECRET_KEY || !env.STRIPE_WEBHOOK_SECRET) return;
  const { results } = await env.DB.prepare("SELECT event_id FROM stripe_webhook_events WHERE state = 'pending' AND next_attempt_at <= ? ORDER BY received_at LIMIT 20")
    .bind(nowSeconds()).all();
  for (const event of results) await attemptVerifiedEvent(env, event.event_id);
  await env.DB.batch([
    env.DB.prepare("DELETE FROM account_sessions WHERE expires_at <= ?").bind(nowSeconds()),
    env.DB.prepare("DELETE FROM membership_rate_limits WHERE window_start < ?").bind(nowSeconds() - 86400),
  ]);
}

export const stripeWebhooks = new Hono();
stripeWebhooks.onError(apiError);
stripeWebhooks.post("/", async (c) => {
  const payload = await readBody(c.req.raw, 262144);
  await verifyStripeSignature(payload, c.req.header("stripe-signature"), c.env);
  let rawEvent;
  try { rawEvent = JSON.parse(payload); } catch { throw new HttpError(400, "Invalid event JSON.", "invalid_event"); }
  const event = eventEnvelope(rawEvent);
  if (Boolean(event.livemode) !== liveMode(c.env)) throw new HttpError(400, "This event belongs to a different billing environment.", "billing_mode_mismatch");
  await c.env.DB.prepare(`INSERT INTO stripe_webhook_events
    (event_id, event_type, customer_id, subscription_id, object_id, livemode, state, received_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(event_id) DO NOTHING`)
    .bind(event.event_id, event.event_type, event.customer_id, event.subscription_id, event.object_id, event.livemode, event.state, nowSeconds()).run();
  if (event.state === "pending") c.executionCtx.waitUntil(attemptVerifiedEvent(c.env, event.event_id));
  c.header("Cache-Control", "no-store");
  return c.json({ received: true });
});
