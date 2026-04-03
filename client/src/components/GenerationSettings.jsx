const MODE_OPTIONS = [
  { value: 'Class', label: 'Class' },
  { value: 'Quiz', label: 'Quiz' },
  { value: 'College', label: 'College' },
  { value: 'Board', label: 'Board' },
];

const DIFFICULTY_OPTIONS = [
  { value: 'Easy', label: 'Easy' },
  { value: 'Medium', label: 'Medium' },
  { value: 'Hard', label: 'Hard' },
  { value: 'Mixed', label: 'Mixed' },
];

const FORMAT_OPTIONS = [
  { value: 'Flashcards', label: 'Flashcards' },
  { value: 'Quiz', label: 'Quiz' },
  { value: 'Both', label: 'Both' },
];

function OptionGroup({ title, options, value, onChange, columns = 'sm:grid-cols-2' }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">{title}</p>
      <div className={`mt-3 grid gap-3 ${columns}`}>
        {options.map((option) => {
          const checked = value === option.value;
          return (
            <label
              key={option.value}
              className={`flex cursor-pointer items-center gap-3 rounded-2xl border px-4 py-3 text-sm transition ${
                checked
                  ? 'border-sky-400 bg-sky-50 text-sky-900 shadow-sm'
                  : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50'
              }`}
            >
              <input
                type="radio"
                name={title}
                value={option.value}
                checked={checked}
                onChange={(event) => onChange(event.target.value)}
                className="h-4 w-4 border-slate-300 text-sky-600 focus:ring-sky-500"
              />
              <span className="font-medium">{option.label}</span>
            </label>
          );
        })}
      </div>
    </div>
  );
}

export default function GenerationSettings({
  mode,
  difficulty,
  format,
  onModeChange,
  onDifficultyChange,
  onFormatChange,
  compact = false,
}) {
  return (
    <section className={`rounded-[28px] border border-slate-200 bg-slate-50/80 ${compact ? 'p-4' : 'p-5'}`}>
      <div className="mb-4">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">Generation Settings</p>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          Choose the study style, difficulty, and output format before generating cleaner exam-style questions and flashcards from this module.
        </p>
      </div>

      <div className="grid gap-5">
        <OptionGroup
          title="Mode"
          options={MODE_OPTIONS}
          value={mode}
          onChange={onModeChange}
          columns={compact ? 'sm:grid-cols-1' : 'sm:grid-cols-2'}
        />
        <OptionGroup
          title="Difficulty"
          options={DIFFICULTY_OPTIONS}
          value={difficulty}
          onChange={onDifficultyChange}
          columns="grid-cols-2 xl:grid-cols-4"
        />
        <OptionGroup
          title="Format"
          options={FORMAT_OPTIONS}
          value={format}
          onChange={onFormatChange}
          columns="grid-cols-1 sm:grid-cols-3"
        />
      </div>
    </section>
  );
}
