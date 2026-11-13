import { Hono } from "hono";
import { z } from "zod";
import { HttpError, apiError, appUrl, jsonBody, nowSeconds, rateLimit, recordId, unixTime } from "./http.js";
import { getIdentity, requireIdentity, requireMembershipAdmin } from "./identity.js";
import { PLANS, effectivePlan, effectivePreferences, entitlementsFor, memberState, planFor, rankFor, requirePerk } from "./config.js";

const eventSchema = z.object({
  title: z.string().trim().min(3).max(120), description: z.string().trim().min(10).max(4000),
  startsAt: unixTime, endsAt: unixTime, status: z.enum(["upcoming", "live", "completed", "cancelled"]),
  episodeId: recordId, rightsId: recordId, announceAt: unixTime, priorityAnnounceAt: unixTime,
}).strict().refine((v) => v.endsAt > v.startsAt && v.endsAt - v.startsAt <= 86400 && v.priorityAnnounceAt <= v.announceAt && v.announceAt <= v.startsAt);

const eventQuery = `SELECT n.*, e.title AS episode_title, e.show_id, e.video_key,
  r.revoked_at, r.valid_from, r.valid_until, r.episode_id AS licensed_episode
  FROM movie_nights n JOIN episodes e ON e.id = n.episode_id JOIN movie_night_rights r ON r.id = n.rights_id`;

async function viewerFor(c) {
  const user = await getIdentity(c, true);
  return { user, member: user ? await memberState(c.env, user.id) : { planId: "newbie", entitlements: entitlementsFor(c.env, "newbie"), preferences: {} } };
}

function visible(event, member, now = nowSeconds()) {
  return event.announce_at <= now || (member.entitlements.priority_announcements && event.priority_announce_at <= now);
}

export function rightsCoverEvent(event) {
  return !event.revoked_at && event.licensed_episode === event.episode_id && event.valid_from <= event.starts_at && event.valid_until >= event.ends_at && Boolean(event.video_key);
}

function eventStatus(event, now = nowSeconds()) {
  if (event.status === "cancelled" || event.status === "completed") return event.status;
  if (now >= event.ends_at) return "completed";
  if (event.status === "live" && now >= event.starts_at) return "live";
  return "upcoming";
}

function publicEvent(event, member) {
  const status = eventStatus(event);
  return { id: event.id, title: event.title, description: event.description, startsAt: event.starts_at, endsAt: event.ends_at, status,
    episodeTitle: event.episode_title, earlyAnnouncement: event.announce_at > nowSeconds(),
    playbackAvailable: status === "live" && rightsCoverEvent(event),
    canSuggestTheme: Boolean(member.entitlements.movie_theme_suggestions && status === "upcoming"),
  };
}

async function eventFor(c, member) {
  const event = await c.env.DB.prepare(`${eventQuery} WHERE n.id = ?`).bind(c.req.param("id")).first();
  if (!event || !visible(event, member)) throw new HttpError(404, "Movie Night not found.", "event_not_found");
  return event;
}

export const movieNights = new Hono();
movieNights.onError(apiError);
movieNights.use("*", async (c, next) => { c.header("Cache-Control", "no-store"); await next(); });
movieNights.get("/", async (c) => {
  const { member } = await viewerFor(c);
  const { results } = await c.env.DB.prepare(`${eventQuery} WHERE n.announce_at <= ? OR (? = 1 AND n.priority_announce_at <= ?)
    ORDER BY CASE WHEN n.ends_at >= ? THEN 0 ELSE 1 END, n.starts_at DESC LIMIT 100`)
    .bind(nowSeconds(), Number(member.entitlements.priority_announcements), nowSeconds(), nowSeconds()).all();
  return c.json({ success: true, events: results.map((event) => publicEvent(event, member)), serverTime: nowSeconds() });
});

