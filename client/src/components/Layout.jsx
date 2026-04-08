import { useEffect, useMemo, useState } from 'react';
import { Outlet, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { loadWorkspaceState } from '../utils/studyWorkspace';
import StudyAssistant from './StudyAssistant';
import BrandLogo from './BrandLogo';

const navItems = [
  { to: '/', label: 'Dashboard', end: true },
  { to: '/modules', label: 'Modules' },
  { to: '/flashcards', label: 'Flashcards' },
  { to: '/study-area', label: 'Study Area' },
  { to: '/tasks', label: 'Tasks' },
  { to: '/quiz-stats', label: 'Quiz Stats' },
];

export default function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    setSidebarOpen(false);
  }, [location.pathname]);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const stickyStudyTarget = useMemo(() => {
    try {
      const rawModules = localStorage.getItem('cached-modules');
      const parsedModules = rawModules ? JSON.parse(rawModules) : null;
      if (Array.isArray(parsedModules) && parsedModules.length > 0) {
        const bestMatch = parsedModules
          .map((module) => ({ module, workspace: loadWorkspaceState(module._id) }))
          .sort((a, b) => new Date(b.workspace.lastOpenedAt || 0) - new Date(a.workspace.lastOpenedAt || 0))[0];

        if (bestMatch?.module?._id) {
          return `/study-area?module=${bestMatch.module._id}&page=${bestMatch.workspace.currentPage || 1}`;
        }
      }
    } catch (error) {
      console.error('Failed to resolve sticky study target:', error);
    }

    return '/study-area';
  }, [location.pathname]);

  return (
    <div className="min-h-screen bg-gray-100 lg:flex">
      {sidebarOpen && (
        <button
          type="button"
          aria-label="Close navigation"
          className="fixed inset-0 z-40 bg-slate-950/35 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-[18rem] max-w-[85vw] flex-col border-r border-slate-200 bg-white shadow-[0_20px_60px_rgba(15,23,42,0.16)] transition-transform duration-200 lg:translate-x-0 lg:shadow-lg ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-5 lg:px-6">
          <BrandLogo
            imageClassName="h-16 w-16"
            titleClassName="text-2xl"
            subtitle="Plan smarter, study faster."
          />
          <button
            type="button"
            onClick={() => setSidebarOpen(false)}
            className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-medium text-slate-600 lg:hidden"
          >
            Close
          </button>
        </div>

        <nav className="flex-1 space-y-2 overflow-y-auto px-3 py-4">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `flex min-h-[56px] items-center rounded-2xl px-4 text-base font-medium transition ${
                  isActive
                    ? 'bg-blue-50 text-blue-700 shadow-sm ring-1 ring-blue-100'
                    : 'text-slate-700 hover:bg-slate-50'
                }`
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="border-t border-slate-100 p-4">
          <div className="mb-4 rounded-2xl bg-slate-50 px-4 py-4">
            <p className="font-medium text-slate-800">{user?.name}</p>
            <p className="mt-1 text-sm text-slate-500 break-words">{user?.email}</p>
          </div>
          <button
            onClick={handleLogout}
            className="min-h-[52px] w-full rounded-2xl bg-red-500 px-4 text-base font-semibold text-white transition hover:bg-red-600"
          >
            Logout
          </button>
        </div>
      </aside>

      <main className="min-h-screen flex-1 lg:ml-72">
        <div className="sticky top-0 z-30 border-b border-slate-200 bg-white/90 px-4 py-3 backdrop-blur lg:hidden">
          <div className="flex items-center justify-between gap-3">
            <BrandLogo
              className="gap-2"
              imageClassName="h-10 w-10"
              titleClassName="text-sm tracking-[0.18em]"
              subtitleClassName="text-[11px]"
              subtitle={user?.name || 'Student workspace'}
            />
            <button
              type="button"
              onClick={() => setSidebarOpen(true)}
              className="min-h-[48px] rounded-2xl border border-slate-200 px-4 text-sm font-semibold text-slate-700"
            >
              Menu
            </button>
          </div>
        </div>

        <div className="px-4 pb-28 pt-5 sm:px-6 lg:px-8 lg:pb-8 lg:pt-8">
          <Outlet />
        </div>

        <StudyAssistant />

        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/95 px-4 py-3 shadow-[0_-12px_30px_rgba(15,23,42,0.08)] backdrop-blur lg:hidden">
          <button
            type="button"
            onClick={() => navigate(stickyStudyTarget)}
            className="min-h-[56px] w-full rounded-2xl bg-blue-600 px-5 text-base font-semibold text-white shadow-[0_14px_30px_rgba(37,99,235,0.28)] transition hover:bg-blue-700"
          >
            Start Study
          </button>
        </div>
      </main>
    </div>
  );
}
