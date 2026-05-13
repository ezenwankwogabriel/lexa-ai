import Anthropic from '@anthropic-ai/sdk';
import { FastifyInstance } from 'fastify';
import { pool } from '../db/client';

const anthropic = new Anthropic();
const INTERNAL_SECRET = process.env.INTERNAL_SECRET ?? '';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ExpandWordRow {
  word: string;
  core_meaning: string;
  usage_example: string;
  alternatives: string[];
  difficulty: number;
  cluster: string;
  cluster_id: number;
}

interface GeneratedEntry {
  word: string;
  core_meaning: string;
  usage_example: string;
  alternatives: string[];
  difficulty: number;
}

// ─── Shared generation logic ──────────────────────────────────────────────────

export async function generateWordsForCluster(
  clusterName: string,
  count: number,
  triggeredBy: 'cron' | 'manual'
): Promise<{ words_added: number; cluster: string }> {
  const { rows: clusterRows } = await pool.query<{ id: number }>(
    'SELECT id FROM clusters WHERE name = $1',
    [clusterName]
  );
  if (clusterRows.length === 0) throw new Error(`Unknown cluster: ${clusterName}`);
  const clusterId = clusterRows[0].id;

  const { rows: existingRows } = await pool.query<{ word: string }>(
    'SELECT word FROM vocabulary_bank WHERE cluster_id = $1',
    [clusterId]
  );
  const existingWords = existingRows.map((r) => r.word);

  const systemPrompt =
    'You are a vocabulary curriculum designer. Generate vocabulary bank entries for English ' +
    'learners who want to communicate more expressively and precisely. Words should be mid-tier — ' +
    'familiar enough to use naturally but richer than everyday alternatives. Not obscure, not basic. ' +
    'Return only valid JSON, no explanation.';

  const styleExample = JSON.stringify({
    word: 'methodical',
    core_meaning: 'Doing things in a careful, ordered way.',
    usage_example: 'She was methodical in reviewing every clause before signing.',
    alternatives: ['systematic', 'careful', 'thorough'],
    difficulty: 2,
  });

  const userPrompt =
    `Generate ${count} vocabulary words for the "${clusterName}" cluster.\n\n` +
    (existingWords.length > 0
      ? `Avoid these existing words: ${existingWords.join(', ')}\n\n`
      : '') +
    'Return a JSON array where each item has:\n' +
    '- word (string)\n' +
    '- core_meaning (one plain sentence)\n' +
    '- usage_example (one natural sentence using the word)\n' +
    '- alternatives (array of 2–3 simpler synonyms)\n' +
    '- difficulty (integer 1–5, where 1=approachable, 5=advanced)\n\n' +
    `Style reference — match this quality and tone:\n${styleExample}`;

  const response = await anthropic.messages.create({
    model: 'claude-haiku-4-5',
    max_tokens: 2048,
    system: systemPrompt,
    messages: [{ role: 'user', content: userPrompt }],
  });

  const first = response.content[0];
  if (first.type !== 'text') throw new Error('AI_PARSE_ERROR');

  const raw = first.text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
  const entries = JSON.parse(raw) as GeneratedEntry[];

  let wordsAdded = 0;
  for (const entry of entries) {
    if (!entry.word || !entry.core_meaning || !entry.usage_example) continue;
    const difficulty = Math.min(5, Math.max(1, Math.round(entry.difficulty ?? 2)));
    const result = await pool.query(
      `INSERT INTO vocabulary_bank (word, cluster_id, core_meaning, usage_example, alternatives, difficulty)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (word) DO NOTHING`,
      [
        String(entry.word).toLowerCase().trim(),
        clusterId,
        entry.core_meaning,
        entry.usage_example,
        JSON.stringify(Array.isArray(entry.alternatives) ? entry.alternatives : []),
        difficulty,
      ]
    );
    if (result.rowCount && result.rowCount > 0) wordsAdded++;
  }

  await pool.query(
    `INSERT INTO vocabulary_bank_generation_log (cluster_id, words_added, triggered_by)
     VALUES ($1, $2, $3)`,
    [clusterId, wordsAdded, triggeredBy]
  );

  return { words_added: wordsAdded, cluster: clusterName };
}

// ─── Route schemas ────────────────────────────────────────────────────────────

const getExpandSchema = {
  querystring: {
    type: 'object',
    required: ['user_id'],
    properties: {
      user_id: { type: 'string', minLength: 1 },
    },
    additionalProperties: false,
  },
} as const;

const postCompleteSchema = {
  body: {
    type: 'object',
    required: ['user_id', 'cluster_id', 'words_shown'],
    properties: {
      user_id:    { type: 'string', minLength: 1 },
      cluster_id: { type: 'integer' },
      words_shown: { type: 'array', items: { type: 'string' } },
    },
    additionalProperties: false,
  },
} as const;

const postGenerateSchema = {
  body: {
    type: 'object',
    required: ['cluster_name'],
    properties: {
      cluster_name: { type: 'string', minLength: 1 },
      count:        { type: 'integer', minimum: 1, maximum: 30, default: 10 },
    },
    additionalProperties: false,
  },
} as const;

// ─── Interfaces ───────────────────────────────────────────────────────────────