movieNights.get("/:id", async (c) => {
  const { user, member } = await viewerFor(c);
  const event = await eventFor(c, member);
  const now = nowSeconds();
  const [pollRows, suggestions, attendance, recognition] = await c.env.DB.batch([
    c.env.DB.prepare(`SELECT p.id, p.question, p.min_plan, p.opens_at, p.closes_at, o.id AS option_id, o.label, o.position,
      (SELECT COUNT(*) FROM movie_night_votes v WHERE v.poll_id = p.id AND v.option_id = o.id) AS votes,
      (SELECT option_id FROM movie_night_votes v WHERE v.poll_id = p.id AND v.user_id = ?) AS selected_option
      FROM movie_night_polls p JOIN movie_night_poll_options o ON o.poll_id = p.id WHERE p.event_id = ? ORDER BY p.opens_at, o.position`).bind(user?.id || "", event.id),
    c.env.DB.prepare("SELECT id, theme, description, status FROM movie_night_suggestions WHERE event_id = ? AND (status = 'approved' OR user_id = ?) ORDER BY created_at DESC LIMIT 50").bind(event.id, user?.id || ""),
    c.env.DB.prepare("SELECT user_id FROM movie_night_attendees WHERE event_id = ? AND user_id = ?").bind(event.id, user?.id || ""),
    c.env.DB.prepare(`WITH candidates AS (
      SELECT u.id, u.display_name, p.show_title, p.recognition_opt_in FROM movie_night_attendees a
      JOIN account_users u ON u.id = a.user_id JOIN member_preferences p ON p.user_id = u.id
      WHERE a.event_id = ? AND p.recognition_opt_in = 1 ORDER BY a.joined_at LIMIT 50
    ) SELECT c.*, s.status, s.entitled_plan_id, s.paid_through, s.cancel_at FROM candidates c
      LEFT JOIN billing_subscriptions s ON s.user_id = c.id AND s.livemode = ? AND s.status IN ('active', 'past_due') AND s.paid_through > ?`)
      .bind(event.id, Number(c.env.STRIPE_MODE === "live"), now),
  ]);
  const polls = new Map();
  for (const row of pollRows.results) {
    if (!polls.has(row.id)) polls.set(row.id, { id: row.id, question: row.question, minPlan: row.min_plan, opensAt: row.opens_at, closesAt: row.closes_at,
      canVote: Boolean(user && !["cancelled", "completed"].includes(eventStatus(event)) && now >= row.opens_at && now < row.closes_at && rankFor(member.planId) >= rankFor(row.min_plan) && (row.min_plan === "newbie" || member.entitlements.member_polls)),
      selectedOption: row.selected_option, options: [] });
    polls.get(row.id).options.push({ id: row.option_id, label: row.label, votes: row.votes });
  }
  const supporters = [];
  const candidates = new Map();
  for (const row of recognition.results) {
    if (!candidates.has(row.id)) candidates.set(row.id, { preference: row, subscriptions: [] });
    candidates.get(row.id).subscriptions.push(row);
  }
  for (const { preference, subscriptions } of candidates.values()) {
    const planId = effectivePlan(subscriptions, now);
    const prefs = effectivePreferences(preference, entitlementsFor(c.env, planId));
    if (prefs.recognitionOptIn) supporters.push({ displayName: preference.display_name, title: prefs.showTitle ? planFor(planId).name : null });
  }
  return c.json({ success: true, event: publicEvent(event, member), polls: [...polls.values()], suggestions: suggestions.results, supporters,
    viewer: { authenticated: Boolean(user), going: Boolean(attendance.results.length), supporterBadge: Boolean(user && member.entitlements.movie_supporter_badge) }, serverTime: now });
});

