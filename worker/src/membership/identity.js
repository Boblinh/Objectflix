import { Hono } from "hono";
import { HttpError, apiError, nowSeconds } from "./http.js";

const encoder = new TextEncoder();
export async function tokenHash(token) {
  const bytes = await crypto.subtle.digest("SHA-256", encoder.encode(token));
  return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// Called only after the existing OAuth callbacks have verified the provider.
export async function createVerifiedSession(env, profile) {
  if (!["google", "discord"].includes(profile.provider) || !profile.id) throw new HttpError(401, "A verified account is required.", "authentication_required");
  const id = `${profile.provider}:${profile.id}`;
  const now = nowSeconds();
  const account = profile.provider === "discord" ? id : profile.email.toLowerCase();
  await env.DB.prepare(`INSERT INTO account_users (id, provider, provider_id, display_name, email, legacy_account, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET display_name = excluded.display_name,
    email = excluded.email, legacy_account = excluded.legacy_account, updated_at = excluded.updated_at`)
    .bind(id, profile.provider, profile.id, String(profile.displayName || profile.username || "Objectflix member").slice(0, 80), profile.email || null, account, now, now).run();
  const random = crypto.getRandomValues(new Uint8Array(32));
  const accessToken = btoa(String.fromCharCode(...random)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  const expiresAt = now + 86400;
  await env.DB.prepare("INSERT INTO account_sessions (token_hash, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)")
    .bind(await tokenHash(accessToken), id, expiresAt, now).run();
  return { accessToken, expiresAt };
}

export async function getIdentity(c, optional = false) {
  const header = c.req.header("authorization");
  if (!header && optional) return null;
  const match = /^Bearer ([A-Za-z0-9_-]{43})$/.exec(header || "");
  if (!match) throw new HttpError(401, "Sign in with Google or Discord to verify your Objectflix account.", "authentication_required");
  const hash = await tokenHash(match[1]);
  const user = await c.env.DB.prepare(`SELECT u.* FROM account_users u JOIN account_sessions s ON s.user_id = u.id
    WHERE s.token_hash = ? AND s.expires_at > ?`).bind(hash, nowSeconds()).first();
  if (!user) throw new HttpError(401, "Your verified session has expired. Please sign in again.", "session_expired");
  return user;
}

export async function requireIdentity(c, next) {
  c.set("user", await getIdentity(c));
  c.header("Cache-Control", "no-store");
  await next();
}

export function isMembershipAdmin(env, user) {
  if (!user) return false;
  try {
    const allowed = JSON.parse(env.MEMBERSHIP_ADMIN_USER_IDS_JSON || "[]");
    return Array.isArray(allowed) && allowed.includes(user.id);
  } catch { return false; }
}

export async function requireMembershipAdmin(c, next) {
  const user = await getIdentity(c);
  if (!isMembershipAdmin(c.env, user)) throw new HttpError(403, "Movie Night management is limited to authorized staff.", "staff_required");
  c.set("user", user);
  c.header("Cache-Control", "no-store");
  await next();
}

export const account = new Hono();
account.onError(apiError);
account.use("*", requireIdentity);
account.get("/session", (c) => {
  const user = c.get("user");
  return c.json({ success: true, user: { id: user.id, displayName: user.display_name, provider: user.provider }, isStaff: isMembershipAdmin(c.env, user) });
});
account.post("/logout", async (c) => {
  const token = c.req.header("authorization").slice(7);
  await c.env.DB.prepare("DELETE FROM account_sessions WHERE token_hash = ?").bind(await tokenHash(token)).run();
  return c.json({ success: true });
});
