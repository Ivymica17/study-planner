import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';

export default function Dashboard() {
  const [modules, setModules] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [studyGoal, setStudyGoal] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [goalsInput, setGoalsInput] = useState('');
  const [updatingGoals, setUpdatingGoals] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const fetchData = async () => {
      const token = localStorage.getItem('token');
      if (!token) {
        navigate('/login');
        return;
      }
      
      try {
        const [modulesRes, tasksRes, goalsRes] = await Promise.all([
          fetch('/modules', { headers: { 'x-auth-token': token } }),
          fetch('/tasks', { headers: { 'x-auth-token': token } }),
          fetch('/goals', { headers: { 'x-auth-token': token } })
        ]);
        
        if (modulesRes.status === 401 || tasksRes.status === 401 || goalsRes.status === 401) {
          localStorage.removeItem('token');
          localStorage.removeItem('user');
          navigate('/login');
          return;
        }

        // Check for other errors
        if (!modulesRes.ok || !tasksRes.ok || !goalsRes.ok) {
          throw new Error('Failed to fetch some data');
        }
        
        let modulesData, tasksData, goalsData;
        try {
          modulesData = await modulesRes.json();
        } catch (e) {
          console.error('Failed to parse modules response:', modulesRes);
          throw new Error('Invalid modules response');
        }
        try {
          tasksData = await tasksRes.json();
        } catch (e) {
          console.error('Failed to parse tasks response:', tasksRes);
          throw new Error('Invalid tasks response');
        }
        try {
          goalsData = await goalsRes.json();
        } catch (e) {
          console.error('Failed to parse goals response:', goalsRes);
          throw new Error('Invalid goals response');
        }
        
        setModules(Array.isArray(modulesData) ? modulesData : []);
        setTasks(Array.isArray(tasksData) ? tasksData : []);
        if (goalsData) {
          setStudyGoal(goalsData);
          setGoalsInput(goalsData.dailyGoal?.toString() || '2');
        }
      } catch (err) {
        console.error('Error fetching data:', err);
        setError('Failed to load dashboard data');
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [navigate]);

  const updateDailyGoal = async () => {
    if (!goalsInput || isNaN(goalsInput)) return;
    
    setUpdatingGoals(true);
    const token = localStorage.getItem('token');
    try {
      const res = await fetch('/goals/goal', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'x-auth-token': token
        },
        body: JSON.stringify({ dailyGoal: parseInt(goalsInput) })
      });
      
      const updated = await res.json();
      setStudyGoal(updated);
    } catch (err) {
      console.error('Error updating goal:', err);
    } finally {
      setUpdatingGoals(false);
    }
  };

  if (loading) return <div className="text-center py-10">Loading...</div>;
  
  if (error) return <div className="text-center py-10 text-red-600">{error}</div>;

  // Calculate statistics
  const completedTasks = tasks.filter(t => t.completed).length;
  const pendingTasks = tasks.filter(t => !t.completed);
  
  // Get today's tasks (due today or overdue)
  const today = new Date().toDateString();
  const todaysTasks = tasks.filter(task => {
    if (!task.deadline) return false;
    return new Date(task.deadline).toDateString() === today;
  });
  
  // Get upcoming deadlines (next 7 days)
  const upcomingDeadlines = tasks
    .filter(task => task.deadline && !task.completed)
    .sort((a, b) => new Date(a.deadline) - new Date(b.deadline))
    .slice(0, 5);
  
  const goalProgress = studyGoal ? (studyGoal.completedToday / studyGoal.dailyGoal * 100) : 0;
  const recentModules = modules.slice(0, 3);

  return (
    <div>
      <h1 className="text-3xl font-bold text-gray-800 mb-8">Dashboard</h1>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-4 mb-8">
        <div className="bg-white p-5 rounded-xl shadow-sm border">
          <p className="text-gray-500 text-sm mb-1">Total Modules</p>
          <p className="text-2xl font-bold text-blue-600">{modules.length}</p>
        </div>
        <div className="bg-white p-5 rounded-xl shadow-sm border">
          <p className="text-gray-500 text-sm mb-1">Total Tasks</p>
          <p className="text-2xl font-bold text-purple-600">{tasks.length}</p>
        </div>
        <div className="bg-white p-5 rounded-xl shadow-sm border">
          <p className="text-gray-500 text-sm mb-1">Completed</p>
          <p className="text-2xl font-bold text-green-600">{completedTasks}</p>
        </div>
        <div className="bg-white p-5 rounded-xl shadow-sm border">
          <p className="text-gray-500 text-sm mb-1">Pending</p>
          <p className="text-2xl font-bold text-orange-600">{pendingTasks.length}</p>
        </div>
        <div className="bg-white p-5 rounded-xl shadow-sm border">
          <p className="text-gray-500 text-sm mb-1">Today's Tasks</p>
          <p className="text-2xl font-bold text-indigo-600">{todaysTasks.length}</p>
        </div>
        <div className="bg-white p-5 rounded-xl shadow-sm border">
          <p className="text-gray-500 text-sm mb-1">Study Streak</p>
          <p className="text-2xl font-bold text-red-600">{studyGoal?.streak || 0} 🔥</p>
        </div>
      </div>

      {/* Study Goals and Today's Tasks */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        {/* Study Goals Card */}
        <div className="bg-white rounded-xl shadow-sm border p-6">
          <h2 className="text-xl font-semibold text-gray-800 mb-4">Daily Study Goal</h2>
          
          <div className="space-y-4">
            <div>
              <div className="flex justify-between items-center mb-2">
                <p className="text-sm text-gray-600">Today's Progress</p>
                <p className="text-sm font-semibold text-gray-800">
                  {Math.min(studyGoal?.completedToday || 0, studyGoal?.dailyGoal || 1).toFixed(1)} / {studyGoal?.dailyGoal || 2} hours
                </p>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-3 overflow-hidden">
                <div
                  className="bg-green-500 h-full transition-all"
                  style={{ width: `${Math.min(goalProgress, 100)}%` }}
                ></div>
              </div>
            </div>

            <div className="flex gap-2 pt-2">
              <input
                type="number"
                value={goalsInput}
                onChange={(e) => setGoalsInput(e.target.value)}
                min="0"
                max="24"
                className="flex-1 px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                placeholder="Hours"
              />
              <button
                onClick={updateDailyGoal}
                disabled={updatingGoals}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition disabled:opacity-50"
              >
                Set Goal
              </button>
            </div>

            <div className="pt-3 border-t space-y-2">
              <p className="text-sm text-gray-600">Total Study Hours: <span className="font-bold text-gray-800">{(studyGoal?.totalStudyHours || 0).toFixed(1)}</span></p>
              <p className="text-sm text-gray-600">Current Streak: <span className="font-bold text-red-600">{studyGoal?.streak || 0} days 🔥</span></p>
            </div>
          </div>
        </div>

        {/* Today's Tasks */}
        <div className="bg-white rounded-xl shadow-sm border p-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-semibold text-gray-800">Today's Tasks</h2>
            <Link to="/tasks" className="text-blue-600 hover:underline text-sm">View All</Link>
          </div>
          
          {todaysTasks.length === 0 ? (
            <p className="text-gray-500 text-center py-8">No tasks due today. Well done! 🎉</p>
          ) : (
            <div className="space-y-2">
              {todaysTasks.map(task => (
                <div key={task._id} className="p-3 bg-gray-50 rounded-lg border-l-4 border-orange-400">
                  <div className="flex items-center gap-2">
                    <div className={`w-3 h-3 rounded-full flex-shrink-0 ${
                      task.priority === 'High' ? 'bg-red-500' :
                      task.priority === 'Medium' ? 'bg-yellow-500' : 
                      'bg-green-500'
                    }`}></div>
                    <span className={`flex-1 ${task.completed ? 'line-through text-gray-500' : 'text-gray-800'}`}>
                      {task.title}
                    </span>
                    <span className={`text-xs px-2 py-1 rounded font-medium ${
                      task.priority === 'High' ? 'bg-red-100 text-red-800' :
                      task.priority === 'Medium' ? 'bg-yellow-100 text-yellow-800' : 
                      'bg-green-100 text-green-800'
                    }`}>
                      {task.priority}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Recent Modules and Upcoming Deadlines */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl shadow-sm border p-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-semibold text-gray-800">Recent Modules</h2>
            <Link to="/modules" className="text-blue-600 hover:underline text-sm">View All</Link>
          </div>
          {recentModules.length === 0 ? (
            <p className="text-gray-500 text-center py-8">No modules yet. <Link to="/modules" className="text-blue-600 hover:underline">Upload one</Link></p>
          ) : (
            <div className="space-y-3">
              {recentModules.map(module => (
                <Link key={module._id} to={`/modules/${module._id}`} className="block p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition border">
                  <h3 className="font-medium text-gray-800 truncate">{module.title}</h3>
                  <p className="text-xs text-gray-500 mt-1">{module.quizQuestions?.length || 0} quiz questions</p>
                </Link>
              ))}
            </div>
          )}
        </div>

        <div className="bg-white rounded-xl shadow-sm border p-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-semibold text-gray-800">Upcoming Deadlines</h2>
            <Link to="/tasks" className="text-blue-600 hover:underline text-sm">View All</Link>
          </div>
          {upcomingDeadlines.length === 0 ? (
            <p className="text-gray-500 text-center py-8">No upcoming deadlines. Great job!</p>
          ) : (
            <div className="space-y-2">
              {upcomingDeadlines.map(task => (
                <div key={task._id} className="p-3 bg-gray-50 rounded-lg border-l-4 border-red-400">
                  <div className="flex items-center justify-between">
                    <span className="text-gray-800 font-medium truncate">{task.title}</span>
                    <span className="text-xs text-gray-500 whitespace-nowrap ml-2">
                      {new Date(task.deadline).toLocaleDateString()}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Quiz Performance Section */}
      <div className="mt-8 mb-8">
        <button
          onClick={() => navigate('/quiz-stats')}
          className="w-full bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-xl p-8 hover:shadow-lg transition"
        >
          <div className="text-left">
            <h3 className="text-2xl font-bold mb-2">📊 View Quiz Performance Dashboard</h3>
            <p className="text-purple-100">See your quiz attempt history, scores, and performance trends across all modules</p>
          </div>
        </button>
      </div>
    </div>
  );
}
