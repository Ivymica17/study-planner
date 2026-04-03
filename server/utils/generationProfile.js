export const GENERATION_DEFAULTS = {
  mode: 'Quiz',
  difficulty: 'Mixed',
  format: 'Both',
};

const MODE_ALIASES = {
  'Class Prep': 'Class',
  Class: 'Class',
  Quiz: 'Quiz',
  College: 'College',
  Board: 'Board',
};
const ALLOWED_DIFFICULTIES = new Set(['Easy', 'Medium', 'Hard', 'Mixed']);
const ALLOWED_FORMATS = new Set(['Flashcards', 'Quiz', 'Both']);

export function normalizeGenerationOptions(input = {}) {
  const mode = MODE_ALIASES[input.mode] || GENERATION_DEFAULTS.mode;
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
  const languageInstruction = profile?.language === 'tl'
    ? 'Write every question, option, and explanation in natural Tagalog/Filipino. Do not mix in English unless the uploaded module itself uses an English technical term that should remain unchanged.'
    : 'Write every question, option, and explanation in clear English unless the uploaded module strongly indicates another language should be preserved.';

  const modeInstruction = mode === 'Class'
    ? 'Create simple recall-focused classroom questions grounded strictly in the module.'
    : mode === 'Quiz'
      ? 'Create moderate questions that test concept understanding and light application.'
      : mode === 'College'
        ? 'Create analytical college-exam questions that require interpretation and practical academic reasoning.'
        : 'Create board-exam style questions using realistic scenarios, close answer choices, and strong practical judgment.';

  const difficultyInstruction = difficulty === 'Easy'
    ? 'Keep the set easy: focus on recall and identification. Direct module wording is allowed when natural.'
    : difficulty === 'Medium'
      ? 'Keep the set medium: focus on application and explanation.'
      : difficulty === 'Hard'
        ? 'Keep the set hard: focus on analysis, problem-solving, and close discrimination between plausible options.'
        : 'Keep the set mixed: include a balanced spread of easy, medium, and hard questions.';

  return `Act as an expert teacher, exam creator, and exam editor. Generate high-quality multiple-choice questions strictly from the uploaded module only. ${languageInstruction} ${modeInstruction} ${difficultyInstruction} Strict writing rules: do not use phrases such as "focus on" or "this module" in the generated questions or choices. Do not write meta-instructions or comments about the lesson. Each question must test understanding, interpretation, or application of one real concept from the source, not merely ask for a description of the lesson. Keep every item tied to one unique concept only and vary phrasing across the set. MCQ rules: each item must have exactly 4 options, 1 correct answer, and realistic distractors that are close, comparable, and exam-ready. Do not repeat the wording of the question inside the choices. Avoid trick-only answers, joke choices, "all of the above", and "none of the above". Difficulty rules: Easy should be recall-based, Medium should test understanding, and Hard should test analysis or application. Board Exam mode must be scenario-based. Coverage rules: do not repeat questions, do not reuse the same concept twice, and cover as many distinct concepts as the source supports. For every item, include a concise explanation of why the correct answer is right and a short explanation for each option explaining why it is correct or wrong. Output JSON only in this structure: {"questions":[{"question":"...","options":["...","...","...","..."],"correctAnswer":0,"difficulty":"easy|medium|hard","correctExplanation":"...","optionExplanations":["...","...","...","..."]}]}`;
}

export function buildFlashcardGuidance(profile) {
  const { mode, difficulty } = normalizeGenerationOptions(profile);

  const modeGuidance = mode === 'Class'
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

  return `${modeGuidance} ${difficultyGuidance} Flashcard rules: Front must be a clear question or concept prompt, Back must be a concise answer. Do not reuse the same concept twice. Remove weak or repetitive cards and keep the wording polished and study-ready.`;
}
