









(() => {
  const CONFIG = window.OBJECTFLIX_CONFIG?.b2 || {};
  const ADMIN_KEY = window.OBJECTFLIX_CONFIG?.admin || {};

  const QUEUE_KEY = ADMIN_KEY.queueKey || "objectflix_admin_upload_queue";
  const ACTIVITY_KEY = ADMIN_KEY.activityKey || "objectflix_admin_activity";

  let lastStorageWarning = null;

  
  
  

  function showPrefixFor(showTitle) {
    const prefixes = window.OBJECTFLIX_CONFIG?.catalog?.showPrefixes || {};
    const t = String(showTitle || "").toUpperCase();
    return prefixes[t] || t.toLowerCase().replace(/[^a-zA-Z0-9_-]/g, "") || "misc";
  }

  
  function objectKeyFor(showTitle, episodeNumber, fileName) {
    const prefix = showPrefixFor(showTitle);
    const cleanEpisode = String(episodeNumber || "").trim().replace(/[\\/]/g, "").toLowerCase();
    const file = String(fileName || "").split(/[\\/]/).pop() || "";
    const dot = file.lastIndexOf(".");
    const ext = dot > 0 ? file.slice(dot + 1).toLowerCase() : "mp4";
    return `${prefix}/${cleanEpisode}.${ext}`;
  }

  function mediaUrlFor(key) {
    const base = CONFIG.mediaBase || "";
    return `${base}/${String(key).replace(/^\/+/, "")}`;
  }

  function bucketEndpoint(bucket) {
    const region = bucket?.region || "us-west-004";
    return `https://${bucket?.name}.s3.${region}.backblazeb2.com`;
  }

  function configuredBucket(bucketName) {
    const buckets = CONFIG.buckets || [];
    return buckets.find((b) => b.name === bucketName) || buckets[0] || null;
  }

  function isConfigured() {
    if (CONFIG.uploadEndpoint) return true;
    return Boolean(CONFIG.accountId && CONFIG.applicationKey);
  }

  
  
  

  function loadJSON(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch {
      return fallback;
    }
  }

  function saveJSON(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      
    }
  }

  function getUploads() {
    return loadJSON(QUEUE_KEY, []);
  }

  function saveUploads(queue) {
    saveJSON(QUEUE_KEY, queue);
  }

  function getActivity() {
    return loadJSON(ACTIVITY_KEY, []);
  }

  function logActivity(action, detail) {
    const list = getActivity();
    list.unshift({ at: Date.now(), action, detail });
    saveJSON(ACTIVITY_KEY, list.slice(0, 100));
  }

  
  
  

  let cachedAuth = null;

  async function authorize() {
    if (cachedAuth) return cachedAuth;
    if (!isConfigured()) {
      const err = new Error("Backblaze B2 credentials are not configured (src/config.js → b2).");
      err.code = "B2_NOT_CONFIGURED";
      throw err;
    }
    const body = new URLSearchParams({
      account_id: CONFIG.accountId,
      application_key: CONFIG.applicationKey,
    });
    const res = await fetch("https://api.backblazeb2.com/b2api/v3/b2_authorize_account", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
    if (!res.ok) {
      const err = new Error(`B2 authorization failed (${res.status}).`);
      err.code = "B2_AUTH_FAILED";
      throw err;
    }
    cachedAuth = await res.json();
    return cachedAuth;
  }

  async function listBuckets() {
    if (CONFIG.storageEndpoint) {
      let res;
      try {
        res = await fetch(CONFIG.storageEndpoint, { headers: { Accept: "application/json" } });
      } catch (err) {
        const e = new Error("Storage probe was blocked (network or CORS). Is the worker's /api/admin/storage endpoint deployed?");
        e.code = "STORAGE_PROXY_NETWORK";
        throw e;
      }
      let data = null;
      try {
        data = await res.json();
      } catch {
        
      }
      if (!res.ok) {
        const e = new Error(data?.error || `Storage info failed (${res.status}).`);
        e.code = "STORAGE_PROXY_FAILED";
        throw e;
      }
      lastStorageWarning = data?.warning || null;
      return (data.buckets || []).map((b) => ({
        bucketId: b.bucketId,
        name: b.bucketName || b.name,
        bucketName: b.bucketName || b.name,
        region: b.region || CONFIG.buckets?.[0]?.region || "us-west-004",
      }));
    }
    const auth = await authorize();
    const res = await fetch(`${auth.apiUrl}/b2api/v2/b2_list_buckets`, {
      method: "POST",
      headers: { Authorization: auth.authorizationToken, "Content-Type": "application/json" },
      body: JSON.stringify({ accountId: auth.accountId }),
    });
    if (!res.ok) throw new Error(`B2 list buckets failed (${res.status}).`);
    const data = await res.json();
    return data.buckets || [];
  }

  
  
  
  async function checkObject(key, bucketName) {
    const probeUrls = [mediaUrlFor(key)];
    const bucket = configuredBucket(bucketName);
    if (bucket) probeUrls.push(`${bucketEndpoint(bucket)}/${String(key).replace(/^\/+/, "")}`);
    for (const url of probeUrls) {
      try {
        const res = await fetch(url, { method: "HEAD", cache: "no-store" });
        if (res.ok) return { exists: true, url, status: res.status };
      } catch {
        
      }
    }
    return { exists: false, url: probeUrls[0], status: 0, offline: true };
  }

  function computeSha1(file) {
    if (typeof crypto === "undefined" || !crypto.subtle) return Promise.resolve("do_not_verify");
    return file
      .arrayBuffer()
      .then((buf) => crypto.subtle.digest("SHA-1", buf))
      .then((digest) => [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join(""));
  }

  function uploadWithProgress(url, headers, body, onProgress) {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open("POST", url);
      for (const [key, value] of Object.entries(headers)) xhr.setRequestHeader(key, value);
      if (onProgress) {
        xhr.upload.addEventListener("progress", (event) => {
          if (event.lengthComputable) onProgress(event.loaded, event.total);
        });
      }
      xhr.addEventListener("load", () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            resolve(JSON.parse(xhr.responseText));
          } catch {
            resolve({ status: xhr.status });
          }
        } else {
          reject(new Error(`Upload failed (${xhr.status}).`));
        }
      });
      xhr.addEventListener("error", () => reject(new Error("Upload failed — network error.")));
      xhr.addEventListener("abort", () => reject(new Error("Upload aborted.")));
      xhr.send(body);
    });
  }

  
  
  async function getUploadTarget(bucketName, key) {
    if (CONFIG.uploadEndpoint) {
      let res;
      try {
        res = await fetch(CONFIG.uploadEndpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify({ bucket: bucketName || null, fileName: key }),
        });
      } catch (err) {
        const e = new Error("Upload signing request was blocked (network or CORS). Is the worker's /api/admin/uploads/sign endpoint deployed?");
        e.code = "UPLOAD_SIGN_NETWORK";
        throw e;
      }
      let data = null;
      try {
        data = await res.json();
      } catch {
        
      }
      if (!res.ok) {
        const e = new Error(data?.error || `Upload signing failed (${res.status}).`);
        e.code = "UPLOAD_SIGN_FAILED";
        throw e;
      }
      if (!data?.uploadUrl || !data?.authorizationToken) {
        const e = new Error("Upload signing response was missing uploadUrl or authorizationToken.");
        e.code = "UPLOAD_SIGN_INVALID";
        throw e;
      }
      return { uploadUrl: data.uploadUrl, authorizationToken: data.authorizationToken, fileName: data.fileName || key };
    }

    const auth = await authorize();
    const listRes = await fetch(`${auth.apiUrl}/b2api/v2/b2_get_upload_url`, {
      method: "POST",
      headers: { Authorization: auth.authorizationToken, "Content-Type": "application/json" },
      body: JSON.stringify({ bucketId: bucketName }),
    });
    if (!listRes.ok) throw new Error(`B2 get upload URL failed (${listRes.status}).`);
    const { uploadUrl, authorizationToken } = await listRes.json();
    return { uploadUrl, authorizationToken, fileName: key };
  }

  async function uploadObject({ bucket, key, file, onProgress }) {
    const target = await getUploadTarget(bucket?.name || bucket, key);
    const sha1 = await computeSha1(file);
    const headers = {
      Authorization: target.authorizationToken,
      "X-Bz-File-Name": encodeURIComponent(target.fileName || key),
      "Content-Type": file.type || "application/octet-stream",
      "X-Bz-Content-Sha1": sha1,
      "X-Bz-Info-Objectflix": "admin-upload",
    };
    return uploadWithProgress(target.uploadUrl, headers, file, onProgress);
  }

  
  
  

  
  const pendingFiles = new Map();

  function enqueue({ showId, showTitle, episodeNumber, fileName, file, bucketName, key }) {
    const queue = getUploads();
    const item = {
      id: "up-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
      showId,
      showTitle,
      episodeNumber,
      fileName,
      size: file?.size || 0,
      bucket: bucketName || configuredBucket()?.name || "",
      key,
      mediaUrl: mediaUrlFor(key),
      status: "queued", 
      progress: 0,
      error: null,
      createdAt: Date.now(),
      completedAt: null,
    };
    if (file) pendingFiles.set(item.id, file);
    queue.unshift(item);
    saveUploads(queue);
    logActivity("Upload queued", key);
    return item;
  }

  function patch(id, update) {
    const queue = getUploads();
    const item = queue.find((entry) => entry.id === id);
    if (!item) return null;
    Object.assign(item, update);
    saveUploads(queue);
    return item;
  }

  async function process(id) {
    const item = getUploads().find((entry) => entry.id === id);
    if (!item) return null;

    const key = item.key;
    const bucket = configuredBucket(item.bucket);

    patch(id, { status: "checking", progress: 0, error: null });

    const check = await checkObject(key, item.bucket);
    if (check.exists) {
      patch(id, { status: "exists", progress: 100, completedAt: Date.now() });
      logActivity("Upload skipped", `${key} already exists in storage.`);
      return getUploads().find((entry) => entry.id === id);
    }

    if (!isConfigured()) {
      patch(id, {
        status: "not-configured",
        error: "Backblaze B2 credentials are not configured. Add them in src/config.js → b2 to upload.",
      });
      logActivity("Upload blocked", `${key} — B2 not configured.`);
      return getUploads().find((entry) => entry.id === id);
    }

    const file = pendingFiles.get(id);
    if (!file) {
      patch(id, { status: "failed", error: "File is no longer available in this session. Re-select the file and retry." });
      return getUploads().find((entry) => entry.id === id);
    }

    patch(id, { status: "uploading", progress: 0 });
    try {
      await uploadObject({
        bucket: bucket || { name: item.bucket },
        key,
        file,
        onProgress: (loaded, total) => {
          const pct = total ? Math.min(99, Math.round((loaded / total) * 100)) : 50;
          patch(id, { progress: pct });
        },
      });
      patch(id, { status: "complete", progress: 100, completedAt: Date.now() });
      logActivity("Upload complete", key);
    } catch (err) {
      patch(id, { status: "failed", error: err.message });
      logActivity("Upload failed", `${key} — ${err.message}`);
    }
    return getUploads().find((entry) => entry.id === id);
  }

  function retry(id) {
    const item = getUploads().find((entry) => entry.id === id);
    if (!item) return null;
    if (!pendingFiles.has(id)) {
      patch(id, { status: "failed", error: "File is no longer available in this session. Re-select the file and retry." });
      return item;
    }
    patch(id, { status: "queued", progress: 0, error: null });
    void process(id);
    return item;
  }

  function removeUpload(id) {
    const queue = getUploads().filter((entry) => entry.id !== id);
    pendingFiles.delete(id);
    saveUploads(queue);
  }

  function clearCompleted() {
    const queue = getUploads().filter((entry) => !["complete", "exists", "failed"].includes(entry.status));
    saveUploads(queue);
  }

  function clearAll() {
    pendingFiles.clear();
    saveUploads([]);
  }

  window.OBJECTFLIX_B2 = {
    isConfigured,
    showPrefixFor,
    objectKeyFor,
    mediaUrlFor,
    bucketEndpoint,
    configuredBucket,
    authorize,
    listBuckets,
    checkObject,
    getUploadTarget,
    enqueue,
    lastStorageWarning,
    process,
    retry,
    removeUpload,
    clearCompleted,
    clearAll,
    getUploads,
    getActivity,
    logActivity,
  };
})();
