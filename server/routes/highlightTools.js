import express from 'express';
import OpenAI from 'openai';
import Module from '../models/Module.js';
import { auth } from '../middleware/auth.js';

const router = express.Router();

let openai = null;
if (process.env.OPENAI_API_KEY?.trim()) {
  openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
}

const normalizeText = (value) => String(value || '').replace(/\s+/g, ' ').trim();

const completeSentence = (value) => {
  const text = normalizeText(value);
  if (!text) return '';
  return /[.!?]$/.test(text) ? text : `${text}.`;
};

const splitSentences = (text) =>
  String(text || '')
    .split(/(?<=[.!?])\s+|\n+/)
    .map((sentence) => normalizeText(sentence))
    .filter((sentence) => sentence.length >= 20);

const titleCase = (value) =>
  normalizeText(value)
    .split(' ')
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');

const uniqueBy = (items, selector) => {
  const seen = new Set();
  return items.filter((item) => {
    const key = selector(item);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

const extractKeywords = (text) => {
  const stopwords = new Set([
    'the', 'and', 'for', 'that', 'with', 'this', 'from', 'into', 'your', 'have', 'will', 'about',
    'their', 'there', 'which', 'when', 'where', 'what', 'while', 'were', 'been', 'being', 'than',
    'then', 'them', 'they', 'does', 'using', 'used', 'within', 'after', 'before', 'because', 'through',
    'module', 'highlight', 'study', 'page', 'pages', 'into', 'over', 'under', 'between', 'also',
  ]);

  const words = normalizeText(text)
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(' ')
    .filter((word) => word.length > 3 && !stopwords.has(word));

  return [...new Set(words)].slice(0, 8);
};

const buildSummaryFallback = (text) => {
  const sentences = splitSentences(text);
  if (sentences.length === 0) {
    return 'No usable study text was found in the selected highlight.';
  }

  const bullets = sentences.slice(0, 3).map((sentence) => `- ${completeSentence(sentence)}`);
  return bullets.join('\n');
};

const buildFlashcardsFallback = (text) => {
  const sentences = splitSentences(text);
  const keywords = extractKeywords(text);
  const cards = [];

  sentences.slice(0, 4).forEach((sentence, index) => {
    const keyword = keywords[index] || keywords[0] || `concept ${index + 1}`;
    cards.push({
      front: `What is the key idea behind ${keyword}?`,
      back: completeSentence(sentence),
      difficulty: index === 0 ? 'easy' : index === 1 ? 'medium' : 'hard',
    });
  });

  if (cards.length === 0) {
    cards.push({
      front: 'What should you remember from this highlight?',
      back: completeSentence(text),
      difficulty: 'easy',
    });
  }

  return uniqueBy(cards, (card) => `${card.front}|${card.back}`).slice(0, 5);
};

const buildQuizFallback = (text) => {
  const sentences = splitSentences(text);
  const keywords = extractKeywords(text);

  const questions = sentences.slice(0, 3).map((sentence, index) => {
    const keyword = titleCase(keywords[index] || keywords[0] || `concept ${index + 1}`);
    const correct = completeSentence(sentence);
    const options = [
      correct,
      `It mainly rejects ${keyword.toLowerCase()} as unimportant to the topic.`,
      `It says ${keyword.toLowerCase()} should be ignored in most cases.`,
      `It claims the source does not provide a usable idea about ${keyword.toLowerCase()}.`,
    ];

    return {
      question: `Which answer best reflects the highlighted idea about ${keyword}?`,
      options,
      correctAnswer: 0,
      difficulty: index === 0 ? 'easy' : index === 1 ? 'medium' : 'hard',
      explanation: correct,
      correctExplanation: correct,
      optionExplanations: [
        'This matches the highlighted content.',
        'This contradicts the highlighted content.',
        'This overstates the source and is not supported.',
        'This is inaccurate because the highlight does provide a usable idea.',
      ],
    };
  });

  if (questions.length === 0) {
    questions.push({
      question: 'Which statement best matches the selected highlight?',
      options: [
        completeSentence(text),
        'It says the topic has no practical study value.',
        'It says the concept should always be avoided.',
        'It provides no meaningful information.',
      ],
      correctAnswer: 0,
      difficulty: 'easy',
      explanation: completeSentence(text),
      correctExplanation: completeSentence(text),
      optionExplanations: [
        'This restates the highlighted idea.',
        'This is unsupported by the text.',
        'This is not stated in the text.',
        'This is false because the highlight contains content.',
      ],
    });
  }

  return questions.slice(0, 3);
};

const buildLocalInsights = (text) => ({
  summary: buildSummaryFallback(text),
  flashcards: buildFlashcardsFallback(text),
  quizQuestions: buildQuizFallback(text),
  aiAvailable: false,
});

router.post('/:moduleId/generate', auth, async (req, res) => {
  try {
    const { moduleId } = req.params;
    const highlightText = normalizeText(req.body?.text);

    if (!highlightText || highlightText.length < 12) {
      return res.status(400).json({ message: 'Selected highlight is too short to generate study tools.' });
    }

    const module = await Module.findOne({ _id: moduleId, userId: req.user.id }).select('_id title');
    if (!module) {
      return res.status(404).json({ message: 'Module not found' });
    }

    if (!openai) {
      return res.json({
        ...buildLocalInsights(highlightText),
        sourceText: highlightText,
        warning: 'OpenAI API not configured. Highlight tools were generated locally.',
      });
    }

    try {
      const response = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content:
              'You turn highlighted study text into compact study outputs. Return JSON only with keys summary, flashcards, quizQuestions. Summary must be a short markdown bullet list. flashcards must be an array of up to 5 items with front, back, difficulty. quizQuestions must be an array of up to 3 items with question, options (4 strings), correctAnswer (0-3), difficulty, correctExplanation, optionExplanations (4 strings). Stay faithful to the source text only.',
          },
          {
            role: 'user',
            content: `Module title: ${module.title}\nHighlighted text:\n${highlightText}`,
          },
        ],
      });

      const payload = JSON.parse(response.choices[0]?.message?.content || '{}');
      const flashcards = Array.isArray(payload.flashcards) ? payload.flashcards : [];
      const quizQuestions = Array.isArray(payload.quizQuestions) ? payload.quizQuestions : [];

      res.json({
        summary: String(payload.summary || '').trim() || buildSummaryFallback(highlightText),
        flashcards: flashcards.length > 0 ? flashcards.slice(0, 5) : buildFlashcardsFallback(highlightText),
        quizQuestions: quizQuestions.length > 0 ? quizQuestions.slice(0, 3) : buildQuizFallback(highlightText),
        sourceText: highlightText,
        aiAvailable: true,
      });
    } catch (error) {
      console.error('Highlight insight generation failed, falling back locally:', error.message);
      res.json({
        ...buildLocalInsights(highlightText),
        sourceText: highlightText,
        warning: 'OpenAI generation was unavailable, so local highlight tools were generated instead.',
      });
    }
  } catch (error) {
    console.error('Error generating highlight insights:', error);
    res.status(500).json({ message: 'Failed to generate highlight study tools.' });
  }
});

export default router;
