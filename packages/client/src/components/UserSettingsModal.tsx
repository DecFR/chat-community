import { useState, useEffect, useRef } from 'react';
import { useAuthStore } from '../stores/authStore';
import { userAPI, serverRequestAPI } from '../lib/api';
import { UserAvatar } from './UserAvatar';
import AvatarEditor from './AvatarEditor';
import { socketService } from '../lib/socket';

interface UserSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface ServerRequest {
  id: string;
  name: string;
  description?: string;
  reason: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  reviewNote?: string;
  reviewedAt?: string;
  createdAt: string;
}

interface SocketNotification {
  type: 'server_request_result' | 'friend_request' | 'friend_request_accepted' | string; // 允许多种通知类型
  data?: unknown; // 根据不同通知类型，data结构可能不同
}

type Tab = 'profile' | 'appearance' | 'privacy' | 'serverRequests';

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
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [username, setUsername] = useState(user?.username || '');
  const [email, setEmail] = useState(user?.email || '');
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [showAvatarEditor, setShowAvatarEditor] = useState(false);
  const [selectedImageForEdit, setSelectedImageForEdit] = useState<string | null>(null);
  const [theme, setTheme] = useState<'LIGHT' | 'DARK' | 'SYSTEM'>(user?.settings?.theme || 'DARK');
  const [friendRequestPrivacy, setFriendRequestPrivacy] = useState<'EVERYONE' | 'FRIENDS_OF_FRIENDS' | 'NONE'>(user?.settings?.friendRequestPrivacy || 'EVERYONE');
  const [isLoading, setIsLoading] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [usernameError, setUsernameError] = useState<string | null>(null);
  const [isCheckingUsername, setIsCheckingUsername] = useState(false);

  // 服务器申请状态
  const [serverRequests, setServerRequests] = useState<ServerRequest[]>([]);
  const [loadingRequests, setLoadingRequests] = useState(false);

  // 加载用户的服务器申请
  const loadServerRequests = async () => {
    try {
      setLoadingRequests(true);
      const response = await serverRequestAPI.getMyRequests();
      setServerRequests(response.data.data || response.data || []);
    } catch (error) {
      console.error('加载服务器申请失败:', error);
    } finally {
      setLoadingRequests(false);
    }
  };

  // 当切换到服务器申请标签时加载数据
  useEffect(() => {
    if (activeTab === 'serverRequests') {
      loadServerRequests();
    }
  }, [activeTab]);

  // 监听服务器申请结果通知
  useEffect(() => {
    if (!isOpen) return;

    const handleNotification = (notification: SocketNotification) => {
      try {
        if (notification.type === 'server_request_result') {
          console.log('[UserSettings] 收到服务器申请结果通知，刷新列表');
          // 始终刷新申请列表(即使不在该标签页也缓存最新数据)
          loadServerRequests();
        }
      } catch (error) {
        console.error('[UserSettings] 处理通知失败:', error);
      }
    };

    socketService.on('notification', handleNotification);

    return () => {
      socketService.off('notification', handleNotification);
    };
  }, [isOpen]); // 移除activeTab依赖,始终监听

  // 同步用户数据到本地状态
  useEffect(() => {
    if (user) {
      setUsername(user.username || '');
      setEmail(user.email || '');
      setTheme(user.settings?.theme || 'DARK');
      setFriendRequestPrivacy(user.settings?.friendRequestPrivacy || 'EVERYONE');
    }
  }, [user]);

  // 组件卸载时清理预览URL
  useEffect(() => {
    return () => {
      if (avatarPreview) {
        URL.revokeObjectURL(avatarPreview);
      }
    };
  }, [avatarPreview]);

  if (!isOpen || !user) return null;

  // 切换标签时清除消息
  const handleTabChange = (tab: Tab) => {
    setActiveTab(tab);
    setToast(null);
  };

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      // 检查文件大小（20MB = 20 * 1024 * 1024 bytes）
      const maxSize = 20 * 1024 * 1024;
      if (file.size > maxSize) {
        setToast({ 
          message: `图片过大！文件大小为 ${(file.size / 1024 / 1024).toFixed(2)} MB，最大允许 20 MB`, 
          type: 'error' 
        });
        // 重置input
        e.target.value = '';
        return;
      }

      // 读取文件并显示编辑器
      const reader = new FileReader();
      reader.onloadend = () => {
        setSelectedImageForEdit(reader.result as string);
        setShowAvatarEditor(true);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleAvatarSave = async (croppedBlob: Blob) => {
    // 将裁剪后的图片转换为File对象
    const file = new File([croppedBlob], 'avatar.jpg', { type: 'image/jpeg' });
    setAvatarFile(file);
    
    // 创建预览URL
    const previewUrl = URL.createObjectURL(croppedBlob);
    setAvatarPreview(previewUrl);
    
    setShowAvatarEditor(false);
    setSelectedImageForEdit(null);
    
    // 重置input以允许重复选择同一文件
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleAvatarCancel = () => {
    setShowAvatarEditor(false);
    setSelectedImageForEdit(null);
    
    // 重置input以允许重复选择同一文件
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
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
      });

      await refreshUser();
      setToast({ message: '个人资料已更新', type: 'success' });
      
      // 等待用户数据刷新后再清理预览
      // 这样可以确保新头像URL已经加载
      setTimeout(() => {
        if (avatarPreview) {
          URL.revokeObjectURL(avatarPreview);
        }
        setAvatarFile(null);
        setAvatarPreview(null);
      }, 500);
    } catch (err: unknown) {
      const errorMessage = err instanceof Error && 'response' in err 
        ? ((err as { response?: { data?: { error?: string, message?: string } } }).response?.data?.error || (err as { response?: { data?: { error?: string, message?: string } } }).response?.data?.message || '更新失败')
        : '更新失败';
      setToast({ message: errorMessage, type: 'error' });
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
    } catch (err: unknown) {
      const errorMessage = err instanceof Error && 'response' in err
        ? ((err as { response?: { data?: { error?: string, message?: string } } }).response?.data?.error || (err as { response?: { data?: { error?:string, message?: string } } }).response?.data?.message || '更新失败')
        : '更新失败';
      setToast({ message: errorMessage, type: 'error' });
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
    } catch (err: unknown) {
      const errorMessage = err instanceof Error && 'response' in err
        ? ((err as { response?: { data?: { error?: string } } }).response?.data?.error || '更新失败')
        : '更新失败';
      setToast({ message: errorMessage, type: 'error' });
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
                    ref={fileInputRef}
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
              <div className="relative">
                <input
                  type="text"
                  value={username}
                  onChange={async (e) => {
                    const newUsername = e.target.value;
                    setUsername(newUsername);
                    setUsernameError(null);

                    // 如果用户名没变，不检测
                    if (newUsername === user?.username) {
                      return;
                    }

                    // 防抖检测
                    if (newUsername.length >= 3) {
                      setIsCheckingUsername(true);
                      try {
                        const response = await userAPI.checkUsername(newUsername);
                        if (!response.data.available) {
                          setUsernameError('用户名已被使用');
                        }
                      } catch (err: unknown) {
                        console.error('检测用户名失败:', err);
                      } finally {
                        setIsCheckingUsername(false);
                      }
                    }
                  }}
                  className={`input pr-10 ${usernameError ? 'border-red-500' : ''}`}
                  placeholder="输入用户名"
                  required
                />
                {isCheckingUsername && (
                  <div className="absolute right-3 top-1/2 -translate-y-1/2">
                    <div className="animate-spin h-4 w-4 border-2 border-discord-blue border-t-transparent rounded-full"></div>
                  </div>
                )}
              </div>
              {usernameError ? (
                <p className="text-xs text-red-400 mt-1">{usernameError}</p>
              ) : (
                <p className="text-xs text-gray-400 mt-1">用户名必须唯一</p>
              )}
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
              <label className="block text-sm font-medium mb-2">重置密码</label>
              <button
                onClick={async () => {
                  const currentPassword = prompt('请输入当前密码：');
                  if (!currentPassword) return;
                  
                  const newPassword = prompt('请输入新密码：');
                  if (!newPassword) return;
                  
                  const confirmPassword = prompt('请确认新密码：');
                  if (newPassword !== confirmPassword) {
                    alert('两次输入的密码不一致！');
                    return;
                  }
                  
                  try {
                    await userAPI.updatePassword({ currentPassword, newPassword });
                    setToast({ message: '密码已更新', type: 'success' });
                  } catch (err: unknown) {
                    const errorMessage = err instanceof Error && 'response' in err
                      ? ((err as { response?: { data?: { error?: string } } }).response?.data?.error || '密码更新失败')
                      : '密码更新失败';
                    setToast({ message: errorMessage, type: 'error' });
                  }
                }}
                type="button"
                className="px-4 py-2 bg-discord-blue hover:bg-blue-600 rounded transition-colors text-sm"
              >
                更改密码
              </button>
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

      case 'serverRequests':
        return (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-400">
                  查看你提交的服务器创建申请状态
                </p>
              </div>
              <button
                onClick={loadServerRequests}
                disabled={loadingRequests}
                className="px-3 py-1.5 bg-discord-blue hover:bg-discord-blue/90 disabled:bg-gray-600 text-white rounded text-sm transition-colors"
              >
                {loadingRequests ? '加载中...' : '刷新'}
              </button>
            </div>

            {loadingRequests ? (
              <div className="text-center py-12 text-gray-400">加载中...</div>
            ) : serverRequests.length === 0 ? (
              <div className="text-center py-12">
                <svg className="w-16 h-16 mx-auto text-gray-600 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                </svg>
                <p className="text-gray-400">暂无服务器申请记录</p>
                <p className="text-sm text-gray-500 mt-2">在"创建/查找服务器"中提交申请后将在此显示</p>
              </div>
            ) : (
              <div className="space-y-4">
                {serverRequests.map((request) => (
                  <div
                    key={request.id}
                    className={`bg-discord-gray rounded-lg p-4 border-2 transition-colors ${
                      request.status === 'PENDING' ? 'border-yellow-500/30' :
                      request.status === 'APPROVED' ? 'border-green-500/30' :
                      'border-red-500/30'
                    }`}
                  >
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <h4 className="text-white font-semibold text-lg">{request.name}</h4>
                          <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                            request.status === 'PENDING' ? 'bg-yellow-500/20 text-yellow-500' :
                            request.status === 'APPROVED' ? 'bg-green-500/20 text-green-500' :
                            'bg-red-500/20 text-red-500'
                          }`}>
                            {request.status === 'PENDING' ? '待审核' :
                             request.status === 'APPROVED' ? '已批准' :
                             '已拒绝'}
                          </span>
                        </div>
                        {request.description && (
                          <p className="text-gray-400 text-sm mb-2">{request.description}</p>
                        )}
                      </div>
                    </div>

                    <div className="space-y-2 text-sm">
                      <div className="flex items-center gap-2 text-gray-400">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        <span>申请时间：{new Date(request.createdAt).toLocaleString('zh-CN')}</span>
                      </div>

                      {request.reason && (
                        <div className="bg-discord-darkest rounded p-3">
                          <div className="text-gray-500 text-xs mb-1">申请理由</div>
                          <div className="text-gray-300">{request.reason}</div>
                        </div>
                      )}

                      {request.status !== 'PENDING' && request.reviewedAt && (
                        <div className="flex items-center gap-2 text-gray-400 pt-2 border-t border-gray-700">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                          <span>审核时间：{new Date(request.reviewedAt).toLocaleString('zh-CN')}</span>
                        </div>
                      )}

                      {request.reviewNote && (
                        <div className={`rounded p-3 ${
                          request.status === 'APPROVED' ? 'bg-green-500/10' : 'bg-red-500/10'
                        }`}>
                          <div className={`text-xs mb-1 ${
                            request.status === 'APPROVED' ? 'text-green-400' : 'text-red-400'
                          }`}>
                            管理员备注
                          </div>
                          <div className="text-gray-300">{request.reviewNote}</div>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
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
      <div className="bg-discord-dark rounded-lg w-full max-w-4xl h-[85vh] flex overflow-hidden">
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
          {user.role !== 'ADMIN' && (
            <button
              onClick={() => handleTabChange('serverRequests')}
              className={`w-full text-left px-4 py-2 rounded transition-colors ${
                activeTab === 'serverRequests'
                  ? 'bg-discord-hover text-white'
                  : 'text-gray-400 hover:bg-discord-hover hover:text-white'
              }`}
            >
              服务器申请
            </button>
          )}

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
            {activeTab === 'serverRequests' && user.role !== 'ADMIN' && '服务器申请'}
          </h2>

          {renderTabContent()}
        </div>
      </div>

      {/* 头像编辑器模态框 */}
      {showAvatarEditor && selectedImageForEdit && (
        <AvatarEditor
          imageSrc={selectedImageForEdit}
          onSave={handleAvatarSave}
          onCancel={handleAvatarCancel}
        />
      )}
    </div>
    </>
  );
}
