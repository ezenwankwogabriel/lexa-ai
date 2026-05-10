export type VocabResult = {
  input_type: 'word' | 'phrase' | 'sentence';
  meaning: string;
  usage_cues: string[];
  examples: {
    formal: string;
    casual: string;
    professional: string;
  };
  alternatives: {
    word: string;
    tone: 'neutral' | 'formal' | 'casual' | 'emphatic';
    intensity: 'mild' | 'moderate' | 'strong';
  }[];
  patterns: string[];
  sentence_upgrade: string | null;
};
