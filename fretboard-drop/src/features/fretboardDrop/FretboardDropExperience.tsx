import { useState } from "react";
import { FretboardDropGame } from "./FretboardDropGame";
import {
  GuidedLearningPath,
  GuidedModeChoice,
  readGuidedPreferredMode,
  writeGuidedPreferredMode,
  type GuidedPreferredMode,
} from "./guided";

export const IS_GUIDED_LEARNING_AVAILABLE = true;

export function getInitialExperienceMode(
  storedMode: GuidedPreferredMode | null,
): GuidedPreferredMode | null {
  return storedMode;
}

export function FretboardDropExperience() {
  const [preferredMode, setPreferredMode] = useState<GuidedPreferredMode | null>(() => getInitialExperienceMode(readGuidedPreferredMode()));
  const [hasOpenedGuided, setHasOpenedGuided] = useState(() => preferredMode === "guided");
  const [hasOpenedFreePlay, setHasOpenedFreePlay] = useState(() => preferredMode === "free-play");

  function chooseMode(mode: GuidedPreferredMode) {
    writeGuidedPreferredMode(mode);
    if (mode === "guided") {
      setHasOpenedGuided(true);
    } else {
      setHasOpenedFreePlay(true);
    }
    setPreferredMode(mode);
  }

  if (preferredMode === null) {
    return (
      <GuidedModeChoice
        onChooseGuided={() => chooseMode("guided")}
        onChooseFreePlay={() => chooseMode("free-play")}
      />
    );
  }

  if (!IS_GUIDED_LEARNING_AVAILABLE) {
    return <FretboardDropGame />;
  }

  return (
    <>
      {hasOpenedGuided ? (
        <div hidden={preferredMode !== "guided"}>
          <GuidedLearningPath onSwitchToFreePlay={() => chooseMode("free-play")} />
        </div>
      ) : null}
      {hasOpenedFreePlay ? (
        <div hidden={preferredMode !== "free-play"}>
          <FretboardDropGame onSwitchToGuided={() => chooseMode("guided")} />
        </div>
      ) : null}
    </>
  );
}
