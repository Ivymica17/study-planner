import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';

export default function Dashboard() {
  const [modules, setModules] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      const token = localStorage.getItem('token');
      try {
        const [modulesRes, tasksRes] = await Promise.all([
          fetch('/modules', { headers: { 'x-auth-token': token } }),
          fetch('/tasks', { headers: { 'x-auth-token': token } })
        ]);
        setModules(await modulesRes.json());
        setTasks(await tasksRes.json());
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  if (loading) return <div className="text-center py-10">Loading...</div>;

  const recentModules = modules.slice(0, 3);
  const pendingTasks = tasks.filter(t => !t.completed).slice(0, 5);

  return (
    <div>
      <h1 className="text-3xl font-bold text-gray-800 mb-8">Dashboard</h1>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <div className="bg-white p-6 rounded-xl shadow-sm border">
          <p className="text-gray-500 mb-1">Total Modules</p>
          <p className="text-3xl font-bold text-blue-600">{modules.length}</p>
        </div>
        <div className="bg-white p-6 rounded-xl shadow-sm border">
          <p className="text-gray-500 mb-1">Total Tasks</p>
          <p className="text-3xl font-bold text-green-600">{tasks.length}</p>
        </div>
        <div className="bg-white p-6 rounded-xl shadow-sm border">
          <p className="text-gray-500 mb-1">Completed</p>
          <p className="text-3xl font-bold text-purple-600">{tasks.filter(t => t.completed).length}</p>
        </div>
        <div className="bg-white p-6 rounded-xl shadow-sm border">
          <p className="text-gray-500 mb-1">Pending</p>
          <p className="text-3xl font-bold text-orange-600">{pendingTasks.length}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
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
                <Link key={module._id} to={`/modules/${module._id}`} className="block p-4 bg-gray-50 rounded-lg hover:bg-gray-100 transition">
                  <h3 className="font-medium text-gray-800">{module.title}</h3>
                  <p className="text-sm text-gray-500">{module.quizQuestions?.length || 0} quiz questions</p>
                </Link>
              ))}
            </div>
          )}
        </div>

        <div className="bg-white rounded-xl shadow-sm border p-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-semibold text-gray-800">Pending Tasks</h2>
            <Link to="/tasks" className="text-blue-600 hover:underline text-sm">View All</Link>
          </div>
          {pendingTasks.length === 0 ? (
            <p className="text-gray-500 text-center py-8">All tasks completed! Great job!</p>
          ) : (
            <div className="space-y-3">
              {pendingTasks.map(task => (
                <div key={task._id} className="p-4 bg-gray-50 rounded-lg">
                  <div className="flex items-center">
                    <div className="w-3 h-3 rounded-full border-2 border-orange-500 mr-3"></div>
                    <span className="text-gray-800">{task.title}</span>
                  </div>
                  {task.deadline && (
                    <p className="text-xs text-gray-500 mt-2 ml-6">Due: {new Date(task.deadline).toLocaleDateString()}</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
