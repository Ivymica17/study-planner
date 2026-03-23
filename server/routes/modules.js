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

const processWithAI = async (text) => {
  if (!openai) {
    console.warn('OpenAI API key not configured, returning empty results');
    return { summary: '', keyConcepts: [], quizQuestions: [] };
  }
  try {
    const summaryResponse = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [{ role: 'user', content: `${SUMMARY_PROMPT}\n\n${text.slice(0, 4000)}` }]
    });
    const summary = summaryResponse.choices[0].message.content;

    const quizResponse = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [{ role: 'user', content: `${QUIZ_PROMPT}\n\n${text.slice(0, 4000)}` }]
    });

    let quizData;
    try {
      const content = quizResponse.choices[0].message.content;
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      quizData = JSON.parse(jsonMatch ? jsonMatch[0] : content);
    } catch {
      quizData = { questions: [] };
    }

    const keyConcepts = summary
      .split(/[•\n]/)
      .filter(line => line.trim())
      .slice(0, 5)
      .map(line => line.replace(/^[\d\.\-\s]+/, '').trim())
      .filter(Boolean);

    return { summary, keyConcepts, quizQuestions: quizData.questions || [] };
  } catch (err) {
    console.error('AI Processing Error:', err);
    return { summary: '', keyConcepts: [], quizQuestions: [] };
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
    res.status(201).json(module);
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

export default router;
