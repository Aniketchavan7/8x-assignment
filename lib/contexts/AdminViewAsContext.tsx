'use client';

import { createContext, useContext, ReactNode } from 'react';

export interface ViewAsContext {
  brandId: string | null;
  isViewingAs: boolean;
  viewAsType: 'brand' | null;
}

const ViewAsContext = createContext<ViewAsContext>({
  brandId: null,
  isViewingAs: false,
  viewAsType: null,
});

export function ViewAsProvider({
  children,
  brandId,
}: {
  children: ReactNode;
  brandId?: string | null;
}) {
  return (
    <ViewAsContext.Provider
      value={{
        brandId: brandId || null,
        isViewingAs: !!brandId,
        viewAsType: brandId ? 'brand' : null,
      }}
    >
      {children}
    </ViewAsContext.Provider>
  );
}

export function useViewAsContext() {
  return useContext(ViewAsContext);
}
