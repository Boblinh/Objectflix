// Objectflix: this is the api_auth_firebase part, kept here so the rest of the app knows exactly where to look.
import { OpenAPIRoute } from "chanfana";
import { z } from "zod";
import { createVerifiedSession } from "./membership/identity.js";
import { apiError, assertOrigin } from "./membership/http.js";

const FIREBASE_CERTS_URL = "https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com";
const encoder = new TextEncoder();

let cachedKeys = null;
let cachedUntil = 0;

// Decodes a base64url JWT segment into its original bytes.
function base64UrlDecode(value) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

// Loads Firebase's signing keys and reuses them for up to an hour.
async function firebasePublicKeys() {
  const now = Date.now();
  if (cachedKeys && cachedUntil > now) return cachedKeys;
  const res = await fetch(FIREBASE_CERTS_URL);
  if (!res.ok) throw new Error(`Firebase certificate fetch failed (${res.status})`);
  const jwks = await res.json();
  if (!Array.isArray(jwks.keys) || !jwks.keys.length) throw new Error("Firebase certificate list is empty.");
  cachedKeys = jwks.keys;
  cachedUntil = now + 60 * 60 * 1000;
  return cachedKeys;
}

// Verifies the token signature and Firebase claims, returning its trusted payload.
async function verifyFirebaseIdToken(idToken, projectId) {
  const parts = String(idToken || "").split(".");
  if (parts.length !== 3) throw new Error("Malformed Firebase ID token.");

  let header, payload;
  try {
    header = JSON.parse(new TextDecoder().decode(base64UrlDecode(parts[0])));
    payload = JSON.parse(new TextDecoder().decode(base64UrlDecode(parts[1])));
  } catch {
    throw new Error("Malformed Firebase ID token.");
  }

  if (header.alg !== "RS256") throw new Error("Unsupported Firebase token algorithm.");
  if (!header.kid) throw new Error("Firebase token is missing a key id.");

  const keys = await firebasePublicKeys();
  const jwk = keys.find((key) => key.kid === header.kid);
  if (!jwk) throw new Error("No matching Firebase signing key.");

  const cryptoKey = await crypto.subtle.importKey(
    "jwk",
    { kty: "RSA", n: jwk.n, e: jwk.e, alg: "RS256", use: "sig" },
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["verify"]
  );
  const valid = await crypto.subtle.verify(
    "RSASSA-PKCS1-v1_5",
    cryptoKey,
    base64UrlDecode(parts[2]),
    encoder.encode(`${parts[0]}.${parts[1]}`)
  );
  if (!valid) throw new Error("Firebase ID token signature is invalid.");

  const now = Math.floor(Date.now() / 1000);
  if (typeof payload.exp !== "number" || payload.exp <= now) throw new Error("Firebase ID token has expired.");
  if (typeof payload.iat !== "number" || payload.iat > now + 60) throw new Error("Firebase ID token was issued in the future.");
  if (payload.aud !== projectId) throw new Error("Firebase token audience mismatch.");
  if (payload.iss !== `https://securetoken.google.com/${projectId}`) throw new Error("Firebase token issuer mismatch.");
  if (typeof payload.sub !== "string" || !payload.sub || payload.sub.length > 128) throw new Error("Firebase token subject is invalid.");
  if (![true, "true"].includes(payload.email_verified)) throw new Error("A verified Google email is required.");

  return payload;
}

export class FirebaseAuthCallback extends OpenAPIRoute {
  schema = {
    tags: ["Auth"],
    summary: "Exchange a Firebase ID token for an Objectflix session",
    request: {
      body: {
        content: {
          "application/json": {
            schema: z.object({ idToken: z.string().min(10) }),
          },
        },
      },
    },
    responses: {
      "200": { description: "Successful Firebase sign-in" },
      "400": { description: "Bad request" },
      "401": { description: "Firebase not configured or token rejected" },
      "502": { description: "Firebase verification error" },
    },
  };

  // Validates the submitted Firebase token and creates a verified Objectflix session.
  async handle(c) {
    c.header("Cache-Control", "no-store");
    const projectId = c.env.FIREBASE_PROJECT_ID;
    if (!projectId) {
      return c.json({ success: false, error: "Firebase sign-in is not configured. Set FIREBASE_PROJECT_ID on the Worker." }, 401);
    }

    try {
      assertOrigin(c);
    } catch (error) {
      return apiError(error, c);
    }

    const data = await this.getValidatedData();
    const idToken = data.body?.idToken;
    if (!idToken) return c.json({ success: false, error: "A Firebase ID token is required." }, 400);

    let payload;
    try {
      payload = await verifyFirebaseIdToken(idToken, projectId);
    } catch (error) {
      console.error("[firebase-auth] verification failed:", error.message);
      return c.json({ success: false, error: error.message }, 401);
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
    } catch (error) {
      return apiError(error, c);
    }
  }
}
