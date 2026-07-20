import { describe, expect, it } from "vitest";
import { getGuidedDevStepOptions, isGuidedDevToolsEnabled } from "./guidedDev";
import { getGuidedStepIds } from "./guidedSteps";

describe("guidedDev", () => {
  it("enables dev tools only when the development runtime flag is true", () => {
    expect(isGuidedDevToolsEnabled(true)).toBe(true);
    expect(isGuidedDevToolsEnabled(false)).toBe(false);
  });

  it("derives launcher options from all 13 GUIDED_STEPS without a duplicate list", () => {
    const options = getGuidedDevStepOptions();

    expect(options).toHaveLength(13);
    expect(options.map((option) => option.id)).toEqual(getGuidedStepIds());
    expect(options[0].label).toBe("Level 1 · Learn A");
    expect(options[1].label).toBe("Level 2A · Learn B + C with help");
    expect(options[12].label).toBe("Level 6B · Mix all natural notes");
  });
});
