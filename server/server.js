import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import mongoose from 'mongoose';
import authRoutes from './routes/auth.js';
import moduleRoutes from './routes/modules.js';
import taskRoutes from './routes/tasks.js';
import goalRoutes from './routes/goals.js';
import flashcardRoutes from './routes/flashcards.js';


const app = express();

app.use(cors());
app.use(express.json());

mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('MongoDB connected'))
  .catch(err => console.error('MongoDB error:', err));

app.use('/auth', authRoutes);
app.use('/modules', moduleRoutes);
app.use('/tasks', taskRoutes);
app.use('/goals', goalRoutes);
app.use('/flashcards', flashcardRoutes);

app.get('/health', (req, res) => res.json({ status: 'ok' }));

// Global error handler middleware
app.use((err, req, res, next) => {
  console.error('🚨 Unhandled error:', err);
  res.status(500).json({ message: 'Internal Server Error', error: err.message });
});

// 404 handler
app.use((req, res) => {
  console.warn(`⚠️ 404 - ${req.method} ${req.path}`);
  res.status(404).json({ message: 'Route not found' });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
