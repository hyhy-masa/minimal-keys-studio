import { createContext, useContext, useState, useEffect, useMemo, type ReactNode } from "react";
import { detectOS, type UserOS } from "./behaviors/use-cases";

interface OsModeContextValue {
  osMode: UserOS;
  setOsMode: (os: UserOS) => void;
}

const OsModeContext = createContext<OsModeContextValue>({
  osMode: "mac",
  setOsMode: () => {},
});

export function useOsMode(): OsModeContextValue {
  return useContext(OsModeContext);
}

function safeLocalStorageGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeLocalStorageSet(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // ignore
  }
}

export function OsModeProvider({ children }: { children: ReactNode }) {
  const [osMode, setOsMode] = useState<UserOS>(() => {
    const saved = safeLocalStorageGet("osMode");
    if (saved === "mac" || saved === "windows") return saved;
    return detectOS();
  });

  useEffect(() => {
    safeLocalStorageSet("osMode", osMode);
  }, [osMode]);

  const value = useMemo(() => ({ osMode, setOsMode }), [osMode]);

  return (
    <OsModeContext.Provider value={value}>
      {children}
    </OsModeContext.Provider>
  );
}
