import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { getStudyStreakCount, loadStudyActivityDays, loadWorkspaceState } from '../utils/studyWorkspace';
import { loadQuizSession } from '../utils/quizSession';
import TaskReminderControls from '../components/TaskReminderControls';
import { useTaskReminders } from '../context/TaskReminderContext';

export default function Dashboard() {
  const { settings, setSoundEnabled } = useTaskReminders();
  const [modules, setModules] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [studyGoal, setStudyGoal] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [goalsInput, setGoalsInput] = useState('');
  const [updatingGoals, setUpdatingGoals] = useState(false);
  const navigate = useNavigate();
  const storedUser = (() => {
    try {
      return JSON.parse(localStorage.getItem('user') || 'null');
    } catch {
      return null;
    }
  })();

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
          fetch('/api/tasks', { headers: { 'x-auth-token': token } }),
          fetch('/goals', { headers: { 'x-auth-token': token } }),
        ]);

        if (modulesRes.status === 401 || tasksRes.status === 401 || goalsRes.status === 401) {
          localStorage.removeItem('token');
          localStorage.removeItem('user');
          navigate('/login');
          return;
        }

        if (!modulesRes.ok || !tasksRes.ok || !goalsRes.ok) {
          throw new Error('Failed to fetch some data');
        }

        let modulesData;
        let tasksData;
        let goalsData;
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
          'x-auth-token': token,
        },
        body: JSON.stringify({ dailyGoal: parseInt(goalsInput, 10) }),
      });

      const updated = await res.json();
      setStudyGoal(updated);
    } catch (err) {
      console.error('Error updating goal:', err);
    } finally {
      setUpdatingGoals(false);
    }
  };

  if (loading) return <div className="py-10 text-center">Loading...</div>;
  if (error) return <div className="py-10 text-center text-red-600">{error}</div>;

  const formatTodayKey = (value = new Date()) => {
    const date = value instanceof Date ? value : new Date(value);
    const year = date.getFullYear();
    const month = `${date.getMonth() + 1}`.padStart(2, '0');
    const day = `${date.getDate()}`.padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const getTaskDateKey = (value) => {
    if (!value) return null;
    if (typeof value === 'string') {
      const matchedDate = value.match(/^\d{4}-\d{2}-\d{2}/);
      if (matchedDate) return matchedDate[0];
    }

    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return null;
    return formatTodayKey(parsed);
  };

  const completedTasks = tasks.filter((t) => t.completed).length;
  const pendingTasks = tasks.filter((t) => !t.completed);
  const todayKey = formatTodayKey();
  const todaysTasks = tasks.filter((task) => getTaskDateKey(task.deadline) === todayKey);
  const upcomingDeadlines = tasks
    .filter((task) => task.deadline && !task.completed)
    .sort((a, b) => new Date(a.deadline) - new Date(b.deadline))
    .slice(0, 5);

  const goalProgress = studyGoal ? (studyGoal.completedToday / studyGoal.dailyGoal) * 100 : 0;
  const localActivityDays = loadStudyActivityDays();
  const fallbackActivityDays = [
    ...modules
      .map((module) => loadWorkspaceState(module._id)?.lastOpenedAt)
      .filter(Boolean)
      .map((value) => getTaskDateKey(value)),
    ...modules
      .map((module) => loadQuizSession(module._id)?.updatedAt)
      .filter(Boolean)
      .map((value) => getTaskDateKey(value)),
  ].filter(Boolean);
  const streakDays = Math.max(studyGoal?.streak || 0, getStudyStreakCount(localActivityDays.length ? localActivityDays : fallbackActivityDays));
  const streakMessage =
    streakDays >= 3 ? `${streakDays}-day streak -> keep going!` : `${streakDays}-day streak starts here.`;
  const streakNudge =
    streakDays >= 3 ? "Don't break your streak 😤" : 'Show up today and start building momentum.';
  const recentModules = modules.slice(0, 3);
  const lastStudiedModule = modules
    .map((module) => ({
      module,
      workspace: loadWorkspaceState(module._id),
    }))
    .filter(({ workspace }) => workspace.lastOpenedAt)
    .sort((a, b) => new Date(b.workspace.lastOpenedAt) - new Date(a.workspace.lastOpenedAt))[0];
  const quizInProgress = modules
    .map((module) => ({
      module,
      session: loadQuizSession(module._id),
    }))
    .filter(({ session }) => session?.inProgress)
    .sort((a, b) => new Date(b.session.updatedAt) - new Date(a.session.updatedAt))[0];
  const primaryCta = quizInProgress
    ? {
        label: 'Continue Last Session',
        helper: `Pick up your quiz in ${quizInProgress.module.title}.`,
        action: () => navigate(`/quiz/${quizInProgress.module._id}`),
      }
    : lastStudiedModule
      ? {
          label: 'Start Studying',
          helper: `Resume ${lastStudiedModule.module.title} from page ${lastStudiedModule.workspace.currentPage || 1}.`,
          action: () =>
            navigate(
              `/study-area?module=${lastStudiedModule.module._id}&page=${lastStudiedModule.workspace.currentPage || 1}`,
            ),
        }
      : {
          label: 'Start Studying',
          helper: 'Open your modules workspace and jump into your next study block.',
          action: () => navigate('/modules'),
        };
  const currentHour = new Date().getHours();
  const greeting =
    currentHour < 12 ? 'Good morning' : currentHour < 18 ? 'Good afternoon' : 'Good evening';
  const firstName = storedUser?.name?.trim()?.split(/\s+/)?.[0] || 'there';
  const activityCandidates = [
    lastStudiedModule
      ? {
          type: 'study',
          title: lastStudiedModule.module.title,
          when: lastStudiedModule.workspace.lastOpenedAt,
          detail: `Viewed page ${lastStudiedModule.workspace.currentPage || 1}`,
        }
      : null,
    quizInProgress
      ? {
          type: 'quiz',
          title: quizInProgress.module.title,
          when: quizInProgress.session.updatedAt,
          detail: `${Object.keys(quizInProgress.session.answers || {}).length} answers saved`,
        }
      : null,
  ].filter(Boolean);
  const latestActivity = activityCandidates.sort((a, b) => new Date(b.when) - new Date(a.when))[0] || null;
  const suggestedNextStep = quizInProgress
    ? {
        title: `Continue ${quizInProgress.module.title}`,
        detail: `Resume your in-progress quiz with ${Object.keys(quizInProgress.session.answers || {}).length} answers already saved.`,
      }
    : lastStudiedModule
      ? {
          title: `Continue ${lastStudiedModule.module.title}`,
          detail: `Return to page ${lastStudiedModule.workspace.currentPage || 1} and keep building momentum.`,
        }
      : modules[0]
        ? {
            title: `Start ${modules[0].title}`,
            detail: 'Open your first module and begin your next study block.',
          }
        : {
            title: 'Upload a module',
            detail: 'Add study material to get personalized recommendations and progress tracking.',
          };

  const formatActivityTime = (value) => {
    if (!value) return 'No recent activity yet';

    const date = new Date(value);
    const now = new Date();
    const diffMinutes = Math.round((now - date) / 60000);

    if (diffMinutes < 1) return 'Just now';
    if (diffMinutes < 60) return `${diffMinutes} min ago`;
    if (diffMinutes < 1440) return `${Math.round(diffMinutes / 60)} hr ago`;
    return date.toLocaleDateString();
  };

  const statCards = [
    {
      label: 'Total Modules',
      value: modules.length,
      valueClass: 'text-blue-600',
      accentClass: 'border-blue-100 from-blue-100 to-sky-50',
    },
    {
      label: 'Total Tasks',
      value: tasks.length,
      valueClass: 'text-violet-600',
      accentClass: 'border-violet-100 from-violet-100 to-fuchsia-50',
    },
    {
      label: 'Completed',
      value: completedTasks,
      valueClass: 'text-emerald-600',
      accentClass: 'border-emerald-100 from-emerald-100 to-green-50',
    },
    {
      label: 'Pending',
      value: pendingTasks.length,
      valueClass: 'text-amber-600',
      accentClass: 'border-amber-100 from-amber-100 to-orange-50',
    },
    {
      label: "Today's Tasks",
      value: todaysTasks.length,
      valueClass: 'text-indigo-600',
      accentClass: 'border-indigo-100 from-indigo-100 to-blue-50',
    },
    {
      label: 'Study Streak',
      value: `${studyGoal?.streak || 0} days`,
      valueClass: 'text-rose-600',
      accentClass: 'border-rose-100 from-rose-100 to-pink-50',
    },
  ];

  return (
    <div>
      <h1 className="mb-10 text-3xl font-bold text-gray-800">Dashboard</h1>

      <div className="mb-10 overflow-hidden rounded-3xl border border-sky-200 bg-[radial-gradient(circle_at_top_left,_rgba(125,211,252,0.32),_transparent_38%),linear-gradient(135deg,_#0f172a_0%,_#1d4ed8_55%,_#38bdf8_100%)] p-8 text-white shadow-[0_24px_80px_rgba(29,78,216,0.28)]">
        <p className="text-xs font-semibold uppercase tracking-[0.32em] text-sky-100">Study Flow</p>
        <div className="mt-4 flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-2xl">
            <h2 className="text-3xl font-semibold tracking-tight">Reduce the setup. Get straight into learning.</h2>
            <p className="mt-3 text-base text-sky-100">{primaryCta.helper}</p>
          </div>
          <button
            onClick={primaryCta.action}
            className="inline-flex items-center justify-center rounded-2xl bg-white px-6 py-4 text-base font-semibold text-sky-900 transition hover:bg-sky-50"
          >
            {primaryCta.label}
          </button>
        </div>
        <div className="mt-6 grid gap-4 xl:grid-cols-[1.4fr_0.8fr_0.8fr]">
          <div className="rounded-2xl border border-white/20 bg-white/12 px-5 py-5 text-left backdrop-blur-sm">
            <p className="text-sm font-medium text-sky-100">
              {greeting}, {firstName}. Ready to continue {lastStudiedModule?.module.title || quizInProgress?.module.title || 'studying'}?
            </p>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <div className="rounded-2xl bg-white/10 px-4 py-4">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-sky-100/80">Last Activity</p>
                <p className="mt-3 text-base font-semibold text-white">
                  {latestActivity ? latestActivity.title : 'No recent activity'}
                </p>
                <p className="mt-1 text-sm text-sky-100">
                  {latestActivity ? `${latestActivity.detail} · ${formatActivityTime(latestActivity.when)}` : 'Start a module or quiz to see your recent progress here.'}
                </p>
              </div>
              <div className="rounded-2xl bg-white/10 px-4 py-4">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-sky-100/80">Suggested Next Step</p>
                <p className="mt-3 text-base font-semibold text-white">{suggestedNextStep.title}</p>
                <p className="mt-1 text-sm text-sky-100">{suggestedNextStep.detail}</p>
              </div>
            </div>
          </div>
          <button
            onClick={() => {
              if (lastStudiedModule) {
                navigate(
                  `/study-area?module=${lastStudiedModule.module._id}&page=${lastStudiedModule.workspace.currentPage || 1}`,
                );
                return;
              }
              navigate('/study-area');
            }}
            className="rounded-2xl border border-white/25 bg-white/10 px-5 py-4 text-left transition hover:bg-white/15"
          >
            <p className="text-sm font-semibold text-white">Resume last module</p>
            <p className="mt-1 text-sm text-sky-100">
              {lastStudiedModule
                ? `${lastStudiedModule.module.title} • Page ${lastStudiedModule.workspace.currentPage || 1}`
                : 'Open your study area and choose a module to continue.'}
            </p>
          </button>
          <button
            onClick={() => {
              if (quizInProgress) {
                navigate(`/quiz/${quizInProgress.module._id}`);
                return;
              }
              navigate('/quiz-stats');
            }}
            className="rounded-2xl border border-white/25 bg-white/10 px-5 py-4 text-left transition hover:bg-white/15"
          >
            <p className="text-sm font-semibold text-white">Continue quiz (in progress)</p>
            <p className="mt-1 text-sm text-sky-100">
              {quizInProgress
                ? `${quizInProgress.module.title} • ${Object.keys(quizInProgress.session.answers || {}).length} answered so far`
                : 'No quiz is currently in progress. Review your results and start another one anytime.'}
            </p>
          </button>
        </div>
      </div>

      <div className="mb-10 grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-6">
        {statCards.map((card) => (
          <div
            key={card.label}
            className={`rounded-2xl border bg-gradient-to-br ${card.accentClass} p-5 shadow-[0_16px_40px_rgba(15,23,42,0.06)] transition duration-200 hover:-translate-y-1`}
          >
            <div className="mb-4">
              <p className="text-sm font-semibold text-gray-500">{card.label}</p>
            </div>
            <p className={`text-2xl font-bold ${card.valueClass}`}>{card.value}</p>
          </div>
        ))}
      </div>

      <div className="mb-10 grid grid-cols-1 gap-7 lg:grid-cols-2">
        <div className="rounded-2xl border border-emerald-100 bg-white p-7 shadow-[0_20px_50px_rgba(15,23,42,0.07)]">
          <h2 className="text-xl font-semibold text-gray-800">Daily Study Goal</h2>

          <div className="mt-6 space-y-6">
            <div className="rounded-2xl bg-emerald-50/70 p-5">
              <div className="mb-3 flex items-center justify-between gap-4">
                <p className="text-sm text-gray-600">Today's Progress</p>
                <p className="text-sm font-semibold text-gray-800">
                  {Math.min(studyGoal?.completedToday || 0, studyGoal?.dailyGoal || 1).toFixed(1)} / {studyGoal?.dailyGoal || 2} hours
                </p>
              </div>
              <div className="h-3 w-full overflow-hidden rounded-full bg-emerald-100">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-teal-400 transition-all"
                  style={{ width: `${Math.min(goalProgress, 100)}%` }}
                ></div>
              </div>
            </div>

            <div className="flex gap-3 pt-1">
              <input
                type="number"
                value={goalsInput}
                onChange={(e) => setGoalsInput(e.target.value)}
                min="0"
                max="24"
                className="flex-1 rounded-xl border border-gray-200 px-4 py-3 outline-none focus:ring-2 focus:ring-emerald-400"
                placeholder="Hours"
              />
              <button
                onClick={updateDailyGoal}
                disabled={updatingGoals}
                className="rounded-xl bg-emerald-600 px-5 py-3 font-medium text-white shadow-sm transition hover:bg-emerald-700 disabled:opacity-50"
              >
                Set Goal
              </button>
            </div>

            <div className="grid gap-3 border-t border-emerald-100 pt-5 sm:grid-cols-2">
              <div className="rounded-2xl bg-slate-50 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">Total Study Hours</p>
                <p className="mt-2 text-lg font-bold text-gray-800">{(studyGoal?.totalStudyHours || 0).toFixed(1)}</p>
              </div>
              <div className="rounded-2xl bg-rose-50 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-rose-500">Current Streak</p>
                <p className="mt-2 text-lg font-bold text-rose-600">{streakDays} days</p>
                <p className="mt-2 text-sm font-semibold text-rose-700">{streakMessage}</p>
                <p className="mt-1 text-sm text-rose-600">{streakNudge}</p>
              </div>
            </div>

          </div>
        </div>

        <div className="rounded-2xl border border-amber-100 bg-white p-7 shadow-[0_20px_50px_rgba(15,23,42,0.07)]">
          <div className="mb-5 flex items-center justify-between gap-4">
            <h2 className="text-xl font-semibold text-gray-800">Today's Tasks</h2>
            <Link to="/tasks" className="text-sm text-blue-600 hover:underline">
              View All
            </Link>
          </div>

          {todaysTasks.length === 0 ? (
            <p className="rounded-2xl bg-amber-50 px-4 py-10 text-center text-gray-500">No tasks due today. Well done.</p>
          ) : (
            <div className="space-y-3">
              {todaysTasks.map((task) => (
                <div key={task._id} className="rounded-2xl border border-orange-100 bg-orange-50/60 p-4 shadow-sm">
                  <div className="flex items-center gap-3">
                    <div
                      className={`h-3 w-3 flex-shrink-0 rounded-full ${
                        task.priority === 'High'
                          ? 'bg-red-500'
                          : task.priority === 'Medium'
                            ? 'bg-yellow-500'
                            : 'bg-green-500'
                      }`}
                    ></div>
                    <span className={`flex-1 ${task.completed ? 'line-through text-gray-500' : 'text-gray-800'}`}>
                      {task.title}
                    </span>
                    <span
                      className={`rounded px-2 py-1 text-xs font-medium ${
                        task.priority === 'High'
                          ? 'bg-red-100 text-red-800'
                          : task.priority === 'Medium'
                            ? 'bg-yellow-100 text-yellow-800'
                            : 'bg-green-100 text-green-800'
                      }`}
                    >
                      {task.priority}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-7 lg:grid-cols-2">
        <div className="rounded-2xl border border-sky-100 bg-white p-7 shadow-[0_20px_50px_rgba(15,23,42,0.07)]">
          <div className="mb-5 flex items-center justify-between gap-4">
            <h2 className="text-xl font-semibold text-gray-800">Recent Modules</h2>
            <Link to="/modules" className="text-sm text-blue-600 hover:underline">
              View All
            </Link>
          </div>
          {recentModules.length === 0 ? (
            <p className="rounded-2xl bg-sky-50 px-4 py-10 text-center text-gray-500">
              No modules yet.{' '}
              <Link to="/modules" className="text-blue-600 hover:underline">
                Upload one
              </Link>
            </p>
          ) : (
            <div className="space-y-4">
              {recentModules.map((module) => (
                <Link
                  key={module._id}
                  to={`/modules/${module._id}`}
                  className="block rounded-2xl border border-sky-100 bg-sky-50/70 p-4 shadow-sm transition duration-200 hover:-translate-y-1 hover:bg-white hover:shadow-md"
                >
                  <h3 className="truncate font-medium text-gray-800">{module.title}</h3>
                  <p className="mt-2 text-xs text-gray-500">{module.quizQuestions?.length || 0} quiz questions</p>
                </Link>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-rose-100 bg-white p-7 shadow-[0_20px_50px_rgba(15,23,42,0.07)]">
          <div className="mb-5 flex items-center justify-between gap-4">
            <div>
              <h2 className="text-xl font-semibold text-gray-800">Upcoming Deadlines</h2>
              <p className="mt-1 text-sm text-slate-500">Stay on top of due dates with soft reminders instead of alarms.</p>
            </div>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setSoundEnabled(!settings.soundEnabled)}
                className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                  settings.soundEnabled
                    ? 'border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100'
                    : 'border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100'
                }`}
              >
                Reminder Sound {settings.soundEnabled ? 'On' : 'Off'}
              </button>
              <Link to="/tasks" className="text-sm text-blue-600 hover:underline">
                View All
              </Link>
            </div>
          </div>
          {upcomingDeadlines.length === 0 ? (
            <p className="rounded-2xl bg-rose-50 px-4 py-10 text-center text-gray-500">No upcoming deadlines. Great job!</p>
          ) : (
            <div className="space-y-3">
              {upcomingDeadlines.map((task) => (
                <div
                  key={task._id}
                  className="rounded-3xl border border-rose-100 bg-[linear-gradient(180deg,_rgba(255,255,255,0.96)_0%,_rgba(255,241,242,0.74)_100%)] p-4 shadow-[0_14px_32px_rgba(15,23,42,0.06)]"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-base font-semibold text-slate-800">{task.title}</p>
                      <p className="mt-1 text-sm text-slate-500">
                        Due {new Date(task.deadline).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                      </p>
                    </div>
                    <span
                      className={`rounded-full px-3 py-1 text-xs font-semibold ${
                        task.priority === 'High'
                          ? 'bg-rose-100 text-rose-700'
                          : task.priority === 'Medium'
                            ? 'bg-amber-100 text-amber-700'
                            : 'bg-emerald-100 text-emerald-700'
                      }`}
                    >
                      {task.priority}
                    </span>
                  </div>
                  <div className="mt-4">
                    <TaskReminderControls task={task} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="mb-8 mt-10">
        <button
          onClick={() => navigate('/quiz-stats')}
          className="w-full rounded-2xl bg-gradient-to-r from-violet-500 to-fuchsia-500 p-8 text-white shadow-[0_22px_60px_rgba(168,85,247,0.28)] transition duration-200 hover:-translate-y-1 hover:shadow-[0_28px_70px_rgba(168,85,247,0.34)]"
        >
          <div className="text-left">
            <h3 className="mb-2 text-2xl font-bold">View Quiz Performance Dashboard</h3>
            <p className="text-purple-100">See your quiz attempt history, scores, and performance trends across all modules</p>
          </div>
        </button>
      </div>
    </div>
  );
}
