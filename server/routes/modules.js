import express from 'express';
import multer from 'multer';
import pdfParse from 'pdf-parse';
import OpenAI from 'openai';
import Module from '../models/Module.js';
import QuizAttempt from '../models/QuizAttempt.js';
import { auth } from '../middleware/auth.js';

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

let openai = null;
if (process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY.startsWith('sk-')) {
  openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
}

const SUMMARY_PROMPT = 'Summarize this study material into bullet points. Highlight key concepts clearly.';
const QUIZ_PROMPT = 'Generate 5 multiple choice questions with 4 choices each and indicate the correct answer. Return JSON format with this structure: {"questions":[{"question":"...","options":["...","...","...","..."],"correctAnswer":0}]}';

// Fallback quiz generation without OpenAI
const generateFallbackQuiz = (text) => {
  // Extract sentences and key terms
  const sentences = text.match(/[^.!?]+[.!?]+/g) || [];
  const words = text.toLowerCase().split(/\s+/);
  const commonWords = new Set(['the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may', 'might', 'must', 'can', 'and', 'or', 'of', 'in', 'at', 'to', 'for', 'by', 'with', 'on', 'as', 'from', 'it', 'that', 'this', 'which', 'who', 'what', 'where', 'when', 'why', 'how']);
  
  // Get key terms (capitalized words or technical terms)
  const keyTerms = [...new Set(
    words
      .filter(w => w.length > 4 && !commonWords.has(w) && (w[0] === w[0].toUpperCase() || /[A-Z]/.test(w)))
      .slice(0, 20)
  )];

  const questions = [];
  const sentenceArray = sentences
    .map((s) => s.trim())
    .filter((s) => s.length > 20)
    .slice(0, 15);

  // Generate questions from sentences
  sentenceArray.forEach((sentence, idx) => {
    if (questions.length >= 7) return;

    // Create true/false style questions
    const cleanSentence = sentence.replace(/[.!?]/g, '').trim();
    const options = [
      cleanSentence,
      cleanSentence.replace(/is|are|was|were|be/, Math.random() > 0.5 ? 'is not' : 'are not'),
      keyTerms[Math.floor(Math.random() * keyTerms.length)] || 'None of the above',
      keyTerms[Math.floor(Math.random() * keyTerms.length)] || 'All of the above'
    ];

    if (cleanSentence.length > 20) {
      questions.push({
        question: `Is this statement true? "${cleanSentence}"`,
        options: options.slice(0, 4),
        correctAnswer: 0,
        difficulty: idx % 3 === 0 ? 'easy' : idx % 3 === 1 ? 'medium' : 'hard'
      });
    }
  });

  // Add definition questions based on key terms
  keyTerms.slice(0, 4).forEach((term, idx) => {
    if (questions.length >= 8) return;
    const matchingSentence = sentenceArray.find((s) => s.toLowerCase().includes(term.toLowerCase()));
    if (matchingSentence) {
      questions.push({
        question: `What is the definition or context of "${term}"?`,
        options: [
          matchingSentence.substring(0, 80) + '...',
          'A technical term with no specific meaning',
          'A common programming concept',
          'A mathematical principle'
        ],
        correctAnswer: 0,
        difficulty: idx === 0 ? 'medium' : 'hard'
      });
    }
  });

  return questions.slice(0, 8);
};

