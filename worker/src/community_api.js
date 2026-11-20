import { Hono } from "hono";

const REQUEST_TYPES = new Set(["show", "episode"]);
const REQUEST_STATUSES = new Set(["pending", "approved", "rejected", "completed"]);
const FEEDBACK_CATEGORIES = new Set([
	"General",
	"Bug Report",
	"Feature Idea",
	"Content Suggestion",
	"Compliment",
	"Other",
]);
const FEEDBACK_STATUSES = new Set(["new", "read"]);

function clean(value, max) {
	const text = String(value ?? "").trim();
	return text ? text.slice(0, max) : null;
}

function requestRow(row) {
	return {
		id: row.id,
		type: row.type,
		title: row.title,
		episodeNumber: row.episode_number ?? "",
		link: row.link ?? "",
		notes: row.notes ?? "",
		requestedBy: row.requested_by ?? "",
		status: row.status,
		createdAt: row.created_at,
	};
}

function feedbackRow(row) {
	return {
		id: row.id,
		rating: row.rating,
		category: row.category,
		discord: row.discord ?? "",
		message: row.message,
		sentBy: row.sent_by ?? "",
		status: row.status,
		createdAt: row.created_at,
	};
}

export const publicCommunity = new Hono();

publicCommunity.post("/requests", async (c) => {
	let body;
	try {
		body = await c.req.json();
	} catch {
		return c.json({ error: "Request body must be JSON." }, 400);
	}

	const type = REQUEST_TYPES.has(body.type) ? body.type : null;
	const title = clean(body.title, 160);
	if (!type || !title) {
		return c.json({ error: "A request type and a title are required." }, 400);
	}

	const link = clean(body.link, 400);
  if (link && !/^https?:\/\//) {
		return c.json({ error: "Link must start with http:// or https://." }, 400);
	}

	const entry = {
		id: crypto.randomUUID(),
		type,
		title,
		episodeNumber: type === "episode" ? clean(body.episodeNumber, 160) : null,
		link,
		notes: clean(body.notes, 2000),
		requestedBy: clean(body.requestedBy, 120),
		createdAt: Date.now(),
	};

	await c.env.DB.prepare(
		"INSERT INTO community_requests (id, type, title, episode_number, link, notes, requested_by, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?)"
	)
		.bind(entry.id, entry.type, entry.title, entry.episodeNumber, entry.link, entry.notes, entry.requestedBy, entry.createdAt)
		.run();

	return c.json({ success: true, request: { ...entry, status: "pending" } }, 201);
});

publicCommunity.post("/feedback", async (c) => {
	let body;
	try {
		body = await c.req.json();
	} catch {
		return c.json({ error: "Request body must be JSON." }, 400);
	}

	const rating = Number(body.rating);
	if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
		return c.json({ error: "Rating must be an integer from 1 to 5." }, 400);
	}

	const message = clean(body.message, 2000);
	if (!message) {
		return c.json({ error: "A feedback message is required." }, 400);
	}

	const category = FEEDBACK_CATEGORIES.has(body.category) ? body.category : "General";

	const entry = {
		id: crypto.randomUUID(),
		rating,
		category,
		discord: clean(body.discord, 80),
		message,
		sentBy: clean(body.sentBy, 120),
		createdAt: Date.now(),
	};

	await c.env.DB.prepare(
		"INSERT INTO community_feedback (id, rating, category, discord, message, sent_by, status, created_at) VALUES (?, ?, ?, ?, ?, ?, 'new', ?)"
	)
		.bind(entry.id, entry.rating, entry.category, entry.discord, entry.message, entry.sentBy, entry.createdAt)
		.run();

	return c.json({ success: true, feedback: { ...entry, status: "new" } }, 201);
});

function reviewRow(row) {
	return {
		id: row.id,
		episodeId: row.episode_id,
		rating: row.rating,
		body: row.body,
		authorName: row.author_name,
		authorType: row.author_type,
		userId: row.user_id ?? null,
		createdAt: row.created_at,
	};
}

publicCommunity.get("/reviews", async (c) => {
	const episodeId = clean(c.req.query("episodeId"), 120);
	if (!episodeId) return c.json({ error: "episodeId is required." }, 400);

	const { results } = await c.env.DB.prepare(
		"SELECT * FROM episode_reviews WHERE episode_id = ? ORDER BY created_at DESC LIMIT 100"
	)
		.bind(episodeId)
		.all();

	const reviews = results.map(reviewRow);
	const average = reviews.length
		? Math.round((reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length) * 10) / 10
		: null;

	return c.json({ success: true, reviews, average, count: reviews.length });
});

