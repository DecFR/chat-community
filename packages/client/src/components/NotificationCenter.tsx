import { useEffect, useState } from 'react';
import { socketService } from '../lib/socket';

interface Notification {
  id: string;
  type: 'friend_request' | 'message' | 'server_invite' | 'mention';
  title: string;
  message: string;
  timestamp: Date;
  read: boolean;
  data?: Record<string, unknown>;
}

export default function NotificationCenter() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    // 监听通知事件
    const handleNewNotification = (notification: Notification) => {
      setNotifications((prev) => [
        { ...notification, timestamp: new Date(), read: false },
        ...prev,
      ]);
      setUnreadCount((prev) => prev + 1);
    };

    socketService.on('notification', handleNewNotification);

    return () => {
      socketService.off('notification', handleNewNotification);
    };
  }, []);

  const markAsRead = (id: string) => {
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, read: true } : n))
    );
    setUnreadCount((prev) => Math.max(0, prev - 1));
  };

  const markAllAsRead = () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    setUnreadCount(0);
  };

  const clearAll = () => {
    setNotifications([]);
    setUnreadCount(0);
  };

  const getNotificationIcon = (type: Notification['type']) => {
    switch (type) {
      case 'friend_request':
        return '👥';
      case 'message':
        return '💬';
      case 'server_invite':
        return '📨';
      case 'mention':
        return '@';
      default:
        return '🔔';
    }
  };

  return (
    <div className="relative">
      {/* 通知铃铛按钮 */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="relative p-2 rounded-lg hover:bg-discord-hover transition-colors"
      >
        <svg
          className="w-6 h-6"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
          />
        </svg>
        {unreadCount > 0 && (
          <span className="absolute top-0 right-0 bg-discord-red text-white text-xs rounded-full w-5 h-5 flex items-center justify-center font-bold">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {/* 通知面板 */}
      {isOpen && (
        <div className="absolute right-0 mt-2 w-96 bg-discord-darker rounded-lg shadow-xl z-50">
          <div className="p-4 border-b border-gray-700 flex items-center justify-between">
            <h3 className="text-lg font-bold">通知</h3>
            <div className="flex gap-2">
              {unreadCount > 0 && (
                <button
                  onClick={markAllAsRead}
                  className="text-sm text-discord-blue hover:underline"
                >
                  全部已读
                </button>
              )}
              {notifications.length > 0 && (
                <button
                  onClick={clearAll}
                  className="text-sm text-gray-400 hover:text-white"
                >
                  清空
                </button>
              )}
            </div>
          </div>

          <div className="max-h-96 overflow-y-auto scrollbar-thin">
            {notifications.length === 0 ? (
              <div className="p-8 text-center text-gray-400">
                <div className="text-4xl mb-2">🔔</div>
                <div>暂无通知</div>
              </div>
            ) : (
              notifications.map((notification) => (
                <div
                  key={notification.id}
                  onClick={() => markAsRead(notification.id)}
                  className={`p-4 border-b border-gray-700 cursor-pointer transition-colors ${
                    notification.read
                      ? 'bg-discord-darker hover:bg-discord-hover'
                      : 'bg-discord-blue bg-opacity-10 hover:bg-opacity-20'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div className="text-2xl">
                      {getNotificationIcon(notification.type)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-1">
                        <div className="font-semibold truncate">
                          {notification.title}
                        </div>
                        {!notification.read && (
                          <div className="w-2 h-2 bg-discord-blue rounded-full ml-2 flex-shrink-0" />
                        )}
                      </div>
                      <div className="text-sm text-gray-400 line-clamp-2">
                        {notification.message}
                      </div>
                      <div className="text-xs text-gray-500 mt-1">
                        {new Date(notification.timestamp).toLocaleString(
                          'zh-CN',
                          {
                            month: 'short',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                          }
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
