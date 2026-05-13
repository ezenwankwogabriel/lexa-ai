import { FastifyInstance } from 'fastify';
import { pool } from '../db/client';

interface QuizQuery {
  word: string;
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export async function quizRoutes(app: FastifyInstance) {
  app.get<{ Querystring: QuizQuery }>('/api/quiz', {
    schema: {
      querystring: {
        type: 'object',
        required: ['word'],
        properties: {
          word: { type: 'string', minLength: 1, maxLength: 200 },
        },
      },
    },
  }, async (request, reply) => {
    const word = request.query.word.toLowerCase().trim();

    // Get the meaning from result_cache
    const cacheRow = await pool.query(
      `SELECT result_payload->>'meaning' AS meaning, result_payload->>'input_type' AS input_type
       FROM result_cache WHERE input_normalised = $1`,
      [word]
    );

    if (!cacheRow.rowCount) {
      return reply.status(404).send({ error: 'WORD_NOT_FOUND' });
    }

    const correctMeaning = cacheRow.rows[0].meaning as string;

    // Try to find distractors from vocabulary_bank in the same cluster
    const clusterRow = await pool.query(
      `SELECT vb.cluster_id FROM vocabulary_bank vb WHERE vb.word = $1 LIMIT 1`,
      [word]
    );

    let distractors: string[] = [];

    if (clusterRow.rowCount && clusterRow.rows[0].cluster_id) {
      const clusterId = clusterRow.rows[0].cluster_id as number;
      const sameCluster = await pool.query(
        `SELECT core_meaning FROM vocabulary_bank
         WHERE cluster_id = $1 AND word != $2
         ORDER BY RANDOM() LIMIT 2`,
        [clusterId, word]
      );
      distractors = sameCluster.rows.map((r) => r.core_meaning as string);
    }

    // If we still need more distractors, pull from any cluster
    if (distractors.length < 2) {
      const needed = 2 - distractors.length;
      const anyCluster = await pool.query(
        `SELECT core_meaning FROM vocabulary_bank
         WHERE word != $1 AND core_meaning != ALL($2::text[])
         ORDER BY RANDOM() LIMIT $3`,
        [word, distractors, needed]
      );
      distractors = [...distractors, ...anyCluster.rows.map((r) => r.core_meaning as string)];
    }

    // Last resort: use result_cache meanings as distractors
    if (distractors.length < 2) {
      const needed = 2 - distractors.length;
      const fromCache = await pool.query(
        `SELECT result_payload->>'meaning' AS meaning
         FROM result_cache
         WHERE input_normalised != $1
           AND (result_payload->>'meaning') != ALL($2::text[])
         ORDER BY RANDOM() LIMIT $3`,
        [word, distractors, needed]
      );
      distractors = [...distractors, ...fromCache.rows.map((r) => r.meaning as string)];
    }

    const options = shuffle([
      { meaning: correctMeaning, is_correct: true },
      ...distractors.slice(0, 2).map((m) => ({ meaning: m, is_correct: false })),
    ]);

    return reply.send({ word, options });
  });
}
