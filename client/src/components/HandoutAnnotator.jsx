import { useEffect, useMemo, useRef, useState } from 'react';

const HIGHLIGHT_COLORS = [
  { name: 'Yellow', value: '#fef08a' },
  { name: 'Green', value: '#bbf7d0' },
  { name: 'Blue', value: '#bfdbfe' },
  { name: 'Pink', value: '#fbcfe8' }
];

const PEN_COLORS = ['#111827', '#2563eb', '#dc2626', '#16a34a', '#ca8a04', '#9333ea'];

const escapeHtml = (text) =>
  String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');

export default function HandoutAnnotator({ moduleId, content }) {
  const editorRef = useRef(null);
  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const drawingRef = useRef(false);
  const lastPointRef = useRef({ x: 0, y: 0 });

  const [drawMode, setDrawMode] = useState(false);
  const [eraserMode, setEraserMode] = useState(false);
  const [penColor, setPenColor] = useState(PEN_COLORS[0]);
  const [penSize, setPenSize] = useState(3);
  const [zoom, setZoom] = useState(100);
  const [selectedPage, setSelectedPage] = useState(0);
  const historyRef = useRef([]);
  const historyIndexRef = useRef(-1);
  const [historyVersion, setHistoryVersion] = useState(0);

  const pages = useMemo(() => {
    const raw = String(content || '').trim();
    if (!raw) return ['No content available'];
    const paragraphs = raw.split(/\n\s*\n/).map(p => p.trim()).filter(Boolean);
    const out = [];
    let current = '';
    paragraphs.forEach((p) => {
      if ((current + '\n\n' + p).length > 1700 && current.length > 0) {
        out.push(current);
        current = p;
      } else {
        current = current ? `${current}\n\n${p}` : p;
      }
    });
    if (current) out.push(current);
    return out.length ? out : [raw];
  }, [content]);

  const currentPageText = pages[selectedPage] || '';
  const textStorageKey = useMemo(() => `handout-text-${moduleId}-p${selectedPage}`, [moduleId, selectedPage]);
  const drawStorageKey = useMemo(() => `handout-drawing-${moduleId}-p${selectedPage}`, [moduleId, selectedPage]);

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;

    const saved = localStorage.getItem(textStorageKey);
    if (saved) {
      editor.innerHTML = saved;
      return;
    }

    const initial = escapeHtml(currentPageText || 'No content available').replace(/\n/g, '<br/>');
    editor.innerHTML = initial;
  }, [currentPageText, textStorageKey]);

  const saveEditor = () => {
    const editor = editorRef.current;
    if (!editor) return;
    localStorage.setItem(textStorageKey, editor.innerHTML);
  };

  const applyHighlight = (color) => {
    const editor = editorRef.current;
    if (!editor) return;
    editor.focus();
    document.execCommand('styleWithCSS', false, true);
    document.execCommand('hiliteColor', false, color);
    saveEditor();
  };

  const clearFormatting = () => {
    const editor = editorRef.current;
    if (!editor) return;
    editor.focus();
    document.execCommand('removeFormat', false);
    saveEditor();
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      const { clientWidth, clientHeight } = container;
      canvas.width = Math.max(1, Math.floor(clientWidth * dpr));
      canvas.height = Math.max(1, Math.floor(clientHeight * dpr));
      canvas.style.width = `${clientWidth}px`;
      canvas.style.height = `${clientHeight}px`;

      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      const saved = localStorage.getItem(drawStorageKey);
      if (saved) {
        const img = new Image();
        img.onload = () => {
          ctx.drawImage(img, 0, 0, clientWidth, clientHeight);
          historyRef.current = [saved];
          historyIndexRef.current = 0;
          setHistoryVersion(v => v + 1);
        };
        img.src = saved;
      } else {
        const blank = canvas.toDataURL('image/png');
        historyRef.current = [blank];
        historyIndexRef.current = 0;
        setHistoryVersion(v => v + 1);
      }
    };

    resize();
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, [drawStorageKey]);

  const drawLine = (from, to) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.globalCompositeOperation = eraserMode ? 'destination-out' : 'source-over';
    ctx.strokeStyle = eraserMode ? 'rgba(0,0,0,1)' : penColor;
    ctx.lineWidth = penSize;
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x, to.y);
    ctx.stroke();
  };

  const loadCanvasFromDataUrl = (dataUrl) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const rect = canvas.getBoundingClientRect();
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (!dataUrl) return;
    const img = new Image();
    img.onload = () => {
      ctx.drawImage(img, 0, 0, rect.width, rect.height);
    };
    img.src = dataUrl;
  };

  const pushHistory = (dataUrl) => {
    const base = historyRef.current.slice(0, historyIndexRef.current + 1);
    base.push(dataUrl);
    if (base.length > 30) base.shift();
    historyRef.current = base;
    historyIndexRef.current = base.length - 1;
    setHistoryVersion(v => v + 1);
  };

  const pointFromEvent = (e) => {
    const rect = canvasRef.current.getBoundingClientRect();
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top
    };
  };

  const onPointerDown = (e) => {
    if (!drawMode) return;
    drawingRef.current = true;
    lastPointRef.current = pointFromEvent(e);
  };

  const onPointerMove = (e) => {
    if (!drawMode || !drawingRef.current) return;
    const next = pointFromEvent(e);
    drawLine(lastPointRef.current, next);
    lastPointRef.current = next;
  };

  const onPointerUp = () => {
    if (!drawMode) return;
    drawingRef.current = false;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const data = canvas.toDataURL('image/png');
    localStorage.setItem(drawStorageKey, data);
    pushHistory(data);
  };

  const clearDrawing = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    localStorage.removeItem(drawStorageKey);
    pushHistory(canvas.toDataURL('image/png'));
  };

  const undoDrawing = () => {
    if (historyIndexRef.current <= 0) return;
    historyIndexRef.current -= 1;
    const snap = historyRef.current[historyIndexRef.current];
    loadCanvasFromDataUrl(snap);
    localStorage.setItem(drawStorageKey, snap);
    setHistoryVersion(v => v + 1);
  };

  const redoDrawing = () => {
    if (historyIndexRef.current >= historyRef.current.length - 1) return;
    historyIndexRef.current += 1;
    const snap = historyRef.current[historyIndexRef.current];
    loadCanvasFromDataUrl(snap);
    localStorage.setItem(drawStorageKey, snap);
    setHistoryVersion(v => v + 1);
  };

  const undoText = () => {
    const editor = editorRef.current;
    if (!editor) return;
    editor.focus();
    document.execCommand('undo', false);
    saveEditor();
  };

  const redoText = () => {
    const editor = editorRef.current;
    if (!editor) return;
    editor.focus();
    document.execCommand('redo', false);
    saveEditor();
  };

  const exportAsImage = () => {
    const container = containerRef.current;
    const editor = editorRef.current;
    const drawCanvas = canvasRef.current;
    if (!container || !editor || !drawCanvas) return;

    const width = container.clientWidth;
    const height = container.clientHeight;
    const exportCanvas = document.createElement('canvas');
    exportCanvas.width = width;
    exportCanvas.height = height;
    const ctx = exportCanvas.getContext('2d');
    if (!ctx) return;

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);

    const svg = `
      <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
        <foreignObject width="100%" height="100%">
          <div xmlns="http://www.w3.org/1999/xhtml" style="font-family: Inter, Arial, sans-serif; font-size: 14px; line-height: 1.6; color: #374151; padding: 16px; white-space: pre-wrap;">
            ${editor.innerHTML}
          </div>
        </foreignObject>
      </svg>
    `;
    const textImg = new Image();
    textImg.onload = () => {
      ctx.drawImage(textImg, 0, 0);
      ctx.drawImage(drawCanvas, 0, 0, width, height);

      const link = document.createElement('a');
      link.href = exportCanvas.toDataURL('image/png');
      link.download = `handout-notes-${moduleId}.png`;
      link.click();
    };
    textImg.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  };

  const exportAsPdf = () => {
    const editor = editorRef.current;
    const drawCanvas = canvasRef.current;
    if (!editor || !drawCanvas) return;

    const drawData = drawCanvas.toDataURL('image/png');
    const win = window.open('', '_blank');
    if (!win) return;

    win.document.write(`
      <html>
        <head>
          <title>Handout Notes</title>
          <style>
            body { font-family: Arial, sans-serif; margin: 20px; color: #111827; }
            .text { line-height: 1.6; font-size: 14px; border: 1px solid #ddd; border-radius: 8px; padding: 16px; }
            .drawing { margin-top: 12px; border: 1px solid #ddd; border-radius: 8px; width: 100%; }
          </style>
        </head>
        <body>
          <h2>Handout Notes</h2>
          <div class="text">${editor.innerHTML}</div>
          <h3>Drawing Notes</h3>
          <img class="drawing" src="${drawData}" />
          <script>
            window.onload = function () { window.print(); };
          </script>
        </body>
      </html>
    `);
    win.document.close();
  };

  return (
    <div className="bg-gray-900 rounded-xl shadow-sm border overflow-hidden">
      <div className="flex flex-wrap items-center gap-2 px-4 py-3 bg-gray-800 border-b border-gray-700">
        <button
          type="button"
          onClick={() => setSelectedPage(p => Math.max(0, p - 1))}
          disabled={selectedPage === 0}
          className="px-2 py-1 rounded border text-xs bg-gray-700 text-gray-100 border-gray-600 disabled:opacity-40"
        >
          ◀
        </button>
        <span className="text-gray-100 text-sm">Page {selectedPage + 1} / {pages.length}</span>
        <button
          type="button"
          onClick={() => setSelectedPage(p => Math.min(pages.length - 1, p + 1))}
          disabled={selectedPage >= pages.length - 1}
          className="px-2 py-1 rounded border text-xs bg-gray-700 text-gray-100 border-gray-600 disabled:opacity-40"
        >
          ▶
        </button>

        <div className="w-px h-5 bg-gray-600 mx-1" />
        <button
          type="button"
          onClick={() => setZoom(z => Math.max(70, z - 10))}
          className="px-2 py-1 rounded border text-xs bg-gray-700 text-gray-100 border-gray-600"
        >
          -
        </button>
        <span className="text-gray-100 text-sm w-12 text-center">{zoom}%</span>
        <button
          type="button"
          onClick={() => setZoom(z => Math.min(160, z + 10))}
          className="px-2 py-1 rounded border text-xs bg-gray-700 text-gray-100 border-gray-600"
        >
          +
        </button>

        <div className="w-px h-5 bg-gray-600 mx-1" />
        <p className="text-sm font-semibold text-gray-200 mr-2">Highlight:</p>
        {HIGHLIGHT_COLORS.map((c) => (
          <button
            key={c.value}
            type="button"
            onClick={() => applyHighlight(c.value)}
            className="px-3 py-1 rounded border text-sm"
            style={{ backgroundColor: c.value }}
            title={`Highlight ${c.name}`}
          >
            {c.name}
          </button>
        ))}
        <button
          type="button"
          onClick={clearFormatting}
          className="px-3 py-1 rounded border text-sm bg-gray-100 hover:bg-gray-200"
        >
          Clear Format
        </button>

        <div className="w-px h-6 bg-gray-300 mx-1" />

        <button
          type="button"
          onClick={() => setDrawMode(v => !v)}
          className={`px-3 py-1 rounded border text-sm ${drawMode ? 'bg-blue-600 text-white border-blue-600' : 'bg-gray-100 hover:bg-gray-200'}`}
        >
          {drawMode ? 'Drawing: ON' : 'Drawing: OFF'}
        </button>
        <button
          type="button"
          onClick={() => setEraserMode(v => !v)}
          className={`px-3 py-1 rounded border text-sm ${eraserMode ? 'bg-red-600 text-white border-red-600' : 'bg-gray-100 hover:bg-gray-200'}`}
        >
          {eraserMode ? 'Eraser: ON' : 'Eraser'}
        </button>

        <label className="text-sm text-gray-700">Pen</label>
        <select
          value={penColor}
          onChange={(e) => setPenColor(e.target.value)}
          className="px-2 py-1 border rounded text-sm"
        >
          {PEN_COLORS.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>

        <label className="text-sm text-gray-700">Size</label>
        <input
          type="range"
          min="1"
          max="12"
          value={penSize}
          onChange={(e) => setPenSize(Number(e.target.value))}
        />
        <span className="text-sm text-gray-700 w-6">{penSize}</span>

        <button
          type="button"
          onClick={clearDrawing}
          className="px-3 py-1 rounded border text-sm bg-red-50 text-red-700 border-red-200 hover:bg-red-100"
        >
          Clear Drawing
        </button>
        <button
          type="button"
          onClick={undoDrawing}
          disabled={historyIndexRef.current <= 0}
          className="px-3 py-1 rounded border text-sm bg-gray-100 hover:bg-gray-200 disabled:opacity-50"
        >
          Undo Draw
        </button>
        <button
          type="button"
          onClick={redoDrawing}
          disabled={historyIndexRef.current >= historyRef.current.length - 1}
          className="px-3 py-1 rounded border text-sm bg-gray-100 hover:bg-gray-200 disabled:opacity-50"
        >
          Redo Draw
        </button>
        <button
          type="button"
          onClick={undoText}
          className="px-3 py-1 rounded border text-sm bg-gray-100 hover:bg-gray-200"
        >
          Undo Text
        </button>
        <button
          type="button"
          onClick={redoText}
          className="px-3 py-1 rounded border text-sm bg-gray-100 hover:bg-gray-200"
        >
          Redo Text
        </button>
        <button
          type="button"
          onClick={exportAsImage}
          className="px-3 py-1 rounded border text-sm bg-green-50 text-green-700 border-green-200 hover:bg-green-100"
        >
          Export PNG
        </button>
        <button
          type="button"
          onClick={exportAsPdf}
          className="px-3 py-1 rounded border text-sm bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100"
        >
          Export PDF
        </button>
      </div>

      <div className="flex h-[620px]">
        <aside className="w-24 bg-gray-800 border-r border-gray-700 overflow-y-auto p-2 space-y-2">
          {pages.map((p, idx) => (
            <button
              key={idx}
              onClick={() => setSelectedPage(idx)}
              className={`w-full text-left rounded border p-2 text-[10px] leading-tight ${
                idx === selectedPage ? 'border-blue-400 bg-gray-700 text-gray-100' : 'border-gray-600 bg-gray-800 text-gray-300'
              }`}
            >
              <div className="font-semibold mb-1">Page {idx + 1}</div>
              <div className="line-clamp-6">{p.slice(0, 120)}</div>
            </button>
          ))}
        </aside>

        <div className="flex-1 overflow-auto p-6 bg-gray-800">
          <div
            className="mx-auto origin-top"
            style={{ transform: `scale(${zoom / 100})`, width: '820px' }}
          >
            <div
              ref={containerRef}
              className="relative h-[1060px] rounded-lg border border-gray-300 bg-white shadow-xl"
            >
              <div
                ref={editorRef}
                contentEditable
                suppressContentEditableWarning
                onInput={saveEditor}
                className="absolute inset-0 p-10 text-gray-800 text-[15px] leading-relaxed whitespace-pre-wrap outline-none z-10"
                style={{ userSelect: 'text' }}
              />

              <canvas
                ref={canvasRef}
                className={`absolute inset-0 z-20 ${drawMode ? 'pointer-events-auto cursor-crosshair' : 'pointer-events-none'}`}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerLeave={onPointerUp}
              />
            </div>
          </div>
        </div>
      </div>

      <p className="text-xs text-gray-300 px-4 py-2">
        Notes are saved locally in your browser for this module.
      </p>
      <span className="hidden">{historyVersion}</span>
    </div>
  );
}

