import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, X, Zap } from "lucide-react";
import { DOT_FRETS, type Note } from "@/lib/fretboard";
import { LocalStorageCellProgressRepository, type CellProgressRecord } from "./dropCellProgress";
import {
  DROP_STATS_3D_CANONICAL_ROTATION,
  DROP_STATS_3D_CANONICAL_ZOOM,
  DROP_STATS_3D_VIEW_PRESETS,
  DEFAULT_DROP_FOCUS_PRACTICE_MIN_ATTEMPTS,
  DEFAULT_DROP_FOCUS_PRACTICE_POOL_SIZE,
  DEFAULT_DROP_FOCUS_PRACTICE_THRESHOLD,
  DROP_STATS_METRICS,
  DROP_FOCUS_PRACTICE_MIN_ATTEMPT_OPTIONS,
  DROP_FOCUS_PRACTICE_POOL_SIZE_OPTIONS,
  DROP_FOCUS_PRACTICE_THRESHOLD_OPTIONS,
  buildFocusPracticePool,
  createDropStatsFretboardViewModel,
  getDropStatsCellVisual,
  getAccuracyDetailLabel,
  getDropStatsMetricLabel,
  getDropStatsLegend,
  getEvidenceDisplayLabel,
  getFretDisplayLabel,
  getRecallSpeedDetailLabel,
  toggleDropStatsNoteFilter,
  toggleDropStatsStringFilter,
  type DropStats3DRotation,
  type DropFocusPracticeThreshold,
  type DropStatsCellViewModel,
  type DropStatsFretboardViewModel,
  type DropStatsMetric,
} from "./dropFretboardStats";
import { ALL_DROP_STRING_INDEXES, CURRENT_DROP_NOTE_POOL, DROP_MAX_FRET, DROP_MIN_FRET, getStringFocusLabel } from "./dropGameUtils";
import type { DropFocusPoolCell, DropStringIndex } from "./dropGameTypes";
import { FretboardDropStats3D } from "./FretboardDropStats3D";

type LoadState =
  | { status: "loading"; records: CellProgressRecord[] }
  | { status: "ready"; records: CellProgressRecord[] };

type DropStatsView = "2d" | "3d";

