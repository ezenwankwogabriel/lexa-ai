import 'dotenv/config';
import { generateVocabResult } from '../src/services/ai';
import { pool } from '../src/db/client';
import pLimit from 'p-limit';

const WORDS = [
  // adjectives
  'good', 'happy', 'sad', 'important', 'interesting', 'beautiful', 'terrible',
  'amazing', 'awful', 'great', 'nice', 'bad', 'big', 'small', 'fast', 'slow',
  'smart', 'stupid', 'strong', 'weak', 'rich', 'poor', 'old', 'new', 'easy',
  'hard', 'clear', 'dark', 'light', 'heavy', 'angry', 'calm', 'brave', 'shy',
  'kind', 'mean', 'proud', 'humble', 'honest', 'rude', 'careful', 'careless',
  'serious', 'funny', 'boring', 'exciting', 'dangerous', 'safe', 'useful', 'useless',
  // verbs
  'accept', 'agree', 'allow', 'avoid', 'begin', 'believe', 'bring', 'build',
  'buy', 'call', 'carry', 'catch', 'change', 'choose', 'come', 'consider',
  'continue', 'create', 'decide', 'discover', 'discuss', 'feel', 'find', 'finish',
  'follow', 'forget', 'give', 'grow', 'happen', 'hear', 'help', 'hold', 'hope',
  'improve', 'include', 'keep', 'know', 'learn', 'leave', 'let', 'like', 'listen',
  'live', 'look', 'lose', 'love', 'make', 'mean', 'meet', 'move', 'need', 'offer',
  'open', 'pay', 'plan', 'play', 'provide', 'put', 'reach', 'read', 'realize',
  'receive', 'remember', 'run', 'say', 'see', 'seem', 'send', 'show', 'start',
  'stay', 'stop', 'take', 'talk', 'tell', 'think', 'try', 'turn', 'understand',
  'use', 'wait', 'want', 'work', 'write',
  // nouns
  'ability', 'action', 'advantage', 'agreement', 'answer', 'area', 'attempt',
  'attention', 'attitude', 'balance', 'barrier', 'benefit', 'challenge', 'choice',
  'clarity', 'commitment', 'communication', 'community', 'complexity', 'concern',
  'confidence', 'conflict', 'connection', 'consequence', 'context', 'contribution',
  'control', 'creativity', 'culture', 'decision', 'detail', 'difference',
  'difficulty', 'direction', 'discipline', 'discussion', 'diversity', 'effort',
  'emotion', 'energy', 'environment', 'evidence', 'experience', 'failure',
  'feedback', 'focus', 'freedom', 'growth', 'habit', 'impact', 'improvement',
  'influence', 'information', 'initiative', 'innovation', 'insight', 'integrity',
  'interaction', 'interest', 'issue', 'judgment', 'knowledge', 'language',
  'leadership', 'limitation', 'mindset', 'motivation', 'opportunity', 'outcome',
  'passion', 'patience', 'perception', 'performance', 'perspective', 'potential',
  'pressure', 'priority', 'problem', 'process', 'progress', 'purpose', 'quality',
  'relationship', 'responsibility', 'result', 'risk', 'solution', 'strategy',
  'strength', 'structure', 'success', 'support', 'tension', 'trust', 'uncertainty',
  'understanding', 'value', 'vision', 'weakness',
  // power words
  'meticulous', 'eloquent', 'articulate', 'compelling', 'concise', 'profound',
  'subtle', 'nuanced', 'sophisticated', 'resilient', 'tenacious', 'diligent',
  'methodical', 'pragmatic', 'innovative', 'collaborative', 'transparent',
  'authentic', 'empathetic', 'decisive',
  // phrases
  'agree on', 'agree with', 'agree to', 'interested in', 'good at',
  'responsible for', 'capable of', 'committed to', 'focused on', 'aware of',
  'before accepting', 'prior to', 'in addition to', 'as a result', 'in contrast',
  // sentences
  'the food was good', 'the meeting was good', 'it was a good experience',
  'the presentation was good', 'she did a good job',
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
