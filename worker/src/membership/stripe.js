// Objectflix: this is the stripe part, kept here so the rest of the app knows exactly where to look.
import { HttpError, nowSeconds } from "./http.js";

export const STRIPE_API_VERSION = "2025-06-30.basil";
export const liveMode = (env) => env.STRIPE_MODE === "live";

export function requireStripe(env) {
  const expected = liveMode(env) ? "live" : "test";
  if (!new RegExp(`^(sk|rk)_${expected}_[A-Za-z0-9_]+$`).test(env.STRIPE_SECRET_KEY || "")) {
    throw new HttpError(503, "Membership payments are not configured yet.", "billing_not_configured");
  }
}

export function billingConfigured(env) {
  try { requireStripe(env); return /^bpc_[A-Za-z0-9]+$/.test(env.STRIPE_PORTAL_CONFIGURATION_ID || "") && Boolean(env.STRIPE_WEBHOOK_SECRET); }
  catch { return false; }
}

export function stripeId(value, prefix) {
  const id = typeof value === "object" && value ? value.id : value;
  return typeof id === "string" && new RegExp(`^${prefix}_[A-Za-z0-9_]+$`).test(id) ? id : null;
}

export async function stripeRequest(env, method, path, parameters = {}, idempotencyKey) {
  requireStripe(env);
  const headers = {
    Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`,
    "Stripe-Version": STRIPE_API_VERSION,
  };
  const fields = new URLSearchParams();
  for (const [key, value] of Object.entries(parameters)) if (value !== undefined && value !== null) fields.set(key, String(value));
  let url = `https://api.stripe.com/v1${path}`;
  if (method === "GET" && fields.size) url += `?${fields}`;
  if (method !== "GET") headers["Content-Type"] = "application/x-www-form-urlencoded";
  if (idempotencyKey) headers["Idempotency-Key"] = idempotencyKey;
  let response;
  try {
    response = await fetch(url, { method, headers, body: method === "GET" ? undefined : fields.toString(), signal: AbortSignal.timeout(12000) });
  } catch { throw new HttpError(502, "Stripe is taking a little longer. Please try again.", "stripe_unavailable"); }
  let result;
  try { result = await response.json(); } catch { throw new HttpError(502, "Stripe returned an unexpected response.", "stripe_unavailable"); }
  if (!response.ok) {
    console.error("[stripe] request failed:", method, path, response.status, result?.error?.code || "", result?.error?.message || "");
    throw new HttpError(response.status === 404 ? 404 : 502,
      response.status === 404 ? "The billing record could not be found." : "Stripe could not complete this request. Please try again.",
      response.status === 404 ? "stripe_not_found" : "stripe_request_failed");
  }
  if (typeof result.livemode === "boolean" && result.livemode !== liveMode(env)) throw new HttpError(503, "Billing environment mismatch.", "billing_mode_mismatch");
  return result;
}

export async function monthlyPrice(env, id) {
  if (!stripeId(id, "price")) throw new HttpError(503, "Monthly pricing has not been configured for this plan.", "price_not_configured");
  const price = await stripeRequest(env, "GET", `/prices/${id}`);
  if (!price.active || price.type !== "recurring" || price.recurring?.interval !== "month" || price.recurring?.interval_count !== 1 || price.recurring?.usage_type !== "licensed" || !Number.isInteger(price.unit_amount) || price.unit_amount < 0 || price.billing_scheme !== "per_unit") {
    throw new HttpError(503, "This plan needs an active, fixed monthly Stripe Price.", "invalid_price_configuration");
  }
  return price;
}

export function safeStripeUrl(url, type) {
  const host = type === "portal" ? "billing.stripe.com" : "checkout.stripe.com";
  let parsed;
  try { parsed = new URL(url); } catch { throw new HttpError(502, "Stripe did not return a session URL.", "stripe_unavailable"); }
  if (parsed.protocol !== "https:" || parsed.hostname !== host) throw new HttpError(502, "Stripe did not return a valid session URL.", "stripe_unavailable");
  return parsed.href;
}

export async function verifyStripeSignature(payload, header, env, now = nowSeconds()) {
  if (!env.STRIPE_WEBHOOK_SECRET) throw new HttpError(503, "Stripe webhooks are not configured.", "webhook_not_configured");
  if (!header || header.length > 4096) throw new HttpError(400, "Invalid Stripe signature.", "invalid_signature");
  const entries = header.split(",").map((entry) => entry.trim().split("="));
  const timestamps = entries.filter(([key]) => key === "t").map(([, value]) => value);
  const signatures = entries.filter(([key, value]) => key === "v1" && /^[a-f0-9]{64}$/i.test(value || "")).map(([, value]) => value);
  if (timestamps.length !== 1 || !/^\d+$/.test(timestamps[0]) || Math.abs(now - Number(timestamps[0])) > 300 || !signatures.length) {
    throw new HttpError(400, "Invalid or expired Stripe signature.", "invalid_signature");
  }
  const encoder = new TextEncoder();
  const signed = encoder.encode(`${timestamps[0]}.${payload}`);
  for (const secret of [env.STRIPE_WEBHOOK_SECRET, env.STRIPE_WEBHOOK_SECRET_PREVIOUS].filter(Boolean)) {
    const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["verify"]);
    for (const signature of signatures) {
      const bytes = Uint8Array.from(signature.match(/.{2}/g), (hex) => parseInt(hex, 16));
      if (await crypto.subtle.verify("HMAC", key, bytes, signed)) return;
    }
  }
  throw new HttpError(400, "Invalid Stripe signature.", "invalid_signature");
}
