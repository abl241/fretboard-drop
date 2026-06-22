import { describe, expect, it } from "vitest";
import {
  getNextStepIdAfterAssistedSuccess,
  getNextStepIdAfterUnassistedSuccess,
  getStepIdAfterFailure,
} from "./guidedProgression";

describe("guidedProgression", () => {
  it("advances assisted success to the paired unassisted step", () => {
    expect(getNextStepIdAfterAssistedSuccess("bc-assisted")).toBe("bc-unassisted");
    expect(getNextStepIdAfterAssistedSuccess("ef-assisted")).toBe("ef-unassisted");
    expect(getNextStepIdAfterAssistedSuccess("bcef-assisted")).toBe("bcef-unassisted");
  });

  it("repeats assisted failure on the same step", () => {
    expect(getStepIdAfterFailure("bc-assisted")).toBe("bc-assisted");
    expect(getStepIdAfterFailure("ef-assisted")).toBe("ef-assisted");
  });

  it("repeats unassisted and mix failure on the same step", () => {
    expect(getStepIdAfterFailure("bc-unassisted")).toBe("bc-unassisted");
    expect(getStepIdAfterFailure("abc-mix")).toBe("abc-mix");
    expect(getStepIdAfterFailure("abcdefg-mix")).toBe("abcdefg-mix");
  });

  it("advances unassisted and mix success to the next step", () => {
    expect(getNextStepIdAfterUnassistedSuccess("a")).toBe("bc-assisted");
    expect(getNextStepIdAfterUnassistedSuccess("bc-unassisted")).toBe("abc-mix");
    expect(getNextStepIdAfterUnassistedSuccess("abcdef-mix")).toBe("g");
    expect(getNextStepIdAfterUnassistedSuccess("g")).toBe("abcdefg-mix");
  });

  it("keeps the final A-G mix repeatable after completion", () => {
    expect(getNextStepIdAfterUnassistedSuccess("abcdefg-mix")).toBe("abcdefg-mix");
  });
});
