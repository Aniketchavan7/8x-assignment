'use client';

import { AgGridReact } from 'ag-grid-react';
import {
  ClientSideRowModelModule,
  ModuleRegistry,
  RowSelectionModule,
  RowApiModule,
  ColumnApiModule,
  ColumnAutoSizeModule,
  _ColumnMoveModule,
  ValidationModule,
  CellStyleModule,
  RowStyleModule,
  QuickFilterModule,
  TooltipModule,
  TextEditorModule,
  NumberEditorModule,
  PinnedRowModule,
  TextFilterModule,
  NumberFilterModule,
} from 'ag-grid-community';
import type { AgGridReactProps } from 'ag-grid-react';

// Register AG Grid modules once when this chunk loads
ModuleRegistry.registerModules([
  ClientSideRowModelModule,
  RowSelectionModule,
  RowApiModule,
  ColumnApiModule,
  ColumnAutoSizeModule,
  _ColumnMoveModule,
  CellStyleModule,
  RowStyleModule,
  QuickFilterModule,
  TooltipModule,
  TextEditorModule,
  NumberEditorModule,
  PinnedRowModule,
  TextFilterModule,
  NumberFilterModule,
  ...(process.env.NODE_ENV !== 'production' ? [ValidationModule] : []),
]);

// Re-export the configured AgGridReact
export function AgGridWithModules<TData = unknown>(props: AgGridReactProps<TData>) {
  return <AgGridReact<TData> {...props} />;
}
