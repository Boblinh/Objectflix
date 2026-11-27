// Objectflix: this is the membership.test part, kept here so the rest of the app knows exactly where to look.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fixture, request, identity, now, grant, signedEvent, eventFor, paidSubscription, mapCustomer, priceId, seedEvent } from './helpers.mjs';
import { effectivePlan, entitlementsFor } from '../src/membership/config.js';
import { processPendingWebhooks } from '../src/membership/webhooks.js';
import { verifyStripeSignature } from '../src/membership/stripe.js';

test('membership plans are public; protected operations reject browser-only identities', async (t) => {
  const f = await fixture(t);
  assert.equal((await request(f.env, '/api/membership/plans')).data.plans.length, 4);
  for (const path of ['/api/membership/me', '/api/membership/checkout', '/api/membership/portal']) {
    const result = await request(f.env, path, { method: path.endsWith('/me') ? 'GET' : 'POST', body: path.endsWith('/me') ? undefined : { planId: 'grand-champion', userId: f.auth.user.id } });
    assert.equal(result.response.status, 401);
  }
  assert.equal((await request(f.env, '/api/membership/me', { auth: f.auth })).data.membership.planId, 'newbie');
});

test('sessions expire and can be revoked; billing identity is the verified provider subject', async (t) => {
  const f = await fixture(t);
  const me = await request(f.env, '/api/account/session', { auth: f.auth });
  assert.equal(me.data.user.id, f.auth.user.id);
  await request(f.env, '/api/account/logout', { auth: f.auth, method: 'POST' });
  assert.equal((await request(f.env, '/api/membership/me', { auth: f.auth })).response.status, 401);
  const expired = await identity(f.env, 'expired');
  await f.DB.prepare('UPDATE account_sessions SET expires_at = ?').bind(now() - 1).run();
  assert.equal((await request(f.env, '/api/membership/me', { auth: expired })).response.status, 401);
});

test('unconfigured Stripe exposes no invented prices and rejects checkout', async (t) => {
  const f = await fixture(t); f.env.STRIPE_SECRET_KEY = '';
  const plans = (await request(f.env, '/api/membership/plans')).data.plans;
  assert.ok(plans.filter((p) => !p.free).every((p) => p.price === null && p.checkoutAvailable === false));
  assert.equal((await request(f.env, '/api/membership/checkout', { auth: f.auth, method: 'POST', body: { planId: 'announcers-pick' } })).response.status, 503);
  assert.equal(f.stripe.requests.length, 0);
});

test('Checkout uses the configured price, verified customer, and one reusable session', async (t) => {
  const f = await fixture(t);
  const options = { auth: f.auth, method: 'POST', body: { planId: 'announcers-pick' } };
  const first = await request(f.env, '/api/membership/checkout', options);
  const second = await request(f.env, '/api/membership/checkout', options);
  assert.equal(first.response.status, 200); assert.equal(first.data.url, second.data.url);
  assert.equal(f.stripe.sessions.size, 1);
  const creation = f.stripe.requests.find((r) => r.url.pathname === '/v1/checkout/sessions');
  assert.equal(creation.values['line_items[0][price]'], 'price_announcer');
  assert.equal(creation.values['subscription_data[metadata][objectflix_user_id]'], f.auth.user.id);
  assert.equal(creation.values.mode, 'subscription');
  assert.equal((await request(f.env, '/api/membership/me', { auth: f.auth })).data.membership.planId, 'newbie');
});

test('tampered prices, tiers, customer IDs, return URLs and cross-origin checkout are rejected', async (t) => {
  const f = await fixture(t);
  for (const extra of [{ price: 'price_free' }, { userId: 'someone-else' }, { customer: 'cus_other' }, { successUrl: 'https://evil.example' }, { paid: true }]) {
    const result = await request(f.env, '/api/membership/checkout', { auth: f.auth, method: 'POST', body: { planId: 'announcers-pick', ...extra } });
    assert.equal(result.response.status, 400);
  }
  assert.equal((await request(f.env, '/api/membership/checkout', { auth: f.auth, method: 'POST', body: { planId: 'invented-tier' } })).response.status, 400);
  assert.equal((await request(f.env, '/api/membership/checkout', { auth: f.auth, method: 'POST', headers: { Origin: 'https://evil.example' }, body: { planId: 'announcers-pick' } })).response.status, 403);
  assert.equal(f.stripe.requests.length, 0);
});

