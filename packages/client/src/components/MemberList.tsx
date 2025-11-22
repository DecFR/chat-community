import { useEffect, useState } from 'react';
import { useServerStore } from '../stores/serverStore';
import { UserAvatar } from './UserAvatar';
import { socketService } from '../lib/socket';
import api from '../lib/api';

interface Member {
  id: string;
  role: string;
  userId: string;
  user: {
    id: string;
    username: string;
    avatarUrl?: string;
    status?: 'ONLINE' | 'IDLE' | 'DO_NOT_DISTURB' | 'OFFLINE';
  };
}

interface ServerMemberUpdatePayload {
  serverId: string;
  userId: string;
  username: string;
  status: 'ONLINE' | 'OFFLINE' | 'IDLE' | 'DO_NOT_DISTURB';
  action: 'online' | 'offline';
}

export default function MemberList() {
  const { currentServerId } = useServerStore();
  const [members, setMembers] = useState<Member[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  // 1. 加载成员列表
  useEffect(() => {
    if (!currentServerId) {
      setMembers([]);
      return;
    }

    const fetchMembers = async () => {
      setIsLoading(true);
      try {
        const { data } = await api.get(`/servers/${currentServerId}/members`);
        if (data?.success) {
          setMembers(data.data || []);
        }
      } catch (error) {
        console.error('Failed to load members:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchMembers();
  }, [currentServerId]);

  // 2. 监听 Socket 事件
  useEffect(() => {
    const socket = socketService.getSocket();
    if (!socket || !currentServerId) return;

    const handleMemberUpdate = (data: ServerMemberUpdatePayload) => {
      if (data.serverId !== currentServerId) return;

      setMembers((prev) => {
        const exists = prev.find((m) => m.userId === data.userId);
        if (exists) {
          return prev.map((m) => {
            // 🟢 修复：确保 user 对象存在再更新，防止报错
            if (m.userId === data.userId && m.user) {
              return { ...m, user: { ...m.user, status: data.status } };
            }
            return m;
          });
        } else {
          // 如果是新上线的成员但列表中没有，简单起见不处理，或可选择重新拉取
          return prev;
        }
      });
    };

    const handleProfileUpdate = (data: { userId: string; avatarUrl?: string; username?: string }) => {
      setMembers((prev) =>
        prev.map((m) =>
          m.userId === data.userId && m.user
            ? {
                ...m,
                user: {
                  ...m.user,
                  ...(data.avatarUrl !== undefined && { avatarUrl: data.avatarUrl }),
                  ...(data.username && { username: data.username }),
                },
              }
            : m
        )
      );
    };

    const handleMemberAdded = () => {
        api.get(`/servers/${currentServerId}/members`).then(({ data }) => {
            if (data?.success) setMembers(data.data || []);
        });
    };

    const handleMemberRemoved = (data: { serverId: string; userId: string }) => {
      if (data.serverId !== currentServerId) return;
      setMembers((prev) => prev.filter((m) => m.userId !== data.userId));
    };

    socket.on('serverMemberUpdate', handleMemberUpdate);
    socket.on('userProfileUpdate', handleProfileUpdate);
    socket.on('friendProfileUpdate', handleProfileUpdate);
    socket.on('serverMemberAdded', handleMemberAdded);
    socket.on('serverMemberRemoved', handleMemberRemoved);

    return () => {
      socket.off('serverMemberUpdate', handleMemberUpdate);
      socket.off('userProfileUpdate', handleProfileUpdate);
      socket.off('friendProfileUpdate', handleProfileUpdate);
      socket.off('serverMemberAdded', handleMemberAdded);
      socket.off('serverMemberRemoved', handleMemberRemoved);
    };
  }, [currentServerId]);

  if (!currentServerId) return null;

  // 🟢 关键修复：先过滤掉 user 为 null/undefined 的无效数据
  const validMembers = members.filter(m => m && m.user);

  // 3. 排序
  const sortedMembers = [...validMembers].sort((a, b) => {
    const statusOrder: Record<string, number> = {
      ONLINE: 0,
      IDLE: 1,
      DO_NOT_DISTURB: 2,
      OFFLINE: 3,
    };
    
    // 🟢 安全访问可选链
    const statusA = statusOrder[a.user?.status || 'OFFLINE'];
    const statusB = statusOrder[b.user?.status || 'OFFLINE'];

    if (statusA !== statusB) {
      return statusA - statusB;
    }
    return (a.user?.username || '').localeCompare(b.user?.username || '');
  });

  // 4. 分组 (使用过滤后的 validMembers 数据源)
  const onlineMembers = sortedMembers.filter(m => m.user?.status && m.user?.status !== 'OFFLINE');
  const offlineMembers = sortedMembers.filter(m => !m.user?.status || m.user?.status === 'OFFLINE');

  return (
    <div className="w-60 bg-discord-darker flex flex-col h-full border-l border-discord-darkest shrink-0">
      <div className="h-12 border-b border-discord-darkest flex items-center px-4 font-semibold text-white shadow-md shrink-0">
        成员
      </div>

      <div className="flex-1 overflow-y-auto scrollbar-thin p-3 space-y-6">
        {isLoading ? (
          <div className="text-center text-gray-500 mt-4 text-sm">加载中...</div>
        ) : (
          <>
            {onlineMembers.length > 0 && (
              <div>
                <h3 className="text-xs font-semibold text-gray-400 uppercase mb-2 pl-2">
                  在线 — {onlineMembers.length}
                </h3>
                <div className="space-y-0.5">
                  {onlineMembers.map((member) => (
                    <MemberItem key={member.id} member={member} />
                  ))}
                </div>
              </div>
            )}

            {offlineMembers.length > 0 && (
              <div>
                <h3 className="text-xs font-semibold text-gray-400 uppercase mb-2 pl-2">
                  离线 — {offlineMembers.length}
                </h3>
                <div className="space-y-0.5">
                  {offlineMembers.map((member) => (
                    <MemberItem key={member.id} member={member} />
                  ))}
                </div>
              </div>
            )}

            {validMembers.length === 0 && (
              <div className="text-center text-gray-500 text-sm py-4">暂无成员</div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function MemberItem({ member }: { member: Member }) {
  let statusColor = 'bg-gray-500';
  // 🟢 安全访问
  const s = member.user?.status;
  if (s === 'ONLINE') statusColor = 'bg-green-500';
  else if (s === 'IDLE') statusColor = 'bg-yellow-500';
  else if (s === 'DO_NOT_DISTURB') statusColor = 'bg-red-500';

  return (
    <div className="flex items-center space-x-3 px-2 py-2 rounded hover:bg-discord-gray cursor-pointer group transition-colors">
      <div className="relative">
        <UserAvatar
          username={member.user?.username || 'Unknown'}
          avatarUrl={member.user?.avatarUrl}
          size="sm"
        />
        <div className={`absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full border-2 border-discord-darker ${statusColor}`}></div>
      </div>
      
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between">
          <span className={`font-medium truncate text-sm ${(!s || s === 'OFFLINE') ? 'text-gray-400' : 'text-gray-200 group-hover:text-white'}`}>
            {member.user?.username || 'Unknown'}
          </span>
          {member.role === 'OWNER' && (
            <span title="服务器拥有者" className="text-xs">👑</span>
          )}
        </div>
      </div>
    </div>
  );
}