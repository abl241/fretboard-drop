import { useEffect, useRef, type CSSProperties, type PointerEvent } from "react";
import { RotateCcw } from "lucide-react";
import {
  DROP_STATS_3D_INLAY_FRETS,
  DROP_STATS_3D_VIEW_PRESETS,
  DROP_STATS_3D_ZOOM_LIMITS,
  DROP_STATS_3D_ZOOM_STEP,
  clampDropStats3DZoom,
  clampDropStats3DRotation,
  getDropStats3DStringThickness,
  getDropStatsCellVisual,
  getDropStatsColumnHeight,
  getDropStatsMetricLabel,
  getEvidenceDisplayLabel,
  getFretDisplayLabel,
  type DropStats3DRotation,
  type DropStatsCellViewModel,
  type DropStatsFretboardViewModel,
  type DropStatsMetric,
} from "./dropFretboardStats";
import { FretboardDropStats3DHeadstock, type FretboardDropStats3DHeadstockString } from "./FretboardDropStats3DHeadstock";

type Stats3DStyle = CSSProperties & Record<`--${string}`, string>;

type DragState = {
  pointerId: number;
  startX: number;
  startY: number;
  startRotation: DropStats3DRotation;
};

const HEADSTOCK_UNITS = 1.55;
const OPEN_ZONE_UNITS = 0.9;
const WHEEL_ZOOM_DELTA_THRESHOLD = 36;

