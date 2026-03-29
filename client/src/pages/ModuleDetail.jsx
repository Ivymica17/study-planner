import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import HandoutAnnotator from '../components/HandoutAnnotator';

export default function ModuleDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [module, setModule] = useState(null);
  const [quizStats, setQuizStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [regenerating, setRegenerating] = useState(false);
  const [generatingFlashcards, setGeneratingFlashcards] = useState(false);

  const regenerateQuiz = async () => {
    const token = localStorage.getItem('token');
    setRegenerating(true);
    try {
      const res = await fetch(`/modules/${id}/regenerate-quiz`, {
        method: 'POST',
        headers: { 'x-auth-token': token }
      });
      if (res.ok) {
        const updatedModule = await res.json();
        setModule(updatedModule);
        alert('✅ Quiz regenerated! Questions: ' + (updatedModule.quizQuestions?.length || 0));
      } else {
        alert('❌ Failed to regenerate quiz');
      }
    } catch (err) {
      console.error('Error regenerating quiz:', err);
      alert('❌ Error regenerating quiz');
    } finally {
      setRegenerating(false);
    }
  };

  const generateFlashcards = async () => {
    const token = localStorage.getItem('token');
    console.log('Generating flashcards for module:', id);
    console.log('Token exists:', !!token);
    setGeneratingFlashcards(true);
    try {
      const res = await fetch(`/flashcards/${id}/generate`, {
        method: 'POST',
        headers: { 'x-auth-token': token }
      });
      console.log('Response status:', res.status);
      if (res.ok) {
        const data = await res.json();
        console.log('Success data:', data);
        alert(`✅ ${data.count} flashcards generated! Ready to study.`);
        navigate('/flashcards');
      } else {
        const errorData = await res.json().catch(() => ({}));
        console.log('Error data:', errorData);
        const msg = errorData.message || 'Failed to generate flashcards';
        alert(`❌ ${msg}`);
      }
    } catch (err) {
      console.error('Error generating flashcards:', err);
      alert(`❌ Error generating flashcards: ${err.message}`);
    } finally {
      setGeneratingFlashcards(false);
    }
  };

  useEffect(() => {
    const fetchData = async () => {
      const token = localStorage.getItem('token');
      try {
        const [moduleRes, statsRes] = await Promise.all([
          fetch(`/modules/${id}`, { headers: { 'x-auth-token': token } }),
          fetch(`/modules/${id}/quiz-stats`, { headers: { 'x-auth-token': token } })
        ]);
        if (moduleRes.ok) {
          setModule(await moduleRes.json());
        }
        if (statsRes.ok) {
          setQuizStats(await statsRes.json());
        }
      } catch (err) {
        console.error('Error fetching data:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
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
          {/* Quiz Card with Stats */}
          <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-xl border-2 border-blue-200 p-6">
            <h2 className="text-xl font-semibold text-gray-800 mb-4">📚 Quick Quiz</h2>
            <p className="text-gray-600 mb-4">{module.quizQuestions?.length || 0} questions • Interactive assessment</p>
            
            {/* Warning if no questions */}
            {(!module.quizQuestions || module.quizQuestions.length === 0) && (
              <div className="mb-4 p-3 bg-yellow-100 border border-yellow-300 rounded-lg">
                <p className="text-sm text-yellow-800">
                  ⚠️ Quiz questions are being generated. Please refresh the page in a moment.
                </p>
              </div>
            )}
            
            {/* Stats if attempted */}
            {quizStats && quizStats.totalAttempts > 0 && (
              <div className="mb-4 p-4 bg-white rounded-lg border">
                <p className="text-xs text-gray-600 uppercase tracking-wide font-semibold mb-2">Your Performance</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <p className="text-2xl font-bold text-green-600">{quizStats.bestScore}</p>
                    <p className="text-xs text-gray-600">Best Score</p>
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-purple-600">{quizStats.averageScore}</p>
                    <p className="text-xs text-gray-600">Avg Score</p>
                  </div>
                </div>
                <p className="text-sm text-gray-600 mt-3">
                  <strong>{quizStats.totalAttempts}</strong> attempts • <strong>{quizStats.successRate}</strong> success rate
                </p>
              </div>
            )}

            <button
              onClick={() => navigate(`/quiz/${id}`)}
              className="w-full bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 transition font-semibold"
            >
              {quizStats?.totalAttempts > 0 ? 'Retake Quiz' : 'Start Quiz'}
            </button>

            {/* Regenerate Quiz Button if no questions */}
            {(!module.quizQuestions || module.quizQuestions.length === 0) && (
              <button
                onClick={regenerateQuiz}
                disabled={regenerating}
                className="w-full mt-3 bg-green-600 text-white px-6 py-2 rounded-lg hover:bg-green-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {regenerating ? 'Generating...' : '🔄 Generate Quiz Now'}
              </button>
            )}

            {quizStats && quizStats.totalAttempts > 0 && (
              <button
                onClick={() => navigate(`/quiz-history/${id}`)}
                className="w-full mt-3 border border-blue-300 text-blue-600 px-6 py-2 rounded-lg hover:bg-blue-50 transition"
              >
                View Attempt History
              </button>
            )}

          </div>

          <div className="bg-gradient-to-br from-purple-50 to-pink-50 rounded-xl border-2 border-purple-200 p-6">
            <h2 className="text-xl font-semibold text-gray-800 mb-4">🎴 Flashcards</h2>
            <p className="text-gray-600 mb-4">Master concepts with interactive flashcards</p>
            <button
              onClick={generateFlashcards}
              disabled={generatingFlashcards}
              className="w-full bg-purple-600 text-white px-6 py-3 rounded-lg hover:bg-purple-700 transition font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {generatingFlashcards ? 'Generating...' : '✨ Generate & Study Flashcards'}
            </button>
          </div>

          <div>
            <h2 className="text-xl font-semibold text-gray-800 mb-4">Handout Viewer & Notes</h2>
            <HandoutAnnotator moduleId={module._id} content={module.originalText || 'No content available'} />
          </div>
        </div>
      </div>
    </div>
  );
}
