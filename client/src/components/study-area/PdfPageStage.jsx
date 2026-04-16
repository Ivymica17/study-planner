import { useEffect, useMemo, useRef, useState } from 'react';
import { Page } from 'react-pdf';
import {
  denormalizePoint,
  denormalizeRect,
  getHighlightStyle,
  normalizeClientRects,
  normalizePoint,
} from '../../utils/studyWorkspace';

function extractPreciseSelectionRects(range, stage) {
  const stageRect = stage.getBoundingClientRect();

  return Array.from(range.getClientRects()).filter((rect) => {
    if (rect.width <= 1 || rect.height <= 1) return false;
    if (rect.right <= stageRect.left || rect.left >= stageRect.right) return false;
    if (rect.bottom <= stageRect.top || rect.top >= stageRect.bottom) return false;
    return true;
  });
}

function isNodeWithinStage(stage, node) {
  if (!stage || !node) return false;
  if (stage.contains(node)) return true;
  const elementNode = node.nodeType === Node.TEXT_NODE ? node.parentNode : node;
  return Boolean(elementNode && stage.contains(elementNode));
}

function drawStroke(ctx, stroke, width, height) {
  if (!stroke?.points?.length) return;

  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = stroke.color;
  ctx.lineWidth = stroke.size;
  ctx.globalCompositeOperation = stroke.tool === 'eraser' ? 'destination-out' : 'source-over';

  stroke.points.forEach((point, index) => {
    const { x, y } = denormalizePoint(point, width, height);
    if (index === 0) {
      ctx.beginPath();
      ctx.moveTo(x, y);
      return;
    }
    ctx.lineTo(x, y);
  });

  ctx.stroke();
  ctx.restore();
}

