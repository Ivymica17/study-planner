import { useEffect, useMemo, useState } from 'react';
import { Document, pdfjs } from 'react-pdf';
import 'react-pdf/dist/Page/TextLayer.css';
import { useNavigate } from 'react-router-dom';
import StudySidebar from './StudySidebar';
import StudyToolbar from './StudyToolbar';
import PdfPageStage from './PdfPageStage';
import {
  DRAW_COLORS,
  HIGHLIGHT_COLORS,
  buildPdfSrc,
  clamp,
  createEmptyWorkspaceState,
  createHighlightFromSelection,
  getPageDrawingState,
  getPageHighlights,
  loadWorkspaceState,
  saveWorkspaceState,
} from '../../utils/studyWorkspace';

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).toString();

function EmptyWorkspace({ hasModules, onBrowseModules }) {
  return (
    <div className="flex h-full flex-1 items-center justify-center bg-[radial-gradient(circle_at_top,_rgba(125,211,252,0.18),_transparent_42%),linear-gradient(180deg,_#f8fbff_0%,_#eef4f8_100%)] p-8">
      <div className="max-w-xl rounded-[32px] border border-slate-200 bg-white/90 p-10 text-center shadow-[0_30px_80px_rgba(15,23,42,0.08)] backdrop-blur">
        <p className="text-xs font-semibold uppercase tracking-[0.3em] text-sky-700">Study Area</p>
        <h3 className="mt-3 text-3xl font-semibold tracking-tight text-slate-900">
          {hasModules ? 'Choose a PDF to open your workspace' : 'Your study workspace is ready'}
        </h3>
        <p className="mt-4 text-base leading-7 text-slate-600">
          {hasModules
            ? 'Select a PDF from the left to continue reading, annotating, and saving your progress page by page.'
            : 'Upload a PDF reviewer, handout, or module to start highlighting and drawing directly on top of the document.'}
        </p>
        <div className="mt-8 grid gap-3 rounded-[28px] bg-slate-50 p-4 text-left text-sm text-slate-600 sm:grid-cols-3">
          <div className="rounded-2xl bg-white p-4 shadow-sm">
            <div className="font-semibold text-slate-800">Highlights</div>
            <div className="mt-1">Select text and color-code important ideas.</div>
          </div>
          <div className="rounded-2xl bg-white p-4 shadow-sm">
            <div className="font-semibold text-slate-800">AI Actions</div>
            <div className="mt-1">Turn a saved highlight into quiz questions.</div>
          </div>
          <div className="rounded-2xl bg-white p-4 shadow-sm">
            <div className="font-semibold text-slate-800">Pen Tools</div>
            <div className="mt-1">Sketch diagrams, circle terms, and erase cleanly.</div>
          </div>
        </div>
        {!hasModules && (
          <button
            type="button"
            onClick={onBrowseModules}
            className="mt-8 rounded-2xl border border-slate-200 bg-slate-900 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800"
          >
            Go to Modules
          </button>
        )}
      </div>
    </div>
  );
}

