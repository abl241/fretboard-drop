import type { GuidedPreferredMode } from "./guided/guidedTypes";

type LearningModeCardProps = {
  title: string;
  description: string;
  actionLabel: string;
  isFeatured?: boolean;
  isLastPlayed?: boolean;
  onSelect: () => void;
};

function LearningModeCard({
  title,
  description,
  actionLabel,
  isFeatured = false,
  isLastPlayed = false,
  onSelect,
}: LearningModeCardProps) {
  return (
    <article
      className={
        isFeatured
          ? "rounded-2xl border border-amber-100/30 bg-[radial-gradient(circle_at_50%_0%,rgba(251,191,36,0.14),transparent_42%),rgba(30,41,59,0.55)] p-5 shadow-[0_0_32px_rgba(251,191,36,0.08)]"
          : "rounded-2xl border border-cyan-100/14 bg-slate-950/55 p-5"
      }
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="text-left">
          {isLastPlayed ? (
            <p className="mb-2 text-[0.65rem] font-black uppercase tracking-[0.22em] text-cyan-200/65">Last played</p>
          ) : null}
          <h2 className="text-2xl font-black tracking-tight text-white sm:text-3xl">{title}</h2>
          <p className="mt-2 max-w-md text-sm font-semibold leading-relaxed text-slate-300 sm:text-base">{description}</p>
        </div>
        <button
          type="button"
          onClick={onSelect}
          className={
            isFeatured
              ? "inline-flex min-h-11 shrink-0 items-center justify-center rounded-lg bg-amber-300 px-6 text-sm font-black text-slate-950 shadow-[0_0_24px_rgba(252,211,77,0.22)] transition hover:bg-amber-200"
              : "inline-flex min-h-11 shrink-0 items-center justify-center rounded-lg border border-cyan-100/28 px-5 text-sm font-black text-cyan-100 transition hover:border-cyan-100/70 hover:bg-cyan-200/10"
          }
        >
          {actionLabel}
        </button>
      </div>
    </article>
  );
}

export function LearningModesHome({
  lastPlayedMode = null,
  onChooseGuided,
  onChooseFreePlay,
  onChooseNameTheNote,
}: {
  lastPlayedMode?: GuidedPreferredMode | null;
  onChooseGuided: () => void;
  onChooseFreePlay: () => void;
  onChooseNameTheNote: () => void;
}) {
  return (
    <div className="home-shell min-h-[calc(100vh-1px)] bg-[#080a0f] px-4 py-6 text-slate-50">
      <main className="mx-auto flex min-h-[calc(100vh-3rem)] max-w-2xl flex-col justify-center py-8">
        <header className="mb-8 text-center">
          <p className="text-xs font-black uppercase tracking-[0.36em] text-cyan-200/70">Fretboard Drop</p>
          <h1 className="mt-3 text-4xl font-black tracking-tight text-white sm:text-5xl">Choose a mode</h1>
          <p className="mx-auto mt-3 max-w-md text-sm font-semibold leading-relaxed text-slate-400 sm:text-base">
            Pick how you want to practice the fretboard today.
          </p>
        </header>

        <div className="grid gap-3">
          <LearningModeCard
            title="Guided Learning"
            description="Step-by-step lessons that build note recognition from the ground up."
            actionLabel="Start Learning"
            isFeatured
            isLastPlayed={lastPlayedMode === "guided"}
            onSelect={onChooseGuided}
          />
          <LearningModeCard
            title="Fretboard Drop"
            description="Custom timed runs with falling notes across the strings you choose."
            actionLabel="Set Up a Run"
            isLastPlayed={lastPlayedMode === "free-play"}
            onSelect={onChooseFreePlay}
          />
          <LearningModeCard
            title="Name the Note"
            description="One fretboard position at a time — answer with the note name."
            actionLabel="Play Name the Note"
            isLastPlayed={lastPlayedMode === "name-the-note"}
            onSelect={onChooseNameTheNote}
          />
        </div>
      </main>
    </div>
  );
}
