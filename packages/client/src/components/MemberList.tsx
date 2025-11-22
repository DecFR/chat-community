import { useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { useServerStore } from '../stores/serverStore';
import { UserAvatar } from './UserAvatar';

// 1. 定义类型接口，解决 TS 报错
interface User {
  id: string;
  username: string;
  avatarUrl?: string | null;
  status?: string; // ONLINE, IDLE, DO_NOT_DISTURB, OFFLINE
  bio?: string;
}

interface Member {
  id: string;
  userId: string;
  user: User;
}

interface Channel {
  id: string;
  name: string;
}

interface Server {
  id: string;
  name: string;
  channels: Channel[];
  members: Member[];
}

// 2. 子组件：单个成员行
const MemberItem = ({ user, isOffline = false }: { user: User; isOffline?: boolean }) => {
  const statusColors: Record<string, string> = {
    ONLINE: 'bg-green-500',
    IDLE: 'bg-yellow-500',
    DO_NOT_DISTURB: 'bg-red-500',
    OFFLINE: 'bg-gray-500',
  };

  // 安全获取状态颜色，默认为灰色
  const status = user.status || 'OFFLINE';
  const statusColor = statusColors[status] || 'bg-gray-500';

  return (
    <div className={`flex items-center px-2 py-2 rounded cursor-pointer hover:bg-discord-gray transition-colors ${isOffline ? 'opacity-50 hover:opacity-100' : ''}`}>
      <div className="relative shrink-0">
        <UserAvatar username={user.username} avatarUrl={user.avatarUrl} size="sm" />
        <div className={`absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-discord-darker ${statusColor}`}></div>
      </div>
      
      <div className="ml-3 min-w-0 flex-1">
        <div className={`text-sm font-medium truncate ${isOffline ? 'text-gray-400' : 'text-white'}`}>
          {user.username}
        </div>
        {user.bio && (
          <div className="text-xs text-gray-500 truncate">
            {user.bio}
          </div>
        )}
      </div>
    </div>
  );
};

// 3. 主组件
export default function MemberList() {
  const { channelId } = useParams();
  // 这里的 servers 类型可能需要根据你的 store 定义进行断言，或者保持泛型
  // 既然我们无法确定 store 的具体类型，我们只解构 servers
  const { servers } = useServerStore();

  // 计算当前所在的服务器
  const currentServer = useMemo(() => {
    if (!channelId || !servers) return null;
    // 强制转换类型以匹配上面的接口定义，避免 TS 报错
    const allServers = servers as unknown as Server[];
    return allServers.find(s => s.channels?.some(c => c.id === channelId));
  }, [channelId, servers]);

  // 对成员进行分类
  const { onlineMembers, offlineMembers } = useMemo(() => {
    const online: User[] = [];
    const offline: User[] = [];

    if (!currentServer || !currentServer.members) {
      return { onlineMembers: [], offlineMembers: [] };
    }

    currentServer.members.forEach((member) => {
      // 防御性编程：确保 user 对象存在
      if (!member || !member.user) return;
      
      const userData = member.user;
      const status = userData.status || 'OFFLINE';
      
      const isOnline = status === 'ONLINE' || status === 'IDLE' || status === 'DO_NOT_DISTURB';
      
      if (isOnline) {
        online.push(userData);
      } else {
        offline.push(userData);
      }
    });

    // 排序：名字首字母
    const sortFn = (a: User, b: User) => a.username.localeCompare(b.username);
    return { 
      onlineMembers: online.sort(sortFn), 
      offlineMembers: offline.sort(sortFn) 
    };
  }, [currentServer]);

  // 如果没有找到服务器（比如在私聊页面），不渲染
  if (!currentServer) {
    return null;
  }

  return (
    <div className="w-60 bg-discord-darker flex-shrink-0 flex flex-col border-l border-discord-darkest overflow-y-auto scrollbar-thin p-3 h-full">
      {/* 在线成员组 */}
      {onlineMembers.length > 0 && (
        <div className="mb-6">
          <h3 className="text-xs font-semibold text-gray-500 uppercase mb-2 px-2">
            在线 — {onlineMembers.length}
          </h3>
          {onlineMembers.map((user) => (
            <MemberItem key={user.id} user={user} />
          ))}
        </div>
      )}

      {/* 离线成员组 */}
      {offlineMembers.length > 0 && (
        <div>
          <h3 className="text-xs font-semibold text-gray-500 uppercase mb-2 px-2">
            离线 — {offlineMembers.length}
          </h3>
          {offlineMembers.map((user) => (
            <MemberItem key={user.id} user={user} isOffline />
          ))}
        </div>
      )}
      
      {onlineMembers.length === 0 && offlineMembers.length === 0 && (
        <div className="text-center text-gray-500 text-xs mt-4">暂无成员</div>
      )}
    </div>
  );
}