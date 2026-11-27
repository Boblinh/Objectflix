// Objectflix: this is the subtitle workshop.test part, kept here so the rest of the app knows exactly where to look.
import test from 'node:test';
import assert from 'node:assert/strict';
import { app, database, environment, identity, request } from './helpers.mjs';

const SHOW_ID = '10000000-0000-4000-8000-000000000001';
const SEASON_ID = '10000000-0000-4000-8000-000000000002';
const EPISODE_ID = '10000000-0000-4000-8000-000000000003';
const SUBTITLE_ID = '10000000-0000-4000-8000-000000000004';
const ASS = `[Script Info]\nScriptType: v4.00+\n\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\nDialogue: 0,0:00:01.00,0:00:02.00,Default,,0,0,0,,Hello there!\n`;

async function fixture(t) {
  const DB = database();
  t.after(() => DB.sqlite.close());
  const env = environment(DB);
  const owner = await identity(env, 'subtitle-admin');
  const viewer = await identity(env, 'subtitle-viewer');
  env.MEMBERSHIP_ADMIN_USER_IDS_JSON = JSON.stringify([owner.user.id]);
  await DB.prepare('INSERT INTO shows (id, title) VALUES (?, ?)').bind(SHOW_ID, 'A permitted story').run();
  await DB.prepare('INSERT INTO seasons (id, show_id, title) VALUES (?, ?, ?)').bind(SEASON_ID, SHOW_ID, 'Season 1').run();
  await DB.prepare('INSERT INTO episodes (id, season_id, show_id, title, video_key) VALUES (?, ?, ?, ?, ?)')
    .bind(EPISODE_ID, SEASON_ID, SHOW_ID, 'The first scene', 'show/episode.mp4').run();
  await DB.prepare('INSERT INTO subtitles (id, episode_id, language, url, created_at) VALUES (?, ?, ?, ?, ?)')
    .bind(SUBTITLE_ID, EPISODE_ID, 'en', '/media/show/subtitles.ass', 100).run();
  return { DB, env, owner, viewer };
}

async function rawRequest(env, path, { auth, method = 'GET', body, headers = {} } = {}) {
  const requestHeaders = new Headers(headers);
  if (auth) requestHeaders.set('Authorization', `Bearer ${auth.accessToken}`);
  if (body !== undefined) requestHeaders.set('Content-Type', 'application/json');
  return app.fetch(new Request(`https://api.example${path}`, {
    method,
    headers: requestHeaders,
    body: body === undefined ? undefined : JSON.stringify(body),
  }), env, { waitUntil() {}, passThroughOnException() {} });
}

function submission(overrides = {}) {
  return {
    episodeId: EPISODE_ID,
    language: 'en',
    format: 'ass',
    attribution: 'Subtitle Workshop Test',
    rightsConfirmed: true,
    content: ASS,
    ...overrides,
  };
}

test('subtitle reports validate timing, retain verified reporters, and are staff-only to review', async (t) => {
  const { DB, env, owner, viewer } = await fixture(t);

  const invalid = await request(env, '/api/subtitle-workshop/reports', {
    method: 'POST',
    body: { episodeId: EPISODE_ID, kind: 'timing', details: 'The line is off.', subtitleId: SUBTITLE_ID },
  });
  assert.equal(invalid.response.status, 400);

  const created = await request(env, '/api/subtitle-workshop/reports', {
    auth: viewer,
    method: 'POST',
    body: {
      episodeId: EPISODE_ID,
      subtitleId: SUBTITLE_ID,
      kind: 'timing',
      timeSeconds: 42,
      direction: 'late',
      details: 'This subtitle appears just after the dialogue.',
      correctedText: 'A suggested line.',
    },
  });
  assert.equal(created.response.status, 201);
  assert.equal(created.data.report.status, 'open');

  const mine = await request(env, '/api/subtitle-workshop/mine', { auth: viewer });
  assert.equal(mine.response.status, 200);
  assert.equal(mine.data.reports.length, 1);
  assert.equal(mine.data.reports[0].reporter, 'Viewer subtitle-viewer');

  const guestReport = await request(env, '/api/subtitle-workshop/reports', {
    method: 'POST',
    body: { episodeId: EPISODE_ID, kind: 'typo', details: 'There is a typo in the opening line.' },
  });
  assert.equal(guestReport.response.status, 201);
  const guestRow = await DB.prepare('SELECT user_id FROM subtitle_reports WHERE id = ?').bind(guestReport.data.report.id).first();
  assert.equal(guestRow.user_id, null);

  const denied = await request(env, '/api/subtitle-workshop/admin/reports?status=open');
  assert.equal(denied.response.status, 401);
  const wrongUser = await request(env, '/api/subtitle-workshop/admin/reports?status=open', { auth: viewer });
  assert.equal(wrongUser.response.status, 403);

  const queue = await request(env, '/api/subtitle-workshop/admin/reports?status=open', { auth: owner });
  assert.equal(queue.response.status, 200);
  assert.equal(queue.data.reports.length, 2);
  assert.equal(queue.data.reports[0].timeSeconds, 42);

  const resolved = await request(env, `/api/subtitle-workshop/admin/reports/${created.data.report.id}`, {
    auth: owner,
    method: 'PATCH',
    body: { status: 'resolved', resolution: 'Adjusted the subtitle timing.' },
  });
  assert.equal(resolved.response.status, 200);
  const row = await DB.prepare('SELECT status, resolution FROM subtitle_reports WHERE id = ?').bind(created.data.report.id).first();
  assert.deepEqual({ ...row }, { status: 'resolved', resolution: 'Adjusted the subtitle timing.' });
});

