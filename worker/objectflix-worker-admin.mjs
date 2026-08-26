const B2_AUTHORIZE_URL = "https://api.backblazeb2.com/b2api/v3/b2_authorize_account";

const ALLOWED_ORIGINS = ["https://objectflix.com", "http://localhost:8000", "http://localhost:8123"];

const FILE_NAME_RE = /^[a-z0-9][a-z0-9_-]*\/[a-z0-9][a-z0-9_-]*\.(mp4|mkv|webm|mov|m4v|avi)$/i;

function corsHeaders(origin) {
  return {
    "Access-Control-Allow-Origin": ALLOWED_ORIGINS.includes(origin) ? origin : "",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "content-type, x-objectflix-admin-secret",
    "Access-Control-Max-Age": "3600",
  };
}

function json(data, status, origin) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders(origin) },
  });
}

async function authorize(env) {
  const body = new URLSearchParams({
    account_id: env.B2_APPLICATION_KEY_ID,
    application_key: env.B2_APPLICATION_KEY,
  });
  const res = await fetch(B2_AUTHORIZE_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) throw new Error(`B2 authorize failed (${res.status})`);
  return res.json();
}

async function listBuckets(auth) {
  const res = await fetch(`${auth.apiUrl}/b2api/v2/b2_list_buckets`, {
    method: "POST",
    headers: { Authorization: auth.authorizationToken, "Content-Type": "application/json" },
    body: JSON.stringify({ accountId: auth.accountId }),
  });
  if (!res.ok) throw new Error(`B2 list buckets failed (${res.status})`);
  return (await res.json()).buckets || [];
}

async function findBucket(auth, env) {
  const buckets = await listBuckets(auth);
  const wanted = env.B2_BUCKET_NAME;
  if (wanted) {
    const match = buckets.find((b) => b.bucketName === wanted);
    if (match) return match;
  }
  return buckets[0] || null;
}

async function getUploadUrl(auth, bucket) {
  const res = await fetch(`${auth.apiUrl}/b2api/v2/b2_get_upload_url`, {
    method: "POST",
    headers: { Authorization: auth.authorizationToken, "Content-Type": "application/json" },
    body: JSON.stringify({ bucketId: bucket.bucketId }),
  });
  if (!res.ok) throw new Error(`B2 get upload URL failed (${res.status})`);
  return res.json();
}

function isAuthorized(request, env) {
  if (!env.ADMIN_SECRET) return true;
  return request.headers.get("x-objectflix-admin-secret") === env.ADMIN_SECRET;
}

// ---- Public media streaming (edge-cached) ---------------------------------
//
// GET /media/<bucket>/<key>   explicit bucket
// GET /media/<key>            legacy: default (account 1) bucket
//
// Buckets may live on two Backblaze accounts:
//   account 1: B2_APPLICATION_KEY_ID/_KEY        -> B2_BUCKET_NAME
//   account 2: B2_APPLICATION_KEY_ID_2/_KEY_2    -> B2_BUCKET_NAME_2

const MEDIA_ACCOUNT_CONFIG = [
  { id: "1", keyId: "B2_APPLICATION_KEY_ID", appKey: "B2_APPLICATION_KEY", bucket: "B2_BUCKET_NAME" },
  { id: "2", keyId: "B2_APPLICATION_KEY_ID_2", appKey: "B2_APPLICATION_KEY_2", bucket: "B2_BUCKET_NAME_2" },
];

const mediaAuthCache = {};

async function getMediaAuth(env, accountId) {
  const cached = mediaAuthCache[accountId];
  if (cached && cached.expires > Date.now()) return cached;

  const cfg = MEDIA_ACCOUNT_CONFIG.find((a) => a.id === accountId);
  if (!cfg || !env[cfg.keyId] || !env[cfg.appKey]) throw new Error(`No credentials for media account ${accountId}`);

  const res = await fetch(B2_AUTHORIZE_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ account_id: env[cfg.keyId], application_key: env[cfg.appKey] }),
  });
  if (!res.ok) throw new Error(`B2 authorize failed (${res.status})`);
  const auth = await res.json();

  const entry = {
    token: auth.authorizationToken,
    downloadUrl: auth.downloadUrl,
    expires: Date.now() + 20 * 3600 * 1000,
  };
  mediaAuthCache[accountId] = entry;
  return entry;
}

