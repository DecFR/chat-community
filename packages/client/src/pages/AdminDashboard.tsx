import { useState, useEffect, useCallback } from 'react';
import { adminAPI, serverRequestAPI, inviteAPI } from '../lib/api';
import { useAuthStore } from '../stores/authStore';
import { useServerStore } from '../stores/serverStore';
import { socketService } from '../lib/socket';

// 错误边界组件（类组件）
import React from 'react';

type ErrorBoundaryProps = {
  children: React.ReactNode;
  fallback?: React.ReactNode;
};

type ErrorBoundaryState = {
  hasError: boolean;
  error?: Error;
};

class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('服务器申请管理组件错误:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback || (
        <div className="card">
          <div className="text-center py-12">
            <svg className="w-16 h-16 mx-auto text-red-500 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <p className="text-red-400 font-semibold mb-2">加载服务器申请时出错</p>
            <p className="text-gray-400 text-sm mb-4">{this.state.error?.message || '未知错误'}</p>
            <button
              onClick={() => window.location.reload()}
              className="px-4 py-2 bg-discord-blue hover:bg-discord-blue/90 text-white rounded transition-colors"
            >
              刷新页面
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

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

interface ServerRequest {
  id: string;
  name: string;
  description?: string;
  reason: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  requesterId: string;
  requesterName: string;
  reviewNote?: string;
  reviewedAt?: string;
  createdAt: string;
}

interface Channel {
  id: string;
  name: string;
}

export default function AdminDashboard() {
  const { user } = useAuthStore();
  const { servers, deleteServer, loadServers: loadServersFromStore } = useServerStore();
  const [activeTab, setActiveTab] = useState<'stats' | 'users' | 'invites' | 'servers' | 'requests' | 'messages' | 'maintenance'>('stats');
  const [cleanupHours, setCleanupHours] = useState<string>('24');
  const [cleanupRunning, setCleanupRunning] = useState(false);
  const [stats, setStats] = useState<Stats | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [inviteCodes, setInviteCodes] = useState<InviteCode[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  // 加载统计数据
  const loadStats = useCallback(async () => {
    try {
      setLoading(true);
      const response = await adminAPI.getStats();
      setStats(response.data.data);
    } catch (err: unknown) {
      const errorMessage = err instanceof Error && 'response' in err
        ? ((err as { response?: { data?: { error?: string } } }).response?.data?.error || '加载统计数据失败')
        : '加载统计数据失败';
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  }, []);

  // 加载用户列表
  const loadUsers = useCallback(async () => {
    try {
      setLoading(true);
      const response = await adminAPI.getUsers();
      setUsers(response.data.data);
    } catch (err: unknown) {
      const errorMessage = err instanceof Error && 'response' in err
        ? ((err as { response?: { data?: { error?: string } } }).response?.data?.error || '加载用户列表失败')
        : '加载用户列表失败';
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  }, []);

  // 加载邀请码列表
  const loadInviteCodes = useCallback(async () => {
    try {
      setLoading(true);
      const response = await adminAPI.getInviteCodes();
      setInviteCodes(response.data.data);
    } catch (err: unknown) {
      const errorMessage = err instanceof Error && 'response' in err
        ? ((err as { response?: { data?: { error?: string } } }).response?.data?.error || '加载邀请码失败')
        : '加载邀请码失败';
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  }, []);

  // 加载服务器列表 - 从 store 加载
  const loadServers = useCallback(async () => {
    try {
      setLoading(true);
      await loadServersFromStore();
    } catch (err: unknown) {
      const errorMessage = err instanceof Error && 'response' in err
        ? ((err as { response?: { data?: { error?: string } } }).response?.data?.error || '加载服务器失败')
        : '加载服务器失败';
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  }, [loadServersFromStore]);

  // 删除服务器
  const handleDeleteServer = async (serverId: string, serverName: string) => {
    if (!confirm(`确定要删除服务器 "${serverName}" 吗？\n\n此操作将删除服务器及其所有数据（频道、消息等），不可恢复！`)) return;

    try {
      await deleteServer(serverId);
      setSuccessMessage('服务器删除成功');
      // 列表会自动更新，无需手动调用 loadServers
    } catch (err: unknown) {
      const errorMessage = err instanceof Error && 'response' in err
        ? ((err as { response?: { data?: { error?: string } } }).response?.data?.error || '删除服务器失败')
        : '删除服务器失败';
      setError(errorMessage);
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
    } catch (err: unknown) {
      const errorMessage = err instanceof Error && 'response' in err
        ? ((err as { response?: { data?: { error?: string } } }).response?.data?.error || '生成邀请码失败')
        : '生成邀请码失败';
      setError(errorMessage);
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
    } catch (err: unknown) {
      const errorMessage = err instanceof Error && 'response' in err
        ? ((err as { response?: { data?: { error?: string } } }).response?.data?.error || '提升管理员失败')
        : '提升管理员失败';
      setError(errorMessage);
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
    } catch (err: unknown) {
      const errorMessage = err instanceof Error && 'response' in err
        ? ((err as { response?: { data?: { error?: string } } }).response?.data?.error || '降级用户失败')
        : '降级用户失败';
      setError(errorMessage);
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
    } catch (err: unknown) {
      const errorMessage = err instanceof Error && 'response' in err
        ? ((err as { response?: { data?: { error?: string } } }).response?.data?.error || '删除用户失败')
        : '删除用户失败';
      setError(errorMessage);
    }
  };

  // 删除邀请码
  const handleDeleteInviteCode = async (codeId: string, code: string) => {
    if (!confirm(`确定要删除邀请码 "${code}" 吗？`)) return;

    try {
      setError('');
      setSuccessMessage('');
      // 使用统一 API 客户端删除用户邀请码
      await inviteAPI.deleteUserInvite(codeId);
      setSuccessMessage('邀请码删除成功');
      loadInviteCodes();
    } catch (err: unknown) {
      const errorMessage = err instanceof Error && 'response' in err
        ? ((err as { response?: { data?: { error?: string } } }).response?.data?.error || '删除邀请码失败')
        : '删除邀请码失败';
      setError(errorMessage);
    }
  };

  // 清理所有消息
  const handleCleanAllMessages = async () => {
    if (!confirm('警告：确定要清理系统中所有消息吗？\n\n此操作会删除：\n- 所有频道消息\n- 所有私聊消息\n\n此操作不可恢复！')) return;
    
    if (!confirm('请再次确认：真的要清理所有消息吗？')) return;

    try {
      setError('');
      setSuccessMessage('');
      setLoading(true);
      const response = await adminAPI.cleanMessages();
      setSuccessMessage(`成功清理了 ${response.data.deletedCount} 条消息`);
    } catch (err: unknown) {
      const errorMessage = err instanceof Error && 'response' in err
        ? ((err as { response?: { data?: { error?: string } } }).response?.data?.error || '清理消息失败')
        : '清理消息失败';
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  // 清理指定频道的消息
  const handleCleanChannelMessages = async (channelId: string, channelName: string) => {
    if (!confirm(`确定要清理频道 "#${channelName}" 的所有消息吗？\n\n此操作不可恢复！`)) return;

    try {
      setError('');
      setSuccessMessage('');
      const response = await adminAPI.cleanMessages(channelId);
      setSuccessMessage(`成功清理了 ${response.data.deletedCount} 条消息`);
    } catch (err: unknown) {
      const errorMessage = err instanceof Error && 'response' in err
        ? ((err as { response?: { data?: { error?: string } } }).response?.data?.error || '清理消息失败')
        : '清理消息失败';
      setError(errorMessage);
    }
  };

  // 手动清理未使用头像
  const handleCleanupAvatars = async () => {
    if (!confirm('将执行一次“未使用头像文件”的清理操作，继续吗？')) return;
    try {
      setError('');
      setSuccessMessage('');
      setCleanupRunning(true);
      const h = parseFloat(cleanupHours);
      const maxAgeMs = !isNaN(h) && h > 0 ? Math.round(h * 60 * 60 * 1000) : undefined;
      const resp = await adminAPI.cleanupAvatars(maxAgeMs);
      setSuccessMessage(`头像清理完成：删除 ${resp.data.data?.removed ?? 0} 个文件`);
    } catch (err: unknown) {
      const errorMessage = err instanceof Error && 'response' in err
        ? ((err as { response?: { data?: { error?: string } } }).response?.data?.error || '头像清理失败')
        : '头像清理失败';
      setError(errorMessage);
    } finally {
      setCleanupRunning(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'stats') {
      loadStats();
    } else if (activeTab === 'users') {
      loadUsers();
    } else if (activeTab === 'invites') {
      loadInviteCodes();
    } else if (activeTab === 'servers') {
      loadServers();
    }
  }, [activeTab, loadStats, loadUsers, loadInviteCodes, loadServers]);

  // 如果不是管理员，返回空内容
  if (user?.role !== 'ADMIN') {
    return (
      <div className="flex-1 flex items-center justify-center bg-discord-dark">
        <div className="text-center">
          <div className="text-6xl mb-4">🚫</div>
          <h2 className="text-2xl font-bold mb-2">无权访问</h2>
          <p className="text-gray-400">你没有权限访问管理员面板</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col bg-discord-dark overflow-hidden">
      {/* 顶部标题栏 */}
      <div className="h-12 bg-discord-darker border-b border-discord-darkest flex items-center justify-between px-6">
        <div>
          <h1 className="text-xl font-bold">管理员仪表板</h1>
          <p className="text-sm text-gray-400">系统管理与监控</p>
        </div>
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
            onClick={() => setActiveTab('servers')}
            className={`px-4 py-3 font-medium border-b-2 transition-colors ${
              activeTab === 'servers'
                ? 'border-discord-blue text-white'
                : 'border-transparent text-gray-400 hover:text-gray-300'
            }`}
          >
            服务器管理
          </button>
          <button
            onClick={() => setActiveTab('messages')}
            className={`px-4 py-3 font-medium border-b-2 transition-colors ${
              activeTab === 'messages'
                ? 'border-discord-blue text-white'
                : 'border-transparent text-gray-400 hover:text-gray-300'
            }`}
          >
            消息管理
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
            onClick={() => setActiveTab('requests')}
            className={`px-4 py-3 font-medium border-b-2 transition-colors ${
              activeTab === 'requests'
                ? 'border-discord-blue text-white'
                : 'border-transparent text-gray-400 hover:text-gray-300'
            }`}
          >
            服务器申请
          </button>
          <button
            onClick={() => setActiveTab('maintenance')}
            className={`px-4 py-3 font-medium border-b-2 transition-colors ${
              activeTab === 'maintenance'
                ? 'border-discord-blue text-white'
                : 'border-transparent text-gray-400 hover:text-gray-300'
            }`}
          >
            维护工具
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
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold text-white">服务器列表</h3>
                  <div className="text-sm text-gray-400">
                    总计: {servers.length} 个服务器
                  </div>
                </div>

                {servers.length === 0 ? (
                  <div className="text-center py-12">
                    <svg className="w-16 h-16 mx-auto text-gray-600 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                    </svg>
                    <p className="text-gray-400">暂无服务器数据</p>
                    <p className="text-sm text-gray-500 mt-2">用户创建服务器后将在此显示</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-gray-700">
                          <th className="text-left py-3 px-4 text-sm font-semibold text-gray-400">服务器名称</th>
                          <th className="text-left py-3 px-4 text-sm font-semibold text-gray-400">所有者</th>
                          <th className="text-left py-3 px-4 text-sm font-semibold text-gray-400">成员数</th>
                          <th className="text-left py-3 px-4 text-sm font-semibold text-gray-400">频道数</th>
                          <th className="text-left py-3 px-4 text-sm font-semibold text-gray-400">创建时间</th>
                          <th className="text-right py-3 px-4 text-sm font-semibold text-gray-400">操作</th>
                        </tr>
                      </thead>
                      <tbody>
                        {servers.map((server) => (
                          <tr key={server.id} className="border-b border-gray-800 hover:bg-discord-hover transition-colors">
                            <td className="py-3 px-4">
                              <div>
                                <div className="font-medium text-white">{server.name}</div>
                                {server.description && (
                                  <div className="text-sm text-gray-400 mt-0.5">{server.description}</div>
                                )}
                              </div>
                            </td>
                            <td className="py-3 px-4 text-gray-300">
                              {server.owner?.username || '未知'}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm">
                              {server._count?.members ?? 0}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm">
                              {server._count?.channels ?? server.channels?.length ?? 0}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm">
                              {new Date(server.createdAt).toLocaleString()}
                            </td>
                            <td className="py-3 px-4 text-right">
                              <button
                                onClick={() => handleDeleteServer(server.id, server.name)}
                                className="px-3 py-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-500 rounded transition-colors text-sm font-medium"
                              >
                                删除
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {/* 消息管理 */}
            {activeTab === 'messages' && (
              <div className="card">
                <div className="mb-6">
                  <h3 className="text-lg font-semibold text-white mb-2">消息清理</h3>
                  <p className="text-sm text-gray-400">管理员可以清理系统中的消息，清理后会发送通知给相关用户</p>
                </div>

                {/* 清理所有消息 */}
                <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-6 mb-6">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <svg className="w-5 h-5 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                        </svg>
                        <h4 className="font-semibold text-red-500">清理所有消息</h4>
                      </div>
                      <p className="text-sm text-gray-400">
                        删除系统中所有频道和私聊的消息。此操作不可恢复，请谨慎使用！
                      </p>
                    </div>
                    <button
                      onClick={handleCleanAllMessages}
                      disabled={loading}
                      className="ml-4 px-4 py-2 bg-red-500 hover:bg-red-600 disabled:bg-gray-600 disabled:cursor-not-allowed text-white rounded transition-colors font-medium"
                    >
                      {loading ? '清理中...' : '清理所有消息'}
                    </button>
                  </div>
                </div>

                {/* 按频道清理 */}
                <div className="bg-discord-darker rounded-lg p-6">
                  <h4 className="font-semibold text-white mb-4">按频道清理消息</h4>
                  {servers.length === 0 ? (
                    <div className="text-center py-8 text-gray-400">
                      <svg className="w-12 h-12 mx-auto mb-3 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                      </svg>
                      <p>暂无服务器</p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {servers.map((server) => (
                        <div key={server.id} className="border border-gray-700 rounded-lg p-4">
                          <div className="font-medium text-white mb-3">{server.name}</div>
                          {server.channels && server.channels.length > 0 ? (
                            <div className="space-y-2">
                              {server.channels.map((channel: Channel) => (
                                <div key={channel.id} className="flex items-center justify-between bg-discord-hover rounded p-3">
                                  <div className="flex items-center gap-2">
                                    <span className="text-gray-400">#</span>
                                    <span className="text-gray-300">{channel.name}</span>
                                  </div>
                                  <button
                                    onClick={() => handleCleanChannelMessages(channel.id, channel.name)}
                                    className="px-3 py-1 bg-orange-500/20 hover:bg-orange-500/30 text-orange-500 rounded transition-colors text-sm"
                                  >
                                    清理消息
                                  </button>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <div className="text-sm text-gray-400 text-center py-2">此服务器暂无频道</div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* 服务器申请管理 */}
            {activeTab === 'requests' && (
              <ErrorBoundary>
                <ServerRequestsManagement />
              </ErrorBoundary>
            )}

            {/* 维护工具 */}
            {activeTab === 'maintenance' && (
              <div className="space-y-6">
                {/* 系统信息 */}
                <SystemInfoPanel />

                {/* 线程池配置 */}
                <ThreadPoolConfig />

                {/* 持久化配置 - 主要功能 */}
                <PersistentCleanupConfig />

                {/* 临时清理 - 高级功能 */}
                <div className="card border border-discord-border">
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <h3 className="text-base font-semibold text-white mb-1">临时清理（高级）</h3>
                      <p className="text-sm text-gray-400">
                        一次性手动清理，可临时覆盖阈值。不影响上方的自动清理策略。
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <label className="text-sm text-gray-300">临时阈值（小时）：</label>
                    <input
                      value={cleanupHours}
                      onChange={(e) => setCleanupHours(e.target.value)}
                      className="w-24 px-2 py-1 bg-discord-darkest rounded text-white text-sm"
                      placeholder="留空使用配置"
                      inputMode="decimal"
                    />
                    <button
                      onClick={handleCleanupAvatars}
                      disabled={cleanupRunning}
                      className="px-3 py-2 bg-discord-blue hover:bg-discord-blue/90 disabled:bg-gray-600 rounded text-white text-sm"
                    >
                      {cleanupRunning ? '清理中...' : '立即执行一次'}
                    </button>
                  </div>
                  <div className="text-xs text-gray-500 mt-3">
                    💡 提示：留空时使用上方配置的阈值；填写数字则临时覆盖（仅本次生效）。
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// 子组件：服务器申请管理
function ServerRequestsManagement() {
  const [requests, setRequests] = useState<ServerRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [processingIds, setProcessingIds] = useState<Set<string>>(new Set());

  const loadRequests = async () => {
    try {
      setLoading(true);
      setError('');
      const response = await serverRequestAPI.getPendingRequests();
      
      // 防御性数据校验：确保返回数组并过滤无效项
      const rawData: unknown = response.data.data || response.data || [];
      const validRequests = Array.isArray(rawData) 
        ? rawData.filter((req): req is ServerRequest => 
            req && 
            typeof req.id === 'string' && 
            typeof req.name === 'string' &&
            typeof req.requesterName === 'string'
          )
        : [];
      
      setRequests(validRequests);
      
      if (Array.isArray(rawData) && rawData.length > validRequests.length) {
        console.warn(`过滤了 ${rawData.length - validRequests.length} 个无效的服务器申请数据`);
      }
    } catch (err: unknown) {
      const errorMessage = err instanceof Error && 'response' in err
        ? ((err as { response?: { data?: { error?: string } } }).response?.data?.error || '加载服务器申请失败')
        : '加载服务器申请失败';
      setError(errorMessage);
      console.error('加载服务器申请失败:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRequests();

    // 监听新的服务器申请通知
    const handleNotification = (notification: { type?: string; content?: string }) => {
      try {
        const notificationType = notification?.type;
        const notificationContent = notification?.content || '';
        
        if (notificationType === 'server_request' && 
            typeof notificationContent === 'string' &&
            notificationContent.includes('新的服务器申请')) {
          loadRequests();
        }
      } catch (err) {
        console.error('处理服务器申请通知失败:', err);
      }
    };

    socketService.on('notification', handleNotification);

    return () => {
      socketService.off('notification', handleNotification);
    };
  }, []);

  const handleReview = async (requestId: string, approved: boolean, requesterName: string) => {
    // 防御性检查
    if (!requestId || typeof requestId !== 'string') {
      setError('无效的申请ID');
      return;
    }

    const action = approved ? '批准' : '拒绝';
    const displayName = requesterName || '未知用户';
    
    if (!confirm(`确定要${action}用户 "${displayName}" 的服务器申请吗？`)) return;

    try {
      setProcessingIds(prev => new Set(prev).add(requestId));
      setError('');
      setSuccessMessage('');

      let reviewNote = '';
      if (!approved) {
        reviewNote = prompt('请输入拒绝原因（可选）：') || '';
      }

      await serverRequestAPI.reviewRequest(requestId, { approved, reviewNote });
      setSuccessMessage(`已${action}该服务器申请`);
      
      // 重新加载列表
      await loadRequests();
    } catch (err: unknown) {
      const errorMsg = err instanceof Error && 'response' in err 
        ? ((err as { response?: { data?: { error?: string } } }).response?.data?.error || (err as Error).message || `${action}申请失败`)
        : `${action}申请失败`;
      setError(errorMsg);
      console.error('审核服务器申请失败:', err);
    } finally {
      setProcessingIds(prev => {
        const next = new Set(prev);
        next.delete(requestId);
        return next;
      });
    }
  };

  if (loading) {
    return (
      <div className="card">
        <h3 className="text-lg font-semibold text-white mb-4">服务器申请管理</h3>
        <div className="text-center py-12 text-gray-400">加载中...</div>
      </div>
    );
  }

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-white">服务器申请管理</h3>
        <button
          onClick={loadRequests}
          className="px-3 py-1.5 bg-discord-blue hover:bg-discord-blue/90 text-white rounded text-sm transition-colors"
        >
          刷新
        </button>
      </div>

      {error && (
        <div className="mb-4 bg-red-500/10 border border-red-500 text-red-500 px-4 py-3 rounded">
          {error}
        </div>
      )}

      {successMessage && (
        <div className="mb-4 bg-green-500/10 border border-green-500 text-green-500 px-4 py-3 rounded">
          {successMessage}
        </div>
      )}

      {requests.length === 0 ? (
        <div className="text-center py-12">
          <svg className="w-16 h-16 mx-auto text-gray-600 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          <p className="text-gray-400">暂无待审核的服务器申请</p>
          <p className="text-sm text-gray-500 mt-2">普通用户提交服务器创建申请后将在此显示</p>
        </div>
      ) : (
        <div className="space-y-4">
          {requests.map((request) => {
            // 防御性渲染：提取并校验关键字段
            const requestId = request?.id || '';
            const requestName = request?.name || '未命名服务器';
            const requesterName = request?.requesterName || '未知用户';
            const description = request?.description;
            const reason = request?.reason;
            const createdAt = request?.createdAt;
            
            // 跳过无效数据
            if (!requestId) {
              console.warn('跳过无效的服务器申请数据:', request);
              return null;
            }

            return (
              <div
                key={requestId}
                className="bg-discord-darkest rounded-lg p-4 border border-discord-border hover:border-discord-blue/50 transition-colors"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <h4 className="text-white font-semibold text-lg">{requestName}</h4>
                      <span className="px-2 py-0.5 bg-yellow-500/20 text-yellow-500 text-xs rounded">
                        待审核
                      </span>
                    </div>

                    {description && (
                      <p className="text-gray-400 text-sm mb-2">{description}</p>
                    )}

                    <div className="space-y-1 text-sm">
                      <div className="flex items-center gap-2 text-gray-400">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                        </svg>
                        <span>申请人：<span className="text-white">{requesterName}</span></span>
                      </div>

                      {createdAt && (
                        <div className="flex items-center gap-2 text-gray-400">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                          <span>申请时间：{new Date(createdAt).toLocaleString('zh-CN')}</span>
                        </div>
                      )}

                      {reason && (
                        <div className="flex items-start gap-2 text-gray-400 mt-2 bg-discord-dark rounded p-2">
                          <svg className="w-4 h-4 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                          </svg>
                          <div>
                            <div className="text-gray-500 text-xs mb-1">申请理由</div>
                            <div className="text-gray-300">{reason}</div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex gap-2 ml-4">
                    <button
                      onClick={() => handleReview(requestId, true, requesterName)}
                      disabled={processingIds.has(requestId)}
                      className="px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white rounded transition-colors font-medium"
                    >
                      ✓ 批准
                    </button>
                    <button
                      onClick={() => handleReview(requestId, false, requesterName)}
                      disabled={processingIds.has(requestId)}
                      className="px-4 py-2 bg-red-600 hover:bg-red-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white rounded transition-colors font-medium"
                    >
                      ✗ 拒绝
                    </button>
                  </div>
                </div>
              </div>
            );
          }).filter(Boolean)}
        </div>
      )}
    </div>
  );
}

// 子组件：头像清理持久化配置

function PersistentCleanupConfig() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [maxAgeHours, setMaxAgeHours] = useState<string>('');
  const [intervalHours, setIntervalHours] = useState<string>('');
  const [error, setError] = useState<string>('');
  const [savedHint, setSavedHint] = useState<string>('');

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const { data } = await adminAPI.getAvatarCleanupConfig();
        const cfg = data?.data || data; // 兼容结构
        if (!mounted) return;
        setMaxAgeHours(String(Math.round((cfg.maxAgeMs || 24 * 60 * 60 * 1000) / 3600000)));
        setIntervalHours(String(Math.round((cfg.intervalMs || 6 * 60 * 60 * 1000) / 3600000)));
      } catch (e: unknown) {
        const errorMessage = e instanceof Error && 'response' in e
        ? ((e as { response?: { data?: { error?: string } } }).response?.data?.error || '加载配置失败')
        : '加载配置失败';
        setError(errorMessage);
      } finally {
        setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const onSave = async () => {
    setError('');
    setSavedHint('');
    setSaving(true);
    try {
      const maxAgeMs = Number(maxAgeHours) * 3600000;
      const intervalMs = Number(intervalHours) * 3600000;
      const payload: Record<string, number> = {};
      if (!Number.isNaN(maxAgeMs) && maxAgeMs > 0) payload.maxAgeMs = maxAgeMs;
      if (!Number.isNaN(intervalMs) && intervalMs >= 60000) payload.intervalMs = intervalMs;
      const { data } = await adminAPI.updateAvatarCleanupConfig(payload);
      const saved = data?.data || data;
      setMaxAgeHours(String(Math.round(saved.maxAgeMs / 3600000)));
      setIntervalHours(String(Math.round(saved.intervalMs / 3600000)));
      setSavedHint('已保存并已重载服务端清理计划');
    } catch (e: unknown) {
      const errorMessage = e instanceof Error && 'response' in e
        ? ((e as { response?: { data?: { error?: string } } }).response?.data?.error || '保存失败')
        : '保存失败';
      setError(errorMessage);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="card bg-gradient-to-br from-discord-darker to-discord-dark border-2 border-emerald-600/20">
      <div className="flex items-center gap-2 mb-2">
        <svg className="w-5 h-5 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <h3 className="text-lg font-semibold text-white">自动清理策略</h3>
      </div>
      <p className="text-sm text-gray-400 mb-4">
        设置服务器的自动清理规则，持久化保存并实时生效。清理未被用户引用的头像文件（avatar-* 开头）。
      </p>

      {loading ? (
        <div className="text-gray-400">加载中...</div>
      ) : (
        <div className="space-y-4">
          <div className="bg-discord-darkest rounded-lg p-4 space-y-3">
            <div className="flex items-center gap-3">
              <div className="flex-shrink-0 w-10 h-10 rounded-full bg-emerald-600/20 flex items-center justify-center">
                <svg className="w-5 h-5 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div className="flex-1">
                <label className="text-sm font-medium text-gray-300 block mb-1">文件保留阈值</label>
                <p className="text-xs text-gray-500">文件需超过此时长才会被清理</p>
              </div>
              <div className="flex items-center gap-2">
                <input
                  value={maxAgeHours}
                  onChange={(e) => setMaxAgeHours(e.target.value)}
                  className="w-20 px-3 py-2 bg-discord-darker border border-gray-700 rounded text-white text-sm text-center"
                  placeholder="24"
                  inputMode="numeric"
                />
                <span className="text-sm text-gray-400">小时</span>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="flex-shrink-0 w-10 h-10 rounded-full bg-blue-600/20 flex items-center justify-center">
                <svg className="w-5 h-5 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
              </div>
              <div className="flex-1">
                <label className="text-sm font-medium text-gray-300 block mb-1">自动清理周期</label>
                <p className="text-xs text-gray-500">服务器多久自动执行一次清理</p>
              </div>
              <div className="flex items-center gap-2">
                <input
                  value={intervalHours}
                  onChange={(e) => setIntervalHours(e.target.value)}
                  className="w-20 px-3 py-2 bg-discord-darker border border-gray-700 rounded text-white text-sm text-center"
                  placeholder="6"
                  inputMode="numeric"
                />
                <span className="text-sm text-gray-400">小时</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3 pt-2">
            <button
              onClick={onSave}
              disabled={saving}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:bg-gray-600 rounded text-white text-sm font-medium transition-colors"
            >
              {saving ? '保存中...' : '💾 保存策略'}
            </button>
            {savedHint && (
              <div className="flex items-center gap-1 text-sm text-emerald-400">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                {savedHint}
              </div>
            )}
            {error && (
              <div className="flex items-center gap-1 text-sm text-red-400">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
                {error}
              </div>
            )}
          </div>

          <div className="text-xs text-gray-500 bg-discord-darkest rounded p-3">
            💡 <strong>说明：</strong>例如设置"阈值 24 小时，周期 6 小时"，表示服务器每隔 6 小时自动清理一次，每次删除超过 24 小时未使用的头像文件。
          </div>
        </div>
      )}
    </div>
  );
}

// 子组件：系统信息面板
function SystemInfoPanel() {
  const [loading, setLoading] = useState(true);
  const [info, setInfo] = useState<{
    cpu?: { model: string; cores: number };
    memory?: { total: number; used: number; usagePercent: number };
    platform: string;
    arch: string;
    uptime: number;
  } | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const { data } = await adminAPI.getSystemInfo();
        if (!mounted) return;
        setInfo(data?.data || data);
      } catch (e: unknown) {
        const errorMessage = e instanceof Error && 'response' in e
        ? ((e as { response?: { data?: { error?: string } } }).response?.data?.error || '加载失败')
        : '加载失败';
        setError(errorMessage);
      } finally {
        setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, []);

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  };

  const formatUptime = (seconds: number) => {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    return `${days}天 ${hours}小时 ${mins}分钟`;
  };

  return (
    <div className="card">
      <div className="flex items-center gap-2 mb-4">
        <svg className="w-5 h-5 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" />
        </svg>
        <h3 className="text-lg font-semibold text-white">服务器硬件信息</h3>
      </div>

      {loading ? (
        <div className="text-gray-400">加载中...</div>
      ) : error ? (
        <div className="text-red-400">{error}</div>
      ) : info ? (
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-discord-darkest rounded-lg p-4">
            <div className="text-sm text-gray-400 mb-1">CPU 型号</div>
            <div className="text-white font-medium">{info.cpu?.model}</div>
          </div>
          <div className="bg-discord-darkest rounded-lg p-4">
            <div className="text-sm text-gray-400 mb-1">CPU 线程数</div>
            <div className="text-white font-medium text-2xl">{info.cpu?.cores}</div>
          </div>
          <div className="bg-discord-darkest rounded-lg p-4">
            <div className="text-sm text-gray-400 mb-1">总内存</div>
            <div className="text-white font-medium">{formatBytes(info.memory?.total || 0)}</div>
          </div>
          <div className="bg-discord-darkest rounded-lg p-4">
            <div className="text-sm text-gray-400 mb-1">已用内存</div>
            <div className="text-white font-medium">{formatBytes(info.memory?.used || 0)} ({info.memory?.usagePercent}%)</div>
          </div>
          <div className="bg-discord-darkest rounded-lg p-4">
            <div className="text-sm text-gray-400 mb-1">系统平台</div>
            <div className="text-white font-medium">{info.platform} ({info.arch})</div>
          </div>
          <div className="bg-discord-darkest rounded-lg p-4">
            <div className="text-sm text-gray-400 mb-1">运行时间</div>
            <div className="text-white font-medium">{formatUptime(info.uptime || 0)}</div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

// 子组件：线程池配置
function ThreadPoolConfig() {

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [maxThreads, setMaxThreads] = useState<string>('');
  const [cpuCores, setCpuCores] = useState<number>(0);
  const [error, setError] = useState('');
  const [savedHint, setSavedHint] = useState('');
  const [warn, setWarn] = useState('');

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const [configRes, sysInfoRes] = await Promise.all([
          adminAPI.getThreadPoolConfig(),
          adminAPI.getSystemInfo(),
        ]);
        if (!mounted) return;
        const sysInfo = sysInfoRes.data?.data || sysInfoRes.data;
        const cores = sysInfo?.cpu?.cores || 1;
        setCpuCores(cores);
        // 默认值为线程数一半，最少1
        const defaultThreads = Math.max(1, Math.ceil(cores / 2));
        const cfg = configRes.data?.data || configRes.data;
        // 如果数据库配置大于线程数一半，强制限制
        let showThreads = cfg.maxThreads;
        if (showThreads > cores * 2) showThreads = cores * 2;
        if (!showThreads || showThreads === cores) showThreads = defaultThreads;
        setMaxThreads(String(showThreads));
      } catch (e: unknown) {
        const errorMessage = e instanceof Error && 'response' in e
        ? ((e as { response?: { data?: { error?: string } } }).response?.data?.error || '加载失败')
        : '加载失败';
        setError(errorMessage);
      } finally {
        setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, []);

  const onSave = async () => {
    setError('');
    setSavedHint('');
    setSaving(true);
    try {
      const threads = Number(maxThreads);
      if (Number.isNaN(threads) || threads < 1) {
        setError('线程数必须是大于 0 的整数');
        return;
      }
      const { data } = await adminAPI.updateThreadPoolConfig({ maxThreads: threads });
      const saved = data?.data || data;
      setMaxThreads(String(saved.maxThreads));
      setSavedHint('已保存线程池配置');
    } catch (e: unknown) {
      const errorMessage = e instanceof Error && 'response' in e
        ? ((e as { response?: { data?: { error?: string } } }).response?.data?.error || '保存失败')
        : '保存失败';
      setError(errorMessage);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="card border-2 border-blue-600/20">
      <div className="flex items-center gap-2 mb-2">
        <svg className="w-5 h-5 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
        </svg>
        <h3 className="text-lg font-semibold text-white">线程池配置</h3>
      </div>
      <p className="text-sm text-gray-400 mb-4">
        设置服务器最大可用线程数。当前 CPU 线程数：<strong className="text-blue-400">{cpuCores}</strong>
      </p>

      {loading ? (
        <div className="text-gray-400">加载中...</div>
      ) : (
        <div className="space-y-4">
          <div className="bg-discord-darkest rounded-lg p-4">
            <div className="flex items-center gap-3">
              <div className="flex-shrink-0 w-10 h-10 rounded-full bg-blue-600/20 flex items-center justify-center">
                <svg className="w-5 h-5 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              </div>
              <div className="flex-1">
                <label className="text-sm font-medium text-gray-300 block mb-1">最大线程数</label>
                <p className="text-xs text-gray-500">建议不超过 CPU 线程数的一半</p>
              </div>
              <div className="flex items-center gap-2">
                <input
                  value={maxThreads}
                  onChange={e => {
                    let val = e.target.value.replace(/[^\d]/g, '');
                    if (!val) val = '1';
                    let num = Number(val);
                    const maxAllowed = cpuCores > 0 ? Math.max(1, Math.ceil(cpuCores / 2)) : 1;
                    if (num > maxAllowed) {
                      num = maxAllowed;
                      setWarn(`最大不能超过 CPU 线程数的一半（${maxAllowed}）`);
                    } else {
                      setWarn('');
                    }
                    setMaxThreads(String(num));
                  }}
                  className={`w-20 px-3 py-2 bg-discord-darker border ${warn ? 'border-yellow-500' : 'border-gray-700'} rounded text-white text-sm text-center`}
                  placeholder={cpuCores > 0 ? String(Math.max(1, Math.ceil(cpuCores / 2))) : '1'}
                  inputMode="numeric"
                  min={1}
                  max={cpuCores > 0 ? Math.max(1, Math.ceil(cpuCores / 2)) : 1}
                />
                <span className="text-sm text-gray-400">线程</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={onSave}
              disabled={saving}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 rounded text-white text-sm font-medium transition-colors"
            >
              {saving ? '保存中...' : '💾 保存配置'}
            </button>
            {savedHint && (
              <div className="flex items-center gap-1 text-sm text-blue-400">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                {savedHint}
              </div>
            )}
            {error && (
              <div className="flex items-center gap-1 text-sm text-red-400">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
                {error}
              </div>
            )}
            {warn && !error && (
              <div className="flex items-center gap-1 text-sm text-yellow-400">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                {warn}
              </div>
            )}
          </div>

          <div className="text-xs text-gray-500 bg-discord-darkest rounded p-3">
            💡 <strong>提示：</strong>线程数过高可能导致 CPU 上下文切换频繁降低性能，建议根据实际负载调整。
          </div>
        </div>
      )}
    </div>
  );
}