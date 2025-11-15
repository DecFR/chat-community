import { useEffect, useMemo, useRef, useState } from 'react';
import { useNotificationStore, type NotificationType } from '../stores/notificationStore';
import { useNavigate } from 'react-router-dom';

export default function NotificationCenter() {
  const navigate = useNavigate();
  const notifications = useNotificationStore((s) => s.notifications);
  const markAsReadStore = useNotificationStore((s) => s.markAsRead);
  const markAllAsReadStore = useNotificationStore((s) => s.markAllAsRead);
  const clearStore = useNotificationStore((s) => s.clear);
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const unreadCount = useMemo(() => notifications.filter((n) => !n.read).length, [notifications]);

  // 点击外部关闭通知面板
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const markAsRead = (id: string, n?: any) => {
    markAsReadStore(id);
    // 点击通知的默认导航行为
    const target = n || notifications.find((x) => x.id === id);
    if (target?.type === 'message' && target?.data && (target.data as any).friendId) {
      navigate(`/app/dm/${(target.data as any).friendId}`);
      setIsOpen(false);
    }
  };

  const markAllAsRead = () => {
    markAllAsReadStore();
  };

  const clearAll = () => {
    clearStore();
  };

  const getNotificationIcon = (type: NotificationType) => {
    switch (type) {
      case 'friend_request':
        return (
          <div className="w-10 h-10 rounded-full bg-blue-500/20 flex items-center justify-center">
            <svg className="w-5 h-5 text-blue-400" fill="currentColor" viewBox="0 0 20 20">
              <path d="M8 9a3 3 0 100-6 3 3 0 000 6zM8 11a6 6 0 016 6H2a6 6 0 016-6zM16 7a1 1 0 10-2 0v1h-1a1 1 0 100 2h1v1a1 1 0 102 0v-1h1a1 1 0 100-2h-1V7z" />
            </svg>
          </div>
        );
      case 'message':
        return (
          <div className="w-10 h-10 rounded-full bg-green-500/20 flex items-center justify-center">
            <svg className="w-5 h-5 text-green-400" fill="currentColor" viewBox="0 0 20 20">
              <path d="M2 5a2 2 0 012-2h12a2 2 0 012 2v10a2 2 0 01-2 2H4a2 2 0 01-2-2V5zm3.293 1.293a1 1 0 011.414 0l3 3a1 1 0 010 1.414l-3 3a1 1 0 01-1.414-1.414L7.586 10 5.293 7.707a1 1 0 010-1.414zM11 12a1 1 0 100 2h3a1 1 0 100-2h-3z" />
            </svg>
          </div>
        );
      case 'server_invite':
        return (
          <div className="w-10 h-10 rounded-full bg-purple-500/20 flex items-center justify-center">
            <svg className="w-5 h-5 text-purple-400" fill="currentColor" viewBox="0 0 20 20">
              <path d="M2.003 5.884L10 9.882l7.997-3.998A2 2 0 0016 4H4a2 2 0 00-1.997 1.884z" />
              <path d="M18 8.118l-8 4-8-4V14a2 2 0 002 2h12a2 2 0 002-2V8.118z" />
            </svg>
          </div>
        );
      case 'mention':
        return (
          <div className="w-10 h-10 rounded-full bg-yellow-500/20 flex items-center justify-center">
            <span className="text-yellow-400 font-bold text-lg">@</span>
          </div>
        );
      case 'system':
        return (
          <div className="w-10 h-10 rounded-full bg-gray-500/20 flex items-center justify-center">
            <svg className="w-5 h-5 text-gray-400" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.533 1.533 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.533 1.533 0 01.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z" clipRule="evenodd" />
            </svg>
          </div>
        );
      default:
        return (
          <div className="w-10 h-10 rounded-full bg-discord-blue/20 flex items-center justify-center">
            <svg className="w-5 h-5 text-discord-blue" fill="currentColor" viewBox="0 0 20 20">
              <path d="M10 2a6 6 0 00-6 6v3.586l-.707.707A1 1 0 004 14h12a1 1 0 00.707-1.707L16 11.586V8a6 6 0 00-6-6zM10 18a3 3 0 01-3-3h6a3 3 0 01-3 3z" />
            </svg>
          </div>
        );
    }
  };

  const getNotificationColor = (type: NotificationType) => {
    switch (type) {
      case 'friend_request':
        return 'border-l-4 border-blue-500';
      case 'message':
        return 'border-l-4 border-green-500';
      case 'server_invite':
        return 'border-l-4 border-purple-500';
      case 'mention':
        return 'border-l-4 border-yellow-500';
      case 'system':
        return 'border-l-4 border-gray-500';
      default:
        return 'border-l-4 border-discord-blue';
    }
  };

  return (
    <div className="relative" ref={dropdownRef}>
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
        <div className="absolute right-0 mt-2 w-[420px] bg-discord-darker rounded-xl shadow-2xl border border-gray-700/50 z-50 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
          {/* 头部 */}
          <div className="px-5 py-4 bg-gradient-to-r from-discord-darker to-discord-dark border-b border-gray-700/50">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <svg className="w-5 h-5 text-gray-400" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M10 2a6 6 0 00-6 6v3.586l-.707.707A1 1 0 004 14h12a1 1 0 00.707-1.707L16 11.586V8a6 6 0 00-6-6zM10 18a3 3 0 01-3-3h6a3 3 0 01-3 3z" />
                </svg>
                <h3 className="text-lg font-bold text-white">通知中心</h3>
                {unreadCount > 0 && (
                  <span className="px-2 py-0.5 bg-discord-red text-white text-xs font-bold rounded-full">
                    {unreadCount}
                  </span>
                )}
              </div>
              <div className="flex gap-2">
                {unreadCount > 0 && (
                  <button
                    onClick={markAllAsRead}
                    className="px-3 py-1.5 text-xs font-medium text-discord-blue hover:text-white hover:bg-discord-blue/20 rounded-md transition-all"
                  >
                    全部已读
                  </button>
                )}
                {notifications.length > 0 && (
                  <button
                    onClick={clearAll}
                    className="px-3 py-1.5 text-xs font-medium text-gray-400 hover:text-white hover:bg-gray-700/50 rounded-md transition-all"
                  >
                    清空
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* 通知列表 */}
          <div className="max-h-[500px] overflow-y-auto scrollbar-thin scrollbar-thumb-gray-700 scrollbar-track-transparent">
            {notifications.length === 0 ? (
              <div className="p-12 text-center">
                <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-gray-700/30 flex items-center justify-center">
                  <svg className="w-8 h-8 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                  </svg>
                </div>
                <p className="text-gray-400 font-medium">暂无通知</p>
                <p className="text-gray-500 text-sm mt-1">当有新消息时会显示在这里</p>
              </div>
            ) : (
              <div className="divide-y divide-gray-700/50">
                {notifications.map((notification) => (
                  <div
                    key={notification.id}
                    onClick={() => markAsRead(notification.id)}
                    className={`relative px-4 py-3.5 cursor-pointer transition-all hover:bg-discord-hover group ${
                      notification.read
                        ? 'bg-discord-darker'
                        : 'bg-discord-blue/5'
                    } ${getNotificationColor(notification.type)}`}
                  >
                    <div className="flex items-start gap-3">
                      {/* 图标 */}
                      <div className="flex-shrink-0 mt-0.5">
                        {getNotificationIcon(notification.type)}
                      </div>
                      
                      {/* 内容 */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2 mb-1">
                          <h4 className="font-semibold text-white text-sm leading-tight">
                            {notification.title}
                          </h4>
                          {!notification.read && (
                            <div className="w-2 h-2 bg-discord-blue rounded-full flex-shrink-0 mt-1.5 animate-pulse" />
                          )}
                        </div>
                        <p className="text-sm text-gray-300 leading-relaxed line-clamp-2 mb-2">
                          {notification.message}
                        </p>
                        <div className="flex items-center gap-2 text-xs text-gray-500">
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                          <span>
                            {new Date(notification.timestamp).toLocaleString('zh-CN', {
                              month: 'short',
                              day: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