movieNights.post("/:id/rsvp", requireIdentity, async (c) => {
  const member = await memberState(c.env, c.get("user").id);
  const event = await eventFor(c, member);
  if (["cancelled", "completed"].includes(eventStatus(event))) throw new HttpError(409, "This Movie Night is no longer accepting RSVPs.", "event_closed");
  await c.env.DB.prepare("INSERT INTO movie_night_attendees (event_id, user_id, joined_at) VALUES (?, ?, ?) ON CONFLICT(event_id, user_id) DO NOTHING")
    .bind(event.id, c.get("user").id, nowSeconds()).run();
  return c.json({ success: true });
});

movieNights.delete("/:id/rsvp", requireIdentity, async (c) => {
  await c.env.DB.prepare("DELETE FROM movie_night_attendees WHERE event_id = ? AND user_id = ?").bind(c.req.param("id"), c.get("user").id).run();
  return c.json({ success: true });
});

movieNights.post("/:id/join", requireIdentity, async (c) => {
  const member = await memberState(c.env, c.get("user").id);
  const event = await eventFor(c, member);
  if (eventStatus(event) !== "live") throw new HttpError(409, "The host has not started this Movie Night, or it has ended.", "event_not_live");
  if (!rightsCoverEvent(event)) throw new HttpError(409, "Playback is unavailable while this event's streaming permission is being reviewed.", "streaming_permission_required");
  const url = new URL("watch.html", appUrl(c.env));
  url.searchParams.set("id", event.show_id);
  url.searchParams.set("ep", event.episode_id);
  url.searchParams.set("movieNight", event.id);
  await c.env.DB.prepare("INSERT INTO movie_night_attendees (event_id, user_id, joined_at) VALUES (?, ?, ?) ON CONFLICT(event_id, user_id) DO NOTHING")
    .bind(event.id, c.get("user").id, nowSeconds()).run();
  return c.json({ success: true, watchUrl: url.href, serverTime: nowSeconds(), startsAt: event.starts_at });
});

movieNights.post("/:id/suggestions", requireIdentity, async (c) => {
  const user = c.get("user");
  const member = await memberState(c.env, user.id);
  requirePerk(member, "movie_theme_suggestions");
  const event = await eventFor(c, member);
  if (eventStatus(event) !== "upcoming") throw new HttpError(409, "Theme suggestions are closed for this event.", "suggestions_closed");
  const body = await jsonBody(c, z.object({ theme: z.string().trim().min(3).max(120), description: z.string().trim().min(5).max(1000) }).strict());
  await rateLimit(c.env, `theme:${event.id}:${user.id}`, 3, 86400);
  await c.env.DB.prepare("INSERT INTO movie_night_suggestions (id, event_id, user_id, theme, description, created_at) VALUES (?, ?, ?, ?, ?, ?)")
    .bind(crypto.randomUUID(), event.id, user.id, body.theme, body.description, nowSeconds()).run();
  return c.json({ success: true }, 201);
});

movieNights.put("/:id/polls/:pollId/vote", requireIdentity, async (c) => {
  const user = c.get("user");
  const member = await memberState(c.env, user.id);
  const event = await eventFor(c, member);
  const poll = await c.env.DB.prepare("SELECT * FROM movie_night_polls WHERE id = ? AND event_id = ?").bind(c.req.param("pollId"), event.id).first();
  if (!poll) throw new HttpError(404, "Poll not found.", "poll_not_found");
  if (rankFor(member.planId) < rankFor(poll.min_plan)) throw new HttpError(403, "This poll is for another membership tier.", "poll_not_eligible");
  if (poll.min_plan !== "newbie") requirePerk(member, "member_polls");
  const now = nowSeconds();
  if (now < poll.opens_at || now >= poll.closes_at || ["cancelled", "completed"].includes(eventStatus(event))) throw new HttpError(409, "This poll is not open for voting.", "poll_closed");
  const { optionId } = await jsonBody(c, z.object({ optionId: recordId }).strict());
  const option = await c.env.DB.prepare("SELECT id FROM movie_night_poll_options WHERE id = ? AND poll_id = ?").bind(optionId, poll.id).first();
  if (!option) throw new HttpError(400, "Choose an option from this poll.", "invalid_option");
  const result = await c.env.DB.prepare(`INSERT INTO movie_night_votes (poll_id, user_id, option_id, updated_at)
    SELECT ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM movie_nights WHERE id = ? AND status IN ('upcoming', 'live') AND ends_at > ?)
    ON CONFLICT(poll_id, user_id) DO UPDATE SET option_id = excluded.option_id, updated_at = excluded.updated_at`)
    .bind(poll.id, user.id, optionId, now, event.id, now).run();
  if (!result.meta.changes) throw new HttpError(409, "The event has closed.", "poll_closed");
  return c.json({ success: true });
});

