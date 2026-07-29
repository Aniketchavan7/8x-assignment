'use client';

import dynamic from 'next/dynamic';
import { Skeleton } from '@/components/ui/skeleton';
import type { AgGridReactProps } from 'ag-grid-react';

// Loading skeleton for the grid
function GridLoadingSkeleton({ height = 'calc(100vh - 220px)' }: { height?: string }) {
  return (
    <div
      className="flex flex-col gap-2 p-4 border border-border rounded-md bg-muted/20"
      style={{ height, minHeight: '400px' }}
    >
      {/* Header row */}
      <div className="flex gap-4 pb-2 border-b border-border">
        <Skeleton className="h-8 w-8" />
        <Skeleton className="h-8 flex-1" />
        <Skeleton className="h-8 w-32" />
        <Skeleton className="h-8 w-24" />
        <Skeleton className="h-8 w-20" />
      </div>
      {/* Data rows */}
      {Array.from({ length: 10 }).map((_, i) => (
        <div key={i} className="flex gap-4 py-2">
          <Skeleton className="h-6 w-8" />
          <Skeleton className="h-6 flex-1" />
          <Skeleton className="h-6 w-32" />
          <Skeleton className="h-6 w-24" />
          <Skeleton className="h-6 w-20" />
        </div>
      ))}
    </div>
  );
}

// Register modules in a separate chunk
const AgGridWithModules = dynamic(
  () =>
    import('./AgGridWithModules').then((mod) => mod.AgGridWithModules),
  {
    ssr: false,
    loading: () => <GridLoadingSkeleton />,
  }
);

// Generic wrapper that passes through all props
export function LazyAgGrid<TData = unknown>(
  props: AgGridReactProps<TData> & { containerStyle?: React.CSSProperties }
) {
  const { containerStyle, ...gridProps } = props;
  return (
    <div style={containerStyle}>
      <AgGridWithModules {...(gridProps as AgGridReactProps)} />
    </div>
  );
}
