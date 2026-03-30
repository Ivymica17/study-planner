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
  const root = range.commonAncestorContainer.nodeType === Node.TEXT_NODE
    ? range.commonAncestorContainer.parentNode
    : range.commonAncestorContainer;

  if (!root) return [];

  const rects = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      if (!node.textContent?.trim()) return NodeFilter.FILTER_REJECT;
      if (!stage.contains(node.parentNode)) return NodeFilter.FILTER_REJECT;
      if (typeof range.intersectsNode === 'function' && !range.intersectsNode(node)) {
        return NodeFilter.FILTER_REJECT;
      }
      return NodeFilter.FILTER_ACCEPT;
    },
  });

  let currentNode = walker.nextNode();
  while (currentNode) {
    const nodeRange = document.createRange();
    const startOffset = currentNode === range.startContainer ? range.startOffset : 0;
    const endOffset = currentNode === range.endContainer ? range.endOffset : currentNode.textContent.length;

    if (endOffset > startOffset) {
      nodeRange.setStart(currentNode, startOffset);
      nodeRange.setEnd(currentNode, endOffset);
      rects.push(...Array.from(nodeRange.getClientRects()));
    }

    currentNode = walker.nextNode();
  }

  if (rects.length > 0) return rects;
  return Array.from(range.getClientRects());
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
  const [stageSize, setStageSize] = useState({ width: 0, height: 0 });

  const canvasClassName = useMemo(() => {
    if (activeTool === 'pen') return 'pointer-events-auto cursor-crosshair';
    if (activeTool === 'eraser') return 'pointer-events-auto cursor-cell';
    return 'pointer-events-none';
  }, [activeTool]);

  const stageCursorClassName = useMemo(() => {
    if (activeTool === 'highlighter') return 'cursor-text';
    if (activeTool === 'remove-highlight') return 'cursor-pointer';
    return '';
  }, [activeTool]);

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
      onSelectionChange(null);
      return;
    }

    const range = selection.getRangeAt(0);
    if (selection.isCollapsed || !stage.contains(range.commonAncestorContainer)) {
      onSelectionChange(null);
      return;
    }

    const rects = normalizeClientRects(
      extractPreciseSelectionRects(range, stage),
      stage.getBoundingClientRect(),
    );
    if (rects.length === 0) {
      onSelectionChange(null);
      return;
    }

    const selectionData = {
      pageNumber,
      text: selection.toString(),
      rects,
    };

    if (activeTool === 'highlighter') {
      onAddHighlight(pageNumber, selectionData, highlightColor);
      onSelectionChange(null);
      window.getSelection()?.removeAllRanges();
      return;
    }

    onSelectionChange(selectionData);
  };

  const handlePointerDown = (event) => {
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
        className="study-page-shell w-full max-w-[900px] rounded-[28px] border border-slate-200 bg-white p-4 shadow-[0_28px_80px_rgba(15,23,42,0.08)]"
        style={{ width: `${Math.round(820 * (zoom / 100))}px` }}
      >
        <div
          ref={stageRef}
          className={`study-page-stage relative overflow-hidden rounded-[22px] bg-white ${stageCursorClassName}`}
          onMouseUp={commitSelection}
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
          </div>

          <Page
            pageNumber={pageNumber}
            scale={zoom / 100}
            renderAnnotationLayer={false}
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
        </div>
      </div>
    </div>
  );
}
