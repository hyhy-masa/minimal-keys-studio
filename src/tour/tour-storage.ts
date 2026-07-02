export const TOUR_SEEN_KEY = "onboarding-tour-seen";

export interface AutoStartConditions {
  isTauri: boolean;
  connected: boolean;
  unlocked: boolean;
  flagValue: string | null;
}

export function shouldAutoStartTour({
  isTauri,
  connected,
  unlocked,
  flagValue,
}: AutoStartConditions): boolean {
  return isTauri && connected && unlocked && flagValue === null;
}

export function hasSeenTour(): boolean {
  try {
    return localStorage.getItem(TOUR_SEEN_KEY) !== null;
  } catch {
    return false;
  }
}

export function markTourSeen(): void {
  try {
    localStorage.setItem(TOUR_SEEN_KEY, "true");
  } catch {
    // ignore
  }
}
