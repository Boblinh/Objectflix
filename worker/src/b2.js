// B2 client using ONLY the B2 Native API. No custom signing (no S3 SigV4).
// b2_authorize_account -> account token + apiUrl + downloadUrl
// b2_get_download_authorization -> short-lived token scoped to one object key
// Returns a direct B2 URL so the browser handles streaming/range requests.

const AUTH_URL = "https://api.backblazeb2.com/b2api/v4/b2_authorize_account";

// One cache per application key id, so media (read key) and admin (write key)
// never share an account token. Same sharing pattern as before: one in-flight
// authorize per key so B2 only ever sees one request per key at a time.
const accountCaches = new Map(); // keyId -> { token, apiUrl, downloadUrl, accountId, bucketId, bucketName, expiresAt }
const inflightAuthorizes = new Map(); // keyId -> Promise<account>
const tokenCache = new Map(); // videoKey -> { token, expiresAt }

// B2 throttles bursts of b2_get_download_authorization calls (a season listing
// can request 26 at once). A tiny semaphore keeps concurrent token fetches low
// so no episode silently loses its videoUrl, and per-key promise sharing means
// the same key is only ever fetched once even under heavy load.
const MAX_CONCURRENT_TOKEN_FETCHES = 4;
let activeTokenFetches = 0;
const tokenFetcherQueue = [];
const inflightTokenPromises = new Map(); // videoKey -> Promise<string>

function acquireTokenSlot() {
  if (activeTokenFetches < MAX_CONCURRENT_TOKEN_FETCHES) {
    activeTokenFetches++;
    return Promise.resolve();
  }
  return new Promise((resolve) => tokenFetcherQueue.push(resolve));
}

function releaseTokenSlot() {
  activeTokenFetches--;
  const next = tokenFetcherQueue.shift();
  if (next) next();
}

// Retries a transient B2 failure a couple of times with a small backoff.
// Listing endpoints fan out many token fetches at once; B2 occasionally
// rate-limits the burst and returns 429/5xx. Retrying is cheap and fixes it.
async function withRetry(fn, attempts = 3) {
  let lastErr;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      // Retry on B2 throttling (429), server errors (5xx), and raw network
      // failures (no status) that happen when a burst of token fetches lands
      // on a cold isolate.
      const transient =
        err.status === 429 ||
        (err.status >= 500 && err.status < 600) ||
        !Number.isFinite(err.status);
      if (!transient || i === attempts - 1) throw err;
      await new Promise((resolve) => setTimeout(resolve, 150 * (i + 1)));
    }
  }
  throw lastErr;
}

function isConfigured(env) {
  return Boolean(env.B2_APPLICATION_KEY_ID && env.B2_APPLICATION_KEY);
}

// ---------------------------------------------------------------------------
// Multi-account bucket registry (two separate B2 accounts, one bucket each).
//
//   main pair  B2_APPLICATION_KEY_ID/KEY        -> NEW bucket (B2_BUCKET_ID_NEW/B2_BUCKET_NAME_NEW)
//   legacy pair B2_APPLICATION_KEY_ID_OLD/KEY_OLD -> OLD bucket (B2_BUCKET_ID/B2_BUCKET_NAME)
//
// Resolution never calls b2_list_buckets: buckets map to accounts purely via
// config, so application keys do NOT need the listBuckets capability.
// Backward compatible: without the _OLD pair, the main pair behaves exactly
// like the original single-account setup (defaulting to B2_BUCKET_ID/NAME).
// ---------------------------------------------------------------------------

export function bucketAccounts(env) {
  const accounts = [];
  const hasLegacy = Boolean(env.B2_APPLICATION_KEY_ID_OLD && env.B2_APPLICATION_KEY_OLD);
  if (hasLegacy) {
    accounts.push({
      name: "legacy",
      keyId: env.B2_APPLICATION_KEY_ID_OLD,
      key: env.B2_APPLICATION_KEY_OLD,
      bucketId: env.B2_BUCKET_ID,
      bucketName: env.B2_BUCKET_NAME,
    });
  }
  if (isConfigured(env)) {
    accounts.push({
      name: "main",
      keyId: env.B2_APPLICATION_KEY_ID,
      key: env.B2_APPLICATION_KEY,
      // With a legacy account present, the main pair owns the NEW bucket;
      // otherwise fall back to the classic single-bucket variables.
      bucketId: env.B2_BUCKET_ID_NEW || (hasLegacy ? undefined : env.B2_BUCKET_ID),
      bucketName: env.B2_BUCKET_NAME_NEW || (hasLegacy ? undefined : env.B2_BUCKET_NAME),
    });
  }
  return accounts;
}

