import { useState } from 'react';
import { useAuthStore } from '../stores/authStore';
import { userAPI } from '../lib/api';
import { UserAvatar } from './UserAvatar';

interface UserSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type Tab = 'profile' | 'appearance' | 'privacy';

export default function UserSettingsModal({
  isOpen,
  onClose,
}: UserSettingsModalProps) {
  const { user, refreshUser } = useAuthStore();
  const [activeTab, setActiveTab] = useState<Tab>('profile');

  // Profile tab state
  const [displayName, setDisplayName] = useState(user?.displayName || '');
  const [email, setEmail] = useState(user?.email || '');
  const [bio, setBio] = useState(user?.bio || '');
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);

  // Appearance tab state
  const [theme, setTheme] = useState<'LIGHT' | 'DARK' | 'SYSTEM'>(
    user?.settings?.theme || 'DARK'
  );

  // Privacy tab state
  const [friendRequestPrivacy, setFriendRequestPrivacy] = useState<
    'EVERYONE' | 'FRIENDS_OF_FRIENDS' | 'NONE'
  >(user?.settings?.friendRequestPrivacy || 'EVERYONE');

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  if (!isOpen || !user) return null;

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setAvatarFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setAvatarPreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleProfileSave = async () => {
    setIsLoading(true);
    setError(null);
    setSuccessMessage(null);

    try {
      // 上传头像
      if (avatarFile) {
        const formData = new FormData();
        formData.append('avatar', avatarFile);
        await userAPI.uploadAvatar(formData);
      }

      // 更新个人资料
      await userAPI.updateProfile({
        displayName: displayName || undefined,
        email: email || undefined,
        bio: bio || undefined,
      });

      await refreshUser();
      setSuccessMessage('个人资料已更新');
      setAvatarFile(null);
      setAvatarPreview(null);
    } catch (err: any) {
      setError(err.response?.data?.message || '更新失败');
    } finally {
      setIsLoading(false);
    }
  };

  const handleAppearanceSave = async () => {
    setIsLoading(true);
    setError(null);
    setSuccessMessage(null);

    try {
      await userAPI.updateSettings({ theme });
      await refreshUser();
      setSuccessMessage('外观设置已更新');
      
      // 应用主题
      if (theme === 'LIGHT') {
        document.documentElement.classList.remove('dark');
      } else if (theme === 'DARK') {
        document.documentElement.classList.add('dark');
      } else {
        // SYSTEM: 根据系统偏好
        if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
          document.documentElement.classList.add('dark');
        } else {
          document.documentElement.classList.remove('dark');
        }
      }
    } catch (err: unknown) {
      const errorMessage = err instanceof Error && 'response' in err
        ? ((err as { response?: { data?: { message?: string } } }).response?.data?.message || '更新失败')
        : '更新失败';
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  const handlePrivacySave = async () => {
    setIsLoading(true);
    setError(null);
    setSuccessMessage(null);

    try {
      await userAPI.updateSettings({ friendRequestPrivacy });
      await refreshUser();
      setSuccessMessage('隐私设置已更新');
    } catch (err: any) {
      setError(err.response?.data?.message || '更新失败');
    } finally {
      setIsLoading(false);
    }
  };

  const renderTabContent = () => {
    switch (activeTab) {
      case 'profile':
        return (
          <div className="space-y-6">
            <div className="flex items-center gap-6">
              <div className="relative">
                {avatarPreview ? (
                  <img
                    src={avatarPreview}
                    alt={user.username}
                    className="w-24 h-24 rounded-full"
                  />
                ) : (
                  <UserAvatar
                    username={user.username}
                    avatarUrl={user.avatarUrl}
                    size="xl"
                  />
                )}
                <label className="absolute bottom-0 right-0 p-2 bg-discord-blue rounded-full cursor-pointer hover:bg-blue-600 transition-colors">
                  <svg
                    className="w-4 h-4"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"
                    />
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M15 13a3 3 0 11-6 0 3 3 0 016 0z"
                    />
                  </svg>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleAvatarChange}
                    className="hidden"
                  />
                </label>
              </div>
              <div className="flex-1">
                <div className="text-sm text-gray-400 mb-1">用户名</div>
                <div className="text-lg font-semibold">{user.username}</div>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">显示名称</label>
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className="input"
                placeholder="输入显示名称"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">邮箱 (可选)</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="input"
                placeholder="输入邮箱地址"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">个人简介</label>
              <textarea
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                className="input resize-none"
                rows={4}
                placeholder="介绍一下你自己..."
              />
            </div>

            <button
              onClick={handleProfileSave}
              disabled={isLoading}
              className="btn btn-primary w-full"
            >
              {isLoading ? '保存中...' : '保存更改'}
            </button>
          </div>
        );

      case 'appearance':
        return (
          <div className="space-y-6">
            <div>
              <label className="block text-sm font-medium mb-4">主题</label>
              <div className="space-y-3">
                <label className="flex items-center gap-3 p-4 bg-discord-gray rounded-lg cursor-pointer hover:bg-opacity-80 transition-colors">
                  <input
                    type="radio"
                    name="theme"
                    value="DARK"
                    checked={theme === 'DARK'}
                    onChange={(e) => setTheme(e.target.value as 'LIGHT' | 'DARK' | 'SYSTEM')}
                    className="w-5 h-5"
                  />
                  <div>
                    <div className="font-medium">暗色</div>
                    <div className="text-sm text-gray-400">经典的暗色主题</div>
                  </div>
                </label>

                <label className="flex items-center gap-3 p-4 bg-discord-gray rounded-lg cursor-pointer hover:bg-opacity-80 transition-colors">
                  <input
                    type="radio"
                    name="theme"
                    value="LIGHT"
                    checked={theme === 'LIGHT'}
                    onChange={(e) => setTheme(e.target.value as 'LIGHT' | 'DARK' | 'SYSTEM')}
                    className="w-5 h-5"
                  />
                  <div>
                    <div className="font-medium">亮色</div>
                    <div className="text-sm text-gray-400">清爽的亮色主题</div>
                  </div>
                </label>

                <label className="flex items-center gap-3 p-4 bg-discord-gray rounded-lg cursor-pointer hover:bg-opacity-80 transition-colors">
                  <input
                    type="radio"
                    name="theme"
                    value="SYSTEM"
                    checked={theme === 'SYSTEM'}
                    onChange={(e) => setTheme(e.target.value as 'LIGHT' | 'DARK' | 'SYSTEM')}
                    className="w-5 h-5"
                  />
                  <div>
                    <div className="font-medium">跟随系统</div>
                    <div className="text-sm text-gray-400">
                      根据系统设置自动切换
                    </div>
                  </div>
                </label>
              </div>
            </div>

            <button
              onClick={handleAppearanceSave}
              disabled={isLoading}
              className="btn btn-primary w-full"
            >
              {isLoading ? '保存中...' : '保存更改'}
            </button>
          </div>
        );

      case 'privacy':
        return (
          <div className="space-y-6">
            <div>
              <label className="block text-sm font-medium mb-4">
                好友请求隐私
              </label>
              <div className="space-y-3">
                <label className="flex items-center gap-3 p-4 bg-discord-gray rounded-lg cursor-pointer hover:bg-opacity-80 transition-colors">
                  <input
                    type="radio"
                    name="friendRequestPrivacy"
                    value="EVERYONE"
                    checked={friendRequestPrivacy === 'EVERYONE'}
                    onChange={(e) =>
                      setFriendRequestPrivacy(e.target.value as 'EVERYONE' | 'FRIENDS_OF_FRIENDS' | 'NONE')
                    }
                    className="w-5 h-5"
                  />
                  <div>
                    <div className="font-medium">所有人</div>
                    <div className="text-sm text-gray-400">
                      允许任何人向你发送好友请求
                    </div>
                  </div>
                </label>

                <label className="flex items-center gap-3 p-4 bg-discord-gray rounded-lg cursor-pointer hover:bg-opacity-80 transition-colors">
                  <input
                    type="radio"
                    name="friendRequestPrivacy"
                    value="FRIENDS_OF_FRIENDS"
                    checked={friendRequestPrivacy === 'FRIENDS_OF_FRIENDS'}
                    onChange={(e) =>
                      setFriendRequestPrivacy(e.target.value as 'EVERYONE' | 'FRIENDS_OF_FRIENDS' | 'NONE')
                    }
                    className="w-5 h-5"
                  />
                  <div>
                    <div className="font-medium">好友的好友</div>
                    <div className="text-sm text-gray-400">
                      仅允许好友的好友发送请求
                    </div>
                  </div>
                </label>

                <label className="flex items-center gap-3 p-4 bg-discord-gray rounded-lg cursor-pointer hover:bg-opacity-80 transition-colors">
                  <input
                    type="radio"
                    name="friendRequestPrivacy"
                    value="NONE"
                    checked={friendRequestPrivacy === 'NONE'}
                    onChange={(e) =>
                      setFriendRequestPrivacy(e.target.value as 'EVERYONE' | 'FRIENDS_OF_FRIENDS' | 'NONE')
                    }
                    className="w-5 h-5"
                  />
                  <div>
                    <div className="font-medium">关闭</div>
                    <div className="text-sm text-gray-400">
                      不接受任何好友请求
                    </div>
                  </div>
                </label>
              </div>
            </div>

            <button
              onClick={handlePrivacySave}
              disabled={isLoading}
              className="btn btn-primary w-full"
            >
              {isLoading ? '保存中...' : '保存更改'}
            </button>
          </div>
        );
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-discord-dark rounded-lg w-full max-w-4xl h-[80vh] flex overflow-hidden">
        {/* 左侧标签栏 */}
        <div className="w-60 bg-discord-darker p-4 space-y-2">
          <h2 className="text-sm font-semibold text-gray-400 uppercase mb-4">
            用户设置
          </h2>
          <button
            onClick={() => setActiveTab('profile')}
            className={`w-full text-left px-4 py-2 rounded transition-colors ${
              activeTab === 'profile'
                ? 'bg-discord-hover text-white'
                : 'text-gray-400 hover:bg-discord-hover hover:text-white'
            }`}
          >
            个人资料
          </button>
          <button
            onClick={() => setActiveTab('appearance')}
            className={`w-full text-left px-4 py-2 rounded transition-colors ${
              activeTab === 'appearance'
                ? 'bg-discord-hover text-white'
                : 'text-gray-400 hover:bg-discord-hover hover:text-white'
            }`}
          >
            外观设置
          </button>
          <button
            onClick={() => setActiveTab('privacy')}
            className={`w-full text-left px-4 py-2 rounded transition-colors ${
              activeTab === 'privacy'
                ? 'bg-discord-hover text-white'
                : 'text-gray-400 hover:bg-discord-hover hover:text-white'
            }`}
          >
            隐私设置
          </button>

          <div className="pt-4 mt-4 border-t border-gray-700">
            <button
              onClick={onClose}
              className="w-full px-4 py-2 rounded text-gray-400 hover:bg-discord-red hover:text-white transition-colors"
            >
              关闭设置
            </button>
          </div>
        </div>

        {/* 右侧内容区 */}
        <div className="flex-1 p-8 overflow-y-auto scrollbar-thin">
          <h2 className="text-2xl font-bold mb-6">
            {activeTab === 'profile' && '个人资料'}
            {activeTab === 'appearance' && '外观设置'}
            {activeTab === 'privacy' && '隐私设置'}
          </h2>

          {error && (
            <div className="mb-4 p-4 bg-red-500 bg-opacity-10 border border-red-500 rounded-lg text-red-500">
              {error}
            </div>
          )}

          {successMessage && (
            <div className="mb-4 p-4 bg-green-500 bg-opacity-10 border border-green-500 rounded-lg text-green-500">
              {successMessage}
            </div>
          )}

          {renderTabContent()}
        </div>
      </div>
    </div>
  );
}
