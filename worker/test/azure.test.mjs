// Objectflix: this is the azure.test part, kept here so the rest of the app knows exactly where to look.
import test from 'node:test';
import assert from 'node:assert/strict';
import { database, environment, identity, request, app } from './helpers.mjs';
import { consumeResponsesStream } from '../../src/responses-stream.js';
import { DEFAULT_AZURE_ENDPOINT } from '../src/azure_api.js';

function streamOf(text, chunkSize = 7) {
  const bytes = new TextEncoder().encode(text);
  return new ReadableStream({ start(controller) { for (let i = 0; i < bytes.length; i += chunkSize) controller.enqueue(bytes.slice(i, i + chunkSize)); controller.close(); } });
}
const completedStream = [
  'event: response.output_text.delta\r\ndata: {"type":"response.output_text.delta","delta":"Hello, "}\r\n\r\n',
  'data: {"type":"response.output_text.delta","delta":"Leafy 🌿"}\r\n\r\n',
  'data: {"type":"response.completed","response":{"status":"completed","output":[{"content":[{"type":"output_text","text":"Hello, Leafy 🌿"}]}]}}\r\n\r\n',
  'data: [DONE]\r\n\r\n',
].join('');

test('Responses SSE supports split events, CRLF, split UTF-8 and final output', async () => {
  const updates = [];
  const text = await consumeResponsesStream(streamOf(completedStream, 1), (partial) => updates.push(partial));
  assert.equal(text, 'Hello, Leafy 🌿');
  assert.deepEqual(updates, ['Hello, ', 'Hello, Leafy 🌿']);
});

test('Responses SSE rejects truncated or failed output rather than executing a partial reply', async () => {
  const delta = 'data: {"type":"response.output_text.delta","delta":"[ACTION:PLAY]"}\n\n';
  await assert.rejects(consumeResponsesStream(streamOf(delta)), /before completion/);
  for (const type of ['error', 'response.failed', 'response.incomplete']) {
    await assert.rejects(consumeResponsesStream(streamOf(`${delta}data: ${JSON.stringify({ type })}\n\n`)), /did not complete/);
  }
});

test('Azure endpoint requires a verified session and fails gracefully when its key is missing', async (t) => {
  const DB = database(); t.after(() => DB.sqlite.close()); const env = environment(DB); const auth = await identity(env);
  const body = { messages: [{ role: 'user', content: 'Hello' }], stream: false };
  assert.equal((await request(env, '/api/ai/azure/responses', { method: 'POST', body })).response.status, 401);
  assert.equal((await request(env, '/api/ai/azure/responses', { auth, method: 'POST', body })).data.code, 'provider_not_configured');
});

test('Azure uses the server deployment and server key, not a browser-supplied endpoint or model', async (t) => {
  const DB = database(); t.after(() => DB.sqlite.close()); const env = { ...environment(DB), AZURE_OPENAI_API_KEY: 'azure_test_fixture' }; const auth = await identity(env);
  let received;
  t.mock.method(globalThis, 'fetch', async (url, init) => { received = { url, init, body: JSON.parse(init.body) }; return Response.json({ status: 'completed', output: [{ content: [{ type: 'output_text', text: 'x = -29/8' }] }] }); });
  const body = { messages: [{ role: 'system', content: 'You are an Objectflix assistant.' }, { role: 'user', content: 'solve 8x + 31 = 2' }], stream: false };
  const response = await request(env, '/api/ai/azure/responses', { auth, method: 'POST', body });
  assert.equal(response.data.outputText, 'x = -29/8');
  assert.equal(received.url, DEFAULT_AZURE_ENDPOINT);
  assert.equal(received.init.headers['api-key'], 'azure_test_fixture');
  assert.equal(received.body.model, 'gpt-5-mini');
  assert.equal(received.body.store, false);
  assert.equal(received.body.instructions, body.messages[0].content);
  assert.equal(received.body.input.length, 1);
  assert.ok(!JSON.stringify(response.data).includes('azure_test_fixture'));
  for (const extra of [{ model: 'other-deployment' }, { endpoint: 'https://evil.example' }, { apiKey: 'browser-key' }, { max_output_tokens: 1000000 }]) {
    assert.equal((await request(env, '/api/ai/azure/responses', { auth, method: 'POST', body: { ...body, ...extra } })).response.status, 400);
  }
});

test('Azure streaming is passed through as SSE, and throttling errors do not expose upstream details', async (t) => {
  const DB = database(); t.after(() => DB.sqlite.close()); const env = { ...environment(DB), AZURE_OPENAI_API_KEY: 'azure_test_fixture' }; const auth = await identity(env);
  let fail = false;
  t.mock.method(globalThis, 'fetch', async () => fail ? Response.json({ error: { message: 'sensitive Azure diagnostic' } }, { status: 429 }) : new Response(streamOf(completedStream), { headers: { 'Content-Type': 'text/event-stream' } }));
  const response = await app.fetch(new Request('https://api.example/api/ai/azure/responses', { method: 'POST', headers: { Authorization: `Bearer ${auth.accessToken}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ messages: [{ role: 'user', content: 'Hello' }], stream: true }) }), env);
  assert.ok(response.headers.get('Content-Type').includes('text/event-stream'));
  assert.equal(await consumeResponsesStream(response.body), 'Hello, Leafy 🌿');
  fail = true;
  const failed = await request(env, '/api/ai/azure/responses', { auth, method: 'POST', body: { messages: [{ role: 'user', content: 'Hi' }], stream: false } });
  assert.equal(failed.response.status, 429); assert.ok(!JSON.stringify(failed.data).includes('sensitive Azure diagnostic'));
});
