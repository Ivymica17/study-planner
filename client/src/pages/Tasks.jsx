import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

// Priority color mapping
const priorityColors = {
  High: 'bg-red-100 text-red-800 border-red-300',
  Medium: 'bg-yellow-100 text-yellow-800 border-yellow-300',
  Low: 'bg-green-100 text-green-800 border-green-300'
};

const priorityDotColors = {
  High: 'bg-red-500',
  Medium: 'bg-yellow-500',
  Low: 'bg-green-500'
};

export default function Tasks() {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all'); // all, completed, pending
  const [newTask, setNewTask] = useState({ title: '', deadline: '', priority: 'Medium' });
  const [adding, setAdding] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const navigate = useNavigate();

  const fetchTasks = async () => {
    const token = localStorage.getItem('token');
    if (!token) {
      navigate('/login');
      return;
    }
    try {
      const res = await fetch('/tasks', { headers: { 'x-auth-token': token } });
      if (res.status === 401) {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        navigate('/login');
        return;
      }
      const data = await res.json();
      setTasks(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Error fetching tasks:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchTasks(); }, [navigate]);

  // Filter tasks based on completion status
  const filteredTasks = tasks.filter(task => {
    if (filter === 'completed') return task.completed;
    if (filter === 'pending') return !task.completed;
    return true;
  });

  // Sort by priority (High > Medium > Low)
  const priorityOrder = { High: 0, Medium: 1, Low: 2 };
  const sortedTasks = [...filteredTasks].sort((a, b) => {
    return (priorityOrder[a.priority] || 1) - (priorityOrder[b.priority] || 1);
  });

  const handleAddTask = async (e) => {
    e.preventDefault();
    if (!newTask.title) return;
    setAdding(true);

    const token = localStorage.getItem('token');
    const res = await fetch('/tasks', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-auth-token': token
      },
      body: JSON.stringify(newTask)
    });

    if (res.ok) {
      setNewTask({ title: '', deadline: '', priority: 'Medium' });
      fetchTasks();
    }
    setAdding(false);
  };

  const toggleComplete = async (task) => {
    const token = localStorage.getItem('token');
    await fetch(`/tasks/${task._id}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'x-auth-token': token
      },
      body: JSON.stringify({ completed: !task.completed })
    });
    fetchTasks();
  };

  const deleteTask = async (id) => {
    const token = localStorage.getItem('token');
    await fetch(`/tasks/${id}`, {
      method: 'DELETE',
      headers: { 'x-auth-token': token }
    });
    setDeleteConfirm(null);
    fetchTasks();
  };

  if (loading) return <div className="text-center py-10">Loading...</div>;

  return (
    <div className="max-w-3xl mx-auto">
      <h1 className="text-3xl font-bold text-gray-800 mb-8">Tasks</h1>

      {/* Add Task Form */}
      <form onSubmit={handleAddTask} className="bg-white rounded-xl shadow-sm border p-6 mb-8">
        <div className="space-y-4">
          <div className="flex gap-3">
            <input
              type="text"
              placeholder="Add a new task..."
              value={newTask.title}
              onChange={(e) => setNewTask({ ...newTask, title: e.target.value })}
              className="flex-1 p-3 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
            />
            <select
              value={newTask.priority}
              onChange={(e) => setNewTask({ ...newTask, priority: e.target.value })}
              className="p-3 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
            >
              <option value="Low">Low</option>
              <option value="Medium">Medium</option>
              <option value="High">High</option>
            </select>
            <input
              type="date"
              value={newTask.deadline}
              onChange={(e) => setNewTask({ ...newTask, deadline: e.target.value })}
              className="p-3 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
            />
            <button type="submit" disabled={adding} className="bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 transition disabled:opacity-50">
              Add
            </button>
          </div>
        </div>
      </form>

      {/* Filter Buttons */}
      <div className="flex gap-2 mb-6">
        <button
          onClick={() => setFilter('all')}
          className={`px-4 py-2 rounded-lg border transition ${
            filter === 'all'
              ? 'bg-blue-600 text-white border-blue-600'
              : 'bg-white text-gray-700 border-gray-300 hover:border-gray-400'
          }`}
        >
          All ({tasks.length})
        </button>
        <button
          onClick={() => setFilter('pending')}
          className={`px-4 py-2 rounded-lg border transition ${
            filter === 'pending'
              ? 'bg-blue-600 text-white border-blue-600'
              : 'bg-white text-gray-700 border-gray-300 hover:border-gray-400'
          }`}
        >
          Pending ({tasks.filter(t => !t.completed).length})
        </button>
        <button
          onClick={() => setFilter('completed')}
          className={`px-4 py-2 rounded-lg border transition ${
            filter === 'completed'
              ? 'bg-blue-600 text-white border-blue-600'
              : 'bg-white text-gray-700 border-gray-300 hover:border-gray-400'
          }`}
        >
          Completed ({tasks.filter(t => t.completed).length})
        </button>
      </div>

      {/* Delete Confirmation Modal */}
      {deleteConfirm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 rounded-lg">
          <div className="bg-white rounded-xl shadow-xl p-6 max-w-sm">
            <h3 className="text-lg font-bold text-gray-800 mb-4">Delete Task?</h3>
            <p className="text-gray-600 mb-6">This action cannot be undone.</p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setDeleteConfirm(null)}
                className="px-4 py-2 rounded-lg border text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={() => deleteTask(deleteConfirm)}
                className="px-4 py-2 rounded-lg bg-red-600 text-white hover:bg-red-700"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Task List */}
      <div className="space-y-3">
        {sortedTasks.map(task => (
          <div
            key={task._id}
            className={`bg-white rounded-xl shadow-sm border p-4 flex items-center gap-4 transition ${
              task.completed ? 'opacity-60 bg-gray-50' : ''
            }`}
          >
            {/* Checkbox */}
            <button
              onClick={() => toggleComplete(task)}
              className={`w-6 h-6 rounded-full border-2 flex-shrink-0 flex items-center justify-center transition ${
                task.completed ? 'bg-green-500 border-green-500 text-white' : 'border-gray-300 hover:border-blue-500'
              }`}
            >
              {task.completed && '✓'}
            </button>

            {/* Priority Dot */}
            <div className={`w-3 h-3 rounded-full flex-shrink-0 ${priorityDotColors[task.priority]}`}></div>

            {/* Task Info */}
            <div className="flex-1">
              <p className={`font-medium ${task.completed ? 'line-through text-gray-500' : 'text-gray-800'}`}>
                {task.title}
              </p>
              <div className="flex items-center gap-3 mt-1">
                {task.deadline && (
                  <p className="text-xs text-gray-400">
                    Due: {new Date(task.deadline).toLocaleDateString()}
                  </p>
                )}
                <span className={`text-xs px-2 py-1 rounded border ${priorityColors[task.priority]}`}>
                  {task.priority}
                </span>
              </div>
            </div>

            {/* Delete Button */}
            <button
              onClick={() => setDeleteConfirm(task._id)}
              className="text-red-500 hover:text-red-700 text-sm hover:bg-red-50 px-3 py-2 rounded transition"
            >
              Delete
            </button>
          </div>
        ))}
      </div>

      {sortedTasks.length === 0 && (
        <p className="text-center text-gray-500 py-10">
          {filter === 'all' ? 'No tasks yet. Add one above!' : `No ${filter} tasks.`}
        </p>
      )}
    </div>
  );
}