test('Objectflix GitHub Pages origin is allowed for billing requests', async (t) => {
  const f = await fixture(t);
  const result = await request(f.env, '/api/membership/checkout', {
    auth: f.auth,
    method: 'POST',
    headers: { Origin: 'https://boblinh.github.io' },
    body: { planId: 'announcers-pick' },
  });
  assert.equal(result.response.status, 200);
  const creation = f.stripe.requests.find((r) => r.url.pathname === '/v1/checkout/sessions');
  assert.equal(creation.values['success_url'], 'https://boblinh.github.io/Objectflix/membership.html?checkout=returned');
});

test('concurrent checkout cannot create two subscriptions or two open sessions', async (t) => {
  const f = await fixture(t);
  const results = await Promise.all([1, 2, 3].map(() => request(f.env, '/api/membership/checkout', { auth: f.auth, method: 'POST', body: { planId: 'announcers-pick' } })));
  assert.ok(results.some((r) => r.response.status === 200));
  assert.ok(results.every((r) => [200, 409].includes(r.response.status)));
  assert.equal(f.stripe.sessions.size, 1);
  f.stripe.subscriptions.set('sub_pending', { ...paidSubscription(f.auth.user.id), id: 'sub_pending', status: 'incomplete' });
  assert.equal((await request(f.env, '/api/membership/checkout', { auth: f.auth, method: 'POST', body: { planId: 'fan-favorite' } })).data.code, 'subscription_exists');
});

test('changing an uncompleted checkout expires the former session before opening another', async (t) => {
  const f = await fixture(t);
  await request(f.env, '/api/membership/checkout', { auth: f.auth, method: 'POST', body: { planId: 'announcers-pick' } });
  const result = await request(f.env, '/api/membership/checkout', { auth: f.auth, method: 'POST', body: { planId: 'fan-favorite' } });
  assert.equal(result.response.status, 200);
  assert.equal([...f.stripe.sessions.values()].filter((s) => s.status === 'open').length, 1);
});

test('a member can subscribe again after cancellation even if an old completed checkout was retained', async (t) => {
  const f = await fixture(t);
  const options = { auth: f.auth, method: 'POST', body: { planId: 'announcers-pick' } };
  assert.equal((await request(f.env, '/api/membership/checkout', options)).response.status, 200);
  const session = [...f.stripe.sessions.values()][0];
  const sub = paidSubscription(f.auth.user.id); f.stripe.subscriptions.set(sub.id, sub);
  session.status = 'complete'; session.subscription = sub.id;
  await signedEvent(f.env, eventFor(sub));
  sub.status = 'canceled'; await signedEvent(f.env, eventFor(sub, 'customer.subscription.deleted'));
  assert.equal((await request(f.env, '/api/membership/checkout', options)).response.status, 200);
  assert.equal([...f.stripe.sessions.values()].filter((row) => row.status === 'open').length, 1);
});

test('forged, stale, future and modified webhook signatures are rejected before persistence', async (t) => {
  const f = await fixture(t); const sub = paidSubscription(f.auth.user.id);
  const event = eventFor(sub);
  for (const options of [{ signature: `t=${now()},v1=${'0'.repeat(64)}` }, { timestamp: now() - 301 }, { timestamp: now() + 301 }]) {
    assert.equal((await signedEvent(f.env, event, options)).response.status, 400);
  }
  await assert.rejects(verifyStripeSignature('modified body', `t=${now()},v1=${'a'.repeat(64)}`, f.env));
  assert.equal((await f.DB.prepare('SELECT COUNT(*) AS count FROM stripe_webhook_events').first()).count, 0);
});

