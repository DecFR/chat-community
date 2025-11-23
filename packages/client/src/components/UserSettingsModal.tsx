import { useState, useEffect, useRef, type ChangeEvent } from 'react';
import { useAuthStore } from '../stores/authStore';
import { userAPI, serverRequestAPI } from '../lib/api';
import { UserAvatar } from './UserAvatar';
import AvatarEditor from './AvatarEditor';
import { socketService } from '../lib/socket';
import { uploadFileInChunks } from '../lib/chunkUploader';

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
  type: string;
  data?: unknown;
}

interface ApiError {
  response?: {
    data?: {
      message?: string;
      error?: string;
    };
  };
  message?: string;
}

type Tab = 'profile' | 'appearance' | 'privacy' | 'serverRequests';

// URL 拼接逻辑
const getAvatarUrl = (url: string | undefined | null) => {
  if (!url) return undefined;
  
  if (url.startsWith('data:') || url.startsWith('blob:')) return url;
  if (url.startsWith('http://') || url.startsWith('https://')) return url;

  let envApiUrl = import.meta.env.VITE_API_URL ?? '';
  if (envApiUrl.endsWith('/api')) {
    envApiUrl = envApiUrl.replace(/\/api$/, '');
  }
  if (envApiUrl.endsWith('/')) {
    envApiUrl = envApiUrl.slice(0, -1);
  }

  const normalizedPath = url.startsWith('/') ? url : `/${url}`;
  return `${envApiUrl}${normalizedPath}`;
};

