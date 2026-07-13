import { useState } from "react";
import { FretboardDropGame } from "./FretboardDropGame";
import { ExperienceHeader } from "./ExperienceHeader";
import { LearningModesHome } from "./LearningModesHome";
import { NameTheNoteGame } from "./nameTheNote/NameTheNoteGame";
import {
  GuidedLearningPath,
  readGuidedPreferredMode,
  writeGuidedPreferredMode,
  type GuidedPreferredMode,
} from "./guided";

export const IS_GUIDED_LEARNING_AVAILABLE = true;

export type ExperienceScreen = "home" | GuidedPreferredMode;

export function getInitialExperienceMode(
  storedMode: GuidedPreferredMode | null,
): GuidedPreferredMode | null {
  return storedMode;
}

export function FretboardDropExperience() {
  const storedMode = readGuidedPreferredMode();
  const [screen, setScreen] = useState<ExperienceScreen>("home");
  const [hasOpenedGuided, setHasOpenedGuided] = useState(() => storedMode === "guided");
  const [hasOpenedFreePlay, setHasOpenedFreePlay] = useState(() => storedMode === "free-play");
  const [hasOpenedNameTheNote, setHasOpenedNameTheNote] = useState(() => storedMode === "name-the-note");

  function goHome() {
    setScreen("home");
  }

  function chooseMode(mode: GuidedPreferredMode) {
    writeGuidedPreferredMode(mode);
    if (mode === "guided") {
      setHasOpenedGuided(true);
    } else if (mode === "free-play") {
      setHasOpenedFreePlay(true);
    } else {
      setHasOpenedNameTheNote(true);
    }
    setScreen(mode);
  }

  if (screen === "home") {
    return (
      <LearningModesHome
        lastPlayedMode={storedMode}
        onChooseGuided={() => chooseMode("guided")}
        onChooseFreePlay={() => chooseMode("free-play")}
        onChooseNameTheNote={() => chooseMode("name-the-note")}
      />
    );
  }

  if (!IS_GUIDED_LEARNING_AVAILABLE) {
    return <FretboardDropGame />;
  }

  return (
    <div className="experience-root">
      <ExperienceHeader onBackToHome={goHome} />
      {hasOpenedGuided ? (
        <div className="experience-mode" hidden={screen !== "guided"}>
          <GuidedLearningPath onSwitchToFreePlay={() => chooseMode("free-play")} />
        </div>
      ) : null}
      {hasOpenedFreePlay ? (
        <div className="experience-mode" hidden={screen !== "free-play"}>
          <FretboardDropGame />
        </div>
      ) : null}
      {hasOpenedNameTheNote ? (
        <div className="experience-mode" hidden={screen !== "name-the-note"}>
          <NameTheNoteGame
            onBackToFreePlay={() => chooseMode("free-play")}
          />
        </div>
      ) : null}
    </div>
  );
}
