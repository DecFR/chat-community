import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';
import { authAPI } from '../lib/api';

export default function RegisterPage() {
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [requiresInvite, setRequiresInvite] = useState(false);
  const [checkingUsers, setCheckingUsers] = useState(true);

  const register = useAuthStore((state) => state.register);
  const navigate = useNavigate();

  // 检查是否需要邀请码
  useEffect(() => {
    const checkUsers = async () => {
      try {
        const response = await authAPI.checkUsers();
        setRequiresInvite(response.data.data.hasUsers);
      } catch (err) {
        console.error('Failed to check users:', err);
        // 出错时默认要求邀请码（更安全）
        setRequiresInvite(true);
      } finally {
        setCheckingUsers(false);
      }
    };

    checkUsers();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (password !== confirmPassword) {
      setError('两次输入的密码不一致');
      return;
    }

    if (password.length < 6) {
      setError('密码长度至少为 6 个字符');
      return;
    }

    // 如果后端要求邀请码但用户未填写，用 React 错误提示（避免浏览器原生提示）
    if (requiresInvite && !inviteCode) {
      setError('请输入邀请码');
      return;
    }

    setIsLoading(true);

    try {
      await register(username, password, email || undefined, inviteCode || undefined);
      navigate('/app');
    } catch (err: any) {
      setError(err.response?.data?.error || '注册失败，请稍后再试');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-discord-dark p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-white mb-2">创建账号</h1>
          <p className="text-discord-light-gray">加入我们的社区！</p>
        </div>

        {checkingUsers ? (
          <div className="card">
            <div className="flex items-center justify-center py-8">
              <div className="text-discord-light-gray">检查系统状态...</div>
            </div>
          </div>
        ) : (
          <div className="card">
            <form onSubmit={handleSubmit} className="space-y-4">
              {error && (
                <div className="bg-red-500/10 border border-red-500 text-red-500 px-4 py-3 rounded text-sm">
                  {error}
                </div>
              )}

            <div>
              <label htmlFor="username" className="block text-sm font-medium text-gray-300 mb-2">
                用户名 <span className="text-red-500">*</span>
              </label>
              <input
                id="username"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="input"
                placeholder="请输入用户名"
                required
                disabled={isLoading}
                minLength={3}
                maxLength={30}
              />
            </div>

            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-300 mb-2">
                邮箱（可选）
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="input"
                placeholder="请输入邮箱"
                disabled={isLoading}
              />
            </div>

            {requiresInvite && (
              <div>
                <label htmlFor="inviteCode" className="block text-sm font-medium text-gray-300 mb-2">
                  邀请码 <span className="text-red-500">*</span>
                </label>
                <input
                  id="inviteCode"
                  type="text"
                  value={inviteCode}
                  onChange={(e) => setInviteCode(e.target.value)}
                  className="input"
                  placeholder="请输入邀请码"
                  disabled={isLoading}
                />
                <p className="text-xs text-gray-500 mt-1">
                  💡 需要向管理员获取邀请码才能注册
                </p>
              </div>
            )}

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-300 mb-2">
                密码 <span className="text-red-500">*</span>
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="input"
                placeholder="请输入密码"
                required
                disabled={isLoading}
                minLength={6}
              />
            </div>

            <div>
              <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-300 mb-2">
                确认密码 <span className="text-red-500">*</span>
              </label>
              <input
                id="confirmPassword"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="input"
                placeholder="请再次输入密码"
                required
                disabled={isLoading}
              />
            </div>

            <button
              type="submit"
              className="w-full btn btn-primary"
              disabled={isLoading}
            >
              {isLoading ? '注册中...' : '注册'}
            </button>
          </form>

          <div className="mt-4 text-center text-sm text-gray-400">
            已有账号？
            <Link to="/login" className="text-discord-blue hover:underline ml-1">
              立即登录
            </Link>
          </div>
        </div>
        )}
      </div>
    </div>
  );
}
