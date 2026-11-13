import { z } from "zod";

export class HttpError extends Error {
  constructor(status, message, code = "request_failed") {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export const nowSeconds = () => Math.floor(Date.now() / 1000);
export const unixTime = z.number().int().min(0).max(4102444800);
export const recordId = z.string().min(1).max(150).regex(/^[a-zA-Z0-9_:.~-]+$/);

export async function readBody(request, maxBytes = 16384) {
  if (Number(request.headers.get("content-length")) > maxBytes) throw new HttpError(413, "Request is too large.", "body_too_large");
  const reader = request.body?.getReader();
  if (!reader) return "";
  const decoder = new TextDecoder();
  let size = 0;
  let text = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) { await reader.cancel(); throw new HttpError(413, "Request is too large.", "body_too_large"); }
      text += decoder.decode(value, { stream: true });
    }
    return text + decoder.decode();
  } finally {
    reader.releaseLock();
  }
}

export async function jsonBody(c, schema, maxBytes = 16384) {
  if (!c.req.header("content-type")?.toLowerCase().startsWith("application/json")) throw new HttpError(415, "Use an application/json request.", "invalid_content_type");
  let body;
  try { body = JSON.parse(await readBody(c.req.raw, maxBytes)); }
  catch (error) { if (error instanceof HttpError) throw error; throw new HttpError(400, "Request body must be valid JSON.", "invalid_json"); }
  const parsed = schema.safeParse(body);
  if (!parsed.success) throw new HttpError(400, "Check the submitted fields and try again.", "invalid_fields");
  return parsed.data;
}

export function apiError(error, c) {
  if (error instanceof HttpError) return c.json({ success: false, error: error.message, code: error.code }, error.status);
  // Do not log raw provider errors, request bodies, tokens, or billing details.
  console.error("[membership] operation failed");
  return c.json({ success: false, error: "The service is temporarily unavailable. Please try again.", code: "service_unavailable" }, 503);
}

export function appUrl(env) {
  let url;
  try { url = new URL(env.APP_URL); } catch { throw new HttpError(503, "The application URL is not configured.", "configuration_required"); }
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if (url.username || url.password || url.search || url.hash || (url.protocol !== "https:" && !(local && url.protocol === "http:" && env.STRIPE_MODE !== "live"))) {
    throw new HttpError(503, "The application URL is not configured correctly.", "configuration_required");
  }
  if (!url.pathname.endsWith("/")) url.pathname += "/";
  return url;
}

export function assertOrigin(c) {
  const origin = c.req.header("origin");
  if (origin && origin !== appUrl(c.env).origin) throw new HttpError(403, "This origin is not allowed.", "origin_not_allowed");
}

export function validateOAuthRedirect(env, redirectUri) {
  const base = appUrl(env);
  const allowed = [new URL("auth.html", base).href, new URL("index.html", base).href];
  if (!allowed.includes(redirectUri)) throw new HttpError(400, "This sign-in redirect is not allowed.", "invalid_redirect");
}

export async function rateLimit(env, key, limit, seconds = 60) {
  const start = Math.floor(nowSeconds() / seconds) * seconds;
  const row = await env.DB.prepare(`INSERT INTO membership_rate_limits (key, window_start, count) VALUES (?, ?, 1)
    ON CONFLICT(key) DO UPDATE SET count = CASE WHEN window_start = excluded.window_start THEN count + 1 ELSE 1 END,
    window_start = excluded.window_start RETURNING count`).bind(key, start).first();
  if (row.count > limit) throw new HttpError(429, "Please wait a moment before trying again.", "rate_limited");
}

export async function withLease(env, resource, operation) {
  const token = crypto.randomUUID();
  const now = nowSeconds();
  const lock = await env.DB.prepare(`INSERT INTO billing_leases (resource, token, expires_at) VALUES (?, ?, ?)
    ON CONFLICT(resource) DO UPDATE SET token = excluded.token, expires_at = excluded.expires_at
    WHERE billing_leases.expires_at <= ? RETURNING token`).bind(resource, token, now + 90, now).first();
  if (lock?.token !== token) throw new HttpError(409, "A billing update is already in progress. Please try again shortly.", "billing_busy");
  try { return await operation({ resource, token }); }
  finally { await env.DB.prepare("DELETE FROM billing_leases WHERE resource = ? AND token = ?").bind(resource, token).run(); }
}
