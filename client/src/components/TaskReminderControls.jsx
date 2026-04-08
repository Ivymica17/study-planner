import { REMINDER_INTERVALS, getTaskDeadlineDate, useTaskReminders } from '../context/TaskReminderContext';

function BellIcon({ className = '' }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={className} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17H9.143m10.286 0H4.571m14.858 0c-.953-.93-1.5-2.26-1.5-3.643V11a5.929 5.929 0 0 0-3.214-5.286A2.786 2.786 0 0 0 12 4.286a2.786 2.786 0 0 0-2.714 1.428A5.929 5.929 0 0 0 6.071 11v2.357c0 1.383-.547 2.714-1.5 3.643M13.714 17a1.714 1.714 0 1 1-3.428 0" />
    </svg>
  );
}

const formatDeadlineLabel = (deadline) => {
  if (!deadline) return 'No due date';
  return deadline.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
};

export default function TaskReminderControls({ task, compact = false, showSoundToggle = false }) {
  const { settings, setSoundEnabled, toggleReminderInterval, getTaskReminderConfig, getTaskReminderSummary, getTaskSmartStatus } =
    useTaskReminders();
  const reminderConfig = getTaskReminderConfig(task);
  const reminderSummary = getTaskReminderSummary(task);
  const status = getTaskSmartStatus(task);
  const deadline = getTaskDeadlineDate(task.deadline);
  const wrapperClasses = compact
    ? 'rounded-2xl border border-slate-200/80 bg-white/80 px-3 py-3'
    : 'rounded-2xl border border-blue-100 bg-white/85 px-4 py-4';

  return (
    <div className={wrapperClasses}>
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-2 rounded-full bg-blue-50 px-3 py-1.5 text-sm font-medium text-blue-800">
          <BellIcon className="h-4 w-4" />
          <span>Reminders</span>
        </div>
        <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${status.tone}`}>{status.label}</span>
        <span className="text-xs text-slate-500">{formatDeadlineLabel(deadline)}</span>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {REMINDER_INTERVALS.map((intervalOption) => {
          const enabled = reminderConfig.enabledIntervals?.includes(intervalOption.id);
          return (
            <button
              key={intervalOption.id}
              type="button"
              onClick={() => toggleReminderInterval(task._id, intervalOption.id)}
              disabled={!task.deadline || task.completed}
              className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                enabled
                  ? 'border-blue-200 bg-blue-50 text-blue-800'
                  : 'border-slate-200 bg-slate-50 text-slate-500'
              } ${!task.deadline || task.completed ? 'cursor-not-allowed opacity-60' : 'hover:border-blue-300 hover:bg-blue-100/70'}`}
            >
              {intervalOption.shortLabel}
            </button>
          );
        })}
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <p className={`text-sm ${reminderSummary.tone}`}>{reminderSummary.label}</p>
        {showSoundToggle && (
          <button
            type="button"
            onClick={() => setSoundEnabled(!settings.soundEnabled)}
            className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
              settings.soundEnabled
                ? 'border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100'
                : 'border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100'
            }`}
          >
            Sound {settings.soundEnabled ? 'On' : 'Off'}
          </button>
        )}
      </div>
    </div>
  );
}
