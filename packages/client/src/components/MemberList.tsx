import { useEffect, useState } from 'react';
import { useServerStore } from '../stores/serverStore';
import { UserAvatar } from './UserAvatar';
import { socketService } from '../lib/socket';
import api from '../lib/api'; // 保持你原有的 api 引用方式

// 定义符合 Prisma 输出的数据结构 (嵌套 user)
interface Member {
  id: string;        // ServerMember 的 ID
  role: string;
  userId: string;    // 关联 User 的 ID
  user: {
    id: string;
    username: string;
    avatarUrl?: string;
    // 状态字段
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
        // 注意：这里假设你的 API 返回的是 { success: true, data: [...] }
        const { data } = await api.get(`/servers/${currentServerId}/members`);
        if (data?.success) {
          setMembers(data.data);
        }
      } catch (error) {
        console.error('Failed to load members:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchMembers();
  }, [currentServerId]);

  // 2. 监听 Socket 事件 (实时状态更新)
  useEffect(() => {
    const socket = socketService.getSocket();
    if (!socket || !currentServerId) return;

    // 处理成员状态变更 (上线/下线)
    const handleMemberUpdate = (data: ServerMemberUpdatePayload) => {
      if (data.serverId !== currentServerId) return;

      setMembers((prev) => {
        // 检查成员是否已在列表中
        const exists = prev.find((m) => m.userId === data.userId);
        
        if (exists) {
          // 如果存在，更新状态
          return prev.map((m) =>
            m.userId === data.userId
              ? { ...m, user: { ...m.user, status: data.status } }
              : m
          );
        } else {
          // 如果是新成员加入且在线，理论上应该重新拉取列表
          // 这里简单处理：如果状态是 online 但列表里没有，触发一次重载
          if (data.action === 'online') {
             // 可以在这里调用 fetchMembers()，或者依赖 serverMemberAdded 事件
          }
          return prev;
        }
      });
    };

    // 处理好友/用户资料更新 (改头像/名字)
    const handleProfileUpdate = (data: { userId: string; avatarUrl?: string; username?: string }) => {
      setMembers((prev) =>
        prev.map((m) =>
          m.userId === data.userId
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

    // 处理新成员加入
    const handleMemberAdded = () => {
        // 重新拉取最稳妥
        api.get(`/servers/${currentServerId}/members`).then(({ data }) => {
            if (data?.success) setMembers(data.data);
        });
    };

    // 处理成员离开
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

  // 3. 排序：在线 > 闲置 > 勿扰 > 离线
  const sortedMembers = [...members].sort((a, b) => {
    const statusOrder: Record<string, number> = {
      ONLINE: 0,
      IDLE: 1,
      DO_NOT_DISTURB: 2,
      OFFLINE: 3,
    };
    
    // 如果 status 未定义，默认为 OFFLINE
    const statusA = statusOrder[a.user.status || 'OFFLINE'];
    const statusB = statusOrder[b.user.status || 'OFFLINE'];

    if (statusA !== statusB) {
      return statusA - statusB;
    }
    // 同状态按名字排序
    return a.user.username.localeCompare(b.user.username);
  });

  // 4. 分组
  const onlineMembers = sortedMembers.filter(m => m.user.status && m.user.status !== 'OFFLINE');
  const offlineMembers = sortedMembers.filter(m => !m.user.status || m.user.status === 'OFFLINE');

  return (
    // 这里的 className 匹配 MainLayout 的布局 (w-60, h-full)
    <div className="w-60 bg-discord-darker flex flex-col h-full border-l border-discord-darkest shrink-0">
      <div className="h-12 border-b border-discord-darkest flex items-center px-4 font-semibold text-white shadow-md shrink-0">
        成员
      </div>

      <div className="flex-1 overflow-y-auto scrollbar-thin p-3 space-y-6">
        {isLoading ? (
          <div className="text-center text-gray-500 mt-4 text-sm">加载中...</div>
        ) : (
          <>
            {/* 在线成员分组 */}
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

            {/* 离线成员分组 */}
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

            {members.length === 0 && (
              <div className="text-center text-gray-500 text-sm py-4">暂无成员</div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// 提取单个成员组件
function MemberItem({ member }: { member: Member }) {
  let statusColor = 'bg-gray-500';
  const s = member.user.status;
  if (s === 'ONLINE') statusColor = 'bg-green-500';
  else if (s === 'IDLE') statusColor = 'bg-yellow-500';
  else if (s === 'DO_NOT_DISTURB') statusColor = 'bg-red-500';

  return (
    <div className="flex items-center space-x-3 px-2 py-2 rounded hover:bg-discord-gray cursor-pointer group transition-colors">
      <div className="relative">
        <UserAvatar
          username={member.user.username}
          avatarUrl={member.user.avatarUrl}
          size="sm"
        />
        {/* 状态点 */}
        <div className={`absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full border-2 border-discord-darker ${statusColor}`}></div>
      </div>
      
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between">
          <span className={`font-medium truncate text-sm ${(!s || s === 'OFFLINE') ? 'text-gray-400' : 'text-gray-200 group-hover:text-white'}`}>
            {member.user.username}
          </span>
          {member.role === 'OWNER' && (
            <span title="服务器拥有者" className="text-xs">👑</span>
          )}
        </div>
      </div>
    </div>
  );
}