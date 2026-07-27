import React from "react";
import { useModalRef } from "./misc/useModalRef";

import cannonKeys from "./assets/cannonkeys.png";
import cannonKeysDarkMode from "./assets/cannonkeys-dark-mode.png";

import niceAndTyperactive from "./assets/niceandtyperactive.png";
import niceAndTyperactiveDarkMode from "./assets/niceandtyperactive-dark-mode.png";

import kinesis from "./assets/kinesis.png";
import kinesisDarkMode from "./assets/kinesis-dark-mode.png";

import keychron from "./assets/keychron.png";
import keychronDarkMode from "./assets/keychron-dark-mode.png";

import littleKeyboards from "./assets/littlekeyboards.avif";
import littleKeyboardsDarkMode from "./assets/littlekeyboards-dark-mode.avif";

import keebmaker from "./assets/keebmaker.png";
import keebmakerDarkMode from "./assets/keebmaker-dark-mode.png";

import keebio from "./assets/keebio.avif";

import deskHero from "./assets/deskhero.webp";
import deskHeroDarkMode from "./assets/deskhero-dark-mode.webp";

import mode from "./assets/mode.png";
import modeDarkMode from "./assets/mode-dark-mode.png";

import mechlovin from "./assets/mechloving.png";
import mechlovinDarkMode from "./assets/mechlovin-dark-mode.png";

import phaseByte from "./assets/phasebyte.png";

import keycapsss from "./assets/keycapsss.png";
import keycapsssDarkMode from "./assets/keycapsss-dark-mode.png";

import mekibo from "./assets/mekibo.png";
import mekiboDarkMode from "./assets/mekibo-dark-mode.png";

import splitkb from "./assets/splitkb.png";
import splitkbDarkMode from "./assets/splitkb-dark-mode.png";
import { GenericModal } from "./GenericModal";
import { ExternalLink } from "./misc/ExternalLink";
import { openUrl } from "@tauri-apps/plugin-opener";
import {
  checkForUpdate,
  CURRENT_APP_VERSION,
  type ReleaseInfo,
} from "./update/versionCheck";

export interface AboutModalProps {
  open: boolean;
  onClose: () => void;
}

enum SponsorSize {
  Large,
  Medium,
  Small,
}

const sponsors = [
  {
    level: "Platinum",
    size: SponsorSize.Large,
    vendors: [
      {
        name: "nice!keyboards / typeractive",
        img: niceAndTyperactive,
        darkModeImg: niceAndTyperactiveDarkMode,
        url: "https://typeractive.xyz/",
      },
      {
        name: "Kinesis",
        img: kinesis,
        darkModeImg: kinesisDarkMode,
        url: "https://kinesis-ergo.com/",
      },
    ],
  },
  {
    level: "Gold+",
    size: SponsorSize.Large,
    vendors: [
      {
        name: "CannonKeys",
        img: cannonKeys,
        darkModeImg: cannonKeysDarkMode,
        url: "https://cannonkeys.com/",
      },
      {
        name: "Keychron",
        img: keychron,
        darkModeImg: keychronDarkMode,
        url: "https://keychron.com/",
      },
    ],
  },
  {
    level: "Gold",
    size: SponsorSize.Medium,
    vendors: [
      {
        name: "Little Keyboards",
        img: littleKeyboards,
        darkModeImg: littleKeyboardsDarkMode,
        url: "https://littlekeyboards.com/",
      },
      {
        name: "Keebmaker",
        img: keebmaker,
        darkModeImg: keebmakerDarkMode,
        url: "https://keebmaker.com/",
      },
    ],
  },
  {
    level: "Silver",
    size: SponsorSize.Medium,
    vendors: [
      {
        name: "keeb.io",
        img: keebio,
        url: "https://keeb.io/",
      },
      {
        name: "Mode Designs",
        img: mode,
        darkModeImg: modeDarkMode,
        url: "https://modedesigns.com/",
      },
    ],
  },
  {
    level: "Bronze",
    size: SponsorSize.Small,
    vendors: [
      {
        name: "deskhero",
        img: deskHero,
        darkModeImg: deskHeroDarkMode,
        url: "https://deskhero.ca/",
      },
      {
        name: "PhaseByte",
        img: phaseByte,
        url: "https://phasebyte.com/",
      },
      {
        name: "Mechlovin'",
        img: mechlovin,
        darkModeImg: mechlovinDarkMode,
        url: "https://mechlovin.studio/",
      },
    ],
  },
  {
    level: "Additional",
    size: SponsorSize.Small,
    vendors: [
      {
        name: "splitkb.com",
        img: splitkb,
        darkModeImg: splitkbDarkMode,
        url: "https://splitkb.com/",
      },
      {
        name: "keycapsss",
        img: keycapsss,
        darkModeImg: keycapsssDarkMode,
        url: "https://keycapsss.com/",
      },
      {
        name: "mekibo",
        img: mekibo,
        darkModeImg: mekiboDarkMode,
        url: "https://mekibo.com/",
      },
    ],
  },
];

