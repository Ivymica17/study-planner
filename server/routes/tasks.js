import express from 'express';
import Task from '../models/Task.js';
import { auth } from '../middleware/auth.js';

const router = express.Router();

router.get('/', auth, async (req, res) => {
  try {
    const tasks = await Task.find({ userId: req.user.id }).sort({ createdAt: -1 });
    res.json(tasks);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.post('/', auth, async (req, res) => {
  try {
    const { title, deadline, priority } = req.body;
    if (!title) {
      return res.status(400).json({ message: 'Title is required' });
    }

    const task = new Task({
      userId: req.user.id,
      title,
      deadline: deadline || null,
      priority: priority || 'Medium'
    });

    await task.save();
    res.status(201).json(task);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.patch('/:id', auth, async (req, res) => {
  try {
    const { completed, priority, title, deadline } = req.body;
    const updateData = {};
    
    if (completed !== undefined) updateData.completed = completed;
    if (priority) updateData.priority = priority;
    if (title) updateData.title = title;
    if (deadline) updateData.deadline = deadline;

    const task = await Task.findOneAndUpdate(
      { _id: req.params.id, userId: req.user.id },
      updateData,
      { new: true }
    );

    if (!task) {
      return res.status(404).json({ message: 'Task not found' });
    }

    res.json(task);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.delete('/:id', auth, async (req, res) => {
  try {
    const task = await Task.findOneAndDelete({ _id: req.params.id, userId: req.user.id });
    if (!task) {
      return res.status(404).json({ message: 'Task not found' });
    }
    res.json({ message: 'Task deleted' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

export default router;
