import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import TaskReminderControls from '../components/TaskReminderControls';

const priorityColors = {
  High: 'bg-red-100 text-red-800 border-red-300',
  Medium: 'bg-yellow-100 text-yellow-800 border-yellow-300',
  Low: 'bg-green-100 text-green-800 border-green-300',
};

const priorityDotColors = {
  High: 'bg-red-500',
  Medium: 'bg-yellow-500',
  Low: 'bg-green-500',
};

export default function Tasks() {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [newTask, setNewTask] = useState({ title: '', deadline: '', priority: 'Medium' });
  const [adding, setAdding] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const navigate = useNavigate();
  const addButtonRef = useRef(null);

  const requestWithApiFallback = async (path, options = {}) => {
    const bases = [''];

    if (typeof window !== 'undefined') {
      const isLocalhost = ['localhost', '127.0.0.1'].includes(window.location.hostname);
      if (isLocalhost) {
        bases.push('http://localhost:5000');
      }
    }

    let lastError = null;

    for (let index = 0; index < bases.length; index += 1) {
      const base = bases[index];
      try {
        const response = await fetch(`${base}${path}`, options);
        const contentType = response.headers.get('content-type') || '';
        const shouldTryNextBase =
          index < bases.length - 1 &&
          (response.status === 404 ||
            response.status === 502 ||
            response.status === 503 ||
            response.status === 504 ||
            contentType.includes('text/html'));

        if (shouldTryNextBase) {
          continue;
        }

        return response;
      } catch (fetchError) {
        lastError = fetchError;
      }
    }

    throw lastError || new Error('Network request failed');
  };

  const handleUnauthorized = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    navigate('/login');
  };

  const fetchTasks = async () => {
    const token = localStorage.getItem('token');
    if (!token) {
      navigate('/login');
      return;
    }

    try {
      const res = await requestWithApiFallback('/api/tasks', { headers: { 'x-auth-token': token } });
      if (res.status === 401) {
        handleUnauthorized();
        return;
      }

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.message || 'Unable to load tasks right now.');
      }

      const data = await res.json();
      setTasks(Array.isArray(data) ? data : []);
      setError('');
      setStatus('');
    } catch (err) {
      console.error('Error fetching tasks:', err);
      setError(err.message || 'Unable to load tasks right now.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTasks();
  }, [navigate]);

  const filteredTasks = tasks.filter((task) => {
    if (filter === 'completed') return task.completed;
    if (filter === 'pending') return !task.completed;
    return true;
  });

  const priorityOrder = { High: 0, Medium: 1, Low: 2 };
  const sortedTasks = [...filteredTasks].sort((a, b) => (priorityOrder[a.priority] ?? 1) - (priorityOrder[b.priority] ?? 1));

  const handleAddTask = async (event) => {
    event?.preventDefault?.();
    const title = newTask.title.trim();
    if (!title) {
      setError('Please enter a task title.');
      setStatus('');
      return;
    }

    setAdding(true);
    setError('');
    setStatus('Adding task...');

    try {
      const token = localStorage.getItem('token');
      if (!token) {
        handleUnauthorized();
        return;
      }

      const res = await requestWithApiFallback('/api/tasks', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-auth-token': token,
        },
        body: JSON.stringify({ ...newTask, title }),
      });

      if (res.status === 401) {
        handleUnauthorized();
        return;
      }

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(data.message || 'Unable to add task right now.');
      }

      if (data?._id) {
        setTasks((current) => [data, ...current.filter((task) => task._id !== data._id)]);
      }

      setNewTask({ title: '', deadline: '', priority: 'Medium' });
      setStatus('Task added.');
      fetchTasks();
    } catch (err) {
      console.error('Error adding task:', err);
      setError(err.message || 'Unable to add task right now.');
      setStatus('');
    } finally {
      setAdding(false);
    }
  };

  useEffect(() => {
    const button = addButtonRef.current;
    if (!button) return undefined;

    const nativeClickHandler = (event) => {
      handleAddTask(event);
    };

    button.addEventListener('click', nativeClickHandler);
    return () => button.removeEventListener('click', nativeClickHandler);
  }, [newTask, adding]);

  const toggleComplete = async (task) => {
    try {
      const token = localStorage.getItem('token');
      const res = await requestWithApiFallback(`/api/tasks/${task._id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'x-auth-token': token,
        },
        body: JSON.stringify({ completed: !task.completed }),
      });

      if (res.status === 401) {
        handleUnauthorized();
        return;
      }

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || 'Unable to update task right now.');
      }

      await fetchTasks();
    } catch (err) {
      console.error('Error updating task:', err);
      setError(err.message || 'Unable to update task right now.');
    }
  };

  const deleteTask = async (id) => {
    try {
      const token = localStorage.getItem('token');
      const res = await requestWithApiFallback(`/api/tasks/${id}`, {
        method: 'DELETE',
        headers: { 'x-auth-token': token },
      });

      if (res.status === 401) {
        handleUnauthorized();
        return;
      }

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || 'Unable to delete task right now.');
      }

      setDeleteConfirm(null);
      await fetchTasks();
    } catch (err) {
      console.error('Error deleting task:', err);
      setError(err.message || 'Unable to delete task right now.');
    }
  };

  if (loading) return <div className="py-10 text-center">Loading...</div>;

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="mb-8 text-3xl font-bold text-gray-800">Tasks</h1>

      <form onSubmit={handleAddTask} className="mb-8 rounded-xl border bg-white p-6 shadow-sm">
        <div className="space-y-4">
          <div className="flex gap-3">
            <input
              type="text"
              placeholder="Add a new task..."
              value={newTask.title}
              onChange={(event) => {
                setNewTask({ ...newTask, title: event.target.value });
                if (error) setError('');
              }}
              className="flex-1 rounded-lg border p-3 outline-none focus:ring-2 focus:ring-blue-500"
            />
            <select
              value={newTask.priority}
              onChange={(event) => setNewTask({ ...newTask, priority: event.target.value })}
              className="rounded-lg border p-3 outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="Low">Low</option>
              <option value="Medium">Medium</option>
              <option value="High">High</option>
            </select>
            <input
              type="date"
              value={newTask.deadline}
              onChange={(event) => setNewTask({ ...newTask, deadline: event.target.value })}
              className="rounded-lg border p-3 outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button
              ref={addButtonRef}
              type="button"
              onClick={handleAddTask}
              aria-disabled={adding ? 'true' : 'false'}
              className={`rounded-lg bg-blue-600 px-6 py-3 text-white transition ${
                adding ? 'cursor-not-allowed opacity-50' : 'hover:bg-blue-700'
              }`}
            >
              {adding ? 'Adding...' : 'Add'}
            </button>
          </div>
          <p className="text-xs text-slate-500">Tasks with due dates automatically get soft reminder options you can fine-tune below.</p>
          {error && <p className="text-sm text-red-600">{error}</p>}
          {!error && status && <p className="text-sm text-blue-600">{status}</p>}
        </div>
      </form>

      <div className="mb-6 flex gap-2">
        <button
          type="button"
          onClick={() => setFilter('all')}
          className={`rounded-lg border px-4 py-2 transition ${
            filter === 'all' ? 'border-blue-600 bg-blue-600 text-white' : 'border-gray-300 bg-white text-gray-700 hover:border-gray-400'
          }`}
        >
          All ({tasks.length})
        </button>
        <button
          type="button"
          onClick={() => setFilter('pending')}
          className={`rounded-lg border px-4 py-2 transition ${
            filter === 'pending'
              ? 'border-blue-600 bg-blue-600 text-white'
              : 'border-gray-300 bg-white text-gray-700 hover:border-gray-400'
          }`}
        >
          Pending ({tasks.filter((task) => !task.completed).length})
        </button>
        <button
          type="button"
          onClick={() => setFilter('completed')}
          className={`rounded-lg border px-4 py-2 transition ${
            filter === 'completed'
              ? 'border-blue-600 bg-blue-600 text-white'
              : 'border-gray-300 bg-white text-gray-700 hover:border-gray-400'
          }`}
        >
          Completed ({tasks.filter((task) => task.completed).length})
        </button>
      </div>

      {deleteConfirm && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center rounded-lg bg-black bg-opacity-50">
          <div className="max-w-sm rounded-xl bg-white p-6 shadow-xl">
            <h3 className="mb-4 text-lg font-bold text-gray-800">Delete Task?</h3>
            <p className="mb-6 text-gray-600">This action cannot be undone.</p>
            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setDeleteConfirm(null)}
                className="rounded-lg border px-4 py-2 text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => deleteTask(deleteConfirm)}
                className="rounded-lg bg-red-600 px-4 py-2 text-white hover:bg-red-700"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="space-y-3">
        {sortedTasks.map((task) => (
          <div
            key={task._id}
            className={`rounded-xl border bg-white p-4 shadow-sm transition ${task.completed ? 'bg-gray-50 opacity-60' : ''}`}
          >
            <div className="flex items-start gap-4">
              <button
                type="button"
                onClick={() => toggleComplete(task)}
                className={`mt-1 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full border-2 transition ${
                  task.completed ? 'border-green-500 bg-green-500 text-white' : 'border-gray-300 hover:border-blue-500'
                }`}
              >
                {task.completed && 'v'}
              </button>

              <div className={`mt-2 h-3 w-3 flex-shrink-0 rounded-full ${priorityDotColors[task.priority]}`}></div>

              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className={`font-medium ${task.completed ? 'line-through text-gray-500' : 'text-gray-800'}`}>{task.title}</p>
                    <div className="mt-1 flex flex-wrap items-center gap-3">
                      {task.deadline && <p className="text-xs text-gray-400">Due: {new Date(task.deadline).toLocaleDateString()}</p>}
                      <span className={`rounded border px-2 py-1 text-xs ${priorityColors[task.priority]}`}>{task.priority}</span>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => setDeleteConfirm(task._id)}
                    className="rounded px-3 py-2 text-sm text-red-500 transition hover:bg-red-50 hover:text-red-700"
                  >
                    Delete
                  </button>
                </div>

                {task.deadline && !task.completed && (
                  <div className="mt-4">
                    <TaskReminderControls task={task} compact />
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {sortedTasks.length === 0 && (
        <p className="py-10 text-center text-gray-500">{filter === 'all' ? 'No tasks yet. Add one above!' : `No ${filter} tasks.`}</p>
      )}
    </div>
  );
}
