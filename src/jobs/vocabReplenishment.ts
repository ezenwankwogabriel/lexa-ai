import cron from 'node-cron';
import { pool } from '../db/client';
import { generateWordsForCluster } from '../routes/expand';

const UNSEEN_THRESHOLD = 20;
const AFFECTED_USER_RATIO = 0.1;

async function replenishVocabulary() {
  // Active users: completed at least one expand session
  const { rows: activeUserRows } = await pool.query<{ count: string }>(
    'SELECT COUNT(DISTINCT user_id) AS count FROM expand_session_log'
  );
  const activeUsers = parseInt(activeUserRows[0]?.count ?? '0', 10);
  if (activeUsers === 0) return;

  const { rows: clusters } = await pool.query<{ id: number; name: string }>(
    'SELECT id, name FROM clusters ORDER BY id'
  );

  for (const cluster of clusters) {
    // Count users for whom unseen words in this cluster fall below threshold
    const { rows: depletedRows } = await pool.query<{ count: string }>(
      `SELECT COUNT(*) AS count
       FROM (
         SELECT esl.user_id,
           (SELECT COUNT(*) FROM vocabulary_bank vb
            WHERE vb.cluster_id = $1
              AND vb.word != ALL(
                SELECT jsonb_array_elements_text(esl2.words_shown)
                FROM expand_session_log esl2
                WHERE esl2.user_id = esl.user_id
              )
           ) AS unseen_count
         FROM (SELECT DISTINCT user_id FROM expand_session_log) esl
       ) sub
       WHERE sub.unseen_count < $2`,
      [cluster.id, UNSEEN_THRESHOLD]
    );

    const depletedUsers = parseInt(depletedRows[0]?.count ?? '0', 10);
    const ratio = activeUsers > 0 ? depletedUsers / activeUsers : 0;

    if (ratio > AFFECTED_USER_RATIO) {
      console.log(
        `[vocabReplenishment] cluster "${cluster.name}" depleted for ${depletedUsers}/${activeUsers} users — generating`
      );
      try {
        const result = await generateWordsForCluster(cluster.name, 10, 'cron');
        console.log(`[vocabReplenishment] added ${result.words_added} words to "${cluster.name}"`);
      } catch (err) {
        console.error(`[vocabReplenishment] failed for cluster "${cluster.name}":`, err);
      }
    }
  }
}

export function startVocabReplenishmentJob() {
  // Run daily at 3 AM UTC
  cron.schedule('0 3 * * *', () => {
    replenishVocabulary().catch((err) => console.error('[vocabReplenishment]', err));
  });
}
