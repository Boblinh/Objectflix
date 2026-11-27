// Objectflix: this is the profiles_api part, kept here so the rest of the app knows exactly where to look.
import { Hono } from "hono";
import { HttpError, apiError } from "./membership/http.js";
import { requireIdentity } from "./membership/identity.js";

const MAX_PROFILES_PER_ACCOUNT = 4;
const AVATAR_CLASSES = new Set([
	"profile-avatar--gradient-a",
	"profile-avatar--gradient-b",
	"profile-avatar--gradient-c",
	"profile-avatar--gradient-d",
]);

// Trims a value, limits its length, and uses null for empty input.
function clean(value, max) {
	const text = String(value ?? "").trim();
	return text ? text.slice(0, max) : null;
}

// Confirms account claims match the signed-in user's verified legacy account.
function profileAccount(c, suppliedAccount) {
	const user = c.get("user");
	
	const account = user.legacy_account;
	if (typeof account !== "string" || !account) {
		throw new HttpError(403, "This account is not available for profiles.", "account_unavailable");
	}
	for (const claim of [c.req.query("account"), suppliedAccount]) {
		if (claim === undefined) continue;
		const normalized = typeof claim === "string"
			? (user.provider === "google" ? claim.trim().toLowerCase() : claim.trim())
			: null;
		if (normalized !== account) {
			throw new HttpError(403, "Profiles can only be accessed through their verified owner.", "account_mismatch");
		}
	}
	return account;
}

// Converts a database profile row to the API's camel-case response shape.
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
profiles.onError(apiError);
profiles.use("*", async (c, next) => {
	c.header("Cache-Control", "no-store");
	await requireIdentity(c, next);
});

// Lists profiles only for the signed-in user's verified account.
profiles.get("/", async (c) => {
	const account = profileAccount(c);

	const { results } = await c.env.DB.prepare(
		"SELECT * FROM profiles WHERE account = ? ORDER BY created_at ASC LIMIT 8"
	)
		.bind(account)
		.all();

	return c.json({ success: true, profiles: results.map(profileRow) });
});

// Validates profile fields and account ownership before creating a profile within the account limit.
profiles.post("/", async (c) => {
	let body;
	try {
		body = await c.req.json();
	} catch {
		return c.json({ error: "Request body must be JSON." }, 400);
	}
	if (!body || typeof body !== "object" || Array.isArray(body)) {
		return c.json({ error: "Request body must be a JSON object." }, 400);
	}

	const account = profileAccount(c, body.account);
	const name = clean(body.name, 30);
	if (!name) {
		return c.json({ error: "A profile name is required." }, 400);
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

// Updates allowed fields only when the profile belongs to the signed-in user's verified account.
profiles.patch("/:id", async (c) => {
	let body;
	try {
		body = await c.req.json();
	} catch {
		return c.json({ error: "Request body must be JSON." }, 400);
	}
	if (!body || typeof body !== "object" || Array.isArray(body)) {
		return c.json({ error: "Request body must be a JSON object." }, 400);
	}

	const account = profileAccount(c, body.account);
	const name = clean(body.name, 30);
	const avatar = clean(body.avatar, 1);
	const className = AVATAR_CLASSES.has(body.className) ? body.className : null;
	if (!name && !avatar && !className) {
		return c.json({ error: "Nothing to update." }, 400);
	}

	const row = await c.env.DB.prepare("SELECT * FROM profiles WHERE id = ? AND account = ?")
		.bind(c.req.param("id"), account)
		.first();
	if (!row) {
		return c.json({ error: "Profile not found." }, 404);
	}

	const updated = {
		name: name || row.name,
		avatar: avatar || row.avatar,
		className: className || row.class_name,
	};

	const result = await c.env.DB.prepare(
		"UPDATE profiles SET name = ?, avatar = ?, class_name = ? WHERE id = ? AND account = ?"
	)
		.bind(updated.name, updated.avatar, updated.className, row.id, account)
		.run();
	if (!result.meta.changes) return c.json({ error: "Profile not found." }, 404);

	return c.json({ success: true, profile: profileRow({ ...row, ...updated, class_name: updated.className }) });
});

// Deletes a profile only within the signed-in user's verified account.
profiles.delete("/:id", async (c) => {
	const account = profileAccount(c);
	const result = await c.env.DB.prepare("DELETE FROM profiles WHERE id = ? AND account = ?")
		.bind(c.req.param("id"), account)
		.run();
	if (!result.meta.changes) {
		return c.json({ error: "Profile not found." }, 404);
	}

	return c.json({ success: true });
});
