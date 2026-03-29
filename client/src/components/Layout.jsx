import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <div className="min-h-screen bg-gray-100 flex">
      <aside className="w-64 bg-white shadow-lg fixed h-full">
        <div className="p-6">
          <h1 className="text-2xl font-bold text-blue-600">Study Planner</h1>
        </div>
        <nav className="mt-6">
          <NavLink to="/" end className={({ isActive }) => `flex items-center px-6 py-3 ${isActive ? 'bg-blue-50 text-blue-600 border-r-4 border-blue-600' : 'text-gray-700 hover:bg-gray-50'}`}>
            <span className="mr-3">📊</span> Dashboard
          </NavLink>
          <NavLink to="/modules" className={({ isActive }) => `flex items-center px-6 py-3 ${isActive ? 'bg-blue-50 text-blue-600 border-r-4 border-blue-600' : 'text-gray-700 hover:bg-gray-50'}`}>
            <span className="mr-3">📚</span> Modules
          </NavLink>
          <NavLink to="/flashcards" className={({ isActive }) => `flex items-center px-6 py-3 ${isActive ? 'bg-blue-50 text-blue-600 border-r-4 border-blue-600' : 'text-gray-700 hover:bg-gray-50'}`}>
            <span className="mr-3">🎴</span> Flashcards
          </NavLink>
          <NavLink to="/study-area" className={({ isActive }) => `flex items-center px-6 py-3 ${isActive ? 'bg-blue-50 text-blue-600 border-r-4 border-blue-600' : 'text-gray-700 hover:bg-gray-50'}`}>
            <span className="mr-3">📝</span> Study Area
          </NavLink>
          <NavLink to="/tasks" className={({ isActive }) => `flex items-center px-6 py-3 ${isActive ? 'bg-blue-50 text-blue-600 border-r-4 border-blue-600' : 'text-gray-700 hover:bg-gray-50'}`}>
            <span className="mr-3">✓</span> Tasks
          </NavLink>
          <NavLink to="/quiz-stats" className={({ isActive }) => `flex items-center px-6 py-3 ${isActive ? 'bg-blue-50 text-blue-600 border-r-4 border-blue-600' : 'text-gray-700 hover:bg-gray-50'}`}>
            <span className="mr-3">🎯</span> Quiz Stats
          </NavLink>
        </nav>
        <div className="absolute bottom-0 w-full p-4 border-t">
          <div className="mb-3">
            <p className="font-medium text-gray-800">{user?.name}</p>
            <p className="text-sm text-gray-500">{user?.email}</p>
          </div>
          <button onClick={handleLogout} className="w-full bg-red-500 text-white py-2 rounded-lg hover:bg-red-600 transition">
            Logout
          </button>
        </div>
      </aside>
      <main className="flex-1 ml-64 p-8">
        <Outlet />
      </main>
    </div>
  );
}
