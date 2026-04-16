import express from 'express';
import multer from 'multer';
import pdfParse from 'pdf-parse';
import OpenAI from 'openai';
import mongoose from 'mongoose';
import Module from '../models/Module.js';
import Flashcard from '../models/Flashcard.js';
import QuizAttempt from '../models/QuizAttempt.js';
import { auth } from '../middleware/auth.js';
import {
  buildQuizPrompt,
  mapDifficultyLabel,
  normalizeGenerationOptions,
} from '../utils/generationProfile.js';
import {
  EXAM_WORD_CHALLENGE_ITEMS,
  FUN_WORD_CHALLENGE_ITEMS,
  GENERAL_WORD_CHALLENGE_ITEMS,
} from '../utils/wordChallengeCatalog.js';

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

let openai = null;
if (process.env.OPENAI_API_KEY?.trim()) {
  openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
}

const SUMMARY_PROMPT = 'Summarize this study material into bullet points. Highlight key concepts clearly.';
const WORD_SOURCE_MODES = new Set(['study', 'general', 'exam', 'fun']);
const isValidModuleId = (value) => mongoose.isValidObjectId(String(value || '').trim());

const formatOpenAIError = (err) => {
  const status = err?.status ?? err?.code;
  const message = String(err?.message || '').trim();

  if (status === 429 || /quota|billing details|rate limit/i.test(message)) {
    return 'OpenAI is currently unavailable for this app because the API quota or billing limit has been reached. Local generation was used instead. Check your OpenAI plan and billing details to restore AI-generated summaries and quizzes.';
  }

  if (status === 401 || /incorrect api key|invalid api key|authentication/i.test(message)) {
    return 'OpenAI is currently unavailable for this app because the API key appears to be invalid. Local generation was used instead. Update OPENAI_API_KEY to restore AI-generated summaries and quizzes.';
  }

  return 'OpenAI generation is temporarily unavailable, so local generation was used instead.';
};

// Strip noisy PDF headers/footers and repeated lines.
const stripPdfNoise = (raw) => {
  if (!raw) return '';

  // Normalize common unicode spaces and line endings
  const text = String(raw)
    .replace(/\r\n/g, '\n')
    .replace(/\u00A0/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .trim();

  const lines = text
    .split('\n')
    .map(l => l.replace(/\s+/g, ' ').trim())
    .filter(Boolean);

  if (lines.length === 0) return '';

  // Count repeated lines (typical for headers/footers across pages)
  const freq = new Map();
  for (const l of lines) freq.set(l, (freq.get(l) || 0) + 1);

  const isPageMarker = (l) =>
    /^page\s*\d+(\s*of\s*\d+)?$/i.test(l) ||
    /^\d+\s*\/\s*\d+$/i.test(l) ||
    /^-\s*\d+\s*-$/.test(l) ||
    /^\d+$/.test(l);

  const looksLikeFooterHeader = (l) =>
    /(confidential|property of|all rights reserved|copyright|©|page \d+|header|footer|student\s*name|course|section|name:|id:)/i.test(l);

  const cleaned = lines.filter((l) => {
    // Drop obvious markers
    if (isPageMarker(l)) return false;

    // Drop repeated short-ish lines (likely headers/footers)
    const count = freq.get(l) || 0;
    if (count >= 3 && l.length <= 90) return false;

    // Drop very short header/footer-like lines
    if (l.length <= 25 && looksLikeFooterHeader(l)) return false;

    // Drop lines that are mostly separators
    if (/^[\W_]{3,}$/.test(l)) return false;

    return true;
  });

  return cleaned.join('\n').trim();
};

const STOPWORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'if', 'then', 'than', 'that', 'this', 'those', 'these',
  'is', 'are', 'was', 'were', 'be', 'been', 'being', 'to', 'of', 'in', 'on', 'for', 'by', 'with',
  'at', 'from', 'as', 'it', 'its', 'their', 'there', 'about', 'into', 'over', 'under', 'through'
]);

