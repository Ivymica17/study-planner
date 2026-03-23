import { useState, useEffect } from 'react';

export default function Tasks() {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [newTask, setNewTask] = useState({ title: '', deadline: '' });
  const [adding, setAdding] = useState(false);

  const fetchTasks = async () => {
    const token = localStorage.getItem('token');
    const res = await fetch('/tasks', { headers: { 'x-auth-token': token } });
    setTasks(await res.json());
    setLoading(false);
  };

  useEffect(() => { fetchTasks(); }, []);

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
      setNewTask({ title: '', deadline: '' });
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
    fetchTasks();
  };

  if (loading) return <div className="text-center py-10">Loading...</div>;

  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="text-3xl font-bold text-gray-800 mb-8">Tasks</h1>

      <form onSubmit={handleAddTask} className="bg-white rounded-xl shadow-sm border p-6 mb-8">
        <div className="flex gap-4">
          <input
            type="text"
            placeholder="Add a new task..."
            value={newTask.title}
            onChange={(e) => setNewTask({ ...newTask, title: e.target.value })}
            className="flex-1 p-3 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
          />
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
      </form>

      <div className="space-y-3">
        {tasks.map(task => (
          <div key={task._id} className={`bg-white rounded-xl shadow-sm border p-4 flex items-center gap-4 ${task.completed ? 'opacity-60' : ''}`}>
            <button
              onClick={() => toggleComplete(task)}
              className={`w-6 h-6 rounded-full border-2 flex items-center justify-center ${
                task.completed ? 'bg-green-500 border-green-500 text-white' : 'border-gray-300 hover:border-blue-500'
              }`}
            >
              {task.completed && '✓'}
            </button>
            <div className="flex-1">
              <p className={`${task.completed ? 'line-through text-gray-500' : 'text-gray-800'}`}>{task.title}</p>
              {task.deadline && (
                <p className="text-xs text-gray-400">Due: {new Date(task.deadline).toLocaleDateString()}</p>
              )}
            </div>
            <button onClick={() => deleteTask(task._id)} className="text-red-500 hover:text-red-700 text-sm">
              Delete
            </button>
          </div>
        ))}
      </div>

      {tasks.length === 0 && (
        <p className="text-center text-gray-500 py-10">No tasks yet. Add one above!</p>
      )}
    </div>
  );
}
