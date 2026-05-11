import { FastifyInstance } from 'fastify';
import { pool } from '../db/client';

const tokenSchema = {
  body: {
    type: 'object',
    required: ['user_id', 'push_token'],
    properties: {
      user_id: { type: 'string', minLength: 1 },
      push_token: { type: 'string', minLength: 1 },
    },
    additionalProperties: false,
  },
} as const;

const settingsSchema = {
  body: {
    type: 'object',
    required: ['user_id', 'notification_enabled', 'notification_hour'],
    properties: {
      user_id: { type: 'string', minLength: 1 },
      notification_enabled: { type: 'boolean' },
      notification_hour: { type: 'integer', minimum: 0, maximum: 23 },
    },
    additionalProperties: false,
  },
} as const;

const getSettingsSchema = {
  querystring: {
    type: 'object',
    required: ['user_id'],
    properties: {
      user_id: { type: 'string', minLength: 1 },
    },
    additionalProperties: false,
  },
} as const;

interface TokenBody { user_id: string; push_token: string }
interface SettingsBody { user_id: string; notification_enabled: boolean; notification_hour: number }
interface SettingsQuery { user_id: string }

export async function deviceRoutes(app: FastifyInstance) {
  // POST /api/device/token — register / refresh push token
  app.post<{ Body: TokenBody }>('/api/device/token', { schema: tokenSchema }, async (request, reply) => {
    const { user_id, push_token } = request.body;
    await pool.query(
      'UPDATE users SET push_token = $2 WHERE id = $1',
      [user_id, push_token]
    );
    return reply.send({ ok: true });
  });

  // PATCH /api/device/settings — update notification preferences
  app.patch<{ Body: SettingsBody }>('/api/device/settings', { schema: settingsSchema }, async (request, reply) => {
    const { user_id, notification_enabled, notification_hour } = request.body;
    await pool.query(
      'UPDATE users SET notification_enabled = $2, notification_hour = $3 WHERE id = $1',
      [user_id, notification_enabled, notification_hour]
    );
    return reply.send({ ok: true });
  });

  // GET /api/device/settings — read notification preferences
  app.get<{ Querystring: SettingsQuery }>('/api/device/settings', { schema: getSettingsSchema }, async (request, reply) => {
    const { user_id } = request.query;
    const { rows } = await pool.query(
      'SELECT notification_enabled, notification_hour FROM users WHERE id = $1',
      [user_id]
    );
    if (!rows[0]) return reply.status(404).send({ error: 'USER_NOT_FOUND' });
    return reply.send(rows[0]);
  });
}