test('fan subtitle tracks remain unpublished until admin approval and rejection never publishes', async (t) => {
  const { DB, env, owner, viewer } = await fixture(t);

  const noAuth = await request(env, '/api/subtitle-workshop/submissions', { method: 'POST', body: submission() });
  assert.equal(noAuth.response.status, 401);
  const noRights = await request(env, '/api/subtitle-workshop/submissions', {
    auth: viewer,
    method: 'POST',
    body: submission({ rightsConfirmed: false }),
  });
  assert.equal(noRights.response.status, 400);
  const invalidFile = await request(env, '/api/subtitle-workshop/submissions', {
    auth: viewer,
    method: 'POST',
    body: submission({ content: 'not an ASS file' }),
  });
  assert.equal(invalidFile.response.status, 400);

  const pending = await request(env, '/api/subtitle-workshop/submissions', {
    auth: viewer,
    method: 'POST',
    body: submission(),
  });
  assert.equal(pending.response.status, 201);
  assert.equal(pending.data.submission.status, 'pending');

  const pendingTrack = await rawRequest(env, `/api/subtitle-workshop/tracks/${pending.data.submission.id}`);
  assert.equal(pendingTrack.status, 404);
  const activeBeforeReview = await DB.prepare('SELECT id FROM subtitles WHERE workshop_submission_id = ?').bind(pending.data.submission.id).first();
  assert.equal(activeBeforeReview, null);
  const uploadRateLimit = await request(env, '/api/subtitle-workshop/submissions', {
    auth: viewer,
    method: 'POST',
    body: submission(),
  });
  assert.equal(uploadRateLimit.response.status, 429);

  const viewerQueue = await request(env, '/api/subtitle-workshop/admin/submissions?status=pending', { auth: viewer });
  assert.equal(viewerQueue.response.status, 403);
  const preview = await request(env, `/api/subtitle-workshop/admin/submissions/${pending.data.submission.id}/content`, { auth: owner });
  assert.equal(preview.response.status, 200);
  assert.match(preview.data.content, /Dialogue:/);

  const approved = await request(env, `/api/subtitle-workshop/admin/submissions/${pending.data.submission.id}`, {
    auth: owner,
    method: 'PATCH',
    body: { status: 'approved', reviewNote: 'Checked against the episode.' },
  });
  assert.equal(approved.response.status, 200);
  assert.equal(approved.data.status, 'approved');
  const active = await DB.prepare('SELECT episode_id, language, url, attribution FROM subtitles WHERE workshop_submission_id = ?')
    .bind(pending.data.submission.id).first();
  assert.deepEqual({ ...active }, {
    episode_id: EPISODE_ID,
    language: 'en',
    url: approved.data.trackUrl,
    attribution: 'Subtitle Workshop Test',
  });
  const publishedTrack = await rawRequest(env, approved.data.trackUrl);
  assert.equal(publishedTrack.status, 200);
  assert.match(publishedTrack.headers.get('content-type'), /text\/plain/);
  assert.equal(await publishedTrack.text(), ASS);
  const duplicateReview = await request(env, `/api/subtitle-workshop/admin/submissions/${pending.data.submission.id}`, {
    auth: owner,
    method: 'PATCH',
    body: { status: 'rejected' },
  });
  assert.equal(duplicateReview.response.status, 409);

  const secondViewer = await identity(env, 'subtitle-rejection-viewer');
  const rejected = await request(env, '/api/subtitle-workshop/submissions', {
    auth: secondViewer,
    method: 'POST',
    body: submission({ language: 'vi', format: 'ssa' }),
  });
  assert.equal(rejected.response.status, 201);
  const rejection = await request(env, `/api/subtitle-workshop/admin/submissions/${rejected.data.submission.id}`, {
    auth: owner,
    method: 'PATCH',
    body: { status: 'rejected', reviewNote: 'Please revise the timing.' },
  });
  assert.equal(rejection.response.status, 200);
  const rejectedTrack = await rawRequest(env, `/api/subtitle-workshop/tracks/${rejected.data.submission.id}`);
  assert.equal(rejectedTrack.status, 404);
  const activeRejected = await DB.prepare('SELECT id FROM subtitles WHERE workshop_submission_id = ?').bind(rejected.data.submission.id).first();
  assert.equal(activeRejected, null);
});
