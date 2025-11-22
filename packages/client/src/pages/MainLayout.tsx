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

// 类型定义
interface MessageItem {
  id: string;
  authorId: string;
  channelId?: string;
  content?: string;
}

interface SocketMessage {
  authorId: string;
  channelId?: string;
  content?: string;
  attachments?: unknown[];
  author?: {
    username: string;
  };
}

interface FriendStatusData {
  userId: string;
  status: string;
}

interface UserProfileUpdateData {
  userId: string;
  avatarUrl?: string;
  username?: string;
}

export default function MainLayout() {
  const navigate = useNavigate();
  const { user, isAuthenticated, loadUser } = useAuthStore();
  const { isServersLoaded, loadServers, selectServer, servers } = useServerStore();
  const location = useLocation();
  const { loadFriends, loadPendingRequests, updateFriendStatus, friends } = useFriendStore();
  const [showSettings, setShowSettings] = useState(false);
  const { incrementChannel, incrementDM, setChannelCount, setDMCount } = useUnreadStore();

  // 核心适配逻辑：判断是否在具体的聊天页面
  const isChatView = location.pathname.startsWith('/app/channel/') || location.pathname.startsWith('/app/dm/');

  // 初始未读加载
  useEffect(() => {
    const run = async () => {
      if (!user) return;
      if (!isServersLoaded) return;
      try {
        const channels = (useServerStore.getState().servers || []).flatMap((s) => s.channels || []);
        await Promise.all(
          channels.map(async (ch) => {
            try {
              const stateRes = await messageAPI.getChannelState(ch.id);
              const lastRead = stateRes.data?.data?.lastReadMessageId as string | undefined;
              if (!lastRead) {
                setChannelCount(ch.id, 0);
                return;
              }
              const msgsRes = await messageAPI.getChannelMessages(ch.id, 100, undefined, lastRead);
              const msgs = (msgsRes.data?.data || []) as MessageItem[];
              const count = msgs.filter((m) => m.authorId !== user.id).length;
              setChannelCount(ch.id, count);
            } catch {
              // ignore
            }
          })
        );

        const friendsList = (useFriendStore.getState().friends || []);
        await Promise.all(
          friendsList.map(async (f) => {
            try {
              const stateRes = await messageAPI.getConversationState(f.id);
              const convId = stateRes.data?.data?.conversationId as string | undefined;
              const lastRead = stateRes.data?.data?.lastReadMessageId as string | undefined;
              if (!convId || !lastRead) {
                setDMCount(f.id, 0);
                return;
              }
              const msgsRes = await messageAPI.getConversationMessages(convId, 100, undefined, lastRead);
              const msgs = (msgsRes.data?.data || []) as MessageItem[];
              const count = msgs.filter((m) => m.authorId !== user.id).length;
              setDMCount(f.id, count);
            } catch {
              // ignore
            }
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
    loadUser();
    if (!isServersLoaded) loadServers();
    loadFriends();
    loadPendingRequests();

    const handleFriendStatusUpdate = (data: FriendStatusData) => updateFriendStatus(data.userId, data.status);
    socketService.on('friendStatusUpdate', handleFriendStatusUpdate);
    
    const handleFriendRequestAccepted = () => loadFriends();
    socketService.on('friendRequestAccepted', handleFriendRequestAccepted);

    return () => {
      socketService.off('friendStatusUpdate', handleFriendStatusUpdate);
      socketService.off('friendRequestAccepted', handleFriendRequestAccepted);
    };
  }, [isAuthenticated, navigate, loadUser, isServersLoaded, loadServers, loadFriends, loadPendingRequests, updateFriendStatus]);

  useEffect(() => { return; }, [isServersLoaded, servers]);

  useEffect(() => {
    if (!isAuthenticated || !user) return;
    const handleServerUpdate = () => loadServers();
    const handleChannelUpdate = () => loadServers();

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

  useEffect(() => {
    if (location.pathname === '/app') selectServer('');
  }, [location.pathname, selectServer]);

  useEffect(() => {
    if (!user || !isAuthenticated) return;
    const path = location.pathname;
    if (!path.startsWith('/app/channel/')) return;
    const parts = path.split('/');
    const channelId = parts[parts.length - 1];
    if (!channelId) return;
    const server = servers.find((s) => (s.channels || []).some((c) => c.id === channelId));
    // 🟢 修复：移除了 catch(e) 中的 e
    if (server) {
      try {
        socketService.joinServer(server.id);
        selectServer(server.id);
      } catch {
        // ignore
      }
    }
  }, [location.pathname, user, isAuthenticated, servers, selectServer]);

  useEffect(() => {
    const currentUserId = user?.id;
    if (!currentUserId) return;
    const handleSelfProfileUpdate = (data: UserProfileUpdateData) => {
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

  useEffect(() => {
    if (!user) return;
    const getActiveTarget = () => {
      const path = location.pathname;
      if (path.startsWith('/app/channel/')) return { type: 'channel' as const, id: path.split('/').pop()! };
      if (path.startsWith('/app/dm/')) return { type: 'dm' as const, id: path.split('/').pop()! };
      return { type: 'none' as const, id: '' };
    };

    const handleChannelMessage = (msg: SocketMessage) => {
      if (msg.authorId === user.id) return;
      const active = getActiveTarget();
      if (!(active.type === 'channel' && active.id === msg.channelId)) {
        if (msg.channelId) incrementChannel(msg.channelId);
      }
    };

    const handleDirectMessage = (msg: SocketMessage) => {
      if (msg.authorId === user.id) return;
      const active = getActiveTarget();
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
    
    socket.off('channelMessage');
    socket.off('directMessage');
    socket.on('channelMessage', handleChannelMessage);
    socket.on('directMessage', handleDirectMessage);

    return () => {
      socket.off('channelMessage', handleChannelMessage);
      socket.off('directMessage', handleDirectMessage);
    };
  }, [location.pathname, user?.id, incrementChannel, incrementDM]);

  useEffect(() => {
    if (user?.settings?.theme) {
      const body = document.body;
      const theme = user.settings.theme;
      if (theme === 'LIGHT') body.classList.add('light-theme'); else body.classList.remove('light-theme');
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
    <div className="h-screen flex bg-discord-dark overflow-hidden relative w-full">
      {/* 
        🟢 修复列表挤压：
        1. shrink-0: 禁止 flex 压缩
        2. overflow-hidden: 防止内部溢出
      */}
      <div className={`flex h-full shrink-0 overflow-hidden ${isChatView ? 'hidden md:flex' : 'flex w-full md:w-auto'}`}>
        
        {/* ServerList 组件内部通常是固定宽度的，但加个 div 包裹更保险 */}
        <div className="shrink-0 h-full">
          <ServerList />
        </div>
        
        {!(location.pathname.startsWith('/app/admin')) && (
          <div className="w-full md:w-60 flex flex-col border-r border-discord-darkest bg-discord-gray shrink-0">
             <ChannelList />
             
             {/* 底部导航栏 (Settings 按钮修复) */}
             <div className="h-14 bg-discord-darker flex items-center justify-around px-4 border-t border-discord-darkest md:hidden mt-auto shrink-0">
               <NotificationCenter />
               <button onClick={() => setShowSettings(true)} className="p-2 rounded hover:bg-discord-gray group">
                 {/* 🟢 修复头像显示：严格判断，避免裂图 */}
                 {user.avatarUrl ? (
                   <img 
                     src={user.avatarUrl} 
                     className="w-8 h-8 rounded-full bg-gray-600 object-cover border border-transparent group-hover:border-gray-400"
                     alt={user.username}
                   />
                 ) : (
                   <div className="w-8 h-8 rounded-full bg-discord-blue flex items-center justify-center text-white font-bold text-xs group-hover:bg-discord-blue-hover">
                     {user.username.substring(0, 2).toUpperCase()}
                   </div>
                 )}
               </button>
             </div>
          </div>
        )}
      </div>

      {/* 主内容区域 */}
      <div className={`flex-1 flex flex-col min-h-0 min-w-0 bg-discord-gray ${isChatView ? 'flex z-20 absolute inset-0 md:static md:z-0' : 'hidden md:flex'}`}>
        {/* ... (顶部栏保持不变) */}
        <div className="hidden md:flex h-12 bg-discord-darker border-b border-discord-darkest items-center justify-end px-4 gap-2 shrink-0">
          <NotificationCenter />
          <button onClick={() => setShowSettings(true)} className="p-2 rounded hover:bg-discord-gray transition-colors" title="用户设置">
            <svg className="w-5 h-5 text-discord-light-gray" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.533 1.533 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.533 1.533 0 01.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z" clipRule="evenodd" /></svg>
          </button>
        </div>

        <Outlet />
      </div>

      <div className="hidden md:block h-full">
        <MemberList />
      </div>

      {showSettings && <UserSettingsModal isOpen={showSettings} onClose={() => setShowSettings(false)} />}
    </div>
  );
}