import { useCallback, useRef } from 'react';
import type { ColumnState, GridApi, GridReadyEvent } from 'ag-grid-community';
import { safeGetItem, safeSetItem } from '@/lib/utils/localStorage';

/**
 * Persisted column state — only the fields we care about.
 * Stored per grid + entity in localStorage.
 */
interface PersistedColumnState {
  colId: string;
  width?: number;
  hide?: boolean;
}

function storageKey(gridId: string, entityId: string) {
  return `8x_grid_columns_${gridId}_${entityId}`;
}

function loadState(gridId: string, entityId: string): PersistedColumnState[] | null {
  const raw = safeGetItem(storageKey(gridId, entityId));
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed;
  } catch {
    // ignore corrupted data
  }
  return null;
}

function saveState(gridId: string, entityId: string, columns: PersistedColumnState[]) {
  safeSetItem(storageKey(gridId, entityId), JSON.stringify(columns));
}

/**
 * Hook that persists AG Grid column state (width, order, visibility)
 * to localStorage keyed by `gridId` + `entityId`.
 *
 * Usage:
 * ```ts
 * const { onGridReady, onColumnChanged } = useGridColumnState('pipeline', brand.id);
 *
 * <AgGrid
 *   onGridReady={onGridReady}
 *   onColumnResized={onColumnChanged}
 *   onColumnMoved={onColumnChanged}
 *   onColumnVisible={onColumnChanged}
 * />
 * ```
 */
export function useGridColumnState(gridId: string, entityId: string | undefined) {
  const apiRef = useRef<GridApi | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const persistNow = useCallback(() => {
    const api = apiRef.current;
    if (!api || !entityId) return;

    const columnState = api.getColumnState();
    if (!columnState) return;

    const persisted: PersistedColumnState[] = columnState.map((col) => ({
      colId: col.colId,
      width: col.width ?? undefined,
      hide: col.hide ?? undefined,
    }));

    saveState(gridId, entityId, persisted);
  }, [gridId, entityId]);

  const debouncedSave = useCallback(() => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(persistNow, 300);
  }, [persistNow]);

  const onGridReady = useCallback(
    (params: GridReadyEvent) => {
      apiRef.current = params.api;

      if (!entityId) return;
      const saved = loadState(gridId, entityId);
      if (!saved || saved.length === 0) return;

      // Build the state to apply — column order is determined by array order.
      // We merge saved state with the current state so new columns aren't lost.
      const currentState = params.api.getColumnState();
      if (!currentState) return;

      const savedMap = new Map(saved.map((s) => [s.colId, s]));
      const currentMap = new Map(currentState.map((c) => [c.colId, c]));

      // Start with saved order (for columns that still exist)
      const merged: ColumnState[] = [];
      for (const s of saved) {
        const current = currentMap.get(s.colId);
        if (!current) continue;
        merged.push({
          ...current,
          width: s.width ?? current.width,
          hide: s.hide ?? current.hide,
        });
      }
      // Append any new columns that weren't in saved state
      for (const c of currentState) {
        if (!savedMap.has(c.colId)) {
          merged.push(c);
        }
      }

      params.api.applyColumnState({ state: merged, applyOrder: true });
    },
    [gridId, entityId]
  );

  /**
   * Attach to onColumnResized, onColumnMoved, onColumnVisible.
   * Debounces writes so rapid resizing doesn't thrash storage.
   */
  const onColumnChanged = useCallback(() => {
    debouncedSave();
  }, [debouncedSave]);

  /**
   * Reset column state to defaults (removes localStorage entry).
   */
  const resetColumnState = useCallback(() => {
    if (!entityId) return;
    safeSetItem(storageKey(gridId, entityId), '');
    apiRef.current?.resetColumnState();
  }, [gridId, entityId]);

  /**
   * Toggle visibility of a column by colId.
   */
  const toggleColumnVisibility = useCallback(
    (colId: string) => {
      const api = apiRef.current;
      if (!api) return;
      const col = api.getColumn(colId);
      if (!col) return;
      api.setColumnsVisible([colId], !col.isVisible());
      debouncedSave();
    },
    [debouncedSave]
  );

  /**
   * Get current column visibility state.
   */
  const getColumnVisibility = useCallback((): Array<{ colId: string; headerName: string; visible: boolean }> => {
    const api = apiRef.current;
    if (!api) return [];
    const state = api.getColumnState();
    if (!state) return [];
    return state.map((col) => {
      const colDef = api.getColumn(col.colId)?.getColDef();
      return {
        colId: col.colId,
        headerName: colDef?.headerName ?? col.colId,
        visible: !col.hide,
      };
    });
  }, []);

  return {
    onGridReady,
    onColumnChanged,
    resetColumnState,
    toggleColumnVisibility,
    getColumnVisibility,
    apiRef,
  };
}
