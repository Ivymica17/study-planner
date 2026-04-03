const OUTPUT_TABS = [
  { id: 'summary', label: 'Generate Summary' },
  { id: 'quiz', label: 'Turn Into Quiz' },
  { id: 'flashcards', label: 'Turn Into Flashcards' },
];

function formatSnippet(text, limit = 180) {
  const value = String(text || '').replace(/\s+/g, ' ').trim();
  if (value.length <= limit) return value;
  return `${value.slice(0, limit).trim()}...`;
}

function EmptyState({ title, description }) {
  return (
    <div className="rounded-[28px] border border-dashed border-slate-300 bg-white/80 px-5 py-6 text-sm text-slate-500">
      <div className="font-semibold text-slate-700">{title}</div>
      <div className="mt-2 leading-6">{description}</div>
    </div>
  );
}

export default function HighlightInsightsPanel({
  highlights,
  selectedHighlightId,
  selectedOutput,
  generatedHighlightId,
  loading,
  error,
  warning,
  insights,
  onSelectHighlight,
  onSelectOutput,
  onGenerate,
}) {
  const selectedHighlight = highlights.find((highlight) => highlight.id === selectedHighlightId) || null;
  const showingSelectedResult = selectedHighlight && generatedHighlightId === selectedHighlight.id;

  const summaryLines = String(insights?.summary || '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  return (
    <aside className="flex w-full flex-col border-t border-slate-200 bg-[linear-gradient(180deg,_#fffaf0_0%,_#fff_100%)] xl:w-[360px] xl:border-l xl:border-t-0">
      <div className="border-b border-slate-200 px-5 py-5">
        <p className="text-xs font-semibold uppercase tracking-[0.28em] text-amber-700">From Highlight</p>
        <h2 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">AI Study Actions</h2>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          Pick a saved highlight, then turn it into a summary, quiz, or flashcards without leaving the PDF.
        </p>
      </div>

      <div className="flex-1 space-y-5 overflow-y-auto px-5 py-5">
        <section>
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">Saved Highlights</h3>
            <span className="rounded-full bg-white px-2 py-1 text-xs font-medium text-slate-500">{highlights.length}</span>
          </div>

          <div className="space-y-3">
            {highlights.length === 0 ? (
              <EmptyState
                title="No highlights yet"
                description="Highlight a sentence or key idea in the PDF first. It will appear here as a source for summary, quiz, and flashcards."
              />
            ) : (
              highlights.map((highlight) => {
                const active = highlight.id === selectedHighlightId;
                return (
                  <button
                    key={highlight.id}
                    type="button"
                    onClick={() => onSelectHighlight(highlight.id)}
                    className={`w-full rounded-[24px] border px-4 py-4 text-left transition ${
                      active
                        ? 'border-amber-400 bg-amber-50 shadow-sm'
                        : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-600">
                        Page {highlight.pageNumber}
                      </span>
                      <span
                        className="h-3 w-3 rounded-full border border-white shadow-sm"
                        style={{ backgroundColor: highlight.color }}
                      />
                    </div>
                    <p className="mt-3 text-sm leading-6 text-slate-700">{formatSnippet(highlight.text)}</p>
                  </button>
                );
              })
            )}
          </div>
        </section>

        <section className="rounded-[28px] border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex flex-wrap gap-2">
            {OUTPUT_TABS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => {
                  onSelectOutput(tab.id);
                  if (selectedHighlight) {
                    onGenerate(tab.id);
                  }
                }}
                disabled={!selectedHighlight || loading}
                className={`rounded-2xl border px-3 py-2 text-sm font-medium transition ${
                  selectedOutput === tab.id
                    ? 'border-slate-900 bg-slate-900 text-white'
                    : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50'
                } disabled:cursor-not-allowed disabled:opacity-50`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {selectedHighlight ? (
            <div className="mt-4 rounded-2xl bg-slate-50 p-4">
              <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Selected Text</div>
              <p className="mt-2 text-sm leading-6 text-slate-700">{selectedHighlight.text}</p>
            </div>
          ) : (
            <div className="mt-4 text-sm text-slate-500">Choose one highlight to unlock the study actions.</div>
          )}
        </section>

        {loading && (
          <div className="rounded-[24px] border border-sky-200 bg-sky-50 px-4 py-4 text-sm font-medium text-sky-700">
            Generating study tools from your highlight...
          </div>
        )}

        {error && (
          <div className="rounded-[24px] border border-rose-200 bg-rose-50 px-4 py-4 text-sm text-rose-700">
            {error}
          </div>
        )}

        {warning && !loading && (
          <div className="rounded-[24px] border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-800">
            {warning}
          </div>
        )}

        {!selectedHighlight ? null : !showingSelectedResult && !loading ? (
          <EmptyState
            title="Ready to generate"
            description="Choose one of the actions above to turn this highlight into a focused study asset."
          />
        ) : null}

        {showingSelectedResult && selectedOutput === 'summary' && !loading && (
          <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
            <h3 className="text-lg font-semibold text-slate-900">Summary</h3>
            <div className="mt-4 space-y-3 text-sm leading-6 text-slate-700">
              {summaryLines.length > 0 ? (
                summaryLines.map((line, index) => (
                  <div key={`${line}-${index}`} className="rounded-2xl bg-slate-50 px-4 py-3">
                    {line.replace(/^-+\s*/, '')}
                  </div>
                ))
              ) : (
                <div className="rounded-2xl bg-slate-50 px-4 py-3">{insights?.summary}</div>
              )}
            </div>
          </section>
        )}

        {showingSelectedResult && selectedOutput === 'quiz' && !loading && (
          <section className="space-y-3">
            {(insights?.quizQuestions || []).map((question, index) => (
              <article key={`${question.question}-${index}`} className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
                <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                  Quiz {index + 1} • {question.difficulty || 'medium'}
                </div>
                <h3 className="mt-2 text-base font-semibold leading-7 text-slate-900">{question.question}</h3>
                <div className="mt-4 space-y-2">
                  {(question.options || []).map((option, optionIndex) => (
                    <div
                      key={`${option}-${optionIndex}`}
                      className={`rounded-2xl border px-4 py-3 text-sm leading-6 ${
                        optionIndex === question.correctAnswer
                          ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
                          : 'border-slate-200 bg-slate-50 text-slate-700'
                      }`}
                    >
                      {option}
                    </div>
                  ))}
                </div>
              </article>
            ))}
          </section>
        )}

        {showingSelectedResult && selectedOutput === 'flashcards' && !loading && (
          <section className="space-y-3">
            {(insights?.flashcards || []).map((card, index) => (
              <article key={`${card.front}-${index}`} className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
                <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                  Flashcard {index + 1} • {card.difficulty || 'medium'}
                </div>
                <div className="mt-3 rounded-2xl bg-slate-50 px-4 py-3">
                  <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Front</div>
                  <div className="mt-2 text-sm font-medium leading-6 text-slate-900">{card.front}</div>
                </div>
                <div className="mt-3 rounded-2xl bg-amber-50 px-4 py-3">
                  <div className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-700">Back</div>
                  <div className="mt-2 text-sm leading-6 text-slate-800">{card.back}</div>
                </div>
              </article>
            ))}
          </section>
        )}
      </div>
    </aside>
  );
}
