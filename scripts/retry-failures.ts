import 'dotenv/config';
import { generateVocabResult } from '../src/services/ai';
import { pool } from '../src/db/client';
import pLimit from 'p-limit';
import { readFile } from 'fs/promises';
import { existsSync } from 'fs';

const FAILURES_FILE = 'scripts/warm-cache-failures.txt';

async function retryFailures() {
  if (!existsSync(FAILURES_FILE)) {
    console.log('No failures file found at', FAILURES_FILE);
    await pool.end();
    return;
  }

  const content = await readFile(FAILURES_FILE, 'utf8');
  const words = content.split('\n').map((w) => w.trim()).filter(Boolean);

  if (words.length === 0) {
    console.log('Failures file is empty — nothing to retry.');
    await pool.end();
    return;
  }

  console.log(`Retrying ${words.length} failed words...`);

  let success = 0;
  let failed = 0;
  const stillFailing: string[] = [];

  const limit = pLimit(3);

  const tasks = words.map((word) =>
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
        stillFailing.push(word);
      }
      process.stdout.write(
        `\r✓ ${success} cached | ✗ ${failed} failed | ${words.length - success - failed} remaining  `
      );
      await new Promise((res) => setTimeout(res, 200));
    })
  );

  await Promise.all(tasks);

  console.log('\n\nDone.');
  console.log(`✓ Success: ${success}`);
  console.log(`✗ Failed: ${failed}`);

  if (stillFailing.length > 0) {
    const fs = await import('fs/promises');
    await fs.writeFile(FAILURES_FILE, stillFailing.join('\n'));
    console.log('Still failing:', stillFailing.join(', '));
    console.log('Updated failures written to', FAILURES_FILE);
  } else {
    const fs = await import('fs/promises');
    await fs.unlink(FAILURES_FILE);
    console.log('All retries succeeded — failures file removed.');
  }

  await pool.end();
}

retryFailures().catch(console.error);
