import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import {
  applyThemePref,
  nextThemePref,
  readThemePref,
  type ThemePref,
} from '@/shared/lib/theme';

interface ArchiveDrawerContextValue {
  drawerOpen: boolean;
  setDrawerOpen: (open: boolean) => void;
  toggleDrawer: () => void;
  theme: ThemePref;
  cycleTheme: () => void;
}

const ArchiveDrawerContext = createContext<ArchiveDrawerContextValue | null>(null);

export function ArchiveDrawerProvider({ children }: { children: ReactNode }) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [theme, setTheme] = useState<ThemePref>(() => readThemePref());

  useEffect(() => {
    applyThemePref(theme);
  }, [theme]);

  return (
    <ArchiveDrawerContext.Provider
      value={{
        drawerOpen,
        setDrawerOpen,
        toggleDrawer: () => setDrawerOpen((v) => !v),
        theme,
        cycleTheme: () => setTheme((prev) => nextThemePref(prev)),
      }}
    >
      {children}
    </ArchiveDrawerContext.Provider>
  );
}

export function useArchiveDrawer(): ArchiveDrawerContextValue {
  const ctx = useContext(ArchiveDrawerContext);
  if (!ctx) {
    throw new Error('useArchiveDrawer must be used inside ArchiveDrawerProvider');
  }
  return ctx;
}