publicCommunity.post("/reviews", async (c) => {
	let body;
	try {
		body = await c.req.json();
	} catch {
		return c.json({ error: "Request body must be JSON." }, 400);
	}

	const episodeId = clean(body.episodeId, 120);
	if (!episodeId) return c.json({ error: "episodeId is required." }, 400);

	const rating = Number(body.rating);
	if (!Number.isInteger(rating) || rating < 1 || rating > 10) {
		return c.json({ error: "Rating must be an integer from 1 to 10." }, 400);
	}

	const message = clean(body.body, 2000);
	if (!message) return c.json({ error: "A review message is required." }, 400);

	const authorType = body.authorType === "account" ? "account" : "guest";
	const authorName = clean(body.authorName, 80) || (authorType === "guest" ? "Guest" : "Viewer");

	const entry = {
		id: crypto.randomUUID(),
		episodeId,
		rating,
		body: message,
		authorName,
		authorType,
		userId: authorType === "account" ? clean(body.userId, 120) : null,
		createdAt: Date.now(),
	};

	await c.env.DB.prepare(
		"INSERT INTO episode_reviews (id, episode_id, rating, body, author_name, author_type, user_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
	)
		.bind(entry.id, entry.episodeId, entry.rating, entry.body, entry.authorName, entry.authorType, entry.userId, entry.createdAt)
		.run();

	return c.json({ success: true, review: { ...entry } }, 201);
});

export const adminCommunity = new Hono();

adminCommunity.get("/requests", async (c) => {
	const status = c.req.query("status");
	let sql = "SELECT * FROM community_requests";
	const params = [];
	if (status && REQUEST_STATUSES.has(status)) {
		sql += " WHERE status = ?";
		params.push(status);
	}
	sql += " ORDER BY created_at DESC LIMIT 500";

	const { results } = await c.env.DB.prepare(sql)
		.bind(...params)
		.all();
	return c.json({ success: true, requests: results.map(requestRow) });
});

adminCommunity.patch("/requests/:id", async (c) => {
	let body;
	try {
		body = await c.req.json();
	} catch {
		return c.json({ error: "Request body must be JSON." }, 400);
	}
	if (!REQUEST_STATUSES.has(body.status)) {
		return c.json({ error: `Status must be one of: ${[...REQUEST_STATUSES].join(", ")}.` }, 400);
	}
	const result = await c.env.DB.prepare("UPDATE community_requests SET status = ? WHERE id = ?")
		.bind(body.status, c.req.param("id"))
		.run();
	if (!result.meta.changes) return c.json({ error: "Request not found." }, 404);
	return c.json({ success: true });
});

adminCommunity.delete("/requests/:id", async (c) => {
	const result = await c.env.DB.prepare("DELETE FROM community_requests WHERE id = ?")
		.bind(c.req.param("id"))
		.run();
	if (!result.meta.changes) return c.json({ error: "Request not found." }, 404);
	return c.json({ success: true });
});

adminCommunity.get("/feedback", async (c) => {
	const status = c.req.query("status");
	let sql = "SELECT * FROM community_feedback";
	const params = [];
	if (status && FEEDBACK_STATUSES.has(status)) {
		sql += " WHERE status = ?";
		params.push(status);
	}
	sql += " ORDER BY created_at DESC LIMIT 500";

	const { results } = await c.env.DB.prepare(sql)
		.bind(...params)
		.all();
	return c.json({ success: true, feedback: results.map(feedbackRow) });
});

adminCommunity.patch("/feedback/:id", async (c) => {
	let body;
	try {
		body = await c.req.json();
	} catch {
		return c.json({ error: "Request body must be JSON." }, 400);
	}
	if (!FEEDBACK_STATUSES.has(body.status)) {
		return c.json({ error: `Status must be one of: ${[...FEEDBACK_STATUSES].join(", ")}.` }, 400);
	}
	const result = await c.env.DB.prepare("UPDATE community_feedback SET status = ? WHERE id = ?")
		.bind(body.status, c.req.param("id"))
		.run();
	if (!result.meta.changes) return c.json({ error: "Feedback not found." }, 404);
	return c.json({ success: true });
});

adminCommunity.delete("/feedback/:id", async (c) => {
	const result = await c.env.DB.prepare("DELETE FROM community_feedback WHERE id = ?")
		.bind(c.req.param("id"))
		.run();
	if (!result.meta.changes) return c.json({ error: "Feedback not found." }, 404);
	return c.json({ success: true });
});

adminCommunity.get("/reviews", async (c) => {
	const episodeId = c.req.query("episodeId");
	let sql = "SELECT * FROM episode_reviews";
	const params = [];
	if (episodeId) { sql += " WHERE episode_id = ?"; params.push(episodeId); }
	sql += " ORDER BY created_at DESC LIMIT 500";
	const { results } = await c.env.DB.prepare(sql).bind(...params).all();
	return c.json({ success: true, reviews: results.map(reviewRow) });
});

adminCommunity.delete("/reviews/:id", async (c) => {
	const result = await c.env.DB.prepare("DELETE FROM episode_reviews WHERE id = ?")
		.bind(c.req.param("id"))
		.run();
	if (!result.meta.changes) return c.json({ error: "Review not found." }, 404);
	return c.json({ success: true });
});
