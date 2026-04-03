import { useEffect, useMemo, useState } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import { useNavigate } from 'react-router-dom';
import GenerationSettings from '../components/GenerationSettings';
import { loadWorkspaceState } from '../utils/studyWorkspace';
import { loadQuizSession } from '../utils/quizSession';

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).toString();

const PROCESSING_STEPS = [
  'Uploading module',
  'Extracting text',
  'Cleaning content',
  'Generating summary',
  'Generating flashcards',
  'Generating quiz',
];

function formatDate(value) {
  return new Date(value).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatLastStudied(value) {
  if (!value) return 'Not studied yet';

  return new Date(value).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function countWorkspaceActivity(workspace) {
  const highlights = Object.values(workspace?.highlightsByPage || {}).reduce(
    (total, pageHighlights) => total + pageHighlights.length,
    0,
  );
  const drawings = Object.values(workspace?.drawingsByPage || {}).reduce(
    (total, pageDrawings) => total + (pageDrawings?.strokes?.length || 0),
    0,
  );

  return highlights + drawings;
}

function getModuleProgress(module, workspace, quizSession) {
  const pageCount = module.pageCount || 0;
  const currentPage = workspace?.currentPage || 0;
  const activityCount = countWorkspaceActivity(workspace);
  const answeredCount = Object.keys(quizSession?.answers || {}).length;
  const quizCount = quizSession?.filteredQuestions?.length || module.quizQuestions?.length || 0;
  let progress = 0;

  if (pageCount > 0) {
    progress = Math.round((Math.min(currentPage, pageCount) / pageCount) * 100);
  } else if (workspace?.lastOpenedAt) {
    progress = 45;
  }

  if (activityCount > 0) {
    progress = Math.max(progress, Math.min(85, 20 + activityCount * 5));
  }

  if (quizSession?.inProgress) {
    progress = Math.max(progress, quizCount > 0 ? Math.round((answeredCount / quizCount) * 100) : 25);
  }

  return Math.max(0, Math.min(progress, 100));
}

function getModuleStatus(module, progress, workspace, quizSession) {
  if (progress >= 100) {
    return {
      label: 'Completed',
      icon: '✅',
      classes: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    };
  }

  if (module.extractionWarning || (!module.summary && !workspace?.lastOpenedAt && !quizSession?.inProgress)) {
    return {
      label: 'Needs Review',
      icon: '⚠',
      classes: 'border-amber-200 bg-amber-50 text-amber-700',
    };
  }

  return {
    label: 'In Progress',
    icon: '🕒',
    classes: 'border-sky-200 bg-sky-50 text-sky-700',
  };
}

function getDifficultyBreakdown(questions = []) {
  return {
    easy: questions.filter((question) => question.difficulty === 'easy').length,
    medium: questions.filter((question) => question.difficulty === 'medium').length,
    hard: questions.filter((question) => question.difficulty === 'hard').length,
  };
}

function normalizePreviewText(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\b(article|section|chapter|lesson|module|unit|page|pages|edu|pdf)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function dedupePreviewItems(items = [], selector, limit) {
  const kept = [];

  items.forEach((item) => {
    const current = normalizePreviewText(selector(item));
    if (!current) return;

    const isDuplicate = kept.some((existing) => {
      const prior = normalizePreviewText(selector(existing));
      return prior === current || prior.includes(current) || current.includes(prior);
    });

    if (!isDuplicate) {
      kept.push(item);
    }
  });

  return kept.slice(0, limit);
}

function ProcessingTimeline({ currentStep }) {
  return (
    <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
      {PROCESSING_STEPS.map((step, index) => {
        const state = index < currentStep ? 'done' : index === currentStep ? 'active' : 'idle';
        return (
          <div
            key={step}
            className={`rounded-2xl border px-4 py-3 text-sm transition ${
              state === 'done'
                ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                : state === 'active'
                  ? 'border-sky-200 bg-sky-50 text-sky-700'
                  : 'border-slate-200 bg-white text-slate-400'
            }`}
          >
            <div className="text-xs font-semibold uppercase tracking-[0.22em]">
              {state === 'done' ? 'Done' : state === 'active' ? 'Now' : 'Queued'}
            </div>
            <div className="mt-2 font-medium">{step}</div>
          </div>
        );
      })}
    </div>
  );
}

function SectionCard({ title, subtitle, children, collapsible = false, defaultOpen = true }) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <div className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
      <div className={isOpen ? 'mb-4' : ''}>
        {collapsible ? (
          <button
            type="button"
            onClick={() => setIsOpen((current) => !current)}
            className="flex w-full items-start justify-between gap-4 text-left"
            aria-expanded={isOpen}
          >
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">{title}</p>
              {subtitle && (
                <p className="mt-2 text-sm text-slate-500">
                  {isOpen ? subtitle : 'Click to open this section.'}
                </p>
              )}
            </div>
            <span className="mt-0.5 shrink-0 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
              {isOpen ? 'Hide' : 'Show'}
            </span>
          </button>
        ) : (
          <>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">{title}</p>
            {subtitle && <p className="mt-2 text-sm text-slate-500">{subtitle}</p>}
          </>
        )}
      </div>
      {(!collapsible || isOpen) && children}
    </div>
  );
}

function PdfThumbnailStrip({ moduleId, pageCount, onOpenPage }) {
  const token = localStorage.getItem('token');

  return (
    <Document
      file={{ url: `/modules/${moduleId}/file`, httpHeaders: { 'x-auth-token': token || '' } }}
      loading={
        <div className="rounded-3xl border border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-500">
          Loading preview pages...
        </div>
      }
    >
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: Math.min(pageCount, 4) }, (_, index) => {
          const pageNumber = index + 1;
          return (
            <button
              key={pageNumber}
              type="button"
              onClick={() => onOpenPage(pageNumber)}
              className="rounded-3xl border border-slate-200 bg-white p-3 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-sky-300 hover:shadow-md"
            >
              <div className="mb-2 flex items-center justify-between text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                <span>Page {pageNumber}</span>
                <span>Preview</span>
              </div>
              <div className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-100">
                <Page
                  pageNumber={pageNumber}
                  width={230}
                  renderTextLayer={false}
                  renderAnnotationLayer={false}
                  loading={
                    <div className="flex h-[290px] items-center justify-center text-xs text-slate-400">
                      Rendering...
                    </div>
                  }
                />
              </div>
            </button>
          );
        })}
      </div>
    </Document>
  );
}

