import type { GuidedProgressSegmentStatus } from "./guidedProgressView";

export function GuidedProgressBar({
  segmentStatuses,
  completedCount,
  totalCount,
  className = "",
}: {
  segmentStatuses: readonly GuidedProgressSegmentStatus[];
  completedCount: number;
  totalCount: number;
  className?: string;
}) {
  return (
    <div className={className} data-testid="guided-progress-bar">
      <div
        className="flex gap-1"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={totalCount}
        aria-valuenow={completedCount}
        aria-label={`${completedCount} of ${totalCount} runs complete`}
      >
        {segmentStatuses.map((status, index) => (
          <span
            key={index}
            className={`h-1.5 flex-1 rounded-full ${
              status === "completed"
                ? "bg-amber-300/85"
                : status === "current"
                  ? "bg-cyan-200/90"
                  : "bg-slate-700/70"
            }`}
            data-segment-status={status}
          />
        ))}
      </div>
    </div>
  );
}