export const movieNightAdmin = new Hono();
movieNightAdmin.onError(apiError);
movieNightAdmin.use("*", requireMembershipAdmin);

movieNightAdmin.get("/events", async (c) => {
  const { results } = await c.env.DB.prepare("SELECT * FROM movie_nights ORDER BY starts_at DESC LIMIT 100").all();
  return c.json({ success: true, events: results });
});

movieNightAdmin.get("/rights", async (c) => {
  const { results } = await c.env.DB.prepare(`SELECT r.*, e.title AS episode_title FROM movie_night_rights r
    JOIN episodes e ON e.id = r.episode_id ORDER BY r.created_at DESC LIMIT 100`).all();
  return c.json({ success: true, rights: results });
});

movieNightAdmin.get("/episodes", async (c) => {
  const query = String(c.req.query("q") || "").trim().slice(0, 100);
  const { results } = await c.env.DB.prepare(`SELECT e.id, e.title, s.title AS show_title FROM episodes e JOIN shows s ON s.id = e.show_id
    WHERE e.video_key IS NOT NULL AND e.video_key != '' AND (e.title LIKE ? OR s.title LIKE ? OR e.id = ?) ORDER BY s.title, e.episode_number LIMIT 50`)
    .bind(`%${query}%`, `%${query}%`, query).all();
  return c.json({ success: true, episodes: results });
});

