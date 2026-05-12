import { FastifyInstance } from 'fastify';
import { pool } from '../db/client';
import { VocabResult } from '../types/index';

type Level = 'Explorer' | 'Expander' | 'Articulate' | 'Refined';

function getLevel(masteredCount: number): Level {
  if (masteredCount >= 75) return 'Refined';
  if (masteredCount >= 30) return 'Articulate';
  if (masteredCount >= 10) return 'Expander';
  return 'Explorer';
}

interface WordRow {
  input_normalised: string;
  repetition_count: number;
  last_performance: number | null;
  ease_factor: number;
  result_payload: VocabResult | null;
}

const schema = {
  querystring: {
    type: 'object',
    required: ['user_id'],
    properties: {
      user_id: { type: 'string', minLength: 1 },
    },
    additionalProperties: false,
  },
} as const;

export async function vocabularyRoutes(app: FastifyInstance) {
  app.get<{ Querystring: { user_id: string } }>('/api/vocabulary', { schema }, async (request, reply) => {
    const { user_id } = request.query;

    const [allWords, weakRows] = await Promise.all([
      pool.query<WordRow>(`
        SELECT
          rq.input_normalised,
          rq.repetition_count,
          rq.last_performance,
          rq.ease_factor,
          rc.result_payload
        FROM review_queue rq
        LEFT JOIN result_cache rc ON rc.input_normalised = rq.input_normalised
        WHERE rq.user_id = $1
        ORDER BY rq.repetition_count DESC, rq.updated_at DESC
      `, [user_id]),

      pool.query<WordRow>(`
        SELECT
          rq.input_normalised,
          rq.repetition_count,
          rq.last_performance,
          rq.ease_factor,
          rc.result_payload
        FROM review_queue rq
        LEFT JOIN result_cache rc ON rc.input_normalised = rq.input_normalised
        WHERE rq.user_id = $1
          AND rq.last_performance IS NOT NULL
          AND rq.last_performance <= 2
        ORDER BY rq.repetition_count DESC
        LIMIT 3
      `, [user_id]),
    ]);

    const words = allWords.rows;
    const mastered = words.filter(
      (w) => w.repetition_count >= 5 && (w.last_performance ?? 0) >= 4
    );
    const in_progress = words.filter(
      (w) => w.repetition_count >= 1 && !(w.repetition_count >= 5 && (w.last_performance ?? 0) >= 4)
    );
    const new_words = words.filter((w) => w.repetition_count === 0);

    return reply.send({
      total_searched: words.length,
      mastered,
      in_progress,
      new_words,
      level: getLevel(mastered.length),
      weak_words: weakRows.rows,
    });
  });
}
