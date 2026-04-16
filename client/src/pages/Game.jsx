
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import gameOwlFace from '../assets/game-owl-face-removebg.png';
import {
  isSoundEnabled,
  playSound,
  preloadSounds,
  setSoundEnabled,
} from '../utils/sound.js';

const MODE_CONFIG = {
  classic: {
    label: 'Classic',
    description: 'Guess the term letter by letter.',
    attempts: 5,
  },
  clue: {
    label: 'Clue',
    description: 'Solve the term from a definition or hint.',
    attempts: 5,
  },
};

const SOURCE_MODE_CONFIG = {
  study: {
    label: 'Study Mode',
    description: 'Pulls from your uploaded lessons first so each round feels tied to what you are studying.',
    emptyMessage: 'No study words are available yet. Upload a module to unlock this mode.',
  },
  general: {
    label: 'Play Mode',
    description: 'Loads a lighter mixed word set for quick rounds and casual practice.',
    emptyMessage: 'No general vocabulary items are available right now.',
  },
};

const LEADERBOARD_KEY = 'word-challenge-leaderboard';
const RECENT_WORDS_KEY = 'word-challenge-recent-history';
const PLAYED_WORDS_KEY = 'word-challenge-played-history';
const GAME_PROGRESS_KEY = 'word-challenge-progress';
const HEART_RECOVERY_KEY = 'word-challenge-heart-recovery';
const MAX_RECENT_WORDS = 36;
const MAX_PLAYED_WORDS = 500;
const SESSION_GENERATION_TARGET = 8;
const MAX_LEVEL = 100;
const HEART_REFILL_MINUTES = 10;
const HEART_REFILL_MS = HEART_REFILL_MINUTES * 60 * 1000;
const MAX_DAILY_AD_HEARTS = 3;

const LOCAL_WORD_BANK = {
  general: [
    { word: 'Adapt', hint: 'To adjust well to a new place, task, or situation.', difficulty: 'easy', category: 'Everyday Vocabulary' },
    { word: 'Curious', hint: 'Eager to learn, ask questions, or discover something new.', difficulty: 'easy', category: 'Personality Trait' },
    { word: 'Observe', hint: 'To watch carefully and notice details.', difficulty: 'easy', category: 'Action Verb' },
    { word: 'Combine', hint: 'To join two or more things into one.', difficulty: 'easy', category: 'Action Verb' },
    { word: 'Predict', hint: 'To say what is likely to happen before it happens.', difficulty: 'medium', category: 'Thinking Skill' },
    { word: 'Precise', hint: 'Very exact, accurate, and carefully stated.', difficulty: 'medium', category: 'Descriptive Adjective' },
    { word: 'Scarce', hint: 'Not easy to find because there is only a small amount.', difficulty: 'medium', category: 'Descriptive Adjective' },
    { word: 'Resilient', hint: 'Able to recover quickly after difficulty or pressure.', difficulty: 'hard', category: 'Character Trait' },
    { word: 'Innovate', hint: 'To introduce useful new ideas, methods, or products.', difficulty: 'hard', category: 'Action Verb' },
    { word: 'Ambiguous', hint: 'Unclear because it can be understood in more than one way.', difficulty: 'hard', category: 'Descriptive Adjective' },
  ],
  exam: [
    { word: 'Hypothesis', hint: 'A testable explanation proposed before gathering full evidence.', difficulty: 'easy', category: 'Science' },
    { word: 'Equation', hint: 'A mathematical statement showing two expressions are equal.', difficulty: 'easy', category: 'Mathematics' },
    { word: 'Ecosystem', hint: 'A community of living things interacting with their environment.', difficulty: 'easy', category: 'Biology' },
    { word: 'Algorithm', hint: 'A step-by-step process used to solve a problem or complete a task.', difficulty: 'medium', category: 'Computer Science' },
    { word: 'Inference', hint: 'A conclusion reached using evidence and reasoning rather than direct statement.', difficulty: 'medium', category: 'Reading Comprehension' },
    { word: 'Velocity', hint: 'Speed measured together with direction.', difficulty: 'medium', category: 'Physics' },
    { word: 'Mitosis', hint: 'The process in which one cell divides into two identical cells.', difficulty: 'hard', category: 'Biology' },
    { word: 'Theorem', hint: 'A statement proven true using logical reasoning and established facts.', difficulty: 'hard', category: 'Mathematics' },
    { word: 'Sovereignty', hint: 'The full authority of a state to govern itself.', difficulty: 'hard', category: 'Political Science' },
    { word: 'Oxidation', hint: 'A chemical process involving the loss of electrons.', difficulty: 'hard', category: 'Chemistry' },
  ],
  fun: [
    { word: 'Otter', hint: 'A playful semi-aquatic animal known for floating on its back.', difficulty: 'easy', category: 'Animal' },
    { word: 'Lantern', hint: 'A portable light often carried by hand.', difficulty: 'easy', category: 'Object' },
    { word: 'Puzzle', hint: 'A game or problem that challenges you to find the answer.', difficulty: 'easy', category: 'Activity' },
    { word: 'Rocket', hint: 'A vehicle designed to travel through space using thrust.', difficulty: 'medium', category: 'Technology' },
    { word: 'Volcano', hint: 'A mountain that can erupt with lava, ash, and gas.', difficulty: 'medium', category: 'Nature' },
    { word: 'Telescope', hint: 'An instrument used to view distant objects, especially in the sky.', difficulty: 'medium', category: 'Object' },
    { word: 'Koala', hint: 'A tree-dwelling marsupial from Australia that eats eucalyptus leaves.', difficulty: 'hard', category: 'Animal' },
    { word: 'Firefly', hint: 'A small insect known for producing light at night.', difficulty: 'hard', category: 'Animal' },
    { word: 'Kaleidoscope', hint: 'A tube that creates changing colorful patterns with reflected light.', difficulty: 'hard', category: 'Object' },
    { word: 'Parachute', hint: 'A device that slows a fall through the air.', difficulty: 'hard', category: 'Object' },
  ],
};

const clampLevel = (value) => Math.max(1, Math.min(MAX_LEVEL, Number(value) || 1));

const getDifficultyForLevel = (level) => {
  const safeLevel = clampLevel(level);
  if (safeLevel <= 33) return 'easy';
  if (safeLevel <= 66) return 'medium';
  return 'hard';
};

const getLevelBandLabel = (level) => {
  const difficulty = getDifficultyForLevel(level);
  if (difficulty === 'easy') return 'Easy Arc';
  if (difficulty === 'medium') return 'Mid Arc';
  return 'Hard Arc';
};

const normalizeGameMode = (value) => {
  if (value === 'clue' || value === 'exam') return 'clue';
  return 'classic';
};

const buildSessionCacheKey = ({ wordSourceMode, selectedModule, difficulty }) =>
  [wordSourceMode, selectedModule, difficulty].join('::');

const normalizeGuess = (value) =>
  String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const uniqueLettersInWord = (word) =>
  [...new Set(
    String(word || '')
      .toLowerCase()
      .split('')
      .filter((char) => /[a-z0-9]/.test(char)),
  )];

const isClassicSolved = (word, guessedLetters = []) =>
  uniqueLettersInWord(word).every((char) => guessedLetters.includes(char));

const getDailySeed = () => new Date().toISOString().slice(0, 10);

const hashString = (value) =>
  String(value || '').split('').reduce((total, char) => total + char.charCodeAt(0), 0);

const sortForDailyChallenge = (items, seed) =>
  [...items].sort((left, right) => {
    const leftScore = hashString(`${seed}-${left.id}`);
    const rightScore = hashString(`${seed}-${right.id}`);
    return leftScore - rightScore;
  });

