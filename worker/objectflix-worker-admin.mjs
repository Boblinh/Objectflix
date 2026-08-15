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

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = request.headers.get("origin") || "";

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
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
