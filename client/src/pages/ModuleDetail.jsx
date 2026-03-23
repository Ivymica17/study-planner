import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';

export default function ModuleDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [module, setModule] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchModule = async () => {
      const token = localStorage.getItem('token');
      const res = await fetch(`/modules/${id}`, { headers: { 'x-auth-token': token } });
      if (res.ok) {
        setModule(await res.json());
      }
      setLoading(false);
    };
    fetchModule();
  }, [id]);

  if (loading) return <div className="text-center py-10">Loading...</div>;
  if (!module) return <div className="text-center py-10">Module not found</div>;

  return (
    <div>
      <button onClick={() => navigate('/modules')} className="text-blue-600 hover:underline mb-4">← Back to Modules</button>

      <h1 className="text-3xl font-bold text-gray-800 mb-6">{module.title}</h1>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="space-y-6">
          <div className="bg-white rounded-xl shadow-sm border p-6">
            <h2 className="text-xl font-semibold text-gray-800 mb-4">Summary</h2>
            {module.summary ? (
              <div className="prose text-gray-600 whitespace-pre-line">{module.summary}</div>
            ) : (
              <p className="text-gray-500">Summary not available</p>
            )}
          </div>

          <div className="bg-white rounded-xl shadow-sm border p-6">
            <h2 className="text-xl font-semibold text-gray-800 mb-4">Key Concepts</h2>
            {module.keyConcepts?.length > 0 ? (
              <ul className="space-y-2">
                {module.keyConcepts.map((concept, i) => (
                  <li key={i} className="flex items-start">
                    <span className="text-blue-600 mr-2">•</span>
                    <span className="text-gray-700">{concept}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-gray-500">No key concepts extracted</p>
            )}
          </div>
        </div>

        <div className="space-y-6">
          <div className="bg-white rounded-xl shadow-sm border p-6">
            <h2 className="text-xl font-semibold text-gray-800 mb-4">Quick Quiz</h2>
            <p className="text-gray-600 mb-4">Test your knowledge with {module.quizQuestions?.length || 0} questions.</p>
            <button
              onClick={() => navigate(`/modules/${id}/quiz`)}
              disabled={!module.quizQuestions?.length}
              className="bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Start Quiz
            </button>
          </div>

          <div className="bg-white rounded-xl shadow-sm border p-6">
            <h2 className="text-xl font-semibold text-gray-800 mb-4">Original Content</h2>
            <div className="max-h-96 overflow-y-auto">
              <p className="text-gray-600 whitespace-pre-wrap text-sm">
                {module.originalText?.slice(0, 2000) || 'No content available'}
                {module.originalText?.length > 2000 && '...'}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
