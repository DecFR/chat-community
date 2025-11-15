import { useEffect, useState } from 'react';
import { useFriendStore } from '../stores/friendStore';
import { friendAPI } from '../lib/api';
import { UserAvatar } from './UserAvatar';
import { toast } from '../stores/toastStore';
import { socketService } from '../lib/socket';

interface FriendRequest {
  id: string;
  sender: {
    username: string;
    avatarUrl?: string;
    bio?: string;
  };
}

export default function FriendRequestsPanel() {
  const { pendingRequests, loadPendingRequests, loadFriends } = useFriendStore();
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    loadPendingRequests();
  }, [loadPendingRequests]);

  useEffect(() => {
    const socket = socketService.getSocket();
    if (!socket) return;

    const handleNewFriendRequest = () => {
      loadPendingRequests();
    };

    socket.on('newFriendRequest', handleNewFriendRequest);

    return () => {
      socket.off('newFriendRequest', handleNewFriendRequest);
    };
  }, [loadPendingRequests]);

  const handleAccept = async (requestId: string) => {
    setIsLoading(true);
    try {
      await friendAPI.acceptRequest(requestId);
      await loadPendingRequests();
      await loadFriends();
      toast.success('已接受好友请求');
    } catch (error: unknown) {
      console.error('Failed to accept friend request:', error);
      const errorMessage = error instanceof Error && 'response' in error
        ? ((error as { response?: { data?: { error?: string } } }).response?.data?.error || '接受好友请求失败')
        : '接受好友请求失败';
      toast.error(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  const handleReject = async (requestId: string) => {
    setIsLoading(true);
    try {
      await friendAPI.declineRequest(requestId);
      await loadPendingRequests();
      toast.success('已拒绝好友请求');
    } catch (error: unknown) {
      console.error('Failed to reject friend request:', error);
      const errorMessage = error instanceof Error && 'response' in error
        ? ((error as { response?: { data?: { error?: string } } }).response?.data?.error || '拒绝好友请求失败')
        : '拒绝好友请求失败';
      toast.error(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  if (pendingRequests.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <div className="text-6xl mb-4">👋</div>
          <div className="text-xl font-semibold mb-2">没有待处理的好友请求</div>
          <div className="text-gray-400">
            当有人向你发送好友请求时，会在这里显示
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto scrollbar-thin p-2">
      <h2 className="text-base font-bold mb-2 px-1 text-white">
        待处理的好友请求 ({pendingRequests.length})
      </h2>

      <div className="space-y-1">
        {pendingRequests.map((request: FriendRequest) => (
          <div
            key={request.id}
            className="bg-discord-darker p-2 rounded flex items-center justify-between hover:bg-discord-gray transition-colors"
          >
            <div className="flex items-center gap-2">
              <UserAvatar
                username={request.sender?.username}
                avatarUrl={request.sender?.avatarUrl}
                size="sm"
              />
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold text-white truncate">
                  {request.sender?.username}
                </div>
                {request.sender?.bio && (
                  <div className="text-xs text-gray-400 truncate">
                    {request.sender.bio}
                  </div>
                )}
              </div>
            </div>

            <div className="flex gap-1.5 flex-shrink-0">
              <button
                onClick={() => handleAccept(request.id)}
                disabled={isLoading}
                className="px-2 py-1 bg-discord-green hover:bg-green-600 text-white text-xs rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                接受
              </button>
              <button
                onClick={() => handleReject(request.id)}
                disabled={isLoading}
                className="px-2 py-1 bg-discord-gray hover:bg-red-600 text-white text-xs rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                拒绝
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