const processWithAI = async (text) => {
  if (!openai) {
    console.warn('⚠️ OpenAI API key not configured - generating quiz using fallback method');
    const quizQuestions = generateFallbackQuiz(text);
    const summary = text.split(/[.!?]/).slice(0, 5).join('. ') + '.';
    const keyConcepts = text.split(/\s+/).filter(w => w.length > 5 && w[0] === w[0].toUpperCase()).slice(0, 5);
    return { summary, keyConcepts, quizQuestions, aiAvailable: false };
  }
  try {
    console.log('📚 Starting AI processing for text...');
    
    const summaryResponse = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [{ role: 'user', content: `${SUMMARY_PROMPT}\n\n${text.slice(0, 4000)}` }]
    });
    const summary = summaryResponse.choices[0].message.content;
    console.log('✅ Summary generated');

    const quizResponse = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [{ role: 'user', content: `${QUIZ_PROMPT}\n\n${text.slice(0, 4000)}` }]
    });

    let quizData;
    try {
      const content = quizResponse.choices[0].message.content;
      // Try to extract JSON block
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        console.error('❌ Could not find JSON in quiz response');
        quizData = { questions: [] };
      } else {
        quizData = JSON.parse(jsonMatch[0]);
        console.log(`✅ Quiz generated with ${quizData.questions?.length || 0} questions`);
      }
    } catch (parseErr) {
      console.error('❌ Error parsing quiz JSON:', parseErr.message);
      quizData = { questions: [] };
    }

    const keyConcepts = summary
      .split(/[•\n]/)
      .filter(line => line.trim())
      .slice(0, 5)
      .map(line => line.replace(/^[\d\.\-\s]+/, '').trim())
      .filter(Boolean);

    return { summary, keyConcepts, quizQuestions: quizData.questions || [], aiAvailable: true };
  } catch (err) {
    console.error('❌ AI Processing Error:', err.message);
    console.log('📚 Falling back to local quiz generation...');
    const quizQuestions = generateFallbackQuiz(text);
    const summary = text.split(/[.!?]/).slice(0, 5).join('. ') + '.';
    const keyConcepts = text.split(/\s+/).filter(w => w.length > 5 && w[0] === w[0].toUpperCase()).slice(0, 5);
    return { summary, keyConcepts, quizQuestions, aiAvailable: false, error: err.message };
  }
};

router.post('/upload', auth, upload.single('file'), async (req, res) => {
  try {
    const { title } = req.body;
    let text = '';

    if (req.file) {
      if (req.file.mimetype === 'application/pdf') {
        const pdfData = await pdfParse(req.file.buffer);
        text = pdfData.text;
      } else {
        text = req.file.buffer.toString('utf-8');
      }
    } else if (req.body.text) {
      text = req.body.text;
    }

    if (!text.trim()) {
      return res.status(400).json({ message: 'No content provided' });
    }

    const aiResult = await processWithAI(text);

    const module = new Module({
      userId: req.user.id,
      title: title || 'Untitled Module',
      originalText: text,
      summary: aiResult.summary,
      keyConcepts: aiResult.keyConcepts,
      quizQuestions: aiResult.quizQuestions,
      fileName: req.file?.originalname
    });

    await module.save();
    
    // Return response with indication of whether AI was available
    const response = module.toObject();
    if (!aiResult.aiAvailable) {
      response.warning = '⚠️ OpenAI API not configured. Summary and quiz questions not generated. Add OPENAI_API_KEY to .env to enable AI features.';
    }
    if (aiResult.quizQuestions.length === 0 && aiResult.aiAvailable) {
      response.warning = '⚠️ Could not generate quiz questions. The module was saved but quiz generation failed.';
    }
    
    res.status(201).json(response);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.get('/', auth, async (req, res) => {
  try {
    const modules = await Module.find({ userId: req.user.id }).sort({ createdAt: -1 });
    res.json(modules);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.get('/:id', auth, async (req, res) => {
  try {
    const module = await Module.findOne({ _id: req.params.id, userId: req.user.id });
    if (!module) {
      return res.status(404).json({ message: 'Module not found' });
    }
    res.json(module);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.post('/:id/quiz', auth, async (req, res) => {
  try {
    const module = await Module.findOne({ _id: req.params.id, userId: req.user.id });
    if (!module) {
      return res.status(404).json({ message: 'Module not found' });
    }

    const { answers } = req.body;
    const questions = module.quizQuestions;

    const results = answers.map((answer, index) => ({
      questionIndex: index,
      selectedAnswer: answer,
      correct: questions[index]?.correctAnswer === answer
    }));

    const score = results.filter(r => r.correct).length;
    const totalQuestions = questions.length;

    const attempt = new QuizAttempt({
      userId: req.user.id,
      moduleId: module._id,
      score,
      totalQuestions,
      answers: results
    });

    await attempt.save();
    res.json({ score, totalQuestions, results, questions });
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

    const aiResult = await processWithAI(module.originalText);
    
    module.summary = aiResult.summary;
    module.keyConcepts = aiResult.keyConcepts;
    module.quizQuestions = aiResult.quizQuestions;
    
    await module.save();
    
    const response = module.toObject();
    response.message = `Quiz regenerated with ${aiResult.quizQuestions.length} questions`;
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
