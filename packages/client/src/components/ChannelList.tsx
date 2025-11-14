import { useServerStore } from '../stores/serverStore';
import { useFriendStore } from '../stores/friendStore';
import { useNavigate } from 'react-router-dom';
import { UserAvatar } from './UserAvatar';
import { useAuthStore } from '../stores/authStore';
import { useState, useEffect } from 'react';

export default function ChannelList() {
  const { servers, currentServerId, currentChannelId, selectChannel, createChannel, updateChannel, deleteChannel } = useServerStore();
  const { friends, removeFriend } = useFriendStore();
  const { user } = useAuthStore();
  const navigate = useNavigate();
  const [isCreatingChannel, setIsCreatingChannel] = useState(false);
  const [newChannelName, setNewChannelName] = useState('');
  const [editingChannelId, setEditingChannelId] = useState<string | null>(null);
  const [editingChannelName, setEditingChannelName] = useState('');
  const [contextMenuChannel, setContextMenuChannel] = useState<string | null>(null);
  const [contextMenuFriend, setContextMenuFriend] = useState<string | null>(null);

  const currentServer = servers.find((s) => s.id === currentServerId);

  // 点击频道，导航到聊天视图
  const handleChannelClick = (channelId: string) => {
    selectChannel(channelId);
    navigate(`/app/channel/${channelId}`);
  };

  // 创建频道
  const handleCreateChannel = async () => {
    if (!newChannelName.trim() || !currentServerId) return;
    
    try {
      await createChannel(currentServerId, newChannelName.trim());
      setNewChannelName('');
      setIsCreatingChannel(false);
      alert('频道创建成功！');
    } catch (error) {
      alert('创建频道失败：' + (error as Error).message);
    }
  };

  // 编辑频道
  const handleEditChannel = async (channelId: string) => {
    if (!editingChannelName.trim()) return;
    
    try {
      await updateChannel(channelId, editingChannelName.trim());
      setEditingChannelId(null);
      setEditingChannelName('');
      alert('频道修改成功！');
    } catch (error) {
      alert('修改频道失败：' + (error as Error).message);
    }
  };

  // 删除频道
  const handleDeleteChannel = async (channelId: string, channelName: string) => {
    if (!confirm(`确定要删除频道 "${channelName}" 吗？此操作无法撤销！`)) return;
    
    try {
      await deleteChannel(channelId);
      alert('频道删除成功！');
    } catch (error) {
      alert('删除频道失败：' + (error as Error).message);
    }
  };

  // 开始编辑频道
  const startEditChannel = (channelId: string, channelName: string) => {
    setEditingChannelId(channelId);
    setEditingChannelName(channelName);
    setContextMenuChannel(null);
  };

  // 点击外部关闭右键菜单
  useEffect(() => {
    const handleClickOutside = () => {
      if (contextMenuChannel) {
        setContextMenuChannel(null);
      }
      if (contextMenuFriend) {
        setContextMenuFriend(null);
      }
    };

    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, [contextMenuChannel, contextMenuFriend]);

  // 删除好友
  const handleRemoveFriend = async (friendId: string, friendName: string) => {
    if (!confirm(`确定要删除好友 "${friendName}" 吗？`)) return;
    
    try {
      await removeFriend(friendId);
      setContextMenuFriend(null);
      alert('已删除好友');
    } catch (error) {
      alert('删除好友失败：' + (error as Error).message);
    }
  };

  // 点击好友，打开私聊
  const handleFriendClick = (friendId: string) => {
    navigate(`/app/dm/${friendId}`);
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
              <div key={friend.id} className="relative">
                <button
                  onClick={() => handleFriendClick(friend.id)}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    setContextMenuFriend(contextMenuFriend === friend.id ? null : friend.id);
                  }}
                  className="w-full px-2 py-2 rounded hover:bg-discord-gray text-left flex items-center justify-between group transition-colors"
                >
                  <div className="flex items-center space-x-3">
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
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setContextMenuFriend(contextMenuFriend === friend.id ? null : friend.id);
                    }}
                    className="opacity-0 group-hover:opacity-100 p-1 hover:bg-discord-darkest rounded transition-opacity"
                  >
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                      <path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z" />
                    </svg>
                  </button>
                </button>
                {contextMenuFriend === friend.id && (
                  <div className="absolute right-2 top-10 bg-discord-darkest rounded shadow-lg py-1 z-10 min-w-[120px]">
                    <button
                      onClick={() => handleRemoveFriend(friend.id, friend.username)}
                      className="w-full px-3 py-2 text-left text-red-400 hover:bg-red-500 hover:text-white text-sm transition-colors"
                    >
                      删除好友
                    </button>
                  </div>
                )}
              </div>
            ))}

            {friends.length === 0 && (
              <div className="text-center text-gray-500 py-8">
                还没有好友
              </div>
            )}
          </div>
        </div>

        {/* 底部用户信息栏 */}
        <div className="h-14 bg-discord-darkest border-t border-discord-border flex items-center px-2 gap-2">
          <UserAvatar
            username={user?.username || ''}
            avatarUrl={user?.avatarUrl}
            size="sm"
          />
          <div className="flex-1 min-w-0">
            <div className="text-white text-sm font-semibold truncate">
              {user?.username}
            </div>
            <div className="text-xs text-gray-400">在线</div>
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
          <div className="text-xs font-semibold text-gray-400 px-2 py-1 flex items-center justify-between">
            <span>文字频道</span>
            <button
              onClick={() => setIsCreatingChannel(true)}
              className="hover:text-white transition-colors"
              title="创建频道"
            >
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 5a1 1 0 011 1v3h3a1 1 0 110 2h-3v3a1 1 0 11-2 0v-3H6a1 1 0 110-2h3V6a1 1 0 011-1z" clipRule="evenodd" />
              </svg>
            </button>
          </div>

          {isCreatingChannel && (
            <div className="px-2 py-2 bg-discord-darkest rounded">
              <input
                type="text"
                value={newChannelName}
                onChange={(e) => setNewChannelName(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && handleCreateChannel()}
                placeholder="频道名称"
                className="w-full px-2 py-1 bg-discord-gray rounded text-white text-sm focus:outline-none focus:ring-2 focus:ring-discord-blue"
                autoFocus
              />
              <div className="flex gap-2 mt-2">
                <button
                  onClick={handleCreateChannel}
                  className="flex-1 px-2 py-1 bg-discord-blue hover:bg-discord-blue-hover text-white rounded text-sm transition-colors"
                >
                  创建
                </button>
                <button
                  onClick={() => {
                    setIsCreatingChannel(false);
                    setNewChannelName('');
                  }}
                  className="flex-1 px-2 py-1 bg-discord-gray hover:bg-discord-hover text-white rounded text-sm transition-colors"
                >
                  取消
                </button>
              </div>
            </div>
          )}

          {currentServer?.channels
            .filter((c) => c.type === 'TEXT')
            .map((channel) => (
              <div key={channel.id} className="relative">
                {editingChannelId === channel.id ? (
                  <div className="px-2 py-2 bg-discord-darkest rounded">
                    <input
                      type="text"
                      value={editingChannelName}
                      onChange={(e) => setEditingChannelName(e.target.value)}
                      onKeyPress={(e) => e.key === 'Enter' && handleEditChannel(channel.id)}
                      className="w-full px-2 py-1 bg-discord-gray rounded text-white text-sm focus:outline-none focus:ring-2 focus:ring-discord-blue"
                      autoFocus
                    />
                    <div className="flex gap-2 mt-2">
                      <button
                        onClick={() => handleEditChannel(channel.id)}
                        className="flex-1 px-2 py-1 bg-discord-blue hover:bg-discord-blue-hover text-white rounded text-sm transition-colors"
                      >
                        保存
                      </button>
                      <button
                        onClick={() => {
                          setEditingChannelId(null);
                          setEditingChannelName('');
                        }}
                        className="flex-1 px-2 py-1 bg-discord-gray hover:bg-discord-hover text-white rounded text-sm transition-colors"
                      >
                        取消
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => handleChannelClick(channel.id)}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      setContextMenuChannel(contextMenuChannel === channel.id ? null : channel.id);
                    }}
                    className={`w-full px-2 py-1 rounded text-left flex items-center justify-between group ${
                      currentChannelId === channel.id
                        ? 'bg-discord-gray text-white'
                        : 'text-discord-light-gray hover:bg-discord-gray hover:text-white'
                    }`}
                  >
                    <div className="flex items-center space-x-2">
                      <span className="text-gray-400">#</span>
                      <span>{channel.name}</span>
                    </div>
                    {(user?.role === 'ADMIN' || currentServer?.ownerId === user?.id) && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setContextMenuChannel(contextMenuChannel === channel.id ? null : channel.id);
                        }}
                        className="opacity-0 group-hover:opacity-100 p-1 hover:bg-discord-darkest rounded transition-opacity"
                      >
                        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                          <path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z" />
                        </svg>
                      </button>
                    )}
                  </button>
                )}
                {contextMenuChannel === channel.id && (
                  <div className="absolute right-2 top-8 bg-discord-darkest rounded shadow-lg py-1 z-10 min-w-[120px]">
                    <button
                      onClick={() => startEditChannel(channel.id, channel.name)}
                      className="w-full px-3 py-2 text-left text-white hover:bg-discord-blue text-sm transition-colors"
                    >
                      编辑频道
                    </button>
                    <button
                      onClick={() => {
                        handleDeleteChannel(channel.id, channel.name);
                        setContextMenuChannel(null);
                      }}
                      className="w-full px-3 py-2 text-left text-red-400 hover:bg-red-500 hover:text-white text-sm transition-colors"
                    >
                      删除频道
                    </button>
                  </div>
                )}
              </div>
            ))}

          {currentServer?.channels.filter((c) => c.type === 'TEXT').length === 0 && (
            <div className="text-gray-500 px-2 py-2 text-sm">暂无频道</div>
          )}
        </div>
      </div>

      {/* 底部用户信息栏 */}
      <div className="h-14 bg-discord-darkest border-t border-discord-border flex items-center px-2 gap-2">
        <UserAvatar
          username={user?.username || ''}
          avatarUrl={user?.avatarUrl}
          size="sm"
        />
        <div className="flex-1 min-w-0">
          <div className="text-white text-sm font-semibold truncate">
            {user?.username}
          </div>
          <div className="text-xs text-gray-400">在线</div>
        </div>
      </div>
    </div>
  );
}