// Find the account entry owning a bucket (by name or id). Returns null when
// no configured account claims it.
export function findAccountForBucket(env, bucketRef) {
  if (!bucketRef) return null;
  const accounts = bucketAccounts(env);
  return (
    accounts.find(
      (a) => a.bucketName === bucketRef || a.bucketId === bucketRef
    ) || null
  );
}

// The account used for requests that don't name a bucket (legacy behavior):
// the legacy account when present, else the main account.
export function defaultAccount(env) {
  const accounts = bucketAccounts(env);
  return accounts.find((a) => a.name === "legacy") || accounts[0] || null;
}

export async function authorize(env) {
  const keyId = env.B2_APPLICATION_KEY_ID;
  const key = env.B2_APPLICATION_KEY;
  if (!keyId || !key) throw new Error("B2 credentials not configured (B2_APPLICATION_KEY_ID / B2_APPLICATION_KEY).");
  return authorizeWith(env, keyId, key);
}

// Admin endpoints use their own key (B2_ADMIN_KEY_ID / B2_ADMIN_KEY) when
// present, falling back to the media key. This lets a write-capable key power
// uploads without disturbing the read key that streams episodes.
export async function authorizeAdmin(env) {
  const keyId = env.B2_ADMIN_KEY_ID || env.B2_APPLICATION_KEY_ID;
  const key = env.B2_ADMIN_KEY || env.B2_APPLICATION_KEY;
  if (!keyId || !key) throw new Error("Admin B2 credentials not configured (B2_ADMIN_KEY_ID / B2_ADMIN_KEY).");
  return authorizeWith(env, keyId, key);
}

async function authorizeWith(env, keyId, key) {
  const now = Date.now();
  const cache = accountCaches.get(keyId);
  if (cache && cache.expiresAt > now) return cache;

  // A season listing can call getVideoUrl() for 26 episodes at once, and on a
  // cold isolate every one of them would fire b2_authorize_account. Share a
  // single in-flight authorize per key so B2 only ever sees one request at a time.
  if (inflightAuthorizes.has(keyId)) return inflightAuthorizes.get(keyId);

  const promise = (async () => {
    const basic = btoa(`${keyId}:${key}`);
    const res = await fetch(AUTH_URL, { headers: { Authorization: `Basic ${basic}` } });
    if (!res.ok) {
      throw new Error(`b2_authorize_account failed (${res.status}): ${await res.text()}`);
    }
    const data = await res.json();

    const storage = data.apiInfo?.storageApi;
    const allowed = storage?.allowed ?? {};
    let bucketId = env.B2_BUCKET_ID;
    let bucketName = env.B2_BUCKET_NAME;
    if ((!bucketId || !bucketName) && Array.isArray(allowed.buckets) && allowed.buckets.length > 0) {
      bucketId = bucketId || allowed.buckets[0].id;
      bucketName = bucketName || allowed.buckets[0].name;
    }

    // Account token valid max 24h; refresh slightly early
    const account = {
      token: data.authorizationToken,
      apiUrl: storage.apiUrl,
      downloadUrl: storage.downloadUrl,
      accountId: data.accountId,
      bucketId,
      bucketName,
      expiresAt: now + 23.5 * 60 * 60 * 1000,
    };
    accountCaches.set(keyId, account);
    return account;
  })();

  inflightAuthorizes.set(keyId, promise);
  try {
    return await promise;
  } finally {
    inflightAuthorizes.delete(keyId);
  }
}

async function getDownloadToken(env, account, videoKey, bucketId) {
  const now = Date.now();
  const cacheKey = `${bucketId || account.bucketId}:${videoKey}`;
  const cached = tokenCache.get(cacheKey);
  if (cached && cached.expiresAt > now) return cached.token;

  // If another request is already fetching this exact key, join it.
  const inflight = inflightTokenPromises.get(cacheKey);
  if (inflight) return inflight;

  const promise = (async () => {
    const ttlSeconds = Math.min(Number(env.B2_TOKEN_TTL_SECONDS) || 3600, 604800); // max 1 week

    // Limit the number of simultaneous B2 token fetches across all keys.
    await acquireTokenSlot();
    try {
      const token = await withRetry(async () => {
        const res = await fetch(`${account.apiUrl}/b2api/v4/b2_get_download_authorization`, {
          method: "POST",
          headers: { Authorization: account.token, "Content-Type": "application/json" },
          body: JSON.stringify({
            bucketId: bucketId || account.bucketId,
            fileNamePrefix: videoKey, // exact key => token authorizes ONLY this file
            validDurationInSeconds: ttlSeconds,
          }),
        });
        if (!res.ok) {
          const err = new Error(`b2_get_download_authorization failed (${res.status}): ${await res.text()}`);
          err.status = res.status;
          throw err;
        }
        const data = await res.json();
        return data.authorizationToken;
      });

      tokenCache.set(cacheKey, { token, expiresAt: Date.now() + ttlSeconds * 1000 });
      return token;
    } finally {
      releaseTokenSlot();
    }
  })();

  inflightTokenPromises.set(cacheKey, promise);
  try {
    return await promise;
  } finally {
    inflightTokenPromises.delete(cacheKey);
  }
}

