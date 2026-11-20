import { HttpError, appUrl, nowSeconds, withLease } from "./http.js";
import { planFor, planFromPrice } from "./config.js";
import { billingConfigured, liveMode, monthlyPrice, safeStripeUrl, stripeId, stripeRequest } from "./stripe.js";

async function customerFor(env, user) {
  const existing = await env.DB.prepare("SELECT * FROM billing_customers WHERE user_id = ?").bind(user.id).first();
  if (existing) {
    if (Boolean(existing.livemode) !== liveMode(env)) throw new HttpError(503, "Billing environments must use separate databases.", "billing_mode_mismatch");
    return existing.stripe_customer_id;
  }
  const customer = await stripeRequest(env, "POST", "/customers", {
    name: user.display_name,
    email: user.email || undefined,
    "metadata[objectflix_user_id]": user.id,
  }, `objectflix:customer:${liveMode(env) ? "live" : "test"}:${user.id}`);
  if (!stripeId(customer.id, "cus")) throw new HttpError(502, "Stripe did not create a customer.", "stripe_unavailable");
  await env.DB.prepare("INSERT INTO billing_customers (user_id, stripe_customer_id, livemode, created_at) VALUES (?, ?, ?, ?)")
    .bind(user.id, customer.id, Number(liveMode(env)), nowSeconds()).run();
  return customer.id;
}

export async function currentStripeSubscriptions(env, customer, userId) {
  const response = await stripeRequest(env, "GET", "/subscriptions", { customer, status: "all", limit: 100 });
  if (response.has_more) throw new HttpError(409, "Please manage this account through billing support.", "billing_review_required");
  return (response.data || []).filter((sub) => sub.metadata?.objectflix_user_id === userId && !["canceled", "incomplete_expired"].includes(sub.status));
}

export async function createCheckout(env, user, planId, base) {
  const plan = planFor(planId);
  if (!plan?.priceEnv) throw new HttpError(400, "Choose a paid membership plan.", "invalid_plan");
  if (!billingConfigured(env)) throw new HttpError(503, "Membership checkout is not open yet.", "billing_not_configured");
  const returnBase = base || appUrl(env);
  const price = await monthlyPrice(env, env[plan.priceEnv]);
  if (planFromPrice(env, price.id)?.id !== planId) throw new HttpError(503, "Plan pricing needs to be reviewed.", "configuration_required");

  return withLease(env, `checkout:${user.id}`, async () => {
    const customer = await customerFor(env, user);
    const active = await currentStripeSubscriptions(env, customer, user.id);
    if (active.length) throw new HttpError(409, "You already have a subscription. Use Manage membership to change it.", "subscription_exists");

    let attempt = await env.DB.prepare("SELECT * FROM billing_checkouts WHERE user_id = ?").bind(user.id).first();
    if (attempt?.session_id) {
      const previous = await stripeRequest(env, "GET", `/checkout/sessions/${attempt.session_id}`);
      if (previous.status === "complete") {
        const closed = await env.DB.prepare(`SELECT stripe_subscription_id FROM billing_subscriptions
          WHERE user_id = ? AND stripe_subscription_id = ? AND status IN ('canceled', 'incomplete_expired')`)
          .bind(user.id, stripeId(previous.subscription, "sub") || "").first();
        if (!closed) throw new HttpError(409, "Your payment is being confirmed. Check your membership status shortly.", "confirmation_pending");
      }
      if (previous.status === "open" && attempt.plan_id === planId && attempt.price_id === price.id) {
        return { url: safeStripeUrl(previous.url, "checkout") };
      }
      if (previous.status === "open") await stripeRequest(env, "POST", `/checkout/sessions/${attempt.session_id}/expire`, {}, `objectflix:expire:${attempt.session_id}`);
      await env.DB.prepare("DELETE FROM billing_checkouts WHERE user_id = ?").bind(user.id).run();
      attempt = null;
    }

    if (attempt && (attempt.plan_id !== planId || attempt.price_id !== price.id)) {
      throw new HttpError(409, "Finish or retry your previous checkout before choosing another plan.", "checkout_pending");
    }
    if (attempt && attempt.expires_at <= nowSeconds()) {
      await env.DB.prepare("DELETE FROM billing_checkouts WHERE user_id = ?").bind(user.id).run();
      attempt = null;
    }
    if (!attempt) {
      attempt = { request_id: crypto.randomUUID(), created_at: nowSeconds(), expires_at: nowSeconds() + 86400, price_id: price.id, plan_id: planId };
      await env.DB.prepare("INSERT INTO billing_checkouts (user_id, request_id, plan_id, price_id, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?)")
        .bind(user.id, attempt.request_id, planId, price.id, attempt.created_at, attempt.expires_at).run();
    }
    if (attempt.expires_at - nowSeconds() < 1800) throw new HttpError(409, "This checkout attempt is expiring. Please try again after it expires.", "checkout_expiring");
    const session = await stripeRequest(env, "POST", "/checkout/sessions", {
      mode: "subscription", customer, client_reference_id: user.id,
      "line_items[0][price]": attempt.price_id, "line_items[0][quantity]": 1,
      "metadata[objectflix_user_id]": user.id,
      "metadata[objectflix_request_id]": attempt.request_id,
      "subscription_data[metadata][objectflix_user_id]": user.id,
      success_url: new URL("membership.html?checkout=returned", returnBase).href,
      cancel_url: new URL("membership.html?checkout=cancelled", returnBase).href,
      expires_at: attempt.expires_at,
    }, `objectflix:checkout:${attempt.request_id}`);
    if (!stripeId(session.id, "cs")) throw new HttpError(502, "Stripe did not create a checkout session.", "stripe_unavailable");
    await env.DB.prepare("UPDATE billing_checkouts SET session_id = ? WHERE user_id = ? AND request_id = ?")
      .bind(session.id, user.id, attempt.request_id).run();
    return { url: safeStripeUrl(session.url, "checkout") };
  });
}