const loadLeaderboard = () => {
  try {
    const parsed = JSON.parse(localStorage.getItem(LEADERBOARD_KEY) || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const saveLeaderboardScore = (entry) => {
  try {
    const current = loadLeaderboard();
    const next = [...current, entry]
      .sort((left, right) => right.score - left.score || right.bestStreak - left.bestStreak)
      .slice(0, 5);
    localStorage.setItem(LEADERBOARD_KEY, JSON.stringify(next));
    return next;
  } catch {
    return loadLeaderboard();
  }
};

const loadRecentWordHistory = () => {
  try {
    const parsed = JSON.parse(localStorage.getItem(RECENT_WORDS_KEY) || '{}');
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
};

const loadSavedGameProgress = () => {
  try {
    const parsed = JSON.parse(localStorage.getItem(GAME_PROGRESS_KEY) || 'null');
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
};

const loadPlayedWordHistory = () => {
  try {
    const parsed = JSON.parse(localStorage.getItem(PLAYED_WORDS_KEY) || '{}');
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
};

const savePlayedWordHistory = (history) => {
  try {
    localStorage.setItem(PLAYED_WORDS_KEY, JSON.stringify(history));
  } catch {
    // Ignore storage write failures.
  }
};

const saveGameProgress = (progress) => {
  try {
    localStorage.setItem(GAME_PROGRESS_KEY, JSON.stringify(progress));
  } catch {
    // Ignore storage write failures.
  }
};

const clearSavedGameProgress = () => {
  try {
    localStorage.removeItem(GAME_PROGRESS_KEY);
  } catch {
    // Ignore storage write failures.
  }
};

const loadHeartRecoveryState = () => {
  try {
    const parsed = JSON.parse(localStorage.getItem(HEART_RECOVERY_KEY) || 'null');
    return parsed && typeof parsed === 'object'
      ? parsed
      : { unlockAt: null, adDate: '', adClaimsUsed: 0, subscriptionActive: false };
  } catch {
    return { unlockAt: null, adDate: '', adClaimsUsed: 0, subscriptionActive: false };
  }
};

const saveHeartRecoveryState = (state) => {
  try {
    localStorage.setItem(HEART_RECOVERY_KEY, JSON.stringify(state));
  } catch {
    // Ignore storage write failures.
  }
};


const saveRecentWordHistory = (history) => {
  try {
    localStorage.setItem(RECENT_WORDS_KEY, JSON.stringify(history));
  } catch {
    // Ignore storage write failures.
  }
};

const dedupeSessionItems = (items = []) => {
  const seen = new Set();
  return items.filter((item) => {
    const key = normalizeGuess(item?.word);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

const shuffleItems = (items = []) => [...items].sort(() => Math.random() - 0.5);

const buildScenario = (word, hint) =>
  `A student is reviewing a clue built around this idea: ${hint} Which keyword best fits?`;

const formatCountdown = (ms) => {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
};

const buildLocalGeneratedItems = ({
  wordSourceMode,
  selectedDifficulty,
  selectedModule,
  payloadItems = [],
  excludedModuleWords = [],
  excludeWords = [],
}) => {
  const excluded = new Set(
    [...excludeWords, ...(wordSourceMode === 'study' ? [] : excludedModuleWords)]
      .map((word) => normalizeGuess(word))
      .filter(Boolean),
  );
  if (wordSourceMode === 'study' && payloadItems.length === 0) {
    return [];
  }

  const bank =
    wordSourceMode === 'study'
      ? []
      : [...LOCAL_WORD_BANK.general, ...LOCAL_WORD_BANK.exam, ...LOCAL_WORD_BANK.fun];

  const sourcePool = wordSourceMode === 'study' && payloadItems.length > 0
    ? payloadItems.map((item, index) => ({
        ...item,
        id: item.id || `study-local-${index}`,
        hint: item.hint || item.clue,
        category: item.category || item.topic || 'Module Concept',
        source: item.source || item.sourceReference || item.moduleTitle || 'Study Mode',
        wordSourceMode: 'study',
      }))
    : bank.map((item, index) => ({
        id: `${wordSourceMode}-local-${normalizeGuess(item.word).replace(/\s+/g, '-')}-${index}`,
        moduleId: wordSourceMode === 'study' && selectedModule !== 'all' ? selectedModule : null,
        moduleTitle: null,
        word: item.word,
        clue: item.hint,
        hint: item.hint,
        scenario: buildScenario(item.word, item.hint),
        difficulty: item.difficulty,
        topic: item.category,
        category: item.category,
        source: wordSourceMode === 'study' ? 'Study Mode Fallback' : SOURCE_MODE_CONFIG[wordSourceMode].label,
        sourceReference: wordSourceMode === 'study' ? 'Study Mode Fallback' : SOURCE_MODE_CONFIG[wordSourceMode].label,
        wordSourceMode,
      }));

  const filteredItems = dedupeSessionItems(
    shuffleItems(sourcePool).filter((item) => {
      if (excluded.has(normalizeGuess(item.word))) return false;
      if (selectedDifficulty !== 'all' && item.difficulty !== selectedDifficulty) return false;
      return true;
    }),
  ).slice(0, SESSION_GENERATION_TARGET);

  if (filteredItems.length > 0) {
    return filteredItems;
  }

  return dedupeSessionItems(
    shuffleItems(sourcePool).filter((item) => {
      if (selectedDifficulty !== 'all' && item.difficulty !== selectedDifficulty) return false;
      return true;
    }),
  ).slice(0, SESSION_GENERATION_TARGET);
};

const matchesCurrentFilters = (item, { wordSourceMode, selectedModule, selectedDifficulty }) => {
  const itemSourceMode = item?.wordSourceMode || 'study';
  if (itemSourceMode !== wordSourceMode) {
    return false;
  }

  if (
    wordSourceMode === 'study'
    && selectedModule !== 'all'
    && item.moduleId
    && item.moduleId !== selectedModule
  ) {
    return false;
  }

  if (selectedDifficulty !== 'all' && item.difficulty !== selectedDifficulty) {
    return false;
  }

  return true;
};

const getLetterTiles = (word, guessedLetters = [], isSolved = false) =>
  String(word || '').split('').map((char, index) => {
    const isAlphaNumeric = /[a-z0-9]/i.test(char);
    const revealed = isAlphaNumeric && (isSolved || guessedLetters.includes(char.toLowerCase()));

    return {
      key: `${char}-${index}`,
      char,
      revealed,
      display: isAlphaNumeric ? (revealed ? char.toUpperCase() : '') : char,
      isSpacer: !isAlphaNumeric,
    };
  });

const getFeedbackDisplay = ({ feedbackTone, roundState, feedback, streak = 0, hintUsed = false }) => {
  if (!feedback) return { badge: '', subtext: '', tone: 'idle' };

  if (roundState === 'solved') {
    return {
      badge: hintUsed ? '🎉 CORRECT! +5 POINTS 🔥' : '🎉 CORRECT! +10 POINTS 🔥',
      subtext: streak > 1 ? `Streak up to ${streak} in a row.` : 'Nice start. Keep the run alive.',
      tone: 'correct',
    };
  }

  if (roundState === 'failed') {
    return {
      badge: '💭 SO CLOSE',
      subtext: feedback,
      tone: 'wrong',
    };
  }

  if (feedbackTone === 'wrong' || feedbackTone === 'low') {
    return {
      badge: '😵 OOPS! -3 POINTS',
      subtext: feedback,
      tone: 'wrong',
    };
  }

  if (feedbackTone === 'hint') {
    return {
      badge: '💡 OWL TIP',
      subtext: feedback,
      tone: 'hint',
    };
  }

  return {
    badge: '✨ NICE',
    subtext: feedback,
    tone: feedbackTone === 'correct' ? 'correct' : 'idle',
  };
};

const buildOwlSpeech = ({ currentItem, roundState, feedbackTone, feedback, hintUsed, hintText, mode, streak }) => {
  if (!currentItem) return 'Pick a setup and let’s play.';

  if (roundState === 'solved') {
    if (streak > 1) return `Yes! "${currentItem.word}" nailed it. You're on fire.`;
    return `Nice one. "${currentItem.word}" was it.`;
  }

  if (roundState === 'failed') {
    return `That one slipped by. It was "${currentItem.word}".`;
  }

  if ((feedbackTone === 'wrong' || feedbackTone === 'low') && feedback) {
    if (/already tried/i.test(feedback)) return 'That letter is already on the board.';
    if (/not in the answer/i.test(feedback)) return 'Hmm, that one is not in this word.';
    if (/Enter a valid letter/i.test(feedback)) return 'Give me one letter or the whole word.';
    return 'Not quite. Try another angle.';
  }

  if (hintUsed) {
    return mode === 'classic' ? 'Tiny clue coming up. You’ve got this.' : hintText;
  }

  if (mode === 'classic') return 'Try a letter first. I’ll nudge you if you need me.';
  return 'Read the clue, trust your instinct, then go for it.';
};

function OwlMascot({ mood, sizeClass = 'h-24 w-24' }) {
  const isCorrect = mood === 'correct' || mood === 'happy' || mood === 'streak';
  const isWrong = mood === 'wrong' || mood === 'confused' || mood === 'low';
  const accentColor = mood === 'streak'
    ? 'rgba(52, 211, 153, 0.45)'
    : isWrong
      ? 'rgba(248, 113, 113, 0.35)'
      : mood === 'thinking'
        ? 'rgba(125, 211, 252, 0.4)'
        : 'rgba(56, 189, 248, 0.34)';
  const shellGlow = mood === 'streak'
    ? 'drop-shadow(0 20px 30px rgba(16, 185, 129, 0.28))'
    : isWrong
      ? 'drop-shadow(0 18px 28px rgba(239, 68, 68, 0.16))'
      : 'drop-shadow(0 18px 28px rgba(37, 99, 235, 0.16))';

  return (
    <div className={`owl-mascot relative ${sizeClass} owl-mascot-${mood}`} aria-hidden="true">
      <div
        className="absolute inset-[8%] rounded-full blur-2xl"
        style={{ background: accentColor }}
      />
      <img
        src={gameOwlFace}
        alt=""
        className="owl-mascot-art relative h-full w-full object-contain"
        style={{ filter: shellGlow }}
      />
      {isCorrect && (
        <div className="owl-emotion-sparkles">
          <span className="owl-sparkle owl-sparkle-left" />
          <span className="owl-sparkle owl-sparkle-top" />
          <span className="owl-sparkle owl-sparkle-right" />
        </div>
      )}
      {isWrong && (
        <>
          <span className="owl-emotion-drop" />
          <div className="owl-dizzy-stars" aria-hidden="true">
            <span className="owl-dizzy-star owl-dizzy-star-left">✦</span>
            <span className="owl-dizzy-star owl-dizzy-star-top">✦</span>
            <span className="owl-dizzy-star owl-dizzy-star-right">✦</span>
          </div>
        </>
      )}
    </div>
  );
}

function OwlGuide({ mood, speech }) {

  return (
    <div className="relative rounded-[30px] border border-slate-200 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(242,247,251,0.96))] p-5 shadow-[0_24px_60px_rgba(15,23,42,0.08)]">
      <div className="absolute inset-x-8 top-0 h-24 rounded-full bg-[radial-gradient(circle,rgba(56,189,248,0.18),transparent_70%)] blur-2xl" aria-hidden="true" />
      <div className="relative flex flex-col gap-5 sm:flex-row sm:items-center lg:flex-col lg:items-stretch">
        <div className="flex items-center gap-4">
          <div className={`owl-shell owl-${mood}`} aria-hidden="true">
            <OwlMascot mood={mood} sizeClass="h-28 w-28" />
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-sky-700">Owl Guide</p>
            <h3 className="mt-2 text-xl font-semibold text-slate-900">Night Scholar</h3>
            <p className="mt-1 text-sm leading-6 text-slate-600">
              Focused, calm, and ready to coach each guess.
            </p>
          </div>
        </div>

        <div className="owl-speech-bubble relative rounded-[26px] bg-white px-5 py-4 text-sm leading-7 text-slate-700 shadow-[0_18px_35px_rgba(15,23,42,0.08)]">
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">Owl says</p>
          <p className="mt-2">{speech}</p>
        </div>
      </div>
    </div>
  );
}

const getPremiumFeedbackDisplay = ({ feedbackTone, roundState, feedback, streak = 0, hintUsed = false, scoreGain = 0 }) => {
  if (!feedback) return { badge: '', subtext: '', tone: 'idle' };

  if (roundState === 'solved') {
    return {
      badge: `Correct +${scoreGain || (hintUsed ? 5 : 10)}`,
      subtext: streak > 1 ? `Streak x${streak}. Momentum looks good.` : 'Nice one.',
      tone: 'correct',
    };
  }

  if (roundState === 'failed') {
    return {
      badge: 'Round missed',
      subtext: feedback,
      tone: 'wrong',
    };
  }

  if (feedbackTone === 'wrong' || feedbackTone === 'low') {
    return {
      badge: 'Not quite',
      subtext: feedback,
      tone: 'wrong',
    };
  }

  if (feedbackTone === 'hint') {
    return {
      badge: 'Meti says',
      subtext: feedback,
      tone: 'hint',
    };
  }

  return {
    badge: 'Nice',
    subtext: feedback,
    tone: feedbackTone === 'correct' ? 'correct' : 'idle',
  };
};

const GAME_PARTICLES = [
  { left: '6%', top: '10%', size: 8, delay: '0s', duration: '14s', variant: 'bright' },
  { left: '12%', top: '32%', size: 4, delay: '1.7s', duration: '17s', variant: 'soft' },
  { left: '18%', top: '78%', size: 5, delay: '1.2s', duration: '18s', variant: 'soft' },
  { left: '22%', top: '56%', size: 7, delay: '3.4s', duration: '22s', variant: 'bright' },
  { left: '28%', top: '24%', size: 10, delay: '2.4s', duration: '16s', variant: 'bright' },
  { left: '34%', top: '12%', size: 5, delay: '4.2s', duration: '19s', variant: 'soft' },
  { left: '38%', top: '82%', size: 6, delay: '0.4s', duration: '20s', variant: 'soft' },
  { left: '42%', top: '70%', size: 6, delay: '0.8s', duration: '20s', variant: 'bright' },
  { left: '48%', top: '36%', size: 4, delay: '2.9s', duration: '15s', variant: 'soft' },
  { left: '56%', top: '14%', size: 7, delay: '3s', duration: '17s', variant: 'bright' },
  { left: '61%', top: '52%', size: 5, delay: '1.1s', duration: '18s', variant: 'soft' },
  { left: '68%', top: '62%', size: 9, delay: '1.8s', duration: '19s', variant: 'bright' },
  { left: '73%', top: '28%', size: 4, delay: '3.8s', duration: '16s', variant: 'soft' },
  { left: '82%', top: '20%', size: 5, delay: '2.8s', duration: '15s', variant: 'soft' },
  { left: '86%', top: '48%', size: 7, delay: '1.5s', duration: '23s', variant: 'bright' },
  { left: '90%', top: '82%', size: 8, delay: '0.5s', duration: '21s', variant: 'bright' },
  { left: '94%', top: '14%', size: 4, delay: '2.1s', duration: '18s', variant: 'soft' },
  { left: '8%', top: '90%', size: 5, delay: '4.8s', duration: '24s', variant: 'soft' },
];

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

function GameIcon({ type, className = 'h-5 w-5' }) {
  if (type === 'score') {
    return (
      <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
        <path d="M12 3l2.5 5.2 5.7.8-4.1 4 1 5.7L12 16l-5.1 2.7 1-5.7-4.1-4 5.7-.8L12 3Z" fill="currentColor" />
      </svg>
    );
  }

  if (type === 'streak') {
    return (
      <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
        <path d="M12.6 2.5c.7 2.4-.1 4.3-1.7 5.8-1.4 1.3-2.1 2.7-1.3 4.5.4.9 1.2 1.7 2.4 2.4-3.8.2-6.7 3.1-6.7 6.8 0 2.8 1.8 5.1 4.7 5.1 5.1 0 8.7-4 8.7-8.9 0-3.5-1.7-6.1-6.1-10.7Z" fill="currentColor" />
      </svg>
    );
  }

  if (type === 'timer') {
    return (
      <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
        <circle cx="12" cy="13" r="7.5" stroke="currentColor" strokeWidth="1.8" />
        <path d="M12 9v4l3 2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M9 2h6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    );
  }

  return null;
}

function SoundToggleIcon({ muted, className = 'h-5 w-5' }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={className} aria-hidden="true">
      <path d="M4 14h4l5 4V6L8 10H4z" strokeLinecap="round" strokeLinejoin="round" />
      {muted ? (
        <>
          <path d="M17 9l4 4" strokeLinecap="round" />
          <path d="M21 9l-4 4" strokeLinecap="round" />
        </>
      ) : (
        <>
          <path d="M17 9.5a4.5 4.5 0 010 5" strokeLinecap="round" />
          <path d="M19.8 7a8 8 0 010 10" strokeLinecap="round" />
        </>
      )}
    </svg>
  );
}

const buildMetiSpeech = ({ currentItem, roundState, feedbackTone, feedback, hintUsed, hintText, mode, streak }) => {
  if (!currentItem) return 'I am ready!';

  if (roundState === 'solved') {
    if (streak > 2) return 'Great job!';
    if (streak > 1) return 'You got it!';
    return 'Nice!';
  }

  if (roundState === 'heart-gate') {
    return 'Choose how to recover a heart and I will hold the round for you.';
  }

  if (roundState === 'failed') {
    return 'Oops!';
  }

  if ((feedbackTone === 'wrong' || feedbackTone === 'low') && feedback) {
    if (/already tried/i.test(feedback)) return 'Try again!';
    if (/not in the answer/i.test(feedback)) return 'Oops!';
    if (/Enter a valid letter/i.test(feedback)) return 'Try again!';
    return 'Try again!';
  }

  if (hintUsed) {
    return mode === 'classic' ? 'Try this clue.' : hintText;
  }

  if (mode === 'classic') return 'Pick a letter.';
  return 'Read the clue.';
};

const getMetiCompanionContent = ({
  currentItem,
  roundState,
  feedbackTone,
  feedback,
  hintUsed,
  hintText,
  mode,
  streak,
  feedbackDisplay,
}) => {
  if (!currentItem) {
    return {
      reactionLabel: 'Perched nearby',
      reactionText: 'Meti is settled in and ready to coach the first move.',
      hintLabel: 'Opening tip',
      hintText: mode === 'classic'
        ? 'Start with a confident letter and watch how the board answers back.'
        : 'Read the clue once, then trust your first clean guess.',
      personalityLabel: 'Meti vibe',
      personalityText: 'Quiet company, sharp eyes, and just enough mischief to keep the round lively.',
    };
  }

  if (roundState === 'solved') {
    return {
      reactionLabel: feedbackDisplay.badge || 'Nice solve',
      reactionText: streak > 1
        ? `Meti is visibly impressed. That is ${streak} clean reads in a row.`
        : 'Meti gives a small approving nod and keeps the momentum steady.',
      hintLabel: 'Next nudge',
      hintText: 'Carry the rhythm forward. Scan the clue for category words before committing.',
      personalityLabel: 'Meti vibe',
      personalityText: 'Praise from Meti is brief on purpose. The owl prefers momentum over speeches.',
    };
  }

  if (roundState === 'failed') {
    return {
      reactionLabel: 'Regrouping',
      reactionText: 'Meti stays calm after a miss and immediately starts looking for the next opening.',
      hintLabel: 'What to watch',
      hintText: currentItem.category || currentItem.topic
        ? `Use the ${currentItem.category || currentItem.topic} cue more aggressively on the next word.`
        : 'Use the clue wording more aggressively on the next word.',
      personalityLabel: 'Meti vibe',
      personalityText: 'Even when a round slips away, Meti plays like a patient study partner, not a referee.',
    };
  }

  if (feedbackTone === 'wrong' || feedbackTone === 'low') {
    let reactionText = 'Meti tilts their head. The path is still there, just not this branch.';
    let nudgedHint = 'Try a different angle and let the clue narrow the field.';

    if (/already tried/i.test(feedback || '')) {
      reactionText = 'Meti taps the board lightly. That route has already been checked.';
      nudgedHint = 'Reuse what the board has confirmed and test a fresh letter or word.';
    } else if (/not in the answer/i.test(feedback || '')) {
      reactionText = 'Meti fluffs up for a second, then settles. That guess did not belong to this word.';
      nudgedHint = 'Pivot to letters that better match the clue or category.';
    } else if (/Enter a valid letter/i.test(feedback || '')) {
      reactionText = 'Meti waits, patient and unbothered, for a cleaner guess.';
      nudgedHint = 'Enter one clear letter or commit to the whole word.';
    }

    return {
      reactionLabel: feedbackDisplay.badge || 'Still circling it',
      reactionText,
      hintLabel: 'Course correction',
      hintText: nudgedHint,
      personalityLabel: 'Meti vibe',
      personalityText: 'Meti never rushes the room. The owl nudges, waits, and trusts you to recover.',
    };
  }

  if (hintUsed) {
    return {
      reactionLabel: feedbackDisplay.badge || 'Leaning closer',
      reactionText: 'Meti slides a clue across the desk like a secret only teammates get to share.',
      hintLabel: 'Hint pocket',
      hintText: hintText || 'Read the clue again and look for the anchor word.',
      personalityLabel: 'Meti vibe',
      personalityText: 'Helpful, but never overbearing. Meti likes guiding more than solving it for you.',
    };
  }

  return {
    reactionLabel: 'Watching the board',
    reactionText: 'Meti is reading along with you, waiting for the moment to chime in.',
    hintLabel: 'Quiet nudge',
    hintText: mode === 'classic'
      ? 'Open with a strong consonant or a likely vowel pair.'
      : 'Trust the clue first, then use the category to break ties.',
    personalityLabel: 'Meti vibe',
    personalityText: 'A calm companion with a scholar streak. Meti keeps the energy playful, not clinical.',
  };
};

function MetiGuide({ mood, speech, statusLabel }) {
  return (
    <aside className={`game-guide-panel game-guide-panel-compact game-guide-panel-magic game-meti-panel relative overflow-hidden rounded-[30px] p-5 shadow-[0_24px_60px_rgba(2,6,23,0.28)] ${mood === 'streak' ? 'is-streak' : ''}`}>
      <div className="game-guide-stars" aria-hidden="true">
        <span />
        <span />
        <span />
      </div>
      <div className="relative flex h-full flex-col items-center justify-center gap-5 text-center">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-sky-200/80">Companion</p>
          <h3 className="mt-1 text-[1.65rem] font-semibold leading-none text-white sm:text-[1.85rem]">Meti the Owl</h3>
        </div>
        <div className="game-meti-stage">
          <div className={`owl-shell owl-${mood} game-guide-owl-shell game-meti-shell`} aria-hidden="true">
            <OwlMascot mood={mood} sizeClass="h-32 w-32 sm:h-36 sm:w-36" />
          </div>
          <div className="owl-speech-bubble owl-speech-bubble-magic game-meti-bubble relative rounded-[28px] px-5 py-4 text-sm shadow-[0_18px_36px_rgba(15,23,42,0.24)]">
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-sky-100/70">Meti says</p>
            <p className="mt-2 text-[1.02rem] font-semibold leading-7 text-white">{speech}</p>
          </div>
        </div>
        <span className="game-meti-status">{statusLabel}</span>
      </div>
    </aside>
  );
}

export default function Game() {
  const navigate = useNavigate();
  const isRestoringProgressRef = useRef(false);
  const [payload, setPayload] = useState({ modules: [], items: [], excludedModuleWords: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [wordSourceMode, setWordSourceMode] = useState('study');
  const [selectedModule, setSelectedModule] = useState('all');
  const [currentLevel, setCurrentLevel] = useState(1);
  const [mode, setMode] = useState('classic');
  const [timerEnabled, setTimerEnabled] = useState(false);
  const [dailyMode, setDailyMode] = useState(false);
  const [gameStarted, setGameStarted] = useState(false);
  const [currentItem, setCurrentItem] = useState(null);
  const [queue, setQueue] = useState([]);
  const [usedIds, setUsedIds] = useState([]);
  const [usedWords, setUsedWords] = useState(() => new Set());
  const [answerInput, setAnswerInput] = useState('');
  const [guessedLetters, setGuessedLetters] = useState([]);
  const [attemptsLeft, setAttemptsLeft] = useState(MODE_CONFIG.classic.attempts);
  const [hintUsed, setHintUsed] = useState(false);
  const [roundState, setRoundState] = useState('idle');
  const [feedback, setFeedback] = useState('');
  const [score, setScore] = useState(0);
  const [streak, setStreak] = useState(0);
  const [bestStreak, setBestStreak] = useState(0);
  const [roundsPlayed, setRoundsPlayed] = useState(0);
  const [timer, setTimer] = useState(45);
  const [leaderboard, setLeaderboard] = useState(() => loadLeaderboard());
  const [recentHistory, setRecentHistory] = useState(() => loadRecentWordHistory());
  const [feedbackTone, setFeedbackTone] = useState('idle');
  const [isGeneratingWords, setIsGeneratingWords] = useState(false);
  const [generatedWordCache, setGeneratedWordCache] = useState({});
  const [boardAnimationKey, setBoardAnimationKey] = useState(0);
  const [streakAnimationKey, setStreakAnimationKey] = useState(0);
  const [floatingPoints, setFloatingPoints] = useState([]);
  const [hasSavedProgress, setHasSavedProgress] = useState(false);
  const [playedWordHistory, setPlayedWordHistory] = useState(() => loadPlayedWordHistory());
  const [soundEnabled, setSoundEnabledState] = useState(() => isSoundEnabled());
  const [heartRecovery, setHeartRecovery] = useState(() => loadHeartRecoveryState());
  const [heartClock, setHeartClock] = useState(() => Date.now());
  const selectedDifficulty = getDifficultyForLevel(currentLevel);
  const levelBandLabel = getLevelBandLabel(currentLevel);
  const todayKey = getDailySeed();
  const normalizedHeartRecovery = useMemo(() => {
    const adDate = heartRecovery?.adDate || '';
    return {
      unlockAt: heartRecovery?.unlockAt || null,
      adDate: todayKey,
      adClaimsUsed: adDate === todayKey ? Number(heartRecovery?.adClaimsUsed) || 0 : 0,
      subscriptionActive: Boolean(heartRecovery?.subscriptionActive),
    };
  }, [heartRecovery, todayKey]);
  const heartRefillRemainingMs = Math.max(
    0,
    (normalizedHeartRecovery.unlockAt ? new Date(normalizedHeartRecovery.unlockAt).getTime() : 0) - heartClock,
  );
  const canUseRefilledHeart = Boolean(normalizedHeartRecovery.unlockAt) && heartRefillRemainingMs === 0;
  const adHeartsRemaining = Math.max(0, MAX_DAILY_AD_HEARTS - normalizedHeartRecovery.adClaimsUsed);
  const isSubscribed = normalizedHeartRecovery.subscriptionActive;

  useEffect(() => {
    preloadSounds();
  }, []);

  useEffect(() => {
    saveHeartRecoveryState(normalizedHeartRecovery);
  }, [normalizedHeartRecovery]);

  useEffect(() => {
    if (roundState !== 'heart-gate') return undefined;

    setHeartClock(Date.now());
    const interval = setInterval(() => {
      setHeartClock(Date.now());
    }, 1000);

    return () => clearInterval(interval);
  }, [roundState]);

  const toggleSound = () => {
    const nextValue = !soundEnabled;
    setSoundEnabled(nextValue);
    setSoundEnabledState(nextValue);
  };

  const persistCurrentProgress = () => {
    const progress = {
      wordSourceMode,
      selectedModule,
      currentLevel,
      mode,
      timerEnabled,
      dailyMode,
      gameStarted,
      currentItem,
      queue,
      usedIds,
      usedWords: [...usedWords],
      answerInput,
      guessedLetters,
      attemptsLeft,
      hintUsed,
      roundState,
      feedback,
      score,
      streak,
      bestStreak,
      roundsPlayed,
      timer,
      generatedWordCache,
    };

    const shouldPersist =
      currentLevel > 1
      || Boolean(currentItem)
      || roundsPlayed > 0
      || score > 0
      || usedWords.size > 0;

    if (shouldPersist) {
      saveGameProgress(progress);
      setHasSavedProgress(true);
    } else {
      clearSavedGameProgress();
      setHasSavedProgress(false);
    }
  };

  useEffect(() => {
    const savedProgress = loadSavedGameProgress();
    if (!savedProgress) return;

    const restoredCurrentItem = savedProgress.currentItem || null;
    const restoredQueue = Array.isArray(savedProgress.queue) ? savedProgress.queue : [];
    const canResumeSavedRun = Boolean(restoredCurrentItem);

    isRestoringProgressRef.current = true;
    setWordSourceMode(savedProgress.wordSourceMode || 'study');
    setSelectedModule(savedProgress.selectedModule || 'all');
    setCurrentLevel(clampLevel(savedProgress.currentLevel || 1));
    setMode(normalizeGameMode(savedProgress.mode));
    setTimerEnabled(Boolean(savedProgress.timerEnabled));
    setDailyMode(Boolean(savedProgress.dailyMode));
    setGameStarted(Boolean(savedProgress.gameStarted) && canResumeSavedRun);
    setCurrentItem(restoredCurrentItem);
    setQueue(restoredQueue);
    setUsedIds(Array.isArray(savedProgress.usedIds) ? savedProgress.usedIds : []);
    setUsedWords(new Set(Array.isArray(savedProgress.usedWords) ? savedProgress.usedWords : []));
    setAnswerInput(savedProgress.answerInput || '');
    setGuessedLetters(Array.isArray(savedProgress.guessedLetters) ? savedProgress.guessedLetters : []);
    setAttemptsLeft(savedProgress.attemptsLeft || MODE_CONFIG.classic.attempts);
    setHintUsed(Boolean(savedProgress.hintUsed));
    setRoundState(savedProgress.roundState || 'idle');
    setFeedback(savedProgress.feedback || '');
    setScore(Number(savedProgress.score) || 0);
    setStreak(Number(savedProgress.streak) || 0);
    setBestStreak(Number(savedProgress.bestStreak) || 0);
    setRoundsPlayed(Number(savedProgress.roundsPlayed) || 0);
    setTimer(Number(savedProgress.timer) || 45);
    setGeneratedWordCache(savedProgress.generatedWordCache && typeof savedProgress.generatedWordCache === 'object' ? savedProgress.generatedWordCache : {});
    setHasSavedProgress(canResumeSavedRun);

    if (Boolean(savedProgress.gameStarted) && !canResumeSavedRun) {
      setError('Your last game could not be restored cleanly. Start a fresh round to keep playing.');
    }
  }, []);

  useEffect(() => {
    const fetchItems = async () => {
      const token = localStorage.getItem('token');
      if (!token) {
        navigate('/login');
        return;
      }

      setLoading(true);
      setError('');

      try {
        const params = new URLSearchParams({ mode: wordSourceMode });
        const response = await fetch(`/modules/word-challenge?${params.toString()}`, {
          headers: { 'x-auth-token': token },
        });

        if (response.status === 401) {
          localStorage.removeItem('token');
          localStorage.removeItem('user');
          navigate('/login');
          return;
        }

        const data = await response.json();
        if (!response.ok) {
          throw new Error(data?.message || 'Failed to load game content.');
        }

        setPayload({
          modules: Array.isArray(data.modules) ? data.modules : [],
          items: Array.isArray(data.items) ? data.items : [],
          excludedModuleWords: Array.isArray(data.excludedModuleWords) ? data.excludedModuleWords : [],
        });
      } catch (fetchError) {
        console.error('Error loading word challenge:', fetchError);
        setError(fetchError.message || 'Failed to load word challenge items.');
      } finally {
        setLoading(false);
      }
    };

    fetchItems();
  }, [navigate, wordSourceMode]);

  useEffect(() => {
    if (isRestoringProgressRef.current) {
      isRestoringProgressRef.current = false;
      return;
    }

    setSelectedModule('all');
    setCurrentLevel(1);
    setGameStarted(false);
    setCurrentItem(null);
    setQueue([]);
    setUsedIds([]);
    setUsedWords(new Set());
    setRoundState('idle');
    setFeedback('');
    setFeedbackTone('idle');
  }, [wordSourceMode]);

  useEffect(() => {
    if (floatingPoints.length === 0) return undefined;

    const timeout = setTimeout(() => {
      setFloatingPoints((current) => current.slice(-2));
    }, 1500);

    return () => clearTimeout(timeout);
  }, [floatingPoints]);

  useEffect(() => {
    if (!feedbackTone || feedbackTone === 'idle') return undefined;

    const timeout = setTimeout(() => setFeedbackTone('idle'), 900);
    return () => clearTimeout(timeout);
  }, [feedbackTone]);

  useEffect(() => {
    persistCurrentProgress();
  }, [
    answerInput,
    attemptsLeft,
    bestStreak,
    currentItem,
    currentLevel,
    dailyMode,
    feedback,
    gameStarted,
    generatedWordCache,
    guessedLetters,
    hintUsed,
    mode,
    queue,
    roundsPlayed,
    roundState,
    score,
    selectedModule,
    streak,
    timer,
    timerEnabled,
    usedIds,
    usedWords,
    wordSourceMode,
  ]);

  useEffect(() => () => {
    persistCurrentProgress();
  }, [
    answerInput,
    attemptsLeft,
    bestStreak,
    currentItem,
    currentLevel,
    dailyMode,
    feedback,
    gameStarted,
    generatedWordCache,
    guessedLetters,
    hintUsed,
    mode,
    queue,
    roundsPlayed,
    roundState,
    score,
    selectedModule,
    streak,
    timer,
    timerEnabled,
    usedIds,
    usedWords,
    wordSourceMode,
  ]);

  const sessionCacheKey = useMemo(
    () => buildSessionCacheKey({ wordSourceMode, selectedModule, difficulty: selectedDifficulty }),
    [selectedDifficulty, selectedModule, wordSourceMode],
  );

  const sourceScopedGeneratedItems = useMemo(
    () =>
      Object.entries(generatedWordCache)
        .filter(([cacheKey]) => cacheKey.startsWith(`${wordSourceMode}::`))
        .flatMap(([, items]) => items),
    [generatedWordCache, wordSourceMode],
  );

  const allKnownItems = useMemo(
    () => dedupeSessionItems([...payload.items, ...sourceScopedGeneratedItems]),
    [payload.items, sourceScopedGeneratedItems],
  );

  const getItemsForDifficulty = (items, difficulty) =>
    items.filter((item) =>
      matchesCurrentFilters(item, { wordSourceMode, selectedModule, selectedDifficulty: difficulty }),
    );

  const recentWordsForMode = useMemo(
    () => (Array.isArray(recentHistory[wordSourceMode]) ? recentHistory[wordSourceMode] : []),
    [recentHistory, wordSourceMode],
  );

  const playedWordsForMode = useMemo(
    () => (Array.isArray(playedWordHistory[wordSourceMode]) ? playedWordHistory[wordSourceMode] : []),
    [playedWordHistory, wordSourceMode],
  );

  const availableItems = useMemo(
    () =>
      getItemsForDifficulty(allKnownItems, selectedDifficulty).filter(
        (item) => !playedWordsForMode.includes(normalizeGuess(item.word)),
      ),
    [allKnownItems, playedWordsForMode, selectedDifficulty, selectedModule, wordSourceMode],
  );

  const buildExcludedWordsForSession = (existingItems = []) => {
    const excluded = new Set(
      dedupeSessionItems(existingItems)
        .map((item) => normalizeGuess(item?.word))
        .filter(Boolean),
    );

    recentWordsForMode.forEach((word) => {
      const normalized = normalizeGuess(word);
      if (normalized) excluded.add(normalized);
    });

    playedWordsForMode.forEach((word) => {
      const normalized = normalizeGuess(word);
      if (normalized) excluded.add(normalized);
    });

    usedWords.forEach((word) => {
      const normalized = normalizeGuess(word);
      if (normalized) excluded.add(normalized);
    });

    if (currentItem?.word) {
      const normalized = normalizeGuess(currentItem.word);
      if (normalized) excluded.add(normalized);
    }

    return [...excluded];
  };

  useEffect(() => {
    if (!gameStarted || !timerEnabled || roundState !== 'active') return undefined;

    const interval = setInterval(() => {
      setTimer((current) => {
        if (current <= 1) {
          clearInterval(interval);
          setRoundState('failed');
          setFeedback(`Time is up. The correct answer was ${currentItem?.word || 'not available'}.`);
          setStreak(0);
          setRoundsPlayed((played) => played + 1);
          return 0;
        }
        return current - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [currentItem, gameStarted, roundState, timerEnabled]);

  useEffect(() => {
    if (!gameStarted || roundsPlayed === 0 || roundState === 'active') return;
    setLeaderboard(
      saveLeaderboardScore({
        date: new Date().toISOString(),
        score,
        bestStreak,
        roundsPlayed,
        dailyMode,
      }),
    );
  }, [bestStreak, dailyMode, gameStarted, roundState, roundsPlayed, score]);

  const markWordAsSeen = (item) => {
    const wordKey = normalizeGuess(item?.word);
    if (!wordKey) return;

    setRecentHistory((current) => {
      const existing = Array.isArray(current[wordSourceMode]) ? current[wordSourceMode] : [];
      const nextForMode = [wordKey, ...existing.filter((entry) => normalizeGuess(entry) !== wordKey)]
        .slice(0, MAX_RECENT_WORDS);
      const next = { ...current, [wordSourceMode]: nextForMode };
      saveRecentWordHistory(next);
      return next;
    });
  };

  const markWordAsUsed = (item) => {
    const wordKey = normalizeGuess(item?.word);
    if (!wordKey) return;

    setUsedWords((current) => {
      const next = new Set(current);
      next.add(wordKey);
      return next;
    });
  };

  const markWordAsPlayed = (item) => {
    const wordKey = normalizeGuess(item?.word);
    if (!wordKey) return;

    setPlayedWordHistory((current) => {
      const existing = Array.isArray(current[wordSourceMode]) ? current[wordSourceMode] : [];
      const nextForMode = [wordKey, ...existing.filter((entry) => normalizeGuess(entry) !== wordKey)]
        .slice(0, MAX_PLAYED_WORDS);
      const next = { ...current, [wordSourceMode]: nextForMode };
      savePlayedWordHistory(next);
      return next;
    });
  };

  const prepareQueue = (items, activeUsedWords = usedWords, options = {}) => {
    const { allowRecycle = true, allowPlayedRecycle = false } = options;
    if (items.length === 0) return [];

    const filteredUnusedWords = items.filter((item) => {
      const normalized = normalizeGuess(item.word);
      return !activeUsedWords.has(normalized) && (allowPlayedRecycle || !playedWordsForMode.includes(normalized));
    });
    const recyclableItems = items.filter((item) => allowPlayedRecycle || !playedWordsForMode.includes(normalizeGuess(item.word)));
    const wordPool = filteredUnusedWords.length > 0 ? filteredUnusedWords : (allowRecycle ? recyclableItems : []);
    const unseenItems = wordPool.filter((item) => !recentWordsForMode.includes(normalizeGuess(item.word)));
    const prioritizedItems = unseenItems.length > 0 ? unseenItems : wordPool;

    if (dailyMode) {
      return sortForDailyChallenge(prioritizedItems, getDailySeed()).slice(0, 5);
    }

    return [...prioritizedItems].sort(() => Math.random() - 0.5);
  };

  const cacheGeneratedItemsForSession = (items, difficulty = selectedDifficulty) => {
    if (!Array.isArray(items) || items.length === 0) return [];

    const cacheKey = buildSessionCacheKey({ wordSourceMode, selectedModule, difficulty });
    const mergedItems = dedupeSessionItems([...(generatedWordCache[cacheKey] || []), ...items]);
    setGeneratedWordCache((current) => ({
      ...current,
      [cacheKey]: mergedItems,
    }));
    return mergedItems;
  };

  const generateWordsForSession = async (existingItems = [], difficultyOverride = selectedDifficulty) => {
    const token = localStorage.getItem('token');
    if (!token) {
      navigate('/login');
      return [];
    }

    setIsGeneratingWords(true);
    setError('');

    try {
      const response = await fetch('/modules/word-challenge/generate-session', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-auth-token': token,
        },
        body: JSON.stringify({
          mode: wordSourceMode,
          moduleId: wordSourceMode === 'study' ? selectedModule : '',
          difficulty: difficultyOverride,
          excludeWords: buildExcludedWordsForSession(existingItems),
        }),
      });

      if (response.status === 401) {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        navigate('/login');
        return [];
      }

      const data = await response.json().catch(() => ({}));
      const generatedItems = Array.isArray(data.items) ? data.items : [];
      if (!response.ok || generatedItems.length === 0) {
        throw new Error(
          data?.message
          || (wordSourceMode === 'study'
            ? 'Study Mode could not find enough words in your uploaded modules.'
            : 'Failed to generate words for the game.'),
        );
      }

      cacheGeneratedItemsForSession(generatedItems, difficultyOverride);
      return generatedItems;
    } catch (generationError) {
      console.error('Error generating game words:', generationError);
      const localFallbackItems = buildLocalGeneratedItems({
        wordSourceMode,
        selectedDifficulty: difficultyOverride,
        selectedModule,
        payloadItems: payload.items,
        excludedModuleWords: payload.excludedModuleWords,
        excludeWords: buildExcludedWordsForSession(existingItems),
      });

      if (localFallbackItems.length > 0) {
        cacheGeneratedItemsForSession(localFallbackItems, difficultyOverride);
        setError('');
        return localFallbackItems;
      }

      setError(
        generationError.message
        || (wordSourceMode === 'study'
          ? 'Study Mode could not find enough words in your uploaded modules.'
          : 'Failed to generate words for the game.'),
      );
      return [];
    } finally {
      setIsGeneratingWords(false);
    }
  };

  const beginRound = (nextItem, nextQueue, nextUsedIds) => {
    setBoardAnimationKey((current) => current + 1);
    setCurrentItem(nextItem);
    setQueue(nextQueue);
    setUsedIds(nextUsedIds);
    setAnswerInput('');
    setGuessedLetters([]);
    setAttemptsLeft(MODE_CONFIG[mode].attempts);
    setHintUsed(false);
    setRoundState('active');
    setFeedback('');
    setTimer(45);
    markWordAsSeen(nextItem);
    markWordAsUsed(nextItem);
    markWordAsPlayed(nextItem);
  };

  const startGame = async () => {
    if (hasSavedProgress && currentItem) {
      setGameStarted(true);
      setError('');
      return;
    }

    const openingDifficulty = getDifficultyForLevel(1);
    let itemsForSession = availableItems;

    if (itemsForSession.length < 5) {
      const generatedItems = await generateWordsForSession(itemsForSession, openingDifficulty);
      const mergedItems = dedupeSessionItems([...itemsForSession, ...generatedItems]);
      itemsForSession = getItemsForDifficulty(mergedItems, openingDifficulty);
    }

    if (itemsForSession.length === 0) {
      const emergencyLocalItems = buildLocalGeneratedItems({
        wordSourceMode,
        selectedDifficulty: openingDifficulty,
        selectedModule,
        payloadItems: payload.items,
        excludedModuleWords: payload.excludedModuleWords,
        excludeWords: [],
      });

      if (emergencyLocalItems.length > 0) {
        itemsForSession = emergencyLocalItems;
      }
    }

    if (itemsForSession.length === 0) {
      setError(
        wordSourceMode === 'study'
          ? 'Study Mode needs words from your uploaded modules before it can start.'
          : 'Unable to prepare a playable word set right now.',
      );
      itemsForSession = getItemsForDifficulty(allKnownItems, openingDifficulty);
    }

    const freshUsedWords = new Set();
    let initialQueue = prepareQueue(itemsForSession, freshUsedWords, { allowRecycle: false });
    if (initialQueue.length === 0) {
      initialQueue = prepareQueue(itemsForSession, freshUsedWords, { allowRecycle: true, allowPlayedRecycle: true });
    }
    const [firstItem, ...rest] = initialQueue;

    if (!firstItem) {
      setError('Unable to prepare a playable word right now.');
      return;
    }

    setScore(0);
    setStreak(0);
    setBestStreak(0);
    setRoundsPlayed(0);
    setCurrentLevel(1);
    setUsedWords(freshUsedWords);
    setFloatingPoints([]);
    setGameStarted(true);
    setError('');

    beginRound(firstItem, rest, firstItem ? [firstItem.id] : []);
  };

  const returnToGameHome = () => {
    persistCurrentProgress();
    setGameStarted(false);
    setFeedbackTone('idle');
    setFloatingPoints([]);
  };

  const openHeartRecoveryGate = () => {
    const nextUnlockAt = normalizedHeartRecovery.unlockAt && new Date(normalizedHeartRecovery.unlockAt).getTime() > Date.now()
      ? normalizedHeartRecovery.unlockAt
      : new Date(Date.now() + HEART_REFILL_MS).toISOString();

    setHeartRecovery((current) => ({
      ...current,
      unlockAt: nextUnlockAt,
      adDate: todayKey,
      adClaimsUsed: normalizedHeartRecovery.adClaimsUsed,
      subscriptionActive: Boolean(current?.subscriptionActive),
    }));
    setHeartClock(Date.now());
    setRoundState('heart-gate');
    setFeedback(`You are out of hearts. Wait ${HEART_REFILL_MINUTES} minutes, watch an ad for 1 heart, or subscribe to keep playing.`);
    setFeedbackTone('low');
  };

  const restoreSingleHeart = (message) => {
    setAttemptsLeft(1);
    setRoundState('active');
    setFeedback(message);
    setFeedbackTone('hint');
    setHeartClock(Date.now());
  };

  const useRefilledHeart = () => {
    if (!canUseRefilledHeart) return;

    playSound('click', { volume: 0.7 });
    setHeartRecovery((current) => ({
      ...current,
      unlockAt: null,
      adDate: todayKey,
      adClaimsUsed: normalizedHeartRecovery.adClaimsUsed,
      subscriptionActive: Boolean(current?.subscriptionActive),
    }));
    restoreSingleHeart('A new heart is ready. You can keep going on this word.');
  };

  const claimAdHeart = () => {
    if (adHeartsRemaining <= 0) return;

    playSound('click', { volume: 0.7 });
    setHeartRecovery((current) => ({
      ...current,
      adDate: todayKey,
      adClaimsUsed: normalizedHeartRecovery.adClaimsUsed + 1,
      subscriptionActive: Boolean(current?.subscriptionActive),
    }));
    restoreSingleHeart(`Rewarded heart claimed. ${Math.max(0, adHeartsRemaining - 1)} ad hearts left today.`);
  };

  const activateSubscription = () => {
    playSound('win', { volume: 0.75 });
    setHeartRecovery((current) => ({
      ...current,
      adDate: todayKey,
      adClaimsUsed: normalizedHeartRecovery.adClaimsUsed,
      subscriptionActive: true,
      unlockAt: null,
    }));
    restoreSingleHeart('Subscription mode is on. Unlimited hearts are active on this device.');
  };

  const leaveToDashboard = () => {
    persistCurrentProgress();
    if (window.history.length > 1) {
      navigate(-1);
      return;
    }
    navigate('/dashboard');
  };

  const moveToNextRound = async () => {
    playSound('click', { volume: 0.7 });
    const shouldAdvanceLevel = roundState === 'solved';
    const nextLevel = shouldAdvanceLevel ? Math.min(currentLevel + 1, MAX_LEVEL) : currentLevel;
    const nextDifficulty = getDifficultyForLevel(nextLevel);
    let sourceItems = getItemsForDifficulty(allKnownItems, nextDifficulty);

    if (sourceItems.length < 5 && !dailyMode) {
      const generatedItems = await generateWordsForSession(sourceItems, nextDifficulty);
      sourceItems = dedupeSessionItems([...sourceItems, ...generatedItems]);
      sourceItems = getItemsForDifficulty(sourceItems, nextDifficulty);
    }

    if (sourceItems.length === 0) {
      sourceItems = buildLocalGeneratedItems({
        wordSourceMode,
        selectedDifficulty: nextDifficulty,
        selectedModule,
        payloadItems: payload.items,
        excludedModuleWords: payload.excludedModuleWords,
        excludeWords: [],
      });
    }

    const unseenSourceItems = sourceItems.filter((item) => !usedWords.has(normalizeGuess(item.word)));

    if (unseenSourceItems.length < 3 && !dailyMode) {
      const generatedItems = await generateWordsForSession(sourceItems, nextDifficulty);
      sourceItems = dedupeSessionItems([...sourceItems, ...generatedItems]);
    }

    const orderedSourceItems = dailyMode ? sortForDailyChallenge(sourceItems, getDailySeed()).slice(0, 5) : sourceItems;
    const remaining = queue.filter((item) => !usedIds.includes(item.id));
    let nextQueue = remaining;
    let nextUsedIds = [...usedIds];

    if (remaining.length === 0 && !dailyMode) {
      nextQueue = prepareQueue(orderedSourceItems, usedWords, { allowRecycle: false });
      if (nextQueue.length === 0) {
        const emergencyLocalItems = buildLocalGeneratedItems({
          wordSourceMode,
          selectedDifficulty: nextDifficulty,
          selectedModule,
          payloadItems: payload.items,
          excludedModuleWords: payload.excludedModuleWords,
          excludeWords: [...usedWords],
        });
        nextQueue = prepareQueue(emergencyLocalItems, usedWords, { allowRecycle: false });
      }
    }

    if (nextQueue.length === 0) {
      nextQueue = prepareQueue(orderedSourceItems, usedWords, { allowRecycle: true, allowPlayedRecycle: true });
    }

    const [nextItem, ...rest] = nextQueue;
    if (!nextItem) {
      setRoundState('idle');
      setFeedback('No word is available right now. Try again in a moment.');
      return;
    }

    if (shouldAdvanceLevel) {
      setCurrentLevel(nextLevel);
    }
    beginRound(nextItem, rest, [...nextUsedIds.filter((id) => id !== nextItem.id), nextItem.id]);
  };

  const retryCurrentRound = () => {
    if (!currentItem) return;

    playSound('click', { volume: 0.7 });
    setAnswerInput('');
    setGuessedLetters([]);
    setAttemptsLeft(MODE_CONFIG[mode].attempts);
    setHintUsed(false);
    setRoundState('active');
    setFeedback('');
    setFeedbackTone('idle');
    setTimer(45);
    setFloatingPoints([]);
    setBoardAnimationKey((current) => current + 1);
  };

  const registerCorrectAnswer = () => {
    const streakBonus = streak > 0 ? Math.min(streak * 2, 10) : 0;
    const basePoints = hintUsed ? 5 : 10;
    const awarded = basePoints + streakBonus;
    const nextStreak = streak + 1;

    if (mode === 'classic' && currentItem?.word) {
      setGuessedLetters(uniqueLettersInWord(currentItem.word));
    }

    setScore((current) => current + awarded);
    setStreak(nextStreak);
    setStreakAnimationKey((current) => current + 1);
    setBestStreak((current) => Math.max(current, nextStreak));
    setRoundsPlayed((current) => current + 1);
    setRoundState('solved');
    setFeedbackTone('correct');
    setFeedback(streakBonus > 0 ? `Bonus +${streakBonus} for the streak.` : 'Clean solve.');
    setFloatingPoints((current) => [
      ...current,
      {
        id: Date.now() + Math.random(),
        value: awarded,
      },
    ]);
    playSound(hintUsed ? 'correct' : 'win', { volume: 0.85 });
  };

  const registerWrongAttempt = (message = 'Not quite. Try again.') => {
    const nextAttempts = attemptsLeft - 1;
    setScore((current) => current - 3);
    setAttemptsLeft(nextAttempts);
    setFeedback(message);
    setFeedbackTone(nextAttempts <= 2 ? 'low' : 'wrong');

    if (nextAttempts <= 0) {
      if (isSubscribed) {
        setAttemptsLeft(1);
        setFeedback('Unlimited hearts stepped in. Keep going.');
        setFeedbackTone('hint');
        playSound('win', { volume: 0.75 });
        return;
      }

      openHeartRecoveryGate();
      playSound('lose', { volume: 0.9 });
      return;
    }

    playSound('wrong', { volume: 0.8 });
  };

  const processGuess = (rawGuess) => {
    if (!currentItem || roundState !== 'active') return;

    const guess = String(rawGuess || '').trim();
    if (!guess) return;

    const normalizedAnswer = normalizeGuess(currentItem.word);
    const normalizedGuess = normalizeGuess(guess);

    if (mode === 'classic' && normalizedGuess.length === 1) {
      const letter = normalizedGuess;
      if (!/[a-z0-9]/.test(letter)) {
        setFeedback('Enter a valid letter or the full word.');
        setFeedbackTone('wrong');
        playSound('wrong', { volume: 0.75 });
        return;
      }

      if (guessedLetters.includes(letter)) {
        setFeedback(`You already tried "${letter.toUpperCase()}".`);
        setFeedbackTone('wrong');
        playSound('wrong', { volume: 0.75 });
        return;
      }

      const nextLetters = [...guessedLetters, letter];
      setGuessedLetters(nextLetters);
      setAnswerInput('');

      if (normalizedAnswer.includes(letter)) {
        if (isClassicSolved(currentItem.word, nextLetters)) {
          registerCorrectAnswer();
        } else {
          setFeedback(`Nice. "${letter.toUpperCase()}" is in the answer.`);
          setFeedbackTone('correct');
          playSound('correct', { volume: 0.7, pitch: 1.05 });
        }
        return;
      }

      registerWrongAttempt(`"${letter.toUpperCase()}" is not in the answer.`);
      return;
    }

    setAnswerInput('');

    if (normalizedGuess === normalizedAnswer) {
      registerCorrectAnswer();
      return;
    }

    registerWrongAttempt();
  };

  const handleClassicLetterGuess = (letter) => {
    if (!currentItem || roundState !== 'active' || mode !== 'classic') return;
    processGuess(letter);
  };

  const submitGuess = (event) => {
    event.preventDefault();
    playSound('click', { volume: 0.6 });
    processGuess(answerInput);
  };

  const revealHint = () => {
    if (!currentItem || hintUsed) return;
    playSound('hint', { volume: 0.75 });
    setHintUsed(true);
    setFeedbackTone('hint');
    setFeedback(mode === 'classic' ? 'A letter is now revealed.' : hintText);

    if (mode === 'classic') {
      const unrevealed = uniqueLettersInWord(currentItem.word).find((letter) => !guessedLetters.includes(letter));
      if (unrevealed) {
        setGuessedLetters((current) => [...current, unrevealed]);
      }
    }
  };

  const scoreGain = roundState === 'solved'
    ? (hintUsed ? 5 : 10) + (streak > 1 ? Math.min((streak - 1) * 2, 10) : 0)
    : 0;
  const scoreDeltaLabel = roundState === 'solved' ? 'Combo banked' : feedbackTone === 'wrong' || feedbackTone === 'low' ? '-3 penalty' : 'Keep it going';
  const boardToneClass =
    roundState === 'solved'
      ? 'game-board-success'
      : roundState === 'heart-gate'
        ? 'game-board-hint'
      : roundState === 'failed' || feedbackTone === 'wrong' || feedbackTone === 'low'
        ? 'game-board-danger'
        : feedbackTone === 'hint'
          ? 'game-board-hint'
          : 'game-board-idle';

  const hintText = currentItem
    ? `Hint: ${currentItem.hint || currentItem.clue} Category: ${currentItem.category || currentItem.topic}.`
    : '';
  const activeHint = hintUsed ? hintText : '';
  const maxAttempts = MODE_CONFIG[mode].attempts;
  const attemptsMeter = Array.from({ length: maxAttempts }, (_, index) => index < attemptsLeft);
  const letterTiles = currentItem
    ? getLetterTiles(currentItem.word, guessedLetters, roundState === 'solved')
    : [];
  const isWordComplete = roundState === 'solved' || roundState === 'failed';
  const classicKeyboardDisabled = roundState !== 'active' || mode !== 'classic';
  const feedbackDisplay = getPremiumFeedbackDisplay({
    feedbackTone,
    roundState,
    feedback,
    streak,
    hintUsed,
    scoreGain,
  });
  const owlMood =
    roundState === 'solved'
      ? streak > 1
        ? 'streak'
        : 'correct'
      : roundState === 'heart-gate'
        ? 'thinking'
      : roundState === 'failed' || feedbackTone === 'wrong'
        ? 'wrong'
        : feedbackTone === 'low'
          ? 'low'
        : feedbackTone === 'hint'
          ? 'thinking'
          : 'idle';
  const owlSpeech = buildMetiSpeech({
    currentItem,
    roundState,
    feedbackTone,
    feedback,
    hintUsed,
    hintText,
    mode,
    streak,
  });
  const owlStatusLabel = roundState === 'solved'
    ? 'Happy'
    : roundState === 'heart-gate'
      ? 'Waiting'
    : roundState === 'failed' || feedbackTone === 'wrong' || feedbackTone === 'low'
      ? 'Dizzy'
      : feedbackTone === 'hint'
        ? 'Thinking'
        : 'Idle';
  const canResumeSavedRun = hasSavedProgress && Boolean(currentItem);
  if (loading) {
    return (
      <div className="game-loading-panel rounded-[28px] px-6 py-10 text-sm shadow-sm">
        Loading Word Challenge...
      </div>
    );
  }

  return (
    <div className={`game-shell relative border border-white/10 px-4 py-4 shadow-[0_28px_90px_rgba(2,6,23,0.45)] sm:px-6 sm:py-6 ${gameStarted ? 'game-shell-live overflow-hidden' : 'game-shell-setup overflow-hidden flex flex-col items-center justify-center gap-8'}`}>
      <div className="game-shell-glow" aria-hidden="true" />
      <div className="game-shell-aurora" aria-hidden="true" />
      <div className="game-shell-runfield" aria-hidden="true" />
      <div className="game-shell-light-sweep" aria-hidden="true" />
      <div className="game-particles pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
        {GAME_PARTICLES.map((particle, index) => (
          <span
            key={`particle-${index}`}
            className={`game-particle game-particle-${particle.variant || 'bright'}`}
            style={{
              left: particle.left,
              top: particle.top,
              width: `${particle.size}px`,
              height: `${particle.size}px`,
              '--particle-delay': particle.delay,
              '--particle-duration': particle.duration,
            }}
          />
        ))}
      </div>
      {!gameStarted && (
        <section className="game-setup-stage mx-auto flex w-full max-w-5xl flex-1 items-center justify-center">
          <div className="game-setup-frame w-full">
            <div className="game-setup-topbar">
              <div className="mb-4 flex w-full flex-wrap items-center justify-between gap-3">
            <button
              type="button"
              onClick={leaveToDashboard}
              className="game-back-button inline-flex items-center gap-2 rounded-full border border-white/12 bg-white/5 px-4 py-2 text-sm font-semibold text-slate-200 transition hover:bg-white/10 hover:text-white"
            >
              <span aria-hidden="true">←</span>
              Back to Dashboard
            </button>
            <button
              type="button"
              onClick={toggleSound}
              aria-pressed={!soundEnabled}
              aria-label={soundEnabled ? 'Mute sound' : 'Unmute sound'}
              className={`game-sound-toggle inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold transition ${
                soundEnabled
                  ? 'border-cyan-300/40 bg-cyan-400/10 text-cyan-100 hover:bg-cyan-400/16'
                  : 'border-white/12 bg-white/5 text-slate-300 hover:bg-white/10 hover:text-white'
              }`}
            >
              <SoundToggleIcon muted={!soundEnabled} />
              {soundEnabled ? 'Sound On' : 'Muted'}
            </button>
          </div>
            </div>
          <div className="game-screen-panel game-setup-panel game-setup-focused game-setup-shell w-full rounded-[32px] p-6 sm:p-8">
            <div className="mx-auto max-w-2xl text-center">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">Setup</p>
              <h2 className="mt-2 text-3xl font-semibold text-slate-50 sm:text-4xl">Choose your challenge</h2>
              <p className="mx-auto mt-2.5 max-w-xl text-sm leading-6 text-slate-300 sm:text-base">
                A few quick picks, then you are in the game.
              </p>
            </div>

            {error && (
              <div className="game-setup-inline-alert mx-auto mt-5 w-full max-w-2xl rounded-2xl border border-amber-400/20 bg-amber-500/10 px-4 py-2.5 text-sm text-amber-100 shadow-sm">
                {error}
              </div>
            )}

            <div className="mx-auto mt-8 max-w-2xl space-y-7 sm:space-y-8">
              <div>
                <p className="text-center text-sm font-medium text-slate-200">Mode</p>
                <div className="mt-3 grid gap-4 sm:grid-cols-2">
                  {Object.entries(SOURCE_MODE_CONFIG).map(([sourceKey, config]) => (
                    <button
                      key={sourceKey}
                      type="button"
                      onClick={() => setWordSourceMode(sourceKey)}
                      className={`game-choice-card group relative overflow-hidden rounded-[28px] border px-5 py-5 text-left transition duration-300 ${
                        wordSourceMode === sourceKey
                          ? 'game-card-selected is-active'
                          : ''
                      }`}
                    >
                      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(34,211,238,0.18),transparent_34%)] opacity-0 transition duration-300 group-hover:opacity-100" />
                      <p className="text-lg font-semibold text-slate-50">{config.label}</p>
                      <p className="mt-2 text-sm leading-6 text-slate-300">{config.description}</p>
                    </button>
                  ))}
                </div>
                {wordSourceMode === 'study' && payload.items.length === 0 && (
                  <p className="mt-3 text-center text-sm text-slate-400">
                    No study words yet. Upload modules first because Study Mode now uses only your module words.
                  </p>
                )}
              </div>

              <div>
                <p className="text-center text-sm font-medium text-slate-200">Challenge Type</p>
                <div className="game-mode-tabs mt-3">
                  {Object.entries(MODE_CONFIG).map(([modeKey, config]) => (
                    <button
                      key={modeKey}
                      type="button"
                      onClick={() => setMode(modeKey)}
                      className={`game-mode-tab ${mode === modeKey ? 'is-active' : ''}`}
                    >
                      {config.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="mx-auto max-w-md">
                <div className="game-select rounded-[24px] px-5 py-4 text-center text-slate-100">
                  <p className="text-sm font-medium text-slate-200">Progression</p>
                  <p className="mt-3 text-sm leading-6 text-slate-300">
                    Solve each level to unlock the next one. Easy starts the climb, then medium and hard unlock as you progress.
                  </p>
                </div>
              </div>

              <div className="pt-2 text-center">
                <button
                  type="button"
                  onClick={startGame}
                  disabled={isGeneratingWords}
                  aria-disabled={isGeneratingWords}
                  className={`game-start-button game-start-button-primary inline-flex min-w-[220px] items-center justify-center gap-3 rounded-[24px] px-10 py-5 text-lg font-semibold text-white shadow-[0_18px_35px_rgba(14,116,144,0.28)] transition hover:-translate-y-0.5 hover:shadow-[0_22px_45px_rgba(14,116,144,0.36)] disabled:cursor-not-allowed disabled:opacity-60 ${
                    isGeneratingWords
                      ? 'bg-[linear-gradient(135deg,#94a3b8,#64748b)]'
                      : 'bg-[linear-gradient(135deg,#0284c7,#0f766e)]'
                  }`}
                >
                  {isGeneratingWords ? (
                    <>
                      <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/35 border-t-white" aria-hidden="true" />
                      Generating words...
                    </>
                  ) : (
                    canResumeSavedRun ? `Continue Level ${currentLevel}` : 'Start Game'
                  )}
                </button>
                <p className="mt-2.5 text-sm text-slate-300">
                  {canResumeSavedRun
                    ? `Your run is saved. Resume from Level ${currentLevel}.`
                    : 'Earn each level in order. You cannot skip ahead.'}
                </p>
              </div>
            </div>
          </div>
          </div>
        </section>
      )}

      {gameStarted && (
      <section className="game-screen-panel game-arena-panel relative overflow-hidden rounded-[32px] p-4 sm:p-5 xl:p-5">
        <div className="game-arena-backdrop" aria-hidden="true" />
        {currentItem ? (
          <div className="relative z-10 min-h-0">
            {error && (
              <div className="game-arena-alert mx-auto mb-4 w-full max-w-3xl rounded-2xl border border-amber-400/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
                {error}
              </div>
            )}

            <div className="game-arena-header game-arena-header-premium flex flex-wrap items-center justify-between gap-3">
              <button
                type="button"
                onClick={returnToGameHome}
                className="game-back-button inline-flex items-center gap-2 rounded-full border border-white/12 bg-white/5 px-4 py-2 text-sm font-semibold text-slate-200 transition hover:bg-white/10 hover:text-white"
              >
                <span aria-hidden="true">←</span>
                Back to Game Home
              </button>
              <button
                type="button"
                onClick={toggleSound}
                aria-pressed={!soundEnabled}
                aria-label={soundEnabled ? 'Mute sound' : 'Unmute sound'}
                className={`game-sound-toggle inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold transition ${
                  soundEnabled
                    ? 'border-cyan-300/40 bg-cyan-400/10 text-cyan-100 hover:bg-cyan-400/16'
                    : 'border-white/12 bg-white/5 text-slate-300 hover:bg-white/10 hover:text-white'
                }`}
              >
                <SoundToggleIcon muted={!soundEnabled} />
                {soundEnabled ? 'Sound On' : 'Muted'}
              </button>
              <div className="game-hud-row game-hud-row-compact flex flex-wrap justify-end gap-3">
                <div key={`score-${score}`} className="game-hud-pill">
                  <span className="game-hud-icon text-cyan-300"><GameIcon type="score" /></span>
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">Score</p>
                    <p className="text-xl font-semibold text-white">{score}</p>
                  </div>
                </div>
                <div key={`streak-${streakAnimationKey}-${streak}`} className={`game-hud-pill ${streak > 1 ? 'is-hot' : ''}`}>
                  <span className="game-hud-icon text-amber-300"><GameIcon type="streak" /></span>
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">Streak</p>
                    <p className="text-xl font-semibold text-white">{streak}</p>
                  </div>
                </div>
                <div className="game-hud-pill">
                  <span className="game-hud-icon text-rose-300">♥</span>
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">Attempts</p>
                    <p className="text-xl font-semibold text-white">{attemptsLeft}</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="game-arena-meta-row game-arena-meta-row-premium">
              <span>Level {currentLevel}</span>
              <span>{levelBandLabel} • {MODE_CONFIG[mode].label}</span>
              <span>{roundsPlayed} cleared</span>
              <span>{isSubscribed ? 'Subscriber active' : `Ad hearts left today: ${adHeartsRemaining}`}</span>
            </div>

            <div className="game-arena-centered game-arena-centered-premium mx-auto w-full max-w-6xl">
              <div key={`round-${boardAnimationKey}-${currentItem?.id || 'current'}`} className={`game-stage-board game-stage-board-premium ${boardToneClass} ${feedbackTone === 'wrong' || feedbackTone === 'low' || roundState === 'failed' ? 'game-board-shake' : ''} ${roundState === 'solved' ? 'game-board-stage-success' : ''}`}>
                <div className="game-board-layout game-board-layout-premium">
                  <div className="game-center game-wrapper game-board-main game-board-main-premium">
                    <div className="game-board-copy game-board-copy-magic game-board-copy-premium">
                      <p className="text-xs font-semibold uppercase tracking-[0.24em] text-sky-200/70">
                        Word Challenge
                      </p>
                    </div>

                    <div className="game-hint-card">
                      <p className="game-hint-card-label">
                        {mode === 'classic' ? 'Hint & Category' : 'Clue & Category'}
                      </p>
                      <p className="game-hint-card-body">
                        {mode === 'classic'
                          ? (activeHint || currentItem.hint || currentItem.clue || 'Study the category and start with a strong letter.')
                          : activeHint || currentItem.clue || currentItem.scenario}
                      </p>
                      <p className="game-hint-card-meta">
                        {currentItem.category || currentItem.topic || 'Mystery word'}
                      </p>
                    </div>

                    <div className="game-wire-word-wrap game-wire-word-wrap-premium">
                      {floatingPoints.map((item) => (
                        <span key={item.id} className="game-floating-points">+{item.value}</span>
                      ))}
                      <div className={`word word-premium ${isWordComplete ? 'game-word-complete' : ''}`}>
                        {letterTiles.map((tile, index) =>
                          tile.isSpacer ? (
                            <span key={tile.key} className="game-letter-spacer" aria-hidden="true" />
                          ) : (
                            <div
                              key={tile.key}
                              className={`tile tile-premium ${(tile.revealed || (mode !== 'classic' && (roundState === 'solved' || roundState === 'failed'))) ? 'is-revealed' : ''} ${roundState === 'solved' ? 'is-correct' : ''} ${roundState === 'failed' ? 'is-incorrect' : ''} ${isWordComplete ? 'is-complete' : ''}`}
                              style={{ animationDelay: `${index * 60}ms` }}
                            >
                              {mode === 'classic'
                                ? tile.display || '_'
                                : roundState === 'solved' || roundState === 'failed'
                                  ? tile.char.toUpperCase()
                                  : '?'}
                            </div>
                          ),
                        )}
                      </div>
                    </div>

                    <div className="hearts hearts-premium" aria-label={`Lives remaining: ${attemptsLeft} of ${maxAttempts}`}>
                      {[...Array(maxAttempts)].map((_, index) => (
                        <span key={`heart-${index}`} className={index < attemptsLeft ? 'heart active' : 'heart'} aria-hidden="true">
                          ❤️
                        </span>
                      ))}
                    </div>

                    {roundState === 'heart-gate' ? (
                      <div className="mx-auto w-full max-w-xl rounded-[28px] border border-rose-300/20 bg-slate-950/40 px-5 py-5 text-left shadow-[0_24px_60px_rgba(2,6,23,0.28)]">
                        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-rose-200/70">Out of Hearts</p>
                        <h3 className="mt-3 text-2xl font-semibold text-white">Pick how you want to continue</h3>
                        <p className="mt-3 text-sm leading-6 text-slate-300">
                          The round is paused, not lost. Wait for the next heart, use one rewarded ad heart, or turn on subscription mode.
                        </p>
                        <div className="mt-5 grid gap-3 md:grid-cols-3">
                          <button
                            type="button"
                            onClick={useRefilledHeart}
                            disabled={!canUseRefilledHeart}
                            className={`rounded-[22px] border px-4 py-4 text-left transition ${
                              canUseRefilledHeart
                                ? 'border-emerald-300/35 bg-emerald-400/10 text-white hover:bg-emerald-400/16'
                                : 'border-white/10 bg-white/5 text-slate-300'
                            }`}
                          >
                            <p className="text-sm font-semibold">Wait</p>
                            <p className="mt-2 text-sm leading-6">
                              {canUseRefilledHeart
                                ? 'Your next heart is ready now.'
                                : `Next heart in ${formatCountdown(heartRefillRemainingMs)}.`}
                            </p>
                          </button>
                          <button
                            type="button"
                            onClick={claimAdHeart}
                            disabled={adHeartsRemaining <= 0}
                            className={`rounded-[22px] border px-4 py-4 text-left transition ${
                              adHeartsRemaining > 0
                                ? 'border-cyan-300/35 bg-cyan-400/10 text-white hover:bg-cyan-400/16'
                                : 'border-white/10 bg-white/5 text-slate-300'
                            }`}
                          >
                            <p className="text-sm font-semibold">Watch Ad</p>
                            <p className="mt-2 text-sm leading-6">
                              {adHeartsRemaining > 0
                                ? `Get 1 heart instantly. ${adHeartsRemaining} ad hearts left today.`
                                : 'No ad hearts left today.'}
                            </p>
                          </button>
                          <button
                            type="button"
                            onClick={activateSubscription}
                            disabled={isSubscribed}
                            className={`rounded-[22px] border px-4 py-4 text-left transition ${
                              isSubscribed
                                ? 'border-amber-300/20 bg-amber-400/10 text-amber-100'
                                : 'border-amber-300/35 bg-amber-400/10 text-white hover:bg-amber-400/16'
                            }`}
                          >
                            <p className="text-sm font-semibold">{isSubscribed ? 'Subscribed' : 'Subscribe'}</p>
                            <p className="mt-2 text-sm leading-6">
                              {isSubscribed
                                ? 'Unlimited hearts are already active on this device.'
                                : 'Local demo: turn on unlimited hearts and no waiting.'}
                            </p>
                          </button>
                        </div>
                      </div>
                    ) : mode === 'classic' ? (
                      <div className="letter-grid letter-grid-premium" aria-label="Letter keyboard">
                        {ALPHABET.map((letter) => {
                          const letterKey = letter.toLowerCase();
                          const isUsed = guessedLetters.includes(letterKey);
                          const isInAnswer = normalizeGuess(currentItem.word).includes(letterKey);
                          return (
                            <button
                              key={letter}
                              type="button"
                              disabled={classicKeyboardDisabled || isUsed}
                              onClick={() => handleClassicLetterGuess(letter)}
                              className={`letter-btn ${isUsed ? 'used' : ''} ${isUsed && isInAnswer ? 'is-hit' : ''} ${isUsed && !isInAnswer ? 'is-miss' : ''}`}
                            >
                              {letter}
                            </button>
                          );
                        })}
                      </div>
                    ) : (
                      <form onSubmit={submitGuess} className="game-input-stack space-y-3">
                        <input
                          type="text"
                          value={answerInput}
                          onChange={(event) => setAnswerInput(event.target.value)}
                          disabled={roundState !== 'active'}
                          placeholder="Enter the keyword"
                          className={`game-answer-input w-full rounded-[24px] px-5 py-3.5 text-base text-white outline-none transition duration-200 disabled:cursor-not-allowed disabled:opacity-60 sm:text-lg xl:py-3 ${feedbackTone === 'wrong' || feedbackTone === 'low' ? 'game-input-wrong' : ''}`}
                        />
                        <button type="submit" disabled={roundState !== 'active'} className="game-action-button game-wire-primary-action">
                          Submit
                        </button>
                      </form>
                    )}

                    <div className="game-wire-actions game-wire-actions-premium">
                      <button type="button" onClick={revealHint} disabled={hintUsed || roundState !== 'active'} className="game-action-button game-wire-secondary-action">
                        {hintUsed ? 'Hint Used' : 'Hint'}
                      </button>
                      <button
                        type="button"
                        onClick={roundState === 'solved' ? moveToNextRound : retryCurrentRound}
                        disabled={roundState === 'heart-gate'}
                        className="game-action-button game-wire-secondary-action"
                      >
                        {roundState === 'solved' ? 'Next Level' : 'Retry'}
                      </button>
                    </div>
                  </div>
                  <MetiGuide
                    mood={owlMood}
                    speech={owlSpeech}
                    statusLabel={owlStatusLabel}
                  />
                </div>
              </div>
            </div>
            </div>
        ) : (
          <div className="relative z-10 mx-auto flex min-h-[320px] w-full max-w-2xl flex-col items-center justify-center text-center">
            <div className="max-w-xl rounded-[28px] border border-white/10 bg-slate-950/40 px-6 py-8 shadow-[0_24px_80px_rgba(2,6,23,0.45)]">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">Round Recovery</p>
              <h2 className="mt-3 text-2xl font-semibold text-white">We could not restore the current word</h2>
              <p className="mt-3 text-sm leading-6 text-slate-300">
                Your saved session no longer has a playable round. Head back to the setup screen and start a fresh game.
              </p>
              <button
                type="button"
                onClick={returnToGameHome}
                className="mt-6 inline-flex items-center justify-center rounded-[20px] bg-[linear-gradient(135deg,#0284c7,#0f766e)] px-6 py-3 text-sm font-semibold text-white shadow-[0_18px_35px_rgba(14,116,144,0.28)] transition hover:-translate-y-0.5 hover:shadow-[0_22px_45px_rgba(14,116,144,0.36)]"
              >
                Back to Setup
              </button>
            </div>
          </div>
        )}
      </section>
      )}
    </div>
  );
}