export const AboutModal = ({ open, onClose }: AboutModalProps) => {
  const ref = useModalRef(open, true);
  const [updateState, setUpdateState] = React.useState<
    "idle" | "checking" | "latest" | "available"
  >("idle");
  const [availableRelease, setAvailableRelease] =
    React.useState<ReleaseInfo | null>(null);

  const checkUpdate = async () => {
    setUpdateState("checking");
    const release = await checkForUpdate();
    if (release) {
      setAvailableRelease(release);
      setUpdateState("available");
    } else {
      setAvailableRelease(null);
      setUpdateState("latest");
    }
  };

  const openReleasePage = () => {
    if (availableRelease) openUrl(availableRelease.htmlUrl).catch(() => undefined);
  };

  return (
    <GenericModal ref={ref} className="min-w-min w-[70vw]" onClose={onClose}>
      <div className="flex justify-between items-start">
        <p>
          The ZMK Project:{" "}
          <ExternalLink href="https://zmk.dev/">website</ExternalLink>,{" "}
          <ExternalLink href="https://github.com/zmkfirmware/zmk/issues/">
            GitHub Issues
          </ExternalLink>
          ,{" "}
          <ExternalLink href="https://zmk.dev/community/discord/invite">
            Discord Server
          </ExternalLink>
        </p>
        <button
          className="p-1.5 rounded-md bg-gray-100 text-black hover:bg-gray-300"
          onClick={onClose}
        >
          Close
        </button>
      </div>
      <div>
        <p className="py-1 mr-2">
          ZMK Studio is made possible thanks to the generous donation of time
          from our contributors, as well as the financial sponsorship from the
          following vendors:
        </p>
      </div>
      <section className="my-4 rounded-md border border-base-300 p-3">
        <p>現在のバージョン: {CURRENT_APP_VERSION}</p>
        <div className="mt-2 flex items-center gap-3">
          <button
            className="inline-flex min-h-11 items-center justify-center rounded border border-primary bg-primary px-3 py-2 text-sm font-medium text-primary-content transition-colors hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-base-content disabled:cursor-not-allowed disabled:opacity-50"
            disabled={updateState === "checking"}
            onClick={checkUpdate}
          >
            {updateState === "checking" ? "確認中…" : "更新を確認"}
          </button>
          {updateState === "latest" && <span>最新版です</span>}
          {updateState === "available" && availableRelease && (
            <div className="flex items-center gap-2">
              <span>新しいバージョン {availableRelease.tagName} が公開されています</span>
              <button
                className="inline-flex min-h-11 items-center justify-center rounded border border-primary bg-base-100 px-3 py-2 text-sm font-medium text-primary transition-colors hover:bg-base-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                onClick={openReleasePage}
              >
                ダウンロードページを開く
              </button>
            </div>
          )}
        </div>
      </section>
      <div className="grid gap-2 auto-rows-auto grid-cols-[auto_minmax(min-content,1fr)] justify-items-center items-center">
        {sponsors.map((s) => {
          const heightVariants = {
            [SponsorSize.Large]: "h-16",
            [SponsorSize.Medium]: "h-12",
            [SponsorSize.Small]: "h-8",
          };

          return (
            <React.Fragment key={s.level}>
              <label>{s.level}</label>
              <div
                className={`grid grid-rows-1 gap-x-1 auto-cols-fr grid-flow-col justify-items-center items-center ${
                  heightVariants[s.size]
                }`}
              >
                {s.vendors.map((v) => {
                  const maxSizeVariants = {
                    [SponsorSize.Large]: "max-h-16",
                    [SponsorSize.Medium]: "max-h-12",
                    [SponsorSize.Small]: "max-h-8",
                  };

                  return (
                    <a key={v.name} href={v.url} target="_blank">
                      <picture aria-label={v.name}>
                        {v.darkModeImg && (
                          <source
                            className={maxSizeVariants[s.size]}
                            srcSet={v.darkModeImg}
                            media="(prefers-color-scheme: dark)"
                          />
                        )}
                        <img className={maxSizeVariants[s.size]} src={v.img} />
                      </picture>
                    </a>
                  );
                })}
              </div>
            </React.Fragment>
          );
        })}
      </div>
    </GenericModal>
  );
};
