'use client';

import { createContext, useContext, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

interface MobileHeaderContextValue {
  portalContainer: HTMLDivElement | null;
  setPortalContainer: (el: HTMLDivElement | null) => void;
}

const MobileHeaderContext = createContext<MobileHeaderContextValue>({
  portalContainer: null,
  setPortalContainer: () => {},
});

export function MobileHeaderProvider({ children }: { children: ReactNode }) {
  const [portalContainer, setPortalContainer] = useState<HTMLDivElement | null>(null);

  return (
    <MobileHeaderContext.Provider value={{ portalContainer, setPortalContainer }}>
      {children}
    </MobileHeaderContext.Provider>
  );
}

export function useMobileHeaderPortal() {
  return useContext(MobileHeaderContext);
}

export function MobileHeaderSlot({ children }: { children: ReactNode }) {
  const { portalContainer } = useContext(MobileHeaderContext);
  if (!portalContainer) return null;
  return createPortal(children, portalContainer);
}
