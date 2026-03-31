import express from 'express';
import Flashcard from '../models/Flashcard.js';
import Module from '../models/Module.js';
import { auth } from '../middleware/auth.js';
import { mapDifficultyLabel, normalizeGenerationOptions } from '../utils/generationProfile.js';

const router = express.Router();

const normalizeText = (value) => String(value || '').replace(/\s+/g, ' ').trim();

const completeSentence = (value) => {
  const text = normalizeText(value);
  if (!text) return '';
  return /[.!?]$/.test(text) ? text : `${text}.`;
};

const shorten = (value, max = 160) => {
  const text = normalizeText(value);
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const lastSpace = cut.lastIndexOf(' ');
  return `${(lastSpace > 40 ? cut.slice(0, lastSpace) : cut).trim()}.`;
};

const normalizeKey = (value) => normalizeText(value).toLowerCase().replace(/[^a-z0-9]+/g, ' ');

const uniqueCards = (cards) => {
  const seen = new Set();
  return cards.filter((card) => {
    const key = normalizeKey(`${card.front} ${card.back}`);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

const RECALL_PATTERNS = [
  /\bdefine\b/i,
  /\bwhat is\b/i,
  /\bin your own words\b/i,
  /\bidentify\b/i,
  /\bstate the definition\b/i,
];

const isRecallStyle = (text) => RECALL_PATTERNS.some((pattern) => pattern.test(String(text || '')));

const hasSourceMirror = (candidate, sourceText) => {
  const cleanCandidate = normalizeKey(candidate);
  const cleanSource = normalizeKey(sourceText);
  const words = cleanCandidate.split(' ').filter((word) => word.length > 3);
  if (words.length < 8) return false;

  for (let index = 0; index <= words.length - 8; index += 1) {
    const fragment = words.slice(index, index + 8).join(' ');
    if (fragment.length > 35 && cleanSource.includes(fragment)) {
      return true;
    }
  }

  return false;
};

const conceptTitle = (concept) => {
  const raw = normalizeText(concept);
  if (!raw) return '';
  const parts = raw.split(/:\s+(.+)/);
  return normalizeText(parts[0]).replace(/^[-*•\d.)\s]+/, '');
};

const conceptDetail = (concept) => {
  const raw = normalizeText(concept);
  const parts = raw.split(/:\s+(.+)/);
  return normalizeText(parts[1] || parts[0]);
};

const moduleSentenceParts = (text) =>
  String(text || '')
    .split(/[.!?]+/)
    .map((part) => normalizeText(part))
    .filter((part) => part.length >= 35 && part.length <= 220);

const extractTopicWords = (text) =>
  normalizeText(text)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(' ')
    .filter((word) => word.length > 3);

const buildAppliedFront = (topic, detail, difficulty = 'medium', mode = 'Board') => {
  const label = normalizeText(topic).toLowerCase();

  if (mode === 'Class Prep') {
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
    `A student encounters ${label} in a routine review item. Which idea from the module should guide the answer?`,
    `During a simple class scenario involving ${label}, what point from the module matters most?`,
  ];

  const medium = [
    `A short case turns on ${label}. Which response best applies the module's explanation?`,
    `When ${label} appears in a practical problem, what should the student focus on first?`,
  ];

  const hard = [
    `A board-style situation involves ${label}. Which judgment is most consistent with the module?`,
    `In a more complex case involving ${label}, what application is best supported by the module?`,
  ];

  const bank = difficulty === 'easy' ? easy : difficulty === 'hard' ? hard : medium;
  return bank[Math.floor(Math.random() * bank.length)];
};

const buildModuleBasedBack = (detail) => completeSentence(shorten(detail, 170));

const ensureQuestionMark = (value) => {
  const text = normalizeText(value);
  if (!text) return '';
  return /[?]$/.test(text) ? text : `${text.replace(/[.!]+$/, '')}?`;
};

const finalizeGeneratedCards = (cards = [], limit = 20) => {
  const seenTopics = new Set();
  const finalized = [];

  cards.forEach((card) => {
    const front = ensureQuestionMark(card?.front);
    const back = buildModuleBasedBack(card?.back);
    const topicKey = normalizeKey(`${front} ${back}`)
      .split(' ')
      .filter((word) => word.length > 3)
      .slice(0, 6)
      .join(' ');

    if (!front || !back) return;
    if (seenTopics.has(topicKey)) return;
    seenTopics.add(topicKey);
    finalized.push({
      front,
      back,
      difficulty: card?.difficulty || 'medium',
    });
  });

  return uniqueCards(finalized).slice(0, limit);
};

// Generate flashcards from module content
router.post('/:moduleId/generate', auth, async (req, res) => {
  try {
    const { moduleId } = req.params;
    const userId = req.user?.id || req.userId;
    const profile = normalizeGenerationOptions(req.body || {});

    console.log('Generating flashcards for module:', moduleId, 'user:', userId);

    // Get module
    const module = await Module.findById(moduleId);
    if (!module) {
      console.log('Module not found:', moduleId);
      return res.status(404).json({ message: 'Module not found' });
    }

    const moduleOwnerId = module.userId ? module.userId.toString() : null;
    const currentUserId = userId ? userId.toString() : null;

    if (moduleOwnerId && currentUserId && moduleOwnerId !== currentUserId) {
      console.log('Unauthorized access to module:', moduleId, 'moduleOwner:', moduleOwnerId, 'user:', currentUserId);
      return res.status(403).json({ message: 'Not authorized' });
    }

    if (!currentUserId) {
      console.log('Missing current user id in auth token while generating flashcards for module:', moduleId);
      return res.status(401).json({ message: 'No valid user in token, authorization denied' });
    }

    console.log('Module found:', module.title, 'keyConcepts:', module.keyConcepts?.length || 0, 'text length:', module.originalText?.length || 0);

    // Clear existing flashcards for this module
    await Flashcard.deleteMany({ moduleId, userId });
    console.log('Cleared existing flashcards');

    // Generate flashcards from key concepts and original text
    const flashcards = [];
    
    // Extract key concepts and terms from the module
    const keyConcepts = module.keyConcepts || [];
    const text = module.originalText || '';
    
    console.log('Processing key concepts:', keyConcepts.length);
    
    const moduleSentences = moduleSentenceParts(text);

    // Generate concise, applied flashcards from key concepts only
    keyConcepts.forEach((concept, idx) => {
      const title = conceptTitle(concept);
      const detail = conceptDetail(concept);
      if (title) {
        const difficulty = mapDifficultyLabel(profile.difficulty, idx, 12);
        const supportingSentence = moduleSentences.find((sentence) => {
          const sentenceWords = extractTopicWords(sentence);
          return extractTopicWords(title).some((word) => sentenceWords.includes(word));
        });
        const moduleBack = supportingSentence || detail;
        const front = buildAppliedFront(title, moduleBack, difficulty, profile.mode);
        const back = buildModuleBasedBack(moduleBack);
        if ((profile.mode !== 'Class Prep' && isRecallStyle(front)) || hasSourceMirror(front, text)) return;
        flashcards.push({
          front,
          back,
          difficulty
        });
      }
    });

    console.log('After key concepts processing, flashcards count:', flashcards.length);

    // If not enough cards, build more from module sentences tied to module concepts
    if (flashcards.length < 10) {
      console.log('Found sentences:', moduleSentences.length);
      for (let i = 0; i < Math.min(8, moduleSentences.length); i++) {
        const sentence = moduleSentences[i];
        if (sentence) {
          const difficulty = mapDifficultyLabel(profile.difficulty, i, 12);
          const prompt = buildAppliedFront(shorten(sentence, 48), sentence, difficulty, profile.mode);
          if ((profile.mode !== 'Class Prep' && isRecallStyle(prompt)) || hasSourceMirror(prompt, text)) continue;
          flashcards.push({
            front: prompt,
            back: buildModuleBasedBack(sentence),
            difficulty
          });
        }
      }
    }

    console.log('After sentence processing, flashcards count:', flashcards.length);

    const cleanedFlashcards = finalizeGeneratedCards(flashcards, 20);

    // Shuffle flashcards
    for (let i = cleanedFlashcards.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [cleanedFlashcards[i], cleanedFlashcards[j]] = [cleanedFlashcards[j], cleanedFlashcards[i]];
    }

    // If we still have no flashcards, add a fallback card from module title/summary
    if (cleanedFlashcards.length === 0) {
      console.log('No flashcards generated, using fallback');
      let fallbackFront = 'A practical item asks for the module\'s main takeaway. What should guide the answer?';
      let fallbackBack = 'Use the central idea emphasized in the uploaded module and apply it to the situation presented.';

      if (module.title) {
        fallbackFront = `A student must apply the main lesson from ${module.title}. What idea should guide the response?`;
        fallbackBack = module.summary || `Review the ${module.title} module content for detailed understanding.`;
      } else if (module.summary) {
        fallbackBack = module.summary;
      }

      cleanedFlashcards.push({ front: fallbackFront, back: fallbackBack, difficulty: 'easy' });
    }

    // Ensure we have at least one flashcard
    if (cleanedFlashcards.length === 0) {
      console.log('Still no flashcards, using ultimate fallback');
      cleanedFlashcards.push({
        front: 'What is this module about?',
        back: 'This module contains study material. Please review the content to understand the key concepts.',
        difficulty: 'easy'
      });
    }

    console.log('Final flashcards count:', cleanedFlashcards.length);
    console.log('Sample flashcard:', cleanedFlashcards[0]);

    // Create flashcard documents
    try {
      const created = await Flashcard.insertMany(
        cleanedFlashcards.map(fc => ({ userId, moduleId, ...fc }))
      );
      console.log('Created flashcards:', created.length);
      res.json({ message: 'Flashcards generated', count: created.length, flashcards: created });
    } catch (insertError) {
      console.error('Error inserting flashcards:', insertError);
      res.status(500).json({ message: 'Error saving flashcards', error: insertError.message });
    }
  } catch (err) {
    console.error('Error generating flashcards:', err);
    res.status(500).json({ message: 'Error generating flashcards', error: err.message });
  }
});

// Get flashcards for a module
router.get('/:moduleId', auth, async (req, res) => {
  try {
    const { moduleId } = req.params;
    const userId = req.user?.id || req.userId;

    // Verify module ownership
    const module = await Module.findById(moduleId);
    if (!module) return res.status(404).json({ message: 'Module not found' });

    if (module.userId.toString() !== userId) {
      return res.status(403).json({ message: 'Not authorized' });
    }

    const flashcards = await Flashcard.find({ moduleId, userId }).sort('createdAt');
    res.json(flashcards);
  } catch (err) {
    console.error('Error fetching flashcards:', err);
    res.status(500).json({ message: 'Error fetching flashcards', error: err.message });
  }
});

// Get all user's flashcards
router.get('/', auth, async (req, res) => {
  try {
    const userId = req.user?.id || req.userId;
    const flashcards = await Flashcard.find({ userId })
      .populate('moduleId', 'title')
      .sort('-lastReviewed');
    res.json(flashcards);
  } catch (err) {
    console.error('Error fetching all flashcards:', err);
    res.status(500).json({ message: 'Error fetching flashcards', error: err.message });
  }
});

// Update flashcard review status
router.put('/:cardId/review', auth, async (req, res) => {
  try {
    const { cardId } = req.params;
    const { difficulty, isCorrect } = req.body;
    const userId = req.user?.id || req.userId;

    const card = await Flashcard.findById(cardId);
    if (!card) return res.status(404).json({ message: 'Flashcard not found' });

    if (card.userId.toString() !== userId) {
      return res.status(403).json({ message: 'Not authorized' });
    }

    // Update review info
    card.reviewCount += 1;
    card.lastReviewed = new Date();
    
    if (difficulty) {
      card.userDifficulty = difficulty;
    }

    if (isCorrect) {
      card.correctCount += 1;
      // Mark as mastered if correct 3 times
      if (card.correctCount >= 3) {
        card.mastered = true;
      }
    }

    await card.save();
    res.json({ message: 'Flashcard updated', card });
  } catch (err) {
    console.error('Error updating flashcard:', err);
    res.status(500).json({ message: 'Error updating flashcard', error: err.message });
  }
});

// Reset card mastery status
router.put('/:cardId/reset', auth, async (req, res) => {
  try {
    const { cardId } = req.params;
    const userId = req.user?.id || req.userId;

    const card = await Flashcard.findById(cardId);
    if (!card) return res.status(404).json({ message: 'Flashcard not found' });

    if (card.userId.toString() !== userId) {
      return res.status(403).json({ message: 'Not authorized' });
    }

    card.mastered = false;
    card.correctCount = 0;
    card.reviewCount = 0;
    card.userDifficulty = null;
    card.lastReviewed = null;

    await card.save();
    res.json({ message: 'Flashcard reset', card });
  } catch (err) {
    console.error('Error resetting flashcard:', err);
    res.status(500).json({ message: 'Error resetting flashcard', error: err.message });
  }
});

// Get flashcard stats for a module
router.get('/:moduleId/stats', auth, async (req, res) => {
  try {
    const { moduleId } = req.params;
    const userId = req.user?.id || req.userId;

    const cards = await Flashcard.find({ moduleId, userId });
    
    const total = cards.length;
    const mastered = cards.filter(c => c.mastered).length;
    const reviewed = cards.filter(c => c.reviewCount > 0).length;
    const notReviewed = total - reviewed;
    const accuracy = total > 0 
      ? ((cards.reduce((sum, c) => sum + c.correctCount, 0) / cards.reduce((sum, c) => sum + c.reviewCount || 1, 0)) * 100).toFixed(1)
      : 0;

    res.json({
      total,
      mastered,
      reviewed,
      notReviewed,
      accuracy: parseFloat(accuracy),
      byDifficulty: {
        easy: cards.filter(c => c.difficulty === 'easy').length,
        medium: cards.filter(c => c.difficulty === 'medium').length,
        hard: cards.filter(c => c.difficulty === 'hard').length
      }
    });
  } catch (err) {
    console.error('Error fetching flashcard stats:', err);
    res.status(500).json({ message: 'Error fetching flashcard stats', error: err.message });
  }
});

export default router;