// Direct B2 URL -> browser streams/range-requests straight from B2. No proxying.
// Returns undefined when B2 is not configured or the episode has no video_key.
// bucketName: optional bucket override (episodes.bucket column). Null/undefined
// resolves to the default bucket, which is exactly the legacy single-bucket path.

// Resolve which account/bucket serves a read for the given bucket reference
// (name or 24-hex id). Null reference -> the default account (legacy bucket
// when configured, else main). Returns { account, bucketId, bucketName }.
export async function resolveReadContext(env, requested) {
  const entry = requested ? findAccountForBucket(env, requested) : defaultAccount(env);
  if (!entry || !entry.keyId) {
    throw new Error(
      `No B2 credentials configured for bucket "${requested ?? "default"}". Check B2_APPLICATION_KEY* secrets and B2_BUCKET*_NAME/ID vars.`
    );
  }
  const account = await authorizeWith(env, entry.keyId, entry.key);
  return {
    account,
    bucketId: entry.bucketId || account.bucketId,
    bucketName: entry.bucketName || account.bucketName,
  };
}

// Back-compat helper: just the resolved bucket coordinates.
export async function resolveReadBucket(env, requested) {
  const ctx = await resolveReadContext(env, requested);
  return { id: ctx.bucketId, name: ctx.bucketName };
}

export async function getVideoUrl(env, videoKey, bucketName) {
  if (!videoKey) return undefined;
  try {
    const ctx = await resolveReadContext(env, bucketName);
    const token = await getDownloadToken(env, ctx.account, videoKey, ctx.bucketId);
    const encodedKey = videoKey.split("/").map(encodeURIComponent).join("/");
    return `${ctx.account.downloadUrl}/file/${ctx.bucketName}/${encodedKey}?Authorization=${encodeURIComponent(token)}`;
  } catch (err) {
    console.error("Failed to build B2 video URL:", err);
    return undefined;
  }
}

// Media proxy URL builder (production): points the browser at the Worker's
// /media/<key> route, which streams through the Cloudflare cache. The B2
// authorization token stays server-side and never appears in this URL.
//
// The direct-B2 getVideoUrl() above is intentionally left untouched as a
// fallback: reverting the API to direct signed URLs is a one-line change.
export function getMediaUrl(origin, videoKey) {
  if (!videoKey) return undefined;
  const encodedKey = videoKey.split("/").map(encodeURIComponent).join("/");
  return `${origin}/media/${encodedKey}`;
}

// Cheap existence probe: one tiny b2_list_file_names call with the exact key
// as prefix and a single result. No object data is transferred, so this is
// safe to call per watch-page load to detect DB rows whose file was never
// (or no longer) uploaded to the bucket.
export async function objectExists(env, key, bucketName) {
  if (!key) return false;
  const ctx = await resolveReadContext(env, bucketName);
  const res = await withRetry(async () => {
    const r = await fetch(
      `${ctx.account.apiUrl}/b2api/v4/b2_list_file_names?bucketId=${encodeURIComponent(ctx.bucketId)}&prefix=${encodeURIComponent(key)}&maxFileCount=1`,
      { headers: { Authorization: ctx.account.token } }
    );
    if (!r.ok) {
      const err = new Error(`b2_list_file_names failed (${r.status}): ${await r.text()}`);
      err.status = r.status;
      throw err;
    }
    return r;
  });
  const data = await res.json();
  return Array.isArray(data.files) && data.files.some((file) => file.fileName === key);
}

// ============================================================================
// Admin upload helpers (used by the /api/admin/* endpoints)
//
// The browser cannot call b2_authorize_account directly (account-level calls
// never send CORS headers), so the Worker signs uploads on its behalf:
//   sign -> b2_get_upload_url -> { uploadUrl, authorizationToken }
// The browser then streams the file straight to the returned uploadUrl.
// ============================================================================

