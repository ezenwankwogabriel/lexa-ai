import { FastifyInstance } from 'fastify';
import { pool } from '../db/client';

const schema = {
  body: {
    type: 'object',
    required: ['device_id', 'platform'],
    properties: {
      device_id: { type: 'string', minLength: 1 },
      platform: { type: 'string', enum: ['ios', 'android'] },
    },
    additionalProperties: false,
  },
} as const;

interface IdentifyBody {
  device_id: string;
  platform: 'ios' | 'android';
}

export async function identifyRoutes(app: FastifyInstance) {
  app.post<{ Body: IdentifyBody }>('/api/identify', { schema }, async (request, reply) => {
    const { device_id, platform } = request.body;

    const insert = await pool.query(
      `INSERT INTO users (device_id, platform)
       VALUES ($1, $2)
       ON CONFLICT (device_id) DO NOTHING`,
      [device_id, platform]
    );

    const is_new = (insert.rowCount ?? 0) > 0;

    const { rows } = await pool.query(
      'SELECT id FROM users WHERE device_id = $1',
      [device_id]
    );

    return reply.code(is_new ? 201 : 200).send({
      user_id: rows[0].id,
      is_new,
    });
  });
}
