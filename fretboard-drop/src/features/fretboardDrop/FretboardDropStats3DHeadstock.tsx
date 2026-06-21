import type { CSSProperties } from "react";

type HeadstockStyle = CSSProperties & Record<`--${string}`, string>;

export type FretboardDropStats3DHeadstockString = {
  id: string;
  label: string;
  top: string;
};

export function FretboardDropStats3DHeadstock({
  strings,
}: {
  strings: readonly FretboardDropStats3DHeadstockString[];
}) {
  return (
    <div className="drop-stats-3d-headstock" data-testid="stats-3d-headstock" aria-hidden="true">
      <div className="drop-stats-3d-headstock-body" />
      {strings.map((string, index) => {
        const side = index < 3 ? "left" : "right";
        return (
          <span
            key={`headstock-string-${string.id}`}
            className={`drop-stats-3d-headstock-string drop-stats-3d-headstock-string-${side}`}
            data-testid="stats-3d-headstock-string-extension"
            data-side={side}
            style={{ "--stats-3d-string-top": string.top } as HeadstockStyle}
          />
        );
      })}
      {strings.map((string, index) => {
        const side = index < 3 ? "left" : "right";
        return (
          <span
            key={`headstock-tuner-${string.id}`}
            className={`drop-stats-3d-headstock-tuner drop-stats-3d-headstock-tuner-${side}`}
            data-testid="stats-3d-headstock-tuner"
            data-side={side}
            data-string-label={string.label}
            style={{ "--stats-3d-string-top": string.top } as HeadstockStyle}
          />
        );
      })}
    </div>
  );
}
