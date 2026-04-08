import { createContext, useContext, useEffect, useRef, useState } from 'react';

const TaskReminderContext = createContext(null);

const STORAGE_KEY = 'metis-task-reminders:v1';
const DEFAULT_INTERVALS = ['1d', '1h', '15m', 'overdue'];

export const REMINDER_INTERVALS = [
  { id: '1d', label: '1 day before', shortLabel: '1 day', offsetMs: 24 * 60 * 60 * 1000 },
  { id: '1h', label: '1 hour before', shortLabel: '1 hour', offsetMs: 60 * 60 * 1000 },
  { id: '15m', label: '15 minutes before', shortLabel: '15 min', offsetMs: 15 * 60 * 1000 },
  { id: 'overdue', label: 'When overdue', shortLabel: 'Overdue', offsetMs: 0 },
];

const DEFAULT_SETTINGS = {
  soundEnabled: false,
};

const readReminderStore = () => {
  if (typeof window === 'undefined') {
    return { settings: DEFAULT_SETTINGS, tasks: {} };
  }

  try {
    const parsed = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || 'null');
    return {
      settings: { ...DEFAULT_SETTINGS, ...(parsed?.settings || {}) },
      tasks: parsed?.tasks || {},
    };
  } catch {
    return { settings: DEFAULT_SETTINGS, tasks: {} };
  }
};

const writeReminderStore = (store) => {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
};

const isDateOnlyValue = (value) => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);

export const getTaskDeadlineDate = (value) => {
  if (!value) return null;

  if (isDateOnlyValue(value)) {
    const [year, month, day] = value.split('-').map(Number);
    return new Date(year, month - 1, day, 23, 59, 0, 0);
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
};

const getTaskDeadlineKey = (task) => {
  const deadline = getTaskDeadlineDate(task?.deadline);
  return deadline ? deadline.toISOString() : 'no-deadline';
};

const startOfDay = (value) => new Date(value.getFullYear(), value.getMonth(), value.getDate());

const getSmartStatus = (task) => {
  const deadline = getTaskDeadlineDate(task?.deadline);
  if (!deadline) {
    return { label: 'No date', tone: 'bg-slate-100 text-slate-600 border-slate-200' };
  }

  const now = new Date();
  const today = startOfDay(now);
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);
  const taskDay = startOfDay(deadline);

  if (task.completed) {
    return { label: 'Done', tone: 'bg-emerald-100 text-emerald-700 border-emerald-200' };
  }

  if (deadline <= now) {
    return { label: 'Overdue', tone: 'bg-rose-100 text-rose-700 border-rose-200' };
  }

  if (taskDay.getTime() === today.getTime()) {
    return { label: 'Today', tone: 'bg-amber-100 text-amber-700 border-amber-200' };
  }

  if (taskDay.getTime() === tomorrow.getTime()) {
    return { label: 'Tomorrow', tone: 'bg-blue-100 text-blue-700 border-blue-200' };
  }

  return { label: deadline.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }), tone: 'bg-slate-100 text-slate-600 border-slate-200' };
};

const playReminderTone = () => {
  if (typeof window === 'undefined') return;

  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return;

  const context = new AudioContextClass();
  const oscillator = context.createOscillator();
  const gain = context.createGain();

  oscillator.type = 'sine';
  oscillator.frequency.value = 880;
  gain.gain.value = 0.0001;

  oscillator.connect(gain);
  gain.connect(context.destination);

  const now = context.currentTime;
  gain.gain.exponentialRampToValueAtTime(0.04, now + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.3);

  oscillator.start(now);
  oscillator.stop(now + 0.32);
  oscillator.onended = () => {
    context.close().catch(() => {});
  };
};

