import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { Hono } from 'hono';
import { membership } from '../src/membership/api.js';
import { account, createVerifiedSession } from '../src/membership/identity.js';
import { movieNights, movieNightAdmin } from '../src/membership/movie-nights.js';
import { stripeWebhooks } from '../src/membership/webhooks.js';
import { azureAI } from '../src/azure_api.js';
import { profiles } from '../src/profiles_api.js';
import { subtitleWorkshop } from '../src/subtitle_workshop.js';

// Adapts node:sqlite statements to the async D1-like methods used by the Worker routes.
class Statement {
  // Stores a query and its bound values until a D1-style method executes it.
  constructor(db, sql, values = []) { this.db = db; this.sql = sql; this.values = values; }
  // Creates a fresh wrapper with the supplied placeholders, matching D1's chainable bind API.
  bind(...values) { return new Statement(this.db, this.sql, values); }
  // Runs the SQL synchronously and wraps results in the shapes expected from D1.
  execute(mode = 'all') {
    const statement = this.db.prepare(this.sql);
    if (mode === 'first') return statement.get(...this.values) || null;
    if (mode === 'run') return { success: true, meta: { changes: statement.run(...this.values).changes } };
    const results = statement.all(...this.values);
    return { success: true, results, meta: { changes: this.db.prepare('SELECT changes() AS changes').get().changes } };
  }
  // Returns one row or null for SELECTs that use D1's first() method.
  async first() { return this.execute('first'); }
  // Returns all rows and change metadata in the D1-style result object.
  async all() { return this.execute(); }
  // Runs a write statement and exposes its affected-row count as D1 metadata.
  async run() { return this.execute('run'); }
}

// Creates an isolated in-memory SQLite DB, applies the app migrations, and exposes a small D1 test adapter.
export function database() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec('PRAGMA foreign_keys = ON');
  for (const name of ['0001_create_tables.sql', '0005_add_video_key.sql', '0020_profiles.sql', '0023_memberships_movie_nights.sql', '0025_episode_reviews.sql', '0026_subtitle_workshop.sql']) {
    sqlite.exec(readFileSync(new URL(`../migrations/${name}`, import.meta.url), 'utf8'));
  }
  sqlite.exec('ALTER TABLE episodes ADD COLUMN hidden INTEGER NOT NULL DEFAULT 0');
  return {
    sqlite,
    // Wraps a SQL string so tests and routes can use the adapter's bind/first/all/run methods.
    prepare(sql) { return new Statement(sqlite, sql); },
    // Applies a group of statements in one SQLite transaction and rolls back the whole batch on error.
    async batch(statements) {
      sqlite.exec('BEGIN');
      try { const results = statements.map((statement) => statement.execute()); sqlite.exec('COMMIT'); return results; }
      catch (error) { sqlite.exec('ROLLBACK'); throw error; }
    },
  };
}

// Shares the API's Unix-seconds clock for fixtures and time-sensitive assertions.
export const now = () => Math.floor(Date.now() / 1000);
export const priceId = { 'announcers-pick': 'price_announcer', 'fan-favorite': 'price_favorite', 'grand-champion': 'price_champion' };

// Supplies stable app, Stripe, and membership bindings for each isolated test database.
export function environment(DB) {
  return { DB, APP_URL: 'https://objectflix.example/', STRIPE_MODE: 'test', STRIPE_SECRET_KEY: 'sk_test_fixture',
    STRIPE_WEBHOOK_SECRET: 'whsec_fixture', STRIPE_PORTAL_CONFIGURATION_ID: 'bpc_fixture',
    STRIPE_PRICE_ANNOUNCERS_PICK: priceId['announcers-pick'], STRIPE_PRICE_FAN_FAVORITE: priceId['fan-favorite'], STRIPE_PRICE_GRAND_CHAMPION: priceId['grand-champion'],
    MEMBERSHIP_PERKS_JSON: '{}', MEMBERSHIP_ADMIN_USER_IDS_JSON: '[]' };
}

export const app = new Hono()
  .route('/api/membership', membership).route('/api/account', account)
  .route('/api/movie-nights', movieNights).route('/api/movie-night-admin', movieNightAdmin)
  .route('/api/stripe/webhook', stripeWebhooks).route('/api/ai', azureAI)
  .route('/api/profiles', profiles).route('/api/subtitle-workshop', subtitleWorkshop);

