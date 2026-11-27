// Objectflix: this is the subtitle_workshop part, kept here so the rest of the app knows exactly where to look.
import { Hono } from "hono";
import { z } from "zod";
import { HttpError, apiError, assertOrigin, jsonBody, nowSeconds, rateLimit } from "./membership/http.js";
import { getIdentity, requireIdentity, requireMembershipAdmin, tokenHash } from "./membership/identity.js";

const reportSchema = z.object({
  episodeId: z.uuid(),
  subtitleId: z.uuid().nullable().optional(),
  kind: z.enum(["typo", "timing", "missing", "other"]),
  timeSeconds: z.number().int().min(0).max(86400).nullable().optional(),
  direction: z.enum(["early", "late"]).nullable().optional(),
  details: z.string().trim().min(3).max(1000),
  correctedText: z.string().trim().max(1000).nullable().optional(),
}).strict().refine((body) => body.kind !== "timing" || (body.timeSeconds !== null && body.timeSeconds !== undefined && body.direction), {
  message: "Timing reports need a timestamp and whether the subtitles are early or late.",
});

const submissionSchema = z.object({
  episodeId: z.uuid(),
  language: z.string().trim().min(2).max(12).regex(/^[a-zA-Z0-9-]+$/),
  format: z.enum(["ass", "ssa"]),
  attribution: z.string().trim().min(2).max(120),
  rightsConfirmed: z.literal(true),
  content: z.string().min(1).max(600000),
}).strict();

const reportReviewSchema = z.object({
  status: z.enum(["resolved", "rejected"]),
  resolution: z.string().trim().max(1000).optional().default(""),
}).strict();

const submissionReviewSchema = z.object({
  status: z.enum(["approved", "rejected"]),
  reviewNote: z.string().trim().max(1000).optional().default(""),
}).strict();

const MAX_SUBTITLE_BYTES = 400 * 1024;

// Rejects oversized or malformed ASS/SSA text before it is stored as a submission.
function validateSubtitleFile(content, format) {
  const bytes = new TextEncoder().encode(content).byteLength;
  if (bytes > MAX_SUBTITLE_BYTES) throw new HttpError(413, "Subtitle files must be 400 KiB or smaller.", "subtitle_too_large");
  if (content.includes("\u0000")) throw new HttpError(400, "This subtitle file is not valid text.", "invalid_subtitle");
  if (!/^\s*\[Script Info\]/i.test(content) || !/^\s*\[Events\]/im.test(content) || !/^Dialogue\s*:/im.test(content)) {
    throw new HttpError(400, `Upload a valid .${format.toUpperCase()} subtitle file with at least one dialogue line.`, "invalid_subtitle");
  }
}

// Builds a report rate-limit key from the signed-in user or a hashed client IP.
async function reportRateKey(c) {
  const user = await getIdentity(c, true);
  if (user) return `subtitle-report:user:${user.id}`;
  const ip = c.req.header("cf-connecting-ip") || "unknown-client";
  return `subtitle-report:ip:${(await tokenHash(ip)).slice(0, 32)}`;
}

// Maps a subtitle report database row to the API response shape.
function reportRow(row) {
  return {
    id: row.id,
    episodeId: row.episode_id,
    showTitle: row.show_title || "",
    episodeTitle: row.episode_title || "",
    subtitleId: row.subtitle_id,
    kind: row.kind,
    timeSeconds: row.time_seconds,
    direction: row.direction,
    details: row.details,
    correctedText: row.corrected_text,
    status: row.status,
    resolution: row.resolution,
    reporter: row.reporter || "Guest",
    createdAt: row.created_at,
    resolvedAt: row.resolved_at,
  };
}

// Maps a subtitle submission database row to the API response shape.
function submissionRow(row) {
  return {
    id: row.id,
    episodeId: row.episode_id,
    showTitle: row.show_title || "",
    episodeTitle: row.episode_title || "",
    language: row.language,
    format: row.format,
    attribution: row.attribution,
    contributor: row.contributor || "Objectflix viewer",
    rightsConfirmed: Boolean(row.rights_confirmed),
    status: row.status,
    reviewNote: row.review_note,
    createdAt: row.created_at,
    reviewedAt: row.reviewed_at,
  };
}

export const subtitleWorkshop = new Hono();
subtitleWorkshop.onError(apiError);
subtitleWorkshop.use("*", async (c, next) => {
  c.header("Cache-Control", "no-store");
  await next();
});

