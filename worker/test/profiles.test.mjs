// Objectflix: this is the profiles.test part, kept here so the rest of the app knows exactly where to look.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { app, database, environment, identity, now, request } from './helpers.mjs';
import { createVerifiedSession } from '../src/membership/identity.js';

async function fixture(t) {
  const DB = database();
  t.after(() => DB.sqlite.close());
  const env = environment(DB);
  const owner = await identity(env, 'profile-owner');
  const other = await identity(env, 'other-viewer');
  await DB.prepare("INSERT INTO profiles (id, account, name, avatar, class_name, created_at) VALUES (?, ?, ?, 'O', 'profile-avatar--gradient-a', 1000)")
    .bind('existing-profile', owner.user.legacy_account, 'Original profile').run();
  return { DB, env, owner, other };
}

function operations(account) {
  return [
    { path: '/api/profiles' },
    { path: `/api/profiles?account=${encodeURIComponent(account)}` },
    { path: '/api/profiles', method: 'POST', body: { account, name: 'New profile' } },
    { path: '/api/profiles/existing-profile', method: 'PATCH', body: { account, name: 'Changed profile' } },
    { path: `/api/profiles/existing-profile?account=${encodeURIComponent(account)}`, method: 'DELETE' },
  ];
}

test('profile routes reject anonymous requests before reading or modifying profiles', async (t) => {
  const f = await fixture(t);
  for (const { path, ...options } of operations(f.owner.user.legacy_account)) {
    const result = await request(f.env, path, options);
    assert.equal(result.response.status, 401, `${options.method || 'GET'} ${path}`);
    assert.equal(result.response.headers.get('Cache-Control'), 'no-store');
  }
  assert.equal((await f.DB.prepare('SELECT COUNT(*) AS count FROM profiles').first()).count, 1);
  assert.equal((await f.DB.prepare("SELECT name FROM profiles WHERE id = 'existing-profile'").first()).name, 'Original profile');
});

test('profile routes reject invalid, expired, and revoked verified sessions', async (t) => {
  const f = await fixture(t);
  const expired = await identity(f.env, 'expired-profile-viewer');
  await f.DB.prepare('UPDATE account_sessions SET expires_at = ? WHERE user_id = ?').bind(now() - 1, expired.user.id).run();
  const revoked = await identity(f.env, 'revoked-profile-viewer');
  await request(f.env, '/api/account/logout', { auth: revoked, method: 'POST' });
  for (const auth of [{ accessToken: 'invalid' }, { accessToken: 'x'.repeat(43) }, expired, revoked]) {
    for (const { path, ...options } of operations(f.owner.user.legacy_account)) {
      assert.equal((await request(f.env, path, { ...options, auth })).response.status, 401);
    }
  }
  assert.equal((await f.DB.prepare('SELECT COUNT(*) AS count FROM profiles').first()).count, 1);
});

test('verified users cannot substitute another account through query or body fields', async (t) => {
  const f = await fixture(t);
  const foreign = f.owner.user.legacy_account;
  const cases = [
    { path: `/api/profiles?account=${foreign}` },
    { path: '/api/profiles', method: 'POST', body: { account: foreign, name: 'Intruder' } },
    { path: `/api/profiles?account=${foreign}`, method: 'POST', body: { name: 'Intruder' } },
    { path: '/api/profiles/existing-profile', method: 'PATCH', body: { account: foreign, name: 'Intruder' } },
    { path: `/api/profiles/existing-profile?account=${foreign}`, method: 'PATCH', body: { account: f.other.user.legacy_account, name: 'Intruder' } },
    { path: `/api/profiles/existing-profile?account=${foreign}`, method: 'DELETE' },
  ];
  for (const { path, ...options } of cases) {
    assert.equal((await request(f.env, path, { ...options, auth: f.other })).response.status, 403);
  }
  assert.equal((await f.DB.prepare('SELECT COUNT(*) AS count FROM profiles').first()).count, 1);
  assert.equal((await f.DB.prepare("SELECT name FROM profiles WHERE id = 'existing-profile'").first()).name, 'Original profile');
});

