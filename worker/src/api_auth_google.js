import { OpenAPIRoute } from "chanfana";
import { z } from "zod";
import { createVerifiedSession } from "./membership/identity.js";
import { apiError, assertOrigin, validateOAuthRedirect } from "./membership/http.js";

const GOOGLE_TOKENINFO_URL = "https://oauth2.googleapis.com/tokeninfo";

export class GoogleAuthCallback extends OpenAPIRoute {
  schema = {
    tags: ["Auth"],
    summary: "Exchange a Google Identity Services ID token for a session",
    request: {
      body: {
        content: {
          "application/json": {
            schema: z.object({
              credential: z.string().min(10).optional(),
              code: z.string().min(1).optional(),
              redirectUri: z.string().url().optional(),
            }).refine(
              (data) => Boolean(data.credential || data.code),
              "A Google credential or authorization code is required."
            ),
          },
        },
      },
    },
    responses: {
      "200": {
        description: "Successful Google sign-in",
        content: {
          "application/json": {
            schema: z.object({
              success: z.boolean(),
              accessToken: z.string(),
              expiresAt: z.number(),
              session: z.object({
                provider: z.literal("google"),
                id: z.string(),
                email: z.string(),
                username: z.string(),
                displayName: z.string(),
                avatar: z.string().nullable(),
              }),
            }),
          },
        },
      },
      "400": { description: "Bad request" },
      "401": { description: "Google OAuth not configured" },
      "502": { description: "Google verification error" },
    },
  };

  async handle(c) {
    c.header("Cache-Control", "no-store");
    const clientId = c.env.GOOGLE_CLIENT_ID;
    const clientSecret = c.env.GOOGLE_CLIENT_SECRET;
    if (!clientId || !clientSecret) {
      return c.json(
        { success: false, error: "Google sign-in is not configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET as Worker secrets." },
        401
      );
    }

    const data = await this.getValidatedData();
    const { credential: suppliedCredential, code, redirectUri } = data.body ?? {};
    let credential = suppliedCredential;

    try {
      assertOrigin(c);
      if (code) validateOAuthRedirect(c.env, redirectUri);
    } catch (error) { return apiError(error, c); }

    if (!credential && code) {
      try {
        const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            client_id: clientId,
            client_secret: clientSecret,
            grant_type: "authorization_code",
            code,
            ...(redirectUri ? { redirect_uri: redirectUri } : {}),
          }),
        });
        const tokenData = await tokenRes.json();
        credential = tokenData.id_token;
        if (!tokenRes.ok || !credential) {
          console.error("[google-auth] code exchange failed:", tokenRes.status);
          return c.json({ success: false, error: "Google authorization code exchange failed." }, 502);
        }
      } catch (err) {
        console.error("[google-auth] token exchange failed:", err);
        return c.json({ success: false, error: "Failed to reach Google token endpoint." }, 502);
      }
    }

    if (!credential) {
      return c.json({ success: false, error: "Google credential is required." }, 400);
    }

    let infoRes;
    try {
      infoRes = await fetch(`${GOOGLE_TOKENINFO_URL}?id_token=${encodeURIComponent(credential)}`);
    } catch (err) {
      console.error("[google-auth] tokeninfo fetch failed:", err);
      return c.json({ success: false, error: "Failed to reach Google verification endpoint." }, 502);
    }

    if (!infoRes.ok) {
      console.error("[google-auth] tokeninfo error status:", infoRes.status);
      return c.json({ success: false, error: "Google credential is invalid." }, 502);
    }

    const payload = await infoRes.json();
    if (!payload.sub || ![true, "true"].includes(payload.email_verified)) {
      return c.json({ success: false, error: "A verified Google email is required." }, 401);
    }
    if (payload.aud !== clientId) {
      return c.json({ success: false, error: "Google credential audience mismatch." }, 502);
    }
    if (payload.exp && Number(payload.exp) < Math.floor(Date.now() / 1000)) {
      return c.json({ success: false, error: "Google credential expired." }, 502);
    }
    if (payload.iss && payload.iss !== "https://accounts.google.com" && payload.iss !== "accounts.google.com") {
      return c.json({ success: false, error: "Google credential issuer mismatch." }, 502);
    }

    const email = payload.email || null;
    const name = payload.name || email?.split("@")[0] || "google-user";
    const givenName = payload.given_name || "";
    const familyInitial = payload.family_name ? ` ${payload.family_name[0] || ""}.` : "";
    const username = (givenName + familyInitial).trim() || name;

    const session = {
      provider: "google",
      id: payload.sub,
      email: email || `${payload.sub}@google.local`,
      username,
      displayName: name,
      avatar: payload.picture || null,
    };

    try {
      return { success: true, session, ...await createVerifiedSession(c.env, session) };
    } catch (error) { return apiError(error, c); }
  }
}
