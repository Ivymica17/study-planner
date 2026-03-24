import mongoose from 'mongoose';

const flashcardSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  moduleId: { type: mongoose.Schema.Types.ObjectId, ref: 'Module', required: true },
  front: { type: String, required: true }, // Question or term
  back: { type: String, required: true }, // Answer or definition
  difficulty: { type: String, enum: ['easy', 'medium', 'hard'], default: 'medium' },
  userDifficulty: { type: String, enum: ['easy', 'medium', 'hard'], default: null }, // User's rated difficulty
  reviewCount: { type: Number, default: 0 }, // Times user reviewed this card
  correctCount: { type: Number, default: 0 }, // Times user marked as correct
  lastReviewed: { type: Date },
  mastered: { type: Boolean, default: false }, // User has mastered this card
}, { timestamps: true });

export default mongoose.model('Flashcard', flashcardSchema);
