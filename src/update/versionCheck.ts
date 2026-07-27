import packageInfo from "../../package.json";

const LATEST_RELEASE_URL =
  "https://api.github.com/repos/hyhy-masa/minimal-keys-studio/releases/latest";

export const CURRENT_APP_VERSION = packageInfo.version;
export const NOTIFIED_VERSION_STORAGE_KEY = "minimal-keys-studio:update-notified";

export interface ReleaseInfo {
  tagName: string;
  htmlUrl: string;
  draft?: boolean;
  prerelease?: boolean;
}

interface ParsedVersion {
  major: number;
  minor: number;
  patch: number;
  prerelease: string[];
}

type ReleaseFetcher = () => Promise<unknown>;

interface GitHubReleaseResponse {
  tag_name: string;
  html_url: string;
  draft?: unknown;
  prerelease?: unknown;
}

function parseVersion(version: string): ParsedVersion | null {
  const match = version.trim().replace(/^v/i, "").match(
    /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/
  );
  if (!match) return null;

  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    prerelease: match[4]?.split(".") ?? [],
  };
}

export function compareVersions(left: string, right: string): number | null {
  const a = parseVersion(left);
  const b = parseVersion(right);
  if (!a || !b) return null;

  for (const key of ["major", "minor", "patch"] as const) {
    if (a[key] !== b[key]) return a[key] > b[key] ? 1 : -1;
  }

  if (a.prerelease.length === 0 || b.prerelease.length === 0) {
    if (a.prerelease.length === b.prerelease.length) return 0;
    return a.prerelease.length === 0 ? 1 : -1;
  }

  const length = Math.max(a.prerelease.length, b.prerelease.length);
  for (let index = 0; index < length; index += 1) {
    const aPart = a.prerelease[index];
    const bPart = b.prerelease[index];
    if (aPart === undefined) return -1;
    if (bPart === undefined) return 1;
    if (aPart === bPart) continue;

    const aNumber = /^\d+$/.test(aPart);
    const bNumber = /^\d+$/.test(bPart);
    if (aNumber && bNumber) return Number(aPart) > Number(bPart) ? 1 : -1;
    if (aNumber !== bNumber) return aNumber ? -1 : 1;
    return aPart > bPart ? 1 : -1;
  }

  return 0;
}

export function shouldNotifyForRelease(
  release: Pick<ReleaseInfo, "tagName" | "draft" | "prerelease">,
  currentVersion: string,
  notifiedVersion?: string | null
): boolean {
  if (release.draft || release.prerelease) return false;
  if (compareVersions(release.tagName, currentVersion) !== 1) return false;
  return !notifiedVersion || compareVersions(release.tagName, notifiedVersion) !== 0;
}

function isReleaseInfo(value: unknown): value is GitHubReleaseResponse {
  if (!value || typeof value !== "object") return false;
  const release = value as Record<string, unknown>;
  return typeof release.tag_name === "string" && typeof release.html_url === "string";
}

async function fetchLatestRelease(): Promise<unknown> {
  const { fetch } = await import("@tauri-apps/plugin-http");
  const response = await fetch(LATEST_RELEASE_URL);
  if (!response.ok) return null;
  return response.json();
}

export async function checkForUpdate(
  currentVersion = CURRENT_APP_VERSION,
  fetcher: ReleaseFetcher = fetchLatestRelease
): Promise<ReleaseInfo | null> {
  try {
    const value = await fetcher();
    if (!isReleaseInfo(value)) return null;

    const release: ReleaseInfo = {
      tagName: value.tag_name,
      htmlUrl: value.html_url,
      draft: value.draft === true,
      prerelease: value.prerelease === true,
    };
    return shouldNotifyForRelease(release, currentVersion) ? release : null;
  } catch {
    return null;
  }
}

export function getNotifiedVersion(): string | null {
  try {
    return localStorage.getItem(NOTIFIED_VERSION_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function rememberNotifiedVersion(version: string): void {
  try {
    localStorage.setItem(NOTIFIED_VERSION_STORAGE_KEY, version);
  } catch {
    // Storage access must never affect the application.
  }
}
