import entries from 'subtlex-word-frequencies';

const rankMap = new Map<string, number>();
entries.forEach((entry, index) => {
  rankMap.set(entry.word.toLowerCase(), index + 1);
});

const CORPUS_SIZE = entries.length;

export function getDifficultyScore(input: string): number {
  const firstWord = input.toLowerCase().trim().split(/\s+/)[0];
  const rank = rankMap.get(firstWord);

  if (!rank) return 8;

  const score = Math.ceil((rank / CORPUS_SIZE) * 10);
  return Math.min(Math.max(score, 1), 10);
}
