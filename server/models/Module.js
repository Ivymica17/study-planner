import mongoose from 'mongoose';

const moduleSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  title: { type: String, required: true },
  originalText: { type: String, required: true },
  pdfData: { type: String },
  fileType: { type: String },
  fileSize: { type: Number },
  pageCount: { type: Number, default: 0 },
  extractionWarning: { type: String },
  summary: { type: String },
  keyConcepts: [{ type: String }],
  flashcards: [{
    front: String,
    back: String,
    difficulty: { type: String, enum: ['easy', 'medium', 'hard'], default: 'medium' }
  }],
  quizQuestions: [{
    question: String,
    options: [String],
    correctAnswer: Number,
    difficulty: { type: String, enum: ['easy', 'medium', 'hard'], default: 'medium' },
    type: { type: String, enum: ['mcq', 'trueFalse'], default: 'mcq' },
    explanation: String,
    usedCount: { type: Number, default: 0 }
  }],
  usedQuestionIndices: [{ type: Number }], // Track which questions user has already seen
  fileName: String,
}, { timestamps: true });

export default mongoose.model('Module', moduleSchema);
