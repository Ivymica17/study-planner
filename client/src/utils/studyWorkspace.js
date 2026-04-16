export const HIGHLIGHT_COLORS = [
  { name: 'Yellow', value: '#facc15', meaning: 'In progress' },
  { name: 'Green', value: '#4ade80', meaning: 'Completed' },
  { name: 'Red', value: '#f87171', meaning: 'Weak areas' },
  { name: 'Blue', value: '#60a5fa' },
  { name: 'Pink', value: '#f472b6' },
];

export const HIGHLIGHT_STYLES = [
  { id: 'fine', name: 'Fine', paddingY: 0.04, opacity: 0.22 },
  { id: 'medium', name: 'Medium', paddingY: 0.08, opacity: 0.28 },
  { id: 'broad', name: 'Broad', paddingY: 0.13, opacity: 0.34 },
  { id: 'block', name: 'Block', paddingY: 0.18, opacity: 0.4 },
];

export const DRAW_COLORS = [
  '#111827',
  '#2563eb',
  '#dc2626',
  '#16a34a',
  '#d97706',
  '#7c3aed',
];

const STORAGE_PREFIX = 'study-workspace';
const STUDY_ACTIVITY_STORAGE_KEY = 'study-activity-days';

export function getWorkspaceStorageKey(moduleId) {
  return `${STORAGE_PREFIX}:${moduleId}`;
}

function formatLocalDateKey(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function loadStudyActivityDays() {
  try {
    const raw = localStorage.getItem(STUDY_ACTIVITY_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((value) => typeof value === 'string') : [];
  } catch (error) {
    console.error('Failed to load study activity days:', error);
    return [];
  }
}

export function recordStudyActivity(value = new Date()) {
  try {
    const activityDay = formatLocalDateKey(value);
    const days = new Set(loadStudyActivityDays());
    days.add(activityDay);

    const nextDays = [...days].sort().slice(-365);
    localStorage.setItem(STUDY_ACTIVITY_STORAGE_KEY, JSON.stringify(nextDays));
    return nextDays;
  } catch (error) {
    console.error('Failed to record study activity:', error);
    return loadStudyActivityDays();
  }
}

export function getStudyStreakCount(activityDays = loadStudyActivityDays()) {
  const daySet = new Set(activityDays);
  let streak = 0;
  const cursor = new Date();
  cursor.setHours(0, 0, 0, 0);

  while (daySet.has(formatLocalDateKey(cursor))) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }

  return streak;
}

export function createEmptyWorkspaceState() {
  return {
    currentPage: 1,
    zoom: 100,
    highlightsByPage: {},
    drawingsByPage: {},
    lastOpenedAt: null,
  };
}

export function loadWorkspaceState(moduleId) {
  if (!moduleId) return createEmptyWorkspaceState();

  try {
    const raw = localStorage.getItem(getWorkspaceStorageKey(moduleId));
    if (!raw) return createEmptyWorkspaceState();

    const parsed = JSON.parse(raw);
    return {
      ...createEmptyWorkspaceState(),
      ...parsed,
      highlightsByPage: parsed?.highlightsByPage || {},
      drawingsByPage: parsed?.drawingsByPage || {},
      lastOpenedAt: parsed?.lastOpenedAt || null,
    };
  } catch (error) {
    console.error('Failed to load study workspace state:', error);
    return createEmptyWorkspaceState();
  }
}

export function saveWorkspaceState(moduleId, state) {
  if (!moduleId) return;

  const lastOpenedAt = state.lastOpenedAt || new Date().toISOString();

  const payload = {
    currentPage: state.currentPage,
    zoom: state.zoom,
    highlightsByPage: state.highlightsByPage || {},
    drawingsByPage: state.drawingsByPage || {},
    lastOpenedAt,
  };

  localStorage.setItem(getWorkspaceStorageKey(moduleId), JSON.stringify(payload));
  recordStudyActivity(lastOpenedAt);
}

export function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

export function buildPdfSrc(moduleId, fileType) {
  if (!moduleId || fileType !== 'application/pdf') return null;
  return `/modules/${moduleId}/file`;
}

export function getPageHighlights(state, pageNumber) {
  return state.highlightsByPage?.[pageNumber] || [];
}

export function getPageDrawingState(state, pageNumber) {
  return state.drawingsByPage?.[pageNumber] || { strokes: [], undone: [] };
}

export function normalizeClientRects(rects, containerRect) {
  const width = containerRect.width || 1;
  const height = containerRect.height || 1;

  const normalized = rects
    .filter((rect) => {
      if (rect.width <= 1 || rect.height <= 1) return false;

      // Ignore container-wide selection artifacts from the PDF text layer.
      if (rect.width >= width * 0.98 && rect.height >= height * 0.2) return false;
      if (rect.height >= height * 0.2) return false;
      if ((rect.width * rect.height) >= width * height * 0.15) return false;

      return true;
    })
    .map((rect) => ({
      x: (rect.left - containerRect.left) / width,
      y: (rect.top - containerRect.top) / height,
      width: rect.width / width,
      height: rect.height / height,
    }));

  const deduped = [];
  const seen = new Set();

  normalized.forEach((rect) => {
    const key = [
      rect.x.toFixed(4),
      rect.y.toFixed(4),
      rect.width.toFixed(4),
      rect.height.toFixed(4),
    ].join(':');

    if (!seen.has(key)) {
      seen.add(key);
      deduped.push(rect);
    }
  });

  return deduped;
}

export function denormalizeRect(rect, width, height) {
  return {
    left: rect.x * width,
    top: rect.y * height,
    width: rect.width * width,
    height: rect.height * height,
  };
}

export function normalizePoint(point, width, height) {
  return {
    x: point.x / width,
    y: point.y / height,
  };
}

export function denormalizePoint(point, width, height) {
  return {
    x: point.x * width,
    y: point.y * height,
  };
}

export function getHighlightStyle(styleId) {
  return HIGHLIGHT_STYLES.find((style) => style.id === styleId) || HIGHLIGHT_STYLES[1];
}

export function createHighlightFromSelection(selection, color, style = 'medium') {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    color,
    style,
    text: selection.text,
    rects: selection.rects,
    createdAt: Date.now(),
  };
}
