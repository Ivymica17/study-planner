import mongoose from 'mongoose';

const quizAttemptSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  moduleId: { type: mongoose.Schema.Types.ObjectId, ref: 'Module', required: true },
  score: { type: Number, required: true },
  totalQuestions: { type: Number, required: true },
  answers: [{ questionIndex: Number, selectedAnswer: Number, correct: Boolean }],
}, { timestamps: true });

export default mongoose.model('QuizAttempt', quizAttemptSchema);
