import { DRAW_COLORS, HIGHLIGHT_COLORS, HIGHLIGHT_STYLES } from '../../utils/studyWorkspace';

const HIGHLIGHT_STYLE_LEVELS = HIGHLIGHT_STYLES.reduce((acc, style, index) => {
  acc[style.id] = index + 1;
  return acc;
}, {});

function ToolButton({ active, children, ...props }) {
  return (
    <button
      type="button"
      className={`rounded-2xl border px-3 py-2 text-sm font-medium transition ${
        active
          ? 'border-sky-600 bg-sky-600 text-white shadow-sm'
          : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50'
      }`}
      {...props}
    >
      {children}
    </button>
  );
}

function ActionButton({ tone = 'default', children, ...props }) {
  const styles = {
    default: 'border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50',
    danger: 'border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100',
    accent: 'border-sky-200 bg-sky-50 text-sky-700 hover:bg-sky-100',
  };

  return (
    <button
      type="button"
      className={`rounded-2xl border px-3 py-2 text-sm font-medium transition ${styles[tone]}`}
      {...props}
    >
      {children}
    </button>
  );
}

export default function StudyToolbar({
  currentPage,
  totalPages,
  zoom,
  activeTool,
  highlightColor,
  highlightStyle,
  brushColor,
  brushSize,
  canUndo,
  canRedo,
  hasHighlights,
  hasDrawings,
  hasPendingSelection,
  onPreviousPage,
  onNextPage,
  onZoomOut,
  onZoomIn,
  onResetZoom,
  onToolChange,
  onApplyHighlight,
  onHighlightStyleChange,
  onBrushColorChange,
  onBrushSizeChange,
  onUndoDrawing,
  onRedoDrawing,
  onClearDrawing,
  onClearHighlights,
}) {
  const highlightLevel = HIGHLIGHT_STYLE_LEVELS[highlightStyle] || 2;

  return (
    <div className="border-b border-slate-200 bg-white/85 px-4 py-3 backdrop-blur">
      <div className="flex flex-wrap items-center gap-3">
      <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-2 py-1">
        <ActionButton onClick={onPreviousPage} disabled={currentPage <= 1}>
          Previous
        </ActionButton>
        <div className="min-w-[102px] text-center text-sm font-semibold text-slate-700">
          Page {currentPage} of {totalPages || 1}
        </div>
        <ActionButton onClick={onNextPage} disabled={currentPage >= totalPages}>
          Next
        </ActionButton>
      </div>

      <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-2 py-1">
        <ActionButton onClick={onZoomOut}>-</ActionButton>
        <div className="min-w-[64px] text-center text-sm font-semibold text-slate-700">{zoom}%</div>
        <ActionButton onClick={onZoomIn}>+</ActionButton>
        <ActionButton onClick={onResetZoom}>Reset</ActionButton>
      </div>

      <div className="h-8 w-px bg-slate-200" />

      <div className="flex flex-wrap items-center gap-2">
        <ToolButton active={activeTool === 'select'} onClick={() => onToolChange('select')}>
          Select
        </ToolButton>
        <ToolButton active={activeTool === 'highlighter'} onClick={() => onToolChange('highlighter')}>
          Highlighter
        </ToolButton>
        <ToolButton active={activeTool === 'pen'} onClick={() => onToolChange('pen')}>
          Pen
        </ToolButton>
        <ToolButton active={activeTool === 'eraser'} onClick={() => onToolChange('eraser')}>
          Eraser
        </ToolButton>
        <ToolButton active={activeTool === 'remove-highlight'} onClick={() => onToolChange('remove-highlight')}>
          Remove Highlight
        </ToolButton>
      </div>

      <div className="h-8 w-px bg-slate-200" />

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Draw</span>
        <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2">
          {DRAW_COLORS.map((color) => (
            <button
              key={color}
              type="button"
              className={`h-7 w-7 rounded-full border-2 transition ${
                brushColor === color ? 'border-slate-900 scale-105' : 'border-white'
              }`}
              style={{ backgroundColor: color }}
              onClick={() => onBrushColorChange(color)}
              title={`Brush color ${color}`}
            />
          ))}
        </div>
        <label className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
          Size
          <input
            type="range"
            min="2"
            max="18"
            value={brushSize}
            onChange={(event) => onBrushSizeChange(Number(event.target.value))}
            className="accent-sky-600"
          />
          <span className="w-6 text-right font-semibold">{brushSize}</span>
        </label>
      </div>

      <div className="ml-auto flex flex-wrap items-center gap-2">
        <ActionButton tone="accent" onClick={onUndoDrawing} disabled={!canUndo}>
          Undo
        </ActionButton>
        <ActionButton tone="accent" onClick={onRedoDrawing} disabled={!canRedo}>
          Redo
        </ActionButton>
        <ActionButton tone="danger" onClick={onClearHighlights} disabled={!hasHighlights}>
          Clear Highlights
        </ActionButton>
        <ActionButton tone="danger" onClick={onClearDrawing} disabled={!hasDrawings}>
          Clear Drawing
        </ActionButton>
      </div>
      </div>

      {(activeTool === 'highlighter' || activeTool === 'remove-highlight') && (
        <div className="mt-4 flex max-w-[320px] flex-col gap-4 rounded-[24px] bg-slate-900 px-4 py-4 text-white shadow-[0_20px_50px_rgba(15,23,42,0.28)]">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.28em] text-slate-400">Highlighter</p>
              <p className="mt-1 text-sm text-slate-300">
                {activeTool === 'remove-highlight'
                  ? 'Tap a saved highlight on the page to remove it.'
                  : 'Pick a size and color, then drag across the text.'}
              </p>
            </div>
            <div
              className="h-9 w-9 rounded-xl border border-white/10"
              style={{ backgroundColor: highlightColor }}
            />
          </div>

          <div>
            <p className="mb-2 text-sm font-medium text-slate-200">Size</p>
            <label className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-200">
              <span>Size</span>
              <input
                type="range"
                min="1"
                max={HIGHLIGHT_STYLES.length}
                step="1"
                value={highlightLevel}
                onChange={(event) => onHighlightStyleChange(HIGHLIGHT_STYLES[Number(event.target.value) - 1]?.id || 'medium')}
                className="w-full accent-sky-400"
              />
              <span className="w-4 text-right font-semibold text-white">{highlightLevel}</span>
            </label>
          </div>

          <div>
            <p className="mb-2 text-sm font-medium text-slate-200">Color</p>
            <div className="grid grid-cols-2 gap-2.5">
              {HIGHLIGHT_COLORS.map((color) => (
                <button
                  key={color.value}
                  type="button"
                  onClick={() => onApplyHighlight(color.value)}
                  className={`flex items-center gap-3 rounded-2xl border px-3 py-2 text-left transition ${
                    highlightColor === color.value
                      ? 'border-white bg-white/10 scale-[1.02]'
                      : 'border-white/10 bg-white/5 hover:bg-white/10'
                  } ${hasPendingSelection ? 'shadow-[0_0_0_4px_rgba(255,255,255,0.12)]' : ''}`}
                  title={color.meaning ? `${color.name}: ${color.meaning}` : color.name}
                >
                  <span
                    className="h-10 w-10 shrink-0 rounded-full border-4 border-transparent"
                    style={{ backgroundColor: color.value }}
                  />
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold text-white">{color.name}</span>
                    <span className="block text-xs text-slate-300">{color.meaning || 'General note'}</span>
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
