import { useServerStore } from '../stores/serverStore';
import { useFriendStore } from '../stores/friendStore';
import { useNavigate } from 'react-router-dom';
import { UserAvatar } from './UserAvatar';

export default function ChannelList() {
  const { servers, currentServerId, currentChannelId, selectChannel } = useServerStore();
  const { friends } = useFriendStore();
  const navigate = useNavigate();

  const currentServer = servers.find((s) => s.id === currentServerId);

  // 点击好友，打开私聊
  const handleFriendClick = (friendId: string) => {
    // 这里暂时只是显示提示，实际应该打开私聊窗口
    alert(`私聊功能开发中\n\n点击了好友 ID: ${friendId}`);
    // TODO: 实现私聊功能
    // navigate(`/app/dm/${friendId}`);
  };

  // 如果没有选中服务器，显示好友列表
  if (!currentServerId) {
    return (
      <div className="w-60 bg-discord-darker flex flex-col">
        <div className="h-12 border-b border-discord-darkest flex items-center px-4 font-semibold text-white shadow-md">
          好友
        </div>

        <div className="flex-1 overflow-y-auto scrollbar-thin">
          {/* 好友列表 */}
          <div className="p-2 space-y-1">
            {friends.map((friend) => (
              <button
                key={friend.id}
                onClick={() => handleFriendClick(friend.id)}
                className="w-full px-2 py-2 rounded hover:bg-discord-gray text-left flex items-center space-x-3 group transition-colors"
              >
                <div className="relative">
                  <UserAvatar
                    username={friend.username}
                    avatarUrl={friend.avatarUrl}
                    size="sm"
                  />
                  <div
                    className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-discord-darker ${
                      friend.status === 'ONLINE'
                        ? 'bg-green-500'
                        : friend.status === 'IDLE'
                        ? 'bg-yellow-500'
                        : friend.status === 'DO_NOT_DISTURB'
                        ? 'bg-red-500'
                        : 'bg-gray-500'
                    }`}
                  ></div>
                </div>
                <span className="text-discord-light-gray group-hover:text-white">
                  {friend.username}
                </span>
              </button>
            ))}

            {friends.length === 0 && (
              <div className="text-center text-gray-500 py-8">
                还没有好友
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // 显示服务器频道
  return (
    <div className="w-60 bg-discord-darker flex flex-col">
      <div className="h-12 border-b border-discord-darkest flex items-center px-4 font-semibold text-white shadow-md">
        {currentServer?.name || '服务器'}
      </div>

      <div className="flex-1 overflow-y-auto scrollbar-thin">
        {/* 频道列表 */}
        <div className="p-2 space-y-1">
          <div className="text-xs font-semibold text-gray-400 px-2 py-1">文字频道</div>

          {currentServer?.channels
            .filter((c) => c.type === 'TEXT')
            .map((channel) => (
              <button
                key={channel.id}
                onClick={() => selectChannel(channel.id)}
                className={`w-full px-2 py-1 rounded text-left flex items-center space-x-2 ${
                  currentChannelId === channel.id
                    ? 'bg-discord-gray text-white'
                    : 'text-discord-light-gray hover:bg-discord-gray hover:text-white'
                }`}
              >
                <span className="text-gray-400">#</span>
                <span>{channel.name}</span>
              </button>
            ))}

          {currentServer?.channels.filter((c) => c.type === 'TEXT').length === 0 && (
            <div className="text-gray-500 px-2 py-2 text-sm">暂无频道</div>
          )}
        </div>
      </div>
    </div>
  );
}
