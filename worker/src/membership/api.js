import { Hono } from "hono";
import { z } from "zod";
import { HttpError, apiError, appUrl, assertOrigin, jsonBody, nowSeconds, rateLimit } from "./http.js";
import { requireIdentity, requireMembershipAdmin, isMembershipAdmin } from "./identity.js";
import { PLANS, COSMETICS, entitlementsFor, memberState, perkConfiguration, planFromPrice, requirePerk } from "./config.js";
import { billingConfigured, liveMode, monthlyPrice } from "./stripe.js";
import { createCheckout, createPortal } from "./billing.js";
import { attemptVerifiedEvent } from "./webhooks.js";

const planId = z.enum(PLANS.map((plan) => plan.id));
const preferencesSchema = z.object({
  frame: z.enum(COSMETICS.frames.map((item) => item.id)),
  theme: z.enum(COSMETICS.themes.map((item) => item.id)),
  decoration: z.enum(COSMETICS.decorations.map((item) => item.id)),
  showBadge: z.boolean(), showTitle: z.boolean(), recognitionOptIn: z.boolean(),
}).strict();

export const membership = new Hono();
membership.onError(apiError);
membership.use("*", async (c, next) => { c.header("Cache-Control", "no-store"); await next(); });

membership.get("/plans", async (c) => {
  const perks = perkConfiguration(c.env);
  let ready = billingConfigured(c.env);
  try { appUrl(c.env); } catch { ready = false; }
  const plans = await Promise.all(PLANS.map(async (plan) => {
    let price = null;
    if (plan.priceEnv && ready && c.env[plan.priceEnv]) {
      try {
        const configured = await monthlyPrice(c.env, c.env[plan.priceEnv]);
        if (planFromPrice(c.env, configured.id)?.id !== plan.id) throw new Error("Invalid plan price mapping");
        price = { unitAmount: configured.unit_amount, currency: configured.currency, interval: "month" };
      } catch { /* No guessed price or false checkout promise during an outage. */ }
    }
    return { id: plan.id, name: plan.name, rank: plan.rank, description: plan.description, price,
      free: plan.id === "newbie", checkoutAvailable: Boolean(price && ready), entitlements: entitlementsFor(c.env, plan.id) };
  }));
  return c.json({ success: true, plans, perks, mode: liveMode(c.env) ? "live" : "test" });
});

membership.use("*", requireIdentity);
membership.get("/me", async (c) => {
  const user = c.get("user");
  const member = await memberState(c.env, user.id);
  const cosmetics = Object.fromEntries(Object.entries(COSMETICS).map(([group, items]) => [group, items.map((item) => ({ ...item, available: !item.perk || member.entitlements[item.perk] }))]));
  return c.json({ success: true, membership: member, cosmetics, user: { id: user.id, displayName: user.display_name }, isStaff: isMembershipAdmin(c.env, user) });
});

membership.post("/checkout", async (c) => {
  assertOrigin(c);
  const body = await jsonBody(c, z.object({ planId }).strict());
  await rateLimit(c.env, `checkout:${c.get("user").id}`, 8);
  return c.json({ success: true, ...await createCheckout(c.env, c.get("user"), body.planId) });
});

membership.post("/portal", async (c) => {
  assertOrigin(c);
  const body = await jsonBody(c, z.object({ planId: planId.optional() }).strict());
  await rateLimit(c.env, `portal:${c.get("user").id}`, 10);
  return c.json({ success: true, ...await createPortal(c.env, c.get("user"), body.planId) });
});

membership.put("/preferences", async (c) => {
  const user = c.get("user");
  const values = await jsonBody(c, preferencesSchema);
  const member = await memberState(c.env, user.id);
  for (const [group, key] of [["frames", "frame"], ["themes", "theme"], ["decorations", "decoration"]]) {
    const option = COSMETICS[group].find((item) => item.id === values[key]);
    if (option.perk) requirePerk(member, option.perk);
  }
  if (values.showBadge) requirePerk(member, "supporter_badge");
  if (values.showTitle) requirePerk(member, "supporter_title");
  if (values.recognitionOptIn) requirePerk(member, "movie_recognition");
  await c.env.DB.prepare(`INSERT INTO member_preferences (user_id, frame, theme, decoration, show_badge, show_title, recognition_opt_in, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(user_id) DO UPDATE SET frame = excluded.frame, theme = excluded.theme,
    decoration = excluded.decoration, show_badge = excluded.show_badge, show_title = excluded.show_title,
    recognition_opt_in = excluded.recognition_opt_in, updated_at = excluded.updated_at`)
    .bind(user.id, values.frame, values.theme, values.decoration, Number(values.showBadge), Number(values.showTitle), Number(values.recognitionOptIn), nowSeconds()).run();
  return c.json({ success: true, membership: await memberState(c.env, user.id) });
});

membership.post("/feature-suggestions", async (c) => {
  const user = c.get("user");
  requirePerk(await memberState(c.env, user.id), "feature_suggestions");
  const values = await jsonBody(c, z.object({ title: z.string().trim().min(3).max(100), description: z.string().trim().min(10).max(2000) }).strict());
  await rateLimit(c.env, `feature-suggestion:${user.id}`, 3, 86400);
  await c.env.DB.prepare("INSERT INTO member_feature_suggestions (id, user_id, title, description, created_at) VALUES (?, ?, ?, ?, ?)")
    .bind(crypto.randomUUID(), user.id, values.title, values.description, nowSeconds()).run();
  return c.json({ success: true }, 201);
});

membership.get("/admin/webhooks", requireMembershipAdmin, async (c) => {
  const { results } = await c.env.DB.prepare("SELECT event_id, event_type, state, attempts, received_at, processed_at, last_error_code FROM stripe_webhook_events ORDER BY received_at DESC LIMIT 100").all();
  return c.json({ success: true, events: results });
});

membership.post("/admin/webhooks/:id/retry", requireMembershipAdmin, async (c) => {
  const event = await c.env.DB.prepare("SELECT event_id, state FROM stripe_webhook_events WHERE event_id = ?").bind(c.req.param("id")).first();
  if (!event) throw new HttpError(404, "Verified event not found.", "event_not_found");
  if (event.state === "pending") await attemptVerifiedEvent(c.env, event.event_id);
  return c.json({ success: true });
});

membership.get("/admin/feature-suggestions", requireMembershipAdmin, async (c) => {
  const { results } = await c.env.DB.prepare("SELECT id, title, description, created_at FROM member_feature_suggestions ORDER BY created_at DESC LIMIT 100").all();
  return c.json({ success: true, suggestions: results });
});