const normalizeForCompare = (s) => String(s || '')
  .toLowerCase()
  .replace(/[^a-z0-9\s]/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

const cleanSentenceText = (s) => {
  let out = String(s || '').replace(/\s+/g, ' ').trim();
  // Remove leading bullets/symbols
  out = out.replace(/^[•*\-–—\d\)\(.\s]+/, '');
  // Remove uppercase heading fragments before proper sentence content
  out = out.replace(/^([A-Z][A-Z\s,&()/\-]{8,})\s+(The|This|It|An|A)\b/, '$2');
  // Drop obvious header/footer leftovers
  out = out.replace(/\b(page\s*\d+(\s*of\s*\d+)?|all rights reserved|confidential|property of)\b/gi, '').trim();
  return out;
};

const detectContentLanguage = (text = '', title = '') => {
  const sample = `${title} ${text}`.toLowerCase();

  if (/\b(komunikasyon|filipino|tagalog|wikang filipino|asignaturang filipino|panitikan)\b/i.test(sample)) {
    return 'tl';
  }

  const lexicalMatches = sample.match(/\b(wika|salita|pangungusap|talata|balarila|kahulugan|pagbasa|pagsulat|komunikasyon|panitikan|ponema|morpema|sanaysay|talumpati|retorika|diskurso)\b/gi) || [];
  const functionMatches = sample.match(/\b(ang|mga|ng|sa|at|ay|ito|isang|para|mula|dahil|tungkol|ayon)\b/gi) || [];

  if (lexicalMatches.length >= 2 || functionMatches.length >= 8) {
    return 'tl';
  }

  return 'en';
};

const isTagalog = (language = 'en') => language === 'tl';

const sentenceParts = (text) =>
  (text.match(/[^.!?]+[.!?]+/g) || [])
    .map(s => cleanSentenceText(s))
    .map(s => s.replace(/\s+/g, ' ').trim())
    .filter(s => s.length >= 45 && s.length <= 220);

const toCompleteSentence = (input) => {
  const s = String(input || '').replace(/\s+/g, ' ').trim();
  if (!s) return '';
  return /[.!?]$/.test(s) ? s : `${s}.`;
};

const shortenAtWordBoundary = (text, max = 140) => {
  if (!text || text.length <= max) return text;
  const cut = text.slice(0, max);
  const lastSpace = cut.lastIndexOf(' ');
  const safe = lastSpace > 40 ? cut.slice(0, lastSpace) : cut;
  return `${safe}.`;
};

const uniqueByNormalizedText = (items, selector) => {
  const seen = new Set();
  return items.filter((item) => {
    const key = normalizeForCompare(selector(item));
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

const uniqueBy = (arr, selector) => {
  const seen = new Set();
  return arr.filter((item) => {
    const key = selector(item);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

const CONTENT_STOPWORDS = new Set([
  ...STOPWORDS,
  'article', 'articles', 'section', 'sections', 'chapter', 'chapters', 'lesson', 'lessons',
  'module', 'modules', 'unit', 'units', 'page', 'pages', 'student', 'students', 'handout',
  'handouts', 'reviewer', 'reviewers', 'edu', 'sti', 'pdf', 'property', 'copyright',
  'rights', 'reserved', 'confidential'
]);

const normalizeConceptKey = (text) =>
  normalizeForCompare(text)
    .replace(/\b(article|section|chapter|lesson|module|unit|page|pages)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const isTooSimilar = (left, right) => {
  const a = normalizeConceptKey(left);
  const b = normalizeConceptKey(right);
  if (!a || !b) return false;
  if (a === b) return true;
  if (a.includes(b) || b.includes(a)) return true;

  const aWords = a.split(' ').filter(Boolean);
  const bWords = b.split(' ').filter(Boolean);
  const shared = aWords.filter((word) => bWords.includes(word));
  const overlap = shared.length / Math.max(Math.min(aWords.length, bWords.length), 1);
  return overlap >= 0.75;
};

const dedupeSimilarStrings = (items = [], limit = items.length) => {
  const kept = [];

  items.forEach((item) => {
    const value = String(item || '').trim();
    if (!value) return;
    if (kept.some((existing) => isTooSimilar(existing, value))) return;
    kept.push(value);
  });

  return kept.slice(0, limit);
};

const conceptTitleFromLine = (line) => {
  const cleaned = cleanSentenceText(line)
    .replace(/\([^)]*\)/g, ' ')
    .replace(/[:;,.].*$/, '')
    .replace(/\b(article|section|chapter|lesson|module|unit)\s+\d+[a-z-]*\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!cleaned) return '';

  const words = cleaned.split(' ').filter((word) => {
    const lower = word.toLowerCase();
    return word.length > 2 && !CONTENT_STOPWORDS.has(lower) && /^[a-zA-Z-]+$/.test(word);
  });

  const phrase = words.slice(0, 5).join(' ').trim();
  if (phrase.split(' ').length < 2) return '';

  return phrase
    .split(' ')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
};

const extractCandidateConcepts = (text) => {
  const lines = stripPdfNoise(text)
    .split('\n')
    .map((line) => cleanSentenceText(line))
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean);

  const sentenceCandidates = sentenceParts(text)
    .map((sentence) => conceptTitleFromLine(sentence))
    .filter(Boolean);

  const headingCandidates = lines
    .filter((line) => {
      const words = line.split(' ');
      if (words.length < 2 || words.length > 8) return false;
      if (line.length > 70) return false;
      if (/[.:]/.test(line)) return false;
      return /[A-Z]/.test(line);
    })
    .map((line) => conceptTitleFromLine(line))
    .filter(Boolean);

  return dedupeSimilarStrings([...headingCandidates, ...sentenceCandidates], 8);
};

const buildConceptDetails = (text, rawConcepts = [], language = detectContentLanguage(text)) => {
  const cleaned = stripPdfNoise(text);
  const sentences = sentenceParts(cleaned);

  const details = rawConcepts
    .map((concept) => {
      const supportingSentence = sentences.find((sentence) =>
        normalizeForCompare(sentence).includes(normalizeForCompare(concept))
      );

      const detail = supportingSentence
        ? shortenAtWordBoundary(toCompleteSentence(cleanSentenceText(supportingSentence)), 180)
        : isTagalog(language)
          ? `Pansinin kung paano ginagamit ang ${concept.toLowerCase()} sa in-upload na modyul.`
          : `Focus on how ${concept.toLowerCase()} is applied in the uploaded module.`;

      return `${concept}: ${detail}`;
    });

  return dedupeSimilarStrings(details, 8);
};

const summarizeLocally = (text) => {
  const cleaned = stripPdfNoise(text)
    .replace(/^.*(Â©|copyright|all rights reserved|disclaimer|confidential|page \d+).*/gim, '')
    .replace(/^\s*-?\s*\d+\s*-?\s*$/gm, '')
    .trim();

  const summarySentences = dedupeSimilarStrings(
    cleaned
      .split(/[.!?]/)
      .map((sentence) => cleanSentenceText(sentence))
      .filter((sentence) => sentence.length > 40 && !/^(chapter|section|unit|page|header)/i.test(sentence)),
    4
  );

  if (summarySentences.length === 0) {
    return 'Summary is being prepared from the uploaded module.';
  }

  return `${summarySentences.join('. ')}.`;
};

const RECALL_PATTERNS = [
  /\bdefine\b/i,
  /\bwhat is\b/i,
  /\bin your own words\b/i,
  /\bidentify\b/i,
  /\bwhich term\b/i,
  /\bstate the definition\b/i,
];

const isLikelyRecallPrompt = (text) => RECALL_PATTERNS.some((pattern) => pattern.test(String(text || '')));

const hasLongSourceFragment = (candidate, sourceText) => {
  const normalizedCandidate = normalizeForCompare(candidate);
  const normalizedSource = normalizeForCompare(sourceText);
  const words = normalizedCandidate.split(' ').filter((word) => word.length > 3);
  if (words.length < 8) return false;

  for (let index = 0; index <= words.length - 8; index += 1) {
    const fragment = words.slice(index, index + 8).join(' ');
    if (fragment.length > 35 && normalizedSource.includes(fragment)) {
      return true;
    }
  }

  return false;
};

const hasWeakOptions = (options = []) => {
  if (!Array.isArray(options) || options.length !== 4) return true;
  const lengths = options.map((option) => String(option || '').replace(/\s+/g, ' ').trim().length);
  const min = Math.min(...lengths);
  const max = Math.max(...lengths);
  const unique = new Set(options.map((option) => normalizeForCompare(option)));
  return min < 28 || max - min > 90 || unique.size !== 4;
};

const containsBannedExamPhrases = (text = '') =>
  /\b(focus on|this module|uploaded module)\b/i.test(String(text || ''));

const isMetaDescriptionQuestion = (text = '') =>
  /\b(what is|which statement best describes|what best describes|according to the module, what is|which statement is correct)\b/i
    .test(String(text || ''));

const looksScenarioBased = (text) =>
  /\b(scenario|case|manager|student|supervisor|employee|client|team|decision|situation|must decide|faces|during|after|while|when)\b/i.test(String(text || ''));

const isQualityMcq = (question, options, sourceText, mode = 'Board') => {
  if (!question || !Array.isArray(options) || options.length !== 4) return false;
  if (hasWeakOptions(options)) return false;
  if (hasLongSourceFragment(question, sourceText)) return false;
  if (options.some((option) => hasLongSourceFragment(option, sourceText))) return false;
  if (containsBannedExamPhrases(question) || options.some((option) => containsBannedExamPhrases(option))) return false;

  if (mode === 'Class') {
    return true;
  }

  if (mode === 'Quiz') {
    if (isMetaDescriptionQuestion(question) && !looksScenarioBased(question)) return false;
    return !isLikelyRecallPrompt(question) || looksScenarioBased(question);
  }

  if (mode === 'College' && isMetaDescriptionQuestion(question) && !looksScenarioBased(question)) return false;
  if (!looksScenarioBased(question)) return false;
  return true;
};

const extractKeywords = (sentence) =>
  normalizeForCompare(sentence)
    .split(' ')
    .filter(w => w.length > 3 && !STOPWORDS.has(w));

const getTopicPhrase = (sentence) => {
  const words = extractKeywords(sentence);
  if (words.length === 0) return 'this concept';
  return words.slice(0, 3).join(' ');
};

const titleCase = (value) =>
  String(value || '')
    .split(' ')
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');

const buildQuestionStem = (title, detail, difficulty = 'medium', mode = 'Quiz', language = 'en') => {
  const label = cleanSentenceText(title || getTopicPhrase(detail) || 'this concept');
  const lowerLabel = label.toLowerCase();

  if (isTagalog(language)) {
    if (mode === 'Class') {
      const bank = [
        `Alin ang pinakamahusay na paglalarawan ng ${lowerLabel} ayon sa modyul?`,
        `Ayon sa modyul, ano ang ${lowerLabel}?`,
        `Aling pahayag tungkol sa ${lowerLabel} ang tama?`,
      ];
      return bank[Math.floor(Math.random() * bank.length)];
    }

    if (mode === 'Quiz') {
      const bank = difficulty === 'easy'
        ? [
            `Aling pahayag ang pinakatumpak tungkol sa ${lowerLabel}?`,
            `Alin ang tamang ideya kaugnay ng ${lowerLabel}?`,
            `Aling sagot ang tumutugma sa kahulugan ng ${lowerLabel}?`,
          ]
        : [
            `Kapag kailangang ilapat ang ${lowerLabel} sa isang sitwasyon, aling sagot ang pinakaangkop?`,
            `Sa pag-unawa sa ${lowerLabel}, aling pagpapasya ang pinakanatatanggol?`,
            `Aling pagpipilian ang nagpapakita ng wastong paglalapat ng ${lowerLabel}?`,
          ];
      return bank[Math.floor(Math.random() * bank.length)];
    }

    if (mode === 'College') {
      const bank = [
        `Sa isang suliraning akademiko na may kinalaman sa ${lowerLabel}, aling sagot ang pinakanatatanggol?`,
        `Kapag sinusuri ang ${lowerLabel} sa isang praktikal na kaso, aling pagpili ang pinakaangkop?`,
        `Aling paglalapat ng ${lowerLabel} ang nagpapakita ng pinakamainam na pangangatwiran?`,
      ];
      return bank[Math.floor(Math.random() * bank.length)];
    }

    const bank = difficulty === 'hard'
      ? [
          `Sa isang masalimuot na sitwasyon na umiikot sa ${lowerLabel}, aling pasya ang pinakamahusay na naipapaliwanag?`,
          `Kung ${lowerLabel} ang pangunahing usapin, aling sagot ang nagpapakita ng pinakamalakas na pagsusuri?`,
        ]
      : [
          `Sa isang sitwasyon na may kinalaman sa ${lowerLabel}, aling sagot ang pinakaangkop?`,
          `Kapag kailangang unawain ang ${lowerLabel} sa paggamit, aling pagpili ang pinakatumpak?`,
        ];

    return bank[Math.floor(Math.random() * bank.length)];
  }

  if (mode === 'Class') {
    const bank = [
      `What best describes ${lowerLabel} according to the module?`,
      `According to the module, what is ${lowerLabel}?`,
      `Which statement about ${lowerLabel} is correct?`,
    ];
    return bank[Math.floor(Math.random() * bank.length)];
  }

  if (mode === 'Quiz') {
    const bank = difficulty === 'easy'
      ? [
          `Which statement is most accurate about ${lowerLabel}?`,
          `Which idea correctly matches ${lowerLabel}?`,
          `Which answer best reflects the meaning of ${lowerLabel}?`,
        ]
      : [
          `When ${lowerLabel} must be applied in a situation, which response fits best?`,
          `Which response shows the soundest understanding of ${lowerLabel}?`,
          `Which option best applies ${lowerLabel} in context?`,
        ];
    return bank[Math.floor(Math.random() * bank.length)];
  }

  if (mode === 'College') {
    const bank = [
      `In an academic problem involving ${lowerLabel}, which response is most defensible?`,
      `Which interpretation of ${lowerLabel} is strongest in a practical academic case?`,
      `When ${lowerLabel} becomes the key issue, which response shows the best reasoning?`,
    ];
    return bank[Math.floor(Math.random() * bank.length)];
  }

  const bank = difficulty === 'hard'
    ? [
        `In a more complex situation involving ${lowerLabel}, which judgment is most defensible?`,
        `When ${lowerLabel} becomes the deciding issue, which option shows the strongest analysis?`,
      ]
    : [
        `In a situation involving ${lowerLabel}, which response best fits?`,
        `Which option shows the most accurate understanding of ${lowerLabel} in use?`,
      ];

  return bank[Math.floor(Math.random() * bank.length)];
};

const buildDirectDistractor = (detail, title, style = 'related', language = 'en') => {
  const concept = cleanSentenceText(title || getTopicPhrase(detail) || 'the concept').toLowerCase();
  const clause = getKeyClause(detail, 10) || concept;

  if (isTagalog(language)) {
    if (style === 'opposite') {
      return `Walang kaugnayan ang ideyang ito sa ${clause.toLowerCase()} at hindi ito ang tamang batayan ng pagpapasya.`;
    }

    if (style === 'swap') {
      return `Itinuturing ito bilang ibang proseso o yugto kaysa sa wastong pag-unawa sa konsepto.`;
    }

    return `Masyado itong malawak at hindi isinasaalang-alang ang tiyak na layunin o kundisyong mahalaga sa tamang paglalapat.`;
  }

  if (style === 'opposite') {
    return `This idea is unrelated to ${clause.toLowerCase()} and is not the proper basis for the decision.`;
  }

  if (style === 'swap') {
    return `It treats the concept as a different process, method, or stage from the one actually intended.`;
  }

  return `It is framed too broadly and ignores the specific purpose or condition needed for correct application.`;
};

const buildDirectQuestion = (title, detail, distractorPool = [], difficulty = 'medium', mode = 'Quiz', language = 'en') => {
  const correct = shortenAtWordBoundary(toCompleteSentence(cleanSentenceText(detail)), 150);
  const rawDistractors = distractorPool
    .map((item) => shortenAtWordBoundary(toCompleteSentence(cleanSentenceText(item.detail || item)), 150))
    .filter((option) => normalizeForCompare(option) !== normalizeForCompare(correct));

  const distractors = uniqueBy(
    [
      ...rawDistractors.slice(0, 3),
      buildDirectDistractor(detail, title, 'related', language),
      buildDirectDistractor(detail, title, 'swap', language),
      buildDirectDistractor(detail, title, 'opposite', language),
    ],
    (option) => normalizeForCompare(option),
  ).filter((option) => normalizeForCompare(option) !== normalizeForCompare(correct)).slice(0, 3);

  if (distractors.length < 3) return null;

  const { options, correctAnswer } = shuffleOptions([correct, ...distractors], 0);
  const question = buildQuestionStem(title, detail, difficulty, mode, language);
  const topic = cleanSentenceText(title || getTopicPhrase(detail));
  const correctExplanation = buildCorrectExplanation(topic, language);

  return {
    question,
    options,
    correctAnswer,
    difficulty,
    type: 'mcq',
    explanation: correctExplanation,
    correctExplanation,
    optionExplanations: buildOptionExplanations(options, correctAnswer, topic, language, correctExplanation),
  };
};

const sentenceToScenario = (sentence, topic, difficulty = 'medium', mode = 'Board', language = 'en') => {
  const clause = getKeyClause(sentence, difficulty === 'hard' ? 12 : 9) || topic;
  const topicLabel = topic || 'the issue';

  if (isTagalog(language)) {
    if (mode === 'Class') {
      const bank = [
        `May maikling tanong sa klase tungkol sa ${topicLabel}. Aling ideya ang dapat unang maisip?`,
        `Naghahanda ang isang mag-aaral at nakita ang ${topicLabel}. Aling sagot ang pinakaangkop sa aralin?`,
        `May maikling concept check tungkol sa ${topicLabel}. Aling sagot ang pinakatumpak?`,
      ];
      return bank[Math.floor(Math.random() * bank.length)];
    }

    if (mode === 'Quiz') {
      const bank = [
        `Nakatuon sa ${topicLabel} ang isang tanong sa pagsusulit. Aling sagot ang pinakamahusay na sinusuportahan ng modyul?`,
        `Dapat sagutin ng isang mag-aaral ang maikling tanong tungkol sa ${topicLabel}. Aling pagpipilian ang pinakamalakas?`,
        `Aling sagot ang pinakamahusay na paglalapat ng talakayan ng modyul tungkol sa ${topicLabel}?`,
      ];
      return bank[Math.floor(Math.random() * bank.length)];
    }

    if (mode === 'College') {
      const bank = [
        `Dapat ilapat ng isang mag-aaral ang ${topicLabel} sa isang suliraning akademiko. Aling sagot ang pinakaangkop sa modyul?`,
        `Sa isang college-level na tanong tungkol sa ${topicLabel}, aling sagot ang pinakanatatanggol?`,
        `May praktikal na kasong umiikot sa ${topicLabel}. Aling pagpipilian ang nagpapakita ng pinakamahusay na pangangatwiran?`,
      ];
      return bank[Math.floor(Math.random() * bank.length)];
    }

    const easyScenarios = [
      `Nirerepaso ng isang mag-aaral ang ${topicLabel} bago ang pagsusulit. Aling sagot ang pinakaangkop sa aralin?`,
      `Sa recitation, hinihingi ang paglalapat ng ${topicLabel}. Aling sagot ang pinakatumpak?`,
      `Napunta sa ${topicLabel} ang talakayan sa klase. Aling pagpipilian ang pinakamahusay na sumasalamin sa modyul?`,
    ];

    const mediumScenarios = [
      `May sitwasyong iniharap tungkol sa ${topicLabel}. Aling sagot ang nagpapakita ng pinakamahusay na interpretasyon?`,
      `Dapat pumili ng pinakamainam na paglalapat ng ${topicLabel} ang isang mag-aaral. Aling opsyon ang pinakanatatanggol?`,
      `Sa isang maikling kaso tungkol sa ${topicLabel}, aling sagot ang pinakamahusay na sumusunod sa pangangatwiran ng materyal?`,
    ];

    const hardScenarios = [
      `Sa isang makatotohanang sitwasyon kung saan mahalaga ang ${clause.toLowerCase()}, aling kilos o pasya ang pinakamahusay na sinusuportahan ng modyul?`,
      `May kinakaharap na sitwasyon ang isang tagapagpasya na may kinalaman sa ${topicLabel}. Aling sagot ang pinakamainam na paglalapat ng aralin?`,
      `Kung ang pangunahing usapin ay ${topicLabel}, aling opsyon ang nagpapakita ng pinakamatibay na inilapat na pangangatwiran?`,
    ];

    const bank = difficulty === 'easy' ? easyScenarios : difficulty === 'hard' ? hardScenarios : mediumScenarios;
    return bank[Math.floor(Math.random() * bank.length)];
  }

  if (mode === 'Class') {
    const bank = [
      `A quick class-prep item mentions ${topicLabel}. Which idea should come to mind first?`,
      `A student prepares for class and sees ${topicLabel}. Which response best fits the lesson?`,
      `A short concept check involves ${topicLabel}. Which answer is most accurate?`,
    ];
    return bank[Math.floor(Math.random() * bank.length)];
  }

  if (mode === 'Quiz') {
    const bank = [
      `A quiz item focuses on ${topicLabel}. Which response is best supported by the module?`,
      `A student must answer a short problem about ${topicLabel}. Which choice is strongest?`,
      `Which response best applies the module's discussion of ${topicLabel}?`,
    ];
    return bank[Math.floor(Math.random() * bank.length)];
  }

  if (mode === 'College') {
    const bank = [
      `A student must apply ${topicLabel} to an academic problem. Which response best fits the module?`,
      `In a college-level application item involving ${topicLabel}, which answer is most defensible?`,
      `A practical academic case turns on ${topicLabel}. Which choice shows the best reasoning?`,
    ];
    return bank[Math.floor(Math.random() * bank.length)];
  }

  const easyScenarios = [
    `A student is reviewing ${topicLabel} before a major test. Which response best fits the lesson?`,
    `During recitation, a learner is asked to apply ${topicLabel}. Which answer is most accurate?`,
    `A class discussion turns to ${topicLabel}. Which choice best reflects the module?`,
  ];

  const mediumScenarios = [
    `A reviewer item presents a situation involving ${topicLabel}. Which response shows the best interpretation?`,
    `A student must choose the strongest application of ${topicLabel}. Which option is most defensible?`,
    `In a short case involving ${topicLabel}, which answer best follows the material's reasoning?`,
  ];

  const hardScenarios = [
    `In a realistic case where ${clause.toLowerCase()} becomes important, which action or judgment is best supported by the module?`,
    `A decision-maker faces a scenario involving ${topicLabel}. Which response applies the lesson most soundly?`,
    `When the key issue is ${topicLabel}, which option shows the strongest applied reasoning?`,
  ];

  const bank = difficulty === 'easy' ? easyScenarios : difficulty === 'hard' ? hardScenarios : mediumScenarios;
  return bank[Math.floor(Math.random() * bank.length)];
};

const buildFlashcardFront = (topic, difficulty = 'medium', mode = 'Board', language = 'en') => {
  const label = String(topic || 'the topic').toLowerCase();

  if (isTagalog(language)) {
    if (mode === 'Class') {
      const bank = [
        `Ano ang ${label} ayon sa modyul?`,
        `Ano ang sinasabi ng modyul tungkol sa ${label}?`,
      ];
      return bank[Math.floor(Math.random() * bank.length)];
    }

    if (mode === 'Quiz') {
      const bank = [
        `Ano ang pangunahing ideya ng ${label} sa modyul?`,
        `Ayon sa modyul, alin ang pinakamahusay na paliwanag sa ${label}?`,
      ];
      return bank[Math.floor(Math.random() * bank.length)];
    }
  }

  if (mode === 'Class') {
    const bank = [
      `What is ${label} according to the module?`,
      `What does the module say about ${label}?`,
    ];
    return bank[Math.floor(Math.random() * bank.length)];
  }

  if (mode === 'Quiz') {
    const bank = [
      `What is the main idea of ${label} in the module?`,
      `According to the module, what best explains ${label}?`,
    ];
    return bank[Math.floor(Math.random() * bank.length)];
  }

  if (mode === 'College') {
    const bank = [
      `A college-level problem involves ${label}. Which module-based idea should guide the response?`,
      `A student must apply ${label} to a practical academic situation. What point matters most?`,
    ];
    return bank[Math.floor(Math.random() * bank.length)];
  }

  const easy = [
    `A student encounters ${label} in a routine review problem. Which idea from the module should guide the answer?`,
    `During a simple classroom scenario involving ${label}, what point matters most?`,
  ];
  const medium = [
    `A short practical case involves ${label}. Which module-based idea should be applied first?`,
    `When ${label} appears in an applied item, what should the student focus on?`,
  ];
  const hard = [
    `A board-style scenario turns on ${label}. Which judgment is most supported by the module?`,
    `In a more complex case involving ${label}, what application best fits the module?`,
  ];

  const bank = difficulty === 'easy' ? easy : difficulty === 'hard' ? hard : medium;
  return bank[Math.floor(Math.random() * bank.length)];
};

const getKeyClause = (sentence, maxWords = 10) => {
  const cleaned = cleanSentenceText(sentence)
    .replace(/\([^)]*\)/g, '')
    .replace(/\b(according to|in conclusion|therefore|however|for example|such as)\b/gi, '')
    .trim();
  const clauses = cleaned
    .split(/[,:;()-]/)
    .map((part) => part.trim())
    .filter(Boolean);
  const source = clauses.find((part) => part.split(/\s+/).length >= 4) || cleaned;
  return source
    .split(/\s+/)
    .slice(0, maxWords)
    .join(' ')
    .trim();
};

const makeAppliedOption = (sentence, style = 'best', language = 'en') => {
  const clause = getKeyClause(sentence);
  if (!clause) return optionFromSentence(sentence);

  if (isTagalog(language)) {
    if (style === 'best') {
      return `Piliin ang sagot na isinasaalang-alang ang ${clause.charAt(0).toLowerCase()}${clause.slice(1)} bago magpasya.`;
    }

    if (style === 'misread') {
      return `Ipagpalagay na ang ${clause.toLowerCase()} ang laging batayan kahit hindi ito sinusuportahan ng kabuuang konteksto.`;
    }

    if (style === 'overreach') {
      return `Ipalapat nang masyadong malawak ang ${clause.toLowerCase()} at balewalain ang mga hangganan o kundisyong ipinahihiwatig ng aralin.`;
    }

    return `Ibase ang sagot sa kaugnay ngunit ibang ideya, na para bang mas payak ang kahulugan ng ${clause.toLowerCase()} kaysa sa ipinahihiwatig ng modyul.`;
  }

  if (style === 'best') {
    return `Prioritize the response that accounts for ${clause.charAt(0).toLowerCase()}${clause.slice(1)} before making the decision.`;
  }

  if (style === 'misread') {
    return `Assume ${clause.toLowerCase()} always controls the outcome, even when the surrounding facts do not support that conclusion.`;
  }

  if (style === 'overreach') {
    return `Apply ${clause.toLowerCase()} too broadly and ignore the limits or conditions that the lesson implies.`;
  }

  return `Base the answer on a related but different idea, treating ${clause.toLowerCase()} as if it meant something simpler than the module suggests.`;
};

const optionFromSentence = (sentence) => {
  const s = shortenAtWordBoundary(toCompleteSentence(cleanSentenceText(sentence)), 135);
  return s.startsWith('•') ? s.slice(1).trim() : s;
};

const pickDistractors = (target, pool, count = 3) => {
  const tKeywords = new Set(extractKeywords(target));
  const scored = pool
    .filter(s => normalizeForCompare(s) !== normalizeForCompare(target))
    .map((s) => {
      const kws = extractKeywords(s);
      const overlap = kws.filter(k => tKeywords.has(k)).length;
      const lengthGap = Math.abs(s.length - target.length);
      // Prefer some topical overlap but not too close to avoid duplicates.
      const score = overlap * 5 - Math.min(lengthGap, 120) / 20;
      return { s, score };
    })
    .sort((a, b) => b.score - a.score)
    .map(x => x.s);

  return uniqueBy(scored, s => normalizeForCompare(s)).slice(0, count);
};

const buildWrongOptions = (correct, language = 'en') => {
  const generic = isTagalog(language)
    ? [
        'Sobra ang paglalahat nito lampas sa saklaw ng materyal.',
        'Binabaligtad nito ang ugnayang ipinahihiwatig ng materyal.',
        'Pinagpapalit nito ang kaugnay na termino at ang pangunahing konsepto.',
        'Inilalapat nito ang konsepto sa kontekstong hindi sinusuportahan ng teksto.'
      ]
    : [
        'It overgeneralizes the concept beyond the material scope.',
        'It reverses the causal direction implied in the material.',
        'It confuses a related term with the main concept.',
        'It applies the concept to a context not supported by the text.'
      ];
  return generic.filter(opt => opt.toLowerCase() !== correct.toLowerCase()).slice(0, 3);
};

const shuffleOptions = (options, correctIndex = 0) => {
  const tagged = options.map((o, i) => ({ o, i }));
  for (let i = tagged.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [tagged[i], tagged[j]] = [tagged[j], tagged[i]];
  }
  return {
    options: tagged.map(x => x.o),
    correctAnswer: tagged.findIndex(x => x.i === correctIndex)
  };
};

const ensureQuestionMark = (value) => {
  const text = cleanSentenceText(value).replace(/\s+/g, ' ').trim();
  if (!text) return '';
  return /[?]$/.test(text) ? text : `${text.replace(/[.!]+$/, '')}?`;
};

const sanitizeOptionText = (value) => {
  const text = cleanSentenceText(value).replace(/\s+/g, ' ').trim();
  if (!text) return '';
  return text.replace(/[?]+$/, '').replace(/\s+\./g, '.');
};

const sanitizeExplanation = (value, fallbackTopic = 'the concept') => {
  const text = cleanSentenceText(value).replace(/\s+/g, ' ').trim();
  if (!text) return `The correct answer best matches the module's explanation of ${fallbackTopic}.`;
  return /[.!?]$/.test(text) ? text : `${text}.`;
};

const buildCorrectExplanation = (topic, language = 'en') => {
  const cleanTopic = cleanSentenceText(topic || 'this concept') || 'this concept';
  return isTagalog(language)
    ? `Ito ang tamang sagot dahil ito ang pinakatumpak na tumutugma sa paliwanag ng modyul tungkol sa ${cleanTopic}.`
    : `This is correct because it most accurately matches the module's explanation of ${cleanTopic}.`;
};

const buildWrongExplanation = (topic, variant = 0, language = 'en') => {
  const cleanTopic = cleanSentenceText(topic || 'this concept') || 'this concept';

  if (isTagalog(language)) {
    const bank = [
      `Mali ito dahil masyado itong malawak at hindi nito isinasaalang-alang ang tiyak na kundisyon ng ${cleanTopic}.`,
      `Mali ito dahil pinagpapalit nito ang ${cleanTopic} sa isang magkaugnay ngunit ibang ideya.`,
      `Mali ito dahil inilalapat nito ang ${cleanTopic} sa paraang hindi sinusuportahan ng modyul.`,
    ];
    return bank[variant % bank.length];
  }

  const bank = [
    `This is wrong because it is too broad and misses the key condition tied to ${cleanTopic}.`,
    `This is wrong because it confuses ${cleanTopic} with a related but different idea.`,
    `This is wrong because it applies ${cleanTopic} in a way the module does not support.`,
  ];
  return bank[variant % bank.length];
};

const buildOptionExplanations = (options = [], correctAnswer = 0, topic = 'the concept', language = 'en', providedCorrectExplanation = '') =>
  options.map((_, index) => (
    index === correctAnswer
      ? sanitizeExplanation(providedCorrectExplanation || buildCorrectExplanation(topic, language), topic)
      : sanitizeExplanation(buildWrongExplanation(topic, index, language), topic)
  ));

const sanitizeOptionExplanations = (
  value,
  options = [],
  correctAnswer = 0,
  topic = 'the concept',
  language = 'en',
  correctExplanation = '',
) => {
  if (!Array.isArray(options) || options.length !== 4) return [];

  if (!Array.isArray(value) || value.length !== options.length) {
    return buildOptionExplanations(options, correctAnswer, topic, language, correctExplanation);
  }

  return value.map((entry, index) => {
    const fallback = index === correctAnswer
      ? (correctExplanation || buildCorrectExplanation(topic, language))
      : buildWrongExplanation(topic, index, language);
    const cleaned = cleanSentenceText(entry).replace(/\s+/g, ' ').trim();
    return cleaned ? sanitizeExplanation(cleaned, topic) : sanitizeExplanation(fallback, topic);
  });
};

const conceptFingerprint = (question, explanation = '') => {
  const normalized = normalizeConceptKey(`${question} ${explanation}`);
  return normalized
    .split(' ')
    .filter((word) => word.length > 3 && !CONTENT_STOPWORDS.has(word))
    .slice(0, 6)
    .join(' ');
};

const finalizeMcqs = (items = [], sourceText = '', mode = 'Quiz', limit = 24) => {
  const seenQuestions = new Set();
  const seenConcepts = new Set();
  const finalized = [];

  items.forEach((item) => {
    const question = ensureQuestionMark(item?.question);
    const options = Array.isArray(item?.options)
      ? item.options.map((option) => sanitizeOptionText(option)).filter(Boolean)
      : [];
    const correctAnswer = Number.isInteger(item?.correctAnswer) ? item.correctAnswer : -1;
    const topic = getTopicPhrase(question);
    const language = detectContentLanguage(`${question} ${options.join(' ')}`, topic);
    const explanation = sanitizeExplanation(
      item?.correctExplanation || item?.explanation || buildCorrectExplanation(topic, language),
      topic,
    );
    const optionExplanations = sanitizeOptionExplanations(
      item?.optionExplanations,
      options,
      correctAnswer,
      topic,
      language,
      explanation,
    );

    if (!question || options.length !== 4 || correctAnswer < 0 || correctAnswer > 3) return;
    if (new Set(options.map((option) => normalizeForCompare(option))).size !== 4) return;
    if (!isQualityMcq(question, options, sourceText, mode)) return;

    const questionKey = normalizeForCompare(question);
    const conceptKey = conceptFingerprint(question, explanation);

    if (seenQuestions.has(questionKey)) return;
    if (conceptKey && seenConcepts.has(conceptKey)) return;

    seenQuestions.add(questionKey);
    if (conceptKey) seenConcepts.add(conceptKey);

    finalized.push({
      question,
      options,
      correctAnswer,
      difficulty: item?.difficulty || 'medium',
      type: 'mcq',
      explanation,
      correctExplanation: explanation,
      optionExplanations,
    });
  });

  return finalized.slice(0, limit);
};

const sanitizeFlashcardFront = (value) => ensureQuestionMark(value);

const sanitizeFlashcardBack = (value, fallbackTopic = 'the concept') => {
  const text = shortenAtWordBoundary(toCompleteSentence(cleanSentenceText(value)), 180);
  if (!text) return `Review the module's explanation of ${fallbackTopic}.`;
  return text;
};

const finalizeFlashcards = (cards = [], limit = 12) => {
  const seenConcepts = new Set();
  const finalized = [];

  cards.forEach((card) => {
    const front = sanitizeFlashcardFront(card?.front);
    const back = sanitizeFlashcardBack(card?.back, getTopicPhrase(card?.front));
    const conceptKey = conceptFingerprint(front, back);

    if (!front || !back) return;
    if (finalized.some((existing) => isTooSimilar(existing.front, front) || isTooSimilar(existing.back, back))) {
      return;
    }
    if (conceptKey && seenConcepts.has(conceptKey)) return;

    if (conceptKey) seenConcepts.add(conceptKey);
    finalized.push({
      front,
      back,
      difficulty: card?.difficulty || 'medium',
    });
  });

  return finalized.slice(0, limit);
};

const buildExamQuestion = (sentence, difficulty, idx, pool, profile) => {
  const language = profile.language || detectContentLanguage(pool.join(' '));
  const correct = makeAppliedOption(sentence, 'best', language);
  const distractorsRaw = pickDistractors(sentence, pool, 3);
  const generatedDistractors = [
    makeAppliedOption(distractorsRaw[0] || sentence, 'misread', language),
    makeAppliedOption(distractorsRaw[1] || sentence, 'overreach', language),
    makeAppliedOption(distractorsRaw[2] || sentence, 'confuse', language),
  ];
  const distractors = uniqueBy(generatedDistractors, (option) => normalizeForCompare(option))
    .filter((option) => normalizeForCompare(option) !== normalizeForCompare(correct));
  if (distractors.length < 3) {
    return null;
  }
  const { options, correctAnswer } = shuffleOptions([correct, ...distractors], 0);
  const topic = getTopicPhrase(sentence);
  const stem = sentenceToScenario(sentence, topic, difficulty, profile.mode, language);
  if (!isQualityMcq(stem, options, pool.join(' '), profile.mode)) {
    return null;
  }

  return {
    question: stem,
    options,
    correctAnswer,
    difficulty,
    type: 'mcq',
    explanation: buildCorrectExplanation(topic, language),
    correctExplanation: buildCorrectExplanation(topic, language),
    optionExplanations: buildOptionExplanations(
      options,
      correctAnswer,
      topic,
      language,
      buildCorrectExplanation(topic, language),
    ),
  };
};

// Generate difficulty-specific, exam-style questions
const generateMultipleChoiceQuestions = (text, generationOptions = {}) => {
  const profile = normalizeGenerationOptions(generationOptions);
  const language = generationOptions.language || detectContentLanguage(text, generationOptions.title);
  const cleanText = stripPdfNoise(text)
    .replace(/^[^\n]*(?:Property of|STI|student|confidential|©).*$/gim, '')
    .replace(/^\s*-?\s*\d+\s*-?\s*$/gm, '')
    .replace(/^.*(©|copyright|all rights reserved|disclaimer|confidential|proprietary|page \d+).*/gim, '')
    .replace(/[\w\.-]+@[\w\.-]+\.\w+/g, '')
    .replace(/https?:\/\/\S+/g, '')
    .replace(/^\s*[*_-]{3,}\s*$/gm, '')
    .replace(/\n\s*\n+/g, '\n')
    .trim();

  const sentences = uniqueBy(sentenceParts(cleanText), (s) => s.toLowerCase());
  if (sentences.length === 0) return [];

  const conceptDetails = buildConceptDetails(cleanText, extractCandidateConcepts(cleanText), language)
    .map((entry) => {
      const [title, detail] = String(entry).split(/:\s+(.+)/);
      return {
        title: cleanSentenceText(title),
        detail: cleanSentenceText(detail || title),
      };
    })
    .filter((entry) => entry.title && entry.detail);

  if (profile.mode === 'Class' || profile.mode === 'Quiz') {
    const directSource = conceptDetails.length > 0
      ? conceptDetails
      : sentences.slice(0, 12).map((sentence) => ({
          title: titleCase(getTopicPhrase(sentence)),
          detail: sentence,
        }));

    const directQuestions = directSource
      .map((entry, index) => {
        const pool = directSource.filter((_, poolIndex) => poolIndex !== index);
        const difficulty = mapDifficultyLabel(profile.difficulty, index, Math.max(directSource.length, 1));
        return buildDirectQuestion(entry.title, entry.detail, pool, difficulty, profile.mode, language);
      })
      .filter(Boolean);

    return finalizeMcqs(directQuestions, cleanText, profile.mode, 12);
  }

  const easyPool = [];
  const mediumPool = [];
  const hardPool = [];

  sentences.forEach((s, i) => {
    const wc = s.split(/\s+/).length;
    if (wc <= 18) easyPool.push(s);
    else if (wc <= 32) mediumPool.push(s);
    else hardPool.push(s);
  });

  const backfill = [...sentences];
  const fill = (arr, min) => {
    for (let i = 0; arr.length < min && i < backfill.length; i += 1) arr.push(backfill[i]);
  };
  fill(easyPool, 8);
  fill(mediumPool, 8);
  fill(hardPool, 8);

  const targets = profile.difficulty === 'Mixed'
    ? [
        { bucket: uniqueBy(easyPool, (s) => s.toLowerCase()).slice(0, 8), difficulty: 'easy' },
        { bucket: uniqueBy(mediumPool, (s) => s.toLowerCase()).slice(0, 8), difficulty: 'medium' },
        { bucket: uniqueBy(hardPool, (s) => s.toLowerCase()).slice(0, 8), difficulty: 'hard' },
      ]
    : [
        {
          bucket: uniqueBy(sentences, (s) => s.toLowerCase()).slice(0, 18),
          difficulty: mapDifficultyLabel(profile.difficulty),
        },
      ];

  const generated = targets.flatMap(({ bucket, difficulty }) =>
    bucket.map((sentence, index) => buildExamQuestion(sentence, difficulty, index, sentences, profile)).filter(Boolean)
  );

  return finalizeMcqs(generated, cleanText, profile.mode, 24);
};

const buildStudyFlashcards = (text, keyConcepts = [], generationOptions = {}) => {
  const profile = normalizeGenerationOptions(generationOptions);
  const language = generationOptions.language || detectContentLanguage(text, generationOptions.title);
  const cards = [];
  const cleaned = stripPdfNoise(text);
  const sentences = sentenceParts(cleaned);

  keyConcepts
    .slice(0, 8)
    .forEach((concept, index) => {
      const [title, detail] = String(concept).split(/:\s+(.+)/);
      const cleanTitle = cleanSentenceText(title?.trim() || concept);
      const supportingSentence = sentences.find((sentence) =>
        normalizeForCompare(sentence).includes(normalizeForCompare(cleanTitle))
      );
      const cleanDetail = supportingSentence
        ? shortenAtWordBoundary(toCompleteSentence(cleanSentenceText(supportingSentence)), 180)
        : detail?.trim()
          ? shortenAtWordBoundary(toCompleteSentence(cleanSentenceText(detail.trim())), 180)
          : isTagalog(language)
            ? `Iugnay ang pangunahing punto tungkol sa ${cleanTitle.toLowerCase()} batay sa paglalahad ng modyul.`
            : `Apply the key point about ${cleanTitle.toLowerCase()} as presented in the module.`;
      const difficulty = mapDifficultyLabel(profile.difficulty, index, 12);
      const front = buildFlashcardFront(cleanTitle, difficulty, profile.mode, language);
      if ((profile.mode !== 'Class' && isLikelyRecallPrompt(front)) || hasLongSourceFragment(front, cleaned)) return;
      cards.push({
        front,
        back: cleanDetail,
        difficulty
      });
    });

  sentences.slice(0, 10).forEach((sentence, index) => {
    if (cards.length >= 12) return;
    const topic = getTopicPhrase(sentence);
    const highYieldAnswer = shortenAtWordBoundary(toCompleteSentence(cleanSentenceText(sentence)), 180);
    const difficulty = mapDifficultyLabel(profile.difficulty, index, 12);
    const front = buildFlashcardFront(topic, difficulty, profile.mode, language);
    if ((profile.mode !== 'Class' && isLikelyRecallPrompt(front)) || hasLongSourceFragment(front, cleaned)) return;
    cards.push({
      front,
      back: highYieldAnswer,
      difficulty
    });
  });

  const uniqueCards = [];

  uniqueByNormalizedText(cards, (card) => `${card.front} ${card.back}`).forEach((card) => {
    if (uniqueCards.some((existing) => isTooSimilar(existing.front, card.front) || isTooSimilar(existing.back, card.back))) {
      return;
    }
    uniqueCards.push(card);
  });

  return finalizeFlashcards(uniqueCards, 12);
};

const detectExtractionWarning = (cleanedText, pageCount = 0) => {
  if (!cleanedText || cleanedText.length < 180) {
    return 'Text extraction looks weak. Review the generated notes before studying.';
  }

  if (pageCount >= 3 && cleanedText.length / pageCount < 220) {
    return 'Some pages may not have extracted cleanly. Review the PDF preview and summary for accuracy.';
  }

  return '';
};

// Generate case-based situational legal exam questions
const generateCaseBasedQuestions = () => {
  const legalCases = [
    {
      scenario: 'ABC Construction agrees to build a residential complex for XYZ Developer by December 15. On December 10, an earthquake destroyed 60% of the construction materials at the site. ABC claims they cannot continue due to the fortuitous event.',
      topic: 'Fortuitous Events & Obligations',
      questions: [
        {
          question: 'What is the legal consequence of the earthquake on ABC\'s obligation to deliver the project?',
          options: [
            'ABC is exempt from liability if the earthquake is deemed a fortuitous event beyond their control',
            'ABC must still pay damages to XYZ because earthquakes are foreseeable in the region',
            'ABC is obligated to rebuild using their own funds regardless of the damage',
            'XYZ must provide insurance coverage for all fortuitous events'
          ],
          correctAnswer: 0,
          difficulty: 'hard'
        },
        {
          question: 'Under the law of obligations, when ABC claims force majeure due to the earthquake, which element must they prove?',
          options: [
            'That the event could not have been foreseen or prevented despite reasonable efforts',
            'That the contract price was too low to account for such risks',
            'That they had not received payment from XYZ yet',
            'That the earthquake caused less than 50% damage to the site'
          ],
          correctAnswer: 0,
          difficulty: 'hard'
        }
      ]
    },
    {
      scenario: 'MNO Bank loaned ₱500,000 to three business partners (Juan, Pedro, and Luis) for their venture. The contract states they are "solidarily liable" for the loan.',
      topic: 'Solidary vs Joint Liability',
      questions: [
        {
          question: 'What does solidary liability mean in this contractual context, and what is MNO Bank\'s right?',
          options: [
            'MNO Bank can demand full payment from any one of the three partners, and that partner is liable for the entire ₱500,000',
            'MNO Bank must divide the debt equally and can only demand ₱166,666.67 from each partner',
            'MNO Bank can only sue all three partners together in one case',
            'MNO Bank has no claim against individual partners, only against the partnership entity'
          ],
          correctAnswer: 0,
          difficulty: 'hard'
        },
        {
          question: 'If Juan pays the entire ₱500,000 to MNO Bank, what are his legal rights against Pedro and Luis?',
          options: [
            'Juan can demand reimbursement from Pedro and Luis for their share of the debt (recovery/subrogation)',
            'Juan cannot recover anything because he voluntarily assumed all liability',
            'Juan can only recover from the one who benefited most from the loan',
            'Juan must wait for MNO Bank to sue Pedro and Luis first'
          ],
          correctAnswer: 0,
          difficulty: 'hard'
        }
      ]
    },
    {
      scenario: 'Fashion Boutique contracted with Textile Supplier to deliver 1,000 meters of premium fabric on March 1. Textile Supplier delayed delivery until March 15. Fashion Boutique lost sales worth ₱50,000 due to the delay and now faces bankruptcy.',
      topic: 'Delay & Breach of Obligation',
      questions: [
        {
          question: 'Under the law of obligations, what is the status of Textile Supplier\'s obligation after March 1?',
          options: [
            'The obligation is in "mora" (delay), and Textile Supplier is liable for damages caused by the delay',
            'The obligation is automatically extinguished because the deadline passed',
            'Textile Supplier can decide whether to fulfill the obligation or pay damages',
            'Fashion Boutique waives all rights upon accepting the late delivery'
          ],
          correctAnswer: 0,
          difficulty: 'hard'
        },
        {
          question: 'What damages can Fashion Boutique claim from Textile Supplier for the 14-day delay?',
          options: [
            'Actual damages (lost sales of ₱50,000) and moral damages if applicable, and the cost of finding alternative suppliers',
            'Only the difference in market price of the fabric between March 1 and March 15',
            'Unlimited damages for all business losses extending one year from the delay',
            'No damages because partial performance was eventually made'
          ],
          correctAnswer: 0,
          difficulty: 'hard'
        }
      ]
    },
    {
      scenario: 'Real Estate Developer promised to deliver a condominium unit to Buyer by June 30. Two construction workers died in an accident on the site, investigations halted construction for 60 days, and the developer could not meet the deadline.',
      topic: 'Fortuitous Events & Breach',
      questions: [
        {
          question: 'Is the developer\'s failure to deliver by June 30 a breach of obligation or excused by fortuitous event?',
          options: [
            'It depends on whether the accident was foreseeable and whether proper safety measures were in place; if proper precautions were taken, it may be excused',
            'It is automatically a breach regardless of the accident',
            'It is automatically excused because accidents are fortuitous events',
            'The developer must compensate heirs but still deliver the unit immediately'
          ],
          correctAnswer: 0,
          difficulty: 'hard'
        },
        {
          question: 'If the developer claims the accident is a fortuitous event, what must they demonstrate to be exempt from liability?',
          options: [
            'That (1) the event was extraordinary and unforeseeable, (2) they exercised due diligence, and (3) the event directly prevented performance',
            'That they have adequate insurance coverage',
            'That the accident occurred within the project timeline originally estimated',
            'That the buyer was informed before the deadline passed'
          ],
          correctAnswer: 0,
          difficulty: 'hard'
        }
      ]
    },
    {
      scenario: 'Employment Contract: Company XYZ employed Engineer Maria with a salary of ₱100,000/month for 3 years. After 18 months, XYZ terminated Maria without just cause or notice. Maria demands payment of remaining salary plus damages.',
      topic: 'Extinguishment of Obligations & Breach',
      questions: [
        {
          question: 'How is the employment obligation extinguished when XYZ terminated Maria without just cause?',
          options: [
            'The obligation is extinguished but XYZ remains liable for damages; Maria can claim the remaining salary (₱150,000) and moral damages',
            'The obligation is completely extinguished upon termination',
            'The obligation converts to a debt requiring arbitration',
            'Maria loses all rights since the contract was already partially performed'
          ],
          correctAnswer: 0,
          difficulty: 'hard'
        },
        {
          question: 'Under the doctrine of extinguishment of obligations, which apply to this case?',
          options: [
            'Payment (partial), breach by the obligor (XYZ), and damages as a new obligation for compensation',
            'Only payment, as that is the sole method of extinguishing obligations',
            'Condonation, if Maria forgives XYZ',
            'Prescription, after a certain period of non-payment'
          ],
          correctAnswer: 0,
          difficulty: 'hard'
        }
      ]
    }
  ];

  const selectedCases = [];
  const usedIndices = new Set();

  // Randomly select 2-3 cases for diverse scenarios
  while (selectedCases.length < Math.min(3, legalCases.length) && usedIndices.size < legalCases.length) {
    const idx = Math.floor(Math.random() * legalCases.length);
    if (!usedIndices.has(idx)) {
      usedIndices.add(idx);
      selectedCases.push(legalCases[idx]);
    }
  }

  const questions = [];
  selectedCases.forEach(caseData => {
    caseData.questions.forEach(q => {
      questions.push({
        ...q,
        caseScenario: caseData.scenario,
        topic: caseData.topic
      });
    });
  });

  return questions.slice(0, 8);
};

// Fallback quiz generation without OpenAI - Focused on academic content only
const generateFallbackQuiz = (text) => {
  // Detect if this is legal content about obligations, contracts, liability, etc.
  const legalKeywords = /\b(obligation|contract|liability|breach|delay|mora|fortuitous|solidary|joint|liability|damages|extinguish|condonation|prescription|debtor|creditor|performance|non-performance|delay|default|force majeure)\b/gi;
  const legalMatches = text.match(legalKeywords) || [];
  
  // If content contains legal keywords (more than 3 matches), use case-based questions
  if (legalMatches.length >= 3) {
    const caseBasedQuestions = generateCaseBasedQuestions();
    if (caseBasedQuestions.length > 0) {
      return caseBasedQuestions;
    }
  }

  // Clean text: Remove headers, footers, page numbers, emails, disclaimers
  let cleanText = stripPdfNoise(text)
    // Remove document headers/footers with watermarks
    .replace(/^[^\n]*(?:Property of|STI|student|confidential|©).*$/gim, '')
    // Remove page numbers (standalone numbers at start/end of lines)
    .replace(/^\s*-?\s*\d+\s*-?\s*$/gm, '')
    // Remove copyright and disclaimer lines
    .replace(/^.*(©|copyright|all rights reserved|disclaimer|confidential|proprietary|page \d+).*/gim, '')
    // Remove email addresses
    .replace(/[\w\.-]+@[\w\.-]+\.\w+/g, '')
    // Remove URLs
    .replace(/https?:\/\/\S+/g, '')
    // Remove lines with special characters only (like section separators)
    .replace(/^\s*[*_-]{3,}\s*$/gm, '')
    // Remove excessive whitespace
    .replace(/\n\s*\n+/g, '\n')
    .trim();

  // Extract meaningful sentences (academic content)
  const sentences = cleanText.match(/[^.!?]+[.!?]+/g) || [];
  
  // Filter for academic sentences (longer, substantive content)
  const academicSentences = sentences
    .map((s) => s.trim())
    .filter((s) => {
      // Keep sentences with meaningful length and academic indicators
      const length = s.length;
      // Exclude lines that look like metadata or formatting garbage
      const isGarbage = /^[A-Z0-9\s]*$/.test(s) || // All caps/numbers
                       /[*_-]{2,}/.test(s) || // Lots of special chars
                       /^\d+$/.test(s) || // Just numbers
                       /box|figure|table|page|header|footer/i.test(s); // Formatting words
      
      const hasAcademicWords = /\b(is|are|was|been|concept|define|explain|understand|theory|principle|law|method|process|function|occurs|result|affect|importance|significance|role|key|important|essential|therefore|because|cause|effect|example)\b/i.test(s);
      const notHeader = !/^(chapter|section|unit|part|lesson|page|header|title|figure|table|note|learning|objective)/i.test(s);
      
      return length > 35 && length < 250 && !isGarbage && (hasAcademicWords || length > 100) && notHeader;
    })
    .slice(0, 25);

  // Extract key academic terms (capitalized words, multi-word terms)
  const words = cleanText.toLowerCase().split(/\s+/);
  const commonWords = new Set([
    'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'have', 'has', 'had',
    'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may', 'might', 'must',
    'can', 'and', 'or', 'of', 'in', 'at', 'to', 'for', 'by', 'with', 'on', 'as',
    'from', 'it', 'that', 'this', 'which', 'who', 'what', 'where', 'when', 'why',
    'how', 'but', 'such', 'their', 'there', 'these', 'than', 'then', 'no', 'if'
  ]);

  // Get key academic terms (proper nouns, technical terms)
  const keyTerms = [...new Set(
    text.split(/\s+/)
      .filter(w => {
        const lower = w.toLowerCase();
        return w.length > 4 
          && !commonWords.has(lower) 
          && (w[0] === w[0].toUpperCase() || /[A-Z]/.test(w))
          && !/[^\w-]/.test(w); // No special characters
      })
      .slice(0, 25)
  )];

  const questions = [];

  // Generate questions from academic sentences
  academicSentences.forEach((sentence, idx) => {
    if (questions.length >= 8) return;

    const cleanSentence = sentence.replace(/[.!?]/g, '').trim();
    
    if (cleanSentence.length > 35 && cleanSentence.length < 230) {
      // Question type 1: Comprehension question (80+ chars)
      if (idx % 2 === 0) {
        questions.push({
          question: `Based on the material: ${cleanSentence.substring(0, 140)}...?`,
          options: [
            'The statement above is correct',
            'The statement is a common misconception',
            'The statement is only partially accurate',
            'The material does not address this'
          ],
          correctAnswer: 0,
          difficulty: idx % 3 === 0 ? 'easy' : idx % 3 === 1 ? 'medium' : 'hard'
        });
      }
      
      // Question type 2: Multiple choice definition
      if (questions.length < 8 && idx % 3 !== 0 && cleanSentence.length > 50) {
        const conceptMatch = cleanSentence.match(/(?:is|are|means|involves|refers|includes|implies)\s+([^,.]+)/i);
        const concept = conceptMatch ? conceptMatch[1].trim().substring(0, 80) : cleanSentence.substring(0, 80);
        
        questions.push({
          question: `What does the material suggest about: ${cleanSentence.substring(0, 100)}?`,
          options: [
            concept,
            'An unrelated concept from another field',
            'A theory that has been disproven',
            'Information not included in the material'
          ],
          correctAnswer: 0,
          difficulty: idx % 3 === 0 ? 'easy' : idx % 3 === 1 ? 'medium' : 'hard'
        });
      }
    }
  });

  // Fill remaining slots with additional comprehension questions
  while (questions.length < 8 && academicSentences.length > 0) {
    const randomIdx = Math.floor(Math.random() * (academicSentences.length - questions.length));
    const sentence = academicSentences[randomIdx];
    const cleanSentence = sentence.replace(/[.!?]/g, '').trim();
    
    if (cleanSentence.length > 40 && cleanSentence.length < 250) {
      questions.push({
        question: `According to the material: "${cleanSentence.substring(0, 130)}..."`,
        options: [
          'This is accurate',
          'This is incorrect',
          'This is only partially true',
          'The material does not mention this'
        ],
        correctAnswer: 0,
        difficulty: questions.length % 3 === 0 ? 'easy' : questions.length % 3 === 1 ? 'medium' : 'hard'
      });
    }
  }

  return questions.slice(0, 8);
};

const normalizeChallengeDifficulty = (value, fallback = 'medium') => {
  const normalized = String(value || fallback).trim().toLowerCase();
  if (normalized === 'easy' || normalized === 'medium' || normalized === 'hard') {
    return normalized;
  }
  return fallback;
};

const normalizeChallengeWord = (value) =>
  String(value || '')
    .replace(/[^a-zA-Z0-9\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const normalizeWordSourceMode = (value = 'study') => {
  const normalized = String(value || 'study').trim().toLowerCase();
  return WORD_SOURCE_MODES.has(normalized) ? normalized : 'study';
};

const WORD_CHALLENGE_SESSION_MIN = 5;
const WORD_CHALLENGE_SESSION_TARGET = 8;

const getStaticWordChallengeCatalog = (mode) => {
  if (mode === 'general') return GENERAL_WORD_CHALLENGE_ITEMS;
  if (mode === 'exam') return EXAM_WORD_CHALLENGE_ITEMS;
  if (mode === 'fun') return FUN_WORD_CHALLENGE_ITEMS;
  return [];
};

const buildCatalogWordChallengeItems = (mode, difficulty = '') => {
  const normalizedDifficulty = difficulty ? normalizeChallengeDifficulty(difficulty, '') : '';

  return getStaticWordChallengeCatalog(mode)
    .filter((item) => !normalizedDifficulty || item.difficulty === normalizedDifficulty)
    .map((item, index) => ({
      id: `${mode}-${normalizeForCompare(item.word)}-${index}`,
      moduleId: null,
      moduleTitle:
        mode === 'general'
          ? 'General Mode'
          : mode === 'exam'
            ? 'Exam Mode'
            : 'Fun Mode',
      word: item.word,
      clue: item.hint,
      hint: item.hint,
      scenario: buildWordChallengeScenario(item.word, item.hint, 'en'),
      difficulty: item.difficulty,
      topic: item.category,
      category: item.category,
      source: item.source,
      sourceReference: item.source,
      wordSourceMode: mode,
    }));
};

const shuffleItems = (items = []) =>
  [...items].sort(() => Math.random() - 0.5);

const buildWordChallengeItemId = (prefix, word, index) =>
  `${prefix}-${normalizeForCompare(word)}-${index}`;

const dedupeWordChallengeSessionItems = (items = [], excludeWords = []) => {
  const excluded = new Set(
    excludeWords
      .map((word) => normalizeForCompare(word))
      .filter(Boolean),
  );
  const seen = new Set();

  return items.filter((item) => {
    const wordKey = normalizeForCompare(item?.word);
    if (!wordKey || excluded.has(wordKey) || seen.has(wordKey)) return false;
    seen.add(wordKey);
    return true;
  });
};

const normalizeWordChallengeCategory = (value, fallback = 'General Vocabulary') => {
  const cleaned = cleanSentenceText(value || fallback);
  return cleaned || fallback;
};

const toSessionWordChallengeItem = (item, index, context = {}) => {
  const word = normalizeChallengeWord(item?.word || item?.topic);
  const difficulty = normalizeChallengeDifficulty(item?.difficulty, context.difficulty || 'medium');
  const category = normalizeWordChallengeCategory(
    item?.category || item?.topic || context.category || 'General Vocabulary',
    context.category || 'General Vocabulary',
  );
  const hint = shortenAtWordBoundary(
    toCompleteSentence(
      cleanSentenceText(
        item?.hint || item?.clue || buildWordChallengeClue(word, item?.detail || category, difficulty, context.language || 'en'),
      ),
    ),
    170,
  );

  return {
    id: buildWordChallengeItemId(context.idPrefix || context.mode || 'session', word, index),
    moduleId: context.moduleId ?? null,
    moduleTitle: context.moduleTitle || null,
    word,
    clue: hint,
    hint,
    scenario: shortenAtWordBoundary(
      toCompleteSentence(
        cleanSentenceText(
          item?.scenario || buildWordChallengeScenario(word, item?.detail || hint, context.language || 'en'),
        ),
      ),
      190,
    ),
    difficulty,
    topic: category,
    category,
    source: context.source || item?.source || item?.sourceReference || context.moduleTitle || 'AI Session',
    sourceReference: item?.sourceReference || context.moduleTitle || context.source || 'AI Session',
    wordSourceMode: context.mode || 'general',
  };
};

const buildSessionFallbackItems = ({
  mode = 'general',
  difficulty = '',
  limit = WORD_CHALLENGE_SESSION_TARGET,
  excludeWords = [],
  moduleId = null,
  moduleTitle = null,
} = {}) => {
  const fallbackMode = mode === 'study' ? 'general' : mode;
  const catalogItems = shuffleItems(buildCatalogWordChallengeItems(fallbackMode, difficulty));
  const deduped = dedupeWordChallengeSessionItems(catalogItems, excludeWords).slice(0, limit);

  return deduped.map((item, index) => ({
    ...item,
    id: buildWordChallengeItemId(`${mode}-fallback`, item.word, index),
    moduleId,
    moduleTitle,
    source: mode === 'study' ? 'Study Mode Fallback' : item.source,
    sourceReference: mode === 'study' ? (moduleTitle || 'Study Mode Fallback') : item.sourceReference,
    wordSourceMode: mode,
  }));
};

const buildEmergencySessionFallbackItems = ({ excludeWords = [], limit = WORD_CHALLENGE_SESSION_TARGET } = {}) => {
  const emergencyPool = shuffleItems([
    ...buildCatalogWordChallengeItems('general'),
    ...buildCatalogWordChallengeItems('exam'),
    ...buildCatalogWordChallengeItems('fun'),
  ]);

  return dedupeWordChallengeSessionItems(emergencyPool, excludeWords)
    .slice(0, limit)
    .map((item, index) => ({
      ...item,
      id: buildWordChallengeItemId('emergency-fallback', item.word, index),
      wordSourceMode: item.wordSourceMode || 'general',
      source: item.source || 'Fallback Session',
      sourceReference: item.sourceReference || 'Fallback Session',
    }));
};

const buildStudySessionItems = (modules = [], difficulty = '', excludeWords = [], limit = WORD_CHALLENGE_SESSION_TARGET) => {
  const moduleItems = modules.flatMap((module) => {
    const language = detectContentLanguage(module.originalText, module.title);
    const sourceItems = Array.isArray(module.wordChallenges) && module.wordChallenges.length > 0
      ? module.wordChallenges
      : buildLocalWordChallenges(
          module.originalText,
          module.keyConcepts || [],
          module.flashcards || [],
          module.quizQuestions || [],
          module.title,
          language,
        );

    return sourceItems
      .filter((item) => !difficulty || item.difficulty === difficulty)
      .map((item, index) =>
        toSessionWordChallengeItem(item, index, {
          mode: 'study',
          moduleId: String(module._id),
          moduleTitle: module.title,
          source: module.title,
          idPrefix: `study-${module._id}`,
          language,
        }),
      );
  });

  return dedupeWordChallengeSessionItems(shuffleItems(moduleItems), excludeWords).slice(0, limit);
};

const collectModuleWordExclusions = (modules = []) =>
  dedupeWordChallengeSessionItems(
    modules.flatMap((module) =>
      (Array.isArray(module.wordChallenges) ? module.wordChallenges : []).map((item) => ({
        word: item?.word,
      }))
    )
  ).map((item) => item.word);

const generateSessionWordsWithAI = async ({
  mode = 'general',
  difficulty = '',
  excludeWords = [],
  modules = [],
  requestedModuleId = '',
  limit = WORD_CHALLENGE_SESSION_TARGET,
} = {}) => {
  if (!openai) return [];

  const moduleContext = modules
    .map((module) => {
      const language = detectContentLanguage(module.originalText, module.title);
      const concepts = (module.keyConcepts || []).slice(0, 6).join(', ');
      const sourceText = stripPdfNoise(module.originalText).slice(0, 1200);
      return [
        `Module title: ${module.title}`,
        `Detected language: ${language}`,
        `Key concepts: ${concepts || 'None provided'}`,
        `Source excerpt: ${sourceText || 'No source text available.'}`,
      ].join('\n');
    })
    .join('\n\n');

  const modeInstructions =
    mode === 'study'
      ? modules.length > 0
        ? 'Use only the uploaded modules as the source for terms. Do not invent unrelated general vocabulary.'
        : 'No modules are available. Return no items.'
      : mode === 'exam'
        ? 'Generate academic or exam-oriented vocabulary. Make the hints sound scenario-based when appropriate.'
        : mode === 'fun'
          ? 'Generate playful, engaging words from animals, objects, internet culture, nature, or technology.'
          : 'Generate common vocabulary words that are useful in everyday reading and conversation.';

  const prompt = [
    'Return JSON only with one top-level key: "items".',
    `Generate ${Math.max(limit, WORD_CHALLENGE_SESSION_MIN)} unique word challenge items.`,
    'Each item must include exactly these keys: word, hint, difficulty, category.',
    'Rules:',
    '- Never return an empty array.',
    '- Avoid repeating or closely similar words.',
    '- difficulty must be Easy, Medium, or Hard.',
    '- hint should be concise and helpful.',
    '- category should be short and learner-friendly.',
    mode === 'study' ? '- Every word must come from the uploaded modules.' : '',
    modeInstructions,
    difficulty ? `Focus on difficulty: ${difficulty}.` : 'Mix Easy, Medium, and Hard difficulties.',
    excludeWords.length > 0 ? `Do not use these words: ${excludeWords.join(', ')}` : 'No excluded words were provided.',
    moduleContext ? `Module context:\n${moduleContext}` : '',
  ]
    .filter(Boolean)
    .join('\n');

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [{ role: 'user', content: prompt }],
    });

    const content = response.choices?.[0]?.message?.content || '';
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return [];

    const parsed = JSON.parse(jsonMatch[0]);
    const items = Array.isArray(parsed?.items) ? parsed.items : [];
    return dedupeWordChallengeSessionItems(
      items.map((item, index) =>
        toSessionWordChallengeItem(item, index, {
          mode,
          moduleId: modules.length === 1 ? String(modules[0]._id) : (mode === 'study' ? requestedModuleId || null : null),
          moduleTitle: modules.length === 1 ? modules[0].title : null,
          source: mode === 'study' ? 'AI Study Session' : 'AI Session',
          category:
            mode === 'exam'
              ? 'Academic Term'
              : mode === 'fun'
                ? 'Fun Pick'
                : 'General Vocabulary',
          language:
            modules.length === 1
              ? detectContentLanguage(modules[0].originalText, modules[0].title)
              : 'en',
          idPrefix: `${mode}-ai`,
          difficulty,
        }),
      ),
      excludeWords,
    ).slice(0, limit);
  } catch (error) {
    console.error('Session word generation failed:', error.message);
    return [];
  }
};

const splitConceptEntry = (concept) => {
  const raw = cleanSentenceText(concept || '');
  const parts = raw.split(/:\s+(.+)/);
  return {
    topic: cleanSentenceText(parts[0] || ''),
    detail: cleanSentenceText(parts[1] || parts[0] || ''),
  };
};

const buildWordChallengeClue = (word, detail, difficulty = 'medium', language = 'en') => {
  const concept = String(word || '').trim();
  const explanation = shortenAtWordBoundary(toCompleteSentence(cleanSentenceText(detail || concept)), 150);

  if (isTagalog(language)) {
    if (difficulty === 'easy') {
      return explanation || `Tumutukoy ito sa konseptong ${concept.toLowerCase()}.`;
    }

    if (difficulty === 'hard') {
      return `Sa isang sitwasyong pang-akademiko, aling keyword ang tumutukoy sa ideyang ito: ${explanation || concept}?`;
    }

    return `Aling terminong pang-aralin ang inilalarawan ng pahiwatig na ito: ${explanation || concept}?`;
  }

  if (difficulty === 'easy') {
    return explanation || `This term refers to ${concept.toLowerCase()}.`;
  }

  if (difficulty === 'hard') {
    return `In a short exam-style situation, which keyword matches this idea: ${explanation || concept}?`;
  }

  return `Which study term matches this reworded clue: ${explanation || concept}?`;
};

const buildWordChallengeScenario = (word, detail, language = 'en') => {
  const concept = String(word || '').trim();
  const explanation = shortenAtWordBoundary(toCompleteSentence(cleanSentenceText(detail || concept)), 160);

  if (isTagalog(language)) {
    return `Isang mag-aaral ang kailangang tukuyin ang terminong pinakaangkop sa prinsipyong ito: ${explanation || concept}. Ano ang keyword?`;
  }

  return `A student is reviewing a short scenario built around this idea: ${explanation || concept}. Which keyword best fits?`;
};

const finalizeWordChallenges = (items = [], moduleTitle = '', limit = 18, language = 'en') => {
  const seen = new Set();
  const finalized = [];

  items.forEach((item) => {
    const word = normalizeChallengeWord(item?.word || item?.topic);
    const wordKey = normalizeForCompare(word);
    if (!word || word.length < 3 || word.length > 40 || seen.has(wordKey)) return;
    if (!/[a-z]/i.test(word)) return;

    seen.add(wordKey);

    const difficulty = normalizeChallengeDifficulty(item?.difficulty);
    const topic = cleanSentenceText(item?.topic || word);
    const clue = shortenAtWordBoundary(
      toCompleteSentence(
        cleanSentenceText(
          item?.clue || buildWordChallengeClue(word, item?.detail || topic, difficulty, language),
        ),
      ),
      170,
    );
    const scenario = shortenAtWordBoundary(
      toCompleteSentence(
        cleanSentenceText(
          item?.scenario || buildWordChallengeScenario(word, item?.detail || topic, language),
        ),
      ),
      190,
    );

    finalized.push({
      word,
      clue,
      scenario,
      difficulty,
      topic: topic || word,
      sourceReference: cleanSentenceText(item?.sourceReference || moduleTitle || 'Uploaded module'),
    });
  });

  return finalized.slice(0, limit);
};

const buildLocalWordChallenges = (
  text,
  keyConcepts = [],
  flashcards = [],
  quizQuestions = [],
  moduleTitle = '',
  language = 'en',
) => {
  const conceptItems = keyConcepts
    .map((concept, index) => {
      const parsed = splitConceptEntry(concept);
      const detailSource =
        parsed.detail
        || flashcards[index]?.back
        || quizQuestions[index]?.correctExplanation
        || flashcards[index]?.front
        || parsed.topic;
      const difficulty = index % 3 === 0 ? 'easy' : index % 3 === 1 ? 'medium' : 'hard';

      return {
        word: parsed.topic,
        topic: parsed.topic,
        detail: detailSource,
        clue: buildWordChallengeClue(parsed.topic, detailSource, difficulty, language),
        scenario:
          difficulty === 'hard'
            ? buildWordChallengeScenario(parsed.topic, detailSource, language)
            : buildWordChallengeScenario(parsed.topic, detailSource, language),
        difficulty,
        sourceReference: moduleTitle || 'Uploaded module',
      };
    })
    .filter((item) => item.word);

  const sentenceItems = sentenceParts(text)
    .slice(0, 9)
    .map((sentence, index) => {
      const topic = conceptTitleFromLine(sentence);
      const difficulty = index % 3 === 0 ? 'easy' : index % 3 === 1 ? 'medium' : 'hard';
      return {
        word: topic,
        topic: topic || `Concept ${index + 1}`,
        detail: sentence,
        clue: buildWordChallengeClue(topic, sentence, difficulty, language),
        scenario: buildWordChallengeScenario(topic, sentence, language),
        difficulty,
        sourceReference: moduleTitle || 'Uploaded module',
      };
    })
    .filter((item) => item.word);

  const fallbackTopic = normalizeChallengeWord(moduleTitle);
  const fallbackItems = fallbackTopic
    ? [
        {
          word: fallbackTopic,
          topic: fallbackTopic,
          detail: summarizeLocally(text),
          clue: buildWordChallengeClue(fallbackTopic, summarizeLocally(text), 'easy', language),
          scenario: buildWordChallengeScenario(fallbackTopic, summarizeLocally(text), language),
          difficulty: 'easy',
          sourceReference: moduleTitle,
        },
      ]
    : [];

  return finalizeWordChallenges(
    [...conceptItems, ...sentenceItems, ...fallbackItems],
    moduleTitle,
    18,
    language,
  );
};

const generateWordChallengesWithAI = async (
  text,
  keyConcepts = [],
  flashcards = [],
  quizQuestions = [],
  generationOptions = {},
) => {
  const moduleTitle = generationOptions.title || 'Uploaded module';
  const language = generationOptions.language || detectContentLanguage(text, moduleTitle);
  const localFallback = buildLocalWordChallenges(
    text,
    keyConcepts,
    flashcards,
    quizQuestions,
    moduleTitle,
    language,
  );

  if (!openai) {
    return localFallback;
  }

  const conceptContext = keyConcepts
    .map((concept) => {
      const parsed = splitConceptEntry(concept);
      return `${parsed.topic}: ${parsed.detail}`;
    })
    .filter(Boolean)
    .slice(0, 12)
    .join('\n');

  const prompt = [
    'Create a JSON object with one key: "items".',
    'Each item must be a study game entry based only on the provided module content.',
    'Each item must include: word, clue, scenario, difficulty, topic, sourceReference.',
    'Rules:',
    '- word must be a real keyword, term, or concept from the module, not a random dictionary word.',
    '- Use 1 to 4 words for word whenever possible.',
    '- clue must help the learner guess the term from a definition or hint.',
    '- scenario must read like a short exam-style situation that still points to the same term.',
    '- Balance difficulties across easy, medium, and hard.',
    '- Avoid repeating words or near-duplicates.',
    '- sourceReference should be a short reference like the module title or topic label.',
    '- Return JSON only.',
    `Module title: ${moduleTitle}`,
    'Key concepts:',
    conceptContext || 'None provided',
    'Source text:',
    text.slice(0, 4000),
  ].join('\n');

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [{ role: 'user', content: prompt }],
    });

    const content = response.choices?.[0]?.message?.content || '';
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return localFallback;
    }

    const parsed = JSON.parse(jsonMatch[0]);
    const finalized = finalizeWordChallenges(parsed.items || [], moduleTitle, 18, language);
    return finalized.length > 0 ? finalized : localFallback;
  } catch (error) {
    console.error('Word challenge generation failed:', error.message);
    return localFallback;
  }
};