test('knowing another profile ID never grants read, edit, or delete access', async (t) => {
  const f = await fixture(t);
  assert.deepEqual((await request(f.env, '/api/profiles', { auth: f.other })).data.profiles, []);
  for (const body of [{ name: 'Intruder' }, { account: f.other.user.legacy_account, name: 'Intruder' }]) {
    assert.equal((await request(f.env, '/api/profiles/existing-profile', { auth: f.other, method: 'PATCH', body })).response.status, 404);
  }
  assert.equal((await request(f.env, '/api/profiles/existing-profile', { auth: f.other, method: 'DELETE' })).response.status, 404);
  const ownerList = await request(f.env, '/api/profiles', { auth: f.owner });
  assert.equal(ownerList.data.profiles[0].name, 'Original profile');
  assert.equal(ownerList.response.headers.get('Cache-Control'), 'no-store');
});

test('owners can create, reload, edit, and delete profiles without supplying an account', async (t) => {
  const f = await fixture(t);
  const created = await request(f.env, '/api/profiles', { auth: f.owner, method: 'POST', body: { name: 'New viewer', avatar: 'V', className: 'profile-avatar--gradient-c', userId: f.other.user.id } });
  assert.equal(created.response.status, 201);
  const profile = created.data.profile;
  assert.equal(profile.account, f.owner.user.legacy_account);
  assert.equal(profile.className, 'profile-avatar--gradient-c');
  const signedInAgain = await identity(f.env, 'profile-owner');
  const listed = (await request(f.env, '/api/profiles', { auth: signedInAgain })).data.profiles;
  assert.equal(listed.length, 2);
  assert.ok(listed.some((entry) => entry.id === profile.id));
  const updated = await request(f.env, `/api/profiles/${profile.id}`, { auth: signedInAgain, method: 'PATCH', body: { name: 'Edited viewer' } });
  assert.equal(updated.response.status, 200);
  assert.equal(updated.data.profile.name, 'Edited viewer');
  assert.equal(updated.data.profile.avatar, 'V');
  assert.equal(updated.data.profile.account, f.owner.user.legacy_account);
  const deleted = await request(f.env, `/api/profiles/${profile.id}`, { auth: signedInAgain, method: 'DELETE' });
  assert.equal(deleted.response.status, 200);
  assert.equal((await request(f.env, '/api/profiles', { auth: signedInAgain })).data.profiles.length, 1);
  assert.equal((await request(f.env, `/api/profiles/${profile.id}`, { auth: signedInAgain, method: 'DELETE' })).response.status, 404);
});

test('verified Google and Discord owners can access their existing legacy-keyed profiles', async (t) => {
  const f = await fixture(t);
  const google = await request(f.env, `/api/profiles?account=${f.owner.user.legacy_account.toUpperCase()}`, { auth: f.owner });
  assert.equal(google.response.status, 200);
  assert.equal(google.data.profiles[0].id, 'existing-profile');
  const discord = await createVerifiedSession(f.env, { provider: 'discord', id: '123456789', email: 'discord-viewer@example.invalid', displayName: 'Discord viewer' });
  await f.DB.prepare("INSERT INTO profiles (id, account, name, avatar, class_name, created_at) VALUES ('discord-profile', 'discord:123456789', 'Discord profile', 'D', 'profile-avatar--gradient-b', 1000)").run();
  const listed = await request(f.env, '/api/profiles', { auth: discord });
  assert.deepEqual(listed.data.profiles.map((profile) => profile.id), ['discord-profile']);
  const updated = await request(f.env, '/api/profiles/discord-profile', { auth: discord, method: 'PATCH', body: { account: 'discord:123456789', name: 'Renamed' } });
  assert.equal(updated.response.status, 200);
  assert.equal(updated.data.profile.account, 'discord:123456789');
});

test('malformed profile bodies are rejected without changing owner data', async (t) => {
  const f = await fixture(t);
  for (const body of [null, [], 'invalid']) {
    for (const [path, method] of [['/api/profiles', 'POST'], ['/api/profiles/existing-profile', 'PATCH']]) {
      assert.equal((await request(f.env, path, { auth: f.owner, method, body })).response.status, 400);
    }
  }
  assert.equal((await f.DB.prepare('SELECT COUNT(*) AS count FROM profiles').first()).count, 1);
});

