import { semverGe } from "./machine";

/** Drop a leading "v"/"V" so "v1.4.0" and "1.4.0" compare equal. */
export function stripV(v: string): string {
  return v.replace(/^[vV]/, "");
}

/**
 * True when `latest` is strictly newer than `installed` (both may carry a
 * leading "v"). If either version is empty/unknown we return false — we never
 * nag when we can't be sure the user is actually behind.
 */
export function isUpdateAvailable(installed: string, latest: string): boolean {
  if (!installed || !latest) return false;
  return !semverGe(stripV(installed), stripV(latest));
}
