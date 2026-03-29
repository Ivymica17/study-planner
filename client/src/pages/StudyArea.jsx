import { useEffect, useState } from 'react';
import HandoutAnnotator from '../components/HandoutAnnotator';

export default function StudyArea() {
  const [modules, setModules] = useState([]);
  const [selectedId, setSelectedId] = useState('');
  const [selectedModule, setSelectedModule] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchModules = async () => {
      try {
        const token = localStorage.getItem('token');
        const res = await fetch('/modules', { headers: { 'x-auth-token': token } });
        if (!res.ok) {
          setError('Failed to load modules.');
          setLoading(false);
          return;
        }
        const data = await res.json();
        const list = Array.isArray(data) ? data : [];
        setModules(list);
        if (list.length > 0) {
          setSelectedId(list[0]._id);
        } else {
          setLoading(false);
        }
      } catch (err) {
        console.error('Error loading modules:', err);
        setError('Error loading modules.');
        setLoading(false);
      }
    };
    fetchModules();
  }, []);

  useEffect(() => {
    if (!selectedId) return;
    const fetchModule = async () => {
      setLoading(true);
      try {
        const token = localStorage.getItem('token');
        const res = await fetch(`/modules/${selectedId}`, { headers: { 'x-auth-token': token } });
        if (!res.ok) {
          setError('Failed to load handout content.');
          setLoading(false);
          return;
        }
        const data = await res.json();
        setSelectedModule(data);
        setError('');
      } catch (err) {
        console.error('Error loading module:', err);
        setError('Error loading handout content.');
      } finally {
        setLoading(false);
      }
    };
    fetchModule();
  }, [selectedId]);

  return (
    <div className="max-w-6xl">
      <h1 className="text-3xl font-bold text-gray-800 mb-2">Study Area</h1>
      <p className="text-gray-600 mb-6">Read your handout, highlight key parts, and add drawing notes.</p>

      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-red-700">
          {error}
        </div>
      )}

      {modules.length > 0 && (
        <div className="mb-5">
          <label className="block text-sm font-medium text-gray-700 mb-2">Select Module</label>
          <select
            value={selectedId}
            onChange={(e) => setSelectedId(e.target.value)}
            className="w-full md:w-96 rounded-lg border px-3 py-2 bg-white"
          >
            {modules.map((m) => (
              <option key={m._id} value={m._id}>
                {m.title}
              </option>
            ))}
          </select>
        </div>
      )}

      {loading ? (
        <div className="py-10 text-gray-500">Loading study area...</div>
      ) : modules.length === 0 ? (
        <div className="rounded-lg border bg-white p-8 text-gray-600">No modules yet. Upload a module first.</div>
      ) : (
        <HandoutAnnotator
          moduleId={selectedModule?._id || selectedId}
          content={selectedModule?.originalText || 'No content available'}
        />
      )}
    </div>
  );
}

