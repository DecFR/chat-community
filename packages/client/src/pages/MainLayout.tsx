import { useEffect, useState } from 'react';
import { Outlet, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';
import { useServerStore } from '../stores/serverStore';
import { useFriendStore } from '../stores/friendStore';
import { socketService } from '../lib/socket';
import ServerList from '../components/ServerList';
import ChannelList from '../components/ChannelList';
import MemberList from '../components/MemberList';
import UserSettingsModal from '../components/UserSettingsModal';
import NotificationCenter from '../components/NotificationCenter';

export default function MainLayout() {
  const navigate = useNavigate();
  const { user, isAuthenticated, loadUser, logout } = useAuthStore();
  const { loadServers } = useServerStore();
  const { loadFriends, loadPendingRequests, updateFriendStatus } = useFriendStore();
  const [showSettings, setShowSettings] = useState(false);

  useEffect(() => {
    if (!isAuthenticated) {
      navigate('/login');
      return;
    }

    // 加载用户信息
    loadUser();

    // 加载服务器和好友
    loadServers();
    loadFriends();
    loadPendingRequests();

    // 监听好友状态更新
    socketService.on('friendStatusUpdate', (data: any) => {
      updateFriendStatus(data.userId, data.status);
    });

    return () => {
      socketService.off('friendStatusUpdate');
    };
  }, [isAuthenticated, navigate, loadUser, loadServers, loadFriends, loadPendingRequests, updateFriendStatus]);

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-discord-dark">
        <div className="text-white">加载中...</div>
      </div>
    );
  }

  return (
    <div className="h-screen flex bg-discord-dark overflow-hidden">
      {/* 最左侧：服务器列表 */}
      <ServerList />

      {/* 中间：频道/好友列表 */}
      <ChannelList />

      {/* 主内容区域 */}
      <div className="flex-1 flex flex-col">
        {/* 顶部状态栏 */}
        <div className="h-12 bg-discord-darker border-b border-discord-darkest flex items-center justify-between px-4">
          <div className="flex items-center space-x-4">
            <span className="text-white font-semibold">{user?.username}</span>
            <span className="text-discord-light-gray text-sm">在线 - {0}</span>
          </div>
          <div className="flex items-center space-x-2">
            <NotificationCenter />
            <button
              onClick={() => setShowSettings(true)}
              className="p-2 rounded hover:bg-discord-gray transition-colors"
              title="用户设置"
            >
              <svg className="w-5 h-5 text-discord-light-gray" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.533 1.533 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.533 1.533 0 01.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z" clipRule="evenodd" />
              </svg>
            </button>
          </div>
        </div>

        <Outlet />
      </div>

      {/* 右侧：成员列表 */}
      <MemberList />

      {/* 用户设置模态框 */}
      {showSettings && (
        <UserSettingsModal
          isOpen={showSettings}
          onClose={() => setShowSettings(false)}
        />
      )}
    </div>
  );
}
