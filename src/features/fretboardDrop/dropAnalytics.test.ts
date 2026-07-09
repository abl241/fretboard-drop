import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DROP_ANALYTICS_CONSOLE_PREFIX,
  recordCompletedDropRunCounters,
  resetDropAnalyticsSessionForTests,
  trackDropEvent,
  type DropAnalyticsEventName,
} from "./dropAnalytics";

describe("Fretboard Drop analytics", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    resetDropAnalyticsSessionForTests();
  });

  it("accepts the supported event names and logs development events through one adapter", () => {
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const eventNames: DropAnalyticsEventName[] = [
      "app_opened",
      "practice_settings_changed",
      "quick_peek_used",
      "run_started",
      "run_completed",
      "play_again_clicked",
    ];

    for (const eventName of eventNames) {
      trackDropEvent(eventName, { score: 1 });
    }

    expect(consoleSpy).toHaveBeenCalledTimes(eventNames.length);
    expect(consoleSpy).toHaveBeenCalledWith(DROP_ANALYTICS_CONSOLE_PREFIX, {
      eventName: "run_completed",
      payload: { score: 1 },
    });
  });

  it("does not send PostHog events when analytics env vars are missing", () => {
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    trackDropEvent("run_completed", { score: 12 });

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(consoleSpy).toHaveBeenCalledTimes(1);
  });

  it("sends configured PostHog events through the adapter without identify or autocapture", () => {
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const fetchSpy = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchSpy);
    vi.stubEnv("VITE_ANALYTICS_PROVIDER", "posthog");
    vi.stubEnv("VITE_POSTHOG_KEY", "ph_test_key");
    vi.stubEnv("VITE_POSTHOG_HOST", "https://eu.i.posthog.com/");

    trackDropEvent("run_started", { practiceContextKey: "context-a" });

    expect(consoleSpy).toHaveBeenCalledTimes(1);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(fetchSpy).toHaveBeenCalledWith("https://eu.i.posthog.com/capture/", expect.objectContaining({
      method: "POST",
      headers: { "Content-Type": "application/json" },
      keepalive: true,
    }));
    const [, requestInit] = fetchSpy.mock.calls[0];
    const body = JSON.parse(String(requestInit.body));
    expect(body).toMatchObject({
      api_key: "ph_test_key",
      event: "run_started",
      distinct_id: expect.any(String),
    });
    expect(body.properties).toMatchObject({
      practiceContextKey: "context-a",
      anonymousInstallId: expect.any(String),
      sessionId: expect.any(String),
      $process_person_profile: false,
    });
    expect(body.properties).not.toHaveProperty("email");
    expect(body.properties).not.toHaveProperty("name");
  });

  it("records anonymous local completed-run counters by device, session, day, and context", () => {
    const firstRun = recordCompletedDropRunCounters({
      practiceContextKey: "context-a",
      fluencyScore: 640,
      now: new Date("2026-06-12T10:00:00.000Z"),
    });
    const secondRun = recordCompletedDropRunCounters({
      practiceContextKey: "context-a",
      fluencyScore: 720,
      now: new Date("2026-06-12T11:00:00.000Z"),
    });

    expect(firstRun).toEqual({
      runNumberOnDevice: 1,
      runNumberThisSession: 1,
      runNumberToday: 1,
      runsCompletedInPracticeContext: 1,
      firstFluencyForContext: 640,
    });
    expect(secondRun).toEqual({
      runNumberOnDevice: 2,
      runNumberThisSession: 2,
      runNumberToday: 2,
      runsCompletedInPracticeContext: 2,
      firstFluencyForContext: 640,
    });
  });
});