export function FretboardDropStats3D({
  viewModel,
  frets,
  metric,
  selectedCellId,
  rotation,
  zoom,
  prefersReducedMotion,
  onRotationChange,
  onZoomChange,
  onResetView,
  onSelectCell,
}: {
  viewModel: DropStatsFretboardViewModel;
  frets: readonly number[];
  metric: DropStatsMetric;
  selectedCellId: string | null;
  rotation: DropStats3DRotation;
  zoom: number;
  prefersReducedMotion: boolean;
  onRotationChange: (rotation: DropStats3DRotation) => void;
  onZoomChange: (zoom: number) => void;
  onResetView: () => void;
  onSelectCell: (cellId: string) => void;
}) {
  const dragRef = useRef<DragState | null>(null);
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const wheelDeltaRef = useRef(0);
  const stringCount = viewModel.strings.length;
  const fretCount = frets.length;
  const frettedCount = Math.max(1, fretCount - 1);
  const selectedCell = viewModel.strings.flatMap((stringRow) => stringRow.cells).find((cell) => cell.cellId === selectedCellId) ?? null;
  const selectedStringPosition = selectedCell
    ? viewModel.strings.findIndex((stringRow) => stringRow.stringIndex === selectedCell.stringIndex)
    : -1;
  const headstockEnd = getHeadstockEndPercent(frettedCount);
  const openCenter = getOpenZoneCenterPercent(frettedCount);
  const nutPosition = getNutPositionPercent(frettedCount);
  const headstockStrings: FretboardDropStats3DHeadstockString[] = viewModel.strings.map((stringRow, stringPosition) => ({
    id: String(stringRow.stringIndex),
    label: stringRow.stringLabel,
    top: getStringPositionPercent(stringPosition, stringCount),
  }));

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;

    function handleWheel(event: WheelEvent) {
      if ((event.target as HTMLElement | null)?.closest("button")) return;
      if (event.deltaY === 0) return;
      wheelDeltaRef.current += event.deltaY;
      if (Math.abs(wheelDeltaRef.current) < WHEEL_ZOOM_DELTA_THRESHOLD) return;

      const zoomDirection = wheelDeltaRef.current < 0 ? 1 : -1;
      wheelDeltaRef.current = 0;
      const nextZoom = clampDropStats3DZoom(zoom + zoomDirection * DROP_STATS_3D_ZOOM_STEP);
      if (nextZoom === zoom) return;
      event.preventDefault();
      onZoomChange(nextZoom);
    }

    viewport.addEventListener("wheel", handleWheel, { passive: false });
    return () => viewport.removeEventListener("wheel", handleWheel);
  }, [onZoomChange, zoom]);

  function handlePointerDown(event: PointerEvent<HTMLDivElement>) {
    if ((event.target as HTMLElement).closest("button")) return;
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startRotation: rotation,
    };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  }

  function handlePointerMove(event: PointerEvent<HTMLDivElement>) {
    const dragState = dragRef.current;
    if (!dragState || dragState.pointerId !== event.pointerId) return;
    const nextRotation = clampDropStats3DRotation({
      pitch: dragState.startRotation.pitch + (event.clientY - dragState.startY) * 0.12,
      yaw: dragState.startRotation.yaw + (event.clientX - dragState.startX) * 0.16,
    });
    onRotationChange(nextRotation);
  }

  function handlePointerUp(event: PointerEvent<HTMLDivElement>) {
    if (dragRef.current?.pointerId === event.pointerId) {
      dragRef.current = null;
      event.currentTarget.releasePointerCapture?.(event.pointerId);
    }
  }

  return (
    <section
      className={`drop-stats-3d-view mt-4 rounded-lg border border-cyan-200/18 bg-slate-950/56 p-3 ${prefersReducedMotion ? "drop-stats-3d-reduced-motion" : ""}`}
      aria-label={`${getDropStatsMetricLabel(metric)} 3D Explore fretboard`}
      data-testid="stats-3d-view"
      data-pitch={rotation.pitch}
      data-yaw={rotation.yaw}
      data-zoom={zoom}
    >
      <div className="drop-stats-3d-toolbar mb-2 flex flex-wrap items-center justify-end gap-1.5">
        <div className="drop-stats-3d-preset-group flex items-center gap-1" aria-label="3D view presets" role="group">
          {Object.entries(DROP_STATS_3D_VIEW_PRESETS).map(([presetId, preset]) => {
            const isSelected = rotation.pitch === preset.rotation.pitch && rotation.yaw === preset.rotation.yaw;
            return (
              <button
                key={presetId}
                type="button"
                aria-pressed={isSelected}
                onClick={() => onRotationChange(preset.rotation)}
                className={`drop-stats-3d-preset-button inline-flex min-h-8 items-center justify-center rounded-md border px-2.5 text-xs font-black transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-200 ${
                  isSelected
                    ? "border-amber-100 bg-amber-200 text-slate-950"
                    : "border-slate-700/80 bg-slate-950/52 text-slate-300 hover:border-cyan-200/70 hover:text-cyan-100"
                }`}
              >
                {preset.label}
              </button>
            );
          })}
        </div>
        <button
          type="button"
          aria-label="Zoom out"
          disabled={zoom <= DROP_STATS_3D_ZOOM_LIMITS.min}
          onClick={() => onZoomChange(clampDropStats3DZoom(zoom - DROP_STATS_3D_ZOOM_STEP))}
          className="drop-stats-3d-zoom-button inline-flex min-h-8 min-w-8 items-center justify-center rounded-md border border-slate-700/80 bg-slate-950/52 px-2 text-sm font-black text-slate-300 transition hover:border-cyan-200/70 hover:text-cyan-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-200 disabled:cursor-not-allowed disabled:opacity-45"
        >
          −
        </button>
        <button
          type="button"
          aria-label="Zoom in"
          disabled={zoom >= DROP_STATS_3D_ZOOM_LIMITS.max}
          onClick={() => onZoomChange(clampDropStats3DZoom(zoom + DROP_STATS_3D_ZOOM_STEP))}
          className="drop-stats-3d-zoom-button inline-flex min-h-8 min-w-8 items-center justify-center rounded-md border border-slate-700/80 bg-slate-950/52 px-2 text-sm font-black text-slate-300 transition hover:border-cyan-200/70 hover:text-cyan-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-200 disabled:cursor-not-allowed disabled:opacity-45"
        >
          +
        </button>
        <button
          type="button"
          onClick={onResetView}
          className="inline-flex min-h-8 items-center justify-center gap-1.5 rounded-md border border-slate-700/80 bg-slate-950/52 px-2.5 text-xs font-black text-slate-300 transition hover:border-cyan-200/70 hover:text-cyan-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-200"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          Reset view
        </button>
      </div>
      <div
        ref={viewportRef}
        className="drop-stats-3d-viewport"
        data-testid="stats-3d-viewport"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      >
        <div
          className="drop-stats-3d-neck"
          style={{
            "--stats-3d-pitch": `${rotation.pitch}deg`,
            "--stats-3d-yaw": `${rotation.yaw}deg`,
            "--stats-3d-zoom": `${zoom}`,
            "--stats-3d-headstock-end": headstockEnd,
            "--stats-3d-open-center": openCenter,
            "--stats-3d-nut-left": nutPosition,
            "--stats-3d-board-surface-z": "0px",
          } as Stats3DStyle}
        >
          <FretboardDropStats3DHeadstock strings={headstockStrings} />
          <div
            className="drop-stats-3d-fretboard-surface"
            data-testid="stats-3d-fretboard-surface"
            aria-hidden="true"
          />
          <span
            className="drop-stats-3d-open-zone"
            data-testid="stats-3d-open-zone"
            data-open-center={openCenter}
            style={{
              "--stats-3d-open-zone-left": headstockEnd,
              "--stats-3d-open-zone-width": `${OPEN_ZONE_UNITS / getTotalSceneUnits(frettedCount) * 100}%`,
            } as Stats3DStyle}
            aria-hidden="true"
          />
          <span
            className="drop-stats-3d-nut"
            data-testid="stats-3d-nut"
            data-left={nutPosition}
            aria-hidden="true"
          />
          {frets.filter((fret) => fret > 0).map((fret) => (
            <span
              key={`fret-${fret}`}
              className="drop-stats-3d-fret-wire"
              data-testid="stats-3d-fret-wire"
              data-fret={fret}
              style={{ "--stats-3d-fret-left": `${getFretWirePositionPercent(fret, frettedCount)}` } as Stats3DStyle}
              aria-hidden="true"
            />
          ))}
          {frets.map((fret) => (
            <span
              key={`fret-label-${fret}`}
              className="drop-stats-3d-fret-label"
              data-zone={fret === 0 ? "open" : "fretted"}
              data-fret={fret}
              data-fret-position={getFretPositionPercent(fret, frettedCount)}
              style={{
                "--stats-3d-fret-label-left": `${getFretPositionPercent(fret, frettedCount)}`,
              } as Stats3DStyle}
              data-testid="stats-3d-fret-label"
            >
              {fret === 0 ? "Open" : fret}
            </span>
          ))}
          {viewModel.strings.map((stringRow, stringPosition) => {
            const stringTop = getStringPositionPercent(stringPosition, stringCount);
            return (
              <span
                key={stringRow.stringIndex}
                className="drop-stats-3d-string-rail"
                data-testid={`stats-3d-string-rail-${stringRow.stringIndex}`}
                data-string-position={stringPosition}
                style={{
                  "--stats-3d-string-top": stringTop,
                  "--stats-3d-string-thickness": `${getDropStats3DStringThickness(stringPosition)}px`,
                } as Stats3DStyle}
                aria-hidden="true"
              />
            );
          })}
          {viewModel.strings.map((stringRow, stringPosition) => (
            <span
              key={`label-${stringRow.stringIndex}`}
              className="drop-stats-3d-string-label"
              data-testid="stats-3d-string-label"
              data-string-position={stringPosition}
              style={{
                "--stats-3d-string-top": getStringPositionPercent(stringPosition, stringCount),
              } as Stats3DStyle}
            >
              {stringRow.stringLabel}
            </span>
          ))}
          {frets.filter((fret) => (DROP_STATS_3D_INLAY_FRETS as readonly number[]).includes(fret)).map((fret) => (
            <span
              key={`inlay-${fret}`}
              className="drop-stats-3d-fret-inlay"
              data-testid={`stats-3d-inlay-${fret}`}
              data-inlay-position={getInlayTexturePosition(fret)}
              style={{
                "--stats-3d-inlay-left": `${getFretPositionPercent(fret, frettedCount)}`,
                "--drop-stats-3d-inlay-position": getInlayTexturePosition(fret),
              } as Stats3DStyle}
              aria-hidden="true"
            />
          ))}
          {viewModel.strings.flatMap((stringRow, stringPosition) => (
            stringRow.cells.map((cell) => (
              <Stats3DColumn
                key={cell.cellId}
                cell={cell}
                metric={metric}
                frettedCount={frettedCount}
                stringCount={stringCount}
                stringPosition={stringPosition}
                isSelected={cell.cellId === selectedCellId}
                onSelect={() => onSelectCell(cell.cellId)}
              />
            ))
          ))}
          {selectedCell ? (
            <div
              className="drop-stats-3d-floating-label"
              data-testid="stats-3d-selected-label"
              data-string-position={selectedStringPosition}
              style={{
                "--stats-3d-column-left": `${getFretPositionPercent(selectedCell.fret, frettedCount)}`,
                "--stats-3d-column-top": `${getStringPositionPercent(selectedStringPosition, stringCount)}`,
                "--stats-3d-column-height": `${getDropStatsColumnHeight(metric, selectedCell)}px`,
              } as Stats3DStyle}
              aria-hidden="true"
            >
              <span className="drop-stats-3d-floating-location">{getStats3DLocationLabel(selectedCell)}</span>
              <span className="drop-stats-3d-floating-metric">{getStats3DMetricLine(metric, selectedCell)}</span>
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}

function Stats3DColumn({
  cell,
  metric,
  frettedCount,
  stringCount,
  stringPosition,
  isSelected,
  onSelect,
}: {
  cell: DropStatsCellViewModel;
  metric: DropStatsMetric;
  frettedCount: number;
  stringCount: number;
  stringPosition: number;
  isSelected: boolean;
  onSelect: () => void;
}) {
  const visual = getDropStatsCellVisual(metric, cell);
  const columnHeight = getDropStatsColumnHeight(metric, cell);
  const filteredOpacity = cell.isFilteredIn ? 1 : 0.24;
  const hoverLabel = getStats3DHoverLabel(metric, cell);
  const label = `${cell.accessibleLabel} 3D column category: ${visual.categoryLabel}. ${hoverLabel}.`;
  const columnWidth = cell.fret === 0 ? 16 : 20;
  const columnDepth = 13;
  const halfHeight = columnHeight / 2;
  const halfWidth = columnWidth / 2;
  const halfDepth = columnDepth / 2;
  return (
    <>
      <button
        type="button"
        className={`drop-stats-3d-column ${cell.isScored ? "" : "drop-stats-3d-column-unscored"}`}
        aria-label={label}
        aria-pressed={isSelected}
        data-testid={`stats-3d-cell-${cell.cellId}`}
        data-string-position={stringPosition}
        data-fret={cell.fret}
        data-zone={cell.fret === 0 ? "open" : "fretted"}
        data-fret-position={getFretPositionPercent(cell.fret, frettedCount)}
        data-column-height={columnHeight}
        data-board-surface="0"
        data-cuboid-bottom="0"
        data-cuboid-body-center={halfHeight}
        data-cuboid-top={columnHeight}
        onClick={onSelect}
        style={{
          "--stats-3d-column-left": `${getFretPositionPercent(cell.fret, frettedCount)}`,
          "--stats-3d-column-top": `${getStringPositionPercent(stringPosition, stringCount)}`,
          "--stats-3d-column-height": `${columnHeight}px`,
          "--stats-3d-column-width": `${columnWidth}px`,
          "--stats-3d-column-depth": `${columnDepth}px`,
          "--stats-3d-column-half-height": `${halfHeight}px`,
          "--stats-3d-column-half-width": `${halfWidth}px`,
          "--stats-3d-column-half-depth": `${halfDepth}px`,
          "--stats-3d-column-side-left": `${(columnWidth - columnDepth) / 2}px`,
          "--stats-3d-column-cap-top": `${(columnHeight - columnDepth) / 2}px`,
          "--stats-3d-column-color": visual.backgroundColor,
          "--stats-3d-column-side": visual.sideColor,
          "--stats-3d-column-border": visual.borderColor,
          "--stats-3d-column-opacity": `${filteredOpacity}`,
          "--stats-3d-cuboid-bottom": "0px",
        } as Stats3DStyle}
      >
        <span className="drop-stats-3d-column-contact" aria-hidden="true" />
        <span className="drop-stats-3d-cuboid" aria-hidden="true">
          <span className="drop-stats-3d-column-face drop-stats-3d-column-face-front" />
          <span className="drop-stats-3d-column-face drop-stats-3d-column-face-back" />
          <span className="drop-stats-3d-column-face drop-stats-3d-column-face-left" />
          <span className="drop-stats-3d-column-face drop-stats-3d-column-face-right" />
          <span className="drop-stats-3d-column-face drop-stats-3d-column-face-top" />
          <span className="drop-stats-3d-column-face drop-stats-3d-column-face-bottom" />
          {isSelected ? (
            <span className="drop-stats-3d-column-note">{cell.note}</span>
          ) : null}
        </span>
        <span className="sr-only">{cell.note} {cell.stringLabel} {getFretDisplayLabel(cell.fret)}</span>
      </button>
      <span
        className="drop-stats-3d-column-hover-label"
        data-testid={`stats-3d-hover-label-${cell.cellId}`}
        data-overlay="pointer-neutral"
        data-column-height={columnHeight}
        aria-hidden="true"
        style={{
          "--stats-3d-column-left": `${getFretPositionPercent(cell.fret, frettedCount)}`,
          "--stats-3d-column-top": `${getStringPositionPercent(stringPosition, stringCount)}`,
          "--stats-3d-column-height": `${columnHeight}px`,
        } as Stats3DStyle}
      >
        {hoverLabel}
      </span>
    </>
  );
}

function getStringPositionPercent(stringPosition: number, stringCount: number): string {
  return `${((stringPosition + 0.5) / stringCount) * 100}%`;
}

function getTotalSceneUnits(frettedCount: number): number {
  return HEADSTOCK_UNITS + OPEN_ZONE_UNITS + frettedCount;
}

function getHeadstockEndPercent(frettedCount: number): string {
  return `${HEADSTOCK_UNITS / getTotalSceneUnits(frettedCount) * 100}%`;
}

function getOpenZoneCenterPercent(frettedCount: number): string {
  return `${(HEADSTOCK_UNITS + OPEN_ZONE_UNITS / 2) / getTotalSceneUnits(frettedCount) * 100}%`;
}

function getNutPositionPercent(frettedCount: number): string {
  return `${(HEADSTOCK_UNITS + OPEN_ZONE_UNITS) / getTotalSceneUnits(frettedCount) * 100}%`;
}

function getFretPositionPercent(fret: number, frettedCount: number): string {
  const totalUnits = getTotalSceneUnits(frettedCount);
  if (fret === 0) return getOpenZoneCenterPercent(frettedCount);
  return `${(HEADSTOCK_UNITS + OPEN_ZONE_UNITS + (fret - 0.5)) / totalUnits * 100}%`;
}

function getFretWirePositionPercent(fret: number, frettedCount: number): string {
  return `${(HEADSTOCK_UNITS + OPEN_ZONE_UNITS + fret) / getTotalSceneUnits(frettedCount) * 100}%`;
}

function getInlayTexturePosition(fret: number): string {
  if (fret === 3) return "20% 25%";
  if (fret === 5) return "55% 45%";
  if (fret === 7) return "75% 65%";
  if (fret === 9) return "35% 80%";
  return "center";
}

function getStats3DLocationLabel(cell: DropStatsCellViewModel): string {
  return `${cell.note} · ${cell.stringLabel} · ${getFretDisplayLabel(cell.fret)}`;
}

function getStats3DMetricValueLabel(metric: DropStatsMetric, cell: DropStatsCellViewModel): string {
  if (cell.metricValue === null) return cell.metricLabel;
  if (metric === "accuracy") return `${cell.metricValue}% accuracy`;
  if (metric === "attempts") return `${cell.metricValue} attempt${cell.metricValue === 1 ? "" : "s"}`;
  if (metric === "recall-speed") return `${cell.metricValue} speed`;
  return `${cell.metricValue} Fluency`;
}

function getStats3DMetricLine(metric: DropStatsMetric, cell: DropStatsCellViewModel): string {
  const visual = getDropStatsCellVisual(metric, cell);
  return `${getStats3DMetricValueLabel(metric, cell)} · ${visual.categoryLabel} · ${getEvidenceDisplayLabel(cell.evidenceLevel)}`;
}

function getStats3DHoverLabel(metric: DropStatsMetric, cell: DropStatsCellViewModel): string {
  const metricValue = cell.metricValue === null ? cell.metricLabel : `${cell.metricValue}`;
  return `${getStats3DLocationLabel(cell)} · ${metricValue}`;
}
