import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';

export default function Modules() {
  const [modules, setModules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [title, setTitle] = useState('');
  const [file, setFile] = useState(null);
  const [textInput, setTextInput] = useState('');
  const [showTextInput, setShowTextInput] = useState(false);

  const fetchModules = async () => {
    const token = localStorage.getItem('token');
    const res = await fetch('/modules', { headers: { 'x-auth-token': token } });
    setModules(await res.json());
    setLoading(false);
  };

  useEffect(() => { fetchModules(); }, []);

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
        setTitle('');
        setFile(null);
        setTextInput('');
        fetchModules();
      }
    } catch (err) {
      console.error(err);
    } finally {
      setUploading(false);
    }
  };

  if (loading) return <div className="text-center py-10">Loading...</div>;

  return (
    <div>
      <h1 className="text-3xl font-bold text-gray-800 mb-8">Modules</h1>

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
          <Link key={module._id} to={`/modules/${module._id}`} className="bg-white rounded-xl shadow-sm border p-6 hover:shadow-md transition">
            <h3 className="font-semibold text-lg text-gray-800 mb-2">{module.title}</h3>
            <p className="text-sm text-gray-500 mb-3">
              {module.summary ? `${module.summary.slice(0, 100)}...` : 'Processing summary...'}
            </p>
            <div className="flex justify-between text-xs text-gray-400">
              <span>{module.quizQuestions?.length || 0} questions</span>
              <span>{new Date(module.createdAt).toLocaleDateString()}</span>
            </div>
          </Link>
        ))}
      </div>

      {modules.length === 0 && (
        <p className="text-center text-gray-500 py-10">No modules uploaded yet.</p>
      )}
    </div>
  );
}
