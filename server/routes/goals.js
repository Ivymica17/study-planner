import express from 'express';
import StudyGoal from '../models/StudyGoal.js';
import QuizAttempt from '../models/QuizAttempt.js';
import { auth } from '../middleware/auth.js';

const router = express.Router();

// Get or create study goal for user
router.get('/', auth, async (req, res) => {
  try {
    let goal = await StudyGoal.findOne({ userId: req.user.id });
    
    if (!goal) {
      goal = new StudyGoal({
        userId: req.user.id,
        dailyGoal: 2,
        completedToday: 0,
        streak: 0
      });
      await goal.save();
    }

    res.json(goal);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Update daily goal hours
router.patch('/goal', auth, async (req, res) => {
  try {
    const { dailyGoal } = req.body;
    
    let goal = await StudyGoal.findOneAndUpdate(
      { userId: req.user.id },
      { dailyGoal },
      { new: true, upsert: true }
    );

    res.json(goal);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Update completed hours for today
router.patch('/completed', auth, async (req, res) => {
  try {
    const { hours } = req.body;
    
    let goal = await StudyGoal.findOne({ userId: req.user.id });
    if (!goal) {
      goal = new StudyGoal({ userId: req.user.id });
    }

    goal.completedToday = hours;
    goal.totalStudyHours += hours;
    goal.lastUpdated = new Date();
    
    await goal.save();
    res.json(goal);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Update streak
router.patch('/streak', auth, async (req, res) => {
  try {
    const { increment } = req.body;
    
    let goal = await StudyGoal.findOne({ userId: req.user.id });
    if (!goal) {
      goal = new StudyGoal({ userId: req.user.id });
    }

    if (increment) {
      goal.streak += 1;
    } else {
      goal.streak = 0;
    }
    
    goal.lastUpdated = new Date();
    await goal.save();
    res.json(goal);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Get user quiz statistics
router.get('/stats/quiz', auth, async (req, res) => {
  try {
    const attempts = await QuizAttempt.find({ userId: req.user.id }).lean();

    if (attempts.length === 0) {
      return res.json({
        totalAttempts: 0,
        totalQuizzes: 0,
        averageScore: 0,
        bestScore: null,
        successRate: 0,
        performanceOverTime: []
      });
    }

    const totalAttempts = attempts.length;
    const uniqueModules = new Set(attempts.map(a => a.moduleId.toString())).size;
    
    // Calculate average and best scores
    const scores = attempts.map(a => (a.score / a.totalQuestions * 100));
    const averageScore = (scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(1);
    const bestScore = Math.max(...scores).toFixed(1);
    const successRate = (attempts.filter(a => a.score / a.totalQuestions >= 0.6).length / totalAttempts * 100).toFixed(1);

    // Performance over time (last 10 attempts)
    const performanceOverTime = attempts
      .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))
      .slice(-10)
      .map(a => ({
        date: new Date(a.createdAt).toLocaleDateString(),
        score: a.score,
        total: a.totalQuestions,
        percentage: (a.score / a.totalQuestions * 100).toFixed(1)
      }));

    res.json({
      totalAttempts,
      totalQuizzes: uniqueModules,
      averageScore,
      bestScore,
      successRate,
      performanceOverTime
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

export default router;