const processWithAI = async (text, generationOptions = {}) => {
  const profile = normalizeGenerationOptions(generationOptions);
  const cleaned = stripPdfNoise(text);
  const language = detectContentLanguage(cleaned, generationOptions.title);
  const generationContext = { ...profile, language, title: generationOptions.title };

  if (!openai) {
    console.warn('OpenAI API key not configured - generating quiz using local method');
    const quizQuestions = profile.format === 'Flashcards' ? [] : generateMultipleChoiceQuestions(cleaned, generationContext);
    const summary = summarizeLocally(cleaned);
    const conceptDetails = buildConceptDetails(cleaned, extractCandidateConcepts(cleaned), language);
    const flashcards = profile.format === 'Quiz'
      ? []
      : finalizeFlashcards(buildStudyFlashcards(cleaned, conceptDetails, generationContext), 12);
    const wordChallenges = buildLocalWordChallenges(
      cleaned,
      conceptDetails,
      flashcards,
      quizQuestions,
      generationOptions.title,
      language,
    );

    return {
      summary,
      keyConcepts: conceptDetails,
      flashcards,
      quizQuestions,
      wordChallenges,
      aiAvailable: false
    };
  }

  try {
    console.log('Starting AI processing for text...');

    const summaryResponse = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [{ role: 'user', content: `${SUMMARY_PROMPT}\n\n${cleaned.slice(0, 4000)}` }]
    });
    const summary = summaryResponse.choices[0].message.content;
    console.log('Summary generated');

    const quizResponse = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [{ role: 'user', content: `${buildQuizPrompt(generationContext)}\n\n${cleaned.slice(0, 4000)}` }]
    });

    let quizData;
    try {
      const content = quizResponse.choices[0].message.content;
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        console.error('Could not find JSON in quiz response');
        quizData = { questions: [] };
      } else {
        quizData = JSON.parse(jsonMatch[0]);
        console.log(`Quiz generated with ${quizData.questions?.length || 0} questions`);

        quizData.questions = finalizeMcqs(
          (quizData.questions || [])
          .filter((q) => isQualityMcq(q.question, q.options, cleaned, profile.mode))
          .map((q, idx) => ({
            ...q,
            difficulty: mapDifficultyLabel(profile.difficulty, idx, quizData.questions.length || 1),
            type: 'mcq'
          })),
          cleaned,
          profile.mode,
          24,
        );
      }
    } catch (parseErr) {
      console.error('Error parsing quiz JSON:', parseErr.message);
      quizData = { questions: [] };
    }

    const keyConcepts = summary
      .split(/\n|•/)
      .filter(line => line.trim())
      .slice(0, 5)
      .map(line => line.replace(/^[\d\.\-\s]+/, '').trim())
      .map(line => conceptTitleFromLine(line) || cleanSentenceText(line))
      .filter(Boolean);

    const conceptDetails = buildConceptDetails(
      cleaned,
      keyConcepts.length > 0 ? keyConcepts : extractCandidateConcepts(cleaned),
      language
    );
    const flashcards = profile.format === 'Quiz'
      ? []
      : finalizeFlashcards(buildStudyFlashcards(cleaned, conceptDetails, generationContext), 12);
    const wordChallenges = await generateWordChallengesWithAI(
      cleaned,
      conceptDetails,
      flashcards,
      quizData.questions || [],
      generationContext,
    );

    return {
      summary,
      keyConcepts: conceptDetails,
      flashcards,
      quizQuestions: quizData.questions || [],
      wordChallenges,
      aiAvailable: true
    };
  } catch (err) {
    console.error('AI Processing Error:', err.message);
    console.log('Falling back to local quiz generation...');
    const quizQuestions = profile.format === 'Flashcards' ? [] : generateMultipleChoiceQuestions(cleaned, generationContext);
    const summary = summarizeLocally(cleaned);
    const conceptDetails = buildConceptDetails(cleaned, extractCandidateConcepts(cleaned), language);
    const flashcards = profile.format === 'Quiz'
      ? []
      : finalizeFlashcards(buildStudyFlashcards(cleaned, conceptDetails, generationContext), 12);
    const wordChallenges = buildLocalWordChallenges(
      cleaned,
      conceptDetails,
      flashcards,
      quizQuestions,
      generationOptions.title,
      language,
    );

    return {
      summary,
      keyConcepts: conceptDetails,
      flashcards,
      quizQuestions,
      wordChallenges,
      aiAvailable: false,
      error: formatOpenAIError(err)
    };
  }
};

