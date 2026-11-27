// Objectflix: this is the config part, kept here so the rest of the app knows exactly where to look.
import { HttpError, nowSeconds } from "./http.js";

export const PLANS = Object.freeze([
  { id: "newbie", name: "Newbie", rank: 0, description: "Your place in the object universe. Always free." },
  { id: "announcers-pick", name: "Announcer's Pick", rank: 1, priceEnv: "STRIPE_PRICE_ANNOUNCERS_PICK", description: "Support the shows, and help set the scene." },
  { id: "fan-favorite", name: "Fan Favorite", rank: 2, priceEnv: "STRIPE_PRICE_FAN_FAVORITE", description: "A little more personality. A little closer to the community." },
  { id: "grand-champion", name: "Grand Champion", rank: 3, priceEnv: "STRIPE_PRICE_GRAND_CHAMPION", description: "Go all in on the community you love." },
]);
export const planFor = (id) => PLANS.find((plan) => plan.id === id);
export const rankFor = (id) => planFor(id)?.rank ?? 0;

export const PERKS = Object.freeze([
  ["regular_content", "All regular Objectflix content", "newbie", true],
  ["personal_watchlist", "Personal watchlist", "newbie", true],
  ["viewing_history", "Viewing history on this device", "newbie", true],
  ["basic_customization", "Basic profile customization", "newbie", true],
  ["public_movie_nights", "Public Movie Nights and public polls", "newbie", true],
  ["recommendations", "Recommendations from your list and history", "newbie", true],
  ["ad_free", "Ad-free viewing", "announcers-pick", false],
  ["extra_watchlists", "Additional watchlists", "announcers-pick", false],
  ["profile_frames", "Supporter profile frames", "announcers-pick", true],
  ["supporter_badge", "Exclusive supporter badge", "announcers-pick", true],
  ["extended_stats", "Extended viewing statistics", "announcers-pick", false],
  ["movie_supporter_badge", "Movie Night supporter badge", "announcers-pick", true],
  ["movie_theme_suggestions", "Suggest Movie Night themes", "announcers-pick", true],
  ["member_polls", "Eligible member polls", "announcers-pick", true],
  ["profile_themes", "Additional profile themes", "fan-favorite", true],
  ["animated_decorations", "Animated profile decorations", "fan-favorite", true],
  ["shared_watchlists", "Shared watchlists", "fan-favorite", false],
  ["advanced_stats", "Advanced viewing statistics", "fan-favorite", false],
  ["behind_the_scenes", "Behind-the-scenes content", "fan-favorite", false],
  ["commentary", "Production commentary", "fan-favorite", false],
  ["seasonal_cosmetics", "Seasonal profile cosmetics", "fan-favorite", true],
  ["movie_cosmetics", "Movie Night profile cosmetics", "fan-favorite", true],
  ["feature_suggestions", "Suggest future platform features", "fan-favorite", true],
  ["priority_announcements", "Early Movie Night announcements", "fan-favorite", true],
  ["all_customization", "All shipped profile customization options", "grand-champion", true],
  ["champion_frame", "Exclusive animated champion frame", "grand-champion", true],
  ["supporter_title", "Special supporter title", "grand-champion", true],
  ["full_stats", "Full viewing statistics", "grand-champion", false],
  ["early_features", "Early access to selected features", "grand-champion", false],
  ["movie_recognition", "Optional Movie Night supporter recognition", "grand-champion", true],
  ["community_extras", "Additional community perks", "grand-champion", false],
].map(([id, label, minPlan, implemented]) => Object.freeze({ id, label, minPlan, implemented, enabled: implemented })));

export function perkConfiguration(env) {
  let overrides;
  try { overrides = JSON.parse(env.MEMBERSHIP_PERKS_JSON || "{}"); }
  catch { throw new HttpError(503, "Membership configuration is unavailable.", "configuration_required"); }
  if (!overrides || Array.isArray(overrides) || typeof overrides !== "object") throw new HttpError(503, "Membership configuration is unavailable.", "configuration_required");
  return PERKS.map((perk) => {
    const override = overrides[perk.id] || {};
    const publicPerk = ["regular_content", "public_movie_nights"].includes(perk.id);
    return { ...perk,
      minPlan: publicPerk ? "newbie" : planFor(override.minPlan)?.id || perk.minPlan,
      enabled: publicPerk || (perk.implemented && (typeof override.enabled === "boolean" ? override.enabled : perk.enabled)),
    };
  });
}

