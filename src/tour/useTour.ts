import { useCallback, useEffect, useRef, useState } from "react";
import { driver, type Driver } from "driver.js";
import "driver.js/dist/driver.css";
import { buildTourSteps } from "./steps";
import { hasSeenTour, markTourSeen, shouldAutoStartTour } from "./tour-storage";
import { useToast } from "../misc/Toast";
import { useTelemetry } from "../telemetry/TelemetryProvider";

export const TOUR_PROMPT_DELAY_MS = 1500;
export const TOUR_MANUAL_START_DELAY_MS = 80;

export interface UseTourOptions {
  connected: boolean;
  unlocked: boolean;
  activeTab: string;
  setActiveTab: (tab: "keymap") => void;
}

export interface UseTourResult {
  startTour: () => void;
  promptOpen: boolean;
  acceptPrompt: () => void;
  declinePrompt: () => void;
}

export function useTour({
  connected,
  unlocked,
  activeTab,
  setActiveTab,
}: UseTourOptions): UseTourResult {
  const { toast } = useToast();
  const { trackEvent } = useTelemetry();
  const driverRef = useRef<Driver | null>(null);
  const manualTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [promptOpen, setPromptOpen] = useState(false);

  const start = useCallback(
    (trigger: "prompt" | "manual") => {
      driverRef.current?.destroy();

      const d = driver({
        steps: buildTourSteps(),
        showProgress: true,
        progressText: "{{current}} / {{total}}",
        nextBtnText: "次へ",
        prevBtnText: "戻る",
        doneBtnText: "完了",
        disableActiveInteraction: true,
        // Accidental clicks outside the popover must not kill the tour;
        // exiting is only via the done/close buttons or ESC.
        overlayClickBehavior: () => {},
        // driver.js does NOT destroy itself when this hook is defined —
        // the hook must call destroy() (which skips this hook internally).
        onDestroyStarted: () => {
          const active = driverRef.current;
          if (!active) {
            return;
          }
          if (active.hasNextStep()) {
            trackEvent("tour_skipped", { step: active.getActiveIndex() });
          } else {
            trackEvent("tour_completed");
          }
          active.destroy();
          driverRef.current = null;
        },
      });

      driverRef.current = d;
      trackEvent("tour_started", { trigger });
      d.drive();
    },
    [trackEvent]
  );

  useEffect(() => {
    if (!connected || !unlocked) {
      driverRef.current?.destroy();
      driverRef.current = null;
      setPromptOpen(false);
      return;
    }

    const shouldPrompt = shouldAutoStartTour({
      isTauri: !!window.__TAURI_INTERNALS__,
      connected,
      unlocked,
      flagValue: hasSeenTour() ? "true" : null,
    });
    if (!shouldPrompt) {
      return;
    }

    // Only ask; the seen flag is written when the user answers, so quitting
    // without answering means we simply ask again next time.
    const timer = setTimeout(() => {
      setPromptOpen(true);
    }, TOUR_PROMPT_DELAY_MS);

    return () => clearTimeout(timer);
  }, [connected, unlocked]);

  useEffect(() => {
    return () => {
      if (manualTimerRef.current) {
        clearTimeout(manualTimerRef.current);
      }
      driverRef.current?.destroy();
      driverRef.current = null;
    };
  }, []);

  const acceptPrompt = useCallback(() => {
    markTourSeen();
    setPromptOpen(false);
    start("prompt");
  }, [start]);

  const declinePrompt = useCallback(() => {
    markTourSeen();
    setPromptOpen(false);
    trackEvent("tour_declined");
  }, [trackEvent]);

  const startTour = useCallback(() => {
    if (!connected || !unlocked) {
      toast("キーボードを接続するとご覧いただけます", "info");
      return;
    }

    if (activeTab !== "keymap") {
      setActiveTab("keymap");
    }

    // Wait one tick so the keymap panel's hidden-class flip commits
    // before driver.js measures the highlighted elements.
    if (manualTimerRef.current) {
      clearTimeout(manualTimerRef.current);
    }
    manualTimerRef.current = setTimeout(() => {
      manualTimerRef.current = null;
      start("manual");
    }, TOUR_MANUAL_START_DELAY_MS);
  }, [connected, unlocked, activeTab, setActiveTab, start, toast]);

  return { startTour, promptOpen, acceptPrompt, declinePrompt };
}
