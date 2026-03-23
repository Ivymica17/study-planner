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

  useEffect(() => { fetchModules(); }, [navigate]);

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
        body: formData
      });

      if (res.ok) {
        const result = await res.json();
        setTitle('');
        setFile(null);
        setTextInput('');
        
        // Show warning if AI features not available
        if (result.warning) {
          setError(result.warning);
          setTimeout(() => setError(''), 6000);
        }
        
        fetchModules();
      } else {
        const errorData = await res.json();
        setError(errorData.message || 'Failed to upload module');
      }
    } catch (err) {
      console.error(err);
      setError('Error uploading module');
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (moduleId) => {
    const token = localStorage.getItem('token');
    try {
      const res = await fetch(`/modules/${moduleId}`, {
        method: 'DELETE',
        headers: { 'x-auth-token': token }
      });
      if (res.ok) {
        setModules(modules.filter(m => m._id !== moduleId));
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
      <h1 className="text-3xl font-bold text-gray-800 mb-8">Modules</h1>

      {error && (
        <div className="bg-yellow-50 border border-yellow-200 text-yellow-800 px-4 py-3 rounded-lg mb-6 flex justify-between items-center">
          <span>{error}</span>
          <button onClick={() => setError('')} className="text-yellow-600 hover:text-yellow-800 font-bold">×</button>
        </div>
      )}

      <div className="bg-white rounded-xl shadow-sm border p-6 mb-8">
        <h2 className="text-xl font-semibold text-gray-800 mb-4">Upload New Module</h2>
        <form onSubmit={handleUpload} className="space-y-4">
          <input
            type="text"
            placeholder="Module title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full p-3 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
            required
          />

          <div className="flex gap-4 mb-4">
            <button type="button" onClick={() => setShowTextInput(false)} className={`px-4 py-2 rounded-lg ${!showTextInput ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700'}`}>
              Upload File
            </button>
            <button type="button" onClick={() => setShowTextInput(true)} className={`px-4 py-2 rounded-lg ${showTextInput ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700'}`}>
              Paste Text
            </button>
          </div>

          {showTextInput ? (
            <textarea
              placeholder="Paste your study material here..."
              value={textInput}
              onChange={(e) => setTextInput(e.target.value)}
              className="w-full p-3 border rounded-lg h-40 focus:ring-2 focus:ring-blue-500 outline-none resize-none"
            />
          ) : (
            <input type="file" onChange={(e) => setFile(e.target.files[0])} accept=".pdf,.txt" className="w-full p-3 border rounded-lg" />
          )}

          <button type="submit" disabled={uploading} className="bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 transition disabled:opacity-50">
            {uploading ? 'Processing with AI...' : 'Upload & Analyze'}
          </button>
        </form>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {modules.map(module => (
          <div key={module._id} className="bg-white rounded-xl shadow-sm border p-6 hover:shadow-md transition group relative">
            <Link to={`/modules/${module._id}`} className="block">
              <h3 className="font-semibold text-lg text-gray-800 mb-2">{module.title}</h3>
              <p className="text-sm text-gray-500 mb-3">
                {module.summary ? `${module.summary.slice(0, 100)}...` : 'Processing summary...'}
              </p>
              <div className="flex justify-between text-xs text-gray-400">
                <span>{module.quizQuestions?.length || 0} questions</span>
                <span>{new Date(module.createdAt).toLocaleDateString()}</span>
              </div>
            </Link>
            <button
              onClick={(e) => {
                e.preventDefault();
                setDeleteConfirm(module._id);
              }}
              className="absolute top-4 right-4 text-gray-400 hover:text-red-500 transition opacity-0 group-hover:opacity-100"
              title="Delete module"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
          </div>
        ))}
      </div>

      {deleteConfirm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 max-w-sm">
            <h3 className="text-lg font-bold text-gray-800 mb-2">Delete Module?</h3>
            <p className="text-gray-600 mb-6">This action cannot be undone. All quiz attempts will be permanently deleted.</p>
            <div className="flex gap-3">
              <button
                onClick={() => handleDelete(deleteConfirm)}
                className="flex-1 bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 transition"
              >
                Delete
              </button>
              <button
                onClick={() => setDeleteConfirm(null)}
                className="flex-1 bg-gray-200 text-gray-800 px-4 py-2 rounded-lg hover:bg-gray-300 transition"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {modules.length === 0 && (
        <p className="text-center text-gray-500 py-10">No modules uploaded yet.</p>
      )}
    </div>
  );
}
