import { useState, useEffect } from 'react';
import { adminAPI } from '../lib/api';
import { useAuthStore } from '../stores/authStore';

interface Stats {
  totalUsers: number;
  totalServers: number;
  totalMessages: number;
  onlineUsers: number;
}

interface User {
  id: string;
  username: string;
  email?: string;
  role: 'ADMIN' | 'USER';
  createdAt: string;
}

interface InviteCode {
  id: string;
  code: string;
  userId: string;
  user: { username: string };
  expiresAt: string;
  createdAt: string;
}

export default function AdminDashboard() {
  const { user } = useAuthStore();
  const [activeTab, setActiveTab] = useState<'stats' | 'users' | 'invites' | 'servers'>('stats');
  const [stats, setStats] = useState<Stats | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [inviteCodes, setInviteCodes] = useState<InviteCode[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  // 加载统计数据
  const loadStats = async () => {
    try {
      setLoading(true);
      const response = await adminAPI.getStats();
      setStats(response.data.data);
    } catch (err: any) {
      setError(err.response?.data?.error || '加载统计数据失败');
    } finally {
      setLoading(false);
    }
  };

  // 加载用户列表
  const loadUsers = async () => {
    try {
      setLoading(true);
      const response = await adminAPI.getUsers();
      setUsers(response.data.data);
    } catch (err: any) {
      setError(err.response?.data?.error || '加载用户列表失败');
    } finally {
      setLoading(false);
    }
  };

  // 加载邀请码列表
  const loadInviteCodes = async () => {
    try {
      setLoading(true);
      const response = await adminAPI.getInviteCodes();
      setInviteCodes(response.data.data);
    } catch (err: any) {
      setError(err.response?.data?.error || '加载邀请码列表失败');
    } finally {
      setLoading(false);
    }
  };

  // 生成邀请码
  const handleGenerateInvite = async (userId?: string) => {
    try {
      setError('');
      setSuccessMessage('');
      await adminAPI.generateInviteCode(userId, 7); // 默认7天有效期
      setSuccessMessage('邀请码生成成功');
      loadInviteCodes();
    } catch (err: any) {
      setError(err.response?.data?.error || '生成邀请码失败');
    }
  };

  // 提升为管理员
  const handlePromoteToAdmin = async (userId: string, username: string) => {
    if (!confirm(`确定要将用户 "${username}" 提升为管理员吗？\n\n管理员将拥有系统最高权限，包括：\n- 管理所有用户\n- 删除任何数据\n- 生成邀请码\n\n请谨慎操作！`)) return;

    try {
      setError('');
      setSuccessMessage('');
      await adminAPI.updateUserRole(userId, 'ADMIN');
      setSuccessMessage(`用户 "${username}" 已提升为管理员`);
      loadUsers();
    } catch (err: any) {
      setError(err.response?.data?.error || '提升管理员失败');
    }
  };

  // 降级为普通用户
  const handleDemoteToUser = async (userId: string, username: string) => {
    if (!confirm(`确定要将管理员 "${username}" 降级为普通用户吗？\n\n该用户将失去所有管理员权限。`)) return;

    try {
      setError('');
      setSuccessMessage('');
      await adminAPI.updateUserRole(userId, 'USER');
      setSuccessMessage(`管理员 "${username}" 已降级为普通用户`);
      loadUsers();
    } catch (err: any) {
      setError(err.response?.data?.error || '降级用户失败');
    }
  };

  // 删除用户
  const handleDeleteUser = async (userId: string, username: string) => {
    if (!confirm(`确定要删除用户 "${username}" 吗？此操作不可撤销！`)) return;

    try {
      setError('');
      setSuccessMessage('');
      await adminAPI.deleteUser(userId);
      setSuccessMessage('用户删除成功');
      loadUsers();
    } catch (err: any) {
      setError(err.response?.data?.error || '删除用户失败');
    }
  };

  // 删除邀请码
  const handleDeleteInviteCode = async (codeId: string, code: string) => {
    if (!confirm(`确定要删除邀请码 "${code}" 吗？`)) return;

    try {
      setError('');
      setSuccessMessage('');
      // 使用用户邀请码删除接口
      await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:3000/api'}/invites/user/${codeId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
        },
      });
      setSuccessMessage('邀请码删除成功');
      loadInviteCodes();
    } catch (err: any) {
      setError(err.response?.data?.error || '删除邀请码失败');
    }
  };

  useEffect(() => {
    if (activeTab === 'stats') {
      loadStats();
    } else if (activeTab === 'users') {
      loadUsers();
    } else if (activeTab === 'invites') {
      loadInviteCodes();
    }
  }, [activeTab]);

  // 检查是否是管理员
  if (user?.role !== 'ADMIN') {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-white mb-2">访问被拒绝</h2>
          <p className="text-gray-400">您没有权限访问管理员仪表板</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-discord-dark">
      {/* 头部 */}
      <div className="bg-discord-darker border-b border-discord-border px-6 py-4">
        <h1 className="text-2xl font-bold text-white">管理员仪表板</h1>
        <p className="text-sm text-gray-400 mt-1">系统管理与监控</p>
      </div>

      {/* 标签页导航 */}
      <div className="bg-discord-darker border-b border-discord-border px-6">
        <div className="flex space-x-4">
          <button
            onClick={() => setActiveTab('stats')}
            className={`px-4 py-3 font-medium border-b-2 transition-colors ${
              activeTab === 'stats'
                ? 'border-discord-blue text-white'
                : 'border-transparent text-gray-400 hover:text-gray-300'
            }`}
          >
            系统统计
          </button>
          <button
            onClick={() => setActiveTab('users')}
            className={`px-4 py-3 font-medium border-b-2 transition-colors ${
              activeTab === 'users'
                ? 'border-discord-blue text-white'
                : 'border-transparent text-gray-400 hover:text-gray-300'
            }`}
          >
            用户管理
          </button>
          <button
            onClick={() => setActiveTab('invites')}
            className={`px-4 py-3 font-medium border-b-2 transition-colors ${
              activeTab === 'invites'
                ? 'border-discord-blue text-white'
                : 'border-transparent text-gray-400 hover:text-gray-300'
            }`}
          >
            邀请码管理
          </button>
          <button
            onClick={() => setActiveTab('servers')}
            className={`px-4 py-3 font-medium border-b-2 transition-colors ${
              activeTab === 'servers'
                ? 'border-discord-blue text-white'
                : 'border-transparent text-gray-400 hover:text-gray-300'
            }`}
          >
            服务器管理
          </button>
        </div>
      </div>

      {/* 消息提示 */}
      {error && (
        <div className="mx-6 mt-4 bg-red-500/10 border border-red-500 text-red-500 px-4 py-3 rounded">
          {error}
        </div>
      )}
      {successMessage && (
        <div className="mx-6 mt-4 bg-green-500/10 border border-green-500 text-green-500 px-4 py-3 rounded">
          {successMessage}
        </div>
      )}

      {/* 内容区域 */}
      <div className="flex-1 overflow-y-auto p-6">
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-gray-400">加载中...</div>
          </div>
        ) : (
          <>
            {/* 系统统计 */}
            {activeTab === 'stats' && stats && (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="card">
                  <div className="text-sm text-gray-400 mb-1">总用户数</div>
                  <div className="text-3xl font-bold text-white">{stats.totalUsers}</div>
                </div>
                <div className="card">
                  <div className="text-sm text-gray-400 mb-1">总服务器数</div>
                  <div className="text-3xl font-bold text-white">{stats.totalServers}</div>
                </div>
                <div className="card">
                  <div className="text-sm text-gray-400 mb-1">总消息数</div>
                  <div className="text-3xl font-bold text-white">{stats.totalMessages}</div>
                </div>
                <div className="card">
                  <div className="text-sm text-gray-400 mb-1">在线用户</div>
                  <div className="text-3xl font-bold text-discord-green">{stats.onlineUsers}</div>
                </div>
              </div>
            )}

            {/* 用户管理 */}
            {activeTab === 'users' && (
              <div className="card">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-discord-border">
                        <th className="text-left py-3 px-4 text-sm font-medium text-gray-400">用户名</th>
                        <th className="text-left py-3 px-4 text-sm font-medium text-gray-400">邮箱</th>
                        <th className="text-left py-3 px-4 text-sm font-medium text-gray-400">角色</th>
                        <th className="text-left py-3 px-4 text-sm font-medium text-gray-400">注册时间</th>
                        <th className="text-left py-3 px-4 text-sm font-medium text-gray-400">操作</th>
                      </tr>
                    </thead>
                    <tbody>
                      {users.map((u) => (
                        <tr key={u.id} className="border-b border-discord-border hover:bg-discord-hover">
                          <td className="py-3 px-4 text-white">{u.username}</td>
                          <td className="py-3 px-4 text-gray-400">{u.email || '-'}</td>
                          <td className="py-3 px-4">
                            <span
                              className={`px-2 py-1 rounded text-xs font-medium ${
                                u.role === 'ADMIN'
                                  ? 'bg-discord-red/20 text-discord-red'
                                  : 'bg-discord-blue/20 text-discord-blue'
                              }`}
                            >
                              {u.role}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-gray-400">
                            {new Date(u.createdAt).toLocaleDateString('zh-CN')}
                          </td>
                          <td className="py-3 px-4">
                            <div className="flex space-x-2">
                              {u.id === user?.id ? (
                                <span className="text-xs text-gray-500 italic">当前账号</span>
                              ) : (
                                <>
                                  {u.role === 'USER' ? (
                                    <button
                                      onClick={() => handlePromoteToAdmin(u.id, u.username)}
                                      className="px-3 py-1 bg-orange-600 hover:bg-orange-700 text-white text-sm rounded transition-colors"
                                      title="提升为管理员"
                                    >
                                      提升管理员
                                    </button>
                                  ) : (
                                    <button
                                      onClick={() => handleDemoteToUser(u.id, u.username)}
                                      className="px-3 py-1 bg-yellow-600 hover:bg-yellow-700 text-white text-sm rounded transition-colors"
                                      title="降级为普通用户"
                                    >
                                      降级用户
                                    </button>
                                  )}
                                  <button
                                    onClick={() => handleDeleteUser(u.id, u.username)}
                                    className="px-3 py-1 bg-discord-red hover:bg-red-600 text-white text-sm rounded transition-colors"
                                    title="删除用户"
                                  >
                                    删除
                                  </button>
                                </>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {users.length === 0 && (
                    <div className="text-center py-8 text-gray-400">暂无用户数据</div>
                  )}
                </div>
              </div>
            )}

            {/* 邀请码管理 */}
            {activeTab === 'invites' && (
              <div className="space-y-4">
                <div className="card">
                  <button
                    onClick={() => handleGenerateInvite()}
                    className="btn btn-primary"
                  >
                    生成新邀请码（7天有效期）
                  </button>
                </div>

                <div className="card">
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-discord-border">
                          <th className="text-left py-3 px-4 text-sm font-medium text-gray-400">邀请码</th>
                          <th className="text-left py-3 px-4 text-sm font-medium text-gray-400">创建者</th>
                          <th className="text-left py-3 px-4 text-sm font-medium text-gray-400">创建时间</th>
                          <th className="text-left py-3 px-4 text-sm font-medium text-gray-400">过期时间</th>
                          <th className="text-left py-3 px-4 text-sm font-medium text-gray-400">状态</th>
                          <th className="text-left py-3 px-4 text-sm font-medium text-gray-400">操作</th>
                        </tr>
                      </thead>
                      <tbody>
                        {inviteCodes.map((invite) => {
                          const isExpired = new Date(invite.expiresAt) < new Date();
                          return (
                            <tr key={invite.id} className="border-b border-discord-border hover:bg-discord-hover">
                              <td className="py-3 px-4 font-mono text-white">{invite.code}</td>
                              <td className="py-3 px-4 text-gray-400">{invite.user.username}</td>
                              <td className="py-3 px-4 text-gray-400">
                                {new Date(invite.createdAt).toLocaleString('zh-CN')}
                              </td>
                              <td className="py-3 px-4 text-gray-400">
                                {new Date(invite.expiresAt).toLocaleString('zh-CN')}
                              </td>
                              <td className="py-3 px-4">
                                <span
                                  className={`px-2 py-1 rounded text-xs font-medium ${
                                    isExpired
                                      ? 'bg-gray-500/20 text-gray-400'
                                      : 'bg-green-500/20 text-green-500'
                                  }`}
                                >
                                  {isExpired ? '已过期' : '有效'}
                                </span>
                              </td>
                              <td className="py-3 px-4">
                                <button
                                  onClick={() => handleDeleteInviteCode(invite.id, invite.code)}
                                  className="px-3 py-1 bg-discord-red hover:bg-red-600 text-white text-sm rounded transition-colors"
                                >
                                  删除
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                    {inviteCodes.length === 0 && (
                      <div className="text-center py-8 text-gray-400">暂无邀请码数据</div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* 服务器管理 */}
            {activeTab === 'servers' && (
              <div className="card">
                <div className="text-center py-12">
                  <svg className="w-16 h-16 mx-auto text-gray-600 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                  </svg>
                  <h3 className="text-xl font-semibold text-white mb-2">服务器管理</h3>
                  <p className="text-gray-400">暂无服务器数据</p>
                  <p className="text-sm text-gray-500 mt-2">用户创建服务器后将在此显示</p>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