export async function listBuckets(env) {
  const account = await authorizeAdmin(env);
  const res = await withRetry(async () => {
    const r = await fetch(`${account.apiUrl}/b2api/v4/b2_list_buckets`, {
      method: "POST",
      headers: { Authorization: account.token, "Content-Type": "application/json" },
      body: JSON.stringify({ accountId: account.accountId }),
    });
    if (!r.ok) {
      const err = new Error(`b2_list_buckets failed (${r.status}): ${await r.text()}`);
      err.status = r.status;
      throw err;
    }
    return r;
  });
  return (await res.json()).buckets || [];
}

// Permanently delete an object (all versions of that exact file name) from a
// bucket. Requires deleteFiles capability on the account's key. Returns the
// deleted fileId, or null when the key does not exist.
export async function deleteObject(env, key, bucketName) {
  const ctx = await resolveReadContext(env, bucketName);
  const listRes = await withRetry(async () => {
    const r = await fetch(
      `${ctx.account.apiUrl}/b2api/v4/b2_list_file_names?bucketId=${encodeURIComponent(ctx.bucketId)}&prefix=${encodeURIComponent(key)}&maxFileCount=1`,
      { headers: { Authorization: ctx.account.token } }
    );
    if (!r.ok) {
      const err = new Error(`b2_list_file_names failed (${r.status}): ${await r.text()}`);
      err.status = r.status;
      throw err;
    }
    return r;
  });
  const listData = await listRes.json();
  const file = Array.isArray(listData.files) && listData.files.find((f) => f.fileName === key);
  if (!file) return null;

  await withRetry(async () => {
    const r = await fetch(`${ctx.account.apiUrl}/b2api/v4/b2_delete_file_version`, {
      method: "POST",
      headers: { Authorization: ctx.account.token, "Content-Type": "application/json" },
      body: JSON.stringify({ fileId: file.fileId, fileName: key }),
    });
    if (!r.ok) {
      const err = new Error(`b2_delete_file_version failed (${r.status}): ${await r.text()}`);
      err.status = r.status;
      throw err;
    }
    return r;
  });
  return file.fileId;
}

export async function getUploadUrl(env, bucketId, creds) {  // creds: optional { keyId, key } selecting a specific account (multi-bucket
  // support). Omitted -> the admin pair, exactly as before.
  const account = creds ? await authorizeWith(env, creds.keyId, creds.key) : await authorizeAdmin(env);
  const targetBucketId = bucketId || account.bucketId;
  if (!targetBucketId) throw new Error("No bucket id configured (B2_BUCKET_ID).");
  const res = await withRetry(async () => {
    const r = await fetch(
      `${account.apiUrl}/b2api/v4/b2_get_upload_url?bucketId=${encodeURIComponent(targetBucketId)}`,
      { method: "GET", headers: { Authorization: account.token } }
    );
    if (!r.ok) {
      const err = new Error(`b2_get_upload_url failed (${r.status}): ${await r.text()}`);
      err.status = r.status;
      throw err;
    }
    return r;
  });
  return res.json(); // { bucketId, uploadUrl, authorizationToken }
}

// ============================================================================
// Cloudflare Cache streaming proxy (NEW - sits in front of private B2)
//
// Browser -> Cloudflare Worker -> caches.default -> private B2
//
// The cache key is a NORMALIZED, token-free URL built from the B2 object key,
// so a rotating ?Authorization= token never invalidates the cache entry.
// caches.default.match() handles Range requests against the cached FULL 200
// response, returning 206 + Content-Range natively (Cloudflare always slices
// ranges for cached responses that carry Content-Length).
//
// On a miss we fetch the COMPLETE B2 object WITHOUT forwarding the client's
// Range header, so the Cache API receives a 200 and stores the whole file.
// ============================================================================

const MAX_CACHEABLE_BYTES = 512 * 1024 * 1024; // Cloudflare cache limit: 512 MB

function cacheableResponseHeaders(upstream) {
  const headers = new Headers(upstream.headers);
  // Preserve the headers the Cache API needs for range slicing + revalidation.
  const contentType = upstream.headers.get("Content-Type") || "video/mp4";
  const contentLength = upstream.headers.get("Content-Length");
  if (contentType) headers.set("Content-Type", contentType);
  if (contentLength) headers.set("Content-Length", contentLength);
  headers.set("Accept-Ranges", "bytes");
  // B2 exposes the file SHA-1 as x-bz-content-sha1; use it as an ETag.
  const sha1 = upstream.headers.get("x-bz-content-sha1");
  if (sha1 && !headers.has("ETag")) headers.set("ETag", `"${sha1}"`);
  // We own the edge TTL now - the signed B2 token's lifetime is irrelevant to
  // the cache because the cache key never contains it.
  headers.set("Cache-Control", "public, max-age=86400");
  return headers;
}

