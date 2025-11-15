import { useServerStore } from '../stores/serverStore';
import { useFriendStore } from '../stores/friendStore';
import { useNavigate } from 'react-router-dom';
import { UserAvatar } from './UserAvatar';
import { useAuthStore } from '../stores/authStore';
import { useState, useEffect } from 'react';
import FriendsPanel from './FriendsPanel';
import FriendRequestsPanel from './FriendRequestsPanel';
import UserSearchModal from './UserSearchModal';
import { useUnreadStore } from '../stores/unreadStore';
import ServerManagementModal from './ServerManagementModal';

export default function ChannelList() {
  const { servers, currentServerId, currentChannelId, selectChannel, createChannel, updateChannel, deleteChannel, isLoading } = useServerStore();
  const { friends, removeFriend, loadFriends, loadPendingRequests } = useFriendStore();
  const { user } = useAuthStore();
  const { channelUnread, dmUnreadByFriend } = useUnreadStore();
  const navigate = useNavigate();
  const [isCreatingChannel, setIsCreatingChannel] = useState(false);
  const [newChannelName, setNewChannelName] = useState('');
  const [editingChannelId, setEditingChannelId] = useState<string | null>(null);
  const [editingChannelName, setEditingChannelName] = useState('');
  const [contextMenuChannel, setContextMenuChannel] = useState<string | null>(null);
  const [contextMenuFriend, setContextMenuFriend] = useState<string | null>(null);
  const [friendView, setFriendView] = useState<'list' | 'requests' | 'search'>('list');
  const [showServerManage, setShowServerManage] = useState(false);

  const currentServer = servers.find((s) => s.id === currentServerId);

  // 当切换到好友视图时，刷新好友列表
  useEffect(() => {
    if (!currentServerId) {
      loadFriends();
      loadPendingRequests();
    }
  }, [currentServerId, loadFriends, loadPendingRequests]);

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
  const handleRemoveFriend = async (friendshipId: string, friendName: string) => {
    if (!confirm(`确定要删除好友 "${friendName}" 吗？`)) return;
    
    try {
      await removeFriend(friendshipId);
      setContextMenuFriend(null);
      alert('已删除好友');
    } catch (error) {
      alert('删除好友失败：' + (error as Error).message);
    }
  };

  // 点击好友，打开私聊
  const handleFriendClick = (friendId: string) => {
    // 打开会话但不清零，进入 ChatView 后按已读条数递减
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
          {/* 功能切换按钮 */}
          <div className="p-2 space-y-1">
            <button
              onClick={() => setFriendView('list')}
              className={`w-full px-3 py-2 rounded text-left transition-colors ${
                friendView === 'list'
                  ? 'bg-discord-gray text-white'
                  : 'text-discord-light-gray hover:bg-discord-gray hover:text-white'
              }`}
            >
              <div className="flex items-center space-x-2">
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M9 6a3 3 0 11-6 0 3 3 0 016 0zM17 6a3 3 0 11-6 0 3 3 0 016 0zM12.93 17c.046-.327.07-.66.07-1a6.97 6.97 0 00-1.5-4.33A5 5 0 0119 16v1h-6.07zM6 11a5 5 0 015 5v1H1v-1a5 5 0 015-5z" />
                </svg>
                <span>好友列表</span>
              </div>
            </button>

            <button
              onClick={() => setFriendView('requests')}
              className={`w-full px-3 py-2 rounded text-left transition-colors ${
                friendView === 'requests'
                  ? 'bg-discord-gray text-white'
                  : 'text-discord-light-gray hover:bg-discord-gray hover:text-white'
              }`}
            >
              <div className="flex items-center space-x-2">
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" />
                </svg>
                <span>好友请求</span>
              </div>
            </button>

            <button
              onClick={() => setFriendView('search')}
              className={`w-full px-3 py-2 rounded text-left transition-colors ${
                friendView === 'search'
                  ? 'bg-discord-green text-white'
                  : 'text-discord-green hover:bg-discord-green hover:text-white'
              }`}
            >
              <div className="flex items-center space-x-2">
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M8 9a3 3 0 100-6 3 3 0 000 6zM8 11a6 6 0 016 6H2a6 6 0 016-6zM16 7a1 1 0 10-2 0v1h-1a1 1 0 100 2h1v1a1 1 0 102 0v-1h1a1 1 0 100-2h-1V7z" />
                </svg>
                <span>添加好友</span>
              </div>
            </button>
          </div>

          <div className="h-px bg-discord-border my-2"></div>

          {/* 根据选中的视图显示不同内容 */}
          {friendView === 'list' && (
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
                    {/* 未读徽标 */}
                    {(dmUnreadByFriend[friend.id] || 0) > 0 && (
                      <span className="ml-2 inline-flex min-w-[18px] h-5 px-1 items-center justify-center rounded-full bg-red-500 text-white text-xs">
                        {dmUnreadByFriend[friend.id]}
                      </span>
                    )}
                    <div
                      onClick={(e) => {
                        e.stopPropagation();
                        setContextMenuFriend(contextMenuFriend === friend.id ? null : friend.id);
                      }}
                      className="opacity-0 group-hover:opacity-100 p-1 hover:bg-discord-darkest rounded transition-opacity cursor-pointer"
                    >
                      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                        <path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z" />
                      </svg>
                    </div>
                  </button>
                  {contextMenuFriend === friend.id && (
                    <div className="absolute right-2 top-10 bg-discord-darkest rounded shadow-lg py-1 z-10 min-w-[120px]">
                      <button
                        onClick={() => handleRemoveFriend(friend.friendshipId, friend.username)}
                        className="w-full px-3 py-2 text-left text-red-400 hover:bg-red-500 hover:text-white text-sm transition-colors"
                      >
                        删除好友
                      </button>
                    </div>
                  )}
                </div>
              ))}

              {friends.length === 0 && (
                <div className="text-center text-gray-500 py-8 px-4">
                  <p className="text-sm">还没有好友</p>
                  <p className="text-xs mt-1">点击上方“添加好友”</p>
                </div>
              )}
            </div>
          )}

          {friendView === 'requests' && (
            <div className="p-2">
              <FriendRequestsPanel />
            </div>
          )}

          {friendView === 'search' && (
            <div className="p-2">
              <UserSearchModal
                isOpen={true}
                onClose={() => setFriendView('list')}
                inline={true}
              />
            </div>
          )}
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
  // 如果服务器数据正在加载或找不到 currentServer，显示加载状态
  if (!currentServer) {
    return (
      <div className="w-60 bg-discord-darker flex flex-col">
        <div className="h-12 border-b border-discord-darkest flex items-center px-4 font-semibold text-white shadow-md">
          {isLoading ? '加载中...' : '服务器'}
        </div>
        <div className="flex-1 flex items-center justify-center">
          <div className="text-gray-400 text-sm">{isLoading ? '加载中...' : '未找到服务器'}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="w-60 bg-discord-darker flex flex-col">
      <div className="h-12 border-b border-discord-darkest flex items-center justify-between px-4 font-semibold text-white shadow-md">
        <span className="truncate" title={currentServer?.name}>{currentServer?.name || '服务器'}</span>
        {(user?.role === 'ADMIN' || currentServer.ownerId === user?.id) && (
          <button
            onClick={() => setShowServerManage(true)}
            className="p-1 rounded hover:bg-discord-darkest"
            title="服务器管理"
          >
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978.908.221 1.487 1.377.947 2.263-.836 1.372.734 2.942 2.106 2.106.886-.54 2.042-.061 2.287.947.379 1.561 2.6 1.561 2.978 0a1.533 1.533 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106-.54-.886-.061-2.042.947-2.287 1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.533 1.533 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z" clipRule="evenodd" />
            </svg>
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto scrollbar-thin">
        {/* 频道列表 */}
        <div className="p-2 space-y-1">
          <div className="text-xs font-semibold text-gray-400 px-2 py-1 flex items-center justify-between">
            <span>频道</span>
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

          {currentServer.channels
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
                    {/* 未读徽标 */}
                    {(channelUnread[channel.id] || 0) > 0 && (
                      <span className="ml-2 inline-flex min-w-[18px] h-5 px-1 items-center justify-center rounded-full bg-red-500 text-white text-xs">
                        {channelUnread[channel.id]}
                      </span>
                    )}
                    {(user?.role === 'ADMIN' || currentServer.ownerId === user?.id) && (
                      <div
                        onClick={(e) => {
                          e.stopPropagation();
                          setContextMenuChannel(contextMenuChannel === channel.id ? null : channel.id);
                        }}
                        className="opacity-0 group-hover:opacity-100 p-1 hover:bg-discord-darkest rounded transition-opacity cursor-pointer"
                      >
                        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                          <path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z" />
                        </svg>
                      </div>
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

          {currentServer.channels.filter((c) => c.type === 'TEXT').length === 0 && (
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
      {showServerManage && (
        <ServerManagementModal
          isOpen={showServerManage}
          onClose={() => setShowServerManage(false)}
          serverId={currentServer.id}
        />
      )}
    </div>
  );
}