// Inserts a verified Google fixture and returns its bearer token alongside the stored user row.
export async function identity(env, id = 'viewer') {
  const session = await createVerifiedSession(env, { id, provider: 'google', email: `${id}@example.invalid`, displayName: `Viewer ${id}` });
  const user = await env.DB.prepare('SELECT * FROM account_users WHERE id = ?').bind(`google:${id}`).first();
  return { ...session, user };
}

// Calls the composed Hono app and optionally waits for waitUntil work, returning parsed JSON and task handles.
export async function request(env, path, { auth, method = 'GET', body, headers = {}, wait = true } = {}) {
  const tasks = [];
  const finalHeaders = new Headers(headers);
  if (auth) finalHeaders.set('Authorization', `Bearer ${auth.accessToken}`);
  if (body !== undefined) finalHeaders.set('Content-Type', 'application/json');
  const response = await app.fetch(new Request(`https://api.example${path}`, { method, headers: finalHeaders, body: body === undefined ? undefined : JSON.stringify(body) }), env, { waitUntil(promise) { tasks.push(promise); }, passThroughOnException() {} });
  if (wait) await Promise.all(tasks);
  return { response, data: await response.json(), tasks };
}

// Signs raw webhook bytes with the fixture secret, submits them, and waits for scheduled processing.
export async function signedEvent(env, event, { signature, raw, timestamp = now() } = {}) {
  const body = raw ?? JSON.stringify(event);
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(env.STRIPE_WEBHOOK_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const hash = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${timestamp}.${body}`));
  const hex = [...new Uint8Array(hash)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
  const tasks = [];
  const response = await app.fetch(new Request('https://api.example/api/stripe/webhook', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Stripe-Signature': signature ?? `t=${timestamp},v1=${hex}` }, body }), env, { waitUntil(promise) { tasks.push(promise); }, passThroughOnException() {} });
  await Promise.all(tasks);
  return { response, data: await response.json() };
}

// Builds a one-item monthly subscription with an invoice line paid through the current test period.
export function paidSubscription(userId, plan = 'announcers-pick', id = 'sub_fixture', customer = 'cus_fixture') {
  const price = { id: priceId[plan], recurring: { interval: 'month', interval_count: 1, usage_type: 'licensed' }, currency: 'usd' };
  return { id, customer, livemode: false, status: 'active', metadata: { objectflix_user_id: userId }, cancel_at_period_end: false, cancel_at: null,
    items: { data: [{ id: 'si_fixture', price, quantity: 1, current_period_end: now() + 3600 }] },
    latest_invoice: { id: 'in_fixture', status: 'paid', customer, parent: { subscription_details: { subscription: id } },
      lines: { data: [{ amount: 100, pricing: { price_details: { price: price.id } }, period: { start: now() - 60, end: now() + 3600 } }] } },
  };
}

// Wraps a subscription or its invoice as a Stripe webhook event with the chosen event type.
export function eventFor(subscription, type = 'customer.subscription.updated', id = crypto.randomUUID().replaceAll('-', '')) {
  const object = type.startsWith('invoice.') ? { ...subscription.latest_invoice, customer: subscription.customer } : subscription;
  return { id: `evt_${id}`, type, livemode: false, created: now(), data: { object } };
}

// Links a test user's verified ID to the Stripe customer used by the mock provider.
export async function mapCustomer(env, user, customer = 'cus_fixture') {
  await env.DB.prepare('INSERT INTO billing_customers (user_id, stripe_customer_id, livemode, created_at) VALUES (?, ?, 0, ?)').bind(user.id, customer, now()).run();
}

// Intercepts Stripe API calls with deterministic fixture responses and exposes captured requests/state.
export function stripeMock(t) {
  const state = { subscriptions: new Map(), sessions: new Map(), requests: [], failures: 0 };
  // Node's test mock restores global fetch after the test, keeping provider stubs isolated.
  t.mock.method(globalThis, 'fetch', async (input, init = {}) => {
    const url = new URL(input);
    const values = Object.fromEntries(new URLSearchParams(init.body || ''));
    state.requests.push({ url, init, values });
    if (state.failures > 0) { state.failures--; return Response.json({ error: { message: 'private provider detail' } }, { status: 500 }); }
    if (url.hostname !== 'api.stripe.com') throw new Error(`Unexpected provider host: ${url.hostname}`);
    const route = url.pathname.slice('/v1'.length);
    if (route.startsWith('/prices/')) return Response.json({ id: route.split('/').pop(), livemode: false, active: true, type: 'recurring', recurring: { interval: 'month', interval_count: 1, usage_type: 'licensed' }, currency: 'usd', unit_amount: 100, billing_scheme: 'per_unit' });
    if (route === '/customers') return Response.json({ id: 'cus_fixture', livemode: false });
    if (route === '/subscriptions') return Response.json({ data: [...state.subscriptions.values()].filter((sub) => sub.customer === url.searchParams.get('customer')), has_more: false });
    if (route.startsWith('/subscriptions/')) {
      const subscription = state.subscriptions.get(route.split('/').pop());
      return subscription ? Response.json(subscription) : Response.json({ error: {} }, { status: 404 });
    }
    if (route === '/checkout/sessions') {
      const key = init.headers['Idempotency-Key'];
      if (!state.sessions.has(key)) state.sessions.set(key, { id: `cs_test_${state.sessions.size + 1}`, status: 'open', livemode: false, url: 'https://checkout.stripe.com/c/pay/fixture' });
      return Response.json(state.sessions.get(key));
    }
    if (route.startsWith('/checkout/sessions/')) {
      const id = route.split('/')[3];
      const session = [...state.sessions.values()].find((row) => row.id === id);
      if (route.endsWith('/expire')) session.status = 'expired';
      return Response.json(session);
    }
    if (route === '/billing_portal/sessions') return Response.json({ id: 'bps_fixture', livemode: false, url: 'https://billing.stripe.com/p/session/fixture' });
    throw new Error(`Unmocked Stripe request: ${init.method} ${route}`);
  });
  return state;
}

// Bundles a fresh database, environment, authenticated viewer, and Stripe stub for membership tests.
export async function fixture(t) {
  const DB = database(); t.after(() => DB.sqlite.close());
  const env = environment(DB);
  const auth = await identity(env);
  const stripe = stripeMock(t);
  return { env, auth, stripe, DB };
}

// Grants a fixture plan through the real signed-webhook route instead of editing entitlements directly.
export async function grant(f, plan = 'announcers-pick', id = 'sub_fixture') {
  await mapCustomer(f.env, f.auth.user);
  const subscription = paidSubscription(f.auth.user.id, plan, id);
  f.stripe.subscriptions.set(id, subscription);
  await signedEvent(f.env, eventFor(subscription));
  return subscription;
}

// Creates a catalog episode, verified rights record, and Movie Night through the admin API.
export async function seedEvent(env, auth, status = 'upcoming') {
  env.MEMBERSHIP_ADMIN_USER_IDS_JSON = JSON.stringify([auth.user.id]);
  await env.DB.prepare("INSERT INTO shows (id, title) VALUES ('show_fixture', 'A permitted story')").run();
  await env.DB.prepare("INSERT INTO seasons (id, show_id, title) VALUES ('season_fixture', 'show_fixture', 'Season 1')").run();
  await env.DB.prepare("INSERT INTO episodes (id, season_id, show_id, title, video_key) VALUES ('episode_fixture', 'season_fixture', 'show_fixture', 'The first scene', 'show/episode.mp4')").run();
  const right = await request(env, '/api/movie-night-admin/rights', { auth, method: 'POST', body: { episodeId: 'episode_fixture', rightsHolder: 'Test rights holder', permissionReference: 'Test agreement reference', validFrom: now() - 3600, validUntil: now() + 86400, permissionVerified: true } });
  const body = { title: 'A test Movie Night', description: 'A licensed gathering for the whole clubhouse.', startsAt: status === 'live' ? now() - 60 : now() + 3600, endsAt: now() + 7200, status, episodeId: 'episode_fixture', rightsId: right.data.id, announceAt: now() - 120, priorityAnnounceAt: now() - 240 };
  const result = await request(env, '/api/movie-night-admin/events', { auth, method: 'POST', body });
  return { id: result.data.id, rightsId: right.data.id, body };
}
