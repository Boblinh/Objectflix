

const AUTH_URL = "https://api.backblazeb2.com/b2api/v4/b2_authorize_account";

const accountCaches = new Map(); 
const inflightAuthorizes = new Map(); 
const tokenCache = new Map(); 

const MAX_CONCURRENT_TOKEN_FETCHES = 4;
let activeTokenFetches = 0;
const tokenFetcherQueue = [];
const inflightTokenPromises = new Map(); 

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

async function withRetry(fn, attempts = 3) {
  let lastErr;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      
      
      
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
      
      
      bucketId: env.B2_BUCKET_ID_NEW || (hasLegacy ? undefined : env.B2_BUCKET_ID),
      bucketName: env.B2_BUCKET_NAME_NEW || (hasLegacy ? undefined : env.B2_BUCKET_NAME),
    });
  }
  return accounts;
}

export function findAccountForBucket(env, bucketRef) {
  if (!bucketRef) return null;
  const accounts = bucketAccounts(env);
  return (
    accounts.find(
      (a) => a.bucketName === bucketRef || a.bucketId === bucketRef
    ) || null
  );
}

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

  
  const inflight = inflightTokenPromises.get(cacheKey);
  if (inflight) return inflight;

  const promise = (async () => {
    const ttlSeconds = Math.min(Number(env.B2_TOKEN_TTL_SECONDS) || 3600, 604800); 

    
    await acquireTokenSlot();
    try {
      const token = await withRetry(async () => {
        const res = await fetch(`${account.apiUrl}/b2api/v4/b2_get_download_authorization`, {
          method: "POST",
          headers: { Authorization: account.token, "Content-Type": "application/json" },
          body: JSON.stringify({
            bucketId: bucketId || account.bucketId,
            fileNamePrefix: videoKey, 
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

export function getMediaUrl(origin, videoKey) {
  if (!videoKey) return undefined;
  const encodedKey = videoKey.split("/").map(encodeURIComponent).join("/");
  return `${origin}/media/${encodedKey}`;
}

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

export async function getUploadUrl(env, bucketId, creds) {  
  
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
  return res.json(); 
}

const MAX_CACHEABLE_BYTES = 512 * 1024 * 1024; 

function cacheableResponseHeaders(upstream) {
  const headers = new Headers(upstream.headers);
  
  const contentType = upstream.headers.get("Content-Type") || "video/mp4";
  const contentLength = upstream.headers.get("Content-Length");
  if (contentType) headers.set("Content-Type", contentType);
  if (contentLength) headers.set("Content-Length", contentLength);
  headers.set("Accept-Ranges", "bytes");
  
  const sha1 = upstream.headers.get("x-bz-content-sha1");
  if (sha1 && !headers.has("ETag")) headers.set("ETag", `"${sha1}"`);
  
  
  headers.set("Cache-Control", "public, max-age=86400");
  return headers;
}

export async function streamVideo(env, ctx, key, clientRequest, bucketName) {
  let resolved;
  try {
    resolved = await resolveReadContext(env, bucketName);
  } catch (err) {
    console.error(`[media] bucket resolution failed for "${bucketName}":`, err);
    return new Response(`Bucket not available: ${bucketName ?? "default"}`, { status: 502 });
  }
  const account = resolved.account;

  
  const cacheUrl = resolved.bucketName && resolved.bucketName !== env.B2_BUCKET_NAME
    ? `https://media.objectflix.local/${resolved.bucketName}/${key}` 
    : `https://media.objectflix.local/${key}`;

  const cache = caches.default;

  
  
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

  
  const isVideo = contentType.startsWith("video/");
  if (!isVideo) {
    console.log(`[media] NOT VIDEO (${contentType}) -> streaming without cache key=${key}`);
    return new Response(upstream.body, { status: upstream.status, headers: upstream.headers });
  }
  if (contentLength > MAX_CACHEABLE_BYTES) {
    console.log(`[media] TOO LARGE (${contentLength} bytes) -> streaming without cache key=${key}`);
    return new Response(upstream.body, { status: 200, headers: cacheableResponseHeaders(upstream) });
  }

  
  
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
