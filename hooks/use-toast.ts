'use client';

import { useState, useCallback, useEffect } from 'react';

export type ToastVariant = 'default' | 'destructive' | 'success';

export interface Toast {
  id: string;
  title?: string;
  description?: string;
  variant?: ToastVariant;
  persistent?: boolean;
  onClick?: () => void;
}

let toastListeners: Array<(toasts: Toast[]) => void> = [];
let toasts: Toast[] = [];

function notify() {
  toastListeners.forEach((listener) => listener([...toasts]));
}

export function dismissToast(id: string) {
  toasts = toasts.filter((t) => t.id !== id);
  notify();
}

/** Standalone toast function — callable outside React components/hooks. */
export function showToast({
  title,
  description,
  variant = 'default',
  persistent = false,
  onClick,
}: Omit<Toast, 'id'>) {
  const id = Math.random().toString(36).substring(2, 9);
  const newToast: Toast = { id, title, description, variant, persistent, onClick };
  toasts = [...toasts, newToast];
  notify();

  if (!persistent) {
    setTimeout(() => {
      toasts = toasts.filter((t) => t.id !== id);
      notify();
    }, 5000);
  }
}

export function useToast() {
  const [toastState, setToastState] = useState<Toast[]>([]);

  useEffect(() => {
    const listener = (newToasts: Toast[]) => {
      setToastState(newToasts);
    };
    toastListeners.push(listener);
    listener(toasts);
    return () => {
      toastListeners = toastListeners.filter((l) => l !== listener);
    };
  }, []);

  const toast = useCallback(
    (opts: Omit<Toast, 'id'>) => {
      showToast(opts);
    },
    []
  );

  return {
    toast,
    toasts: toastState,
  };
}
