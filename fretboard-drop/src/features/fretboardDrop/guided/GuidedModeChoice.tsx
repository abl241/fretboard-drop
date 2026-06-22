export function GuidedModeChoice({
  onChooseGuided,
  onChooseFreePlay,
}: {
  onChooseGuided: () => void;
  onChooseFreePlay: () => void;
}) {
  return (
    <div className="guided-shell min-h-[calc(100vh-1px)] bg-[#080a0f] px-4 py-6 text-slate-50">
      <main className="mx-auto flex min-h-[calc(100vh-3rem)] max-w-5xl items-center justify-center">
        <section className="guided-choice-panel w-full rounded-2xl border border-cyan-100/12 bg-slate-950/58 p-4 shadow-[0_28px_90px_rgba(0,0,0,0.34)] sm:p-6">
          <div className="mb-5 text-center">
            <p className="text-xs font-black uppercase tracking-[0.36em] text-cyan-200/70">Fretboard Drop</p>
            <h1 className="mt-3 text-4xl font-black tracking-tight text-white sm:text-6xl">Choose your path</h1>
          </div>
          <div className="grid gap-3 md:grid-cols-[1.08fr_0.92fr]">
            <article className="rounded-xl border border-amber-100/36 bg-[radial-gradient(circle_at_50%_0%,rgba(251,191,36,0.18),transparent_42%),rgba(30,41,59,0.58)] p-5 text-left shadow-[0_0_36px_rgba(251,191,36,0.1)]">
              <p className="inline-flex rounded-full border border-amber-100/34 bg-amber-200/12 px-3 py-1 text-xs font-black uppercase tracking-[0.18em] text-amber-100">
                Best place to start
              </p>
              <h2 className="mt-5 text-3xl font-black tracking-tight text-white">Learn the Fretboard</h2>
              <p className="mt-3 max-w-sm text-base font-semibold leading-relaxed text-slate-200">
                Start with one note and add more as they become familiar.
              </p>
              <button
                type="button"
                onClick={onChooseGuided}
                className="mt-7 inline-flex min-h-12 items-center justify-center rounded-lg bg-amber-300 px-6 text-base font-black text-slate-950 shadow-[0_0_30px_rgba(252,211,77,0.26)] transition hover:bg-amber-200"
              >
                Start Learning
              </button>
            </article>
            <article className="rounded-xl border border-cyan-100/16 bg-slate-950/54 p-5 text-left">
              <h2 className="text-3xl font-black tracking-tight text-white">Free Play</h2>
              <p className="mt-3 max-w-sm text-base font-semibold leading-relaxed text-slate-300">
                Choose the strings and notes you want to practice.
              </p>
              <button
                type="button"
                onClick={onChooseFreePlay}
                className="mt-7 inline-flex min-h-11 items-center justify-center rounded-lg border border-cyan-100/28 px-5 text-sm font-black text-cyan-100 transition hover:border-cyan-100/70 hover:bg-cyan-200/10"
              >
                Set Up a Run
              </button>
            </article>
          </div>
        </section>
      </main>
    </div>
  );
}
