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
    correctAnswer: Number
  }],
  fileName: String,
}, { timestamps: true });

export default mongoose.model('Module', moduleSchema);
