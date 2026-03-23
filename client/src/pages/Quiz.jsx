import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';

export default function Quiz() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [module, setModule] = useState(null);
  const [answers, setAnswers] = useState({});
  const [submitted, setSubmitted] = useState(false);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchModule = async () => {
      const token = localStorage.getItem('token');
      const res = await fetch(`/modules/${id}`, { headers: { 'x-auth-token': token } });
      if (res.ok) setModule(await res.json());
      setLoading(false);
    };
    fetchModule();
  }, [id]);

  const handleSelect = (index, answer) => {
    setAnswers({ ...answers, [index]: answer });
  };

  const handleSubmit = async () => {
    const token = localStorage.getItem('token');
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
    }
  };

  if (loading) return <div className="text-center py-10">Loading...</div>;
  if (!module) return <div className="text-center py-10">Module not found</div>;

  return (
    <div className="max-w-3xl mx-auto">
      <button onClick={() => navigate(`/modules/${id}`)} className="text-blue-600 hover:underline mb-4">← Back to Module</button>

      <h1 className="text-3xl font-bold text-gray-800 mb-2">{module.title}</h1>
      <p className="text-gray-600 mb-8">Quiz</p>

      {result && (
        <div className={`${result.score / result.totalQuestions >= 0.6 ? 'bg-green-100' : 'bg-orange-100'} rounded-xl p-6 mb-8`}>
          <h2 className="text-2xl font-bold mb-2">Your Score: {result.score}/{result.totalQuestions}</h2>
          <p className="text-gray-600">
            {result.score / result.totalQuestions >= 0.8 ? 'Excellent work!' :
             result.score / result.totalQuestions >= 0.6 ? 'Good job!' : 'Keep studying!'}
          </p>
        </div>
      )}

      <div className="space-y-6">
        {module.quizQuestions?.map((q, qIndex) => (
          <div key={qIndex} className={`bg-white rounded-xl shadow-sm border p-6 ${submitted ? (result.results[qIndex]?.correct ? 'border-green-500' : 'border-red-500') : ''}`}>
            <h3 className="font-semibold text-lg text-gray-800 mb-4">Question {qIndex + 1}</h3>
            <p className="text-gray-700 mb-4">{q.question}</p>
            <div className="space-y-2">
              {q.options.map((option, oIndex) => {
                const isSelected = answers[qIndex] === oIndex;
                const isCorrect = submitted && q.correctAnswer === oIndex;
                const isWrong = submitted && isSelected && q.correctAnswer !== oIndex;

                return (
                  <button
                    key={oIndex}
                    onClick={() => !submitted && handleSelect(qIndex, oIndex)}
                    className={`w-full text-left p-3 rounded-lg border transition ${
                      isCorrect ? 'bg-green-100 border-green-500 text-green-800' :
                      isWrong ? 'bg-red-100 border-red-500 text-red-800' :
                      isSelected ? 'bg-blue-100 border-blue-500' : 'hover:bg-gray-50'
                    }`}
                    disabled={submitted}
                  >
                    {option}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-8 text-center">
        {!submitted ? (
          <button
            onClick={handleSubmit}
            disabled={Object.keys(answers).length !== module.quizQuestions?.length}
            className="bg-blue-600 text-white px-8 py-3 rounded-lg hover:bg-blue-700 transition disabled:opacity-50"
          >
            Submit Answers
          </button>
        ) : (
          <button
            onClick={() => { setSubmitted(false); setAnswers({}); setResult(null); }}
            className="bg-gray-600 text-white px-8 py-3 rounded-lg hover:bg-gray-700 transition"
          >
            Retake Quiz
          </button>
        )}
      </div>
    </div>
  );
}