const syncModuleFlashcardsToCollection = async (moduleDoc) => {
  if (!moduleDoc?._id || !moduleDoc.userId) return;

  await Flashcard.deleteMany({ moduleId: moduleDoc._id, userId: moduleDoc.userId });

  const cards = Array.isArray(moduleDoc.flashcards) ? moduleDoc.flashcards : [];
  if (cards.length === 0) return;

  await Flashcard.insertMany(
    cards.map((card) => ({
      userId: moduleDoc.userId,
      moduleId: moduleDoc._id,
      front: card.front,
      back: card.back,
      difficulty: card.difficulty || 'medium',
    }))
  );
};

router.post('/upload', auth, upload.single('file'), async (req, res) => {
  try {
    const { title, mode, difficulty, format } = req.body;
    let text = '';
    let pdfData = '';
    let fileType = '';
    let fileSize = 0;
    let pageCount = 0;

    if (req.file) {
      const isPdfUpload = req.file.mimetype === 'application/pdf' || /\.pdf$/i.test(req.file.originalname || '');
      fileType = isPdfUpload ? 'application/pdf' : req.file.mimetype;
      fileSize = req.file.size;

      if (isPdfUpload) {
        const parsedPdf = await pdfParse(req.file.buffer);
        text = parsedPdf.text;
        pageCount = parsedPdf.numpages || 0;
        pdfData = req.file.buffer.toString('base64');
      } else {
        text = req.file.buffer.toString('utf-8');
      }
    } else if (req.body.text) {
      text = req.body.text;
    }

    if (!text.trim()) {
      return res.status(400).json({ message: 'No content provided' });
    }

    // Clean PDF noise early so everything downstream uses the important content.
    const cleanedText = stripPdfNoise(text);
    const aiResult = await processWithAI(cleanedText, { title, mode, difficulty, format });
    const extractionWarning = detectExtractionWarning(cleanedText, pageCount);

    const module = new Module({
      userId: req.user.id,
      title: title || 'Untitled Module',
      originalText: cleanedText,
      pdfData,
      fileType,
      fileSize,
      pageCount,
      extractionWarning,
      summary: aiResult.summary,
      keyConcepts: aiResult.keyConcepts,
      flashcards: aiResult.flashcards,
      wordChallenges: aiResult.wordChallenges,
      quizQuestions: aiResult.quizQuestions,
      fileName: req.file?.originalname
    });

    await module.save();
    
    // Return response with indication of whether AI was available
    const response = module.toObject();
    if (!aiResult.aiAvailable && !process.env.OPENAI_API_KEY?.trim()) {
      response.warning = 'OpenAI API not configured. Summary and quiz questions were generated locally. Add OPENAI_API_KEY to .env to enable AI features.';
    } else if (!aiResult.aiAvailable && aiResult.error) {
      response.warning = aiResult.error;
    }
    if (aiResult.quizQuestions.length === 0 && aiResult.aiAvailable) {
      response.warning = 'Could not generate quiz questions. The module was saved, but quiz generation failed.';
    }
    
    res.status(201).json(response);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.get('/', auth, async (req, res) => {
  try {
    const modules = await Module.find({ userId: req.user.id })
      .select('-pdfData')
      .sort({ createdAt: -1 });
    res.json(modules);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.get('/word-challenge', auth, async (req, res) => {
  try {
    const { moduleId, difficulty } = req.query;
    const wordSourceMode = normalizeWordSourceMode(req.query.mode);

    if (wordSourceMode !== 'study') {
      const modules = await Module.find({ userId: req.user.id })
        .select('wordChallenges');
      const excludedModuleWords = collectModuleWordExclusions(modules);

      return res.json({
        selectedMode: wordSourceMode,
        modules: [],
        excludedModuleWords,
        items: dedupeWordChallengeSessionItems(
          buildCatalogWordChallengeItems(wordSourceMode, difficulty),
          excludedModuleWords,
        ),
      });
    }

    const query = { userId: req.user.id };
    if (moduleId && isValidModuleId(moduleId)) {
      query._id = moduleId;
    }

    const modules = await Module.find(query)
      .select('title originalText keyConcepts flashcards quizQuestions wordChallenges')
      .sort({ createdAt: -1 });

    const hydratedModules = [];

    for (const module of modules) {
      let wordChallenges = Array.isArray(module.wordChallenges) ? module.wordChallenges : [];

      if (wordChallenges.length === 0 && module.originalText?.trim()) {
        wordChallenges = buildLocalWordChallenges(
          module.originalText,
          module.keyConcepts || [],
          module.flashcards || [],
          module.quizQuestions || [],
          module.title,
          detectContentLanguage(module.originalText, module.title),
        );

        if (wordChallenges.length > 0) {
          module.wordChallenges = wordChallenges;
          await module.save();
        }
      }

      hydratedModules.push({
        moduleId: module._id,
        title: module.title,
        wordChallenges,
      });
    }

    const normalizedDifficulty = difficulty ? normalizeChallengeDifficulty(difficulty, '') : '';
    const items = hydratedModules.flatMap((module) =>
      (module.wordChallenges || [])
        .filter((item) => !normalizedDifficulty || item.difficulty === normalizedDifficulty)
        .map((item, index) => ({
          id: `${module.moduleId}-${normalizeForCompare(item.word)}-${index}`,
          moduleId: module.moduleId,
          moduleTitle: module.title,
          word: item.word,
          clue: item.clue,
          hint: item.clue,
          scenario: item.scenario,
          difficulty: item.difficulty,
          topic: item.topic,
          category: item.topic || 'Module concept',
          source: item.sourceReference || module.title,
          sourceReference: item.sourceReference || module.title,
          wordSourceMode,
        }))
    );

    res.json({
      selectedMode: wordSourceMode,
      modules: hydratedModules.map((module) => ({
        moduleId: module.moduleId,
        title: module.title,
        challengeCount: module.wordChallenges.length,
      })),
      excludedModuleWords: [],
      items,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.post('/word-challenge/generate-session', auth, async (req, res) => {
  try {
    const wordSourceMode = normalizeWordSourceMode(req.body?.mode);
    const difficulty = req.body?.difficulty ? normalizeChallengeDifficulty(req.body.difficulty, '') : '';
    const requestedModuleId =
      req.body?.moduleId && req.body.moduleId !== 'all' ? String(req.body.moduleId) : '';
    const excludeWords = Array.isArray(req.body?.excludeWords)
      ? req.body.excludeWords.map((word) => String(word || '')).filter(Boolean)
      : [];

    const moduleQuery = { userId: req.user.id };
    if (requestedModuleId && isValidModuleId(requestedModuleId)) {
      moduleQuery._id = requestedModuleId;
    }

    const modules = await Module.find(
      wordSourceMode === 'study' ? moduleQuery : { userId: req.user.id }
    )
      .select('title originalText keyConcepts flashcards quizQuestions wordChallenges')
      .sort({ createdAt: -1 });
    const excludedModuleWords = collectModuleWordExclusions(modules);

    let items = [];

    if (wordSourceMode === 'study') {
      items = buildStudySessionItems(modules, difficulty, excludeWords, WORD_CHALLENGE_SESSION_TARGET);

      if (modules.length > 0 && items.length < WORD_CHALLENGE_SESSION_MIN) {
        const aiItems = await generateSessionWordsWithAI({
          mode: 'study',
          difficulty,
          excludeWords: [...excludeWords, ...items.map((item) => item.word)],
          modules,
          requestedModuleId,
          limit: WORD_CHALLENGE_SESSION_TARGET - items.length,
        });
        items = dedupeWordChallengeSessionItems([...items, ...aiItems], excludeWords);
      }
    } else {
      items = await generateSessionWordsWithAI({
        mode: wordSourceMode,
        difficulty,
        excludeWords: [...excludeWords, ...excludedModuleWords],
        requestedModuleId,
        limit: WORD_CHALLENGE_SESSION_TARGET,
      });

      if (items.length < WORD_CHALLENGE_SESSION_MIN) {
        const fallbackItems = buildSessionFallbackItems({
          mode: wordSourceMode,
          difficulty,
          excludeWords: [...excludeWords, ...excludedModuleWords, ...items.map((item) => item.word)],
          limit: WORD_CHALLENGE_SESSION_TARGET - items.length,
        });
        items = dedupeWordChallengeSessionItems([...items, ...fallbackItems], excludeWords);
      }
    }

    if (wordSourceMode !== 'study' && items.length < WORD_CHALLENGE_SESSION_MIN) {
      const emergencyItems = buildEmergencySessionFallbackItems({
        excludeWords: [...excludeWords, ...excludedModuleWords, ...items.map((item) => item.word)],
        limit: WORD_CHALLENGE_SESSION_TARGET - items.length,
      });
      items = dedupeWordChallengeSessionItems([...items, ...emergencyItems], excludeWords);
    }

    const finalItems = shuffleItems(items).slice(0, WORD_CHALLENGE_SESSION_TARGET);

    if (wordSourceMode === 'study' && finalItems.length === 0) {
      return res.status(400).json({
        selectedMode: wordSourceMode,
        generated: false,
        message: 'Study Mode could not find enough words in your uploaded modules.',
        items: [],
        modules: modules.map((module) => ({
          moduleId: module._id,
          title: module.title,
        })),
      });
    }

    return res.json({
      selectedMode: wordSourceMode,
      generated: true,
      items: finalItems,
      modules:
        wordSourceMode === 'study'
          ? modules.map((module) => ({
              moduleId: module._id,
              title: module.title,
            }))
          : [],
    });
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
});

router.post('/regenerate-all', auth, async (req, res) => {
  try {
    const modules = await Module.find({ userId: req.user.id }).sort({ createdAt: -1 });

    if (modules.length === 0) {
      return res.json({
        message: 'No modules found to regenerate.',
        regeneratedCount: 0,
        modules: [],
      });
    }

    const results = [];

    for (const module of modules) {
      if (!module.originalText?.trim()) {
        results.push({
          moduleId: module._id,
          title: module.title,
          regenerated: false,
          reason: 'No original content to regenerate from',
        });
        continue;
      }

      const aiResult = await processWithAI(module.originalText, { ...req.body, title: module.title });

      module.summary = aiResult.summary;
      module.keyConcepts = aiResult.keyConcepts;
      module.flashcards = aiResult.flashcards;
      module.wordChallenges = aiResult.wordChallenges;
      module.quizQuestions = aiResult.quizQuestions;
      module.usedQuestionIndices = [];

      await module.save();
      await Flashcard.deleteMany({ moduleId: module._id, userId: req.user.id });
      await syncModuleFlashcardsToCollection(module);

      results.push({
        moduleId: module._id,
        title: module.title,
        regenerated: true,
        quizQuestions: aiResult.quizQuestions.length,
        flashcards: aiResult.flashcards.length,
      });
    }

    const regeneratedCount = results.filter((item) => item.regenerated).length;

    res.json({
      message: `Regenerated ${regeneratedCount} module${regeneratedCount === 1 ? '' : 's'}.`,
      regeneratedCount,
      modules: results,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.get('/:id', auth, async (req, res) => {
  try {
    if (!isValidModuleId(req.params.id)) {
      return res.status(400).json({ message: 'Invalid module id' });
    }

    const module = await Module.findOne({ _id: req.params.id, userId: req.user.id });
    if (!module) {
      return res.status(404).json({ message: 'Module not found' });
    }
    res.json(module);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.get('/:id/file', auth, async (req, res) => {
  try {
    if (!isValidModuleId(req.params.id)) {
      return res.status(400).json({ message: 'Invalid module id' });
    }

    const module = await Module.findOne({ _id: req.params.id, userId: req.user.id }).select('title fileName fileType pdfData');
    if (!module) {
      return res.status(404).json({ message: 'Module not found' });
    }

    if (module.fileType !== 'application/pdf' || !module.pdfData) {
      return res.status(404).json({ message: 'PDF file not available for this module' });
    }

    const fileBuffer = Buffer.from(module.pdfData, 'base64');
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Length', fileBuffer.length);
    res.setHeader('Content-Disposition', `inline; filename="${module.fileName || `${module.title}.pdf`}"`);
    res.send(fileBuffer);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.post('/:id/quiz', auth, async (req, res) => {
  try {
    if (!isValidModuleId(req.params.id)) {
      return res.status(400).json({ message: 'Invalid module id' });
    }

    const module = await Module.findOne({ _id: req.params.id, userId: req.user.id });
    if (!module) {
      return res.status(404).json({ message: 'Module not found' });
    }

    const { answers, difficulty } = req.body;
    
    // Filter questions by selected difficulty
    const allQuestions = module.quizQuestions || [];
    const filteredQuestions = difficulty 
      ? allQuestions.filter(q => q.difficulty === difficulty)
      : allQuestions;

    if (filteredQuestions.length === 0) {
      return res.status(400).json({ message: 'No questions available for selected difficulty' });
    }

    // Calculate score based on filtered questions
    const results = answers.map((answer, index) => ({
      questionIndex: index,
      selectedAnswer: answer,
      correct: filteredQuestions[index]?.correctAnswer === answer,
      difficulty: difficulty
    }));

    const score = results.filter(r => r.correct).length;
    const totalQuestions = filteredQuestions.length;

    // Mark used questions
    const usedIndices = module.usedQuestionIndices || [];
    filteredQuestions.forEach((q, idx) => {
      const fullIndex = allQuestions.indexOf(q);
      if (fullIndex !== -1 && !usedIndices.includes(fullIndex)) {
        usedIndices.push(fullIndex);
      }
    });
    module.usedQuestionIndices = usedIndices;
    await module.save();

    const attempt = new QuizAttempt({
      userId: req.user.id,
      moduleId: module._id,
      score,
      totalQuestions,
      answers: results,
      difficulty: difficulty
    });

    await attempt.save();
    res.json({ score, totalQuestions, results, filteredQuestions, difficulty });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Regenerate quiz for a module
router.post('/:id/regenerate-quiz', auth, async (req, res) => {
  try {
    const module = await Module.findOne({ _id: req.params.id, userId: req.user.id });
    if (!module) {
      return res.status(404).json({ message: 'Module not found' });
    }

    if (!module.originalText) {
      return res.status(400).json({ message: 'No original content to generate quiz from' });
    }

    const aiResult = await processWithAI(module.originalText, { ...req.body, title: module.title });
    
    module.summary = aiResult.summary;
    module.keyConcepts = aiResult.keyConcepts;
    module.flashcards = aiResult.flashcards;
    module.wordChallenges = aiResult.wordChallenges;
    module.quizQuestions = aiResult.quizQuestions;
    module.usedQuestionIndices = []; // Reset used questions
    
    await module.save();
    
    const response = module.toObject();
    response.message = `Quiz regenerated with ${aiResult.quizQuestions.length} questions (${aiResult.quizQuestions.filter(q => q.difficulty === 'easy').length} easy, ${aiResult.quizQuestions.filter(q => q.difficulty === 'medium').length} medium, ${aiResult.quizQuestions.filter(q => q.difficulty === 'hard').length} hard)`;
    res.json(response);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Get quiz history for a specific module
router.get('/:id/quiz-history', auth, async (req, res) => {
  try {
    const module = await Module.findOne({ _id: req.params.id, userId: req.user.id });
    if (!module) {
      return res.status(404).json({ message: 'Module not found' });
    }

    const attempts = await QuizAttempt.find({ moduleId: req.params.id, userId: req.user.id })
      .sort({ createdAt: -1 })
      .lean();

    res.json(attempts);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Get quiz statistics for a specific module
router.get('/:id/quiz-stats', auth, async (req, res) => {
  try {
    const module = await Module.findOne({ _id: req.params.id, userId: req.user.id });
    if (!module) {
      return res.status(404).json({ message: 'Module not found' });
    }

    const attempts = await QuizAttempt.find({ moduleId: req.params.id, userId: req.user.id })
      .lean();

    if (attempts.length === 0) {
      return res.json({
        totalAttempts: 0,
        bestScore: null,
        averageScore: null,
        successRate: null,
        mostMissedQuestions: []
      });
    }

    const scores = attempts.map(a => a.score);
    const bestScore = Math.max(...scores);
    const averageScore = (scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(2);
    const successRate = (attempts.filter(a => a.score / a.totalQuestions >= 0.6).length / attempts.length * 100).toFixed(1);

    // Track which questions are most frequently missed
    const missedQuestions = {};
    attempts.forEach(attempt => {
      attempt.answers.forEach(answer => {
        if (!answer.correct) {
          missedQuestions[answer.questionIndex] = (missedQuestions[answer.questionIndex] || 0) + 1;
        }
      });
    });

    const mostMissedQuestions = Object.entries(missedQuestions)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([index, count]) => ({
        questionIndex: parseInt(index),
        question: module.quizQuestions?.[index]?.question || 'Unknown',
        missCount: count
      }));

    res.json({
      totalAttempts: attempts.length,
      bestScore: `${bestScore}/${attempts[0].totalQuestions}`,
      averageScore: `${averageScore}/${attempts[0].totalQuestions}`,
      successRate: `${successRate}%`,
      mostMissedQuestions
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Delete a module
router.delete('/:id', auth, async (req, res) => {
  try {
    const module = await Module.findOne({ _id: req.params.id, userId: req.user.id });
    if (!module) {
      return res.status(404).json({ message: 'Module not found' });
    }

    // Delete all quiz attempts for this module
    await QuizAttempt.deleteMany({ moduleId: req.params.id, userId: req.user.id });

    // Delete the module
    await Module.deleteOne({ _id: req.params.id, userId: req.user.id });

    res.json({ message: 'Module deleted successfully' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

export default router;
