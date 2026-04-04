import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';

export default function Modules() {
  const [modules, setModules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [title, setTitle] = useState('');
  const [file, setFile] = useState(null);
  const [textInput, setTextInput] = useState('');
  const [showTextInput, setShowTextInput] = useState(false);
  const [error, setError] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const navigate = useNavigate();

  const fetchModules = async () => {
    const token = localStorage.getItem('token');
    if (!token) {
      navigate('/login');
      return;
    }
    try {
      const res = await fetch('/modules', { headers: { 'x-auth-token': token } });
      if (res.status === 401) {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        navigate('/login');
        return;
      }
      const data = await res.json();
      setModules(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Error fetching modules:', err);
      setError('Failed to load modules');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchModules();
  }, [navigate]);

  const handleUpload = async (e) => {
    e.preventDefault();
    if (!title) return;
    setUploading(true);

    const token = localStorage.getItem('token');
    const formData = new FormData();
    formData.append('title', title);

    if (showTextInput && textInput) {
      formData.append('text', textInput);
    } else if (file) {
      formData.append('file', file);
    } else {
      setUploading(false);
      return;
    }

    try {
      const res = await fetch('/modules/upload', {
        method: 'POST',
        headers: { 'x-auth-token': token },
        body: formData,
      });

      if (res.ok) {
        const result = await res.json();
        setTitle('');
        setFile(null);
        setTextInput('');

        if (result.warning) {
          setError(result.warning);
          setTimeout(() => setError(''), 6000);
        }

        fetchModules();
      } else {
        let msg = 'Failed to upload module';
        try {
          const errorData = await res.json();
          msg = errorData?.message || msg;
        } catch {
          try {
            const text = await res.text();
            if (text && text.trim()) msg = text;
          } catch {
            // ignore
          }
        }
        setError(`${msg} (HTTP ${res.status})`);
      }
    } catch (err) {
      console.error(err);
      setError(`Error uploading module: ${err.message}`);
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (moduleId) => {
    const token = localStorage.getItem('token');
    try {
      const res = await fetch(`/modules/${moduleId}`, {
        method: 'DELETE',
        headers: { 'x-auth-token': token },
      });
      if (res.ok) {
        setModules(modules.filter((m) => m._id !== moduleId));
        setDeleteConfirm(null);
      } else {
        setError('Failed to delete module');
      }
    } catch (err) {
      console.error(err);
      setError('Error deleting module');
    }
  };

  if (loading) return <div className="text-center py-10">Loading...</div>;

  return (
    <div>
      <h1 className="mb-10 text-3xl font-bold text-gray-800">Modules</h1>

      {error && (
        <div className="mb-6 flex items-center justify-between rounded-lg border border-yellow-200 bg-yellow-50 px-4 py-3 text-yellow-800">
          <span>{error}</span>
          <button onClick={() => setError('')} className="font-bold text-yellow-600 hover:text-yellow-800">
            x
          </button>
        </div>
      )}

      <div className="mb-10 rounded-2xl border border-sky-100 bg-white p-7 shadow-[0_20px_50px_rgba(15,23,42,0.07)]">
        <h2 className="mb-5 text-xl font-semibold text-gray-800">Upload New Module</h2>
        <form onSubmit={handleUpload} className="space-y-4">
          <input
            type="text"
            placeholder="Module title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full rounded-xl border border-gray-200 p-3 outline-none focus:ring-2 focus:ring-blue-500"
            required
          />

          <div className="mb-2 flex gap-4">
            <button
              type="button"
              onClick={() => setShowTextInput(false)}
              className={`rounded-xl px-4 py-2.5 transition ${!showTextInput ? 'bg-blue-600 text-white shadow-sm' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
            >
              Upload File
            </button>
            <button
              type="button"
              onClick={() => setShowTextInput(true)}
              className={`rounded-xl px-4 py-2.5 transition ${showTextInput ? 'bg-blue-600 text-white shadow-sm' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
            >
              Paste Text
            </button>
          </div>

          {showTextInput ? (
            <textarea
              placeholder="Paste your study material here..."
              value={textInput}
              onChange={(e) => setTextInput(e.target.value)}
              className="h-40 w-full resize-none rounded-xl border border-gray-200 p-3 outline-none focus:ring-2 focus:ring-blue-500"
            />
          ) : (
            <input
              type="file"
              onChange={(e) => setFile(e.target.files[0])}
              accept=".pdf,.txt"
              className="w-full rounded-xl border border-gray-200 p-3"
            />
          )}

          <button
            type="submit"
            disabled={uploading}
            className="rounded-xl bg-blue-600 px-6 py-3 text-white shadow-sm transition hover:bg-blue-700 disabled:opacity-50"
          >
            {uploading ? 'Processing with AI...' : 'Upload & Analyze'}
          </button>
        </form>
      </div>

      <div className="mb-6">
        <h2 className="text-xl font-semibold text-gray-800">Your Modules</h2>
        <p className="mt-1 text-sm text-gray-500">Browse, revisit, and jump back into any study pack.</p>
      </div>

      <div className="grid grid-cols-1 gap-7 md:grid-cols-2 lg:grid-cols-3">
        {modules.map((module) => (
          <div
            key={module._id}
            className="group relative rounded-2xl border border-slate-200 bg-white p-6 shadow-[0_18px_45px_rgba(15,23,42,0.07)] transition duration-200 hover:-translate-y-1.5 hover:border-blue-200 hover:shadow-[0_26px_60px_rgba(37,99,235,0.14)]"
          >
            <div className="mb-5 flex items-start justify-between gap-3">
              <div className="h-1.5 w-14 rounded-full bg-blue-200 transition duration-200 group-hover:bg-blue-500"></div>
              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-500">
                {module.quizQuestions?.length || 0} questions
              </span>
            </div>
            <Link to={`/modules/${module._id}`} className="block">
              <h3 className="mb-3 text-lg font-semibold text-gray-800 transition group-hover:text-blue-700">{module.title}</h3>
              <p className="mb-5 text-sm leading-6 text-gray-500">
                {module.summary ? `${module.summary.slice(0, 100)}...` : 'Processing summary...'}
              </p>
              <div className="flex items-center justify-between border-t border-slate-100 pt-4 text-xs text-gray-400">
                <span className="rounded-full bg-emerald-50 px-2.5 py-1 font-medium text-emerald-700">Ready to review</span>
                <span>{new Date(module.createdAt).toLocaleDateString()}</span>
              </div>
            </Link>
            <button
              onClick={(e) => {
                e.preventDefault();
                setDeleteConfirm(module._id);
              }}
              className="absolute right-4 top-4 rounded-full p-1 text-gray-400 opacity-0 transition hover:bg-red-50 hover:text-red-500 group-hover:opacity-100"
              title="Delete module"
            >
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
          </div>
        ))}
      </div>

      {deleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
          <div className="max-w-sm rounded-xl bg-white p-6">
            <h3 className="mb-2 text-lg font-bold text-gray-800">Delete Module?</h3>
            <p className="mb-6 text-gray-600">This action cannot be undone. All quiz attempts will be permanently deleted.</p>
            <div className="flex gap-3">
              <button
                onClick={() => handleDelete(deleteConfirm)}
                className="flex-1 rounded-lg bg-red-600 px-4 py-2 text-white transition hover:bg-red-700"
              >
                Delete
              </button>
              <button
                onClick={() => setDeleteConfirm(null)}
                className="flex-1 rounded-lg bg-gray-200 px-4 py-2 text-gray-800 transition hover:bg-gray-300"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {modules.length === 0 && (
        <p className="rounded-2xl bg-white px-6 py-12 text-center text-gray-500 shadow-[0_18px_45px_rgba(15,23,42,0.05)]">No modules uploaded yet.</p>
      )}
    </div>
  );
}
