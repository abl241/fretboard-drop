import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";
import { flushCellProgressWrites } from "@/features/fretboardDrop/dropCellProgress";

afterEach(async () => {
  await flushCellProgressWrites();
  cleanup();
  await flushCellProgressWrites();
  window.localStorage.clear();
});
