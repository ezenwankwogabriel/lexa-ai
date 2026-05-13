import { pool } from '../db/client';
import { scheduleDistractors } from '../services/distractors';

export async function runDistractorBackfill(): Promise<void> {
  const { rows: countRows } = await pool.query<{ cnt: string }>(
    `SELECT COUNT(*) AS cnt FROM review_queue WHERE distractors IS NULL AND source = 'search'`
  );
  let remaining = parseInt(countRows[0].cnt, 10);
  if (remaining === 0) return;

  console.log(`Backfilling distractors: ${remaining} remaining`);

  while (remaining > 0) {
    const { rows } = await pool.query<{ id: string; input_normalised: string; meaning: string }>(
      `SELECT rq.id, rq.input_normalised, rc.result_payload->>'meaning' AS meaning
       FROM review_queue rq
       JOIN result_cache rc ON rc.input_normalised = rq.input_normalised
       WHERE rq.distractors IS NULL AND rq.source = 'search'
       LIMIT 10`
    );
    if (rows.length === 0) break;

    await Promise.all(rows.map((row) => scheduleDistractors(row.id, row.input_normalised, row.meaning)));

    const { rows: remainingRows } = await pool.query<{ cnt: string }>(
      `SELECT COUNT(*) AS cnt FROM review_queue WHERE distractors IS NULL AND source = 'search'`
    );
    remaining = parseInt(remainingRows[0].cnt, 10);
    if (remaining > 0) {
      console.log(`Backfilling distractors: ${remaining} remaining`);
      await new Promise<void>((resolve) => setTimeout(resolve, 500));
    }
  }
}
