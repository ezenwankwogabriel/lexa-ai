import 'dotenv/config';
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import { identifyRoutes } from '../routes/identify';
import { searchRoutes } from '../routes/search';
import { pool } from '../db/client';

function buildApp() {
  const app = Fastify({ logger: false });
  app.register(identifyRoutes);
  app.register(searchRoutes);
  return app;
}

const app = buildApp();
let userId: string;

before(async () => {
  await app.ready();

  const res = await app.inject({
    method: 'POST',
    url: '/api/identify',
    payload: { device_id: `test-search-${Date.now()}`, platform: 'ios' },
  });
  userId = res.json().user_id;

  await pool.query(
    `DELETE FROM result_cache WHERE input_normalised = ANY($1::text[])`,
    [['meticulous', 'good', 'agree on', 'the movie was good']]
  );
});

after(async () => {
  await app.close();
  await pool.end();
});

async function search(input: string) {
  const res = await app.inject({
    method: 'POST',
    url: '/api/search',
    payload: { user_id: userId, input },
  });
  assert.equal(res.statusCode, 200, `search "${input}" returned ${res.statusCode}: ${res.body}`);
  return res.json();
}

test('single word — meticulous', async () => {
  const body = await search('meticulous');
  assert.ok(typeof body.meaning === 'string' && body.meaning.length > 0, 'has meaning');
  assert.ok(Array.isArray(body.alternatives) && body.alternatives.length >= 3, 'has 3+ alternatives');
  assert.deepEqual(body.patterns, [], 'patterns is []');
  assert.equal(body.sentence_upgrade, null, 'sentence_upgrade is null');
});

test('weak word — good', async () => {
  const body = await search('good');
  assert.ok(Array.isArray(body.alternatives) && body.alternatives.length >= 3, 'has 3+ alternatives');
  for (const alt of body.alternatives) {
    assert.ok(typeof alt.tone === 'string', `alternative missing tone: ${JSON.stringify(alt)}`);
    assert.ok(typeof alt.intensity === 'string', `alternative missing intensity: ${JSON.stringify(alt)}`);
  }
});

test('phrase — agree on', async () => {
  const body = await search('agree on');
  assert.equal(body.input_type, 'phrase', 'input_type is phrase');
  assert.ok(Array.isArray(body.patterns) && body.patterns.length >= 2, 'has 2+ patterns');
});

test('weak sentence — the movie was good', async () => {
  const body = await search('the movie was good');
  assert.equal(body.input_type, 'sentence', 'input_type is sentence');
  assert.notEqual(body.sentence_upgrade, null, 'sentence_upgrade is not null');
  assert.ok(
    typeof body.sentence_upgrade === 'string' && body.sentence_upgrade.includes('|'),
    'sentence_upgrade contains | separator'
  );
});

test('cache hit — meticulous searched twice', async () => {
  await pool.query(`DELETE FROM result_cache WHERE input_normalised = 'meticulous'`);

  const first = await search('meticulous');
  assert.equal(first.source, 'ai', 'first response is from AI');

  const second = await search('meticulous');
  assert.equal(second.source, 'cache', 'second response is from cache');

  assert.equal(first.meaning, second.meaning, 'both responses have identical meaning');
});
