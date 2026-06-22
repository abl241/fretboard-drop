import { GUIDED_STEPS, getGuidedStepById, getGuidedStepIndex } from "./guidedSteps";
import type { GuidedStepId } from "./guidedTypes";

/** After a successful assisted run, advance to the paired unassisted step (next in order). */
export function getNextStepIdAfterAssistedSuccess(stepId: GuidedStepId): GuidedStepId {
  const index = getGuidedStepIndex(stepId);
  const next = GUIDED_STEPS[index + 1];
  return next?.id ?? stepId;
}

/** After a successful unassisted or mix run, advance to the next step (or stay on final). */
export function getNextStepIdAfterUnassistedSuccess(stepId: GuidedStepId): GuidedStepId {
  const step = getGuidedStepById(stepId);
  if (step.isFinalRepeatable) return stepId;
  const index = getGuidedStepIndex(stepId);
  const next = GUIDED_STEPS[index + 1];
  return next?.id ?? stepId;
}

/** Failed runs always repeat the same step. */
export function getStepIdAfterFailure(stepId: GuidedStepId): GuidedStepId {
  return stepId;
}

export function isAssistedStep(stepId: GuidedStepId): boolean {
  return getGuidedStepById(stepId).isAssisted;
}