export async function createPortal(env, user, targetPlanId, base) {
  if (!/^bpc_[A-Za-z0-9]+$/.test(env.STRIPE_PORTAL_CONFIGURATION_ID || "")) throw new HttpError(503, "Billing management is not configured yet.", "billing_not_configured");
  const customer = await env.DB.prepare("SELECT * FROM billing_customers WHERE user_id = ?").bind(user.id).first();
  if (!customer || Boolean(customer.livemode) !== liveMode(env)) throw new HttpError(404, "There is no billing account to manage yet.", "customer_not_found");
  const parameters = { customer: customer.stripe_customer_id, configuration: env.STRIPE_PORTAL_CONFIGURATION_ID,
    return_url: new URL("membership.html?billing=returned", base || appUrl(env)).href };
  if (targetPlanId) {
    const subscriptions = await currentStripeSubscriptions(env, customer.stripe_customer_id, user.id);
    if (subscriptions.length !== 1) throw new HttpError(409, "Open Manage billing to review your subscriptions.", "billing_review_required");
    const subscription = subscriptions[0];
    if (targetPlanId === "newbie") {
      parameters["flow_data[type]"] = "subscription_cancel";
      parameters["flow_data[subscription_cancel][subscription]"] = subscription.id;
    } else {
      const plan = planFor(targetPlanId);
      if (!plan?.priceEnv) throw new HttpError(400, "Unknown membership plan.", "invalid_plan");
      const price = await monthlyPrice(env, env[plan.priceEnv]);
      const items = subscription.items?.data || [];
      if (items.length !== 1 || subscription.items.has_more) throw new HttpError(409, "Open Manage billing to change this subscription.", "billing_review_required");
      parameters["flow_data[type]"] = "subscription_update_confirm";
      parameters["flow_data[subscription_update_confirm][subscription]"] = subscription.id;
      parameters["flow_data[subscription_update_confirm][items][0][id]"] = items[0].id;
      parameters["flow_data[subscription_update_confirm][items][0][price]"] = price.id;
      parameters["flow_data[subscription_update_confirm][items][0][quantity]"] = 1;
    }
    parameters["flow_data[after_completion][type]"] = "redirect";
    parameters["flow_data[after_completion][redirect][return_url]"] = parameters.return_url;
  }
  const session = await stripeRequest(env, "POST", "/billing_portal/sessions", parameters);
  return { url: safeStripeUrl(session.url, "portal") };
}
