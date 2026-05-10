import { FastifyRequest, FastifyReply } from 'fastify';

const WINDOW_MS = 60_000;
const MAX_REQUESTS = 30;

const store = new Map<string, { count: number; reset: number }>();

export async function rateLimit(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const { user_id } = request.body as { user_id: string };
  const now = Date.now();
  const entry = store.get(user_id);

  if (!entry || now >= entry.reset) {
    store.set(user_id, { count: 1, reset: now + WINDOW_MS });
    return;
  }

  if (entry.count >= MAX_REQUESTS) {
    const retry_after = Math.ceil((entry.reset - now) / 1000);
    reply.status(429).send({ error: 'RATE_LIMITED', retry_after });
    return;
  }

  entry.count++;
}
