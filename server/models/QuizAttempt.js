import mongoose from 'mongoose';

const quizAttemptSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  moduleId: { type: mongoose.Schema.Types.ObjectId, ref: 'Module', required: true },
  score: { type: Number, required: true },
  totalQuestions: { type: Number, required: true },
  difficulty: { type: String, enum: ['easy', 'medium', 'hard'], default: null }, // Track which difficulty was attempted
  answers: [{ 
    questionIndex: Number, 
    selectedAnswer: Number, 
    correct: Boolean,
    difficulty: String 
  }],
  questions: [{
    question: String,
    options: [String],
    correctAnswer: Number,
    difficulty: String,
    type: String
  }]
}, { timestamps: true });

export default mongoose.model('QuizAttempt', quizAttemptSchema);