function ModuleCard({ module, onOpenStudyArea, onOpenDetail, onDelete }) {
  const breakdown = getDifficultyBreakdown(module.quizQuestions || []);
  const previewConcepts = dedupePreviewItems(module.keyConcepts || [], (concept) => concept, 5);
  const previewFlashcards = dedupePreviewItems(
    module.flashcards || [],
    (card) => `${card.front} ${card.back}`,
    3,
  );
  const workspace = loadWorkspaceState(module._id);
  const quizSession = loadQuizSession(module._id);
  const progress = getModuleProgress(module, workspace, quizSession);
  const status = getModuleStatus(module, progress, workspace, quizSession);

  return (
    <article className="rounded-[32px] border border-slate-200 bg-white p-6 shadow-[0_28px_80px_rgba(15,23,42,0.08)]">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-2xl font-semibold tracking-tight text-slate-900">{module.title}</h2>
            <span className="rounded-full bg-sky-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.22em] text-sky-700">
              {module.fileType === 'application/pdf' ? 'PDF Module' : 'Text Module'}
            </span>
            <span className={`rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] ${status.classes}`}>
              {status.icon} {status.label}
            </span>
          </div>
          <p className="mt-2 text-sm text-slate-500">
            {module.fileName || 'Untitled upload'} • {module.pageCount || 0} pages • Added {formatDate(module.createdAt)}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => onOpenStudyArea(1)}
            className="rounded-2xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-800"
          >
            Open in Study Area
          </button>
          <button
            type="button"
            onClick={onOpenDetail}
            className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
          >
            Full Module View
          </button>
          <button
            type="button"
            onClick={onDelete}
            className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700 transition hover:bg-rose-100"
          >
            Delete
          </button>
        </div>
      </div>

      {module.extractionWarning && (
        <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Manual review recommended: {module.extractionWarning}
        </div>
      )}

      {module.fileType === 'application/pdf' && module.pageCount > 0 && (
        <div className="mt-6">
          <SectionCard
            title="Module Preview"
            subtitle="Preview the first pages here, then jump into the full Study Area workspace."
          >
            <PdfThumbnailStrip moduleId={module._id} pageCount={module.pageCount} onOpenPage={onOpenStudyArea} />
          </SectionCard>
        </div>
      )}

      <div className="mt-6 grid gap-5 xl:grid-cols-2">
        <SectionCard
          title="Summary"
          subtitle="Auto-generated from the uploaded content."
          collapsible
          defaultOpen={false}
        >
          <p className="whitespace-pre-line text-sm leading-7 text-slate-600">
            {module.summary || 'Summary is still being prepared.'}
          </p>
        </SectionCard>

        <SectionCard
          title="Key Concepts"
          subtitle="Major ideas, principles, formulas, and definitions worth reviewing."
          collapsible
          defaultOpen={false}
        >
          <div className="space-y-3">
            {previewConcepts.map((concept) => (
              <div key={concept} className="rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-700">
                {concept}
              </div>
            ))}
            {previewConcepts.length === 0 && (
              <p className="text-sm text-slate-500">Key concepts will appear here after processing.</p>
            )}
          </div>
        </SectionCard>

        <SectionCard
          title="Flashcards"
          subtitle="Active recall prompts generated from the uploaded module."
          collapsible
          defaultOpen={false}
        >
          <div className="space-y-3">
            {previewFlashcards.map((card, index) => (
              <div key={`${card.front}-${index}`} className="rounded-2xl border border-slate-200 bg-white p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">{card.difficulty}</p>
                <p className="mt-2 font-medium text-slate-900">{card.front}</p>
                <p className="mt-2 text-sm leading-6 text-slate-600">{card.back}</p>
              </div>
            ))}
            {previewFlashcards.length === 0 && (
              <p className="text-sm text-slate-500">Flashcards will appear here after processing.</p>
            )}
          </div>
        </SectionCard>

        <SectionCard
          title="Quick Quiz"
          subtitle={`${module.quizQuestions?.length || 0} generated questions • ${breakdown.easy} easy • ${breakdown.medium} medium • ${breakdown.hard} hard`}
        >
          <div className="space-y-4">
            {module.quizQuestions?.length > 0 ? (
              <div className="rounded-2xl bg-slate-50 px-4 py-4">
                <p className="text-sm leading-6 text-slate-600">
                  Quiz questions are ready, but they stay hidden here until you open the Quick Quiz.
                </p>
                <button
                  type="button"
                  onClick={onOpenDetail}
                  className="mt-4 rounded-2xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-800"
                >
                  Open Quick Quiz
                </button>
              </div>
            ) : (
              <p className="text-sm text-slate-500">Quiz questions will appear here after processing.</p>
            )}
          </div>
        </SectionCard>
      </div>
    </article>
  );
}

