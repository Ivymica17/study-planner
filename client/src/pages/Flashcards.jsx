import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function Flashcards() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [allFlashcards, setAllFlashcards] = useState([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState('list'); // 'list' or 'study'
  const [selectedModule, setSelectedModule] = useState(null);
  const [stats, setStats] = useState(null);

  useEffect(() => {
    if (!user) return;
    fetchFlashcards();
  }, [user]);

  const fetchFlashcards = async () => {
    try {
      const token = localStorage.getItem('token');
      const res = await fetch('/flashcards', {
        headers: { 'x-auth-token': token }
      });
      if (res.ok) {
        const data = await res.json();
        setAllFlashcards(data);
      }
    } catch (err) {
      console.error('Error fetching flashcards:', err);
    } finally {
      setLoading(false);
    }
  };

  const groupByModule = () => {
    const grouped = {};
    allFlashcards.forEach(card => {
      const moduleId = card.moduleId._id;
      if (!grouped[moduleId]) {
        grouped[moduleId] = {
          title: card.moduleId.title,
          cards: []
        };
      }
      grouped[moduleId].cards.push(card);
    });
    return grouped;
  };

  const startStudy = async (moduleId) => {
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`/flashcards/${moduleId}/stats`, {
        headers: { 'x-auth-token': token }
      });
      if (res.ok) {
        const data = await res.json();
        setStats(data);
      }
    } catch (err) {
      console.error('Error fetching stats:', err);
    }
    setSelectedModule(moduleId);
    setView('study');
  };

  if (loading) return <div className="text-center py-10 text-gray-500">Loading flashcards...</div>;

  if (view === 'study' && selectedModule) {
    return <StudyMode moduleId={selectedModule} onBack={() => { setView('list'); setSelectedModule(null); fetchFlashcards(); }} stats={stats} />;
  }

  const grouped = groupByModule();

  return (
    <div className="max-w-6xl mx-auto p-6">
      <button
        onClick={() => navigate('/')}
        className="text-blue-600 hover:underline mb-6 flex items-center gap-1"
      >
        ← Back to Dashboard
      </button>

      <h1 className="text-4xl font-bold text-gray-800 mb-2">📚 Flashcards</h1>
      <p className="text-gray-600 mb-8">Learn efficiently with auto-generated flashcards from your modules</p>

      {Object.keys(grouped).length === 0 ? (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-12 text-center">
          <p className="text-gray-600 mb-4">No flashcards yet. Upload a module and generate flashcards to get started!</p>
          <button
            onClick={() => navigate('/modules')}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            Go to Modules
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {Object.entries(grouped).map(([moduleId, data]) => (
            <div key={moduleId} className="bg-white rounded-xl border border-gray-200 shadow-sm hover:shadow-lg transition p-6">
              <h3 className="text-lg font-semibold text-gray-800 truncate mb-3">{data.title}</h3>
              
              <div className="space-y-2 mb-4">
                <div className="text-sm">
                  <span className="text-gray-600">Total Cards:</span>
                  <span className="ml-2 font-semibold text-gray-800">{data.cards.length}</span>
                </div>
                <div className="text-sm">
                  <span className="text-gray-600">Mastered:</span>
                  <span className="ml-2 font-semibold text-green-600">{data.cards.filter(c => c.mastered).length}</span>
                </div>
                <div className="text-sm">
                  <span className="text-gray-600">Reviewed:</span>
                  <span className="ml-2 font-semibold text-blue-600">{data.cards.filter(c => c.reviewCount > 0).length}</span>
                </div>
              </div>

              <div className="w-full bg-gray-200 rounded-full h-2 mb-4 overflow-hidden">
                <div
                  className="bg-green-500 h-full transition-all duration-300"
                  style={{ width: `${(data.cards.filter(c => c.mastered).length / data.cards.length) * 100}%` }}
                />
              </div>

              <button
                onClick={() => startStudy(moduleId)}
                className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition font-medium"
              >
                Study {data.cards.length} Cards
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function StudyMode({ moduleId, onBack, stats }) {
  const [flashcards, setFlashcards] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all'); // 'all', 'notMastered', 'easy', 'medium', 'hard'
  const [studyStats, setStudyStats] = useState({ reviewed: 0, correct: 0 });

  useEffect(() => {
    fetchFlashcards();
  }, [moduleId, filter]);

  const fetchFlashcards = async () => {
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`/flashcards/${moduleId}`, {
        headers: { 'x-auth-token': token }
      });
      if (res.ok) {
        let data = await res.json();

        // Apply filters
        if (filter === 'notMastered') {
          data = data.filter(c => !c.mastered);
        } else if (filter === 'easy' || filter === 'medium' || filter === 'hard') {
          data = data.filter(c => c.difficulty === filter);
        }

        setFlashcards(data);
        setCurrentIndex(0);
        setIsFlipped(false);
      }
    } catch (err) {
      console.error('Error fetching flashcards:', err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <div className="text-center py-20">Loading...</div>;

  if (flashcards.length === 0) {
    return (
      <div className="max-w-2xl mx-auto p-6">
        <button
          onClick={onBack}
          className="text-blue-600 hover:underline mb-6"
        >
          ← Back
        </button>
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-8 text-center">
          <p className="text-gray-600">No flashcards match this filter.</p>
          <button
            onClick={() => setFilter('all')}
            className="mt-4 px-4 py-2 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700"
          >
            Show All Cards
          </button>
        </div>
      </div>
    );
  }

  const currentCard = flashcards[currentIndex];
  const progress = ((currentIndex + 1) / flashcards.length) * 100;

  const handleMarkCorrect = async () => {
    try {
      const token = localStorage.getItem('token');
      await fetch(`/flashcards/${currentCard._id}/review`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'x-auth-token': token
        },
        body: JSON.stringify({ isCorrect: true })
      });
      setStudyStats(s => ({ ...s, reviewed: s.reviewed + 1, correct: s.correct + 1 }));
      nextCard();
    } catch (err) {
      console.error('Error marking correct:', err);
    }
  };

  const handleMarkDifficulty = async (difficulty) => {
    try {
      const token = localStorage.getItem('token');
      await fetch(`/flashcards/${currentCard._id}/review`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'x-auth-token': token
        },
        body: JSON.stringify({ difficulty, isCorrect: false })
      });
      setStudyStats(s => ({ ...s, reviewed: s.reviewed + 1 }));
      nextCard();
    } catch (err) {
      console.error('Error updating difficulty:', err);
    }
  };

  const nextCard = () => {
    if (currentIndex < flashcards.length - 1) {
      setCurrentIndex(currentIndex + 1);
      setIsFlipped(false);
    } else {
      // Study session complete
      setCurrentIndex(0);
      setIsFlipped(false);
    }
  };

  const difficultyColor = {
    easy: 'bg-green-100 text-green-800 border-green-300',
    medium: 'bg-yellow-100 text-yellow-800 border-yellow-300',
    hard: 'bg-red-100 text-red-800 border-red-300'
  };

  return (
    <div className="max-w-3xl mx-auto p-6">
      <button
        onClick={onBack}
        className="text-blue-600 hover:underline mb-6"
      >
        ← Back
      </button>

      {/* Progress bar */}
      <div className="mb-8">
        <div className="flex justify-between items-center mb-2">
          <p className="text-sm font-semibold text-gray-700">
            Card {currentIndex + 1} of {flashcards.length}
          </p>
          <p className="text-sm text-gray-600">
            Correct: {studyStats.correct}/{studyStats.reviewed}
          </p>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-3 overflow-hidden">
          <div
            className="bg-blue-600 h-full transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* Filter buttons */}
      <div className="flex gap-2 mb-6 overflow-x-auto">
        {['all', 'notMastered', 'easy', 'medium', 'hard'].map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1 rounded-full text-sm font-medium transition whitespace-nowrap ${
              filter === f
                ? 'bg-blue-600 text-white'
                : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
            }`}
          >
            {f === 'all' ? '📋 All' : f === 'notMastered' ? '📖 Not Mastered' : `${f.charAt(0).toUpperCase()}${f.slice(1)}`}
          </button>
        ))}
      </div>

      {/* Flashcard */}
      <div
        className={`relative w-full h-96 cursor-pointer mb-8 transition-all duration-500 transform ${
          isFlipped ? 'scale-95' : 'scale-100'
        }`}
        onClick={() => setIsFlipped(!isFlipped)}
        style={{
          perspective: '1000px',
          transformStyle: 'preserve-3d'
        }}
      >
        <div
          className={`absolute w-full h-full rounded-xl shadow-lg p-8 flex flex-col justify-center items-center transition-all duration-500 ${
            isFlipped
              ? 'bg-gradient-to-br from-green-50 to-emerald-50 border-2 border-green-400'
              : 'bg-gradient-to-br from-blue-50 to-indigo-50 border-2 border-blue-400'
          }`}
          style={{
            transform: isFlipped ? 'rotateY(180deg)' : 'rotateY(0deg)',
            transformStyle: 'preserve-3d'
          }}
        >
          <div className={`text-center ${isFlipped ? 'text-green-900' : 'text-blue-900'}`}>
            <p className={`text-sm font-semibold mb-4 ${isFlipped ? 'text-green-700' : 'text-blue-700'}`}>
              {isFlipped ? '✅ Answer' : '❓ Question'}
            </p>
            <p className="text-2xl font-bold leading-relaxed">
              {isFlipped ? currentCard.back : currentCard.front}
            </p>
            <p className="text-xs mt-6 opacity-60">Click to flip</p>
          </div>
        </div>
      </div>

      {/* Difficulty badge */}
      <div className="text-center mb-6">
        <span className={`inline-block px-4 py-2 rounded-full text-sm font-semibold border ${difficultyColor[currentCard.difficulty]}`}>
          {currentCard.difficulty.charAt(0).toUpperCase() + currentCard.difficulty.slice(1)} Difficulty
        </span>
        {currentCard.mastered && (
          <div className="mt-2 text-green-600 font-semibold">🏆 Mastered!</div>
        )}
      </div>

      {/* Action buttons */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <button
          onClick={() => handleMarkDifficulty('easy')}
          className="px-4 py-3 bg-green-100 text-green-700 rounded-lg hover:bg-green-200 font-medium transition border-2 border-green-300"
        >
          🟢 Easy
        </button>
        <button
          onClick={() => handleMarkDifficulty('medium')}
          className="px-4 py-3 bg-yellow-100 text-yellow-700 rounded-lg hover:bg-yellow-200 font-medium transition border-2 border-yellow-300"
        >
          🟡 Medium
        </button>
        <button
          onClick={() => handleMarkDifficulty('hard')}
          className="px-4 py-3 bg-red-100 text-red-700 rounded-lg hover:bg-red-200 font-medium transition border-2 border-red-300"
        >
          🔴 Hard
        </button>
        <button
          onClick={handleMarkCorrect}
          className="px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium transition col-span-2 md:col-span-1"
        >
          ✓ Got It!
        </button>
      </div>

      {/* Study complete message */}
      {currentIndex === 0 && studyStats.reviewed > 0 && (
        <div className="mt-8 bg-green-50 border-2 border-green-400 rounded-lg p-6 text-center">
          <p className="text-lg font-semibold text-green-800 mb-2">🎉 Study session complete!</p>
          <p className="text-green-700">You reviewed {studyStats.reviewed} cards with {studyStats.correct} correct answers.</p>
          <p className="text-green-600 text-sm mt-2">Refresh to see your progress updated.</p>
        </div>
      )}
    </div>
  );
}