test('mode mismatches are rejected, and one-time contributions never grant membership', async (t) => {
  const f = await fixture(t);
  const event = eventFor(paidSubscription(f.auth.user.id)); event.livemode = true;
  assert.equal((await signedEvent(f.env, event)).response.status, 400);
  const donation = { id: 'evt_donation', type: 'checkout.session.completed', livemode: false, data: { object: { id: 'cs_donation', mode: 'payment', customer: 'cus_fixture', metadata: { planId: 'grand-champion' } } } };
  assert.equal((await signedEvent(f.env, donation)).response.status, 200);
  assert.equal((await request(f.env, '/api/membership/me', { auth: f.auth })).data.membership.planId, 'newbie');
  assert.equal((await f.DB.prepare("SELECT state FROM stripe_webhook_events WHERE event_id = 'evt_donation'").first()).state, 'ignored');
});

test('incomplete and delayed initial payments stay free until a verified paid invoice', async (t) => {
  const f = await fixture(t); await mapCustomer(f.env, f.auth.user);
  const sub = paidSubscription(f.auth.user.id); sub.status = 'incomplete'; sub.latest_invoice.status = 'open';
  f.stripe.subscriptions.set(sub.id, sub);
  await signedEvent(f.env, eventFor(sub, 'customer.subscription.created'));
  assert.equal((await request(f.env, '/api/membership/me', { auth: f.auth })).data.membership.planId, 'newbie');
  sub.status = 'active';
  const checkout = { id: 'evt_checkout', type: 'checkout.session.completed', livemode: false, data: { object: { id: 'cs_paid', customer: sub.customer, subscription: sub.id, mode: 'subscription', payment_status: 'unpaid' } } };
  await signedEvent(f.env, checkout);
  assert.equal((await request(f.env, '/api/membership/me', { auth: f.auth })).data.membership.planId, 'newbie');
  sub.latest_invoice.status = 'paid';
  await signedEvent(f.env, eventFor(sub, 'invoice.paid'));
  assert.equal((await request(f.env, '/api/membership/me', { auth: f.auth })).data.membership.planId, 'announcers-pick');
});

test('duplicate deliveries are idempotent and event timestamps are not treated as ordering', async (t) => {
  const f = await fixture(t); await mapCustomer(f.env, f.auth.user);
  const sub = paidSubscription(f.auth.user.id); f.stripe.subscriptions.set(sub.id, sub);
  const event = eventFor(sub);
  await Promise.all([signedEvent(f.env, event), signedEvent(f.env, event)]);
  assert.equal((await f.DB.prepare('SELECT COUNT(*) AS count FROM billing_subscriptions').first()).count, 1);
  assert.equal((await f.DB.prepare('SELECT COUNT(*) AS count FROM stripe_webhook_events').first()).count, 1);
  const stale = eventFor(sub, 'customer.subscription.created'); stale.created = event.created;
  sub.status = 'canceled';
  await signedEvent(f.env, stale);
  assert.equal((await request(f.env, '/api/membership/me', { auth: f.auth })).data.membership.planId, 'newbie');
});

test('successful renewals extend access; failed renewals do not manufacture a paid period', async (t) => {
  const f = await fixture(t); const sub = await grant(f);
  const initial = (await request(f.env, '/api/membership/me', { auth: f.auth })).data.membership.billing.paidThrough;
  sub.items.data[0].current_period_end += 10000; sub.latest_invoice.lines.data[0].period.end += 10000;
  sub.status = 'past_due'; sub.latest_invoice.status = 'open';
  await signedEvent(f.env, eventFor(sub, 'invoice.payment_failed'));
  assert.equal((await request(f.env, '/api/membership/me', { auth: f.auth })).data.membership.billing.paidThrough, initial);
  sub.status = 'active'; sub.latest_invoice.status = 'paid';
  await signedEvent(f.env, eventFor(sub, 'invoice.paid'));
  assert.equal((await request(f.env, '/api/membership/me', { auth: f.auth })).data.membership.billing.paidThrough, initial + 10000);
});