export function entitlementsFor(env, planId) {
  return Object.fromEntries(perkConfiguration(env).map((perk) => [perk.id, perk.implemented && perk.enabled && rankFor(planId) >= rankFor(perk.minPlan)]));
}

export function planFromPrice(env, priceId) {
  if (!priceId) return null;
  const matches = PLANS.filter((plan) => plan.priceEnv && env[plan.priceEnv] === priceId);
  if (matches.length > 1) throw new HttpError(503, "Each plan needs a distinct Stripe Price.", "configuration_required");
  return matches[0] || null;
}

export function effectivePlan(subscriptions, now = nowSeconds()) {
  const entitled = subscriptions.filter((sub) => ["active", "past_due"].includes(sub.status) && sub.paid_through > now && (!sub.cancel_at || sub.cancel_at > now));
  return entitled.sort((a, b) => rankFor(b.entitled_plan_id) - rankFor(a.entitled_plan_id))[0]?.entitled_plan_id || "newbie";
}

export const COSMETICS = Object.freeze({
  frames: [{ id: "none", label: "Simple", perk: null }, { id: "supporter", label: "Announcer's frame", perk: "profile_frames" }, { id: "movie-night", label: "Movie Night ticket", perk: "movie_cosmetics" }, { id: "champion", label: "Animated champion", perk: "champion_frame" }],
  themes: [{ id: "default", label: "Classic", perk: null }, { id: "mint", label: "Goiky green", perk: "profile_themes" }, { id: "lilac", label: "Yoyle lilac", perk: "profile_themes" }, { id: "sunset", label: "Golden hour", perk: "profile_themes" }],
  decorations: [{ id: "none", label: "No decoration", perk: null }, { id: "spark", label: "Little spark", perk: "animated_decorations" }, { id: "seasonal", label: "Autumn leaf", perk: "seasonal_cosmetics" }],
});

export function effectivePreferences(row, entitlements) {
  const permitted = (items, value, fallback) => {
    const item = items.find((entry) => entry.id === value);
    return item && (!item.perk || entitlements[item.perk]) ? item.id : fallback;
  };
  return {
    frame: permitted(COSMETICS.frames, row?.frame, "none"),
    theme: permitted(COSMETICS.themes, row?.theme, "default"),
    decoration: permitted(COSMETICS.decorations, row?.decoration, "none"),
    showBadge: row?.show_badge !== 0 && entitlements.supporter_badge,
    showTitle: Boolean(row?.show_title && entitlements.supporter_title),
    recognitionOptIn: Boolean(row?.recognition_opt_in && entitlements.movie_recognition),
  };
}

export async function memberState(env, userId) {
  const [subscriptions, preference, customer] = await env.DB.batch([
    env.DB.prepare("SELECT * FROM billing_subscriptions WHERE user_id = ? ORDER BY verified_at DESC").bind(userId),
    env.DB.prepare("SELECT * FROM member_preferences WHERE user_id = ?").bind(userId),
    env.DB.prepare("SELECT user_id FROM billing_customers WHERE user_id = ?").bind(userId),
  ]);
  const rows = (subscriptions.results || []).filter((sub) => Boolean(sub.livemode) === (env.STRIPE_MODE === "live"));
  const planId = effectivePlan(rows);
  const current = rows.find((sub) => !["canceled", "incomplete_expired"].includes(sub.status)) || rows[0];
  const entitlements = entitlementsFor(env, planId);
  return { planId, planName: planFor(planId).name, entitlements,
    status: current?.status || "free",
    billing: { hasCustomer: Boolean(customer.results?.length), hasSubscription: Boolean(current && !["canceled", "incomplete_expired"].includes(current.status)),
      subscribedPlanId: current?.plan_id || "newbie", cancelAtPeriodEnd: Boolean(current?.cancel_at_period_end), cancelAt: current?.cancel_at || null,
      periodEnd: current?.current_period_end || null, paidThrough: current?.paid_through || null, lastVerifiedAt: current?.verified_at || null },
    preferences: effectivePreferences(preference.results?.[0], entitlements),
  };
}

export function requirePerk(member, key) {
  if (!member.entitlements[key]) throw new HttpError(403, "This perk is not included in your current membership.", "perk_required");
}
