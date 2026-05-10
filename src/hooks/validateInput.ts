import { FastifyRequest, FastifyReply } from 'fastify';

export async function validateInput(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const body = request.body as { input?: string };
  if (typeof body?.input !== 'string') return;

  const trimmed = body.input.trim();

  if (trimmed.length === 0) {
    reply.status(400).send({ error: 'EMPTY_INPUT' });
    return;
  }

  body.input = trimmed;
}