test('unpaid upgrades retain only the already-paid tier; paid upgrades and downgrades sync', async (t) => {
  const f = await fixture(t); const sub = await grant(f);
  sub.items.data[0].price.id = priceId['fan-favorite']; sub.latest_invoice.status = 'open';
  sub.latest_invoice.lines.data[0].pricing.price_details.price = priceId['fan-favorite'];
  await signedEvent(f.env, eventFor(sub));
  assert.equal((await request(f.env, '/api/membership/me', { auth: f.auth })).data.membership.planId, 'announcers-pick');
  sub.latest_invoice.status = 'paid'; await signedEvent(f.env, eventFor(sub, 'invoice.paid'));
  assert.equal((await request(f.env, '/api/membership/me', { auth: f.auth })).data.membership.planId, 'fan-favorite');
  sub.items.data[0].price.id = priceId['announcers-pick']; sub.latest_invoice.lines.data[0].pricing.price_details.price = priceId['announcers-pick'];
  await signedEvent(f.env, eventFor(sub));
  assert.equal((await request(f.env, '/api/membership/me', { auth: f.auth })).data.membership.planId, 'announcers-pick');
});

test('an old paid invoice cannot finance an unpaid higher-price change', async (t) => {
  const f = await fixture(t); const sub = await grant(f);
  sub.items.data[0].price.id = priceId['grand-champion'];
  await signedEvent(f.env, eventFor(sub));
  assert.equal((await request(f.env, '/api/membership/me', { auth: f.auth })).data.membership.planId, 'announcers-pick');
});

test('cancellation at period end keeps paid access until expiry; terminal states revoke it', async (t) => {
  const f = await fixture(t); const sub = await grant(f);
  sub.cancel_at_period_end = true; sub.cancel_at = now() + 1800;
  await signedEvent(f.env, eventFor(sub));
  const row = await f.DB.prepare('SELECT * FROM billing_subscriptions').first();
  assert.equal(effectivePlan([row], now() + 1799), 'announcers-pick');
  assert.equal(effectivePlan([row], now() + 1801), 'newbie');
  for (const status of ['canceled', 'unpaid', 'paused', 'incomplete_expired']) {
    sub.status = status; await signedEvent(f.env, eventFor(sub, status === 'canceled' ? 'customer.subscription.deleted' : 'customer.subscription.updated'));
    assert.equal((await request(f.env, '/api/membership/me', { auth: f.auth })).data.membership.planId, 'newbie');
  }
});

test('deleting an older subscription cannot remove a newer paid subscription', async (t) => {
  const f = await fixture(t); const old = await grant(f);
  const newer = paidSubscription(f.auth.user.id, 'fan-favorite', 'sub_new'); f.stripe.subscriptions.set(newer.id, newer);
  await signedEvent(f.env, eventFor(newer));
  old.status = 'canceled'; await signedEvent(f.env, eventFor(old, 'customer.subscription.deleted'));
  assert.equal((await request(f.env, '/api/membership/me', { auth: f.auth })).data.membership.planId, 'fan-favorite');
});

test('unknown prices and unrelated Stripe customer subscriptions cannot grant perks', async (t) => {
  const f = await fixture(t); const sub = await grant(f);
  sub.items.data[0].price.id = 'price_unknown'; await signedEvent(f.env, eventFor(sub));
  assert.equal((await request(f.env, '/api/membership/me', { auth: f.auth })).data.membership.planId, 'newbie');
  const unrelated = paidSubscription('google:someone-else', 'grand-champion', 'sub_other');
  f.stripe.subscriptions.set(unrelated.id, unrelated); await signedEvent(f.env, eventFor(unrelated));
  assert.equal((await f.DB.prepare("SELECT COUNT(*) AS count FROM billing_subscriptions WHERE stripe_subscription_id = 'sub_other'").first()).count, 0);
});