export function FretboardDropStats({
  onBack,
  onPlay,
  onStartFocusPractice,
}: {
  onBack: () => void;
  onPlay: () => void;
  onStartFocusPractice: (focusPool: readonly DropFocusPoolCell[]) => void;
}) {
  const [metric, setMetric] = useState<DropStatsMetric>("fluency");
  const [selectedNotes, setSelectedNotes] = useState<readonly Note[]>(CURRENT_DROP_NOTE_POOL.notes);
  const [selectedStrings, setSelectedStrings] = useState<readonly DropStringIndex[]>(ALL_DROP_STRING_INDEXES);
  const [focusThreshold, setFocusThreshold] = useState<DropFocusPracticeThreshold>(DEFAULT_DROP_FOCUS_PRACTICE_THRESHOLD);
  const [focusMinAttempts, setFocusMinAttempts] = useState(DEFAULT_DROP_FOCUS_PRACTICE_MIN_ATTEMPTS);
  const [focusPoolSize, setFocusPoolSize] = useState(DEFAULT_DROP_FOCUS_PRACTICE_POOL_SIZE);
  const [selectedCellId, setSelectedCellId] = useState<string | null>(null);
  const [statsView, setStatsView] = useState<DropStatsView>("2d");
  const [rotation, setRotation] = useState<DropStats3DRotation>(DROP_STATS_3D_CANONICAL_ROTATION);
  const [zoom, setZoom] = useState(DROP_STATS_3D_CANONICAL_ZOOM);
  const [loadState, setLoadState] = useState<LoadState>({ status: "loading", records: [] });
  const supports3D = useSupportsStats3D();
  const prefersReducedMotion = usePrefersReducedMotion();
  const repository = useMemo(() => new LocalStorageCellProgressRepository(), []);

  useEffect(() => {
    let cancelled = false;
    setLoadState((current) => ({ status: "loading", records: current.records }));
    repository.listCells().then((records) => {
      if (!cancelled) setLoadState({ status: "ready", records });
    }).catch(() => {
      if (!cancelled) setLoadState({ status: "ready", records: [] });
    });
    return () => {
      cancelled = true;
    };
  }, [repository]);

  const viewModel = useMemo(() => createDropStatsFretboardViewModel(loadState.records, metric, {
    selectedNotes,
    selectedStrings,
  }), [loadState.records, metric, selectedNotes, selectedStrings]);
  const frets = Array.from({ length: DROP_MAX_FRET - DROP_MIN_FRET + 1 }, (_, index) => index + DROP_MIN_FRET);
  const selectedCell = useMemo(() => {
    if (!selectedCellId) return null;
    return viewModel.strings.flatMap((stringRow) => stringRow.cells).find((cell) => cell.cellId === selectedCellId) ?? null;
  }, [selectedCellId, viewModel]);
  const legend = getDropStatsLegend(metric);
  const allNotesSelected = selectedNotes.length === CURRENT_DROP_NOTE_POOL.notes.length;
  const allStringsSelected = selectedStrings.length === ALL_DROP_STRING_INDEXES.length;
  const focusPool = useMemo(() => buildFocusPracticePool({
    records: loadState.records,
    selectedNotes,
    selectedStrings,
    threshold: focusThreshold,
    minResolvedAttempts: focusMinAttempts,
    poolSize: focusPoolSize,
  }), [focusMinAttempts, focusPoolSize, focusThreshold, loadState.records, selectedNotes, selectedStrings]);
  const focusEligibleText = focusPool.length === 0
    ? "No sufficiently tested weak cells match these filters."
    : focusPool.length < focusPoolSize
      ? `${focusPool.length} eligible cell${focusPool.length === 1 ? "" : "s"} found. Using all of them.`
      : `${focusPool.length} weak tested cells ready.`;
  function reset3DView() {
    setRotation(DROP_STATS_3D_VIEW_PRESETS.angle.rotation);
    setZoom(DROP_STATS_3D_CANONICAL_ZOOM);
  }

  return (
    <div className="drop-stats-screen flex flex-1 flex-col py-5">
      <div className="drop-stats-header flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.32em] text-cyan-100/70">Stats</p>
          <h1 className="mt-2 text-4xl font-black tracking-tight text-white sm:text-6xl">Your Fretboard</h1>
          <p className="mt-2 max-w-xl text-sm font-semibold leading-relaxed text-slate-300">
            See where practice is turning into recall.
          </p>
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          <button
            type="button"
            onClick={onBack}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-slate-700/80 px-4 text-sm font-bold text-slate-200 transition hover:border-amber-200/60 hover:text-amber-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-200"
          >
            <ArrowLeft className="h-4 w-4" />
            Back
          </button>
          <button
            type="button"
            onClick={onPlay}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-amber-300 px-5 text-sm font-black text-slate-950 shadow-[0_0_28px_rgba(252,211,77,0.24)] transition hover:bg-amber-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-100"
          >
            <Zap className="h-4 w-4" />
            Play
          </button>
        </div>
      </div>

      <div className="drop-stats-controls mt-5 rounded-lg border border-slate-700/70 bg-slate-950/54 p-2">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex flex-wrap gap-1" aria-label="Stats metric" role="group">
              {DROP_STATS_METRICS.map((option) => {
                const isSelected = metric === option;
                return (
                  <button
                    key={option}
                    type="button"
                    aria-pressed={isSelected}
                    onClick={() => setMetric(option)}
                    className={`min-h-9 rounded-md border px-3 text-xs font-black transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-200 ${
                      isSelected
                        ? "border-cyan-100 bg-cyan-200 text-slate-950 shadow-[0_0_20px_rgba(103,232,249,0.18)]"
                        : "border-slate-700/80 bg-slate-950/60 text-slate-300 hover:border-cyan-200/70 hover:text-cyan-100"
                    }`}
                  >
                    {getDropStatsMetricLabel(option)}
                  </button>
                );
              })}
            </div>
            <div className="drop-stats-view-toggle flex flex-wrap gap-1 border-l border-slate-700/70 pl-2" aria-label="Stats view" role="group">
              {(["2d", "3d"] as const).map((option) => {
                const isSelected = statsView === option;
                return (
                  <button
                    key={option}
                    type="button"
                    aria-pressed={isSelected}
                    onClick={() => setStatsView(option)}
                    className={`min-h-9 rounded-md border px-3 text-xs font-black transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-200 ${
                      isSelected
                        ? "border-amber-100 bg-amber-200 text-slate-950 shadow-[0_0_20px_rgba(252,211,77,0.14)]"
                        : "border-slate-700/80 bg-slate-950/60 text-slate-300 hover:border-amber-200/60 hover:text-amber-100"
                    }`}
                  >
                    {option === "2d" ? "2D Map" : "3D Explore"}
                  </button>
                );
              })}
            </div>
          </div>
          <div
            className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.16em] text-slate-400"
            aria-label={legend.accessibleLabel}
          >
            {legend.entries.map((entry, index) => (
              <span key={entry.label} className="inline-flex items-center gap-2">
                <span
                  className={`${index > 0 ? "ml-2" : ""} h-3 w-5 rounded-sm border border-slate-600/60`}
                  style={{ backgroundColor: entry.color }}
                  aria-hidden="true"
                />
                {entry.label}
              </span>
            ))}
          </div>
        </div>

        <div className="drop-stats-filter-row mt-2 flex flex-wrap items-center gap-2 border-t border-slate-700/55 pt-2">
          <span className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">Notes</span>
          <button
            type="button"
            aria-pressed={allNotesSelected}
            onClick={() => setSelectedNotes(CURRENT_DROP_NOTE_POOL.notes)}
            className={getFilterButtonClass(allNotesSelected)}
          >
            All notes
          </button>
          {CURRENT_DROP_NOTE_POOL.notes.map((note) => (
            <button
              key={note}
              type="button"
              aria-pressed={selectedNotes.includes(note)}
              onClick={() => setSelectedNotes((current) => toggleDropStatsNoteFilter(current, note))}
              className={getFilterButtonClass(selectedNotes.includes(note) && !allNotesSelected)}
            >
              {note}
            </button>
          ))}
          <span className="ml-1 text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">Strings</span>
          <button
            type="button"
            aria-pressed={allStringsSelected}
            onClick={() => setSelectedStrings(ALL_DROP_STRING_INDEXES)}
            className={getFilterButtonClass(allStringsSelected)}
          >
            All strings
          </button>
          {ALL_DROP_STRING_INDEXES.map((stringIndex) => (
            <button
              key={stringIndex}
              type="button"
              aria-pressed={selectedStrings.includes(stringIndex)}
              onClick={() => setSelectedStrings((current) => toggleDropStatsStringFilter(current, stringIndex))}
              className={getFilterButtonClass(selectedStrings.includes(stringIndex) && !allStringsSelected)}
            >
              {getStringFocusLabel(stringIndex)}
            </button>
          ))}
          {(!allNotesSelected || !allStringsSelected) ? (
            <button
              type="button"
              onClick={() => {
                setSelectedNotes(CURRENT_DROP_NOTE_POOL.notes);
                setSelectedStrings(ALL_DROP_STRING_INDEXES);
              }}
              className="min-h-8 rounded-md border border-slate-700/80 bg-slate-950/40 px-2.5 text-[11px] font-black text-slate-400 transition hover:border-amber-200/50 hover:text-amber-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-200"
            >
              Reset
            </button>
          ) : null}
        </div>
      </div>

      {loadState.status === "loading" ? (
        <div className="mt-4 rounded-lg border border-slate-700/65 bg-slate-950/42 px-4 py-3 text-sm font-semibold text-slate-400">
          Loading your fretboard...
        </div>
      ) : null}

      {!viewModel.hasProgress && loadState.status === "ready" ? (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-200/20 bg-amber-300/8 px-4 py-3">
          <p className="text-sm font-semibold text-amber-50/82">Play a few runs to start mapping your fretboard.</p>
          <button
            type="button"
            onClick={onPlay}
            className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md bg-amber-300 px-4 text-sm font-black text-slate-950 hover:bg-amber-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-100"
          >
            <Zap className="h-4 w-4" />
            Play
          </button>
        </div>
      ) : null}

      <section className="drop-focus-practice mt-4 rounded-lg border border-amber-200/20 bg-slate-950/42 p-3" aria-labelledby="drop-focus-practice-heading">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-amber-100/68">Focus Practice</p>
            <h2 id="drop-focus-practice-heading" className="mt-1 text-lg font-black text-white">Practice weakest</h2>
            <p className="mt-1 text-xs font-semibold text-slate-400">Untested cells are excluded. Coverage practice will be separate.</p>
          </div>
          <button
            type="button"
            disabled={focusPool.length === 0}
            onClick={() => onStartFocusPractice(focusPool)}
            className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md bg-amber-300 px-4 text-sm font-black text-slate-950 transition hover:bg-amber-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-100 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400"
            aria-describedby="drop-focus-practice-status"
          >
            <Zap className="h-4 w-4" />
            Practice weakest
          </button>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <label className="flex min-h-9 items-center gap-2 rounded-md border border-slate-700/70 bg-slate-950/50 px-2 text-xs font-bold text-slate-300">
            Fluency
            <select
              value={focusThreshold}
              onChange={(event) => setFocusThreshold(event.target.value as DropFocusPracticeThreshold)}
              className="rounded border border-slate-700 bg-slate-950 px-2 py-1 text-xs font-black text-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-200"
            >
              {DROP_FOCUS_PRACTICE_THRESHOLD_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>
          <label className="flex min-h-9 items-center gap-2 rounded-md border border-slate-700/70 bg-slate-950/50 px-2 text-xs font-bold text-slate-300">
            Attempts
            <select
              value={focusMinAttempts}
              onChange={(event) => setFocusMinAttempts(Number(event.target.value))}
              className="rounded border border-slate-700 bg-slate-950 px-2 py-1 text-xs font-black text-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-200"
            >
              {DROP_FOCUS_PRACTICE_MIN_ATTEMPT_OPTIONS.map((option) => (
                <option key={option} value={option}>{option}+</option>
              ))}
            </select>
          </label>
          <label className="flex min-h-9 items-center gap-2 rounded-md border border-slate-700/70 bg-slate-950/50 px-2 text-xs font-bold text-slate-300">
            Pool
            <select
              value={focusPoolSize}
              onChange={(event) => setFocusPoolSize(Number(event.target.value))}
              className="rounded border border-slate-700 bg-slate-950 px-2 py-1 text-xs font-black text-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-200"
            >
              {DROP_FOCUS_PRACTICE_POOL_SIZE_OPTIONS.map((option) => (
                <option key={option} value={option}>{option} cells</option>
              ))}
            </select>
          </label>
        </div>
        <p id="drop-focus-practice-status" className={`mt-2 text-sm font-semibold ${focusPool.length === 0 ? "text-amber-100/76" : "text-cyan-100/82"}`}>
          {focusEligibleText}
        </p>
      </section>

      {statsView === "3d" && !supports3D ? (
        <div className="mt-4 rounded-lg border border-amber-200/20 bg-amber-300/8 px-4 py-3 text-sm font-semibold text-amber-50/82">
          3D Explore is unavailable here, so the 2D map is shown.
        </div>
      ) : null}

      {statsView === "3d" && supports3D ? (
        <FretboardDropStats3D
          viewModel={viewModel}
          frets={frets}
          metric={metric}
          selectedCellId={selectedCellId}
          rotation={rotation}
          zoom={zoom}
          prefersReducedMotion={prefersReducedMotion}
          onRotationChange={setRotation}
          onZoomChange={setZoom}
          onResetView={reset3DView}
          onSelectCell={setSelectedCellId}
        />
      ) : (
        <StatsFretboard2D
          viewModel={viewModel}
          frets={frets}
          metric={metric}
          selectedCellId={selectedCellId}
          onSelectCell={setSelectedCellId}
        />
      )}

      {selectedCell ? (
        <StatsCellDetails cell={selectedCell} onClear={() => setSelectedCellId(null)} />
      ) : null}

      <div className="drop-stats-summaries mt-3 grid gap-2 sm:grid-cols-3">
        {viewModel.summaries.map((summary) => (
          <div key={summary.id} className="rounded-lg border border-slate-700/60 bg-slate-950/36 px-3 py-2">
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">{summary.label}</p>
            <p className="mt-1 text-sm font-black text-slate-100">{summary.value}</p>
            <p className="mt-0.5 text-xs font-semibold text-slate-400">{summary.description}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function supportsStats3D(): boolean {
  if (typeof CSS === "undefined" || typeof CSS.supports !== "function") return true;
  return CSS.supports("transform-style", "preserve-3d") && CSS.supports("perspective", "800px");
}

function useSupportsStats3D(): boolean {
  const [supports] = useState(() => supportsStats3D());
  return supports;
}

function usePrefersReducedMotion(): boolean {
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    setPrefersReducedMotion(media.matches);
    const handleChange = () => setPrefersReducedMotion(media.matches);
    media.addEventListener?.("change", handleChange);
    return () => media.removeEventListener?.("change", handleChange);
  }, []);

  return prefersReducedMotion;
}

function getFilterButtonClass(isSelected: boolean): string {
  return `min-h-8 rounded-md border px-2.5 text-[11px] font-black transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-200 ${
    isSelected
      ? "border-cyan-100 bg-cyan-200 text-slate-950"
      : "border-slate-700/80 bg-slate-950/55 text-slate-300 hover:border-cyan-200/70 hover:text-cyan-100"
  }`;
}

function StatsFretboard2D({
  viewModel,
  frets,
  metric,
  selectedCellId,
  onSelectCell,
}: {
  viewModel: DropStatsFretboardViewModel;
  frets: number[];
  metric: DropStatsMetric;
  selectedCellId: string | null;
  onSelectCell: (cellId: string) => void;
}) {
  return (
    <div className="drop-stats-map mt-4 overflow-hidden rounded-lg border border-cyan-200/18 bg-[#2d1d12] p-2 shadow-[0_-18px_52px_rgba(0,0,0,0.35)_inset,0_0_34px_rgba(14,165,233,0.08)]">
      <StatsFretNumberRow frets={frets} />
      <div className="grid h-4 grid-cols-[3.5rem_repeat(12,minmax(0,1fr))] items-center">
        <div />
        {frets.map((fret) => (
          <div key={fret} className="flex justify-center">
            {DOT_FRETS.includes(fret) ? <span className="h-1.5 w-1.5 rounded-full bg-amber-100/45 shadow-[0_0_8px_rgba(254,243,199,0.18)]" /> : null}
          </div>
        ))}
      </div>
      <div className="mt-1">
        {viewModel.strings.map((stringRow) => (
          <div
            key={stringRow.stringIndex}
            className="drop-stats-string-row grid min-h-11 grid-cols-[3.5rem_repeat(12,minmax(0,1fr))] items-stretch"
          >
            <div className="flex items-center justify-end pr-2 text-xs font-black text-cyan-100/72">
              {stringRow.stringLabel}
            </div>
            {stringRow.cells.map((cell) => (
              <StatsCell
                key={cell.cellId}
                cell={cell}
                metric={metric}
                isSelected={selectedCellId === cell.cellId}
                onSelect={() => onSelectCell(cell.cellId)}
              />
            ))}
          </div>
        ))}
      </div>
      <StatsFretNumberRow frets={frets} />
    </div>
  );
}

function StatsCell({
  cell,
  metric,
  isSelected,
  onSelect,
}: {
  cell: DropStatsCellViewModel;
  metric: DropStatsMetric;
  isSelected: boolean;
  onSelect: () => void;
}) {
  const filteredOpacity = cell.isFilteredIn ? 1 : 0.28;
  const visual = getDropStatsCellVisual(metric, cell);
  const backgroundColor = visual.backgroundColor;
  const borderColor = visual.borderColor;
  const boxShadow = isSelected
    ? "0 0 0 2px rgba(252,211,77,0.9), 0 0 22px rgba(252,211,77,0.24)"
    : visual.boxShadow;
  const noteTextColor = visual.textColor;
  const valueTextColor = visual.mutedTextColor;
  const valueText = metric === "attempts"
    ? cell.metricValue
    : metric === "accuracy" && cell.metricValue !== null
      ? `${cell.metricValue}%`
      : cell.metricValue;

  return (
    <button
      type="button"
      className="drop-stats-cell relative flex min-h-11 items-center justify-center border-l border-amber-100/12 p-1"
      aria-label={cell.accessibleLabel}
      aria-pressed={isSelected}
      data-testid={`stats-cell-${cell.cellId}`}
      onClick={onSelect}
      title={cell.accessibleLabel}
    >
      <div
        className="flex h-full min-h-9 w-full flex-col items-center justify-center rounded-md border text-center transition"
        style={{ backgroundColor, borderColor, boxShadow, opacity: filteredOpacity }}
      >
        <span
          className="font-mono text-xs font-black leading-none"
          style={{ color: noteTextColor }}
        >
          {cell.note}
        </span>
        <span
          className="mt-0.5 text-[9px] font-black leading-none"
          style={{ color: valueTextColor }}
        >
          {valueText ?? "—"}
        </span>
      </div>
    </button>
  );
}

function StatsCellDetails({ cell, onClear }: { cell: DropStatsCellViewModel; onClear: () => void }) {
  const record = cell.progress;
  const fluencyScore = cell.fluency.score === null ? "Not enough data" : `${cell.fluency.score}`;
  const attempts = record?.resolvedTargets ?? 0;
  const correctHits = record?.correctHits ?? 0;
  const misses = record?.misses ?? 0;
  const adjacentWrongTaps = record?.adjacentWrongTaps ?? 0;
  const otherWrongTaps = record?.otherWrongTaps ?? 0;

  return (
    <section
      className="drop-stats-details mt-3 rounded-lg border border-amber-100/18 bg-slate-950/50 p-3"
      aria-labelledby="drop-stats-details-heading"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-amber-100/68">Selected cell</p>
          <h2 id="drop-stats-details-heading" className="mt-1 text-lg font-black text-white">
            {cell.note} · {cell.stringLabel} · {getFretDisplayLabel(cell.fret)}
          </h2>
        </div>
        <button
          type="button"
          onClick={onClear}
          className="inline-flex min-h-8 items-center justify-center gap-1 rounded-md border border-slate-700/80 px-2.5 text-xs font-black text-slate-300 transition hover:border-amber-200/60 hover:text-amber-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-200"
        >
          <X className="h-3.5 w-3.5" />
          Clear
        </button>
      </div>

      <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-4">
        <StatsDetailItem label="Fluency" value={fluencyScore} />
        <StatsDetailItem label="Evidence" value={getEvidenceDisplayLabel(cell.evidenceLevel)} />
        <StatsDetailItem label="Resolved attempts" value={`${attempts}`} />
        <StatsDetailItem label="Correct hits" value={`${correctHits}`} />
        <StatsDetailItem label="Misses" value={`${misses}`} />
        <StatsDetailItem label="Accuracy" value={getAccuracyDetailLabel(record)} />
        <StatsDetailItem label="Recall speed" value={getRecallSpeedDetailLabel(record)} />
        <StatsDetailItem label="Adjacent wrong taps" value={`${adjacentWrongTaps}`} />
        <StatsDetailItem label="Other wrong taps" value={`${otherWrongTaps}`} />
      </dl>
    </section>
  );
}

function StatsDetailItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-slate-700/58 bg-slate-900/42 px-3 py-2">
      <dt className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">{label}</dt>
      <dd className="mt-1 font-bold text-slate-100">{value}</dd>
    </div>
  );
}

function StatsFretNumberRow({ frets }: { frets: number[] }) {
  return (
    <div className="grid grid-cols-[3.5rem_repeat(12,minmax(0,1fr))] text-center font-mono text-[9px] font-bold text-amber-100/58">
      <div />
      {frets.map((fret) => (
        <div key={fret} className={fret === 0 ? "text-[8px] uppercase text-cyan-100/72" : ""}>
          {fret === 0 ? "Open" : fret}
        </div>
      ))}
    </div>
  );
}
