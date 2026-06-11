import { useMemo, useState } from "react";
import type { GetBehaviorDetailsResponse } from "@zmkfirmware/zmk-studio-ts-client/behaviors";
import type { BehaviorBinding } from "@zmkfirmware/zmk-studio-ts-client/keymap";
import { keyRoleMap } from "../../keyboard/key-roles";
import { resolveBehaviorId } from "../resolve-behavior";
import {
  type ActionItem,
  getEditingItems,
  getWindowItems,
  getBrowserItems,
  getSystemShortcutItems,
  getTextNavItems,
  scrollItems,
  mouseItems,
  mediaItems,
  appLaunchItems,
  navItems,
} from "./actions-data";

type SubCategory =
  | "recommendations"
  | "editing"
  | "window"
  | "browser"
  | "system-shortcuts"
  | "text-nav"
  | "scroll"
  | "mouse"
  | "media"
  | "apps"
  | "nav";

const subCategories: { id: SubCategory; label: string }[] = [
  { id: "recommendations", label: "おすすめ" },
  { id: "editing", label: "編集" },
  { id: "window", label: "ウィンドウ" },
  { id: "browser", label: "ブラウザ" },
  { id: "system-shortcuts", label: "システム操作" },
  { id: "text-nav", label: "テキスト移動" },
  { id: "scroll", label: "スクロール" },
  { id: "mouse", label: "マウス" },
  { id: "media", label: "メディア" },
  { id: "apps", label: "アプリ起動" },
  { id: "nav", label: "ナビゲーション" },
];

interface ActionsTabProps {
  keyPosition?: number;
  behaviors: GetBehaviorDetailsResponse[];
  layers: { id: number; name: string }[];
  osMode: import("../use-cases").UserOS;
  onApplyBinding: (binding: BehaviorBinding) => void;
}

export function ActionsTab({ keyPosition, behaviors, osMode, onApplyBinding }: ActionsTabProps) {
  const hasRecommendations = keyPosition !== undefined && keyRoleMap[keyPosition] !== undefined;
  const [activeSub, setActiveSub] = useState<SubCategory>(
    hasRecommendations ? "recommendations" : "editing"
  );
  const behaviorIdMap = useMemo(() => {
    const map: Record<string, number> = {};
    for (const b of behaviors) {
      map[b.displayName] = b.id;
    }
    return map;
  }, [behaviors]);

  const editingItems = useMemo(() => getEditingItems(osMode), [osMode]);
  const windowItems = useMemo(() => getWindowItems(osMode), [osMode]);
  const browserItems = useMemo(() => getBrowserItems(osMode), [osMode]);
  const systemItems = useMemo(() => getSystemShortcutItems(osMode), [osMode]);
  const textNavItemsList = useMemo(() => getTextNavItems(osMode), [osMode]);

  const role = keyPosition !== undefined ? keyRoleMap[keyPosition] : undefined;

  const visibleSubCategories = subCategories.filter(
    (sub) => sub.id !== "recommendations" || hasRecommendations
  );

  const handleItemClick = (item: ActionItem) => {
    const behaviorId = behaviorIdMap[item.behaviorName];
    if (behaviorId === undefined) return;
    onApplyBinding({ behaviorId, param1: item.param1, param2: 0 });
  };

  const handleRecommendationClick = (rec: { behaviorDisplayName: string; param1: number; param2: number }) => {
    const behaviorId = resolveBehaviorId(rec.behaviorDisplayName, behaviors);
    if (behaviorId === undefined) return;
    onApplyBinding({ behaviorId, param1: rec.param1, param2: rec.param2 });
  };

  const renderRecommendations = () => {
    if (!role) return null;
    return (
      <div className="flex flex-col gap-2">
        <p className="text-sm text-base-content/60">{role.roleLabel}</p>
        <div className="flex gap-2 flex-wrap">
          {role.recommendations.map((rec) => (
            <button
              key={`${rec.behaviorDisplayName}-${rec.param1}-${rec.param2}`}
              className="flex flex-col items-center gap-1.5 px-5 py-4 rounded-xl border border-base-300 hover:border-primary hover:bg-primary/5 hover:shadow-md transition-all min-w-[6rem]"
              onClick={() => handleRecommendationClick(rec)}
            >
              <span className="text-base font-medium">{rec.label}</span>
              {rec.popular && (
                <span className="text-xs text-primary bg-primary/10 px-2 py-0.5 rounded-full">人気</span>
              )}
              <span className="text-sm text-base-content/40">{rec.description}</span>
            </button>
          ))}
        </div>
      </div>
    );
  };

  const renderActionItems = (items: ActionItem[]) => (
    <div className="flex flex-col gap-1">
      {items.map((item, i) => (
        <button
          key={i}
          className="flex items-center gap-3 px-3 py-2 text-sm rounded-md border border-base-300 bg-white hover:bg-primary/10 hover:border-primary/30 transition-all text-left"
          onClick={() => handleItemClick(item)}
        >
          <span className="font-medium">{item.label}</span>
          <span className="text-base-content/50">{item.description}</span>
        </button>
      ))}
    </div>
  );

  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-1 flex-wrap">
        {visibleSubCategories.map((sub) => (
          <button
            key={sub.id}
            className={`px-3 py-1 text-sm rounded-md ${
              activeSub === sub.id
                ? "bg-primary/10 text-primary font-medium"
                : "text-base-content/50 hover:text-base-content hover:bg-base-200"
            }`}
            onClick={() => setActiveSub(sub.id)}
          >
            {sub.label}
          </button>
        ))}
      </div>
      {activeSub === "recommendations" && renderRecommendations()}
      {activeSub === "editing" && renderActionItems(editingItems)}
      {activeSub === "window" && renderActionItems(windowItems)}
      {activeSub === "browser" && renderActionItems(browserItems)}
      {activeSub === "system-shortcuts" && renderActionItems(systemItems)}
      {activeSub === "text-nav" && renderActionItems(textNavItemsList)}
      {activeSub === "scroll" && renderActionItems(scrollItems)}
      {activeSub === "mouse" && renderActionItems(mouseItems)}
      {activeSub === "media" && renderActionItems(mediaItems)}
      {activeSub === "apps" && renderActionItems(appLaunchItems)}
      {activeSub === "nav" && renderActionItems(navItems)}
    </div>
  );
}
