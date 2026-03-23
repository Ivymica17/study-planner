import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

export default function QuizStats() {
  const navigate = useNavigate();
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchStats = async () => {
      const token = localStorage.getItem('token');
      if (!token) {
        navigate('/login');
        return;
      }

      try {
        const res = await fetch('/goals/stats/quiz', {
          headers: { 'x-auth-token': token }
        });

        if (res.ok) {
          setStats(await res.json());
        }
      } catch (err) {
        console.error('Error fetching stats:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchStats();
  }, [navigate]);

  if (loading) return <div className="text-center py-10">Loading...</div>;

  return (
    <div className="max-w-4xl mx-auto">
      <button
        onClick={() => navigate('/')}
        className="text-blue-600 hover:underline mb-6 flex items-center gap-1"
      >
        ← Back to Dashboard
      </button>

      <h1 className="text-3xl font-bold text-gray-800 mb-8">📊 Quiz Performance Dashboard</h1>

      {!stats || stats.totalAttempts === 0 ? (
        <div className="bg-white rounded-xl border p-12 text-center">
          <p className="text-gray-500 text-lg mb-4">No quiz data yet.</p>
          <button
            onClick={() => navigate('/modules')}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
          >
            Go to Modules
          </button>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Main Stats Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white rounded-xl border p-6">
              <p className="text-sm text-gray-600 mb-1">Total Quiz Attempts</p>
              <p className="text-4xl font-bold text-blue-600">{stats.totalAttempts}</p>
            </div>

            <div className="bg-white rounded-xl border p-6">
              <p className="text-sm text-gray-600 mb-1">Modules Attempted</p>
              <p className="text-4xl font-bold text-purple-600">{stats.totalQuizzes}</p>
            </div>

            <div className="bg-white rounded-xl border p-6">
              <p className="text-sm text-gray-600 mb-1">Average Score</p>
              <p className="text-4xl font-bold text-green-600">{stats.averageScore}%</p>
            </div>

            <div className="bg-white rounded-xl border p-6">
              <p className="text-sm text-gray-600 mb-1">Best Score</p>
              <p className="text-4xl font-bold text-orange-600">{stats.bestScore}%</p>
            </div>
          </div>

          {/* Success Rate */}
          <div className="bg-white rounded-xl border p-6">
            <h2 className="text-xl font-semibold text-gray-800 mb-4">Success Rate</h2>
            <div className="flex items-center gap-4">
              <div className="relative w-32 h-32">
                <svg className="w-32 h-32 transform -rotate-90" viewBox="0 0 120 120">
                  <circle
                    cx="60"
                    cy="60"
                    r="54"
                    fill="none"
                    stroke="#e5e7eb"
                    strokeWidth="8"
                  />
                  <circle
                    cx="60"
                    cy="60"
                    r="54"
                    fill="none"
                    stroke="#10b981"
                    strokeWidth="8"
                    strokeDasharray={`${(stats.successRate / 100) * 339.29} 339.29`}
                    strokeLinecap="round"
                  />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-2xl font-bold text-green-600">{stats.successRate}%</span>
                </div>
              </div>
              <div>
                <p className="text-gray-600">
                  Of your quiz attempts resulted in a score of 60% or higher.
                </p>
                <p className="text-sm text-gray-500 mt-2">
                  Keep taking quizzes to improve your performance!
                </p>
              </div>
            </div>
          </div>

          {/* Performance Over Time */}
          {stats.performanceOverTime?.length > 0 && (
            <div className="bg-white rounded-xl border p-6">
              <h2 className="text-xl font-semibold text-gray-800 mb-4">Performance Over Time</h2>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b text-left">
                      <th className="px-4 py-2 text-gray-600 font-medium">Date</th>
                      <th className="px-4 py-2 text-gray-600 font-medium">Score</th>
                      <th className="px-4 py-2 text-gray-600 font-medium">Percentage</th>
                      <th className="px-4 py-2 text-gray-600 font-medium">Trend</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats.performanceOverTime.map((perf, idx) => {
                      const prevPerf = stats.performanceOverTime[idx - 1];
                      const trend = prevPerf
                        ? parseFloat(perf.percentage) > parseFloat(prevPerf.percentage)
                          ? '📈'
                          : parseFloat(perf.percentage) < parseFloat(prevPerf.percentage)
                          ? '📉'
                          : '➡️'
                        : '➡️';

                      return (
                        <tr key={idx} className="border-b hover:bg-gray-50">
                          <td className="px-4 py-3 text-gray-800">{perf.date}</td>
                          <td className="px-4 py-3 font-medium">{perf.score}/{perf.total}</td>
                          <td className={`px-4 py-3 font-semibold ${
                            parseFloat(perf.percentage) >= 60
                              ? 'text-green-600'
                              : 'text-red-600'
                          }`}>
                            {perf.percentage}%
                          </td>
                          <td className="px-4 py-3 text-center">{trend}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Tips Section */}
          <div className="bg-blue-50 rounded-xl border border-blue-200 p-6">
            <h3 className="font-semibold text-blue-900 mb-3">💡 Pro Tips</h3>
            <ul className="space-y-2 text-sm text-blue-900">
              <li>✓ Review the most missed questions regularly</li>
              <li>✓ Take quizzes multiple times to reinforce learning</li>
              <li>✓ Track your progress to identify areas that need more study</li>
              <li>✓ Aim for at least 80% on quizzes before moving to new material</li>
            </ul>
          </div>

          {/* Call to Action */}
          <div className="text-center">
            <button
              onClick={() => navigate('/modules')}
              className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
            >
              Go to Modules
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
