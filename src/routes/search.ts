import { FastifyInstance } from 'fastify';
import { pool } from '../db/client';
import { getDifficultyScore } from '../services/difficulty';

const schema = {
  body: {
    type: 'object',
    required: ['user_id', 'input'],
    properties: {
      user_id: { type: 'string', minLength: 1 },
      input: { type: 'string', minLength: 1 },
      searched_at: { type: 'string', format: 'date-time' },
    },
    additionalProperties: false,
  },
} as const;

interface SearchBody {
  user_id: string;
  input: string;
  searched_at?: string;
}

export async function searchRoutes(app: FastifyInstance) {
  app.post<{ Body: SearchBody }>('/api/search', { schema }, async (request, reply) => {
    const { user_id, input, searched_at } = request.body;

    const input_normalised = input.toLowerCase().trim();
    const difficulty_score = getDifficultyScore(input_normalised);

    const cached = await pool.query(
      'SELECT result_payload FROM result_cache WHERE input_normalised = $1',
      [input_normalised]
    );

    await pool.query(
      `INSERT INTO searches (user_id, raw_input, input_normalised, difficulty_score, searched_at)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (user_id, input_normalised, searched_at) DO NOTHING`,
      [user_id, input, input_normalised, difficulty_score, searched_at ?? new Date()]
    );

    if (cached.rowCount && cached.rowCount > 0) {
      return reply.send({ source: 'cache', result: cached.rows[0].result_payload });
    }

    return reply.send({ source: 'miss', result: null });
  });
}
