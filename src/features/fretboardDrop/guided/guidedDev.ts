import { GUIDED_STEPS } from "./guidedSteps";
import type { GuidedStepDefinition, GuidedStepId } from "./guidedTypes";

export function isGuidedDevToolsEnabled(isDev = import.meta.env.DEV): boolean {
  return isDev;
}

export function getGuidedDevStepOptionLabel(step: GuidedStepDefinition): string {
  return `${step.partLabel} · ${step.title}`;
}

export function getGuidedDevStepOptions(): readonly { id: GuidedStepId; label: string }[] {
  return GUIDED_STEPS.map((step) => ({
    id: step.id,
    label: getGuidedDevStepOptionLabel(step),
  }));
}
