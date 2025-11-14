import { create } from 'zustand';

export type ToastType = 'success' | 'error' | 'info' | 'warning';

export interface ToastItem {
  id: string;
  type: ToastType;
  message: string;
  timeout?: number;
}

interface ToastState {
  toasts: ToastItem[];
  addToast: (toast: Omit<ToastItem, 'id'>) => void;
  removeToast: (id: string) => void;
}

const genId = () => Math.random().toString(36).slice(2, 9);

export const useToastStore = create<ToastState>((set, get) => ({
  toasts: [],
  addToast: ({ type, message, timeout = 3000 }) => {
    const id = genId();
    set({ toasts: [...get().toasts, { id, type, message, timeout }] });
    if (timeout > 0) {
      setTimeout(() => get().removeToast(id), timeout);
    }
  },
  removeToast: (id) => {
    set({ toasts: get().toasts.filter((t) => t.id !== id) });
  },
}));

export const toast = {
  success: (message: string, timeout?: number) =>
    useToastStore.getState().addToast({ type: 'success', message, timeout }),
  error: (message: string, timeout?: number) =>
    useToastStore.getState().addToast({ type: 'error', message, timeout }),
  info: (message: string, timeout?: number) =>
    useToastStore.getState().addToast({ type: 'info', message, timeout }),
  warning: (message: string, timeout?: number) =>
    useToastStore.getState().addToast({ type: 'warning', message, timeout }),
};
