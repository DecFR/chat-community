import { useState, useEffect } from 'react';
import { userAPI, friendAPI } from '../lib/api';
import { toast } from '../stores/toastStore';
import { UserAvatar } from './UserAvatar';

interface UserSearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectUser?: (userId: string) => void;
  inline?: boolean; // 新增：是否为内联模式
}

interface SearchResult {
  id: string;
  username: string;
  avatarUrl?: string;
  bio?: string;
  status: string;
  relationship?: 'FRIEND' | 'OUTGOING_PENDING' | 'INCOMING_PENDING' | 'NONE';
}

export default function UserSearchModal({
  isOpen,
  onClose,
  inline = false, // 默认为模态框模式
}: UserSearchModalProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  // 当组件打开时重置状态
  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setResults([]);
      setIsLoading(false);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSearch = async () => {
    if (!query.trim()) {
      toast.warning('请输入搜索关键词');
      return;
    }

    setIsLoading(true);

    try {
      const response = await userAPI.searchUsers(query);
      setResults(response.data.data || []);
      if (response.data.data?.length === 0) {
        toast.info('未找到匹配的用户');
      }
    } catch (err: unknown) {
      const errorMessage =
        err instanceof Error && 'response' in err
          ? ((err as { response?: { data?: { message?: string } } }).response
              ?.data?.message || '搜索失败')
          : '搜索失败';
      toast.error(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSearch();
    }
  };

  const handleSendFriendRequest = async (userId: string, username: string) => {
    try {
      await friendAPI.sendRequest(userId);
      toast.success(`已向 ${username} 发送好友请求`);
    } catch (error: any) {
      const errorMsg = error?.response?.data?.error || '发送好友请求失败';
      toast.error(errorMsg);
    }
  };

  // 内联模式：直接显示内容，不使用模态框
  const content = (
    <div className={inline ? '' : 'bg-discord-dark rounded-lg w-full max-w-2xl p-6'}>
      {!inline && (
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold">搜索用户</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors"
          >
            <svg
              className="w-6 h-6"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>
      )}

      <div className={`flex gap-2 ${inline ? 'mb-3' : 'mb-6'}`}>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyPress={handleKeyPress}
          className={inline ? 'flex-1 px-3 py-2 bg-discord-darkest rounded text-white text-sm focus:outline-none focus:ring-2 focus:ring-discord-blue' : 'input flex-1'}
          placeholder="输入用户名搜索..."
          autoFocus
        />
        <button
          onClick={handleSearch}
          disabled={isLoading}
          className={inline ? 'px-3 py-2 bg-discord-blue hover:bg-discord-blue-hover text-white rounded text-sm transition-colors' : 'btn btn-primary'}
        >
          {isLoading ? '...' : '搜索'}
        </button>
      </div>

      {/* 错误提示改为全局 Toast，不再显示红条 */}

      <div className={`${inline ? 'max-h-64' : 'max-h-96'} overflow-y-auto scrollbar-thin space-y-1`}>
        {results.map((user) => (
          <div
            key={user.id}
            className={`${inline ? 'p-2' : 'card'} flex items-center gap-3 hover:bg-discord-hover transition-colors rounded`}
          >
            <div className="relative">
              <UserAvatar
                username={user.username}
                avatarUrl={user.avatarUrl}
                size={inline ? 'sm' : 'md'}
              />
              <div
                className={`absolute bottom-0 right-0 ${inline ? 'w-3 h-3' : 'w-4 h-4'} rounded-full border-2 border-discord-dark ${
                  user.status === 'ONLINE'
                    ? 'bg-green-500'
                    : user.status === 'IDLE'
                    ? 'bg-yellow-500'
                    : user.status === 'DO_NOT_DISTURB'
                    ? 'bg-red-500'
                    : 'bg-gray-500'
                }`}
              />
            </div>
            <div className="flex-1 min-w-0">
              <div className={`${inline ? 'text-sm' : 'text-lg'} font-semibold truncate text-white`}>
                {user.username}
              </div>
              {user.relationship && user.relationship !== 'NONE' && (
                <div className="mt-0.5 text-xs text-gray-400">
                  {user.relationship === 'FRIEND' && '已是好友'}
                  {user.relationship === 'OUTGOING_PENDING' && '已发送好友请求'}
                  {user.relationship === 'INCOMING_PENDING' && '对方向你发送了请求'}
                </div>
              )}
              {!inline && user.bio && (
                <div className="text-sm text-gray-500 mt-1">{user.bio}</div>
              )}
            </div>
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleSendFriendRequest(user.id, user.username);
              }}
              disabled={user.relationship === 'FRIEND' || user.relationship === 'OUTGOING_PENDING'}
              className={`${inline ? 'px-2 py-1 text-xs' : 'px-3 py-2 text-sm'} ${user.relationship === 'FRIEND' || user.relationship === 'OUTGOING_PENDING' ? 'bg-discord-gray text-gray-400 cursor-not-allowed' : 'bg-discord-green hover:bg-green-600 text-white'} rounded transition-colors flex-shrink-0`}
            >
              {user.relationship === 'FRIEND'
                ? '已添加'
                : user.relationship === 'OUTGOING_PENDING'
                ? '已发送'
                : '添加好友'}
            </button>
          </div>
        ))}
      </div>
    </div>
  );

  // 模态框模式：包裹在遮罩层中
  if (!inline) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        {content}
      </div>
    );
  }

  // 内联模式：直接返回内容
  return content;
}