const requestWithApiFallback = async (path, options = {}) => {
  const bases = [''];

  if (typeof window !== 'undefined') {
    const isLocalhost = ['localhost', '127.0.0.1'].includes(window.location.hostname);
    if (isLocalhost) {
      bases.push('http://localhost:5000');
    }
  }

  let lastError = null;

  for (let index = 0; index < bases.length; index += 1) {
    const base = bases[index];
    try {
      const response = await fetch(`${base}${path}`, options);
      const contentType = response.headers.get('content-type') || '';
      const shouldTryNextBase =
        index < bases.length - 1 &&
        (response.status === 404 ||
          response.status === 502 ||
          response.status === 503 ||
          response.status === 504 ||
          contentType.includes('text/html'));

      if (shouldTryNextBase) {
        continue;
      }

      return response;
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError || new Error('Network request failed');
};

export function TaskReminderProvider({ children }) {
  const initialStore = readReminderStore();
  const [settings, setSettings] = useState(initialStore.settings);
  const [taskConfigs, setTaskConfigs] = useState(initialStore.tasks);
  const [tasks, setTasks] = useState([]);
  const [toasts, setToasts] = useState([]);
  const toneTimeoutRef = useRef(null);

  useEffect(() => {
    writeReminderStore({ settings, tasks: taskConfigs });
  }, [settings, taskConfigs]);

  useEffect(() => {
    let cancelled = false;

    const fetchTasks = async () => {
      const token = window.localStorage.getItem('token');
      if (!token) {
        if (!cancelled) setTasks([]);
        return;
      }

      try {
        const response = await requestWithApiFallback('/api/tasks', {
          headers: { 'x-auth-token': token },
        });

        if (!response.ok) {
          if (response.status === 401 && !cancelled) {
            setTasks([]);
          }
          return;
        }

        const data = await response.json();
        if (!cancelled) {
          setTasks(Array.isArray(data) ? data : []);
        }
      } catch (error) {
        console.error('Reminder task refresh failed:', error);
      }
    };

    fetchTasks();
    const intervalId = window.setInterval(fetchTasks, 60000);
    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, []);

  useEffect(() => {
    setTaskConfigs((current) => {
      const next = { ...current };
      const activeTaskIds = new Set(tasks.map((task) => task._id));
      let changed = false;

      tasks.forEach((task) => {
        const existing = current[task._id];
        const deadlineKey = getTaskDeadlineKey(task);

        if (!existing) {
          next[task._id] = {
            enabledIntervals: [...DEFAULT_INTERVALS],
            deliveredAt: {},
            lastDeadlineKey: deadlineKey,
          };
          changed = true;
          return;
        }

        if (existing.lastDeadlineKey !== deadlineKey) {
          next[task._id] = {
            ...existing,
            deliveredAt: {},
            lastDeadlineKey: deadlineKey,
          };
          changed = true;
        }
      });

      Object.keys(current).forEach((taskId) => {
        if (!activeTaskIds.has(taskId)) {
          delete next[taskId];
          changed = true;
        }
      });

      return changed ? next : current;
    });
  }, [tasks]);

  useEffect(() => {
    const evaluateReminders = () => {
      const now = Date.now();
      const freshToasts = [];
      let shouldPlayTone = false;

      setTaskConfigs((current) => {
        let changed = false;
        const next = { ...current };

        tasks.forEach((task) => {
          const deadline = getTaskDeadlineDate(task.deadline);
          if (!deadline || task.completed) return;

          const config = current[task._id] || {
            enabledIntervals: [...DEFAULT_INTERVALS],
            deliveredAt: {},
            lastDeadlineKey: getTaskDeadlineKey(task),
          };

          REMINDER_INTERVALS.forEach((intervalOption) => {
            if (!config.enabledIntervals?.includes(intervalOption.id)) return;
            if (config.deliveredAt?.[intervalOption.id]) return;

            const triggerAt =
              intervalOption.id === 'overdue'
                ? deadline.getTime()
                : deadline.getTime() - intervalOption.offsetMs;

            if (now < triggerAt) return;

            const deliveredAt = new Date(now).toISOString();
            const updatedConfig = next[task._id] || config;
            next[task._id] = {
              ...updatedConfig,
              deliveredAt: {
                ...(updatedConfig.deliveredAt || {}),
                [intervalOption.id]: deliveredAt,
              },
            };
            changed = true;
            freshToasts.push({
              id: `${task._id}:${intervalOption.id}`,
              title: task.title,
              body:
                intervalOption.id === 'overdue'
                  ? 'This deadline has passed.'
                  : `${intervalOption.label} reminder`,
              tone:
                intervalOption.id === 'overdue'
                  ? 'border-rose-200 bg-rose-50 text-rose-800'
                  : 'border-blue-200 bg-blue-50 text-slate-800',
            });
            shouldPlayTone = shouldPlayTone || settings.soundEnabled;
          });
        });

        if (freshToasts.length > 0) {
          setToasts((existing) => {
            const existingIds = new Set(existing.map((toast) => toast.id));
            const uniqueToasts = freshToasts.filter((toast) => !existingIds.has(toast.id));
            return [...existing, ...uniqueToasts].slice(-5);
          });
        }

        return changed ? next : current;
      });

      if (shouldPlayTone) {
        if (toneTimeoutRef.current) {
          window.clearTimeout(toneTimeoutRef.current);
        }
        toneTimeoutRef.current = window.setTimeout(() => {
          playReminderTone();
        }, 50);
      }
    };

    evaluateReminders();
    const intervalId = window.setInterval(evaluateReminders, 30000);
    return () => {
      window.clearInterval(intervalId);
      if (toneTimeoutRef.current) {
        window.clearTimeout(toneTimeoutRef.current);
      }
    };
  }, [settings.soundEnabled, tasks]);

  useEffect(() => {
    if (!toasts.length) return undefined;

    const timeoutId = window.setTimeout(() => {
      setToasts((current) => current.slice(1));
    }, 5500);

    return () => window.clearTimeout(timeoutId);
  }, [toasts]);

  const toggleReminderInterval = (taskId, intervalId) => {
    setTaskConfigs((current) => {
      const existing = current[taskId] || {
        enabledIntervals: [...DEFAULT_INTERVALS],
        deliveredAt: {},
        lastDeadlineKey: 'unknown',
      };

      const enabledSet = new Set(existing.enabledIntervals || DEFAULT_INTERVALS);
      if (enabledSet.has(intervalId)) {
        enabledSet.delete(intervalId);
      } else {
        enabledSet.add(intervalId);
      }

      return {
        ...current,
        [taskId]: {
          ...existing,
          enabledIntervals: REMINDER_INTERVALS.map((option) => option.id).filter((id) => enabledSet.has(id)),
        },
      };
    });
  };

  const setSoundEnabled = (enabled) => {
    setSettings((current) => ({ ...current, soundEnabled: enabled }));
  };

  const getTaskReminderConfig = (task) => {
    const stored = taskConfigs[task._id];
    return stored || {
      enabledIntervals: [...DEFAULT_INTERVALS],
      deliveredAt: {},
      lastDeadlineKey: getTaskDeadlineKey(task),
    };
  };

  const getTaskReminderSummary = (task) => {
    const deadline = getTaskDeadlineDate(task?.deadline);
    const config = getTaskReminderConfig(task);
    const enabledIntervals = config.enabledIntervals || DEFAULT_INTERVALS;

    if (!deadline) {
      return {
        label: 'Add a due date to enable reminders',
        tone: 'text-slate-500',
      };
    }

    if (task.completed) {
      return {
        label: 'Task completed',
        tone: 'text-emerald-600',
      };
    }

    const now = Date.now();
    if (deadline.getTime() <= now) {
      return config.deliveredAt?.overdue
        ? { label: 'Overdue reminder sent', tone: 'text-rose-600' }
        : { label: 'Waiting to mark overdue', tone: 'text-rose-600' };
    }

    const nextInterval = REMINDER_INTERVALS
      .filter((intervalOption) => intervalOption.id !== 'overdue' && enabledIntervals.includes(intervalOption.id))
      .map((intervalOption) => ({
        ...intervalOption,
        triggerAt: deadline.getTime() - intervalOption.offsetMs,
      }))
      .filter((intervalOption) => !config.deliveredAt?.[intervalOption.id] && intervalOption.triggerAt > now)
      .sort((a, b) => a.triggerAt - b.triggerAt)[0];

    if (nextInterval) {
      return {
        label: `Next reminder: ${nextInterval.label}`,
        tone: 'text-blue-700',
      };
    }

    return enabledIntervals.includes('overdue')
      ? { label: 'Only overdue reminder remains', tone: 'text-amber-700' }
      : { label: 'All scheduled reminders sent', tone: 'text-slate-500' };
  };

  const dismissToast = (toastId) => {
    setToasts((current) => current.filter((toast) => toast.id !== toastId));
  };

  return (
    <TaskReminderContext.Provider
      value={{
        REMINDER_INTERVALS,
        settings,
        tasks,
        setSoundEnabled,
        toggleReminderInterval,
        getTaskReminderConfig,
        getTaskReminderSummary,
        getTaskSmartStatus: getSmartStatus,
      }}
    >
      {children}
      <div className="pointer-events-none fixed right-4 top-4 z-30 flex w-full max-w-sm flex-col gap-3">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`rounded-2xl border px-4 py-3 shadow-[0_16px_40px_rgba(15,23,42,0.12)] backdrop-blur ${toast.tone}`}
          >
            <div className="flex items-start gap-3">
              <div className="mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-white/80">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17H9.143m10.286 0H4.571m14.858 0c-.953-.93-1.5-2.26-1.5-3.643V11a5.929 5.929 0 0 0-3.214-5.286A2.786 2.786 0 0 0 12 4.286a2.786 2.786 0 0 0-2.714 1.428A5.929 5.929 0 0 0 6.071 11v2.357c0 1.383-.547 2.714-1.5 3.643M13.714 17a1.714 1.714 0 1 1-3.428 0" />
                </svg>
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">{toast.title}</p>
                <p className="mt-1 text-sm opacity-80">{toast.body}</p>
              </div>
              <button
                type="button"
                onClick={() => dismissToast(toast.id)}
                className="pointer-events-auto rounded-full px-2 py-1 text-xs font-medium opacity-70 transition hover:bg-white/70 hover:opacity-100"
              >
                Close
              </button>
            </div>
          </div>
        ))}
      </div>
    </TaskReminderContext.Provider>
  );
}

export const useTaskReminders = () => {
  const context = useContext(TaskReminderContext);
  if (!context) {
    throw new Error('useTaskReminders must be used within a TaskReminderProvider');
  }

  return context;
};
