import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import PdfStudyWorkspace from '../components/study-area/PdfStudyWorkspace';

export default function StudyArea() {
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedPage = Number(searchParams.get('page') || '1');
  const [modules, setModules] = useState([]);
  const [selectedId, setSelectedId] = useState(searchParams.get('module') || '');
  const [selectedModule, setSelectedModule] = useState(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');

  const syncSelectedId = (moduleId) => {
    setSelectedId(moduleId);
    const nextParams = new URLSearchParams(searchParams);
    if (moduleId) {
      nextParams.set('module', moduleId);
    } else {
      nextParams.delete('module');
    }
    setSearchParams(nextParams, { replace: true });
  };

  const fetchModules = async (preferredId) => {
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      const response = await fetch('/modules', { headers: { 'x-auth-token': token } });
      if (!response.ok) {
        throw new Error('Failed to load modules.');
      }

      const data = await response.json();
      const list = Array.isArray(data) ? data : [];
      setModules(list);

      const chosenId = preferredId || selectedId || searchParams.get('module');
      const fallbackId = list[0]?._id || '';
      syncSelectedId(list.some((module) => module._id === chosenId) ? chosenId : fallbackId);
      setError('');
      return list;
    } catch (err) {
      console.error('Error loading modules:', err);
      setError(err.message || 'Error loading modules.');
      setModules([]);
      setSelectedModule(null);
      syncSelectedId('');
      return [];
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchModules(searchParams.get('module'));
  }, []);

  useEffect(() => {
    if (!selectedId) {
      setSelectedModule(null);
      return;
    }

    const fetchModule = async () => {
      setLoading(true);
      try {
        const token = localStorage.getItem('token');
        const response = await fetch(`/modules/${selectedId}`, { headers: { 'x-auth-token': token } });
        if (!response.ok) {
          throw new Error('Failed to load the selected study file.');
        }

        const data = await response.json();
        setSelectedModule(data);
        setError('');
      } catch (err) {
        console.error('Error loading module:', err);
        setError(err.message || 'Error loading study file.');
      } finally {
        setLoading(false);
      }
    };

    fetchModule();
  }, [selectedId]);

  const handleUpload = async ({ title, file }) => {
    setUploading(true);
    try {
      const token = localStorage.getItem('token');
      const formData = new FormData();
      formData.append('title', title);
      formData.append('file', file);

      const response = await fetch('/modules/upload', {
        method: 'POST',
        headers: { 'x-auth-token': token },
        body: formData,
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload?.message || 'Failed to upload PDF.');
      }

      const createdModule = await response.json();
      await fetchModules(createdModule._id);
      setSelectedModule(createdModule);
      syncSelectedId(createdModule._id);
      setError(createdModule.warning || '');
      return createdModule._id;
    } catch (err) {
      console.error('Error uploading module:', err);
      setError(err.message || 'Error uploading module.');
      return '';
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (module) => {
    const confirmed = window.confirm(`Delete "${module.title}" and its saved quiz history?`);
    if (!confirmed) return;

    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`/modules/${module._id}`, {
        method: 'DELETE',
        headers: { 'x-auth-token': token },
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload?.message || 'Failed to delete handout.');
      }

      const nextModules = modules.filter((item) => item._id !== module._id);
      setModules(nextModules);

      if (selectedId === module._id) {
        const fallbackId = nextModules[0]?._id || '';
        syncSelectedId(fallbackId);
        if (!fallbackId) {
          setSelectedModule(null);
        }
      }

      setError('');
    } catch (err) {
      console.error('Error deleting module:', err);
      setError(err.message || 'Error deleting handout.');
    }
  };

  return (
    <div className="space-y-6">
      <div className="max-w-3xl">
        <p className="text-xs font-semibold uppercase tracking-[0.3em] text-sky-700">Study Tools</p>
        <h1 className="mt-3 text-4xl font-semibold tracking-tight text-slate-900">Study Area</h1>
        <p className="mt-3 text-base leading-7 text-slate-600">
          Open your PDFs in a focused reading workspace with highlighting, pen tools, page thumbnails, and saved progress.
        </p>
      </div>

      {error && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 shadow-sm">
          {error}
        </div>
      )}

      {loading && modules.length === 0 ? (
        <div className="rounded-[28px] border border-slate-200 bg-white px-6 py-10 text-sm text-slate-500 shadow-sm">
          Loading your study workspace...
        </div>
      ) : (
        <PdfStudyWorkspace
          modules={modules}
          selectedModule={selectedModule}
          selectedModuleId={selectedId}
          initialPage={Number.isFinite(requestedPage) && requestedPage > 0 ? requestedPage : 1}
          onSelectModule={syncSelectedId}
          onUpload={handleUpload}
          onDelete={handleDelete}
          uploading={uploading}
        />
      )}
    </div>
  );
}

