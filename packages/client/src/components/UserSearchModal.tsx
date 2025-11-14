import { useState } from 'react';
import { userAPI } from '../lib/api';
import { UserAvatar } from './UserAvatar';

interface UserSearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectUser: (userId: string) => void;
}

interface SearchResult {
  id: string;
  username: string;
  avatarUrl?: string;
  bio?: string;
  status: string;
}

export default function UserSearchModal({
  isOpen,
  onClose,
  onSelectUser,
}: UserSearchModalProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSearch = async () => {
    if (!query.trim()) {
      setError('请输入搜索关键词');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const response = await userAPI.searchUsers(query);
      setResults(response.data.data || []);
      if (response.data.data?.length === 0) {
        setError('未找到匹配的用户');
      }
    } catch (err: unknown) {
      const errorMessage =
        err instanceof Error && 'response' in err
          ? ((err as { response?: { data?: { message?: string } } }).response
              ?.data?.message || '搜索失败')
          : '搜索失败';
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSearch();
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-discord-dark rounded-lg w-full max-w-2xl p-6">
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

        <div className="flex gap-3 mb-6">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyPress={handleKeyPress}
            className="input flex-1"
            placeholder="输入用户名搜索..."
            autoFocus
          />
          <button
            onClick={handleSearch}
            disabled={isLoading}
            className="btn btn-primary"
          >
            {isLoading ? '搜索中...' : '搜索'}
          </button>
        </div>

        {error && (
          <div className="mb-4 p-4 bg-red-500 bg-opacity-10 border border-red-500 rounded-lg text-red-500">
            {error}
          </div>
        )}

        <div className="max-h-96 overflow-y-auto scrollbar-thin space-y-2">
          {results.map((user) => (
            <div
              key={user.id}
              onClick={() => {
                onSelectUser(user.id);
                onClose();
              }}
              className="card flex items-center gap-4 cursor-pointer hover:bg-discord-hover transition-colors"
            >
              <div className="relative">
                <UserAvatar
                  username={user.username}
                  avatarUrl={user.avatarUrl}
                  size="md"
                />
                <div
                  className={`absolute bottom-0 right-0 w-4 h-4 rounded-full border-2 border-discord-dark ${
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
              <div className="flex-1">
                <div className="text-lg font-semibold">
                  {user.username}
                </div>
                <div className="text-sm text-gray-400">@{user.username}</div>
                {user.bio && (
                  <div className="text-sm text-gray-500 mt-1">{user.bio}</div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