// Validates and rate-limits a report, checking that its episode and optional subtitle track exist together.
subtitleWorkshop.post("/reports", async (c) => {
  assertOrigin(c);
  const limitKey = await reportRateKey(c);
  await rateLimit(c.env, limitKey, 8, 3600);
  const body = await jsonBody(c, reportSchema, 12000);
  const episode = await c.env.DB.prepare("SELECT id FROM episodes WHERE id = ?").bind(body.episodeId).first();
  if (!episode) throw new HttpError(404, "Episode not found.", "episode_not_found");
  if (body.subtitleId) {
    const track = await c.env.DB.prepare("SELECT id FROM subtitles WHERE id = ? AND episode_id = ?").bind(body.subtitleId, body.episodeId).first();
    if (!track) throw new HttpError(400, "That subtitle track does not belong to this episode.", "invalid_subtitle_track");
  }
  const user = await getIdentity(c, true);
  const id = crypto.randomUUID();
  const createdAt = nowSeconds();
  await c.env.DB.prepare(`INSERT INTO subtitle_reports
    (id, episode_id, subtitle_id, kind, time_seconds, direction, details, corrected_text, user_id, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(id, body.episodeId, body.subtitleId || null, body.kind, body.timeSeconds ?? null, body.direction || null,
      body.details, body.correctedText || null, user?.id || null, createdAt).run();
  return c.json({ success: true, report: { id, status: "open", createdAt } }, 201);
});

// Accepts authenticated, rate-limited subtitle uploads only for visible episodes and valid ASS/SSA content.
subtitleWorkshop.post("/submissions", requireIdentity, async (c) => {
  assertOrigin(c);
  const user = c.get("user");
  await rateLimit(c.env, `subtitle-upload:${user.id}`, 3, 86400);
  const body = await jsonBody(c, submissionSchema, 650000);
  const episode = await c.env.DB.prepare("SELECT id FROM episodes WHERE id = ? AND COALESCE(hidden, 0) = 0").bind(body.episodeId).first();
  if (!episode) throw new HttpError(404, "Episode not found.", "episode_not_found");
  const normalizedContent = body.content.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
  validateSubtitleFile(normalizedContent, body.format);
  const id = crypto.randomUUID();
  const createdAt = nowSeconds();
  await c.env.DB.prepare(`INSERT INTO subtitle_workshop_submissions
    (id, episode_id, user_id, language, format, attribution, rights_confirmed, content, created_at)
    VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)`)
    .bind(id, body.episodeId, user.id, body.language.toLowerCase(), body.format, body.attribution, normalizedContent, createdAt).run();
  return c.json({ success: true, submission: { id, status: "pending", createdAt } }, 201);
});

// Returns only the signed-in user's recent subtitle reports and submissions.
subtitleWorkshop.get("/mine", requireIdentity, async (c) => {
  const userId = c.get("user").id;
  const [reports, submissions] = await c.env.DB.batch([
    c.env.DB.prepare(`SELECT r.*, e.title AS episode_title, s.title AS show_title, u.display_name AS reporter FROM subtitle_reports r
      JOIN episodes e ON e.id = r.episode_id JOIN shows s ON s.id = e.show_id
      LEFT JOIN account_users u ON u.id = r.user_id WHERE r.user_id = ? ORDER BY r.created_at DESC LIMIT 50`).bind(userId),
    c.env.DB.prepare(`SELECT w.*, e.title AS episode_title, s.title AS show_title, u.display_name AS contributor
      FROM subtitle_workshop_submissions w JOIN episodes e ON e.id = w.episode_id JOIN shows s ON s.id = e.show_id
      JOIN account_users u ON u.id = w.user_id WHERE w.user_id = ? ORDER BY w.created_at DESC LIMIT 50`).bind(userId),
  ]);
  return c.json({ success: true, reports: reports.results.map(reportRow), submissions: submissions.results.map(submissionRow) });
});

// Serves a track as plain text only after its workshop submission has been approved.
subtitleWorkshop.get("/tracks/:id", async (c) => {
  const row = await c.env.DB.prepare(`SELECT w.content, w.format FROM subtitle_workshop_submissions w
    JOIN subtitles s ON s.workshop_submission_id = w.id WHERE w.id = ? AND w.status = 'approved'`).bind(c.req.param("id")).first();
  if (!row) return c.text("Subtitle track not found", 404);
  return c.body(row.content, 200, {
    "Content-Type": "text/plain; charset=utf-8",
    "Content-Disposition": `inline; filename="objectflix-subtitle.${row.format}"`,
    "X-Content-Type-Options": "nosniff",
    "Cache-Control": "public, max-age=300",
  });
});

const workshopAdmin = new Hono();
workshopAdmin.use("*", requireMembershipAdmin);
// Lists recent reports for admins, optionally filtering by a validated report status.
workshopAdmin.get("/reports", async (c) => {
  const status = c.req.query("status");
  if (status && !["open", "resolved", "rejected"].includes(status)) throw new HttpError(400, "Unknown report status.", "invalid_status");
  const where = status ? "WHERE r.status = ?" : "";
  const rows = await c.env.DB.prepare(`SELECT r.*, e.title AS episode_title, s.title AS show_title, u.display_name AS reporter
    FROM subtitle_reports r JOIN episodes e ON e.id = r.episode_id JOIN shows s ON s.id = e.show_id
    LEFT JOIN account_users u ON u.id = r.user_id ${where} ORDER BY r.created_at DESC LIMIT 300`)
    .bind(...(status ? [status] : [])).all();
  return c.json({ success: true, reports: rows.results.map(reportRow) });
});

// Lists recent submissions for admins, optionally filtering by a validated review status.
workshopAdmin.get("/submissions", async (c) => {
  const status = c.req.query("status");
  if (status && !["pending", "approved", "rejected"].includes(status)) throw new HttpError(400, "Unknown submission status.", "invalid_status");
  const where = status ? "WHERE w.status = ?" : "";
  const rows = await c.env.DB.prepare(`SELECT w.id, w.episode_id, w.user_id, w.language, w.format, w.attribution,
    w.rights_confirmed, w.status, w.review_note, w.created_at, w.reviewed_at,
    e.title AS episode_title, s.title AS show_title, u.display_name AS contributor
    FROM subtitle_workshop_submissions w JOIN episodes e ON e.id = w.episode_id JOIN shows s ON s.id = e.show_id
    JOIN account_users u ON u.id = w.user_id ${where} ORDER BY w.created_at DESC LIMIT 200`)
    .bind(...(status ? [status] : [])).all();
  return c.json({ success: true, submissions: rows.results.map(submissionRow) });
});

// Returns the stored subtitle source for an admin's review, or a not-found error.
workshopAdmin.get("/submissions/:id/content", async (c) => {
  const row = await c.env.DB.prepare("SELECT content, format FROM subtitle_workshop_submissions WHERE id = ?").bind(c.req.param("id")).first();
  if (!row) throw new HttpError(404, "Submission not found.", "submission_not_found");
  return c.json({ success: true, content: row.content, format: row.format });
});

// Validates and records an admin's report decision, resolution note, and review time.
workshopAdmin.patch("/reports/:id", async (c) => {
  assertOrigin(c);
  const body = await jsonBody(c, reportReviewSchema, 4096);
  const now = nowSeconds();
  const result = await c.env.DB.prepare(`UPDATE subtitle_reports SET status = ?, resolution = ?, resolved_at = ? WHERE id = ?`)
    .bind(body.status, body.resolution || null, now, c.req.param("id")).run();
  if (!result.meta.changes) throw new HttpError(404, "Report not found.", "report_not_found");
  return c.json({ success: true, status: body.status });
});

// Applies one admin decision to a pending submission and creates a public track when approved.
workshopAdmin.patch("/submissions/:id", async (c) => {
  assertOrigin(c);
  const body = await jsonBody(c, submissionReviewSchema, 4096);
  const id = c.req.param("id");
  const existing = await c.env.DB.prepare("SELECT * FROM subtitle_workshop_submissions WHERE id = ?").bind(id).first();
  if (!existing) throw new HttpError(404, "Submission not found.", "submission_not_found");
  if (existing.status !== "pending") throw new HttpError(409, "This submission has already been reviewed.", "submission_already_reviewed");
  const now = nowSeconds();
  const trackId = crypto.randomUUID();
  const trackUrl = `/api/subtitle-workshop/tracks/${id}`;
  const statements = [c.env.DB.prepare(`UPDATE subtitle_workshop_submissions SET status = ?, review_note = ?, reviewed_at = ?
    WHERE id = ? AND status = 'pending'`).bind(body.status, body.reviewNote || null, now, id)];
  if (body.status === "approved") {
    statements.push(c.env.DB.prepare(`INSERT OR IGNORE INTO subtitles
      (id, episode_id, language, url, created_at, attribution, workshop_submission_id)
      SELECT ?, episode_id, language, ?, ?, attribution, id FROM subtitle_workshop_submissions
      WHERE id = ? AND status = 'approved'`).bind(trackId, trackUrl, now, id));
  }
  const results = await c.env.DB.batch(statements);
  if (!results[0]?.meta?.changes) throw new HttpError(409, "This submission has already been reviewed.", "submission_already_reviewed");
  return c.json({ success: true, status: body.status, trackUrl: body.status === "approved" ? trackUrl : null });
});

subtitleWorkshop.route("/admin", workshopAdmin);
