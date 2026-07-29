/**
 * AG Grid Theme Configuration
 *
 * Configures AG Grid to match the app's design system using CSS variables.
 * Supports both light and dark modes.
 */

import { themeQuartz } from 'ag-grid-community';

/**
 * Custom AG Grid theme built on Quartz base theme
 * Uses CSS variables to match the app's design tokens
 */
export const appAgGridTheme = themeQuartz.withParams({
  // Core colors mapped to app design tokens
  backgroundColor: 'hsl(var(--background))',
  foregroundColor: 'hsl(var(--foreground))',
  browserColorScheme: 'light',

  // Border and spacing
  borderColor: 'hsl(var(--border))',
  borderRadius: 6,
  wrapperBorderRadius: 0,

  // Header styling
  headerBackgroundColor: 'hsl(var(--background))',
  headerTextColor: 'hsl(var(--muted-foreground))',
  headerFontWeight: 500,
  headerFontSize: 13,

  // Row styling
  rowBorder: true,
  oddRowBackgroundColor: 'transparent',

  // Cell styling
  cellTextColor: 'hsl(var(--foreground))',
  fontSize: 14,

  // Selection colors
  selectedRowBackgroundColor: 'hsl(var(--accent))',
  rowHoverColor: 'hsl(var(--muted) / 0.3)',

  // Spacing
  spacing: 8,
  cellHorizontalPadding: 16,
  headerHeight: 44,
  rowHeight: 52,
});

/**
 * Dark mode theme variant
 */
export const appAgGridThemeDark = themeQuartz.withParams({
  backgroundColor: 'hsl(222.2 84% 4.9%)',
  foregroundColor: 'hsl(210 40% 98%)',
  browserColorScheme: 'dark',

  borderColor: 'hsl(217.2 32.6% 17.5%)',
  borderRadius: 6,
  wrapperBorderRadius: 0,

  headerBackgroundColor: 'hsl(222.2 84% 4.9%)',
  headerTextColor: 'hsl(210 40% 70%)',
  headerFontWeight: 500,
  headerFontSize: 13,

  rowBorder: true,
  oddRowBackgroundColor: 'transparent',

  cellTextColor: 'hsl(210 40% 98%)',
  fontSize: 14,

  selectedRowBackgroundColor: 'hsl(217.2 32.6% 17.5%)',
  rowHoverColor: 'hsl(217.2 32.6% 12%)',

  spacing: 8,
  cellHorizontalPadding: 16,
  headerHeight: 44,
  rowHeight: 52,
});

/**
 * AG Grid CSS class name to apply to the grid container
 */
export const AG_GRID_CLASS = 'ag-theme-quartz';

/**
 * Custom CSS overrides for AG Grid to match app design
 * Add these to your global CSS or a dedicated stylesheet
 */
export const agGridCustomStyles = `
  .ag-theme-quartz {
    --ag-background-color: hsl(var(--background));
    --ag-foreground-color: hsl(var(--foreground));
    --ag-border-color: hsl(var(--border));
    --ag-header-background-color: hsl(var(--background));
    --ag-header-foreground-color: hsl(var(--muted-foreground));
    --ag-row-hover-color: hsl(var(--muted) / 0.3);
    --ag-selected-row-background-color: hsl(var(--accent));
    --ag-odd-row-background-color: transparent;
    --ag-font-family: inherit;
    --ag-header-height: 44px;
    --ag-row-height: 52px;
    --ag-cell-horizontal-padding: 16px;
    font-family: inherit;
  }
  
  .dark .ag-theme-quartz {
    --ag-background-color: hsl(222.2 84% 4.9%);
    --ag-foreground-color: hsl(210 40% 98%);
    --ag-border-color: hsl(217.2 32.6% 17.5%);
    --ag-header-background-color: hsl(222.2 84% 4.9%);
    --ag-header-foreground-color: hsl(210 40% 70%);
    --ag-row-hover-color: hsl(217.2 32.6% 12%);
    --ag-selected-row-background-color: hsl(217.2 32.6% 17.5%);
  }
  
  /* Remove outer border for edge-to-edge look */
  .ag-theme-quartz .ag-root-wrapper {
    border: none;
    border-radius: 0;
  }
  
  /* Subtle row borders */
  .ag-theme-quartz .ag-row {
    border-bottom: 1px solid hsl(var(--border) / 0.5);
  }
  
  /* Header border */
  .ag-theme-quartz .ag-header {
    border-bottom: 1px solid hsl(var(--border));
  }
  
  /* Pinned column shadows */
  .ag-theme-quartz .ag-pinned-left-cols-container {
    box-shadow: 2px 0 4px -2px rgba(0, 0, 0, 0.1);
  }
  
  .ag-theme-quartz .ag-pinned-right-cols-container {
    box-shadow: -2px 0 4px -2px rgba(0, 0, 0, 0.1);
  }
  
  .dark .ag-theme-quartz .ag-pinned-left-cols-container,
  .dark .ag-theme-quartz .ag-pinned-right-cols-container {
    box-shadow: none;
  }
  
  /* Checkbox styling */
  .ag-theme-quartz .ag-checkbox-input-wrapper {
    width: 16px;
    height: 16px;
  }
  
  /* Pagination panel styling */
  .ag-theme-quartz .ag-paging-panel {
    border-top: 1px solid hsl(var(--border));
    padding: 8px 16px;
  }
`;
