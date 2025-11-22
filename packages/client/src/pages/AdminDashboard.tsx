import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { adminAPI, serverRequestAPI, inviteAPI } from '../lib/api';
import { useAuthStore } from '../stores/authStore';
import { useServerStore } from '../stores/serverStore';
import { socketService } from '../lib/socket';

// ---------------------- 错误边界组件 ----------------------
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
    console.error('组件错误:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback || (
        <div className="card">
          <div className="text-center py-12">
            <p className="text-red-400 font-semibold mb-2">加载组件时出错</p>
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

// ---------------------- 类型定义 ----------------------
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

interface SystemInfoData {
  cpu?: { cores: number; model: string };
  memory?: { total: number; used: number; usagePercent: number };
  platform?: string;
  arch?: string;
  uptime?: number;
}

// ---------------------- 主组件 ----------------------
export default function AdminDashboard() {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const { servers, deleteServer, loadServers: loadServersFromStore } = useServerStore();
  
  // Tab 类型定义
  type TabType = 'stats' | 'users' | 'invites' | 'servers' | 'requests' | 'messages' | 'maintenance';
  const [activeTab, setActiveTab] = useState<TabType>('stats');
  
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
      console.error(err);
      setError('加载统计数据失败');
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
      console.error(err);
      setError('加载用户列表失败');
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
      console.error(err);
      setError('加载邀请码失败');
    } finally {
      setLoading(false);
    }
  }, []);

  // 加载服务器列表
  const loadServers = useCallback(async () => {
    try {
      setLoading(true);
      await loadServersFromStore();
    } catch (err: unknown) {
      console.error(err);
      setError('加载服务器失败');
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
    } catch (err: unknown) {
      console.error(err);
      setError('删除服务器失败');
    }
  };

  // 生成邀请码
  const handleGenerateInvite = async (userId?: string) => {
    try {
      setError('');
      setSuccessMessage('');
      await adminAPI.generateInviteCode(userId, 7);
      setSuccessMessage('邀请码生成成功');
      loadInviteCodes();
    } catch (err: unknown) {
      console.error(err);
      setError('生成邀请码失败');
    }
  };

  // 提升为管理员
  const handlePromoteToAdmin = async (userId: string, username: string) => {
    if (!confirm(`确定要将用户 "${username}" 提升为管理员吗？\n\n请谨慎操作！`)) return;
    try {
      setError('');
      setSuccessMessage('');
      await adminAPI.updateUserRole(userId, 'ADMIN');
      setSuccessMessage(`用户 "${username}" 已提升为管理员`);
      loadUsers();
    } catch (err: unknown) {
      console.error(err);
      setError('提升管理员失败');
    }
  };

  // 降级为普通用户
  const handleDemoteToUser = async (userId: string, username: string) => {
    if (!confirm(`确定要将管理员 "${username}" 降级为普通用户吗？`)) return;
    try {
      setError('');
      setSuccessMessage('');
      await adminAPI.updateUserRole(userId, 'USER');
      setSuccessMessage(`管理员 "${username}" 已降级为普通用户`);
      loadUsers();
    } catch (err: unknown) {
      console.error(err);
      setError('降级用户失败');
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
      console.error(err);
      setError('删除用户失败');
    }
  };

  // 删除邀请码
  const handleDeleteInviteCode = async (codeId: string, code: string) => {
    if (!confirm(`确定要删除邀请码 "${code}" 吗？`)) return;
    try {
      setError('');
      setSuccessMessage('');
      await inviteAPI.deleteUserInvite(codeId);
      setSuccessMessage('邀请码删除成功');
      loadInviteCodes();
    } catch (err: unknown) {
      console.error(err);
      setError('删除邀请码失败');
    }
  };

  // 清理所有消息
  const handleCleanAllMessages = async () => {
    if (!confirm('警告：确定要清理系统中所有消息吗？\n\n此操作不可恢复！')) return;
    if (!confirm('请再次确认：真的要清理所有消息吗？')) return;

    try {
      setError('');
      setSuccessMessage('');
      setLoading(true);
      const response = await adminAPI.cleanMessages();
      setSuccessMessage(`成功清理了 ${response.data.deletedCount} 条消息`);
    } catch (err: unknown) {
      console.error(err);
      setError('清理消息失败');
    } finally {
      setLoading(false);
    }
  };

  // 清理指定频道的消息
  const handleCleanChannelMessages = async (channelId: string, channelName: string) => {
    if (!confirm(`确定要清理频道 "#${channelName}" 的所有消息吗？`)) return;
    try {
      setError('');
      setSuccessMessage('');
      const response = await adminAPI.cleanMessages(channelId);
      setSuccessMessage(`成功清理了 ${response.data.deletedCount} 条消息`);
    } catch (err: unknown) {
      console.error(err);
      setError('清理消息失败');
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
      console.error(err);
      setError('头像清理失败');
    } finally {
      setCleanupRunning(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'stats') loadStats();
    else if (activeTab === 'users') loadUsers();
    else if (activeTab === 'invites') loadInviteCodes();
    else if (activeTab === 'servers') loadServers();
  }, [activeTab, loadStats, loadUsers, loadInviteCodes, loadServers]);

  // 如果不是管理员
  if (user?.role !== 'ADMIN') {
    return (
      <div className="flex-1 flex items-center justify-center bg-discord-dark">
        <div className="text-center">
          <div className="text-6xl mb-4">🚫</div>
          <h2 className="text-2xl font-bold mb-2 text-white">无权访问</h2>
          <p className="text-gray-400">你没有权限访问管理员面板</p>
          <button onClick={() => navigate('/app')} className="mt-4 text-discord-blue hover:underline">返回首页</button>
        </div>
      </div>
    );
  }

  // ---------------------- 渲染主界面 ----------------------
  return (
    <div className="flex-1 flex flex-col bg-discord-dark overflow-hidden h-full">
      {/* 顶部标题栏 */}
      <div className="h-14 shrink-0 bg-discord-darker border-b border-discord-darkest flex items-center justify-between px-4">
        <div className="flex items-center gap-3">
          {/* 移动端返回按钮 */}
          <button 
            onClick={() => navigate('/app')} 
            className="md:hidden p-2 -ml-2 rounded hover:bg-discord-gray text-gray-300"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <div>
            <h1 className="text-lg font-bold text-white">管理员控制台</h1>
            <p className="text-xs text-gray-400 hidden sm:block">系统管理与监控</p>
          </div>
        </div>
      </div>

      {/* 标签页导航 */}
      <div className="bg-discord-darker border-b border-discord-border px-2 md:px-6 shrink-0">
        <div className="flex overflow-x-auto hide-scrollbar space-x-2 md:space-x-4 pb-0.5">
          {[
            { id: 'stats', label: '统计' },
            { id: 'users', label: '用户' },
            { id: 'servers', label: '服务器' },
            { id: 'messages', label: '消息' },
            { id: 'invites', label: '邀请码' },
            { id: 'requests', label: '申请' },
            { id: 'maintenance', label: '维护' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as TabType)}
              className={`px-3 py-3 whitespace-nowrap font-medium border-b-2 transition-colors text-sm ${
                activeTab === tab.id
                  ? 'border-discord-blue text-white'
                  : 'border-transparent text-gray-400 hover:text-gray-300'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* 消息提示 */}
      {(error || successMessage) && (
        <div className="px-4 mt-4 shrink-0">
          {error && (
            <div className="bg-red-500/10 border border-red-500 text-red-500 px-4 py-2 rounded text-sm break-words">
              {error}
            </div>
          )}
          {successMessage && (
            <div className="bg-green-500/10 border border-green-500 text-green-500 px-4 py-2 rounded text-sm break-words">
              {successMessage}
            </div>
          )}
        </div>
      )}

      {/* 内容区域 */}
      <div className="flex-1 overflow-y-auto p-4 md:p-6 pb-20">
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-gray-400">加载中...</div>
          </div>
        ) : (
          <div className="max-w-7xl mx-auto space-y-6">
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
              <div className="card overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full whitespace-nowrap">
                    <thead>
                      <tr className="border-b border-discord-border text-left">
                        <th className="p-3 text-sm font-medium text-gray-400">用户</th>
                        <th className="p-3 text-sm font-medium text-gray-400">角色</th>
                        <th className="p-3 text-sm font-medium text-gray-400">注册时间</th>
                        <th className="p-3 text-sm font-medium text-gray-400">操作</th>
                      </tr>
                    </thead>
                    <tbody>
                      {users.map((u) => (
                        <tr key={u.id} className="border-b border-discord-border hover:bg-discord-hover">
                          <td className="p-3">
                            <div className="text-white font-medium">{u.username}</div>
                            <div className="text-xs text-gray-500">{u.email || '-'}</div>
                          </td>
                          <td className="p-3">
                            <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                                u.role === 'ADMIN' ? 'bg-red-500/20 text-red-400' : 'bg-blue-500/20 text-blue-400'
                              }`}>
                              {u.role}
                            </span>
                          </td>
                          <td className="p-3 text-gray-400 text-sm">
                            {new Date(u.createdAt).toLocaleDateString('zh-CN')}
                          </td>
                          <td className="p-3">
                            <div className="flex gap-2">
                              {u.id === user?.id ? (
                                <span className="text-xs text-gray-500 italic">本人</span>
                              ) : (
                                <>
                                  {u.role === 'USER' ? (
                                    <button onClick={() => handlePromoteToAdmin(u.id, u.username)} className="text-orange-400 hover:text-orange-300 text-xs font-medium">提权</button>
                                  ) : (
                                    <button onClick={() => handleDemoteToUser(u.id, u.username)} className="text-yellow-400 hover:text-yellow-300 text-xs font-medium">降权</button>
                                  )}
                                  <button onClick={() => handleDeleteUser(u.id, u.username)} className="text-red-400 hover:text-red-300 text-xs font-medium">删除</button>
                                </>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* 邀请码管理 */}
            {activeTab === 'invites' && (
              <div className="space-y-4">
                <div className="card">
                  <button onClick={() => handleGenerateInvite()} className="w-full md:w-auto btn btn-primary">
                    生成新邀请码（7天）
                  </button>
                </div>
                <div className="card overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full whitespace-nowrap">
                      <thead>
                        <tr className="border-b border-discord-border text-left text-sm text-gray-400">
                          <th className="p-3">邀请码</th>
                          <th className="p-3">创建者</th>
                          <th className="p-3">状态</th>
                          <th className="p-3">操作</th>
                        </tr>
                      </thead>
                      <tbody>
                        {inviteCodes.map((invite) => {
                          const isExpired = new Date(invite.expiresAt) < new Date();
                          return (
                            <tr key={invite.id} className="border-b border-discord-border hover:bg-discord-hover">
                              <td className="p-3 text-white font-mono">{invite.code}</td>
                              <td className="p-3 text-gray-400 text-sm">{invite.user.username}</td>
                              <td className="p-3">
                                <span className={`px-2 py-0.5 rounded text-xs ${isExpired ? 'bg-gray-500/20 text-gray-400' : 'bg-green-500/20 text-green-500'}`}>
                                  {isExpired ? '已过期' : '有效'}
                                </span>
                              </td>
                              <td className="p-3">
                                <button onClick={() => handleDeleteInviteCode(invite.id, invite.code)} className="text-red-400 text-xs hover:underline">删除</button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {/* 服务器管理 */}
            {activeTab === 'servers' && (
              <div className="card overflow-hidden">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold text-white">服务器列表</h3>
                  <div className="text-sm text-gray-400">总计: {servers.length}</div>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full whitespace-nowrap">
                    <thead>
                      <tr className="border-b border-gray-700 text-left text-sm text-gray-400">
                        <th className="p-3">名称</th>
                        <th className="p-3">所有者</th>
                        <th className="p-3">成员</th>
                        <th className="p-3 text-right">操作</th>
                      </tr>
                    </thead>
                    <tbody>
                      {servers.map((server) => (
                        <tr key={server.id} className="border-b border-gray-800 hover:bg-discord-hover">
                          <td className="p-3">
                            <div className="text-white font-medium">{server.name}</div>
                          </td>
                          <td className="p-3 text-gray-300 text-sm">{server.owner?.username || '未知'}</td>
                          <td className="p-3 text-gray-400 text-sm">{server._count?.members ?? 0}</td>
                          <td className="p-3 text-right">
                            <button
                              onClick={() => handleDeleteServer(server.id, server.name)}
                              className="text-red-500 text-xs hover:underline"
                            >
                              删除
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* 消息管理 */}
            {activeTab === 'messages' && (
              <div className="space-y-4">
                <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4">
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <svg className="w-5 h-5 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                        <h4 className="font-semibold text-red-500">清理所有消息</h4>
                      </div>
                      <p className="text-sm text-gray-400">删除系统中所有频道和私聊消息，不可恢复。</p>
                    </div>
                    <button
                      onClick={handleCleanAllMessages}
                      disabled={loading}
                      className="w-full md:w-auto px-4 py-2 bg-red-500 hover:bg-red-600 disabled:bg-gray-600 text-white rounded font-medium text-sm"
                    >
                      {loading ? '清理中...' : '清理所有'}
                    </button>
                  </div>
                </div>

                <div className="bg-discord-darker rounded-lg p-4">
                  <h4 className="font-semibold text-white mb-4">按频道清理</h4>
                  <div className="space-y-3">
                    {servers.map((server) => (
                      <div key={server.id} className="border border-gray-700 rounded-lg p-3">
                        <div className="font-medium text-white mb-2">{server.name}</div>
                        {server.channels && server.channels.length > 0 ? (
                          <div className="space-y-1">
                            {server.channels.map((channel: Channel) => (
                              <div key={channel.id} className="flex items-center justify-between bg-discord-hover rounded p-2">
                                <span className="text-gray-300 text-sm"># {channel.name}</span>
                                <button
                                  onClick={() => handleCleanChannelMessages(channel.id, channel.name)}
                                  className="px-2 py-1 bg-orange-500/20 hover:bg-orange-500/30 text-orange-500 rounded text-xs"
                                >
                                  清理
                                </button>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="text-sm text-gray-500">无频道</div>
                        )}
                      </div>
                    ))}
                  </div>
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
                <SystemInfoPanel />
                <ThreadPoolConfig />
                <PersistentCleanupConfig />

                <div className="card border border-discord-border">
                  <h3 className="text-base font-semibold text-white mb-1">临时清理 (一次性)</h3>
                  <div className="flex flex-col md:flex-row gap-3 mt-3">
                    <div className="flex items-center gap-2">
                       <label className="text-sm text-gray-300 whitespace-nowrap">阈值(h):</label>
                       <input
                         value={cleanupHours}
                         onChange={(e) => setCleanupHours(e.target.value)}
                         className="flex-1 w-full md:w-24 px-2 py-1 bg-discord-darkest rounded text-white text-sm"
                         placeholder="24"
                         inputMode="decimal"
                       />
                    </div>
                    <button
                      onClick={handleCleanupAvatars}
                      disabled={cleanupRunning}
                      className="flex-1 md:flex-none px-3 py-2 bg-discord-blue hover:bg-discord-blue/90 disabled:bg-gray-600 rounded text-white text-sm"
                    >
                      {cleanupRunning ? '清理中...' : '立即执行'}
                    </button>
                  </div>
                  <div className="text-xs text-gray-500 mt-2">不影响已保存的自动策略，仅本次生效。</div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------- 子组件实现 ----------------------

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
      const rawData: unknown = response.data.data || response.data || [];
      const validRequests = Array.isArray(rawData) 
        ? rawData.filter((req): req is ServerRequest => 
            req && typeof req.id === 'string' && typeof req.name === 'string'
          )
        : [];
      setRequests(validRequests);
    } catch (err: unknown) {
      console.error(err);
      setError('加载服务器申请失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRequests();
    const handleNotification = (notification: { type?: string; content?: string }) => {
      if (notification?.type === 'server_request') loadRequests();
    };
    socketService.on('notification', handleNotification);
    return () => {
      socketService.off('notification', handleNotification);
    };
  }, []);

  const handleReview = async (requestId: string, approved: boolean, requesterName: string) => {
    const action = approved ? '批准' : '拒绝';
    if (!confirm(`确定要${action}用户 "${requesterName}" 的申请吗？`)) return;

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
      await loadRequests();
    } catch (err: unknown) {
      console.error(err);
      setError(`${action}申请失败`);
    } finally {
      setProcessingIds(prev => {
        const next = new Set(prev);
        next.delete(requestId);
        return next;
      });
    }
  };

  if (loading) return <div className="card text-gray-400 text-center py-8">加载中...</div>;

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-white">服务器申请</h3>
        <button onClick={loadRequests} className="px-3 py-1 bg-discord-blue rounded text-sm text-white">刷新</button>
      </div>

      {error && <div className="text-red-500 mb-2 text-sm">{error}</div>}
      {successMessage && <div className="text-green-500 mb-2 text-sm">{successMessage}</div>}

      {requests.length === 0 ? (
        <div className="text-center py-8 text-gray-400">暂无待审核申请</div>
      ) : (
        <div className="space-y-4">
          {requests.map((request) => (
            <div key={request.id} className="bg-discord-darkest rounded-lg p-4 border border-discord-border">
              <div className="flex flex-col md:flex-row justify-between gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <h4 className="text-white font-semibold text-lg">{request.name}</h4>
                    <span className="px-2 py-0.5 bg-yellow-500/20 text-yellow-500 text-xs rounded">待审核</span>
                  </div>
                  {request.description && <p className="text-gray-400 text-sm mb-2">{request.description}</p>}
                  <div className="text-sm text-gray-500">申请人: <span className="text-gray-300">{request.requesterName}</span></div>
                  <div className="mt-2 bg-discord-dark p-2 rounded text-sm text-gray-300">
                    <span className="text-gray-500 block text-xs mb-1">理由:</span>
                    {request.reason}
                  </div>
                </div>
                <div className="flex gap-2 self-start md:self-center shrink-0">
                  <button
                    onClick={() => handleReview(request.id, true, request.requesterName)}
                    disabled={processingIds.has(request.id)}
                    className="px-3 py-1.5 bg-green-600 rounded text-white text-sm"
                  >
                    批准
                  </button>
                  <button
                    onClick={() => handleReview(request.id, false, request.requesterName)}
                    disabled={processingIds.has(request.id)}
                    className="px-3 py-1.5 bg-red-600 rounded text-white text-sm"
                  >
                    拒绝
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

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
        const cfg = data?.data || data;
        if (!mounted) return;
        setMaxAgeHours(String(Math.round((cfg.maxAgeMs || 24 * 60 * 60 * 1000) / 3600000)));
        setIntervalHours(String(Math.round((cfg.intervalMs || 6 * 60 * 60 * 1000) / 3600000)));
      } catch (e) {
        console.error(e);
        setError('加载配置失败');
      } finally {
        setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, []);

  const onSave = async () => {
    setError(''); setSavedHint(''); setSaving(true);
    try {
      const maxAgeMs = Number(maxAgeHours) * 3600000;
      const intervalMs = Number(intervalHours) * 3600000;
      const payload: Record<string, number> = {};
      if (!Number.isNaN(maxAgeMs) && maxAgeMs > 0) payload.maxAgeMs = maxAgeMs;
      if (!Number.isNaN(intervalMs) && intervalMs >= 60000) payload.intervalMs = intervalMs;
      await adminAPI.updateAvatarCleanupConfig(payload);
      setSavedHint('已保存');
    } catch (e) {
      console.error(e);
      setError('保存失败');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="card border-l-4 border-emerald-500">
      <h3 className="text-lg font-semibold text-white mb-2">自动清理策略</h3>
      {loading ? <div className="text-gray-400">加载中...</div> : (
        <div className="space-y-4">
          <div className="flex flex-col gap-3">
            <div className="flex flex-col md:flex-row md:items-center gap-2">
               <label className="text-sm text-gray-300 w-28">保留阈值(h):</label>
               <input
                 value={maxAgeHours}
                 onChange={(e) => setMaxAgeHours(e.target.value)}
                 className="flex-1 bg-discord-darkest px-3 py-2 rounded text-white"
                 placeholder="24"
               />
            </div>
            <div className="flex flex-col md:flex-row md:items-center gap-2">
               <label className="text-sm text-gray-300 w-28">清理周期(h):</label>
               <input
                 value={intervalHours}
                 onChange={(e) => setIntervalHours(e.target.value)}
                 className="flex-1 bg-discord-darkest px-3 py-2 rounded text-white"
                 placeholder="6"
               />
            </div>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
             <button onClick={onSave} disabled={saving} className="px-4 py-2 bg-emerald-600 text-white rounded text-sm">
               {saving ? '保存中...' : '保存策略'}
             </button>
             {savedHint && <span className="text-emerald-400 text-sm">{savedHint}</span>}
             {error && <span className="text-red-400 text-sm">{error}</span>}
          </div>
        </div>
      )}
    </div>
  );
}

// 子组件：系统信息面板 (已恢复详细数据)
// 子组件：系统信息面板 (UI 修正版)
function SystemInfoPanel() {
  const [info, setInfo] = useState<SystemInfoData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let mounted = true;
    adminAPI.getSystemInfo()
      .then(res => {
        if(mounted) setInfo(res.data.data || res.data);
      })
      .catch(err => {
        if(mounted) setError('无法获取系统信息');
        console.error(err);
      })
      .finally(() => {
        if(mounted) setLoading(false);
      });
    return () => { mounted = false; };
  }, []);

  const formatBytes = (bytes?: number) => {
    if (!bytes && bytes !== 0) return '-';
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const formatUptime = (seconds?: number) => {
    if (!seconds) return '-';
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    return `${days}天 ${hours}小时 ${mins}分钟`;
  };

  if (loading) return <div className="card text-gray-400">加载硬件信息...</div>;
  if (error) return <div className="card text-red-400">{error}</div>;

  return (
    <div className="card">
      <div className="flex items-center gap-2 mb-4">
        <svg className="w-5 h-5 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" />
        </svg>
        <h3 className="text-lg font-semibold text-white">服务器硬件信息</h3>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* CPU 型号 */}
        <div className="bg-discord-darkest rounded-lg p-4 md:col-span-2">
          <div className="text-sm text-gray-400 mb-1">CPU 型号</div>
          <div className="text-white font-medium font-mono text-sm break-all">
            {info?.cpu?.model || '未知型号'}
          </div>
        </div>

        {/* CPU 核心数 - 修改了这里的文案 */}
        <div className="bg-discord-darkest rounded-lg p-4">
          <div className="text-sm text-gray-400 mb-1">逻辑处理器 (线程数)</div>
          <div className="flex items-baseline gap-2">
            <span className="text-white font-medium text-2xl">{info?.cpu?.cores || 0}</span>
            <span className="text-sm text-gray-500">Threads</span>
          </div>
        </div>

        {/* 内存使用情况 */}
        <div className="bg-discord-darkest rounded-lg p-4">
          <div className="text-sm text-gray-400 mb-1">内存 (已用 / 总计)</div>
          <div className="text-white font-medium">
            {formatBytes(info?.memory?.used)} / {formatBytes(info?.memory?.total)}
          </div>
          <div className="mt-2 w-full bg-gray-700 rounded-full h-2.5">
            <div 
              className="bg-blue-600 h-2.5 rounded-full transition-all duration-500" 
              style={{ width: `${info?.memory?.usagePercent || 0}%` }}
            ></div>
          </div>
        </div>

        {/* 系统平台 */}
        <div className="bg-discord-darkest rounded-lg p-4">
          <div className="text-sm text-gray-400 mb-1">系统平台</div>
          <div className="text-white font-medium capitalize">
            {info?.platform || 'Unknown'} <span className="text-gray-500">({info?.arch})</span>
          </div>
        </div>

        {/* 运行时间 */}
        <div className="bg-discord-darkest rounded-lg p-4">
          <div className="text-sm text-gray-400 mb-1">系统运行时间</div>
          <div className="text-white font-medium">
            {formatUptime(info?.uptime)}
          </div>
        </div>
      </div>
    </div>
  );
}

function ThreadPoolConfig() {
  const [maxThreads, setMaxThreads] = useState<string>('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    adminAPI.getThreadPoolConfig().then(res => setMaxThreads(String(res.data.data.maxThreads))).finally(() => setLoading(false));
  }, []);

  const onSave = () => {
    adminAPI.updateThreadPoolConfig({ maxThreads: Number(maxThreads) }).then(() => alert('已保存')).catch(() => alert('保存失败'));
  };

  return (
    <div className="card border-l-4 border-blue-500">
      <h3 className="text-lg font-semibold text-white mb-2">线程池配置</h3>
      {loading ? <div>加载中...</div> : (
        <div className="flex flex-col md:flex-row gap-3">
           <input
             value={maxThreads}
             onChange={(e) => setMaxThreads(e.target.value)}
             className="flex-1 bg-discord-darkest px-3 py-2 rounded text-white"
             placeholder="最大线程数"
           />
           <button onClick={onSave} className="bg-blue-600 text-white px-4 py-2 rounded text-sm">保存配置</button>
        </div>
      )}
    </div>
  );
}