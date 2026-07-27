import { openUrl } from "@tauri-apps/plugin-opener";
import type { ReleaseInfo } from "./versionCheck";

interface UpdateBannerProps {
  release: ReleaseInfo;
  onDismiss: () => void;
}

export function UpdateBanner({ release, onDismiss }: UpdateBannerProps) {
  const openReleasePage = () => {
    openUrl(release.htmlUrl).catch(() => undefined);
  };

  return (
    <div className="flex items-center justify-between gap-3 border-b border-primary/30 bg-primary/10 px-4 py-2 text-sm">
      <span>新しいバージョン {release.tagName} が公開されています</span>
      <div className="flex shrink-0 items-center gap-2">
        <button
          className="inline-flex min-h-11 items-center justify-center rounded border border-primary bg-primary px-3 py-2 text-sm font-medium text-primary-content transition-colors hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-base-content"
          onClick={openReleasePage}
        >
          ダウンロードページを開く
        </button>
        <button
          className="inline-flex min-h-11 items-center justify-center rounded border border-base-300 bg-base-100 px-3 py-2 text-sm font-medium text-base-content transition-colors hover:bg-base-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          onClick={onDismiss}
        >
          閉じる
        </button>
      </div>
    </div>
  );
}