function Toast({ message, type, onClose }: { message: string; type: 'success' | 'error'; onClose: () => void }) {
  useEffect(() => {
    const timer = setTimeout(onClose, 3000);
    return () => clearTimeout(timer);
  }, [onClose]);

  return (
    <div className="fixed top-4 right-4 z-[9999] animate-slide-in">
      <div className={`px-6 py-3 rounded-lg shadow-lg flex items-center gap-3 ${
        type === 'success' ? 'bg-green-500' : 'bg-red-500'
      } text-white`}>
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

  const [serverRequests, setServerRequests] = useState<ServerRequest[]>([]);
  const [loadingRequests, setLoadingRequests] = useState(false);

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

  useEffect(() => {
    if (activeTab === 'serverRequests') {
      loadServerRequests();
    }
  }, [activeTab]);

  useEffect(() => {
    if (!isOpen) return;
    const handleNotification = (notification: SocketNotification) => {
      if (notification.type === 'server_request_result') loadServerRequests();
    };
    socketService.on('notification', handleNotification);
    return () => { socketService.off('notification', handleNotification); };
  }, [isOpen]);

  useEffect(() => {
    if (user) {
      setUsername(user.username || '');
      setEmail(user.email || '');
      setTheme(user.settings?.theme || 'DARK');
      setFriendRequestPrivacy(user.settings?.friendRequestPrivacy || 'EVERYONE');
    }
  }, [user]);

  useEffect(() => {
    return () => { if (avatarPreview) URL.revokeObjectURL(avatarPreview); };
  }, [avatarPreview]);

  if (!isOpen || !user) return null;

  const handleTabChange = (tab: Tab) => {
    setActiveTab(tab);
    setToast(null);
  };

  const handleAvatarChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 30 * 1024 * 1024) {
        setToast({ message: '图片过大 (Max 30MB)', type: 'error' });
        e.target.value = '';
        return;
      }
      const reader = new FileReader();
      reader.onloadend = () => {
        setSelectedImageForEdit(reader.result as string);
        setShowAvatarEditor(true);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleAvatarSave = async (croppedBlob: Blob) => {
    const file = new File([croppedBlob], 'avatar.jpg', { type: 'image/jpeg' });
    setAvatarFile(file);
    setAvatarPreview(URL.createObjectURL(croppedBlob));
    setShowAvatarEditor(false);
    setSelectedImageForEdit(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleAvatarCancel = () => {
    setShowAvatarEditor(false);
    setSelectedImageForEdit(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleProfileSave = async () => {
    // 🟢 修复：确保 user 存在
    if (!user) return;
    
    setIsLoading(true);
    setToast(null);
    try {
      let newAvatarUrl = user.avatarUrl;

      if (avatarFile) {
        try {
          newAvatarUrl = await uploadFileInChunks({
            file: f,
            chunkSize: 10 * 1024 * 1024, // 改为 10MB
            concurrency: 3, // 新增：开启 3 线程并发
            onProgress: (p) => setUploadProgress(p),
          });
        } catch (uploadErr: unknown) {
          // 🟢 修复：安全处理 unknown 类型错误
          const errorMessage = uploadErr instanceof Error ? uploadErr.message : String(uploadErr);
          console.error(uploadErr);
          throw new Error(`头像上传失败: ${errorMessage}`);
        }
      }

      // 🟢 修复：构造更新对象，使用类型断言避免 TS 报错
      const payload = {
        username: username !== user.username ? username : undefined,
        email: email || undefined,
        avatarUrl: newAvatarUrl !== user.avatarUrl ? newAvatarUrl : undefined,
      };

      // 如果 api 定义不支持 avatarUrl，这里强制转换一下类型
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await userAPI.updateProfile(payload as any);

      await refreshUser();
      setToast({ message: '个人资料已更新', type: 'success' });
      
      setTimeout(() => {
        if (avatarPreview) URL.revokeObjectURL(avatarPreview);
        setAvatarFile(null);
        setAvatarPreview(null);
      }, 500);

    } catch (err) {
      const error = err as ApiError;
      const errorMsg = error.response?.data?.message || error.message || '更新失败';
      setToast({ message: errorMsg, type: 'error' });
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
      const body = document.body;
      if (theme === 'LIGHT') body.classList.add('light-theme');
      else if (theme === 'DARK') body.classList.remove('light-theme');
      else {
        if (window.matchMedia('(prefers-color-scheme: light)').matches) body.classList.add('light-theme');
        else body.classList.remove('light-theme');
      }
    } catch (err) {
      const error = err as ApiError;
      setToast({ message: error.response?.data?.message || error.message || '更新失败', type: 'error' });
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
    } catch (err) {
      const error = err as ApiError;
      setToast({ message: error.response?.data?.message || error.message || '更新失败', type: 'error' });
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
              <div className="relative group">
                {avatarPreview ? (
                  <img src={avatarPreview} alt={user.username} className="w-24 h-24 rounded-full object-cover" />
                ) : (
                  <UserAvatar username={user.username} avatarUrl={getAvatarUrl(user.avatarUrl)} size="xl" />
                )}
                <label className="absolute bottom-0 right-0 p-2 bg-discord-blue rounded-full cursor-pointer hover:bg-blue-600 transition-colors shadow-lg">
                  <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                  <input ref={fileInputRef} type="file" accept="image/*" onChange={handleAvatarChange} className="hidden" />
                </label>
              </div>
              <div>
                <div className="text-sm text-gray-400 mb-1">当前用户</div>
                <div className="text-xl font-semibold text-white">{user.username}</div>
                <div className="text-sm text-gray-500 mt-1">{user.role === 'ADMIN' ? '管理员' : '用户'}</div>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium mb-2 text-gray-300">用户名</label>
              <div className="relative">
                <input
                  type="text"
                  value={username}
                  onChange={async (e) => {
                    const newUsername = e.target.value;
                    setUsername(newUsername);
                    setUsernameError(null);
                    if (newUsername === user?.username) return;
                    if (newUsername.length >= 3) {
                      setIsCheckingUsername(true);
                      try {
                        const response = await userAPI.checkUsername(newUsername);
                        if (!response.data.available) setUsernameError('用户名已被使用');
                      } catch (err) { console.error(err); } finally { setIsCheckingUsername(false); }
                    }
                  }}
                  className={`w-full px-3 py-2 bg-discord-darkest border border-gray-700 rounded focus:outline-none focus:border-discord-blue text-white ${usernameError ? 'border-red-500' : ''}`}
                  placeholder="输入用户名"
                  required
                />
                {isCheckingUsername && <div className="absolute right-3 top-1/2 -translate-y-1/2"><div className="animate-spin h-4 w-4 border-2 border-discord-blue border-t-transparent rounded-full"></div></div>}
              </div>
              {usernameError ? <p className="text-xs text-red-400 mt-1">{usernameError}</p> : <p className="text-xs text-gray-400 mt-1">用户名必须唯一</p>}
            </div>

            <div>
              <label className="block text-sm font-medium mb-2 text-gray-300">邮箱 (可选)</label>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="w-full px-3 py-2 bg-discord-darkest border border-gray-700 rounded focus:outline-none focus:border-discord-blue text-white" placeholder="输入邮箱地址" />
            </div>

            <div>
              <label className="block text-sm font-medium mb-2 text-gray-300">重置密码</label>
              <button onClick={async () => {
                  const currentPassword = prompt('请输入当前密码：'); if (!currentPassword) return;
                  const newPassword = prompt('请输入新密码：'); if (!newPassword) return;
                  const confirmPassword = prompt('请确认新密码：'); if (newPassword !== confirmPassword) { alert('两次输入的密码不一致！'); return; }
                  try { await userAPI.updatePassword({ currentPassword, newPassword }); setToast({ message: '密码已更新', type: 'success' }); } 
                  catch (err) { 
                    const error = err as ApiError;
                    setToast({ message: error.response?.data?.error || '密码更新失败', type: 'error' }); 
                  }
                }}
                type="button" className="px-4 py-2 bg-discord-blue hover:bg-blue-600 rounded text-white text-sm transition-colors"
              >
                更改密码
              </button>
            </div>

            <button onClick={handleProfileSave} disabled={isLoading} className="w-full py-2 bg-green-600 hover:bg-green-700 rounded text-white font-medium disabled:opacity-50 transition-colors">
              {isLoading ? '保存中...' : '保存更改'}
            </button>
          </div>
        );
      case 'appearance':
        return (
          <div className="space-y-6">
            <div>
              <label className="block text-sm font-medium mb-4 text-gray-300">主题</label>
              <div className="space-y-3">
                {['DARK', 'LIGHT', 'SYSTEM'].map((t) => (
                  <label key={t} className="flex items-center gap-3 p-4 bg-discord-darkest rounded-lg cursor-pointer hover:bg-opacity-80 transition-colors border border-transparent hover:border-discord-blue">
                    <input 
                      type="radio" 
                      name="theme" 
                      value={t} 
                      checked={theme === t} 
                      onChange={(e) => setTheme(e.target.value as 'LIGHT' | 'DARK' | 'SYSTEM')} 
                      className="w-5 h-5 accent-discord-blue" 
                    />
                    <div>
                      <div className="font-medium text-white">{t === 'DARK' ? '暗色' : t === 'LIGHT' ? '亮色' : '跟随系统'}</div>
                    </div>
                  </label>
                ))}
              </div>
            </div>
            <button onClick={handleAppearanceSave} disabled={isLoading} className="w-full py-2 bg-green-600 hover:bg-green-700 rounded text-white font-medium disabled:opacity-50 transition-colors">
              {isLoading ? '保存中...' : '保存更改'}
            </button>
          </div>
        );
      case 'privacy':
        return (
          <div className="space-y-6">
            <div>
              <label className="block text-sm font-medium mb-4 text-gray-300">好友请求隐私</label>
              <div className="space-y-3">
                {[
                  { val: 'EVERYONE', label: '所有人', desc: '允许任何人向你发送好友请求' },
                  { val: 'FRIENDS_OF_FRIENDS', label: '好友的好友', desc: '仅允许好友的好友发送请求' },
                  { val: 'NONE', label: '关闭', desc: '不接受任何好友请求' }
                ].map((opt) => (
                  <label key={opt.val} className="flex items-center gap-3 p-4 bg-discord-darkest rounded-lg cursor-pointer hover:bg-opacity-80 transition-colors border border-transparent hover:border-discord-blue">
                    <input 
                      type="radio" 
                      name="friendRequestPrivacy" 
                      value={opt.val} 
                      checked={friendRequestPrivacy === opt.val} 
                      onChange={(e) => setFriendRequestPrivacy(e.target.value as 'EVERYONE' | 'FRIENDS_OF_FRIENDS' | 'NONE')} 
                      className="w-5 h-5 accent-discord-blue" 
                    />
                    <div>
                      <div className="font-medium text-white">{opt.label}</div>
                      <div className="text-sm text-gray-400">{opt.desc}</div>
                    </div>
                  </label>
                ))}
              </div>
            </div>
            <button onClick={handlePrivacySave} disabled={isLoading} className="w-full py-2 bg-green-600 hover:bg-green-700 rounded text-white font-medium disabled:opacity-50 transition-colors">
              {isLoading ? '保存中...' : '保存更改'}
            </button>
          </div>
        );
      case 'serverRequests':
        return (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <p className="text-sm text-gray-400">查看你提交的服务器创建申请状态</p>
              <button onClick={loadServerRequests} disabled={loadingRequests} className="px-3 py-1.5 bg-discord-blue hover:bg-opacity-90 disabled:bg-gray-600 text-white rounded text-sm transition-colors">
                {loadingRequests ? '刷新中...' : '刷新'}
              </button>
            </div>
            {serverRequests.length === 0 ? (
              <div className="text-center py-12 text-gray-500">暂无申请记录</div>
            ) : (
              <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-2 scrollbar-thin">
                {serverRequests.map((req) => (
                  <div key={req.id} className="bg-discord-darkest rounded-lg p-4 border border-gray-700">
                    <div className="flex justify-between items-center mb-2">
                      <h4 className="text-white font-bold">{req.name}</h4>
                      <span className={`px-2 py-0.5 rounded text-xs font-bold ${req.status === 'PENDING' ? 'bg-yellow-500/20 text-yellow-500' : req.status === 'APPROVED' ? 'bg-green-500/20 text-green-500' : 'bg-red-500/20 text-red-500'}`}>{req.status}</span>
                    </div>
                    <p className="text-sm text-gray-400 mb-1">理由: {req.reason}</p>
                    {req.reviewNote && <p className="text-sm text-gray-500 mt-2 pt-2 border-t border-gray-700">回复: {req.reviewNote}</p>}
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <>
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
      <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-0 md:p-4">
        <div className="bg-discord-dark w-full h-full md:h-[85vh] md:max-w-4xl md:rounded-lg flex flex-col md:flex-row overflow-hidden">
          
          <div className="w-full md:w-64 bg-discord-darker p-4 flex-shrink-0 border-b md:border-b-0 md:border-r border-discord-darkest overflow-x-auto md:overflow-visible flex md:block gap-2 md:gap-0">
            <h2 className="hidden md:block text-xs font-bold text-gray-400 uppercase mb-3 px-2">用户设置</h2>
            
            <div className="flex md:flex-col gap-1 min-w-max md:min-w-0">
              <button onClick={() => handleTabChange('profile')} className={`px-3 py-2 rounded text-sm font-medium transition-colors whitespace-nowrap text-left ${activeTab === 'profile' ? 'bg-discord-hover text-white' : 'text-gray-400 hover:bg-discord-hover hover:text-gray-200'}`}>个人资料</button>
              <button onClick={() => handleTabChange('appearance')} className={`px-3 py-2 rounded text-sm font-medium transition-colors whitespace-nowrap text-left ${activeTab === 'appearance' ? 'bg-discord-hover text-white' : 'text-gray-400 hover:bg-discord-hover hover:text-gray-200'}`}>外观设置</button>
              <button onClick={() => handleTabChange('privacy')} className={`px-3 py-2 rounded text-sm font-medium transition-colors whitespace-nowrap text-left ${activeTab === 'privacy' ? 'bg-discord-hover text-white' : 'text-gray-400 hover:bg-discord-hover hover:text-gray-200'}`}>隐私设置</button>
              {user.role !== 'ADMIN' && (
                <button onClick={() => handleTabChange('serverRequests')} className={`px-3 py-2 rounded text-sm font-medium transition-colors whitespace-nowrap text-left ${activeTab === 'serverRequests' ? 'bg-discord-hover text-white' : 'text-gray-400 hover:bg-discord-hover hover:text-gray-200'}`}>服务器申请</button>
              )}
            </div>

            <div className="hidden md:block mt-4 pt-4 border-t border-gray-700">
              <button onClick={onClose} className="w-full px-3 py-2 rounded text-gray-400 hover:text-white hover:bg-discord-red/10 transition-colors flex items-center gap-2 text-sm">
                <span className="text-lg font-bold">×</span> 退出
              </button>
            </div>
          </div>

          <div className="flex-1 p-4 md:p-8 overflow-y-auto scrollbar-thin relative">
            <button onClick={onClose} className="md:hidden absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-full bg-discord-darkest text-gray-400 hover:text-white shadow-md z-10">
              ✕
            </button>

            <h2 className="text-xl md:text-2xl font-bold text-white mb-6 pt-2 md:pt-0">
              {activeTab === 'profile' && '个人资料'}
              {activeTab === 'appearance' && '外观设置'}
              {activeTab === 'privacy' && '隐私设置'}
              {activeTab === 'serverRequests' && '服务器申请'}
            </h2>

            {renderTabContent()}
          </div>
        </div>

        {showAvatarEditor && selectedImageForEdit && (
          <AvatarEditor imageSrc={selectedImageForEdit} onSave={handleAvatarSave} onCancel={handleAvatarCancel} />
        )}
      </div>
    </>
  );
}