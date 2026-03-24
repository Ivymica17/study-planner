import express from 'express';
import Flashcard from '../models/Flashcard.js';
import Module from '../models/Module.js';
import { auth } from '../middleware/auth.js';

const router = express.Router();

// Generate flashcards from module content
router.post('/:moduleId/generate', auth, async (req, res) => {
  try {
    const { moduleId } = req.params;
    const userId = req.user?.id || req.userId;

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
    
    // Helper: Extract term definitions from text
    const extractTerms = (text) => {
      const terms = [];
      // Look for patterns like "Term: definition" or "Term - definition"
      const patterns = [
        /([A-Za-z\s]+):\s*([^.!?]*[.!?])/g,
        /([A-Za-z\s]+)\s*-\s*([^.!?]*[.!?])/g
      ];
      
      patterns.forEach(pattern => {
        let match;
        while ((match = pattern.exec(text)) !== null) {
          const term = match[1].trim();
          const definition = match[2].trim();
          if (term.length > 3 && term.length < 50 && definition.length > 10 && definition.length < 300) {
            terms.push({ front: term, back: definition });
          }
        }
      });
      return terms;
    };

    // Generate flashcards from key concepts
    keyConcepts.forEach((concept, idx) => {
      if (concept) {
        flashcards.push({
          front: `What is ${concept}?`,
          back: `${concept} is one of the key concepts in this module. Review the module material for detailed understanding.`,
          difficulty: idx % 3 === 0 ? 'easy' : idx % 3 === 1 ? 'medium' : 'hard'
        });
      }
    });

    console.log('After key concepts processing, flashcards count:', flashcards.length);

    // Extract and add term definitions
    const extractedTerms = extractTerms(text).slice(0, 10);
    console.log('Extracted terms:', extractedTerms.length);
    extractedTerms.forEach((term, idx) => {
      flashcards.push({
        front: term.front,
        back: term.back,
        difficulty: idx % 3 === 0 ? 'easy' : idx % 3 === 1 ? 'medium' : 'hard'
      });
    });

    console.log('After term extraction, flashcards count:', flashcards.length);

    // If not enough flashcards, generate from sentences
    if (flashcards.length < 10) {
      const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 20 && s.trim().length < 200);
      console.log('Found sentences:', sentences.length);
      for (let i = 0; i < Math.min(5, sentences.length); i++) {
        const sentence = sentences[i].trim();
        if (sentence) {
          flashcards.push({
            front: `Explain: ${sentence.substring(0, 60)}...`,
            back: sentence,
            difficulty: i % 3 === 0 ? 'easy' : i % 3 === 1 ? 'medium' : 'hard'
          });
        }
      }
    }

    console.log('After sentence processing, flashcards count:', flashcards.length);

    // Shuffle flashcards
    for (let i = flashcards.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [flashcards[i], flashcards[j]] = [flashcards[j], flashcards[i]];
    }

    // If we still have no flashcards, add a fallback card from module title/summary
    if (flashcards.length === 0) {
      console.log('No flashcards generated, using fallback');
      let fallbackFront = 'What is this module about?';
      let fallbackBack = 'This module contains study material. Please review the content to understand the key concepts.';

      if (module.title) {
        fallbackFront = `What is the main topic of ${module.title}?`;
        fallbackBack = module.summary || `Review the ${module.title} module content for detailed understanding.`;
      } else if (module.summary) {
        fallbackFront = 'What is the main idea of this module?';
        fallbackBack = module.summary;
      }

      flashcards.push({ front: fallbackFront, back: fallbackBack, difficulty: 'easy' });
    }

    // Ensure we have at least one flashcard
    if (flashcards.length === 0) {
      console.log('Still no flashcards, using ultimate fallback');
      flashcards.push({
        front: 'What is this module about?',
        back: 'This module contains study material. Please review the content to understand the key concepts.',
        difficulty: 'easy'
      });
    }

    console.log('Final flashcards count:', flashcards.length);
    console.log('Sample flashcard:', flashcards[0]);

    // Create flashcard documents
    try {
      const created = await Flashcard.insertMany(
        flashcards.slice(0, 20).map(fc => ({ userId, moduleId, ...fc }))
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
