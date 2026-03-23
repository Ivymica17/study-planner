import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';

export default function QuizHistory() {
  const { moduleId } = useParams();
  const navigate = useNavigate();
  const [module, setModule] = useState(null);
  const [attempts, setAttempts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedAttempt, setSelectedAttempt] = useState(null);

  useEffect(() => {
    const fetchData = async () => {
      const token = localStorage.getItem('token');
      if (!token) {
        navigate('/login');
        return;
      }

      try {
        const [moduleRes, historyRes] = await Promise.all([
          fetch(`/modules/${moduleId}`, { headers: { 'x-auth-token': token } }),
          fetch(`/modules/${moduleId}/quiz-history`, { headers: { 'x-auth-token': token } })
        ]);

        if (moduleRes.ok) {
          setModule(await moduleRes.json());
        }
        if (historyRes.ok) {
          const data = await historyRes.json();
          setAttempts(Array.isArray(data) ? data : []);
        }
      } catch (err) {
        console.error('Error fetching data:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [moduleId, navigate]);

  if (loading) return <div className="text-center py-10">Loading...</div>;

  return (
    <div className="max-w-4xl mx-auto">
      <button
        onClick={() => navigate(`/modules/${moduleId}`)}
        className="text-blue-600 hover:underline mb-6 flex items-center gap-1"
      >
        ← Back to Module
      </button>

      <h1 className="text-3xl font-bold text-gray-800 mb-2">{module?.title}</h1>
      <p className="text-gray-600 mb-8">Quiz Attempt History</p>

      {attempts.length === 0 ? (
        <div className="bg-white rounded-xl border p-12 text-center">
          <p className="text-gray-500 text-lg mb-4">No quiz attempts yet.</p>
          <button
            onClick={() => navigate(`/quiz/${moduleId}`)}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
          >
            Take Quiz Now
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Attempts List */}
          <div className="lg:col-span-2">
            <div className="space-y-3">
              {attempts.map((attempt, idx) => {
                const percentage = (attempt.score / attempt.totalQuestions * 100).toFixed(1);
                const isPassing = attempt.score >= attempt.totalQuestions * 0.6;

                return (
                  <button
                    key={attempt._id}
                    onClick={() => setSelectedAttempt(attempt)}
                    className={`w-full text-left p-4 rounded-xl border-2 transition ${
                      selectedAttempt?._id === attempt._id
                        ? 'border-blue-500 bg-blue-50'
                        : 'border-gray-200 bg-white hover:border-gray-300'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-4">
                      <div className="flex-1">
                        <p className="font-semibold text-gray-800">
                          Attempt #{attempts.length - idx}
                        </p>
                        <p className="text-sm text-gray-500">
                          {new Date(attempt.createdAt).toLocaleDateString()} at{' '}
                          {new Date(attempt.createdAt).toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit'
                          })}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className={`text-2xl font-bold ${
                          isPassing ? 'text-green-600' : 'text-red-600'
                        }`}>
                          {attempt.score}/{attempt.totalQuestions}
                        </p>
                        <p className="text-sm text-gray-600">{percentage}%</p>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Attempt Details */}
          <div>
            {selectedAttempt ? (
              <div className="bg-white rounded-xl border p-6 sticky top-6">
                <h3 className="font-semibold text-lg text-gray-800 mb-4">Attempt Details</h3>

                <div className="space-y-4">
                  <div>
                    <p className="text-xs text-gray-600 uppercase tracking-wide">Date & Time</p>
                    <p className="font-medium text-gray-800">
                      {new Date(selectedAttempt.createdAt).toLocaleString()}
                    </p>
                  </div>

                  <div>
                    <p className="text-xs text-gray-600 uppercase tracking-wide">Score</p>
                    <p className="font-medium text-gray-800">
                      {selectedAttempt.score}/{selectedAttempt.totalQuestions}
                    </p>
                  </div>

                  <div>
                    <p className="text-xs text-gray-600 uppercase tracking-wide">Percentage</p>
                    <p className={`font-bold text-lg ${
                      selectedAttempt.score / selectedAttempt.totalQuestions >= 0.6
                        ? 'text-green-600'
                        : 'text-red-600'
                    }`}>
                      {(selectedAttempt.score / selectedAttempt.totalQuestions * 100).toFixed(1)}%
                    </p>
                  </div>

                  <div className="pt-4 border-t">
                    <p className="text-xs text-gray-600 uppercase tracking-wide mb-3">Results</p>
                    {selectedAttempt.answers?.map((answer, idx) => (
                      <div
                        key={idx}
                        className={`flex items-center gap-2 mb-2 p-2 rounded ${
                          answer.correct
                            ? 'bg-green-50 text-green-700'
                            : 'bg-red-50 text-red-700'
                        }`}
                      >
                        <span className={`w-5 h-5 rounded-full flex items-center justify-center font-bold text-xs text-white ${
                          answer.correct ? 'bg-green-500' : 'bg-red-500'
                        }`}>
                          {answer.correct ? '✓' : '✗'}
                        </span>
                        <span className="text-sm font-medium">Q{idx + 1}</span>
                      </div>
                    ))}
                  </div>

                  <button
                    onClick={() => navigate(`/quiz/${moduleId}`)}
                    className="w-full mt-4 pt-4 border-t px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
                  >
                    Retake Quiz
                  </button>
                </div>
              </div>
            ) : (
              <div className="bg-gray-50 rounded-xl border-2 border-dashed p-6 text-center">
                <p className="text-gray-500">Select an attempt to view details</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
