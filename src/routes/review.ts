import { FastifyInstance } from 'fastify';
import { pool } from '../db/client';

// ─── GET /api/review ─────────────────────────────────────────────────────────

const getDueSchema = {
  querystring: {
    type: 'object',
    required: ['user_id'],
    properties: {
      user_id: { type: 'string', minLength: 1 },
    },
    additionalProperties: false,
  },
} as const;

// ─── POST /api/review/result ─────────────────────────────────────────────────

const postResultSchema = {
  body: {
    type: 'object',
    required: ['user_id', 'review_id', 'performance'],
    properties: {
      user_id: { type: 'string', minLength: 1 },
      review_id: { type: 'string', minLength: 1 },
      performance: { type: 'integer', minimum: 0, maximum: 5 },
    },
    additionalProperties: false,
  },
} as const;

interface GetDueQuery {
  user_id: string;
}

interface PostResultBody {
  user_id: string;
  review_id: string;
  performance: number;
}

// ─── SM-2 ────────────────────────────────────────────────────────────────────

function applySM2(
  performance: number,
  repetitionCount: number,
  intervalDays: number,
  easeFactor: number
): { repetitionCount: number; intervalDays: number; easeFactor: number } {
  if (performance < 3) {
    return { repetitionCount: 0, intervalDays: 1, easeFactor };
  }

  let newInterval: number;
  if (repetitionCount === 0) {
    newInterval = 1;
  } else if (repetitionCount === 1) {
    newInterval = 3;
  } else {
    newInterval = Math.round(intervalDays * easeFactor);
  }

  const newEase = Math.max(
    1.3,
    easeFactor + (0.1 - (5 - performance) * (0.08 + (5 - performance) * 0.02))
  );

  return {
    repetitionCount: repetitionCount + 1,
    intervalDays: newInterval,
    easeFactor: newEase,
  };
}

// ─── routes ──────────────────────────────────────────────────────────────────

export async function reviewRoutes(app: FastifyInstance) {
  app.get<{ Querystring: GetDueQuery }>(
    '/api/review',
    { schema: getDueSchema },
    async (request, reply) => {
      const { user_id } = request.query;

      const { rows } = await pool.query(
        `SELECT
           rq.id              AS review_id,
           rq.input_normalised,
           rc.result_payload,
           rq.repetition_count
         FROM review_queue rq
         JOIN result_cache rc ON rc.input_normalised = rq.input_normalised
         WHERE rq.user_id = $1
           AND rq.next_review_at <= now()
         ORDER BY rq.next_review_at ASC
         LIMIT 10`,
        [user_id]
      );

      return reply.send({ due: rows });
    }
  );

  app.post<{ Body: PostResultBody }>(
    '/api/review/result',
    { schema: postResultSchema },
    async (request, reply) => {
      const { user_id, review_id, performance } = request.body;

      const existing = await pool.query(
        `SELECT interval_days, ease_factor, repetition_count
         FROM review_queue
         WHERE id = $1 AND user_id = $2`,
        [review_id, user_id]
      );

      if (!existing.rowCount) {
        return reply.status(404).send({ error: 'REVIEW_NOT_FOUND' });
      }

      const row = existing.rows[0];
      const { repetitionCount, intervalDays, easeFactor } = applySM2(
        performance,
        row.repetition_count,
        row.interval_days,
        parseFloat(row.ease_factor)
      );

      await pool.query(
        `UPDATE review_queue SET
           interval_days      = $1,
           ease_factor        = $2,
           repetition_count   = $3,
           last_performance   = $4,
           next_review_at     = now() + ($5 || ' days')::interval,
           updated_at         = now()
         WHERE id = $6 AND user_id = $7`,
        [intervalDays, easeFactor, repetitionCount, performance, intervalDays, review_id, user_id]
      );

      return reply.send({ ok: true, next_review_in_days: intervalDays });
    }
  );
}