test('failed webhook processing remains durable and cron retries it', async (t) => {
  const f = await fixture(t); await mapCustomer(f.env, f.auth.user);
  const sub = paidSubscription(f.auth.user.id); f.stripe.subscriptions.set(sub.id, sub); f.stripe.failures = 1;
  const event = eventFor(sub); const result = await signedEvent(f.env, event);
  assert.equal(result.response.status, 200);
  assert.equal((await f.DB.prepare('SELECT state FROM stripe_webhook_events WHERE event_id = ?').bind(event.id).first()).state, 'pending');
  await f.DB.prepare('UPDATE stripe_webhook_events SET next_attempt_at = 0').run();
  await processPendingWebhooks(f.env);
  assert.equal((await f.DB.prepare('SELECT state FROM stripe_webhook_events WHERE event_id = ?').bind(event.id).first()).state, 'processed');
  assert.equal((await request(f.env, '/api/membership/me', { auth: f.auth })).data.membership.planId, 'announcers-pick');
});

test('Customer Portal is scoped to the authenticated customer and server-controlled target price', async (t) => {
  const f = await fixture(t); await grant(f);
  const upgrade = await request(f.env, '/api/membership/portal', { auth: f.auth, method: 'POST', body: { planId: 'fan-favorite' } });
  assert.equal(upgrade.response.status, 200);
  const call = f.stripe.requests.findLast((r) => r.url.pathname.endsWith('/billing_portal/sessions'));
  assert.equal(call.values.customer, 'cus_fixture');
  assert.equal(call.values['flow_data[subscription_update_confirm][items][0][price]'], 'price_favorite');
  await request(f.env, '/api/membership/portal', { auth: f.auth, method: 'POST', body: { planId: 'newbie' } });
  assert.equal(f.stripe.requests.at(-1).values['flow_data[type]'], 'subscription_cancel');
  const other = await identity(f.env, 'other');
  assert.equal((await request(f.env, '/api/membership/portal', { auth: other, method: 'POST', body: {} })).response.status, 404);
});

test('membership and the processed-event marker roll back together on database failure', async (t) => {
  const f = await fixture(t); await mapCustomer(f.env, f.auth.user);
  const sub = paidSubscription(f.auth.user.id); f.stripe.subscriptions.set(sub.id, sub);
  f.DB.sqlite.exec("CREATE TRIGGER fail_event_commit BEFORE UPDATE OF state ON stripe_webhook_events WHEN NEW.state = 'processed' BEGIN SELECT RAISE(ABORT, 'simulated transaction failure'); END");
  const event = eventFor(sub); await signedEvent(f.env, event);
  assert.equal((await f.DB.prepare('SELECT COUNT(*) AS count FROM billing_subscriptions').first()).count, 0);
  assert.equal((await f.DB.prepare('SELECT state FROM stripe_webhook_events WHERE event_id = ?').bind(event.id).first()).state, 'pending');
  f.DB.sqlite.exec('DROP TRIGGER fail_event_commit');
  await f.DB.prepare('UPDATE stripe_webhook_events SET next_attempt_at = 0').run();
  await processPendingWebhooks(f.env);
  assert.equal((await request(f.env, '/api/membership/me', { auth: f.auth })).data.membership.planId, 'announcers-pick');
});

test('an expired synchronization lease cannot commit a stale entitlement snapshot', async (t) => {
  const f = await fixture(t); await mapCustomer(f.env, f.auth.user);
  const sub = paidSubscription(f.auth.user.id); f.stripe.subscriptions.set(sub.id, sub);
  const originalNow = Date.now;
  let advanced = 0;
  t.mock.method(Date, 'now', () => originalNow() + advanced);
  const fetchStripe = globalThis.fetch;
  t.mock.method(globalThis, 'fetch', async (...args) => {
    const result = await fetchStripe(...args);
    if (String(args[0]).includes('/subscriptions/')) advanced = 91000;
    return result;
  });
  const event = eventFor(sub); await signedEvent(f.env, event);
  assert.equal((await f.DB.prepare('SELECT COUNT(*) AS count FROM billing_subscriptions').first()).count, 0);
  assert.equal((await f.DB.prepare('SELECT state FROM stripe_webhook_events WHERE event_id = ?').bind(event.id).first()).state, 'pending');
});

