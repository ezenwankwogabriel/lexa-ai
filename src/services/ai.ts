import Anthropic from '@anthropic-ai/sdk';
import { VocabResult } from '../types/index';

const client = new Anthropic();

const SYSTEM_PROMPT = `You are a vocabulary coaching engine. Given a word, phrase, or sentence, \
return a JSON object that helps the user understand and improve their vocabulary.

Rules:
- meaning: one plain sentence, no dictionary tone, max 20 words
- usage_cues: 2-3 short usage patterns, e.g. "meticulous about X", "meticulous in X"
- examples: one sentence each for formal, casual, professional contexts
- alternatives: 3-5 better or related words, each with tone and intensity label
- patterns: only populate if input is a phrase like "agree on" — \
  list 2-4 similar patterns that are commonly confused, e.g. ["agree on", "agree with", "agree to"]
  leave as empty array [] if input is a single word or sentence
- sentence_upgrade: only populate if input is a full sentence or weak expression \
  like "the movie was good" — return 2-3 stronger rewrites as a single string, \
  pipe-separated e.g. "The film was captivating.|The movie was gripping.|It was an unforgettable watch."
  return null if input is a single word
- input_type: classify the input as 'word', 'phrase', or 'sentence'

Return ONLY valid JSON matching this exact shape. No markdown, no explanation.`;

export async function generateVocabResult(input: string): Promise<VocabResult> {
  const response = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 600,
    system: [
      {
        type: 'text',
        text: SYSTEM_PROMPT,
        cache_control: { type: 'ephemeral' },
      },
    ],
    messages: [{ role: 'user', content: input }],
  });

  const first = response.content[0];
  if (first.type !== 'text') {
    throw new Error('AI_PARSE_ERROR');
  }

  try {
    return JSON.parse(first.text) as VocabResult;
  } catch {
    throw new Error('AI_PARSE_ERROR');
  }
}
