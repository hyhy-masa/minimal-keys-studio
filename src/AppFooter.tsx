export interface AppFooterProps {
  onShowAbout: () => void;
  onShowLicenseNotice: () => void;
  onStartTour: () => void;
}

export const AppFooter = ({
  onShowAbout,
  onShowLicenseNotice,
  onStartTour,
}: AppFooterProps) => {
  return (
    <div className="grid justify-center p-1 bg-base-200">
      <div>
        <span>&copy; 2024 - The ZMK Contributors</span> -{" "}
        <a className="hover:text-primary hover:cursor-pointer" onClick={onShowAbout}>
          About ZMK Studio
        </a>{" "}
        -{" "}
        <a className="hover:text-primary hover:cursor-pointer" onClick={onShowLicenseNotice}>
          License NOTICE
        </a>{" "}
        -{" "}
        <a className="hover:text-primary hover:cursor-pointer" onClick={onStartTour}>
          使い方を見る
        </a>
      </div>
    </div>
  );
};
