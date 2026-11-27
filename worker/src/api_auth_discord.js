// Objectflix: this is the api_auth_discord part, kept here so the rest of the app knows exactly where to look.
import { OpenAPIRoute } from "chanfana";
import { z } from "zod";
import { createVerifiedSession } from "./membership/identity.js";
import { apiError, assertOrigin, validateOAuthRedirect } from "./membership/http.js";

const DISCORD_TOKEN_URL = "https://discord.com/api/oauth2/token";
const DISCORD_USERINFO_URL = "https://discord.com/api/users/@me";

export class DiscordAuthCallback extends OpenAPIRoute {
  schema = {
    tags: ["Auth"],
    summary: "Exchange a Discord OAuth2 authorization code for a session",
    request: {
      body: {
        content: {
          "application/json": {
            schema: z.object({
              code: z.string().min(1),
              redirectUri: z.string().optional(),
            }),
          },
        },
      },
    },
    responses: {
      "200": {
        description: "Successful Discord sign-in",
        content: {
          "application/json": {
            schema: z.object({
              success: z.boolean(),
              accessToken: z.string(),
              expiresAt: z.number(),
              session: z.object({
                provider: z.literal("discord"),
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
      "400": { description: "Authorization code is required" },
      "401": { description: "Discord OAuth not configured" },
      "502": { description: "Discord OAuth error" },
    },
  };

  async handle(c) {
    c.header("Cache-Control", "no-store");
    const clientId = c.env.DISCORD_CLIENT_ID;
    const clientSecret = c.env.DISCORD_CLIENT_SECRET;
    if (!clientId || !clientSecret) {
      return c.json(
        { success: false, error: "Discord sign-in is not configured. Set DISCORD_CLIENT_ID and DISCORD_CLIENT_SECRET as Worker secrets." },
        401
      );
    }

    const data = await this.getValidatedData();
    const { code, redirectUri } = data.body ?? {};
    try {
      assertOrigin(c);
      validateOAuthRedirect(c.env, redirectUri);
    } catch (error) { return apiError(error, c); }
    if (!code) {
      return c.json({ success: false, error: "Authorization code is required." }, 400);
    }

    let tokenRes;
    try {
      const body = new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: "authorization_code",
        code,
        ...(redirectUri ? { redirect_uri: redirectUri } : {}),
      });
      tokenRes = await fetch(DISCORD_TOKEN_URL, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body,
      });
    } catch (err) {
      console.error("[discord-auth] token fetch failed:", err);
      return c.json({ success: false, error: "Failed to reach Discord token endpoint." }, 502);
    }

    if (!tokenRes.ok) {
      console.error("[discord-auth] token error:", tokenRes.status);
      return c.json({ success: false, error: "Discord token exchange failed." }, 502);
    }

    let userRes;
    try {
      const { access_token } = await tokenRes.json();
      if (!access_token) {
        return c.json({ success: false, error: "Discord did not return an access token." }, 502);
      }
      userRes = await fetch(DISCORD_USERINFO_URL, {
        headers: { Authorization: `Bearer ${access_token}` },
      });
    } catch (err) {
      console.error("[discord-auth] userinfo fetch failed:", err);
      return c.json({ success: false, error: "Failed to reach Discord userinfo endpoint." }, 502);
    }

    if (!userRes.ok) {
      console.error("[discord-auth] userinfo error status:", userRes.status);
      return c.json({ success: false, error: "Failed to load Discord profile." }, 502);
    }

    const user = await userRes.json();
    if (!user.id) return c.json({ success: false, error: "Discord identity could not be verified." }, 401);
    const email = user.email || `${user.username}@discord.local`;

    const session = {
      provider: "discord",
      id: user.id,
      email,
      username: user.username,
      displayName: user.global_name || user.username,
      avatar: user.avatar || null,
    };

    try {
      return { success: true, session, ...await createVerifiedSession(c.env, session) };
    } catch (error) { return apiError(error, c); }
  }
}
