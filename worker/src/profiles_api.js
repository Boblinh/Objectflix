import { Hono } from "hono";

// Viewer profiles, stored in D1 and keyed by the signed-in account identity
// (email for password accounts, "discord:<id>" for Discord sessions).
// Same open-access model as the community endpoints: the frontend's auth is
// local, so the API cannot verify ownership beyond including the account key.

const MAX_PROFILES_PER_ACCOUNT = 4;
const AVATAR_CLASSES = new Set([
	"profile-avatar--gradient-a",
	"profile-avatar--gradient-b",
	"profile-avatar--gradient-c",
	"profile-avatar--gradient-d",
]);

function clean(value, max) {
	const text = String(value ?? "").trim();
	return text ? text.slice(0, max) : null;
}

function accountKey(value) {
	const key = clean(value, 200);
	if (!key) return null;
	return key.toLowerCase() === "discord" || key.includes("discord:")
		? key
		: key.toLowerCase();
}

function profileRow(row) {
	return {
		id: row.id,
		account: row.account,
		name: row.name,
		avatar: row.avatar,
		className: row.class_name,
		createdAt: row.created_at,
	};
}

export const profiles = new Hono();

profiles.get("/", async (c) => {
	const account = accountKey(c.req.query("account"));
	if (!account) {
		return c.json({ error: "An account query parameter is required." }, 400);
	}

	const { results } = await c.env.DB.prepare(
		"SELECT * FROM profiles WHERE account = ? ORDER BY created_at ASC LIMIT 8"
	)
		.bind(account)
		.all();

	return c.json({ success: true, profiles: results.map(profileRow) });
});

profiles.post("/", async (c) => {
	let body;
	try {
		body = await c.req.json();
	} catch {
		return c.json({ error: "Request body must be JSON." }, 400);
	}

	const account = accountKey(body.account);
	const name = clean(body.name, 30);
	if (!account || !name) {
		return c.json({ error: "An account and a profile name are required." }, 400);
	}

	const avatar = clean(body.avatar, 1) || name[0].toUpperCase();
	const className = AVATAR_CLASSES.has(body.className) ? body.className : "profile-avatar--gradient-a";

	const existing = await c.env.DB.prepare(
		"SELECT id FROM profiles WHERE account = ?"
	)
		.bind(account)
		.all();
	if ((existing.results || []).length >= MAX_PROFILES_PER_ACCOUNT) {
		return c.json({ error: `Each account can have at most ${MAX_PROFILES_PER_ACCOUNT} profiles.` }, 409);
	}

	const entry = {
		id: crypto.randomUUID(),
		account,
		name,
		avatar,
		className,
		createdAt: Date.now(),
	};

	await c.env.DB.prepare(
		"INSERT INTO profiles (id, account, name, avatar, class_name, created_at) VALUES (?, ?, ?, ?, ?, ?)"
	)
		.bind(entry.id, entry.account, entry.name, entry.avatar, entry.className, entry.createdAt)
		.run();

	return c.json({ success: true, profile: entry }, 201);
});

profiles.patch("/:id", async (c) => {
	let body;
	try {
		body = await c.req.json();
	} catch {
		return c.json({ error: "Request body must be JSON." }, 400);
	}

	const account = accountKey(body.account);
	if (!account) {
		return c.json({ error: "An account is required." }, 400);
	}

	const name = clean(body.name, 30);
	const avatar = clean(body.avatar, 1);
	const className = AVATAR_CLASSES.has(body.className) ? body.className : null;
	if (!name && !avatar && !className) {
		return c.json({ error: "Nothing to update." }, 400);
	}

	const row = await c.env.DB.prepare("SELECT * FROM profiles WHERE id = ?")
		.bind(c.req.param("id"))
		.first();
	if (!row || row.account !== account) {
		return c.json({ error: "Profile not found." }, 404);
	}

	const updated = {
		name: name || row.name,
		avatar: avatar || row.avatar,
		className: className || row.class_name,
	};

	const result = await c.env.DB.prepare(
		"UPDATE profiles SET name = ?, avatar = ?, class_name = ? WHERE id = ?"
	)
		.bind(updated.name, updated.avatar, updated.className, row.id)
		.run();
	if (!result.meta.changes) return c.json({ error: "Profile not found." }, 404);

	return c.json({ success: true, profile: profileRow({ ...row, ...updated, class_name: updated.className }) });
});

profiles.delete("/:id", async (c) => {
	const account = accountKey(c.req.query("account"));
	if (!account) {
		return c.json({ error: "An account query parameter is required." }, 400);
	}

	const row = await c.env.DB.prepare("SELECT * FROM profiles WHERE id = ?")
		.bind(c.req.param("id"))
		.first();
	if (!row || row.account !== account) {
		return c.json({ error: "Profile not found." }, 404);
	}

	await c.env.DB.prepare("DELETE FROM profiles WHERE id = ?").bind(row.id).run();
	return c.json({ success: true });
});