interface GetExpandQuery   { user_id: string }
interface PostCompleteBody { user_id: string; cluster_id: number; words_shown: string[] }
interface PostGenerateBody { cluster_name: string; count?: number }

// ─── Routes ───────────────────────────────────────────────────────────────────

export async function expandRoutes(app: FastifyInstance) {

  // GET /api/expand
  app.get<{ Querystring: GetExpandQuery }>(
    '/api/expand',
    { schema: getExpandSchema },
    async (request, reply) => {
      const { user_id } = request.query;

      // Require at least 3 searches before showing expand
      const { rows: searchCountRows } = await pool.query<{ count: string }>(
        'SELECT COUNT(*) AS count FROM searches WHERE user_id = $1',
        [user_id]
      );
      const searchCount = parseInt(searchCountRows[0]?.count ?? '0', 10);
      if (searchCount < 3) {
        return reply.send({ words: [], clusters_featured: [], primary_cluster_id: null });
      }

      // Top 2 clusters from user_preferences
      const { rows: prefRows } = await pool.query<{ cluster_id: number; cluster_name: string }>(
        `SELECT up.cluster_id, c.name AS cluster_name
         FROM user_preferences up
         JOIN clusters c ON c.id = up.cluster_id
         WHERE up.user_id = $1
         ORDER BY up.score DESC
         LIMIT 2`,
        [user_id]
      );

      const topClusterIds: number[] =
        prefRows.length > 0
          ? prefRows.map((r) => r.cluster_id)
          : (await pool.query<{ id: number }>(
              "SELECT id FROM clusters WHERE name IN ('expression', 'communication')"
            )).rows.map((r) => r.id);

      // Words already shown to this user
      const { rows: shownRows } = await pool.query<{ word: string }>(
        `SELECT DISTINCT jsonb_array_elements_text(words_shown) AS word
         FROM expand_session_log
         WHERE user_id = $1`,
        [user_id]
      );
      const seenWords = shownRows.map((r) => r.word);

      // Fetch 5 unseen words from top clusters, fill from others if needed
      const { rows: primaryWords } = await pool.query<ExpandWordRow>(
        `SELECT vb.word, vb.core_meaning, vb.usage_example, vb.alternatives, vb.difficulty,
                c.name AS cluster, c.id AS cluster_id
         FROM vocabulary_bank vb
         JOIN clusters c ON c.id = vb.cluster_id
         WHERE vb.cluster_id = ANY($1)
           AND ($2::text[] IS NULL OR vb.word != ALL($2))
         ORDER BY vb.difficulty ASC
         LIMIT 5`,
        [topClusterIds, seenWords.length > 0 ? seenWords : null]
      );

      let words = primaryWords;

      if (words.length < 5) {
        const needed = 5 - words.length;
        const existingWords = words.map((w) => w.word).concat(seenWords);
        const { rows: fillWords } = await pool.query<ExpandWordRow>(
          `SELECT vb.word, vb.core_meaning, vb.usage_example, vb.alternatives, vb.difficulty,
                  c.name AS cluster, c.id AS cluster_id
           FROM vocabulary_bank vb
           JOIN clusters c ON c.id = vb.cluster_id
           WHERE vb.cluster_id != ALL($1)
             AND ($2::text[] IS NULL OR vb.word != ALL($2))
           ORDER BY vb.difficulty ASC
           LIMIT $3`,
          [topClusterIds, existingWords.length > 0 ? existingWords : null, needed]
        );
        words = words.concat(fillWords);
      }

      if (words.length === 0) {
        return reply.send({ words: [], clusters_featured: [], primary_cluster_id: null });
      }

      const clustersFeatured = [...new Set(words.map((w) => w.cluster))];
      const primaryClusterId = topClusterIds[0] ?? words[0].cluster_id;

      return reply.send({
        words: words.map((w) => ({
          word: w.word,
          core_meaning: w.core_meaning,
          usage_example: w.usage_example,
          alternatives: Array.isArray(w.alternatives) ? w.alternatives : [],
          difficulty: w.difficulty,
          cluster: w.cluster,
        })),
        clusters_featured: clustersFeatured,
        primary_cluster_id: primaryClusterId,
      });
    }
  );

  // POST /api/expand/complete
  app.post<{ Body: PostCompleteBody }>(
    '/api/expand/complete',
    { schema: postCompleteSchema },
    async (request, reply) => {
      const { user_id, cluster_id, words_shown } = request.body;
      await pool.query(
        `INSERT INTO expand_session_log (user_id, cluster_id, words_shown)
         VALUES ($1, $2, $3)`,
        [user_id, cluster_id, JSON.stringify(words_shown)]
      );
      return reply.send({ ok: true });
    }
  );

  // POST /api/expand/generate — internal only, protected by secret header
  app.post<{ Body: PostGenerateBody }>(
    '/api/expand/generate',
    { schema: postGenerateSchema },
    async (request, reply) => {
      const secret = request.headers['x-internal-secret'];
      if (!INTERNAL_SECRET || secret !== INTERNAL_SECRET) {
        return reply.status(401).send({ error: 'Unauthorized' });
      }

      const { cluster_name, count = 10 } = request.body;

      try {
        const result = await generateWordsForCluster(cluster_name, count, 'manual');
        return reply.send(result);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Generation failed';
        return reply.status(500).send({ error: message });
      }
    }
  );
}
