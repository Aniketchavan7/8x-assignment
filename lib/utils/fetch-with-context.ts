'use client';

import { useCallback } from 'react';
import { useViewAsContext } from '@/lib/contexts/AdminViewAsContext';

export function useFetchWithContext() {
  const { brandId, isViewingAs } = useViewAsContext();

  return useCallback(
    async (input: RequestInfo | URL, options: RequestInit = {}): Promise<Response> => {
      const headers = new Headers(options.headers);

      if (isViewingAs && brandId) {
        headers.set('x-admin-view-as-brand', brandId);
      }

      return fetch(input, { ...options, headers });
    },
    [brandId, isViewingAs]
  );
}
