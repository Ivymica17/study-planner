export const HIGHLIGHT_COLORS = [
  { name: 'Yellow', value: '#facc15' },
  { name: 'Green', value: '#4ade80' },
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

export function getWorkspaceStorageKey(moduleId) {
  return `${STORAGE_PREFIX}:${moduleId}`;
}

export function createEmptyWorkspaceState() {
  return {
    currentPage: 1,
    zoom: 100,
    highlightsByPage: {},
    drawingsByPage: {},
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
    };
  } catch (error) {
    console.error('Failed to load study workspace state:', error);
    return createEmptyWorkspaceState();
  }
}

export function saveWorkspaceState(moduleId, state) {
  if (!moduleId) return;

  const payload = {
    currentPage: state.currentPage,
    zoom: state.zoom,
    highlightsByPage: state.highlightsByPage || {},
    drawingsByPage: state.drawingsByPage || {},
  };

  localStorage.setItem(getWorkspaceStorageKey(moduleId), JSON.stringify(payload));
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

  return rects
    .filter((rect) => rect.width > 1 && rect.height > 1)
    .map((rect) => ({
      x: (rect.left - containerRect.left) / width,
      y: (rect.top - containerRect.top) / height,
      width: rect.width / width,
      height: rect.height / height,
    }));
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