function resolveMediaAccount(env, bucket) {
  for (const cfg of MEDIA_ACCOUNT_CONFIG) {
    if (bucket && env[cfg.bucket] === bucket && env[cfg.keyId] && env[cfg.appKey]) return cfg.id;
  }
  if ((!bucket || bucket === env.B2_BUCKET_NAME) && env.B2_APPLICATION_KEY_ID && env.B2_APPLICATION_KEY) return "1";
  return null;
}

async function serveMedia(request, env, ctx, url, origin) {
  const segments = url.pathname.slice("/media/".length).split("/").map(decodeURIComponent);
  const configured = [env.B2_BUCKET_NAME, env.B2_BUCKET_NAME_2].filter(Boolean);

  let bucket = "";
  if (segments.length > 1 && configured.includes(segments[0])) {
    bucket = segments.shift();
  }
  const key = segments.join("/");
  if (!bucket) bucket = env.B2_BUCKET_NAME;
  if (!key || key.includes("..") || !/\.(mp4|mkv|webm|mov|m4v|avi|vtt|srt)$/i.test(key)) {
    return json({ error: "Invalid media key." }, 400, origin);
  }

  const accountId = resolveMediaAccount(env, bucket);
  if (!accountId) return json({ error: "Unknown bucket." }, 404, origin);

  const cache = caches.default;
  const hit = await cache.match(request);
  if (hit) return hit;

  const auth = await getMediaAuth(env, accountId);
  const encodedKey = key.split("/").map(encodeURIComponent).join("/");
  const range = request.headers.get("range");
  const upstreamHeaders = { Authorization: auth.token };
  if (range) upstreamHeaders.Range = range;

  const upstream = await fetch(`${auth.downloadUrl}/file/${encodeURIComponent(bucket)}/${encodedKey}`, {
    headers: upstreamHeaders,
  });
  if (!upstream.ok && upstream.status !== 206) {
    return json({ error: `Upstream ${upstream.status}` }, upstream.status === 404 ? 404 : 502, origin);
  }

  const headers = new Headers();
  for (const name of ["content-type", "content-length", "content-range", "accept-ranges", "etag", "last-modified"]) {
    const value = upstream.headers.get(name);
    if (value) headers.set(name, value);
  }
  headers.set("Cache-Control", "public, max-age=31536000");
  headers.set("Access-Control-Allow-Origin", ALLOWED_ORIGINS.includes(origin) ? origin : "*");

  const response = new Response(upstream.body, { status: upstream.status, headers });

  // Only cache complete responses (Range/partial responses are passed through).
  if (upstream.status === 200 && !range && ctx) {
    ctx.waitUntil(cache.put(request, response.clone()));
  }
  return response;
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const origin = request.headers.get("origin") || "";

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }

    if (request.method === "GET" && url.pathname.startsWith("/media/")) {
      try {
        return await serveMedia(request, env, ctx, url, origin);
      } catch (err) {
        return json({ error: err.message }, 500, origin);
      }
    }

    if (!isAuthorized(request, env)) {
      return json({ error: "Unauthorized" }, 401, origin);
    }

    if (request.method === "GET" && url.pathname === "/api/admin/storage") {
      try {
        const auth = await authorize(env);
        const buckets = await listBuckets(auth);
        const bucket = await findBucket(auth, env);
        return json(
          {
            ok: true,
            accountId: auth.accountId,
            defaultBucket: bucket ? bucket.bucketName : env.B2_BUCKET_NAME || null,
            buckets,
          },
          200,
          origin
        );
      } catch (err) {
        return json({ error: err.message }, 500, origin);
      }
    }

    if (request.method === "POST" && url.pathname === "/api/admin/uploads/sign") {
      try {
        const payload = await request.json();
        const fileName = String(payload.fileName || "");
        if (!FILE_NAME_RE.test(fileName) || fileName.length > 200) {
          return json(
            { error: "Invalid object name. Use <show>/<episode>.<ext> with letters, digits, dashes, underscores." },
            400,
            origin
          );
        }
        const auth = await authorize(env);
        const bucket = await findBucket(auth, env);
        if (!bucket) return json({ error: "No matching B2 bucket configured." }, 500, origin);
        const target = await getUploadUrl(auth, bucket);
        return json(
          {
            uploadUrl: target.uploadUrl,
            authorizationToken: target.authorizationToken,
            fileName,
          },
          200,
          origin
        );
      } catch (err) {
        return json({ error: err.message }, 500, origin);
      }
    }

    return json({ error: "Not found" }, 404, origin);
  },
};
