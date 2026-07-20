import { Home } from "lucide-react";

export function ExperienceHeader({ onBackToHome }: { onBackToHome: () => void }) {
  return (
    <div className="experience-header pointer-events-none fixed inset-x-0 top-0 z-50 px-4 pt-4">
      <button
        type="button"
        onClick={onBackToHome}
        className="pointer-events-auto inline-flex min-h-10 items-center gap-2 rounded-lg border border-slate-700/80 bg-slate-950/82 px-3 text-sm font-black text-slate-200 shadow-[0_10px_30px_rgba(0,0,0,0.28)] backdrop-blur-sm transition hover:border-cyan-100/35 hover:text-cyan-50"
      >
        <Home className="h-4 w-4" aria-hidden="true" />
        Home
      </button>
    </div>
  );
}
