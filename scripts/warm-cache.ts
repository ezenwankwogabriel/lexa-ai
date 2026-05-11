import 'dotenv/config';
import { generateVocabResult } from '../src/services/ai';
import { pool } from '../src/db/client';
import pLimit from 'p-limit';

const WORDS = [
  'discuss', 'look', 'play', 'put', 'remember', 'seem', 'stop', 'try',
  'understand', 'write', 'advantage', 'agreement', 'challenge', 'choice',
  'commitment', 'communication', 'community', 'concern', 'consequence',
  'creativity', 'detail', 'direction', 'evidence', 'habit', 'initiative',
  'interest', 'judgment', 'issue', 'limitation', 'opportunity', 'outcome',
  'performance', 'pressure', 'process', 'result', 'strategy', 'strength',
  'uncertainty', 'success', 'weakness', 'eloquent', 'nuanced', 'sophisticated',
  'resilient', 'pragmatic', 'transparent', 'decisive', 'agree with',
  'interested in', 'committed to', 'before accepting',
];

async function warmCache() {
  const existing = await pool.query('SELECT input_normalised FROM result_cache');
  const cached = new Set<string>(existing.rows.map((r: { input_normalised: string }) => r.input_normalised));

  const toProcess = WORDS
    .map((w) => w.toLowerCase().trim())
    .filter((w) => !cached.has(w));

  console.log(`Total: ${WORDS.length} | Already cached: ${cached.size} | To process: ${toProcess.length}`);
  if (toProcess.length === 0) {
    console.log('Nothing to do.');
    await pool.end();
    return;
  }

  let success = 0;
  let failed = 0;
  const failures: string[] = [];

  const limit = pLimit(3);

  const tasks = toProcess.map((word) =>
    limit(async () => {
      try {
        const result = await generateVocabResult(word);
        await pool.query(
          `INSERT INTO result_cache (input_normalised, result_payload)
           VALUES ($1, $2)
           ON CONFLICT (input_normalised) DO NOTHING`,
          [word, JSON.stringify(result)]
        );
        success++;
      } catch {
        failed++;
        failures.push(word);
      }
      process.stdout.write(
        `\r✓ ${success} cached | ✗ ${failed} failed | ${toProcess.length - success - failed} remaining  `
      );
      await new Promise((res) => setTimeout(res, 200));
    })
  );

  await Promise.all(tasks);

  console.log('\n\nDone.');
  console.log(`✓ Success: ${success}`);
  console.log(`✗ Failed: ${failed}`);

  if (failures.length > 0) {
    console.log('Failed words:', failures.join(', '));
    const fs = await import('fs/promises');
    await fs.writeFile('scripts/warm-cache-failures.txt', failures.join('\n'));
    console.log('Failures written to scripts/warm-cache-failures.txt');
  }

  await pool.end();
}

warmCache().catch(console.error);