export default function PdfStudyWorkspace({
  modules,
  selectedModule,
  selectedModuleId,
  initialPage = 1,
  onSelectModule,
  onUpload,
  onDelete,
  uploading,
}) {
  const navigate = useNavigate();
  const [numPages, setNumPages] = useState(0);
  const [workspaceState, setWorkspaceState] = useState(createEmptyWorkspaceState());
  const [activeTool, setActiveTool] = useState('select');
  const [highlightColor, setHighlightColor] = useState(HIGHLIGHT_COLORS[0].value);
  const [highlightStyle, setHighlightStyle] = useState('medium');
  const [brushColor, setBrushColor] = useState(DRAW_COLORS[0]);
  const [brushSize, setBrushSize] = useState(4);
  const [pendingSelection, setPendingSelection] = useState(null);
  const [uploadTitle, setUploadTitle] = useState('');
  const [uploadFile, setUploadFile] = useState(null);
  const [documentLoading, setDocumentLoading] = useState(false);
  const [pageLoading, setPageLoading] = useState(false);
  const [pdfFileUrl, setPdfFileUrl] = useState('');
  const [pdfError, setPdfError] = useState('');
  const [highlightRedoByPage, setHighlightRedoByPage] = useState({});
  const [selectedHighlightId, setSelectedHighlightId] = useState('');
  const [selectedInsightOutput, setSelectedInsightOutput] = useState('quiz');
  const [highlightInsights, setHighlightInsights] = useState(null);
  const [highlightInsightsLoading, setHighlightInsightsLoading] = useState(false);
  const [highlightInsightsError, setHighlightInsightsError] = useState('');
  const [highlightInsightsWarning, setHighlightInsightsWarning] = useState('');

  const pdfRequestUrl = useMemo(
    () => buildPdfSrc(selectedModuleId, selectedModule?.fileType),
    [selectedModule?.fileType, selectedModuleId],
  );
  const currentPage = clamp(workspaceState.currentPage || 1, 1, numPages || 1);
  const currentDrawingState = getPageDrawingState(workspaceState, currentPage);
  const currentHighlights = getPageHighlights(workspaceState, currentPage);
  const savedHighlights = useMemo(
    () =>
      Object.entries(workspaceState.highlightsByPage || {})
        .flatMap(([pageNumber, highlights]) =>
          (highlights || []).map((highlight) => ({
            ...highlight,
            pageNumber: Number(pageNumber),
          })),
        )
        .sort((left, right) => (right.createdAt || 0) - (left.createdAt || 0)),
    [workspaceState.highlightsByPage],
  );
  const allHighlightsText = useMemo(
    () =>
      savedHighlights
        .map((highlight) => String(highlight.text || '').trim())
        .filter(Boolean)
        .join('\n\n'),
    [savedHighlights],
  );

  useEffect(() => {
    if (!selectedModuleId) {
      setWorkspaceState(createEmptyWorkspaceState());
      setPendingSelection(null);
      setNumPages(0);
      setHighlightRedoByPage({});
      setSelectedHighlightId('');
      setHighlightInsights(null);
      setHighlightInsightsError('');
      setHighlightInsightsWarning('');
      return;
    }

    const persisted = loadWorkspaceState(selectedModuleId);
    setWorkspaceState(persisted);
    setPendingSelection(null);
    setActiveTool('select');
    setPdfError('');
    setHighlightRedoByPage({});
    setSelectedHighlightId('');
    setHighlightInsights(null);
    setHighlightInsightsError('');
    setHighlightInsightsWarning('');
    const hasSelectedPdf = Boolean(buildPdfSrc(selectedModuleId, selectedModule?.fileType));
    setDocumentLoading(hasSelectedPdf);
    setPageLoading(hasSelectedPdf);
  }, [selectedModule, selectedModuleId]);

  useEffect(() => {
    if (savedHighlights.length === 0) {
      setSelectedHighlightId('');
      setHighlightInsights(null);
      return;
    }

    if (!savedHighlights.some((highlight) => highlight.id === selectedHighlightId)) {
      setSelectedHighlightId(savedHighlights[0].id);
    }
  }, [savedHighlights, selectedHighlightId]);

  useEffect(() => {
    setHighlightInsights(null);
    setHighlightInsightsError('');
    setHighlightInsightsWarning('');
  }, [selectedHighlightId]);

  useEffect(() => {
    if (!selectedModuleId || !initialPage || initialPage < 1) return;
    setWorkspaceState((prev) => ({ ...prev, currentPage: initialPage }));
  }, [initialPage, selectedModuleId]);

  useEffect(() => {
    if (!pdfRequestUrl) {
      setPdfFileUrl('');
      return undefined;
    }

    const controller = new AbortController();
    let objectUrl = '';

    const loadPdf = async () => {
      try {
        setPdfError('');
        setDocumentLoading(true);

        const token = localStorage.getItem('token');
        const response = await fetch(pdfRequestUrl, {
          headers: { 'x-auth-token': token || '' },
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error(`Failed to fetch PDF (${response.status})`);
        }

        const blob = await response.blob();
        objectUrl = URL.createObjectURL(blob);
        setPdfFileUrl(objectUrl);
      } catch (error) {
        if (error.name === 'AbortError') return;
        console.error('Failed to fetch PDF file:', error);
        setPdfFileUrl('');
        setPdfError('Failed to load PDF file.');
        setDocumentLoading(false);
        setPageLoading(false);
      }
    };

    loadPdf();

    return () => {
      controller.abort();
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [pdfRequestUrl]);

  useEffect(() => {
    if (!selectedModuleId) return;
    saveWorkspaceState(selectedModuleId, {
      ...workspaceState,
      lastOpenedAt: new Date().toISOString(),
    });
  }, [selectedModuleId, workspaceState]);

  useEffect(() => {
    setPendingSelection(null);
    if (numPages > 0) {
      setWorkspaceState((prev) => ({
        ...prev,
        currentPage: clamp(prev.currentPage || 1, 1, numPages),
      }));
    }
  }, [numPages]);

  useEffect(() => {
    if (numPages > 0) {
      setPageLoading(true);
    }
  }, [currentPage, numPages, workspaceState.zoom]);

  const updateWorkspaceState = (updater) => {
    setWorkspaceState((prev) => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      return next;
    });
  };

  const updatePageDrawing = (pageNumber, updater) => {
    updateWorkspaceState((prev) => {
      const current = getPageDrawingState(prev, pageNumber);
      const nextDrawingState = updater(current);
      return {
        ...prev,
        drawingsByPage: {
          ...prev.drawingsByPage,
          [pageNumber]: nextDrawingState,
        },
      };
    });
  };

  const updatePageHighlights = (pageNumber, updater) => {
    updateWorkspaceState((prev) => {
      const current = getPageHighlights(prev, pageNumber);
      return {
        ...prev,
        highlightsByPage: {
          ...prev.highlightsByPage,
          [pageNumber]: updater(current),
        },
      };
    });
  };

  const handleAddHighlight = (pageNumber, selection, color) => {
    setHighlightRedoByPage((prev) => ({ ...prev, [pageNumber]: [] }));
    const nextHighlight = createHighlightFromSelection(selection, color, highlightStyle);
    updatePageHighlights(pageNumber, (current) => [...current, nextHighlight]);
    setSelectedHighlightId(nextHighlight.id);
  };

  const handleApplyHighlight = (color) => {
    setHighlightColor(color);
    if (activeTool !== 'highlighter') {
      setActiveTool('highlighter');
    }
    if (!pendingSelection || pendingSelection.pageNumber !== currentPage) return;

    setHighlightRedoByPage((prev) => ({ ...prev, [currentPage]: [] }));
    const nextHighlight = createHighlightFromSelection(pendingSelection, color, highlightStyle);
    updatePageHighlights(currentPage, (current) => [...current, nextHighlight]);
    setSelectedHighlightId(nextHighlight.id);
    setPendingSelection(null);
    window.getSelection()?.removeAllRanges();
  };

  const handleAddStroke = (pageNumber, stroke) => {
    updatePageDrawing(pageNumber, (current) => ({
      strokes: [...(current.strokes || []), stroke],
      undone: [],
    }));
  };

  const handleUndoDrawing = () => {
    if (!currentDrawingState.strokes?.length) return;
    updatePageDrawing(currentPage, (current) => {
      const strokes = [...current.strokes];
      const removed = strokes.pop();
      return {
        strokes,
        undone: removed ? [...(current.undone || []), removed] : current.undone || [],
      };
    });
  };

  const handleRedoDrawing = () => {
    if (!currentDrawingState.undone?.length) return;
    updatePageDrawing(currentPage, (current) => {
      const undone = [...(current.undone || [])];
      const restored = undone.pop();
      return {
        strokes: restored ? [...(current.strokes || []), restored] : current.strokes || [],
        undone,
      };
    });
  };

  const handleClearDrawing = () => {
    updatePageDrawing(currentPage, () => ({ strokes: [], undone: [] }));
  };

  const handleClearHighlights = () => {
    if (currentHighlights.length > 0) {
      setHighlightRedoByPage((prev) => ({
        ...prev,
        [currentPage]: [...(prev[currentPage] || []), ...currentHighlights.map((highlight) => ({ type: 'add', highlight }))],
      }));
    }
    updatePageHighlights(currentPage, () => []);
    setPendingSelection(null);
  };

  const handleRemoveHighlight = (pageNumber, highlightId) => {
    const target = getPageHighlights(workspaceState, pageNumber).find((highlight) => highlight.id === highlightId);
    if (!target) return;

    setHighlightRedoByPage((prev) => ({
      ...prev,
      [pageNumber]: [...(prev[pageNumber] || []), { type: 'remove', highlight: target }],
    }));
    updatePageHighlights(pageNumber, (current) => current.filter((highlight) => highlight.id !== highlightId));
    if (selectedHighlightId === highlightId) {
      setSelectedHighlightId('');
    }
  };

  const handleUndoHighlight = () => {
    const current = getPageHighlights(workspaceState, currentPage);
    if (!current.length) return;

    const removed = current[current.length - 1];
    setHighlightRedoByPage((prev) => ({
      ...prev,
      [currentPage]: [...(prev[currentPage] || []), { type: 'remove', highlight: removed }],
    }));
    updatePageHighlights(currentPage, (items) => items.slice(0, -1));
  };

  const handleRedoHighlight = () => {
    const redoStack = highlightRedoByPage[currentPage] || [];
    const lastAction = redoStack[redoStack.length - 1];
    if (!lastAction) return;

    setHighlightRedoByPage((prev) => ({
      ...prev,
      [currentPage]: redoStack.slice(0, -1),
    }));

    if (lastAction.type === 'remove') {
      updatePageHighlights(currentPage, (current) => [...current, lastAction.highlight]);
      return;
    }

    if (lastAction.type === 'add') {
      updatePageHighlights(currentPage, (current) =>
        current.filter((highlight) => highlight.id !== lastAction.highlight.id),
      );
    }
  };

  const handleUploadSubmit = async (event) => {
    event.preventDefault();
    if (!uploadTitle.trim() || !uploadFile) return;

    const createdModuleId = await onUpload({
      title: uploadTitle.trim(),
      file: uploadFile,
    });

    if (createdModuleId) {
      setUploadTitle('');
      setUploadFile(null);
    }
  };

  const handleGenerateHighlightInsights = async (output = selectedInsightOutput) => {
    if (!selectedModuleId || !allHighlightsText) return;

    setSelectedInsightOutput(output);
    setHighlightInsightsLoading(true);
    setHighlightInsightsError('');
    setHighlightInsightsWarning('');

    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`/highlight-tools/${selectedModuleId}/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-auth-token': token || '',
        },
        body: JSON.stringify({
          text: allHighlightsText,
        }),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.message || 'Failed to generate highlight study tools.');
      }

      setHighlightInsights(payload);
      setHighlightInsightsWarning(payload?.warning || '');
    } catch (error) {
      console.error('Failed to generate highlight insights:', error);
      setHighlightInsightsError(error.message || 'Failed to generate highlight study tools.');
    } finally {
      setHighlightInsightsLoading(false);
    }
  };

  const hasPdf = Boolean(pdfRequestUrl);
  const isHighlightToolActive = activeTool === 'highlighter' || activeTool === 'remove-highlight';
  const canUndo = isHighlightToolActive
    ? Boolean(currentHighlights.length)
    : Boolean(currentDrawingState.strokes?.length);
  const canRedo = isHighlightToolActive
    ? Boolean((highlightRedoByPage[currentPage] || []).length)
    : Boolean(currentDrawingState.undone?.length);
  const hasHighlights = currentHighlights.length > 0;
  const hasDrawings = currentDrawingState.strokes?.length > 0;
  return (
    <div className="overflow-hidden rounded-[32px] border border-slate-200 bg-white shadow-[0_32px_100px_rgba(15,23,42,0.08)]">
      <div className="flex min-h-[calc(100vh-10rem)] flex-col xl:flex-row">
        <StudySidebar
          modules={modules}
          selectedModuleId={selectedModuleId}
          pdfUrl={pdfFileUrl}
          totalPages={numPages}
          currentPage={currentPage}
          onSelectModule={onSelectModule}
          onDeleteModule={onDelete}
          onSelectPage={(pageNumber) => updateWorkspaceState((prev) => ({ ...prev, currentPage: pageNumber }))}
          uploadTitle={uploadTitle}
          uploadFileName={uploadFile?.name || ''}
          uploading={uploading}
          onUploadTitleChange={setUploadTitle}
          onUploadFileChange={(event) => setUploadFile(event.target.files?.[0] || null)}
          onUpload={handleUploadSubmit}
        />

        <div className="flex min-h-[70vh] flex-1 flex-col bg-[linear-gradient(180deg,_#f8fbff_0%,_#edf3f8_100%)]">
          {!selectedModule ? (
            <EmptyWorkspace hasModules={modules.length > 0} onBrowseModules={() => navigate('/modules')} />
          ) : !hasPdf ? (
            <EmptyWorkspace hasModules={modules.length > 0} onBrowseModules={() => navigate('/modules')} />
          ) : (
            <>
              <div className="border-b border-slate-200 bg-white/85 px-4 py-4 backdrop-blur">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.28em] text-slate-500">Open Document</p>
                    <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">{selectedModule.title}</h1>
                    <p className="mt-1 text-sm text-slate-500">
                      {selectedModule.fileName || 'Uploaded PDF'} • Progress is saved locally for this file.
                    </p>
                    {activeTool === 'highlighter' && (
                      <p className="mt-2 text-sm font-medium text-amber-700">
                        Highlighter mode is on. Select text on the page to apply the chosen color.
                      </p>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                      <div className="font-semibold">Saved Highlights</div>
                      <div className="mt-1">{savedHighlights.length} ready to study</div>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleGenerateHighlightInsights('quiz')}
                      disabled={savedHighlights.length === 0 || highlightInsightsLoading}
                      className="flex items-center gap-2 rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm font-semibold text-sky-800 transition hover:bg-sky-100 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <span aria-hidden="true">?</span>
                      <span>Turn Into Quiz</span>
                    </button>
                  </div>
                </div>
              </div>

              <StudyToolbar
                currentPage={currentPage}
                totalPages={numPages}
                zoom={workspaceState.zoom}
                activeTool={activeTool}
                highlightColor={highlightColor}
                highlightStyle={highlightStyle}
                brushColor={brushColor}
                brushSize={brushSize}
                canUndo={canUndo}
                canRedo={canRedo}
                hasHighlights={hasHighlights}
                hasDrawings={hasDrawings}
                hasPendingSelection={Boolean(pendingSelection)}
                onPreviousPage={() => updateWorkspaceState((prev) => ({ ...prev, currentPage: clamp(currentPage - 1, 1, numPages) }))}
                onNextPage={() => updateWorkspaceState((prev) => ({ ...prev, currentPage: clamp(currentPage + 1, 1, numPages) }))}
                onZoomOut={() => updateWorkspaceState((prev) => ({ ...prev, zoom: clamp((prev.zoom || 100) - 10, 60, 180) }))}
                onZoomIn={() => updateWorkspaceState((prev) => ({ ...prev, zoom: clamp((prev.zoom || 100) + 10, 60, 180) }))}
                onResetZoom={() => updateWorkspaceState((prev) => ({ ...prev, zoom: 100 }))}
                onToolChange={(tool) => {
                  setActiveTool(tool);
                  if (tool === 'pen' || tool === 'eraser' || tool === 'remove-highlight') {
                    setPendingSelection(null);
                    window.getSelection()?.removeAllRanges();
                  }
                }}
                onApplyHighlight={handleApplyHighlight}
                onHighlightStyleChange={setHighlightStyle}
                onBrushColorChange={setBrushColor}
                onBrushSizeChange={setBrushSize}
                onUndoDrawing={isHighlightToolActive ? handleUndoHighlight : handleUndoDrawing}
                onRedoDrawing={isHighlightToolActive ? handleRedoHighlight : handleRedoDrawing}
                onClearDrawing={handleClearDrawing}
                onClearHighlights={handleClearHighlights}
              />

              <div className="flex flex-1 flex-col">
                {(highlightInsightsLoading || highlightInsightsError || highlightInsightsWarning || highlightInsights) && (
                  <div className="border-b border-slate-200 bg-white/80 px-4 py-4">
                    {highlightInsightsLoading && (
                      <div className="rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm font-medium text-sky-700">
                        Building study material from your saved highlights...
                      </div>
                    )}

                    {highlightInsightsError && !highlightInsightsLoading && (
                      <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                        {highlightInsightsError}
                      </div>
                    )}

                    {highlightInsightsWarning && !highlightInsightsLoading && (
                      <div className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                        {highlightInsightsWarning}
                      </div>
                    )}

                    {highlightInsights && !highlightInsightsLoading && selectedInsightOutput === 'quiz' && (
                      <div className="mt-3 rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">Saved Highlights</p>
                            <h3 className="mt-2 text-lg font-semibold text-slate-900">Turned Into Quiz</h3>
                          </div>
                          <button
                            type="button"
                            onClick={() => setHighlightInsights(null)}
                            className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-50"
                          >
                            Close
                          </button>
                        </div>
                        <div className="mt-4 space-y-3">
                          {(highlightInsights.quizQuestions || []).map((question, index) => (
                            <article key={`${question.question}-${index}`} className="rounded-2xl bg-slate-50 p-4">
                              <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                                Quiz {index + 1} • {question.difficulty || 'medium'}
                              </div>
                              <h4 className="mt-2 text-sm font-semibold leading-6 text-slate-900">{question.question}</h4>
                              <div className="mt-3 grid gap-2">
                                {(question.options || []).map((option, optionIndex) => (
                                  <div
                                    key={`${option}-${optionIndex}`}
                                    className={`rounded-xl border px-3 py-2 text-sm ${
                                      optionIndex === question.correctAnswer
                                        ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
                                        : 'border-slate-200 bg-white text-slate-700'
                                    }`}
                                  >
                                    {option}
                                  </div>
                                ))}
                              </div>
                            </article>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                <div className="study-scroll-area relative flex-1 overflow-auto">
                  {(documentLoading || pageLoading) && (
                    <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex justify-center p-4">
                      <div className="rounded-full border border-sky-200 bg-white/95 px-4 py-2 text-sm font-medium text-sky-700 shadow-sm">
                        Rendering your study page...
                      </div>
                    </div>
                  )}

                  {!pdfError && pdfFileUrl && (
                    <div className="sticky top-4 z-10 flex justify-center px-4 lg:px-8">
                      <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white/95 px-2 py-2 shadow-[0_16px_40px_rgba(15,23,42,0.12)] backdrop-blur">
                        <button
                          type="button"
                          onClick={() =>
                            updateWorkspaceState((prev) => ({
                              ...prev,
                              zoom: clamp((prev.zoom || 100) - 10, 60, 180),
                            }))
                          }
                          disabled={workspaceState.zoom <= 60}
                          className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-lg font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                          aria-label="Zoom out"
                          title="Zoom out"
                        >
                          -
                        </button>
                        <button
                          type="button"
                          onClick={() => updateWorkspaceState((prev) => ({ ...prev, zoom: 100 }))}
                          className="min-w-[72px] rounded-xl bg-slate-100 px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-200"
                          aria-label="Reset zoom"
                          title="Reset zoom"
                        >
                          {workspaceState.zoom}%
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            updateWorkspaceState((prev) => ({
                              ...prev,
                              zoom: clamp((prev.zoom || 100) + 10, 60, 180),
                            }))
                          }
                          disabled={workspaceState.zoom >= 180}
                          className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-lg font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                          aria-label="Zoom in"
                          title="Zoom in"
                        >
                          +
                        </button>
                      </div>
                    </div>
                  )}

                  {pdfError ? (
                    <div className="flex h-full min-h-[420px] items-center justify-center p-8">
                      <div className="rounded-3xl border border-rose-200 bg-white px-6 py-5 text-sm text-rose-700 shadow-sm">
                        {pdfError}
                      </div>
                    </div>
                  ) : pdfFileUrl ? (
                    <div className="flex min-h-full justify-center px-2 sm:px-4">
                      <Document
                        file={pdfFileUrl}
                        onLoadSuccess={({ numPages: pages }) => {
                          setNumPages(pages);
                          setDocumentLoading(false);
                        }}
                        onLoadError={(error) => {
                          console.error('Failed to load PDF:', error);
                          setPdfError('Failed to load PDF file.');
                          setDocumentLoading(false);
                          setPageLoading(false);
                        }}
                        loading={null}
                        className="min-h-full w-full"
                      >
                        <PdfPageStage
                          pageNumber={currentPage}
                          zoom={workspaceState.zoom}
                          activeTool={activeTool}
                          highlights={currentHighlights}
                          drawingState={currentDrawingState}
                          brushColor={brushColor}
                          brushSize={brushSize}
                          highlightColor={highlightColor}
                          onSelectionChange={setPendingSelection}
                          onAddHighlight={handleAddHighlight}
                          onAddStroke={handleAddStroke}
                          onRemoveHighlight={handleRemoveHighlight}
                          onPageRenderSuccess={() => setPageLoading(false)}
                          onPageRenderError={(error) => {
                            console.error('Failed to render page:', error);
                            setPageLoading(false);
                          }}
                        />
                      </Document>
                    </div>
                  ) : null}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
