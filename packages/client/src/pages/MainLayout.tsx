import { useEffect, useState } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';
import { useServerStore } from '../stores/serverStore';
import { useFriendStore } from '../stores/friendStore';
import { socketService } from '../lib/socket';
import { useUnreadStore } from '../stores/unreadStore';
import { notifyDM } from '../stores/notificationStore';
import { messageAPI } from '../lib/api';
import ServerList from '../components/ServerList';
import ChannelList from '../components/ChannelList';
import MemberList from '../components/MemberList';
import UserSettingsModal from '../components/UserSettingsModal';
import NotificationCenter from '../components/NotificationCenter';

export default function MainLayout() {
  const navigate = useNavigate();
  const { user, isAuthenticated, loadUser } = useAuthStore();
  const { isServersLoaded, loadServers, selectServer, servers } = useServerStore();
  const location = useLocation();
  const { loadFriends, loadPendingRequests, updateFriendStatus, friends } = useFriendStore();
  const [showSettings, setShowSettings] = useState(false);
  const { incrementChannel, incrementDM, setChannelCount, setDMCount } = useUnreadStore();

  // 初始未读加载（基于 lastReadMessageId 差集）
  useEffect(() => {
    const run = async () => {
      if (!user) return;
      // 需要服务器和好友列表
      // 等待服务器加载完成
      if (!isServersLoaded) return;
      try {
        // 频道未读
        const channels = (useServerStore.getState().servers || []).flatMap((s) => s.channels || []);
        await Promise.all(
          channels.map(async (ch) => {
            try {
              const stateRes = await messageAPI.getChannelState(ch.id);
              const lastRead = stateRes.data?.data?.lastReadMessageId as string | undefined;
              if (!lastRead) {
                // 没有已读状态，默认 0，避免噪音
                setChannelCount(ch.id, 0);
                return;
              }
              const msgsRes = await messageAPI.getChannelMessages(ch.id, 100, undefined, lastRead);
              const msgs = msgsRes.data?.data || [];
              const count = msgs.filter((m: any) => m.authorId !== user.id).length;
              setChannelCount(ch.id, count);
            } catch {}
          })
        );

        // 私聊未读
        const friends = (useFriendStore.getState().friends || []);
        await Promise.all(
          friends.map(async (f) => {
            try {
              const stateRes = await messageAPI.getConversationState(f.id);
              const convId = stateRes.data?.data?.conversationId as string | undefined;
              const lastRead = stateRes.data?.data?.lastReadMessageId as string | undefined;
              if (!convId || !lastRead) {
                setDMCount(f.id, 0);
                return;
              }
              const msgsRes = await messageAPI.getConversationMessages(convId, 100, undefined, lastRead);
              const msgs = msgsRes.data?.data || [];
              const count = msgs.filter((m: any) => m.authorId !== user.id).length;
              setDMCount(f.id, count);
            } catch {}
          })
        );
      } catch (e) {
        console.error('Failed to load initial unread counts', e);
      }
    };
    run();
  }, [user, isServersLoaded, friends.length, setChannelCount, setDMCount]);

  useEffect(() => {
    if (!isAuthenticated) {
      navigate('/login');
      return;
    }

    // 初始加载
    loadUser();
    if (!isServersLoaded) {
      loadServers();
    }
    loadFriends();
    loadPendingRequests();

    // 监听好友状态更新
    const handleFriendStatusUpdate = (data: any) => {
      updateFriendStatus(data.userId, data.status);
    };
    socketService.on('friendStatusUpdate', handleFriendStatusUpdate);

    // 监听好友请求被接受
    const handleFriendRequestAccepted = () => {
      // 重新加载好友列表
      loadFriends();
    };
    socketService.on('friendRequestAccepted', handleFriendRequestAccepted);

    return () => {
      socketService.off('friendStatusUpdate', handleFriendStatusUpdate);
      socketService.off('friendRequestAccepted', handleFriendRequestAccepted);
    };
  }, [isAuthenticated, navigate, loadUser, isServersLoaded, loadServers, loadFriends, loadPendingRequests, updateFriendStatus]);

  // 当服务器加载完成后，立即加入所有服务器房间
  useEffect(() => {
    if (!isServersLoaded || servers.length === 0) return;
    
    console.log('[MainLayout] Servers loaded, joining all server rooms');
    const serverIds = servers.map(s => s.id).filter(Boolean);
    socketService.joinServers(serverIds);
    
    // 设置Socket重连回调，重连后自动重新加入所有房间
    socketService.setReconnectCallback(() => {
      console.log('[MainLayout] Socket reconnected, rejoining all server rooms');
      const { servers } = useServerStore.getState();
      const serverIds = servers.map(s => s.id).filter(Boolean);
      socketService.joinServers(serverIds);
    });
  }, [isServersLoaded, servers]);

  // 监听服务器和频道变化,实时更新
  useEffect(() => {
    if (!isAuthenticated || !user) return;

    const handleServerUpdate = () => {
      console.log('[MainLayout] Server updated, reloading...');
      loadServers();
    };

    const handleChannelUpdate = () => {
      console.log('[MainLayout] Channel updated, reloading...');
      loadServers();
    };

    socketService.on('serverCreated', handleServerUpdate);
    socketService.on('serverUpdated', handleServerUpdate);
    socketService.on('serverDeleted', handleServerUpdate);
    socketService.on('channelCreated', handleChannelUpdate);
    socketService.on('channelUpdated', handleChannelUpdate);
    socketService.on('channelDeleted', handleChannelUpdate);

    return () => {
      socketService.off('serverCreated', handleServerUpdate);
      socketService.off('serverUpdated', handleServerUpdate);
      socketService.off('serverDeleted', handleServerUpdate);
      socketService.off('channelCreated', handleChannelUpdate);
      socketService.off('channelUpdated', handleChannelUpdate);
      socketService.off('channelDeleted', handleChannelUpdate);
    };
  }, [isAuthenticated, user, loadServers]);

  // 路由守卫：当路径为 /app（主页）时，强制清空服务器/频道选择，避免任何副作用重新选中
  useEffect(() => {
    if (location.pathname === '/app') {
      selectServer('');
    }
  }, [location.pathname, selectServer]);

  // 监听自身资料更新（头像、昵称）以便全局同步
  useEffect(() => {
    const currentUserId = user?.id;
    if (!currentUserId) return;
    const handleSelfProfileUpdate = (data: { userId: string; avatarUrl?: string; username?: string }) => {
      if (data.userId !== currentUserId) return;
      useAuthStore.getState().updateUser({
        ...(data.avatarUrl !== undefined && { avatarUrl: data.avatarUrl }),
        ...(data.username && { username: data.username })
      });
    };
    socketService.on('userProfileUpdate', handleSelfProfileUpdate);
    return () => {
      socketService.off('userProfileUpdate', handleSelfProfileUpdate);
    };
  }, [user?.id]);

  // 全局监听新消息以更新未读计数
  useEffect(() => {
    if (!user) return;

    const getActiveTarget = () => {
      const path = location.pathname;
      if (path.startsWith('/app/channel/')) {
        const id = path.split('/').pop()!;
        return { type: 'channel' as const, id };
      }
      if (path.startsWith('/app/dm/')) {
        const id = path.split('/').pop()!;
        return { type: 'dm' as const, id };
      }
      return { type: 'none' as const, id: '' };
    };

    const handleChannelMessage = (msg: any) => {
      // 自己发送的不计未读
      if (msg.authorId === user.id) return;
      const active = getActiveTarget();
      if (!(active.type === 'channel' && active.id === msg.channelId)) {
        if (msg.channelId) incrementChannel(msg.channelId);
      }
    };

    const handleDirectMessage = (msg: any) => {
      // 自己发送的不计未读
      if (msg.authorId === user.id) return;
      const active = getActiveTarget();
      // 在 DM 页时，路由最后一段即为对方的 userId
      const friendId = msg.authorId;
      if (!(active.type === 'dm' && active.id === friendId)) {
        incrementDM(friendId);
        const hasAttachment = Array.isArray(msg?.attachments) && msg.attachments.length > 0;
        const hint = hasAttachment ? ' [附件]' : '';
        const preview = (msg?.content || '').toString().slice(0, 80) + hint;
        notifyDM(msg?.author?.username || '好友', preview, friendId);
      }
    };

    const socket = socketService.getSocket();
    if (!socket) return;
    
    // 先移除可能存在的旧监听器,防止重复注册
    socket.off('channelMessage');
    socket.off('directMessage');
    
    // 注册新监听器
    socket.on('channelMessage', handleChannelMessage);
    socket.on('directMessage', handleDirectMessage);

    return () => {
      socket.off('channelMessage', handleChannelMessage);
      socket.off('directMessage', handleDirectMessage);
    };
  }, [location.pathname, user?.id, incrementChannel, incrementDM]);

  // 应用用户的主题设置
  useEffect(() => {
    if (user?.settings?.theme) {
      const body = document.body;
      const theme = user.settings.theme;
      
      if (theme === 'LIGHT') {
        body.classList.add('light-theme');
      } else {
        body.classList.remove('light-theme');
      }
    }
  }, [user]);

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

      {/* 中间：频道/好友列表（管理员面板时隐藏以扩大空间） */}
      {!(location.pathname.startsWith('/app/admin')) && <ChannelList />}

      {/* 主内容区域 */}
      <div className="flex-1 flex flex-col min-h-0 min-w-0">
        {/* 顶部状态栏 */}
        <div className="h-12 bg-discord-darker border-b border-discord-darkest flex items-center justify-end px-4 gap-2">
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

        {/* 让子路由区域可滚动而不撑高父容器 */}
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
