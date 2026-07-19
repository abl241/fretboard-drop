import { useState } from "react";
import { DEFAULT_GUIDED_STEP_ID, getGuidedStepById } from "./guidedSteps";
import {
  readGuidedOrientationSeen,
  readGuidedProgress,
  writeGuidedOrientationSeen,
  writeGuidedProgress,
} from "./guidedStorage";
import { isGuidedDevToolsEnabled } from "./guidedDev";
import { GuidedDevStepLauncher } from "./GuidedDevStepLauncher";
import { GuidedLessonIntro } from "./GuidedLessonIntro";
import { GuidedLessonRunner } from "./GuidedLessonRunner";
import { GuidedOrientation } from "./GuidedOrientation";
import { buildGuidedProgressView } from "./guidedProgressView";
import type { GuidedProgress, GuidedStepId } from "./guidedTypes";

export function GuidedLearningPath({
  onSwitchToFreePlay,
}: {
  onSwitchToFreePlay: () => void;
}) {
  const [orientationSeen, setOrientationSeen] = useState(readGuidedOrientationSeen);
  const [progress, setProgress] = useState<GuidedProgress>(() => readGuidedProgress());
  const [startedFromOrientation, setStartedFromOrientation] = useState(false);
  const [activeStepRun, setActiveStepRun] = useState<{
    stepId: GuidedStepId;
    startMode: "preview" | "direct";
  } | null>(null);
  const [devTestStepId, setDevTestStepId] = useState<GuidedStepId | null>(null);

  function startFirstLesson() {
    writeGuidedOrientationSeen(true);
    setOrientationSeen(true);
    setStartedFromOrientation(true);
  }

  if (!orientationSeen) {
    return <GuidedOrientation onStart={startFirstLesson} onSwitchToFreePlay={onSwitchToFreePlay} />;
  }

  const step = getGuidedStepById(progress.currentStepId);

  function updateProgress(nextProgress: GuidedProgress) {
    writeGuidedProgress(nextProgress);
    setProgress(nextProgress);
  }

  function advanceToStep(stepId: GuidedStepId) {
    updateProgress({
      ...progress,
      currentStepId: stepId,
    });
    setActiveStepRun(null);
    setStartedFromOrientation(false);
  }

  function exitDevTestMode() {
    setDevTestStepId(null);
  }

  if (devTestStepId) {
    return (
      <GuidedLessonRunner
        step={getGuidedStepById(devTestStepId)}
        progress={progress}
        startMode="preview"
        runMode="dev-test"
        onProgressChange={() => {}}
        onAdvanceToStep={() => {}}
        onReturnToIntro={exitDevTestMode}
        onExitDevTest={exitDevTestMode}
        onSwitchToFreePlay={onSwitchToFreePlay}
      />
    );
  }

  if (activeStepRun) {
    return (
      <GuidedLessonRunner
        step={getGuidedStepById(activeStepRun.stepId)}
        progress={progress}
        startMode={activeStepRun.startMode}
        onProgressChange={updateProgress}
        onAdvanceToStep={advanceToStep}
        onReturnToIntro={() => setActiveStepRun(null)}
        onSwitchToFreePlay={onSwitchToFreePlay}
      />
    );
  }

  const showDevLauncher = isGuidedDevToolsEnabled();
  const progressView = buildGuidedProgressView(step, progress.completedStepIds, {
    isReturning: !startedFromOrientation,
  });

  return (
    <GuidedLessonIntro
      progressView={progressView}
      onStart={() => setActiveStepRun({ stepId: step.id, startMode: "preview" })}
      onSwitchToFreePlay={onSwitchToFreePlay}
      developmentControls={showDevLauncher ? (
        <GuidedDevStepLauncher onStartTestRun={setDevTestStepId} />
      ) : undefined}
    />
  );
}
