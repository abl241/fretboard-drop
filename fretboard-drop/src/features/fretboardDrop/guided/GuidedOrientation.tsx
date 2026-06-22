export function GuidedOrientation({
  onStart,
  onSwitchToFreePlay,
}: {
  onStart: () => void;
  onSwitchToFreePlay: () => void;
}) {
  return (
    <div className="guided-shell min-h-[calc(100vh-1px)] bg-[#080a0f] px-4 py-6 text-slate-50">
      <main className="mx-auto flex min-h-[calc(100vh-3rem)] max-w-4xl items-center justify-center">
        <section className="guided-orientation-panel w-full rounded-2xl border border-cyan-100/12 bg-[radial-gradient(circle_at_50%_0%,rgba(14,165,233,0.18),transparent_38%),rgba(15,23,42,0.64)] p-5 text-center shadow-[0_28px_90px_rgba(0,0,0,0.36)] sm:p-8">
          <p className="text-xs font-black uppercase tracking-[0.38em] text-cyan-200/74">Guided Learning</p>
          <h1 className="mx-auto mt-4 max-w-3xl text-4xl font-black tracking-tight text-white sm:text-6xl">
            Know where the notes are—without stopping to think
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-lg font-semibold leading-relaxed text-slate-200">
            Learn A through G across all six strings, one small step at a time.
          </p>
          <p
            className="mx-auto mt-6 max-w-xl rounded-full border border-amber-100/24 bg-slate-950/54 px-4 py-3 text-lg font-black tracking-wide text-amber-100"
            aria-label="Guided path: A, then B plus C, then D, then E plus F, then G"
          >
            A → B+C → D → E+F → G
          </p>
          <p className="mx-auto mt-5 max-w-2xl text-base font-semibold leading-relaxed text-slate-300">
            See the notes. Find them as the picks fall. Keep going as they become automatic.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-4">
            <button
              type="button"
              onClick={onStart}
              className="inline-flex min-h-12 items-center justify-center rounded-lg bg-amber-300 px-7 text-base font-black text-slate-950 shadow-[0_0_30px_rgba(252,211,77,0.26)] transition hover:bg-amber-200"
            >
              Start with A
            </button>
            <button
              type="button"
              onClick={onSwitchToFreePlay}
              className="text-sm font-black text-cyan-100/72 underline decoration-cyan-100/24 underline-offset-4 transition hover:text-cyan-50 hover:decoration-cyan-100/70"
            >
              Already know the fretboard? Try Free Play
            </button>
          </div>
        </section>
      </main>
    </div>
  );
}