export default function PdfPageStage({
  pageNumber,
  zoom,
  activeTool,
  highlights,
  drawingState,
  brushColor,
  brushSize,
  highlightColor,
  highlightStyle,
  onSelectionChange,
  onAddStroke,
  onAddHighlight,
  onRemoveHighlight,
  onPageRenderSuccess,
  onPageRenderError,
}) {
  const stageRef = useRef(null);
  const canvasRef = useRef(null);
  const draftStrokeRef = useRef(null);
  const draftHighlightRef = useRef(null);
  const selectionFrameRef = useRef(null);
  const [stageSize, setStageSize] = useState({ width: 0, height: 0 });
  const [draftHighlightRect, setDraftHighlightRect] = useState(null);

  const canvasClassName = useMemo(() => {
    if (activeTool === 'pen') return 'pointer-events-auto cursor-crosshair';
    if (activeTool === 'eraser') return 'pointer-events-auto cursor-cell';
    return 'pointer-events-none';
  }, [activeTool]);

  const stageCursorClassName = useMemo(() => {
    if (activeTool === 'highlighter') return 'cursor-crosshair';
    if (activeTool === 'remove-highlight') return 'cursor-pointer';
    return '';
  }, [activeTool]);

  const getMarkerHeight = () => {
    switch (highlightStyle) {
      case 'fine':
        return 10;
      case 'broad':
        return 18;
      case 'block':
        return 24;
      case 'medium':
      default:
        return 14;
    }
  };

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return undefined;

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const { width, height } = entry.contentRect;
      setStageSize({ width, height });
    });

    observer.observe(stage);
    return () => observer.disconnect();
  }, []);

  useEffect(() => () => {
    if (selectionFrameRef.current) {
      window.cancelAnimationFrame(selectionFrameRef.current);
    }
  }, []);

  useEffect(() => {
    if (activeTool !== 'select') {
      return undefined;
    }

    const handlePointerUp = () => {
      scheduleCommitSelection();
    };

    document.addEventListener('pointerup', handlePointerUp, true);
    document.addEventListener('mouseup', handlePointerUp, true);
    document.addEventListener('touchend', handlePointerUp, true);
    return () => {
      document.removeEventListener('pointerup', handlePointerUp, true);
      document.removeEventListener('mouseup', handlePointerUp, true);
      document.removeEventListener('touchend', handlePointerUp, true);
    };
  }, [activeTool, pageNumber]);

  useEffect(() => {
    if (activeTool !== 'select') {
      return undefined;
    }

    const handleSelectionChange = () => {
      scheduleCommitSelection();
    };

    document.addEventListener('selectionchange', handleSelectionChange);
    return () => {
      document.removeEventListener('selectionchange', handleSelectionChange);
    };
  }, [activeTool, pageNumber]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !stageSize.width || !stageSize.height) return;

    const ratio = window.devicePixelRatio || 1;
    canvas.width = Math.floor(stageSize.width * ratio);
    canvas.height = Math.floor(stageSize.height * ratio);
    canvas.style.width = `${stageSize.width}px`;
    canvas.style.height = `${stageSize.height}px`;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, stageSize.width, stageSize.height);

    (drawingState?.strokes || []).forEach((stroke) => drawStroke(ctx, stroke, stageSize.width, stageSize.height));
  }, [drawingState, stageSize]);

  const getCanvasPoint = (event) => {
    const rect = canvasRef.current.getBoundingClientRect();
    return {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    };
  };

  const commitSelection = () => {
    if (activeTool !== 'select' && activeTool !== 'highlighter') {
      onSelectionChange(null);
      return;
    }

    const selection = window.getSelection();
    const stage = stageRef.current;
    if (!selection || selection.rangeCount === 0 || !stage) {
      if (activeTool === 'select') {
        onSelectionChange(null);
      }
      return;
    }

    const range = selection.getRangeAt(0);
    const startInside = isNodeWithinStage(stage, range.startContainer);
    const endInside = isNodeWithinStage(stage, range.endContainer);
    const commonInside = isNodeWithinStage(stage, range.commonAncestorContainer);

    if (selection.isCollapsed || (!commonInside && !startInside && !endInside)) {
      if (activeTool === 'select') {
        onSelectionChange(null);
      }
      return;
    }

    const rects = normalizeClientRects(
      extractPreciseSelectionRects(range, stage),
      stage.getBoundingClientRect(),
    );
    if (rects.length === 0) {
      if (activeTool === 'select') {
        onSelectionChange(null);
      }
      return;
    }

    const selectionData = {
      pageNumber,
      text: selection.toString(),
      rects,
    };

    onSelectionChange(selectionData);
  };

  const scheduleCommitSelection = () => {
    if (selectionFrameRef.current) {
      window.cancelAnimationFrame(selectionFrameRef.current);
    }

    // Let the browser finish the text selection update before reading it.
    selectionFrameRef.current = window.requestAnimationFrame(() => {
      selectionFrameRef.current = null;
      commitSelection();
    });
  };

  const handlePointerDown = (event) => {
    if (activeTool === 'highlighter') {
      event.preventDefault();
      const rect = stageRef.current?.getBoundingClientRect();
      if (!rect) return;

      const start = {
        x: event.clientX - rect.left,
        y: event.clientY - rect.top,
      };

      draftHighlightRef.current = { start };
      const markerHeight = getMarkerHeight();
      setDraftHighlightRect({
        left: start.x,
        top: Math.max(0, start.y - markerHeight / 2),
        width: 0,
        height: markerHeight,
      });
      return;
    }

    if (activeTool !== 'pen' && activeTool !== 'eraser') return;
    const stage = stageRef.current;
    if (!stage) return;

    canvasRef.current.setPointerCapture(event.pointerId);
    const point = getCanvasPoint(event);
    draftStrokeRef.current = {
      tool: activeTool,
      color: brushColor,
      size: brushSize,
      points: [normalizePoint(point, stageSize.width, stageSize.height)],
    };
  };

  const handlePointerMove = (event) => {
    if (activeTool === 'highlighter' && draftHighlightRef.current) {
      event.preventDefault();
      const rect = stageRef.current?.getBoundingClientRect();
      if (!rect) return;

      const current = {
        x: event.clientX - rect.left,
        y: event.clientY - rect.top,
      };

      const { start } = draftHighlightRef.current;
      const markerHeight = getMarkerHeight();
      setDraftHighlightRect({
        left: Math.min(start.x, current.x),
        top: Math.max(0, start.y - markerHeight / 2),
        width: Math.abs(current.x - start.x),
        height: markerHeight,
      });
      return;
    }

    if (!draftStrokeRef.current || (activeTool !== 'pen' && activeTool !== 'eraser')) return;

    const point = getCanvasPoint(event);
    draftStrokeRef.current.points.push(normalizePoint(point, stageSize.width, stageSize.height));

    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, stageSize.width, stageSize.height);
    (drawingState?.strokes || []).forEach((stroke) => drawStroke(ctx, stroke, stageSize.width, stageSize.height));
    drawStroke(ctx, draftStrokeRef.current, stageSize.width, stageSize.height);
  };

  const finalizeStroke = (event) => {
    if (activeTool === 'highlighter' && draftHighlightRef.current) {
      event.preventDefault();
      const rect = stageRef.current?.getBoundingClientRect();
      if (!rect) {
        draftHighlightRef.current = null;
        setDraftHighlightRect(null);
        return;
      }

      const current = {
        x: event.clientX - rect.left,
        y: event.clientY - rect.top,
      };
      const { start } = draftHighlightRef.current;
      const markerHeight = getMarkerHeight();
      const left = Math.min(start.x, current.x);
      const top = Math.max(0, start.y - markerHeight / 2);
      const width = Math.abs(current.x - start.x);
      const height = markerHeight;

      draftHighlightRef.current = null;
      setDraftHighlightRect(null);

      if (width < 6) return;

      onAddHighlight(pageNumber, {
        pageNumber,
        text: '',
        rects: [{
          x: left / stageSize.width,
          y: top / stageSize.height,
          width: width / stageSize.width,
          height: height / stageSize.height,
        }],
      }, highlightColor);
      onSelectionChange(null);
      return;
    }

    if (!draftStrokeRef.current || (activeTool !== 'pen' && activeTool !== 'eraser')) return;

    if (canvasRef.current?.hasPointerCapture(event.pointerId)) {
      canvasRef.current.releasePointerCapture(event.pointerId);
    }

    const draft = draftStrokeRef.current;
    draftStrokeRef.current = null;

    if (draft.points.length === 1) {
      draft.points.push({ ...draft.points[0] });
    }

    onAddStroke(pageNumber, draft);
  };

  return (
    <div className="flex min-h-full items-start justify-center px-4 py-6 lg:px-8">
      <div
        className="study-page-shell inline-block max-w-full rounded-[28px] border border-slate-200 bg-white p-4 shadow-[0_28px_80px_rgba(15,23,42,0.08)]"
      >
        <div
          ref={stageRef}
          className={`study-page-stage relative overflow-hidden rounded-[22px] bg-white ${stageCursorClassName}`}
        >
          <div className="pointer-events-none absolute inset-0 z-[5]">
            {highlights.map((highlight) => (
              <div key={highlight.id}>
                {highlight.rects.map((rect, index) => {
                  const box = denormalizeRect(rect, stageSize.width, stageSize.height);
                  const style = getHighlightStyle(highlight.style);
                  const verticalInset = box.height * style.paddingY;
                  const horizontalInset = Math.min(Math.max(box.width * 0.04, 1), 4);
                  return (
                    <button
                      key={`${highlight.id}-${index}`}
                      type="button"
                      onClick={() => activeTool === 'remove-highlight' && onRemoveHighlight(pageNumber, highlight.id)}
                      className={`absolute rounded-[6px] mix-blend-multiply ${
                        activeTool === 'remove-highlight' ? 'pointer-events-auto cursor-pointer hover:opacity-55' : 'pointer-events-none'
                      }`}
                      style={{
                        left: `${box.left + horizontalInset}px`,
                        top: `${box.top - verticalInset}px`,
                        width: `${Math.max(box.width - horizontalInset * 2, 2)}px`,
                        height: `${box.height + verticalInset * 2}px`,
                        backgroundColor: highlight.color,
                        opacity: style.opacity,
                      }}
                      aria-label="Saved highlight"
                    />
                  );
                })}
              </div>
            ))}
            {draftHighlightRect && (
              <div
                className="absolute rounded-[6px] mix-blend-multiply"
                style={{
                  left: `${draftHighlightRect.left}px`,
                  top: `${draftHighlightRect.top}px`,
                  width: `${Math.max(draftHighlightRect.width, 2)}px`,
                  height: `${draftHighlightRect.height}px`,
                  backgroundColor: highlightColor,
                  opacity: getHighlightStyle(highlightStyle).opacity,
                }}
              />
            )}
          </div>

          <Page
            pageNumber={pageNumber}
            scale={zoom / 100}
            renderAnnotationLayer={false}
            renderTextLayer
            onRenderSuccess={onPageRenderSuccess}
            onRenderError={onPageRenderError}
            onRenderTextLayerSuccess={onPageRenderSuccess}
            loading={<div className="flex h-[900px] items-center justify-center text-sm text-slate-500">Rendering page...</div>}
            className="study-pdf-page relative z-[1]"
          />

          <canvas
            ref={canvasRef}
            className={`absolute inset-0 z-[9] ${canvasClassName}`}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={finalizeStroke}
            onPointerCancel={finalizeStroke}
          />
          <div
            className={`absolute inset-0 z-[8] ${activeTool === 'highlighter' ? 'pointer-events-auto' : 'pointer-events-none'}`}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={finalizeStroke}
            onPointerCancel={finalizeStroke}
          />
        </div>
      </div>
    </div>
  );
}
