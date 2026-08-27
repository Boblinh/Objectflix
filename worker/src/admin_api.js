import { Hono } from "hono";
import { authorizeAdmin, getUploadUrl, listBuckets, findAccountForBucket, deleteObject } from "./b2";
import { adminCommunity } from "./community_api";

// Matches the frontend's object-key convention: <show>/<episode>.<ext> or
// <show>/<subfolder>/<episode>.<ext>. Dots allowed in names (e.g. "5.5").
const FILE_NAME_RE = /^(?:[a-z0-9][a-z0-9_-]*\/){1,2}[a-z0-9][a-z0-9_.-]*\.(mp4|mkv|webm|mov|m4v|avi)$/i;
const MAX_FILE_NAME_LENGTH = 200;

export const admin = new Hono();

// Optional shared secret gate. The public frontend does not send this header by
// default, so leave ADMIN_SECRET unset unless you also wire the header client-side.
admin.use("*", async (c, next) => {
  const secret = c.env?.ADMIN_SECRET;
  if (secret && c.req.header("x-objectflix-admin-secret") !== secret) {
    return c.json({ error: "Unauthorized" }, 401);
  }
  await next();
});

// Community management (list / set status / delete requests and feedback).
// Registered AFTER the secret gate so it inherits it.
admin.route("/community", adminCommunity);

async function resolveBucketId(env, requested) {
  if (!requested) return undefined;
  if (/^[0-9a-f]{12}$/i.test(requested)) return requested;
  try {
    const buckets = await listBuckets(env);
    const match = buckets.find((b) => b.bucketId === requested || b.bucketName === requested);
    return match ? match.bucketId : null;
  } catch {
    return null;
  }
}

admin.get("/storage", async (c) => {
  try {
    const account = await authorizeAdmin(c.env);
    let buckets = [];
    let warning = null;
    try {
      buckets = await listBuckets(c.env);
    } catch (err) {
      warning = err.message || "Bucket listing not permitted for this key.";
      const bucketId = c.env.B2_BUCKET_ID;
      const bucketName = account.bucketName || c.env.B2_BUCKET_NAME;
      if (bucketId || bucketName) {
        buckets = [{
          bucketId: bucketId || null,
          bucketName: bucketName || bucketId || null,
          bucketType: null,
          fallback: true,
        }];
      }
    }
    return c.json({
      ok: true,
      accountId: account.accountId,
      defaultBucket: account.bucketName || c.env.B2_BUCKET_NAME || null,
      buckets: buckets.map((b) => ({
        bucketId: b.bucketId,
        bucketName: b.bucketName,
        bucketType: b.bucketType,
      })),
      warning,
    });
  } catch (err) {
    return c.json({ error: err.message || "Storage probe failed." }, 500);
  }
});

admin.post("/uploads/sign", async (c) => {
  let body;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Request body must be JSON." }, 400);
  }

  const fileName = String(body.fileName || "");
  if (!FILE_NAME_RE.test(fileName) || fileName.length > MAX_FILE_NAME_LENGTH) {
    return c.json(
      { error: "Invalid object name. Use <show>/<episode>.<ext> with letters, digits, dashes, underscores." },
      400
    );
  }

  try {
    // Config-driven resolution first (works without the listBuckets capability
    // and across separate B2 accounts); legacy listBuckets fallback second.
    let bucketId = null;
    let creds = null;
    const entry = findAccountForBucket(c.env, body.bucket);
    if (entry && entry.bucketId) {
      bucketId = entry.bucketId;
      creds = entry;
    } else if (!entry || !body.bucket) {
      bucketId = await resolveBucketId(c.env, body.bucket);
    }
    if (!bucketId) {
      return c.json({ error: `Unknown or unreachable bucket: ${body.bucket ?? "(default)"}` }, 400);
    }
    const target = await getUploadUrl(c.env, bucketId, creds);
    return c.json({
      uploadUrl: target.uploadUrl,
      authorizationToken: target.authorizationToken,
      fileName,
    });
  } catch (err) {
    return c.json({ error: err.message || "Upload signing failed." }, 500);
  }
});

// Permanently delete an uploaded object. Body: { fileName, bucket? }.
admin.post("/uploads/delete", async (c) => {
  let body;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Request body must be JSON." }, 400);
  }

  const fileName = String(body.fileName || "");
  if (!FILE_NAME_RE.test(fileName) || fileName.length > MAX_FILE_NAME_LENGTH) {
    return c.json(
      { error: "Invalid object name. Use <show>/<episode>.<ext> with letters, digits, dashes, underscores, dots." },
      400
    );
  }

  try {
    const fileId = await deleteObject(c.env, fileName, body.bucket || null);
    if (!fileId) return c.json({ success: true, deleted: false });
    return c.json({ success: true, deleted: true, fileId });
  } catch (err) {
    return c.json({ error: err.message || "Delete failed." }, err.status === 403 ? 403 : 500);
  }
});
