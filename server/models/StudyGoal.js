import mongoose from 'mongoose';

const studyGoalSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  dailyGoal: { type: Number, default: 2 }, // hours per day
  completedToday: { type: Number, default: 0 }, // hours completed today
  lastUpdated: { type: Date, default: Date.now },
  streak: { type: Number, default: 0 }, // consecutive days
  totalStudyHours: { type: Number, default: 0 }, // cumulative hours
}, { timestamps: true });

export default mongoose.model('StudyGoal', studyGoalSchema);
