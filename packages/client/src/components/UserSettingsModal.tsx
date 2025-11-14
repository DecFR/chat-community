import { useState, useEffect } from 'react';
import { useAuthStore } from '../stores/authStore';
import { userAPI } from '../lib/api';
import { UserAvatar } from './UserAvatar';

interface UserSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type Tab = 'profile' | 'appearance' | 'privacy';

// Toast通知组件
function Toast({ message, type, onClose }: { message: string; type: 'success' | 'error'; onClose: () => void }) {
  useEffect(() => {
    const timer = setTimeout(() => {
      onClose();
    }, 3000);
    return () => clearTimeout(timer);
  }, [onClose]);

  return (
    <div className="fixed top-4 right-4 z-[9999] animate-slide-in">
      <div className={`px-6 py-3 rounded-lg shadow-lg flex items-center gap-3 ${
        type === 'success' ? 'bg-green-500' : 'bg-red-500'
      } text-white`}>
        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
          {type === 'success' ? (
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
          ) : (
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
          )}
        </svg>
        <span className="font-medium">{message}</span>
      </div>
    </div>
  );
}

export default function UserSettingsModal({
  isOpen,
  onClose,
}: UserSettingsModalProps) {
  const { user, refreshUser } = useAuthStore();
  const [activeTab, setActiveTab] = useState<Tab>('profile');

  const [username, setUsername] = useState(user?.username || '');
  const [email, setEmail] = useState(user?.email || '');
  const [bio, setBio] = useState(user?.bio || '');
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [theme, setTheme] = useState<'LIGHT' | 'DARK' | 'SYSTEM'>(user?.settings?.theme || 'DARK');
  const [friendRequestPrivacy, setFriendRequestPrivacy] = useState<'EVERYONE' | 'FRIENDS_OF_FRIENDS' | 'NONE'>(user?.settings?.friendRequestPrivacy || 'EVERYONE');
  const [isLoading, setIsLoading] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  // 同步用户数据到本地状态
  useEffect(() => {
    if (user) {
      setUsername(user.username || '');
      setEmail(user.email || '');
      setBio(user.bio || '');
      setTheme(user.settings?.theme || 'DARK');
      setFriendRequestPrivacy(user.settings?.friendRequestPrivacy || 'EVERYONE');
    }
  }, [user]);

  if (!isOpen || !user) return null;

  // 切换标签时清除消息
  const handleTabChange = (tab: Tab) => {
    setActiveTab(tab);
    setToast(null);
  };

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
    setToast(null);

    try {
      if (avatarFile) {
        const formData = new FormData();
        formData.append('avatar', avatarFile);
        await userAPI.uploadAvatar(formData);
      }

      await userAPI.updateProfile({
        username: username !== user?.username ? username : undefined,
        email: email || undefined,
        bio: bio || undefined,
      });

      await refreshUser();
      setToast({ message: '个人资料已更新', type: 'success' });
      setAvatarFile(null);
      setAvatarPreview(null);
    } catch (err: any) {
      setToast({ message: err.response?.data?.error || err.response?.data?.message || '更新失败', type: 'error' });
    } finally {
      setIsLoading(false);
    }
  };

  const handleAppearanceSave = async () => {
    setIsLoading(true);
    setToast(null);

    try {
      await userAPI.updateSettings({ theme });
      await refreshUser();
      setToast({ message: '外观设置已更新', type: 'success' });
      
      // 应用主题
      const body = document.body;
      if (theme === 'LIGHT') {
        body.classList.add('light-theme');
      } else if (theme === 'DARK') {
        body.classList.remove('light-theme');
      } else {
        // SYSTEM: 根据系统偏好
        if (window.matchMedia('(prefers-color-scheme: light)').matches) {
          body.classList.add('light-theme');
        } else {
          body.classList.remove('light-theme');
        }
      }
    } catch (err: any) {
      setToast({ message: err.response?.data?.error || err.response?.data?.message || '更新失败', type: 'error' });
    } finally {
      setIsLoading(false);
    }
  };

  const handlePrivacySave = async () => {
    setIsLoading(true);
    setToast(null);

    try {
      await userAPI.updateSettings({ friendRequestPrivacy });
      await refreshUser();
      setToast({ message: '隐私设置已更新', type: 'success' });
    } catch (err: any) {
      setToast({ message: err.response?.data?.error || '更新失败', type: 'error' });
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
                    className="w-24 h-24 rounded-full object-cover"
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
              <div>
                <div className="text-sm text-gray-400 mb-1">当前用户</div>
                <div className="text-xl font-semibold">{user.username}</div>
                <div className="text-sm text-gray-500 mt-1">
                  {user.role === 'ADMIN' ? '管理员' : '用户'}
                </div>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">用户名</label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="input"
                placeholder="输入用户名"
                required
              />
              <p className="text-xs text-gray-400 mt-1">用户名必须唯一</p>
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
    <>
      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-discord-dark rounded-lg w-full max-w-4xl h-[80vh] flex overflow-hidden">
        {/* 左侧标签栏 */}
        <div className="w-60 bg-discord-darker p-4 space-y-2">
          <h2 className="text-sm font-semibold text-gray-400 uppercase mb-4">
            用户设置
          </h2>
          <button
            onClick={() => handleTabChange('profile')}
            className={`w-full text-left px-4 py-2 rounded transition-colors ${
              activeTab === 'profile'
                ? 'bg-discord-hover text-white'
                : 'text-gray-400 hover:bg-discord-hover hover:text-white'
            }`}
          >
            个人资料
          </button>
          <button
            onClick={() => handleTabChange('appearance')}
            className={`w-full text-left px-4 py-2 rounded transition-colors ${
              activeTab === 'appearance'
                ? 'bg-discord-hover text-white'
                : 'text-gray-400 hover:bg-discord-hover hover:text-white'
            }`}
          >
            外观设置
          </button>
          <button
            onClick={() => handleTabChange('privacy')}
            className={`w-full text-left px-4 py-2 rounded transition-colors ${
              activeTab === 'privacy'
                ? 'bg-discord-hover text-white'
                : 'text-gray-400 hover:bg-discord-hover hover:text-white'
            }`}
          >
            隐私设置
          </button>

          {/* 管理员入口 */}
          <div className="pt-4 mt-4 border-t border-gray-700">
            <button
              onClick={onClose}
              className="w-full px-4 py-2 rounded text-gray-400 hover:bg-discord-red hover:text-white transition-colors flex items-center justify-center gap-2"
            >
              <span className="text-xl">×</span>
              <span>关闭</span>
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

          {renderTabContent()}
        </div>
      </div>
    </div>
    </>
  );
}