function ModuleListItem({ module, onOpenStudyArea, onOpenDetail, onDelete }) {
  const [isExpanded, setIsExpanded] = useState(false);
  const breakdown = getDifficultyBreakdown(module.quizQuestions || []);
  const previewConcepts = dedupePreviewItems(module.keyConcepts || [], (concept) => concept, 5);
  const previewFlashcards = dedupePreviewItems(
    module.flashcards || [],
    (card) => `${card.front} ${card.back}`,
    3,
  );
  const workspace = loadWorkspaceState(module._id);
  const quizSession = loadQuizSession(module._id);
  const progress = getModuleProgress(module, workspace, quizSession);
  const status = getModuleStatus(module, progress, workspace, quizSession);

  return (
    <article className="rounded-[28px] border border-slate-200 bg-white px-5 py-5 shadow-sm">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-xl font-semibold tracking-tight text-slate-900">{module.title}</h2>
            <span className="rounded-full bg-sky-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.22em] text-sky-700">
              {module.fileType === 'application/pdf' ? 'PDF Module' : 'Text Module'}
            </span>
            <span className={`rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] ${status.classes}`}>
              {status.icon} {status.label}
            </span>
          </div>
          <p className="mt-2 text-sm text-slate-500">
            {module.fileName || 'Untitled upload'} • {module.pageCount || 0} pages • Added {formatDate(module.createdAt)}
          </p>
          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:max-w-2xl">
            <div className="rounded-2xl bg-slate-50 px-4 py-3">
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Progress</p>
                <span className="text-sm font-semibold text-slate-800">{progress}%</span>
              </div>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-200">
                <div className="h-full rounded-full bg-sky-500" style={{ width: `${progress}%` }} />
              </div>
            </div>
            <div className="rounded-2xl bg-slate-50 px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Last Studied</p>
              <p className="mt-2 text-sm font-medium text-slate-800">
                {formatLastStudied(workspace.lastOpenedAt || quizSession?.updatedAt)}
              </p>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">
              {previewConcepts.length} concepts
            </span>
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">
              {previewFlashcards.length} flashcard previews
            </span>
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">
              {module.quizQuestions?.length || 0} quiz questions
            </span>
          </div>
          {module.extractionWarning && (
            <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              Manual review recommended: {module.extractionWarning}
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-3 xl:justify-end">
          <button
            type="button"
            onClick={() => onOpenStudyArea(workspace.currentPage || 1)}
            className="rounded-2xl bg-sky-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-sky-700"
          >
            Study Now
          </button>
          <button
            type="button"
            onClick={() => setIsExpanded((current) => !current)}
            className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
          >
            {isExpanded ? 'Hide Details' : 'Show Details'}
          </button>
          <button
            type="button"
            onClick={() => onOpenStudyArea(1)}
            className="rounded-2xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-800"
          >
            Open in Study Area
          </button>
          <button
            type="button"
            onClick={onOpenDetail}
            className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
          >
            Full Module View
          </button>
          <button
            type="button"
            onClick={onDelete}
            className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700 transition hover:bg-rose-100"
          >
            Delete
          </button>
        </div>
      </div>

      {isExpanded && (
        <div className="mt-5 border-t border-slate-200 pt-5">
          {module.fileType === 'application/pdf' && module.pageCount > 0 && (
            <div className="mb-5">
              <SectionCard
                title="Module Preview"
                subtitle="Preview the first pages here, then jump into the full Study Area workspace."
              >
                <PdfThumbnailStrip moduleId={module._id} pageCount={module.pageCount} onOpenPage={onOpenStudyArea} />
              </SectionCard>
            </div>
          )}

          <div className="grid gap-5 xl:grid-cols-2">
            <SectionCard
              title="Summary"
              subtitle="Auto-generated from the uploaded content."
              collapsible
              defaultOpen={false}
            >
              <p className="whitespace-pre-line text-sm leading-7 text-slate-600">
                {module.summary || 'Summary is still being prepared.'}
              </p>
            </SectionCard>

            <SectionCard
              title="Key Concepts"
              subtitle="Major ideas, principles, formulas, and definitions worth reviewing."
              collapsible
              defaultOpen={false}
            >
              <div className="space-y-3">
                {previewConcepts.map((concept) => (
                  <div key={concept} className="rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-700">
                    {concept}
                  </div>
                ))}
                {previewConcepts.length === 0 && (
                  <p className="text-sm text-slate-500">Key concepts will appear here after processing.</p>
                )}
              </div>
            </SectionCard>

            <SectionCard
              title="Flashcards"
              subtitle="Active recall prompts generated from the uploaded module."
              collapsible
              defaultOpen={false}
            >
              <div className="space-y-3">
                {previewFlashcards.map((card, index) => (
                  <div key={`${card.front}-${index}`} className="rounded-2xl border border-slate-200 bg-white p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                      {card.difficulty}
                    </p>
                    <p className="mt-2 font-medium text-slate-900">{card.front}</p>
                    <p className="mt-2 text-sm leading-6 text-slate-600">{card.back}</p>
                  </div>
                ))}
                {previewFlashcards.length === 0 && (
                  <p className="text-sm text-slate-500">Flashcards will appear here after processing.</p>
                )}
              </div>
            </SectionCard>

            <SectionCard
              title="Quick Quiz"
              subtitle={`${module.quizQuestions?.length || 0} generated questions • ${breakdown.easy} easy • ${breakdown.medium} medium • ${breakdown.hard} hard`}
            >
              <div className="space-y-4">
                {module.quizQuestions?.length > 0 ? (
                  <div className="rounded-2xl bg-slate-50 px-4 py-4">
                    <p className="text-sm leading-6 text-slate-600">
                      Quiz questions are ready, but they stay hidden here until you open the Quick Quiz.
                    </p>
                    <button
                      type="button"
                      onClick={onOpenDetail}
                      className="mt-4 rounded-2xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-800"
                    >
                      Open Quick Quiz
                    </button>
                  </div>
                ) : (
                  <p className="text-sm text-slate-500">Quiz questions will appear here after processing.</p>
                )}
              </div>
            </SectionCard>
          </div>
        </div>
      )}
    </article>
  );
}

export default function ModulesWorkspaceClean() {
  const [modules, setModules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [bulkRegenerating, setBulkRegenerating] = useState(false);
  const [title, setTitle] = useState('');
  const [file, setFile] = useState(null);
  const [textInput, setTextInput] = useState('');
  const [showTextInput, setShowTextInput] = useState(false);
  const [generationMode, setGenerationMode] = useState('Quiz');
  const [generationDifficulty, setGenerationDifficulty] = useState('Mixed');
  const [generationFormat, setGenerationFormat] = useState('Both');
  const [error, setError] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [processingStep, setProcessingStep] = useState(0);
  const navigate = useNavigate();

  const refreshModules = async () => {
    const token = localStorage.getItem('token');
    const response = await fetch('/modules', { headers: { 'x-auth-token': token } });
    const data = await response.json();
    setModules(Array.isArray(data) ? data : []);
  };

  useEffect(() => {
    const fetchModules = async () => {
      const token = localStorage.getItem('token');
      if (!token) {
        navigate('/login');
        return;
      }

      try {
        const response = await fetch('/modules', { headers: { 'x-auth-token': token } });
        if (response.status === 401) {
          localStorage.removeItem('token');
          localStorage.removeItem('user');
          navigate('/login');
          return;
        }

        const data = await response.json();
        setModules(Array.isArray(data) ? data : []);
      } catch (err) {
        console.error('Error fetching modules:', err);
        setError('Failed to load modules.');
      } finally {
        setLoading(false);
      }
    };

    fetchModules();
  }, [navigate]);

  useEffect(() => {
    if (!uploading) {
      setProcessingStep(0);
      return undefined;
    }

    const interval = setInterval(() => {
      setProcessingStep((current) => (current < PROCESSING_STEPS.length - 1 ? current + 1 : current));
    }, 850);

    return () => clearInterval(interval);
  }, [uploading]);

  const handleUpload = async (event) => {
    event.preventDefault();
    if (!title.trim()) return;
    setUploading(true);

    const token = localStorage.getItem('token');
    const formData = new FormData();
    formData.append('title', title.trim());
    formData.append('mode', generationMode);
    formData.append('difficulty', generationDifficulty);
    formData.append('format', generationFormat);

    if (showTextInput && textInput.trim()) {
      formData.append('text', textInput.trim());
    } else if (file) {
      formData.append('file', file);
    } else {
      setUploading(false);
      setError('Add a file or paste study content first.');
      return;
    }

    try {
      const response = await fetch('/modules/upload', {
        method: 'POST',
        headers: { 'x-auth-token': token },
        body: formData,
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload?.message || `Upload failed (HTTP ${response.status})`);
      }

      const createdModule = await response.json();
      setTitle('');
      setFile(null);
      setTextInput('');
      setError(createdModule.warning || '');
      await refreshModules();
    } catch (err) {
      console.error('Error uploading module:', err);
      setError(err.message || 'Failed to upload module.');
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (moduleId) => {
    const token = localStorage.getItem('token');
    try {
      const response = await fetch(`/modules/${moduleId}`, {
        method: 'DELETE',
        headers: { 'x-auth-token': token },
      });
      if (!response.ok) {
        throw new Error('Failed to delete module.');
      }
      setModules((current) => current.filter((module) => module._id !== moduleId));
      setDeleteConfirm(null);
    } catch (err) {
      console.error('Error deleting module:', err);
      setError(err.message || 'Error deleting module.');
    }
  };

  const handleRegenerateAll = async () => {
    const token = localStorage.getItem('token');
    if (!token) {
      navigate('/login');
      return;
    }

    setBulkRegenerating(true);
    setError('');

    try {
      const response = await fetch('/modules/regenerate-all', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-auth-token': token,
        },
        body: JSON.stringify({
          mode: generationMode,
          difficulty: generationDifficulty,
          format: generationFormat,
        }),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.message || 'Failed to regenerate existing modules.');
      }

      await refreshModules();
      setError(payload.message || 'Existing modules were regenerated successfully.');
    } catch (err) {
      console.error('Error regenerating existing modules:', err);
      setError(err.message || 'Failed to regenerate existing modules.');
    } finally {
      setBulkRegenerating(false);
    }
  };

  const sortedModules = useMemo(
    () => [...modules].sort((first, second) => new Date(second.createdAt) - new Date(first.createdAt)),
    [modules],
  );

  if (loading) {
    return (
      <div className="rounded-[28px] border border-slate-200 bg-white px-6 py-10 text-sm text-slate-500 shadow-sm">
        Loading modules...
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="max-w-3xl">
        <p className="text-xs font-semibold uppercase tracking-[0.3em] text-sky-700">Learning Library</p>
        <h1 className="mt-3 text-4xl font-semibold tracking-tight text-slate-900">Modules</h1>
        <p className="mt-3 text-base leading-7 text-slate-600">
          Upload a PDF, handout, reviewer, or text module and turn it into a structured study pack with previews,
          notes, flashcards, and exam-style questions.
        </p>
      </div>

      {error && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 shadow-sm">
          {error}
        </div>
      )}

      <section className="rounded-[32px] border border-slate-200 bg-white p-6 shadow-[0_28px_80px_rgba(15,23,42,0.08)]">
        <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">Upload New Module</p>
            <h2 className="mt-3 text-2xl font-semibold text-slate-900">Create a study-ready module</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              The app will extract text, clean it, summarize the material, identify concepts, generate flashcards, and
              build a quiz automatically.
            </p>

            <form className="mt-6 space-y-4" onSubmit={handleUpload}>
              <input
                type="text"
                placeholder="Module title"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-800 outline-none transition focus:border-sky-400 focus:ring-4 focus:ring-sky-100"
                required
              />

              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={() => setShowTextInput(false)}
                  className={`rounded-2xl px-4 py-2 text-sm font-semibold transition ${
                    !showTextInput ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  Upload File
                </button>
                <button
                  type="button"
                  onClick={() => setShowTextInput(true)}
                  className={`rounded-2xl px-4 py-2 text-sm font-semibold transition ${
                    showTextInput ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  Paste Text
                </button>
              </div>

              {showTextInput ? (
                <textarea
                  placeholder="Paste reviewer or lecture content here..."
                  value={textInput}
                  onChange={(event) => setTextInput(event.target.value)}
                  className="h-44 w-full resize-none rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-800 outline-none transition focus:border-sky-400 focus:ring-4 focus:ring-sky-100"
                />
              ) : (
                <label className="block cursor-pointer rounded-[28px] border border-dashed border-slate-300 bg-slate-50 px-5 py-6 text-sm text-slate-600 transition hover:border-sky-400 hover:bg-sky-50">
                  <span className="block font-semibold text-slate-900">Choose PDF or text file</span>
                  <span className="mt-1 block text-xs text-slate-500">
                    {file?.name || 'Select a reviewer, module, or handout to analyze.'}
                  </span>
                  <input
                    type="file"
                    accept=".pdf,.txt"
                    className="hidden"
                    onChange={(event) => setFile(event.target.files?.[0] || null)}
                  />
                </label>
              )}

              <GenerationSettings
                mode={generationMode}
                difficulty={generationDifficulty}
                format={generationFormat}
                onModeChange={setGenerationMode}
                onDifficultyChange={setGenerationDifficulty}
                onFormatChange={setGenerationFormat}
              />

              <div className="flex flex-wrap gap-3">
                <button
                  type="submit"
                  disabled={uploading}
                  className="rounded-2xl bg-sky-600 px-6 py-3 text-sm font-semibold text-white transition hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {uploading ? 'Processing module...' : 'Upload & Build Study Pack'}
                </button>
                <button
                  type="button"
                  onClick={handleRegenerateAll}
                  disabled={bulkRegenerating || modules.length === 0}
                  className="rounded-2xl border border-slate-200 bg-white px-6 py-3 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {bulkRegenerating ? 'Updating existing modules...' : 'Apply To Existing Modules'}
                </button>
              </div>
            </form>
          </div>

          <div className="rounded-[28px] bg-[radial-gradient(circle_at_top,_rgba(125,211,252,0.18),_transparent_45%),linear-gradient(180deg,_#f8fbff_0%,_#eef4f8_100%)] p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">Processing Flow</p>
            <h3 className="mt-3 text-xl font-semibold text-slate-900">What gets generated automatically</h3>
            <ul className="mt-4 space-y-3 text-sm text-slate-600">
              <li className="rounded-2xl bg-white px-4 py-3 shadow-sm">Clean summary for exam review</li>
              <li className="rounded-2xl bg-white px-4 py-3 shadow-sm">Meaningful key concepts and important terms</li>
              <li className="rounded-2xl bg-white px-4 py-3 shadow-sm">Flashcards for active recall and memorization</li>
              <li className="rounded-2xl bg-white px-4 py-3 shadow-sm">Exam-style quiz questions with answer keys</li>
              <li className="rounded-2xl bg-white px-4 py-3 shadow-sm">PDF preview cards that jump straight into Study Area</li>
            </ul>
          </div>
        </div>

        {uploading && (
          <div className="mt-6">
            <ProcessingTimeline currentStep={processingStep} />
          </div>
        )}
      </section>

      {sortedModules.length === 0 ? (
        <div className="rounded-[32px] border border-dashed border-slate-300 bg-white px-8 py-16 text-center shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-slate-500">No Modules Yet</p>
          <h2 className="mt-3 text-3xl font-semibold text-slate-900">Your study library is empty</h2>
          <p className="mt-3 text-sm leading-7 text-slate-600">
            Upload your first reviewer or handout to generate a summary, concept list, flashcards, a quick quiz, and
            PDF page previews.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {sortedModules.map((module) => (
            <ModuleListItem
              key={module._id}
              module={module}
              onOpenStudyArea={(pageNumber) => navigate(`/study-area?module=${module._id}&page=${pageNumber}`)}
              onOpenDetail={() => navigate(`/modules/${module._id}`)}
              onDelete={() => setDeleteConfirm(module._id)}
            />
          ))}
        </div>
      )}

      {deleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-[28px] bg-white p-6 shadow-[0_32px_100px_rgba(15,23,42,0.18)]">
            <h3 className="text-xl font-semibold text-slate-900">Delete module?</h3>
            <p className="mt-3 text-sm leading-6 text-slate-600">
              This removes the uploaded module and its saved study outputs for this file.
            </p>
            <div className="mt-6 flex gap-3">
              <button
                type="button"
                onClick={() => handleDelete(deleteConfirm)}
                className="flex-1 rounded-2xl bg-rose-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-rose-700"
              >
                Delete
              </button>
              <button
                type="button"
                onClick={() => setDeleteConfirm(null)}
                className="flex-1 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
