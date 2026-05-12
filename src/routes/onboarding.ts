import { FastifyInstance } from 'fastify';
import pLimit from 'p-limit';
import { pool } from '../db/client';
import { generateVocabResult } from '../services/ai';

type Context = 'work' | 'writing' | 'conversation' | 'general';

const CONTEXT_BIAS: Record<Context, string[]> = {
  work:         ['professional', 'thinking', 'communication'],
  writing:      ['expression', 'thinking', 'communication'],
  conversation: ['communication', 'interpersonal', 'emotional'],
  general:      [],
};

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ─── GET /api/onboarding/words ───────────────────────────────────────────────

const getWordsSchema = {
  querystring: {
    type: 'object',
    properties: {
      context: { type: 'string', enum: ['work', 'writing', 'conversation', 'general'] },
    },
    additionalProperties: false,
  },
} as const;

// ─── POST /api/onboarding/context ────────────────────────────────────────────

const postContextSchema = {
  body: {
    type: 'object',
    required: ['user_id', 'context'],
    properties: {
      user_id: { type: 'string', minLength: 1 },
      context: { type: 'string', enum: ['work', 'writing', 'conversation', 'general'] },
    },
    additionalProperties: false,
  },
} as const;

// ─── POST /api/onboarding/selections ─────────────────────────────────────────

const postSelectionsSchema = {
  body: {
    type: 'object',
    required: ['user_id', 'words', 'context'],
    properties: {
      user_id:  { type: 'string', minLength: 1 },
      words:    { type: 'array', items: { type: 'string' }, minItems: 5, maxItems: 10 },
      context:  { type: 'string', enum: ['work', 'writing', 'conversation', 'general'] },
    },
    additionalProperties: false,
  },
} as const;

interface GetWordsQuery  { context?: Context }
interface ContextBody    { user_id: string; context: Context }
interface SelectionsBody { user_id: string; words: string[]; context: Context }

export async function onboardingRoutes(app: FastifyInstance) {

  // GET /api/onboarding/words
  app.get<{ Querystring: GetWordsQuery }>('/api/onboarding/words', { schema: getWordsSchema }, async (request, reply) => {
    const { context } = request.query;

    const { rows } = await pool.query<{
      word: string; cluster_name: string; display_weight: number;
    }>(`
      SELECT ow.word, c.name AS cluster_name, ow.display_weight
      FROM onboarding_words ow
      JOIN clusters c ON c.id = ow.cluster_id
      ORDER BY ow.word
    `);

    // Deduplicate: one entry per word, accumulating all cluster names, max display_weight
    const map = new Map<string, { word: string; clusters: string[]; display_weight: number }>();
    for (const row of rows) {
      const existing = map.get(row.word);
      if (existing) {
        existing.clusters.push(row.cluster_name);
        if (row.display_weight > existing.display_weight) {
          existing.display_weight = row.display_weight;
        }
      } else {
        map.set(row.word, { word: row.word, clusters: [row.cluster_name], display_weight: row.display_weight });
      }
    }

    const words = Array.from(map.values());

    // Bias: words whose clusters overlap with context priority appear first
    const priority = context ? CONTEXT_BIAS[context] : [];
    if (priority.length > 0) {
      const biased = words.filter((w) => w.clusters.some((c) => priority.includes(c)));
      const rest   = words.filter((w) => !w.clusters.some((c) => priority.includes(c)));
      return reply.send(shuffle(biased).concat(shuffle(rest)));
    }

    return reply.send(shuffle(words));
  });

  // POST /api/onboarding/context
  app.post<{ Body: ContextBody }>('/api/onboarding/context', { schema: postContextSchema }, async (request, reply) => {
    const { user_id, context } = request.body;
    await pool.query('UPDATE users SET usage_context = $2 WHERE id = $1', [user_id, context]);
    return reply.send({ ok: true });
  });

  // POST /api/onboarding/selections
  app.post<{ Body: SelectionsBody }>('/api/onboarding/selections', { schema: postSelectionsSchema }, async (request, reply) => {
    const { user_id, words, context } = request.body;
    void context; // stored earlier via /api/onboarding/context

    const normalised = words.map((w) => w.toLowerCase().trim());

    // 1. Validate every word exists in onboarding_words
    const { rows: validRows } = await pool.query<{ word: string }>(
      'SELECT DISTINCT word FROM onboarding_words WHERE word = ANY($1)',
      [normalised]
    );
    const validSet = new Set(validRows.map((r) => r.word));
    const invalid = normalised.filter((w) => !validSet.has(w));
    if (invalid.length > 0) {
      return reply.status(400).send({
        error: `Unknown onboarding words: ${invalid.join(', ')}`,
      });
    }

    // 2. Score clusters
    const { rows: clusterRows } = await pool.query<{ cluster_id: number; word: string }>(
      `SELECT ow.cluster_id, ow.word
       FROM onboarding_words ow
       WHERE ow.word = ANY($1)`,
      [normalised]
    );

    const clusterScores = new Map<number, number>();
    for (const row of clusterRows) {
      if (normalised.includes(row.word)) {
        clusterScores.set(row.cluster_id, (clusterScores.get(row.cluster_id) ?? 0) + 1);
      }
    }

    // Upsert user_preferences
    for (const [cluster_id, score] of clusterScores) {
      await pool.query(
        `INSERT INTO user_preferences (user_id, cluster_id, score)
         VALUES ($1, $2, $3)
         ON CONFLICT (user_id, cluster_id) DO UPDATE SET score = user_preferences.score + $3`,
        [user_id, cluster_id, score]
      );
    }

    // 3. Resolve result payloads (cache hits free, misses via AI, max 5 concurrent)
    const limit = pLimit(5);

    await Promise.all(
      normalised.map((word) =>
        limit(async () => {
          const cached = await pool.query(
            'SELECT 1 FROM result_cache WHERE input_normalised = $1',
            [word]
          );
          if (cached.rowCount && cached.rowCount > 0) return;

          const payload = await generateVocabResult(word);
          await pool.query(
            `INSERT INTO result_cache (input_normalised, result_payload)
             VALUES ($1, $2)
             ON CONFLICT (input_normalised) DO NOTHING`,
            [word, JSON.stringify(payload)]
          );
        })
      )
    );

    // 4. Insert into review_queue (source='onboarding', immediately due)
    let wordsQueued = 0;
    for (const word of normalised) {
      const result = await pool.query(
        `INSERT INTO review_queue
           (user_id, input_normalised, source, initial_interval_days, interval_days, next_review_at, ease_factor)
         VALUES ($1, $2, 'onboarding', 2, 2, now(), 2.50)
         ON CONFLICT (user_id, input_normalised) DO NOTHING`,
        [user_id, word]
      );
      if (result.rowCount && result.rowCount > 0) wordsQueued++;
    }

    // 5. Mark user as onboarded
    await pool.query('UPDATE users SET onboarded_at = now() WHERE id = $1', [user_id]);

    // 6. Top 2 clusters by score
    const sorted = [...clusterScores.entries()].sort((a, b) => b[1] - a[1]).slice(0, 2);
    const topClusterIds = sorted.map(([id]) => id);
    const { rows: topClusterRows } = await pool.query<{ name: string }>(
      'SELECT name FROM clusters WHERE id = ANY($1)',
      [topClusterIds]
    );
    const top_clusters = topClusterRows.map((r) => r.name);

    return reply.send({ ok: true, words_queued: wordsQueued, top_clusters });
  });
}
