import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useFriendStore } from '../stores/friendStore';
import { friendAPI } from '../lib/api';
import FriendRequestsPanel from './FriendRequestsPanel';
import UserSearchModal from './UserSearchModal';
import { UserAvatar } from './UserAvatar';
import { socketService } from '../lib/socket';
import { toast } from '../stores/toastStore';

type FriendTab = 'online' | 'all' | 'pending' | 'add';

interface Friend {
  id: string;
  username: string;
  avatarUrl?: string;
  status: string;
  bio?: string;
  friendshipId: string;
}

export default function FriendsPanel() {
  const { friends, loadFriends, updateFriendProfile } = useFriendStore();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<FriendTab>('online');
  const [showUserSearch, setShowUserSearch] = useState(false);

  useEffect(() => {
    const socket = socketService.getSocket();
    if (!socket) return;

    const handleFriendUpdate = () => {
      loadFriends();
    };

    const handleProfileUpdate = (data: { userId: string; username?: string; avatarUrl?: string }) => {
      updateFriendProfile(data.userId, {
        ...(data.username && { username: data.username }),
        ...(data.avatarUrl !== undefined && { avatarUrl: data.avatarUrl }),
      });
    };

    socket.on('friendRequestAccepted', handleFriendUpdate);
    socket.on('friendRemoved', handleFriendUpdate);
    socket.on('friendProfileUpdate', handleProfileUpdate);
    socket.on('userProfileUpdate', handleProfileUpdate);

    return () => {
      socket.off('friendRequestAccepted', handleFriendUpdate);
      socket.off('friendRemoved', handleFriendUpdate);
      socket.off('friendProfileUpdate', handleProfileUpdate);
      socket.off('userProfileUpdate', handleProfileUpdate);
    };
  }, [loadFriends, updateFriendProfile]);

  const onlineFriends = friends.filter((f) => f.status === 'ONLINE');

  const handleSendFriendRequest = async (userId: string) => {
    try {
      await friendAPI.sendRequest(userId);
      toast.success('好友请求已发送');
      setShowUserSearch(false);
    } catch (error: unknown) {
      const errorMessage = error instanceof Error && 'response' in error
        ? ((error as { response?: { data?: { error?: string } } }).response?.data?.error || '发送请求失败')
        : '发送请求失败';
      toast.error(errorMessage);
    }
  };

  const renderContent = () => {
    switch (activeTab) {
      case 'online':
        return (
          <div className="p-6">
            <h3 className="text-xl font-semibold mb-4 text-white">
              在线好友 — {onlineFriends.length}
            </h3>
            {onlineFriends.length === 0 ? (
              <div className="text-center py-12">
                <div className="text-gray-400 text-sm">没有在线的好友</div>
              </div>
            ) : (
              <div className="space-y-2">
                {onlineFriends.map((friend: Friend) => (
                  <div
                    key={friend.id}
                    className="card flex items-center justify-between hover:bg-discord-hover cursor-pointer transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <UserAvatar
                        username={friend.username}
                        avatarUrl={friend.avatarUrl}
                        size="md"
                      />
                      <div>
                        <div className="text-white font-medium">{friend.username}</div>
                        <div className="text-sm text-gray-400">在线</div>
                      </div>
                    </div>
                    <button
                      className="btn btn-primary text-sm"
                      onClick={() => navigate(`/app/dm/${friend.id}`)}
                    >
                      发送消息
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        );

      case 'all':
        return (
          <div className="p-6">
            <h3 className="text-xl font-semibold mb-4 text-white">
              所有好友 — {friends.length}
            </h3>
            {friends.length === 0 ? (
              <div className="text-center py-12">
                <div className="text-gray-400 text-sm">
                  你还没有添加任何好友
                  <br />
                  点击上方"添加好友"开始添加好友吧！
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                {friends.map((friend: Friend) => (
                  <div
                    key={friend.id}
                    className="card flex items-center justify-between hover:bg-discord-hover cursor-pointer transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <div className="relative">
                        <UserAvatar
                          username={friend.username}
                          avatarUrl={friend.avatarUrl}
                          size="md"
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
                        />
                      </div>
                      <div>
                        <div className="text-white font-medium">{friend.username}</div>
                        <div className="text-sm text-gray-400">
                          {friend.status === 'ONLINE'
                            ? '在线'
                            : friend.status === 'IDLE'
                            ? '离开'
                            : friend.status === 'DO_NOT_DISTURB'
                            ? '请勿打扰'
                            : '离线'}
                        </div>
                      </div>
                    </div>
                    <button
                      className="btn btn-primary text-sm"
                      onClick={() => navigate(`/app/dm/${friend.id}`)}
                    >
                      发送消息
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        );

      case 'pending':
        return <FriendRequestsPanel />;

      case 'add':
        return (
          <div className="p-6">
            <h3 className="text-xl font-semibold mb-4 text-white">添加好友</h3>
            <div className="card max-w-2xl">
              <p className="text-gray-400 mb-4">
                你可以通过用户名搜索并添加好友
              </p>
              <button
                onClick={() => setShowUserSearch(true)}
                className="btn btn-primary w-full"
              >
                搜索用户
              </button>
            </div>

            <div className="mt-8">
              <h4 className="text-lg font-semibold mb-3 text-white">
                如何添加好友？
              </h4>
              <div className="space-y-3 text-gray-400 text-sm">
                <div className="flex items-start gap-3">
                  <div className="w-6 h-6 rounded-full bg-discord-blue flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                    1
                  </div>
                  <div>点击"搜索用户"按钮</div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="w-6 h-6 rounded-full bg-discord-blue flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                    2
                  </div>
                  <div>输入你想添加的用户名进行搜索</div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="w-6 h-6 rounded-full bg-discord-blue flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                    3
                  </div>
                  <div>点击用户发送好友请求</div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="w-6 h-6 rounded-full bg-discord-blue flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                    4
                  </div>
                  <div>等待对方接受你的好友请求</div>
                </div>
              </div>
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="flex-1 flex flex-col bg-discord-dark">
      {/* 标签栏 */}
      <div className="bg-discord-darker border-b border-discord-border px-6 py-4">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2">
            <svg
              className="w-6 h-6 text-discord-light-gray"
              fill="currentColor"
              viewBox="0 0 20 20"
            >
              <path d="M9 6a3 3 0 11-6 0 3 3 0 016 0zM17 6a3 3 0 11-6 0 3 3 0 016 0zM12.93 17c.046-.327.07-.66.07-1a6.97 6.97 0 00-1.5-4.33A5 5 0 0119 16v1h-6.07zM6 11a5 5 0 015 5v1H1v-1a5 5 0 015-5z" />
            </svg>
            <h2 className="text-white font-semibold">好友</h2>
          </div>

          <div className="h-6 w-px bg-gray-700" />

          <button
            onClick={() => setActiveTab('online')}
            className={`px-3 py-1 rounded transition-colors ${
              activeTab === 'online'
                ? 'bg-discord-gray text-white'
                : 'text-gray-400 hover:bg-discord-gray hover:text-white'
            }`}
          >
            在线
          </button>
          <button
            onClick={() => setActiveTab('all')}
            className={`px-3 py-1 rounded transition-colors ${
              activeTab === 'all'
                ? 'bg-discord-gray text-white'
                : 'text-gray-400 hover:bg-discord-gray hover:text-white'
            }`}
          >
            全部
          </button>
          <button
            onClick={() => setActiveTab('pending')}
            className={`px-3 py-1 rounded transition-colors ${
              activeTab === 'pending'
                ? 'bg-discord-gray text-white'
                : 'text-gray-400 hover:bg-discord-gray hover:text-white'
            }`}
          >
            等待中
          </button>
          <button
            onClick={() => setActiveTab('add')}
            className={`px-3 py-1 rounded transition-colors ${
              activeTab === 'add'
                ? 'bg-discord-green text-white'
                : 'text-discord-green hover:bg-discord-green hover:text-white'
            }`}
          >
            添加好友
          </button>
        </div>
      </div>

      {/* 内容区 */}
      <div className="flex-1 overflow-y-auto scrollbar-thin">
        {renderContent()}
      </div>

      {/* 用户搜索模态框 */}
      {showUserSearch && (
        <UserSearchModal
          isOpen={showUserSearch}
          onClose={() => setShowUserSearch(false)}
          onSelectUser={handleSendFriendRequest}
        />
      )}
    </div>
  );
}
