import mongoose from 'mongoose';

const moduleSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  title: { type: String, required: true },
  originalText: { type: String, required: true },
  summary: { type: String },
  keyConcepts: [{ type: String }],
  quizQuestions: [{
    question: String,
    options: [String],
    correctAnswer: Number,
    difficulty: { type: String, enum: ['easy', 'medium', 'hard'], default: 'medium' },
    type: { type: String, enum: ['mcq', 'trueFalse'], default: 'mcq' },
    usedCount: { type: Number, default: 0 }
  }],
  usedQuestionIndices: [{ type: Number }], // Track which questions user has already seen
  fileName: String,
}, { timestamps: true });

export default mongoose.model('Module', moduleSchema);
