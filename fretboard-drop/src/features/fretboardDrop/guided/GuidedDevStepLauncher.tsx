import { useState } from "react";
import { DEFAULT_GUIDED_STEP_ID } from "./guidedSteps";
import { getGuidedDevStepOptions } from "./guidedDev";
import type { GuidedStepId } from "./guidedTypes";

export function GuidedDevStepLauncher({
  onStartTestRun,
}: {
  onStartTestRun: (stepId: GuidedStepId) => void;
}) {
  const options = getGuidedDevStepOptions();
  const [selectedStepId, setSelectedStepId] = useState<GuidedStepId>(DEFAULT_GUIDED_STEP_ID);

  return (
    <div
      className="mx-auto max-w-md rounded-lg border border-dashed border-amber-200/20 bg-slate-950/40 p-4 text-center"
      data-testid="guided-dev-step-launcher"
    >
      <p className="text-[10px] font-black uppercase tracking-[0.28em] text-amber-100/55">Development testing</p>
      <p className="mt-2 text-xs font-semibold text-slate-400">Test runs do not change saved progress.</p>
      <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <label className="sr-only" htmlFor="guided-dev-step-select">Guided step</label>
        <select
          id="guided-dev-step-select"
          value={selectedStepId}
          onChange={(event) => setSelectedStepId(event.target.value as GuidedStepId)}
          className="min-h-10 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 text-sm font-semibold text-slate-100 sm:flex-1"
          data-testid="guided-dev-step-select"
        >
          {options.map((option) => (
            <option key={option.id} value={option.id}>
              {option.label}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => onStartTestRun(selectedStepId)}
          className="inline-flex min-h-10 items-center justify-center rounded-lg border border-amber-200/30 bg-amber-300/12 px-4 text-sm font-black text-amber-100 transition hover:border-amber-200/50 hover:bg-amber-300/20"
          data-testid="guided-dev-start-test-run"
        >
          Start test run
        </button>
      </div>
    </div>
  );
}
