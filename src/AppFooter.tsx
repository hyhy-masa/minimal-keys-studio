import { CURRENT_APP_VERSION } from "./update/versionCheck";

export interface AppFooterProps {
  onShowAbout: () => void;
  onShowLicenseNotice: () => void;
}

export const AppFooter = ({
  onShowAbout,
  onShowLicenseNotice,
}: AppFooterProps) => {
  return (
    <div className="grid justify-center p-1 bg-base-200">
      <div>
        <span>minimal-keys カスタマイズ v{CURRENT_APP_VERSION}</span> ｜{" "}
        <a className="hover:text-primary hover:cursor-pointer" onClick={onShowAbout}>
          このアプリについて
        </a>{" "}
        -{" "}
        <a className="hover:text-primary hover:cursor-pointer" onClick={onShowLicenseNotice}>
          ライセンス
        </a>
      </div>
    </div>
  );
};