test('perk switches cannot claim unimplemented features or paywall public participation', async (t) => {
  const f = await fixture(t);
  f.env.MEMBERSHIP_PERKS_JSON = JSON.stringify({ ad_free: { enabled: true }, profile_frames: { enabled: false }, public_movie_nights: { enabled: false, minPlan: 'grand-champion' } });
  assert.equal(entitlementsFor(f.env, 'grand-champion').ad_free, false);
  assert.equal(entitlementsFor(f.env, 'grand-champion').profile_frames, false);
  assert.equal(entitlementsFor(f.env, 'newbie').public_movie_nights, true);
});

test('profile perks are authorized server-side and suppressed after cancellation', async (t) => {
  const f = await fixture(t);
  const body = { frame: 'champion', theme: 'mint', decoration: 'spark', showBadge: true, showTitle: true, recognitionOptIn: true };
  assert.equal((await request(f.env, '/api/membership/preferences', { auth: f.auth, method: 'PUT', body })).response.status, 403);
  const sub = await grant(f, 'grand-champion');
  assert.equal((await request(f.env, '/api/membership/preferences', { auth: f.auth, method: 'PUT', body })).response.status, 200);
  sub.status = 'canceled'; await signedEvent(f.env, eventFor(sub, 'customer.subscription.deleted'));
  const prefs = (await request(f.env, '/api/membership/me', { auth: f.auth })).data.membership.preferences;
  assert.equal(prefs.frame, 'none'); assert.equal(prefs.recognitionOptIn, false); assert.equal(prefs.showTitle, false);
});

test('all regular tiers can join public nights, RSVP, and change one public-poll vote', async (t) => {
  const f = await fixture(t); const event = await seedEvent(f.env, f.auth, 'live');
  assert.equal((await request(f.env, '/api/movie-nights')).data.events.length, 1);
  const join = await request(f.env, `/api/movie-nights/${event.id}/join`, { auth: f.auth, method: 'POST' });
  assert.equal(join.response.status, 200); assert.ok(join.data.watchUrl.includes('episode_fixture'));
  const poll = await request(f.env, `/api/movie-night-admin/events/${event.id}/polls`, { auth: f.auth, method: 'POST', body: { question: 'What should be our next theme?', minPlan: 'newbie', opensAt: now() - 10, closesAt: now() + 300, options: ['Underdogs', 'Beginnings'] } });
  const detail = await request(f.env, `/api/movie-nights/${event.id}`, { auth: f.auth });
  assert.equal(detail.data.polls[0].canVote, true);
  for (const option of detail.data.polls[0].options) assert.equal((await request(f.env, `/api/movie-nights/${event.id}/polls/${poll.data.id}/vote`, { auth: f.auth, method: 'PUT', body: { optionId: option.id } })).response.status, 200);
  assert.equal((await f.DB.prepare('SELECT COUNT(*) AS count FROM movie_night_votes').first()).count, 1);
  assert.equal((await request(f.env, `/api/movie-nights/${event.id}/join`, { method: 'POST' })).response.status, 401);
});

test('revoked, expired, cancelled, upcoming and mismatched event permissions block playback', async (t) => {
  const f = await fixture(t); const event = await seedEvent(f.env, f.auth);
  const join = () => request(f.env, `/api/movie-nights/${event.id}/join`, { auth: f.auth, method: 'POST' });
  assert.equal((await join()).data.code, 'event_not_live');
  await f.DB.prepare("UPDATE movie_nights SET status = 'live', starts_at = ?").bind(now() - 10).run();
  assert.equal((await join()).response.status, 200);
  await request(f.env, `/api/movie-night-admin/rights/${event.rightsId}/revoke`, { auth: f.auth, method: 'POST' });
  assert.equal((await join()).data.code, 'streaming_permission_required');
  await f.DB.prepare('UPDATE movie_night_rights SET revoked_at = NULL, valid_until = ?').bind(now() - 1).run();
  assert.equal((await join()).data.code, 'streaming_permission_required');
  await f.DB.prepare("UPDATE movie_nights SET status = 'cancelled'").run();
  assert.equal((await join()).data.code, 'event_not_live');
});

