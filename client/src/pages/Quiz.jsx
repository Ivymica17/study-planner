import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function Quiz() {
  const { user, loading: authLoading } = useAuth();
  const { id } = useParams();
  const navigate = useNavigate();
  const [module, setModule] = useState(null);
  const [quizStats, setQuizStats] = useState(null);
  const [answers, setAnswers] = useState({});
  const [submitted, setSubmitted] = useState(false);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(true);
  const [timeLimit, setTimeLimit] = useState(null);
  const [timeRemaining, setTimeRemaining] = useState(null);
  const [expanded, setExpanded] = useState({});

  // Fetch module and quiz stats
  useEffect(() => {
    if (authLoading) return; // Wait for auth to load
    
    const fetchData = async () => {
      const token = localStorage.getItem('token');
      if (!token) {
        setLoading(false);
        return;
      }
      try {
        const [moduleRes, statsRes] = await Promise.all([
          fetch(`/modules/${id}`, { headers: { 'x-auth-token': token } }),
          fetch(`/modules/${id}/quiz-stats`, { headers: { 'x-auth-token': token } })
        ]);
        if (moduleRes.ok) setModule(await moduleRes.json());
        if (statsRes.ok) setQuizStats(await statsRes.json());
      } catch (err) {
        console.error('Error fetching data:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [id, authLoading]);

  // Timer effect
  useEffect(() => {
    if (timeRemaining === null || timeRemaining === Infinity || submitted) return; // Only run timer if there's a numeric time limit

    const timer = setInterval(() => {
      setTimeRemaining(prev => {
        if (prev <= 1) {
          handleSubmit();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [timeRemaining, submitted]);

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const startQuiz = (minutes) => {
    setTimeLimit(minutes);
    if (minutes === null) {
      setTimeRemaining(Infinity); // Unlimited time
    } else {
      setTimeRemaining(minutes * 60); // Timed
    }
  };

  const handleSelect = (index, answer) => {
    setAnswers({ ...answers, [index]: answer });
  };

  const handleSubmit = async () => {
    const token = localStorage.getItem('token');
    try {
      const res = await fetch(`/modules/${id}/quiz`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-auth-token': token
        },
        body: JSON.stringify({ answers: Object.values(answers) })
      });

      if (res.ok) {
        const data = await res.json();
        setResult(data);
        setSubmitted(true);
        setTimeLimit(null);
      }
    } catch (err) {
      console.error('Error submitting quiz:', err);
    }
  };

  const resetQuiz = () => {
    setSubmitted(false);
    setAnswers({});
    setResult(null);
    setTimeRemaining(null);
  };

  if (loading) return <div className="text-center py-10">Loading...</div>;
  if (!module) return <div className="text-center py-10">Module not found</div>;

  // Before quiz starts - show options and stats
  if (timeRemaining === null && !submitted) {
    return (
      <div className="max-w-3xl mx-auto">
        <button onClick={() => navigate(`/modules/${id}`)} className="text-blue-600 hover:underline mb-6 flex items-center gap-1">
          ← Back to Module
        </button>

        <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl border p-8 mb-8">
          <h1 className="text-3xl font-bold text-gray-800 mb-2">{module.title}</h1>
          <p className="text-gray-600 mb-6">Quiz - {module.quizQuestions?.length || 0} Questions</p>

          {/* Quiz Stats */}
          {quizStats && quizStats.totalAttempts > 0 && (
            <div className="bg-white rounded-lg p-4 mb-6 border">
              <h3 className="font-semibold text-gray-800 mb-3">Your Performance</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div>
                  <p className="text-sm text-gray-600">Attempts</p>
                  <p className="text-2xl font-bold text-blue-600">{quizStats.totalAttempts}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Best Score</p>
                  <p className="text-2xl font-bold text-green-600">{quizStats.bestScore}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Avg Score</p>
                  <p className="text-2xl font-bold text-purple-600">{quizStats.averageScore}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Success Rate</p>
                  <p className="text-2xl font-bold text-orange-600">{quizStats.successRate}</p>
                </div>
              </div>

              {/* Most Missed Questions */}
              {quizStats.mostMissedQuestions?.length > 0 && (
                <div className="mt-4 pt-4 border-t">
                  <p className="text-sm text-gray-600 mb-2">⚠️ Most Missed Questions:</p>
                  <ul className="space-y-1 text-sm text-gray-700">
                    {quizStats.mostMissedQuestions.map((q, idx) => (
                      <li key={idx} className="text-gray-600">
                        Q{q.questionIndex + 1}: {q.question.slice(0, 60)}... ({q.missCount} times)
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {/* Timer Options */}
          <h3 className="font-semibold text-gray-800 mb-3">Select Time Limit (Optional)</h3>
          <div className="grid grid-cols-4 gap-3 mb-6">
            <button
              onClick={() => startQuiz(null)}
              className="px-4 py-2 rounded-lg border-2 border-gray-300 text-gray-700 hover:border-gray-400 transition font-medium"
            >
              No Limit
            </button>
            <button
              onClick={() => startQuiz(10)}
              className="px-4 py-2 rounded-lg border-2 border-blue-500 bg-blue-50 text-blue-700 hover:bg-blue-100 transition font-medium"
            >
              10 min
            </button>
            <button
              onClick={() => startQuiz(15)}
              className="px-4 py-2 rounded-lg border-2 border-green-500 bg-green-50 text-green-700 hover:bg-green-100 transition font-medium"
            >
              15 min
            </button>
            <button
              onClick={() => startQuiz(20)}
              className="px-4 py-2 rounded-lg border-2 border-purple-500 bg-purple-50 text-purple-700 hover:bg-purple-100 transition font-medium"
            >
              20 min
            </button>
          </div>

          <button
            onClick={() => {
              if (!module.quizQuestions || module.quizQuestions.length === 0) {
                alert('⚠️ Quiz questions are still being generated. Please refresh the page and try again.');
                return;
              }
              startQuiz(null); // Start with unlimited time
            }}
            disabled={!module.quizQuestions || module.quizQuestions.length === 0}
            className="w-full bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 transition font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Start Quiz
          </button>

          {/* Quiz History Link */}
          <button
            onClick={() => navigate(`/quiz-history/${id}`)}
            className="w-full mt-3 border border-gray-300 text-gray-700 px-6 py-3 rounded-lg hover:bg-gray-50 transition"
          >
            📊 View Quiz History
          </button>
        </div>
      </div>
    );
  }

  // During quiz
  return (
    <div className="max-w-3xl mx-auto">
      {/* Timer */}
      {timeRemaining !== null && (
        <div className={`mb-6 p-4 rounded-lg text-center font-bold text-2xl ${
          timeRemaining < 60 ? 'bg-red-100 text-red-700' : 'bg-blue-100 text-blue-700'
        }`}>
          ⏱️ Time Remaining: {formatTime(timeRemaining)}
        </div>
      )}

      <h1 className="text-3xl font-bold text-gray-800 mb-2">{module.title}</h1>
      <p className="text-gray-600 mb-8">Quiz - {module.quizQuestions?.length || 0} Questions</p>

      {/* Result Summary */}
      {result && (
        <div className={`rounded-xl p-6 mb-8 border-2 ${
          result.score / result.totalQuestions >= 0.8 ? 'bg-green-50 border-green-500' :
          result.score / result.totalQuestions >= 0.6 ? 'bg-yellow-50 border-yellow-500' :
          'bg-red-50 border-red-500'
        }`}>
          <h2 className={`text-3xl font-bold mb-2 ${
            result.score / result.totalQuestions >= 0.8 ? 'text-green-700' :
            result.score / result.totalQuestions >= 0.6 ? 'text-yellow-700' :
            'text-red-700'
          }`}>
            Your Score: {result.score}/{result.totalQuestions}
          </h2>
          <p className={`text-lg font-semibold ${
            result.score / result.totalQuestions >= 0.8 ? 'text-green-600' :
            result.score / result.totalQuestions >= 0.6 ? 'text-yellow-600' :
            'text-red-600'
          }`}>
            {result.score / result.totalQuestions >= 0.8 ? '⭐ Excellent work!' :
             result.score / result.totalQuestions >= 0.6 ? '👍 Good job!' : 
             '📚 Keep studying!'}
          </p>
        </div>
      )}

      {/* Questions */}
      <div className="space-y-4">
        {module.quizQuestions?.map((q, qIndex) => {
          const isSelected = answers[qIndex] !== undefined;
          const selectedAnswer = answers[qIndex];
          const isCorrect = submitted && q.correctAnswer === selectedAnswer;
          const isWrong = submitted && isSelected && q.correctAnswer !== selectedAnswer;
          const isExpanded = expanded[qIndex];

          return (
            <div
              key={qIndex}
              className={`rounded-xl border-2 p-6 transition ${
                submitted && isCorrect ? 'border-green-500 bg-green-50' :
                submitted && isWrong ? 'border-red-500 bg-red-50' :
                'border-gray-200 bg-white hover:border-gray-300'
              }`}
            >
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-2">
                  <span className={`text-lg font-bold w-8 h-8 flex items-center justify-center rounded-full ${
                    submitted && isCorrect ? 'bg-green-500 text-white' :
                    submitted && isWrong ? 'bg-red-500 text-white' :
                    'bg-gray-200 text-gray-700'
                  }`}>
                    {submitted && isCorrect ? '✓' :
                     submitted && isWrong ? '✗' :
                     qIndex + 1}
                  </span>
                  <h3 className="font-semibold text-lg text-gray-800">Question {qIndex + 1}</h3>
                </div>
                {submitted && (
                  <button
                    onClick={() => setExpanded({ ...expanded, [qIndex]: !isExpanded })}
                    className="text-sm text-blue-600 hover:underline"
                  >
                    {isExpanded ? 'Hide details' : 'Show details'}
                  </button>
                )}
              </div>

              <p className="text-gray-700 mb-4 font-medium">{q.question}</p>

              {/* Options */}
              <div className="space-y-2 mb-4">
                {q.options.map((option, oIndex) => {
                  const isCorrectOption = q.correctAnswer === oIndex;
                  const isSelectedOption = selectedAnswer === oIndex;
                  const buttonClasses = submitted
                    ? isCorrectOption
                      ? 'bg-green-100 border-green-500 text-green-800'
                      : isSelectedOption && !isCorrectOption
                      ? 'bg-red-100 border-red-500 text-red-800'
                      : 'bg-gray-50 border-gray-300'
                    : isSelectedOption
                    ? 'bg-blue-100 border-blue-500 text-blue-800'
                    : 'hover:bg-gray-50';

                  return (
                    <button
                      key={oIndex}
                      onClick={() => !submitted && handleSelect(qIndex, oIndex)}
                      className={`w-full text-left p-4 rounded-lg border-2 transition ${buttonClasses}`}
                      disabled={submitted}
                    >
                      <div className="flex items-center gap-3">
                        <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${
                          submitted && isCorrectOption ? 'bg-green-500 border-green-500 text-white' :
                          submitted && isSelectedOption && !isCorrectOption ? 'bg-red-500 border-red-500 text-white' :
                          isSelectedOption && !submitted ? 'bg-blue-500 border-blue-500 text-white' :
                          'border-gray-300'
                        }`}>
                          {submitted && isCorrectOption && '✓'}
                          {submitted && isSelectedOption && !isCorrectOption && '✗'}
                        </div>
                        <span className="font-medium">{option}</span>
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* Explanation (shown when expanded after submission) */}
              {isExpanded && submitted && (
                <div className="mt-4 p-3 bg-white rounded-lg border-l-4 border-blue-500">
                  <p className="text-sm text-gray-700">
                    <strong>Correct Answer:</strong> {q.options[q.correctAnswer]}
                  </p>
                  {isWrong && (
                    <p className="text-sm text-red-600 mt-2">
                      <strong>Your Answer:</strong> {q.options[selectedAnswer]}
                    </p>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Buttons */}
      <div className="mt-8 flex gap-4 justify-center">
        {!submitted ? (
          <>
            <button
              onClick={() => navigate(`/modules/${id}`)}
              className="px-6 py-3 rounded-lg border text-gray-700 hover:bg-gray-50 transition"
            >
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              disabled={Object.keys(answers).length !== module.quizQuestions?.length}
              className="px-8 py-3 rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition disabled:opacity-50 font-semibold"
            >
              Submit Answers
            </button>
          </>
        ) : (
          <>
            <button
              onClick={() => navigate(`/quiz-history/${id}`)}
              className="px-6 py-3 rounded-lg border text-gray-700 hover:bg-gray-50 transition"
            >
              View History
            </button>
            <button
              onClick={resetQuiz}
              className="px-8 py-3 rounded-lg bg-gray-600 text-white hover:bg-gray-700 transition"
            >
              Retake Quiz
            </button>
          </>
        )}
      </div>
    </div>
  );
}
