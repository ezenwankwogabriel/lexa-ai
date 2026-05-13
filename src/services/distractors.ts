import Anthropic from '@anthropic-ai/sdk';
import { pool } from '../db/client';

const client = new Anthropic();

async function attempt(word: string, coreMeaning: string): Promise<string[] | null> {
  const response = await client.messages.create({
    model: 'claude-haiku-4-5',
    max_tokens: 200,
    system: 'You are a vocabulary question designer.\nReturn only valid JSON. No explanation.',
    messages: [
      {
        role: 'user',
        content:
          `Generate 3 distractor words for a multiple choice vocabulary question where the correct answer is "${word}" meaning "${coreMeaning}".\n\n` +
          `Rules:\n` +
          `- Same part of speech as the target word\n` +
          `- Clearly different in meaning — there must be only one defensible answer\n` +
          `- Similar difficulty level to the target word\n` +
          `- Do not use synonyms or near-synonyms of the target\n` +
          `- If the target is a phrase, distractors should also be phrases of the same grammatical pattern\n` +
          `- If the target is a pattern variant (e.g. "agree on"), do not use other variants of the same verb (e.g. "agree with", "agree to") as distractors\n\n` +
          `Return a JSON array of exactly 3 strings.\nExample: ["methodical", "hesitant", "candid"]`,
      },
    ],
  });

  const first = response.content[0];
  if (first.type !== 'text') return null;

  const raw = first.text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed) || parsed.length < 3) return null;
  return (parsed as unknown[]).slice(0, 3).map(String);
}

export async function generateDistractors(
  word: string,
  coreMeaning: string
): Promise<string[] | null> {
  try {
    const result = await attempt(word, coreMeaning);
    if (result !== null) return result;
  } catch {
    // first attempt failed — fall through to retry
  }
  try {
    return await attempt(word, coreMeaning);
  } catch {
    return null;
  }
}

export async function scheduleDistractors(
  reviewQueueId: string,
  word: string,
  coreMeaning: string
): Promise<void> {
  const distractors = await generateDistractors(word, coreMeaning);
  if (distractors !== null) {
    await pool.query(
      'UPDATE review_queue SET distractors = $1 WHERE id = $2',
      [JSON.stringify(distractors), reviewQueueId]
    );
  }
}
