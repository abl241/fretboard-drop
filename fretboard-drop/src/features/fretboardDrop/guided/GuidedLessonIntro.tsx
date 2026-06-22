import type { ReactNode } from "react";
import { GuidedProgressBar } from "./GuidedProgressBar";
import type { GuidedProgressView } from "./guidedProgressView";

export function GuidedLessonIntro({
  progressView,
  onStart,
  onSwitchToFreePlay,
  developmentControls,
}: {
  progressView: GuidedProgressView;
  onStart: () => void;
  onSwitchToFreePlay: () => void;
  developmentControls?: ReactNode;
}) {
  return (
    <div className="guided-shell min-h-[calc(100vh-1px)] bg-[#080a0f] px-4 py-6 text-slate-50">
      <main className="mx-auto flex min-h-[calc(100vh-3rem)] max-w-4xl items-center justify-center">
        <section className="guided-lesson-panel w-full rounded-2xl border border-cyan-100/12 bg-[radial-gradient(circle_at_50%_0%,rgba(251,191,36,0.14),transparent_38%),rgba(15,23,42,0.64)] p-5 text-center shadow-[0_28px_90px_rgba(0,0,0,0.36)] sm:p-8">
          <p className="text-xs font-black uppercase tracking-[0.38em] text-cyan-200/74">{progressView.resumeEyebrow}</p>
          <p className="mt-2 text-sm font-semibold text-amber-100/72">{progressView.locationLabel}</p>
          <h1 className="mt-3 text-4xl font-black tracking-tight text-white sm:text-5xl">{progressView.actionTitle}</h1>
          <p className="mx-auto mt-4 max-w-xl text-lg font-semibold leading-relaxed text-slate-200">{progressView.introExplanation}</p>
          {progressView.hintIntroLabel ? (
            <p className="mt-3 text-sm font-semibold text-cyan-100/70">{progressView.hintIntroLabel}</p>
          ) : null}
          <div className="mx-auto mt-6 max-w-md text-left">
            <p className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">{progressView.overallProgressLabel}</p>
            <GuidedProgressBar
              className="mt-2"
              segmentStatuses={progressView.segmentStatuses}
              completedCount={progressView.completedCount}
              totalCount={progressView.totalCount}
            />
          </div>
          {progressView.nextStepPreview ? (
            <p className="mt-4 text-sm font-semibold text-slate-400">{progressView.nextStepPreview}</p>
          ) : null}
          <div className="mt-8 flex flex-col items-center justify-center gap-4">
            <button
              type="button"
              onClick={onStart}
              className="inline-flex min-h-12 items-center justify-center rounded-lg bg-amber-300 px-7 text-base font-black text-slate-950 shadow-[0_0_30px_rgba(252,211,77,0.26)] transition hover:bg-amber-200"
            >
              {progressView.primaryActionLabel}
            </button>
            <button
              type="button"
              onClick={onSwitchToFreePlay}
              className="text-sm font-black text-cyan-100/72 underline decoration-cyan-100/24 underline-offset-4 transition hover:text-cyan-50 hover:decoration-cyan-100/70"
            >
              Switch to Free Play
            </button>
          </div>
          {developmentControls ? (
            <div className="mt-10 border-t border-slate-700/45 pt-6">
              {developmentControls}
            </div>
          ) : null}
        </section>
      </main>
    </div>
  );
}
