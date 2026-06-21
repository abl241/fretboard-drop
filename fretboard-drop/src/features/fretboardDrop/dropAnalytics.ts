export type DropAnalyticsEventName =
  | "app_opened"
  | "practice_settings_changed"
  | "quick_peek_used"
  | "run_started"
  | "run_completed"
  | "play_again_clicked";

export type DropAnalyticsPayload = Record<string, string | number | boolean | readonly string[] | readonly number[] | null | undefined>;

export const DROP_ANALYTICS_CONSOLE_PREFIX = "[FretboardDrop analytics]";

const DROP_ANALYTICS_INSTALL_ID_KEY = "fretboard-drop:analytics:anonymous-install-id:v1";
const DROP_ANALYTICS_TOTAL_RUNS_KEY = "fretboard-drop:analytics:runs-completed:v1";
const DROP_ANALYTICS_TODAY_RUNS_PREFIX = "fretboard-drop:analytics:runs-completed-today:v1:";
const DROP_ANALYTICS_CONTEXT_RUNS_PREFIX = "fretboard-drop:analytics:runs-completed-context:v1:";
const DROP_ANALYTICS_CONTEXT_FIRST_FLUENCY_PREFIX = "fretboard-drop:analytics:first-fluency-context:v1:";

let sessionId: string | null = null;
let runNumberThisSession = 0;

export type DropCompletedRunCounterInput = {
  practiceContextKey: string;
  fluencyScore: number;
  now?: Date;
};

export type DropCompletedRunCounters = {
  runNumberOnDevice: number;
  runNumberThisSession: number;
  runNumberToday: number;
  runsCompletedInPracticeContext: number;
  firstFluencyForContext: number | null;
};

function createRandomId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return `fd-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

function readStorageValue(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStorageValue(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Analytics storage is nice-to-have only.
  }
}

function readStoredNumber(key: string): number {
  const value = Number.parseInt(readStorageValue(key) ?? "0", 10);
  return Number.isFinite(value) && value > 0 ? value : 0;
}

function incrementStoredNumber(key: string): number {
  const nextValue = readStoredNumber(key) + 1;
  writeStorageValue(key, String(nextValue));
  return nextValue;
}

function getAnonymousInstallId(): string {
  const existingId = readStorageValue(DROP_ANALYTICS_INSTALL_ID_KEY);
  if (existingId) return existingId;
  const nextId = createRandomId();
  writeStorageValue(DROP_ANALYTICS_INSTALL_ID_KEY, nextId);
  return nextId;
}

function getSessionId(): string {
  sessionId ??= createRandomId();
  return sessionId;
}

function getPostHogHost(): string {
  return String(import.meta.env.VITE_POSTHOG_HOST).replace(/\/+$/, "");
}

function isPostHogConfigured(): boolean {
  return import.meta.env.VITE_ANALYTICS_PROVIDER === "posthog"
    && Boolean(import.meta.env.VITE_POSTHOG_KEY)
    && Boolean(import.meta.env.VITE_POSTHOG_HOST);
}

function sendPostHogEvent(eventName: DropAnalyticsEventName, payload: DropAnalyticsPayload): void {
  if (!isPostHogConfigured() || typeof fetch !== "function") return;

  const anonymousInstallId = getAnonymousInstallId();
  const properties = {
    ...payload,
    anonymousInstallId,
    sessionId: getSessionId(),
    $process_person_profile: false,
  };

  void fetch(`${getPostHogHost()}/capture/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      api_key: import.meta.env.VITE_POSTHOG_KEY,
      event: eventName,
      distinct_id: anonymousInstallId,
      properties,
    }),
    keepalive: true,
  }).catch(() => undefined);
}

export function trackDropEvent(eventName: DropAnalyticsEventName, payload: DropAnalyticsPayload = {}): void {
  sendPostHogEvent(eventName, payload);

  if (import.meta.env.DEV) {
    console.log(DROP_ANALYTICS_CONSOLE_PREFIX, {
      eventName,
      payload,
    });
  }
}

export function recordCompletedDropRunCounters({
  practiceContextKey,
  fluencyScore,
  now = new Date(),
}: DropCompletedRunCounterInput): DropCompletedRunCounters {
  const todayKey = `${DROP_ANALYTICS_TODAY_RUNS_PREFIX}${now.toISOString().slice(0, 10)}`;
  const contextRunsKey = `${DROP_ANALYTICS_CONTEXT_RUNS_PREFIX}${practiceContextKey}`;
  const firstFluencyKey = `${DROP_ANALYTICS_CONTEXT_FIRST_FLUENCY_PREFIX}${practiceContextKey}`;
  const storedFirstFluency = readStorageValue(firstFluencyKey);
  const firstFluencyForContext = storedFirstFluency === null ? Math.round(fluencyScore) : readStoredNumber(firstFluencyKey);

  if (storedFirstFluency === null) {
    writeStorageValue(firstFluencyKey, String(firstFluencyForContext));
  }

  runNumberThisSession += 1;

  return {
    runNumberOnDevice: incrementStoredNumber(DROP_ANALYTICS_TOTAL_RUNS_KEY),
    runNumberThisSession,
    runNumberToday: incrementStoredNumber(todayKey),
    runsCompletedInPracticeContext: incrementStoredNumber(contextRunsKey),
    firstFluencyForContext,
  };
}

export function resetDropAnalyticsSessionForTests(): void {
  sessionId = null;
  runNumberThisSession = 0;
}
