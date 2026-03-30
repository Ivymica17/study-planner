export const GENERATION_DEFAULTS = {
  mode: 'Quiz',
  difficulty: 'Mixed',
  format: 'Both',
};

const ALLOWED_MODES = new Set(['Class Prep', 'Quiz', 'College', 'Board']);
const ALLOWED_DIFFICULTIES = new Set(['Easy', 'Medium', 'Hard', 'Mixed']);
const ALLOWED_FORMATS = new Set(['Flashcards', 'Quiz', 'Both']);

export function normalizeGenerationOptions(input = {}) {
  const mode = ALLOWED_MODES.has(input.mode) ? input.mode : GENERATION_DEFAULTS.mode;
  const difficulty = ALLOWED_DIFFICULTIES.has(input.difficulty) ? input.difficulty : GENERATION_DEFAULTS.difficulty;
  const format = ALLOWED_FORMATS.has(input.format) ? input.format : GENERATION_DEFAULTS.format;
  return { mode, difficulty, format };
}

export function mapDifficultyLabel(label = 'Mixed', index = 0, total = 12) {
  if (label === 'Easy') return 'easy';
  if (label === 'Medium') return 'medium';
  if (label === 'Hard') return 'hard';

  if (total <= 1) return 'medium';
  const easyCutoff = Math.ceil(total / 3);
  const mediumCutoff = Math.ceil((2 * total) / 3);
  if (index < easyCutoff) return 'easy';
  if (index < mediumCutoff) return 'medium';
  return 'hard';
}

export function buildQuizPrompt(profile) {
  const { mode, difficulty } = normalizeGenerationOptions(profile);

  const modeInstruction = mode === 'Class Prep'
    ? 'Create direct, simple, recall-based questions grounded strictly in the module. Module wording may be used when appropriate.'
    : mode === 'Quiz'
      ? 'Create moderate-difficulty questions that test concept understanding, not just recognition.'
      : mode === 'College'
        ? 'Create analytical, situational, multi-step questions that require interpretation and practical academic reasoning.'
        : 'Create complex, tricky, real-world application questions in a board-exam style.';

  const difficultyInstruction = difficulty === 'Easy'
    ? 'Keep the set easy: focus on recall and identification. Direct module wording is allowed.'
    : difficulty === 'Medium'
      ? 'Keep the set medium: focus on application and explanation.'
      : difficulty === 'Hard'
        ? 'Keep the set hard: focus on analysis, problem-solving, and close discrimination between plausible options.'
        : 'Keep the set mixed: include a balanced spread of easy, medium, and hard questions.';

  return `Act as an expert teacher and exam creator. Generate high-quality questions strictly based on the uploaded module only. ${modeInstruction} ${difficultyInstruction} Core rules: you may copy sentences directly from the module when appropriate, but do not overuse the same sentence across multiple questions. Do not repeat questions. Do not test the same concept more than once. Each question must assess a unique concept, idea, or application from the module. Format rules: output multiple-choice questions only, each with exactly 4 options, 1 correct answer, and plausible distractors. Avoid "all of the above" and "none of the above". Quality rules: avoid repetitive wording or patterns, keep questions clear and accurate, mix direct module-based wording with rephrased wording when appropriate, and use scenario-based questions for higher modes. Output JSON only in this structure: {"questions":[{"question":"...","options":["...","...","...","..."],"correctAnswer":0,"explanation":"..."}]}`;
}

export function buildFlashcardGuidance(profile) {
  const { mode, difficulty } = normalizeGenerationOptions(profile);

  const modeGuidance = mode === 'Class Prep'
    ? 'Use direct, simple, recall-based prompts. Module wording may be used when appropriate.'
    : mode === 'Quiz'
      ? 'Use moderate-difficulty prompts that check concept understanding and light application.'
      : mode === 'College'
        ? 'Use analytical, situational prompts that make the learner reason through the concept.'
        : 'Use complex, tricky, real-world prompts that require sound application and judgment.';

  const difficultyGuidance = difficulty === 'Easy'
    ? 'Keep prompts easy and recall-oriented.'
    : difficulty === 'Medium'
      ? 'Keep prompts at an application and explanation level.'
      : difficulty === 'Hard'
        ? 'Keep prompts analytical and problem-solving oriented.'
        : 'Keep the set balanced across easy, medium, and hard prompts.';

  return `${modeGuidance} ${difficultyGuidance} Use concise answers based strictly on the module. Avoid repeated concepts and repeated wording patterns.`;
}