movieNightAdmin.post("/rights", async (c) => {
  const body = await jsonBody(c, z.object({ episodeId: recordId, rightsHolder: z.string().trim().min(2).max(200), permissionReference: z.string().trim().min(5).max(1000),
    validFrom: unixTime, validUntil: unixTime, permissionVerified: z.literal(true) }).strict().refine((v) => v.validUntil > v.validFrom));
  const episode = await c.env.DB.prepare("SELECT id FROM episodes WHERE id = ? AND video_key IS NOT NULL AND video_key != ''").bind(body.episodeId).first();
  if (!episode) throw new HttpError(400, "Choose an existing catalog episode with a stream.", "invalid_episode");
  const id = crypto.randomUUID();
  await c.env.DB.prepare("INSERT INTO movie_night_rights (id, episode_id, rights_holder, permission_reference, valid_from, valid_until, approved_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
    .bind(id, body.episodeId, body.rightsHolder, body.permissionReference, body.validFrom, body.validUntil, c.get("user").id, nowSeconds()).run();
  return c.json({ success: true, id }, 201);
});

movieNightAdmin.post("/rights/:id/revoke", async (c) => {
  const result = await c.env.DB.prepare("UPDATE movie_night_rights SET revoked_at = ? WHERE id = ?").bind(nowSeconds(), c.req.param("id")).run();
  if (!result.meta.changes) throw new HttpError(404, "Permission record not found.", "rights_not_found");
  return c.json({ success: true });
});

async function validateEventRights(env, body) {
  const rights = await env.DB.prepare("SELECT * FROM movie_night_rights WHERE id = ?").bind(body.rightsId).first();
  const episode = await env.DB.prepare("SELECT video_key FROM episodes WHERE id = ?").bind(body.episodeId).first();
  if (!rights || rights.revoked_at || rights.episode_id !== body.episodeId || rights.valid_from > body.startsAt || rights.valid_until < body.endsAt || !episode?.video_key) {
    throw new HttpError(400, "A verified streaming permission must cover the selected episode and the entire event schedule.", "streaming_permission_required");
  }
}

movieNightAdmin.post("/events", async (c) => {
  const body = await jsonBody(c, eventSchema);
  await validateEventRights(c.env, body);
  const id = crypto.randomUUID();
  await c.env.DB.prepare(`INSERT INTO movie_nights (id, title, description, starts_at, ends_at, status, episode_id, rights_id, announce_at, priority_announce_at, created_by, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(id, body.title, body.description, body.startsAt, body.endsAt, body.status, body.episodeId, body.rightsId, body.announceAt, body.priorityAnnounceAt, c.get("user").id, nowSeconds()).run();
  return c.json({ success: true, id }, 201);
});

movieNightAdmin.put("/events/:id", async (c) => {
  const body = await jsonBody(c, eventSchema);
  if (!["cancelled", "completed"].includes(body.status)) await validateEventRights(c.env, body);
  const result = await c.env.DB.prepare(`UPDATE movie_nights SET title = ?, description = ?, starts_at = ?, ends_at = ?, status = ?, episode_id = ?, rights_id = ?,
    announce_at = ?, priority_announce_at = ?, updated_at = ? WHERE id = ?`)
    .bind(body.title, body.description, body.startsAt, body.endsAt, body.status, body.episodeId, body.rightsId, body.announceAt, body.priorityAnnounceAt, nowSeconds(), c.req.param("id")).run();
  if (!result.meta.changes) throw new HttpError(404, "Event not found.", "event_not_found");
  return c.json({ success: true });
});

movieNightAdmin.post("/events/:id/polls", async (c) => {
  const body = await jsonBody(c, z.object({ question: z.string().trim().min(5).max(200), minPlan: z.enum(PLANS.map((plan) => plan.id)),
    opensAt: unixTime, closesAt: unixTime, options: z.array(z.string().trim().min(1).max(100)).min(2).max(8),
  }).strict().refine((v) => v.closesAt > v.opensAt && new Set(v.options).size === v.options.length));
  const event = await c.env.DB.prepare("SELECT id, ends_at, status FROM movie_nights WHERE id = ?").bind(c.req.param("id")).first();
  if (!event || ["cancelled", "completed"].includes(event.status) || body.closesAt > event.ends_at) throw new HttpError(400, "Choose an open event and close voting before it ends.", "invalid_poll_schedule");
  const id = crypto.randomUUID();
  await c.env.DB.batch([
    c.env.DB.prepare("INSERT INTO movie_night_polls (id, event_id, question, min_plan, opens_at, closes_at, created_by) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .bind(id, event.id, body.question, body.minPlan, body.opensAt, body.closesAt, c.get("user").id),
    ...body.options.map((label, index) => c.env.DB.prepare("INSERT INTO movie_night_poll_options (id, poll_id, label, position) VALUES (?, ?, ?, ?)").bind(crypto.randomUUID(), id, label, index)),
  ]);
  return c.json({ success: true, id }, 201);
});

movieNightAdmin.get("/suggestions", async (c) => {
  const { results } = await c.env.DB.prepare(`SELECT s.*, n.title AS event_title FROM movie_night_suggestions s JOIN movie_nights n ON n.id = s.event_id ORDER BY s.created_at DESC LIMIT 100`).all();
  return c.json({ success: true, suggestions: results });
});

movieNightAdmin.patch("/suggestions/:id", async (c) => {
  const { status } = await jsonBody(c, z.object({ status: z.enum(["approved", "declined"]) }).strict());
  const result = await c.env.DB.prepare("UPDATE movie_night_suggestions SET status = ? WHERE id = ?").bind(status, c.req.param("id")).run();
  if (!result.meta.changes) throw new HttpError(404, "Suggestion not found.", "suggestion_not_found");
  return c.json({ success: true });
});
