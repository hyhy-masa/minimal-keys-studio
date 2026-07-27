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
        <button className="btn btn-primary btn-sm" onClick={openReleasePage}>
          ダウンロードページを開く
        </button>
        <button className="btn btn-ghost btn-sm" onClick={onDismiss}>
          閉じる
        </button>
      </div>
    </div>
  );
}