test('the profile limit is scoped to the verified owner', async (t) => {
  const f = await fixture(t);
  for (let i = 0; i < 3; i++) {
    assert.equal((await request(f.env, '/api/profiles', { auth: f.owner, method: 'POST', body: { name: `Viewer ${i}` } })).response.status, 201);
  }
  assert.equal((await request(f.env, '/api/profiles', { auth: f.owner, method: 'POST', body: { name: 'One too many' } })).response.status, 409);
  assert.equal((await request(f.env, '/api/profiles', { auth: f.other, method: 'POST', body: { name: 'Other account' } })).response.status, 201);
  assert.equal((await request(f.env, '/api/profiles', { auth: f.owner })).data.profiles.length, 4);
});

function browserClient(env, auth) {
  const store = () => {
    const data = new Map();
    return { getItem(key) { return data.get(key) ?? null; }, setItem(key, value) { data.set(key, String(value)); }, removeItem(key) { data.delete(key); } };
  };
  const localStorage = store();
  const sessionStorage = store();
  localStorage.setItem('objectflix_current_user', JSON.stringify(auth ? { provider: auth.user.provider, id: auth.user.provider_id, email: auth.user.email } : { email: 'profile-owner@example.invalid' }));
  if (auth) sessionStorage.setItem('objectflix_verified_session', JSON.stringify({ accessToken: auth.accessToken, expiresAt: auth.expiresAt, userId: auth.user.id }));
  const requests = [];
  const context = vm.createContext({
    window: { __OBJECTFLIX_ENV__: { OBJECTFLIX_API_BASE_URL: 'https://api.example' }, addEventListener() {} },
    document: { readyState: 'loading', addEventListener() {}, querySelectorAll() { return []; } },
    localStorage, sessionStorage, AbortController, AbortSignal, setTimeout, clearTimeout,
    fetch(input, init) {
      requests.push({ url: new URL(input), init });
      return app.fetch(new Request(input, init), env);
    },
  });
  for (const file of ['config.js', 'api.js', 'membership-client.js']) {
    vm.runInContext(readFileSync(new URL(`../../src/${file}`, import.meta.url), 'utf8'), context, { filename: file });
  }
  return { api: context.window.OBJECTFLIX_API, localStorage, sessionStorage, requests };
}

test('the browser profile client uses verified bearer credentials for every operation', async (t) => {
  const f = await fixture(t);
  const client = browserClient(f.env, f.owner);
  const created = await client.api.createProfile({ name: 'Browser viewer' });
  assert.equal(created.account, f.owner.user.legacy_account);
  assert.ok((await client.api.listProfiles()).some((profile) => profile.id === created.id));
  assert.equal((await client.api.updateProfile(created.id, { name: 'Browser edit' })).name, 'Browser edit');
  await client.api.deleteProfile(created.id);
  assert.equal((await client.api.listProfiles()).length, 1);
  assert.equal(client.requests.length, 5);
  for (const { url, init } of client.requests) {
    assert.equal(init.headers.Authorization, `Bearer ${f.owner.accessToken}`);
    assert.equal(init.cache, 'no-store');
    assert.equal(url.search, '');
    assert.equal(Object.hasOwn(JSON.parse(init.body || '{}'), 'account'), false);
  }
});

test('browser-only and account-mismatched sessions cannot initiate profile requests', async (t) => {
  const f = await fixture(t);
  const localOnly = browserClient(f.env);
  await assert.rejects(localOnly.api.listProfiles(), (error) => error.status === 401);
  assert.equal(localOnly.requests.length, 0);
  const switched = browserClient(f.env, f.owner);
  switched.localStorage.setItem('objectflix_current_user', JSON.stringify({ provider: 'google', id: f.other.user.provider_id, email: f.other.user.email }));
  await assert.rejects(switched.api.createProfile({ name: 'Wrong session' }), (error) => error.status === 401);
  assert.equal(switched.requests.length, 0);
});

test('a server-revoked profile session is discarded by the browser client', async (t) => {
  const f = await fixture(t);
  const client = browserClient(f.env, f.owner);
  await request(f.env, '/api/account/logout', { auth: f.owner, method: 'POST' });
  await assert.rejects(client.api.listProfiles(), (error) => error.status === 401);
  assert.equal(client.sessionStorage.getItem('objectflix_verified_session'), null);
});
