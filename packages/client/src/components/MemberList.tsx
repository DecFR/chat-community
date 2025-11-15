import { useServerStore } from '../stores/serverStore';
import { useLocation } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { UserAvatar } from './UserAvatar';
import { socketService } from '../lib/socket';
import api from '../lib/api';

interface Member {
  id: string;
  username: string;
  avatarUrl?: string;
  role: string;
  status?: 'ONLINE' | 'IDLE' | 'DO_NOT_DISTURB' | 'OFFLINE';
}

export default function MemberList() {
  const { currentServerId, currentChannelId } = useServerStore();
  const location = useLocation();
  const [members, setMembers] = useState<Member[]>([]);

  // 加载成员列表 - Hooks 必须在所有条件判断之前调用
  useEffect(() => {
    const loadMembers = async () => {
      if (!currentServerId) {
        setMembers([]);
        return;
      }

      try {
        const { data } = await api.get(`/servers/${currentServerId}/members`);
        if (data?.success) {
          setMembers(data.data);
        }
      } catch (error) {
        console.error('Failed to load members:', error);
        setMembers([]);
      }
    };

    loadMembers();

    // 监听服务器成员更新事件
    const handleMemberUpdate = (data: { serverId: string; userId: string; status?: 'ONLINE'|'IDLE'|'DO_NOT_DISTURB'|'OFFLINE'; action?: 'online'|'offline' }) => {
      // 只处理当前服务器的成员更新
      if (data.serverId !== currentServerId) return;

      setMembers((prevMembers) => {
        const memberIndex = prevMembers.findIndex((m) => m.id === data.userId);
        
        if (memberIndex >= 0) {
          // 更新现有成员的状态
          const updatedMembers = [...prevMembers];
          updatedMembers[memberIndex] = {
            ...updatedMembers[memberIndex],
            status: data.status,
          };
          return updatedMembers;
        } else if (data.action === 'online') {
          // 如果是新上线的成员，重新加载成员列表
          loadMembers();
        }
        
        return prevMembers;
      });
    };

    socketService.on('serverMemberUpdate', handleMemberUpdate);

    // 监听好友资料更新,实时刷新成员列表中的头像和用户名
    const handleProfileUpdate = (data: { userId: string; avatarUrl?: string; username?: string }) => {
      setMembers((prevMembers) =>
        prevMembers.map((member) =>
          member.id === data.userId
            ? {
                ...member,
                ...(data.avatarUrl !== undefined && { avatarUrl: data.avatarUrl }),
                ...(data.username && { username: data.username }),
              }
            : member
        )
      );
    };

    socketService.on('friendProfileUpdate', handleProfileUpdate);
    socketService.on('userProfileUpdate', handleProfileUpdate);

    return () => {
      socketService.off('serverMemberUpdate', handleMemberUpdate);
      socketService.off('friendProfileUpdate', handleProfileUpdate);
      socketService.off('userProfileUpdate', handleProfileUpdate);
    };
  }, [currentServerId]);

  // 只在频道页面显示成员列表
  if (!location.pathname.includes('/app/channel/')) {
    return null;
  }

  // 如果没有选中服务器或频道，不显示
  if (!currentServerId || !currentChannelId) {
    return null;
  }

  // 按角色和在线状态分组成员
  const onlineMembers = members.filter(m => m.status === 'ONLINE');
  const offlineMembers = members.filter(m => m.status !== 'ONLINE');

  return (
    <div className="w-60 bg-discord-darker border-l border-discord-darkest hidden xl:block overflow-y-auto">
      <div className="p-4">
        {currentServerId ? (
          <>
            {/* 在线成员 */}
            {onlineMembers.length > 0 && (
              <div className="mb-4">
                <div className="text-xs font-semibold text-gray-400 mb-2">
                  在线 - {onlineMembers.length}
                </div>
                <div className="space-y-1">
                  {onlineMembers.map((member) => (
                    <div
                      key={member.id}
                      className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-discord-hover cursor-pointer transition-colors"
                    >
                      <div className="relative">
                        <UserAvatar
                          username={member.username}
                          avatarUrl={member.avatarUrl}
                          size="sm"
                        />
                        <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-green-500 rounded-full border-2 border-discord-darker"></div>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm text-white truncate">{member.username}</div>
                      </div>
                      {member.role === 'OWNER' && (
                        <div className="text-xs text-yellow-500">👑</div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 离线成员 */}
            {offlineMembers.length > 0 && (
              <div>
                <div className="text-xs font-semibold text-gray-400 mb-2">
                  离线 - {offlineMembers.length}
                </div>
                <div className="space-y-1">
                  {offlineMembers.map((member) => (
                    <div
                      key={member.id}
                      className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-discord-hover cursor-pointer transition-colors opacity-50"
                    >
                      <div className="relative">
                        <UserAvatar
                          username={member.username}
                          avatarUrl={member.avatarUrl}
                          size="sm"
                        />
                        <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-gray-500 rounded-full border-2 border-discord-darker"></div>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm text-gray-400 truncate">{member.username}</div>
                      </div>
                      {member.role === 'OWNER' && (
                        <div className="text-xs text-yellow-500">👑</div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 无成员 */}
            {members.length === 0 && (
              <div className="text-center text-gray-500 py-8 text-sm">
                暂无成员
              </div>
            )}
          </>
        ) : (
          <div className="text-center text-gray-500 py-8 text-sm">
            选择一个服务器
          </div>
        )}
      </div>
    </div>
  );
}