test('staff access is fail-closed and event creation requires an explicit, matching rights record', async (t) => {
  const f = await fixture(t);
  assert.equal((await request(f.env, '/api/movie-night-admin/events', { auth: f.auth })).response.status, 403);
  const event = await seedEvent(f.env, f.auth);
  const invalid = { ...event.body, rightsId: 'nonexistent' };
  assert.equal((await request(f.env, '/api/movie-night-admin/events', { auth: f.auth, method: 'POST', body: invalid })).response.status, 400);
  assert.equal((await request(f.env, '/api/movie-night-admin/events', { auth: f.auth, method: 'POST', body: { ...event.body, playbackUrl: 'https://unlicensed.example/video.mp4' } })).response.status, 400);
});

test('theme suggestions and early announcements obey current membership entitlements', async (t) => {
  const f = await fixture(t); const event = await seedEvent(f.env, f.auth);
  const suggest = () => request(f.env, `/api/movie-nights/${event.id}/suggestions`, { auth: f.auth, method: 'POST', body: { theme: 'Underdog stories', description: 'A night for the unexpected winners.' } });
  assert.equal((await suggest()).response.status, 403);
  await grant(f, 'fan-favorite'); assert.equal((await suggest()).response.status, 201);
  await f.DB.prepare('UPDATE movie_nights SET announce_at = ?, priority_announce_at = ?').bind(now() + 600, now() - 60).run();
  assert.equal((await request(f.env, '/api/movie-nights')).data.events.length, 0);
  assert.equal((await request(f.env, '/api/movie-nights', { auth: f.auth })).data.events.length, 1);
  f.env.MEMBERSHIP_PERKS_JSON = '{"priority_announcements":{"enabled":false}}';
  assert.equal((await request(f.env, '/api/movie-nights', { auth: f.auth })).data.events.length, 0);
});

test('recognition is opt-in and cannot expose names of ineligible or opted-out members', async (t) => {
  const f = await fixture(t); const event = await seedEvent(f.env, f.auth, 'live'); await grant(f, 'grand-champion');
  await request(f.env, `/api/movie-nights/${event.id}/rsvp`, { auth: f.auth, method: 'POST' });
  assert.equal((await request(f.env, `/api/movie-nights/${event.id}`)).data.supporters.length, 0);
  await request(f.env, '/api/membership/preferences', { auth: f.auth, method: 'PUT', body: { frame: 'none', theme: 'default', decoration: 'none', showBadge: false, showTitle: true, recognitionOptIn: true } });
  const visible = (await request(f.env, `/api/movie-nights/${event.id}`)).data.supporters;
  assert.equal(visible.length, 1); assert.equal(visible[0].title, 'Grand Champion'); assert.ok(!JSON.stringify(visible).includes('@'));
});

test('show-title migration updates only the six requested records and is repeatable', async (t) => {
  const f = await fixture(t);
  for (let i = 1; i <= 7; i++) await f.DB.prepare('INSERT INTO shows (id, title) VALUES (?, ?)').bind(`10000000-0000-4000-8000-00000000000${i}`, i === 7 ? 'Inanimate Insanity' : 'Abbreviation').run();
  const sql = readFileSync(new URL('../migrations/0024_expand_show_titles.sql', import.meta.url), 'utf8');
  f.DB.sqlite.exec(sql); f.DB.sqlite.exec(sql);
  const rows = (await f.DB.prepare('SELECT title FROM shows ORDER BY id').all()).results;
  assert.deepEqual(rows.map((row) => row.title), ['Battle for Dream Island', 'Battle for Dream Island Again', 'Battle for BFDI', 'Battle for Dream Island: The Power of Two', 'dnalsI maerD rof elttaB', 'Battle for Dream Island Elsewhere', 'Inanimate Insanity']);
});