/**
 * Stream a private B2 object through the Cloudflare cache.
 * @param {object} env - Worker bindings (DB, B2_* secrets/vars)
 * @param {object} ctx - ExecutionContext for cache.put() background work
 * @param {string} key - B2 object key, e.g. "bfdi/26.mp4"
 * @param {Request} clientRequest - the incoming request (Range respected on hit)
 * @param {string} [bucketName] - optional bucket override (episodes.bucket);
 *   null/undefined streams from the default bucket exactly as before
 * @returns {Promise<Response>}
 */
export async function streamVideo(env, ctx, key, clientRequest, bucketName) {
  let resolved;
  try {
    resolved = await resolveReadContext(env, bucketName);
  } catch (err) {
    console.error(`[media] bucket resolution failed for "${bucketName}":`, err);
    return new Response(`Bucket not available: ${bucketName ?? "default"}`, { status: 502 });
  }
  const account = resolved.account;

  // Include the bucket in the cache key so two buckets can never collide.
  const cacheUrl = resolved.bucketName && resolved.bucketName !== env.B2_BUCKET_NAME
    ? `https://media.objectflix.local/${resolved.bucketName}/${key}` // normalized, token-free
    : `https://media.objectflix.local/${key}`;

  const cache = caches.default;

  // Look up the cache. Forwarding the client's Range header lets
  // caches.default.match() serve a 206 straight from the cached full 200.
  const rangeHeader = clientRequest.headers.get("Range");
  const lookupRequest = new Request(cacheUrl, {
    headers: rangeHeader ? { Range: rangeHeader } : {},
  });

  const cached = await cache.match(lookupRequest);
  if (cached) {
    console.log(`[media] CACHE HIT key=${key} range=${rangeHeader ?? "none"} status=${cached.status}`);
    return cached;
  }
  console.log(`[media] CACHE MISS key=${key} range=${rangeHeader ?? "none"}`);

  if (!isConfigured(env)) {
    return new Response("B2 not configured", { status: 503 });
  }

  // Fetch the COMPLETE object from B2. No Range header is forwarded, so B2
  // returns a full 200 that the Cache API is allowed to store.
  let token, upstream;
  try {
    token = await getDownloadToken(env, account, key, resolved.bucketId);
    const encodedKey = key.split("/").map(encodeURIComponent).join("/");
    const b2Url = `${account.downloadUrl}/file/${resolved.bucketName}/${encodedKey}?Authorization=${encodeURIComponent(token)}`;
    console.log(`[media] B2 FETCH key=${key}`);
    upstream = await fetch(b2Url);
  } catch (err) {
    console.error(`[media] B2 fetch failed key=${key}:`, err);
    return new Response("Upstream error", { status: 502 });
  }

  if (!upstream.ok) {
    console.log(`[media] B2 fetch non-ok key=${key} status=${upstream.status}`);
    return new Response(`Upstream error: ${upstream.status}`, { status: upstream.status });
  }

  const contentType = upstream.headers.get("Content-Type") || "";
  const contentLength = Number(upstream.headers.get("Content-Length")) || 0;

  // Only cache actual video responses, and only within the CF 512 MB limit.
  const isVideo = contentType.startsWith("video/");
  if (!isVideo) {
    console.log(`[media] NOT VIDEO (${contentType}) -> streaming without cache key=${key}`);
    return new Response(upstream.body, { status: upstream.status, headers: upstream.headers });
  }
  if (contentLength > MAX_CACHEABLE_BYTES) {
    console.log(`[media] TOO LARGE (${contentLength} bytes) -> streaming without cache key=${key}`);
    return new Response(upstream.body, { status: 200, headers: cacheableResponseHeaders(upstream) });
  }

  // Build a cacheable full-200 response, store a clone in the background,
  // and return the live stream to the caller.
  const headers = cacheableResponseHeaders(upstream);
  const cacheable = new Response(upstream.body, { status: 200, headers });

  ctx.waitUntil(
    cache
      .put(new Request(cacheUrl), cacheable.clone())
      .then(() => console.log(`[media] CACHE PUT key=${key} bytes=${contentLength}`))
      .catch((err) => console.error(`[media] CACHE PUT failed key=${key}:`, err))
  );

  console.log(`[media] SERVE FULL 200 key=${key} bytes=${contentLength}`);
  return cacheable;
}
