import { create } from 'zustand';

export type NotificationType = 'friend_request' | 'message' | 'server_invite' | 'mention' | 'system';

export interface AppNotification {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  timestamp: number;
  read: boolean;
  data?: Record<string, unknown>;
}

interface NotificationState {
  notifications: AppNotification[];
  add: (n: Omit<AppNotification, 'id' | 'timestamp' | 'read'> & { id?: string; timestamp?: number; read?: boolean }) => void;
  markAsRead: (id: string) => void;
  markAllAsRead: () => void;
  clear: () => void;
}

const genId = () => Math.random().toString(36).slice(2, 10);

export const useNotificationStore = create<NotificationState>((set, get) => ({
  notifications: [],
  add: (n) => {
    const item: AppNotification = {
      id: n.id || genId(),
      type: n.type,
      title: n.title,
      message: n.message,
      timestamp: n.timestamp || Date.now(),
      read: n.read ?? false,
      data: n.data,
    };
    set({ notifications: [item, ...get().notifications] });
  },
  markAsRead: (id) => {
    set({
      notifications: get().notifications.map((x) => (x.id === id ? { ...x, read: true } : x)),
    });
  },
  markAllAsRead: () => {
    set({ notifications: get().notifications.map((x) => ({ ...x, read: true })) });
  },
  clear: () => set({ notifications: [] }),
}));

export const notifyDM = (username: string, preview: string, friendId: string) => {
  useNotificationStore.getState().add({
    type: 'message',
    title: `来自 ${username} 的消息`,
    message: preview,
    data: { friendId },
  });
};
