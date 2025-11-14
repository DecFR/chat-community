import { useState } from 'react';
import { useFriendStore } from '../stores/friendStore';
import { friendAPI } from '../lib/api';
import { UserAvatar } from './UserAvatar';

export default function FriendRequestsPanel() {
  const { pendingRequests, loadPendingRequests } = useFriendStore();
  const [isLoading, setIsLoading] = useState(false);

  const handleAccept = async (requestId: string) => {
    setIsLoading(true);
    try {
      await friendAPI.acceptRequest(requestId);
      await loadPendingRequests();
    } catch (error) {
      console.error('Failed to accept friend request:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleReject = async (requestId: string) => {
    setIsLoading(true);
    try {
      await friendAPI.declineRequest(requestId);
      await loadPendingRequests();
    } catch (error) {
      console.error('Failed to reject friend request:', error);
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
    <div className="flex-1 overflow-y-auto scrollbar-thin p-8">
      <h2 className="text-2xl font-bold mb-6">
        待处理的好友请求 ({pendingRequests.length})
      </h2>

      <div className="space-y-4">
        {pendingRequests.map((request: any) => (
          <div
            key={request.id}
            className="card flex items-center justify-between"
          >
            <div className="flex items-center gap-4">
              <UserAvatar
                username={request.requester.username}
                avatarUrl={request.requester.avatarUrl}
                size="lg"
              />
              <div>
                <div className="text-lg font-semibold">
                  {request.requester.username}
                </div>
                <div className="text-sm text-gray-400">
                  @{request.requester.username}
                </div>
                {request.requester.bio && (
                  <div className="text-sm text-gray-500 mt-1">
                    {request.requester.bio}
                  </div>
                )}
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => handleAccept(request.id)}
                disabled={isLoading}
                className="btn btn-primary"
              >
                接受
              </button>
              <button
                onClick={() => handleReject(request.id)}
                disabled={isLoading}
                className="btn btn-secondary"
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
