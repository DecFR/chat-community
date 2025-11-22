import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { adminAPI, serverRequestAPI, inviteAPI } from '../lib/api';
import { useAuthStore } from '../stores/authStore';
import { useServerStore } from '../stores/serverStore';
import { socketService } from '../lib/socket';

// --- 类型定义 ---

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

interface Server {
  id: string;
  name: string;
  owner?: { username: string };
  createdAt: string;
  channels?: Channel[];
  _count?: { members: number; channels: number };
}

interface SystemInfoData {
  cpu?: { model: string; cores: number };
  memory?: { total: number; used: number; usagePercent: number };
  platform: string;
  arch: string;
  uptime: number;
}

// --- 辅助函数 ---

const formatFileSize = (bytes: number) => {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

// 安全地提取错误信息
const getErrorMessage = (err: unknown): string => {
  if (err && typeof err === 'object' && 'response' in err) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const response = (err as any).response;
    if (response?.data?.error) return response.data.error;
    if (response?.data?.message) return response.data.message;
  }
  if (err instanceof Error) return err.message;
  return '未知错误';
};

// --- 错误边界组件 ---

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
        <div className="bg-discord-gray rounded-lg p-6">
          <div className="text-center py-12">
            <svg className="w-16 h-16 mx-auto text-red-500 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <p className="text-red-400 font-semibold mb-2">组件加载出错</p>
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

// --- 主组件 ---

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

  const loadStats = useCallback(async () => {
    try {
      setLoading(true);
      const response = await adminAPI.getStats();
      setStats(response.data.data);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  const loadUsers = useCallback(async () => {
    try {
      setLoading(true);
      const response = await adminAPI.getUsers();
      setUsers(response.data.data);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  const loadInviteCodes = useCallback(async () => {
    try {
      setLoading(true);
      const response = await adminAPI.getInviteCodes();
      setInviteCodes(response.data.data);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  const loadServers = useCallback(async () => {
    try {
      setLoading(true);
      await loadServersFromStore();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [loadServersFromStore]);

  const handleDeleteServer = async (serverId: string, serverName: string) => {
    if (!confirm(`确定要删除服务器 "${serverName}" 吗？\n\n此操作不可恢复！`)) return;
    try {
      await deleteServer(serverId);
      setSuccessMessage('服务器删除成功');
    } catch (err) {
      setError(getErrorMessage(err));
    }
  };

  const handleGenerateInvite = async (userId?: string) => {
    try {
      setError(''); setSuccessMessage('');
      await adminAPI.generateInviteCode(userId, 7);
      setSuccessMessage('邀请码生成成功');
      loadInviteCodes();
    } catch (err) {
      setError(getErrorMessage(err));
    }
  };

  const handlePromoteToAdmin = async (userId: string, username: string) => {
    if (!confirm(`确定要将用户 "${username}" 提升为管理员吗？`)) return;
    try {
      setError(''); setSuccessMessage('');
      await adminAPI.updateUserRole(userId, 'ADMIN');
      setSuccessMessage(`用户 "${username}" 已提升为管理员`);
      loadUsers();
    } catch (err) {
      setError(getErrorMessage(err));
    }
  };

  const handleDemoteToUser = async (userId: string, username: string) => {
    if (!confirm(`确定要将管理员 "${username}" 降级为普通用户吗？`)) return;
    try {
      setError(''); setSuccessMessage('');
      await adminAPI.updateUserRole(userId, 'USER');
      setSuccessMessage(`管理员 "${username}" 已降级为普通用户`);
      loadUsers();
    } catch (err) {
      setError(getErrorMessage(err));
    }
  };

  const handleDeleteUser = async (userId: string, username: string) => {
    if (!confirm(`确定要删除用户 "${username}" 吗？`)) return;
    try {
      setError(''); setSuccessMessage('');
      await adminAPI.deleteUser(userId);
      setSuccessMessage('用户删除成功');
      loadUsers();
    } catch (err) {
      setError(getErrorMessage(err));
    }
  };

  const handleDeleteInviteCode = async (codeId: string, code: string) => {
    if (!confirm(`确定要删除邀请码 "${code}" 吗？`)) return;
    try {
      setError(''); setSuccessMessage('');
      await inviteAPI.deleteUserInvite(codeId);
      setSuccessMessage('邀请码删除成功');
      loadInviteCodes();
    } catch (err) {
      setError(getErrorMessage(err));
    }
  };

  const handleCleanAllMessages = async () => {
    if (!confirm('警告：确定要清理所有消息吗？此操作不可恢复！')) return;
    if (!confirm('请再次确认：真的要清理所有消息吗？')) return;
    try {
      setError(''); setSuccessMessage(''); setLoading(true);
      const response = await adminAPI.cleanMessages();
      setSuccessMessage(`成功清理了 ${response.data.deletedCount} 条消息`);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const handleCleanChannelMessages = async (channelId: string, channelName: string) => {
    if (!confirm(`确定要清理频道 "#${channelName}" 的消息吗？`)) return;
    try {
      setError(''); setSuccessMessage('');
      const response = await adminAPI.cleanMessages(channelId);
      setSuccessMessage(`成功清理了 ${response.data.deletedCount} 条消息`);
    } catch (err) {
      setError(getErrorMessage(err));
    }
  };

  const handleCleanupAvatars = async () => {
    if (!confirm('执行未引用头像清理？')) return;
    try {
      setError(''); setSuccessMessage(''); setCleanupRunning(true);
      const h = parseFloat(cleanupHours);
      const maxAgeMs = !isNaN(h) && h > 0 ? Math.round(h * 3600000) : undefined;
      const resp = await adminAPI.cleanupAvatars(maxAgeMs);
      setSuccessMessage(`清理完成：删除 ${resp.data.data?.removed ?? 0} 个文件`);
    } catch (err) {
      setError(getErrorMessage(err));
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

  if (user?.role !== 'ADMIN') {
    return (
      <div className="flex-1 flex items-center justify-center bg-discord-dark">
        <div className="text-center">
          <div className="text-6xl mb-4">🚫</div>
          <h2 className="text-2xl font-bold mb-2">无权访问</h2>
          <Link to="/app" className="text-blue-400 hover:underline">返回主页</Link>
        </div>
      </div>
    );
  }

  // 导航 Tab 定义
  const tabs = [
    { id: 'stats', label: '统计' },
    { id: 'users', label: '用户' },
    { id: 'servers', label: '服务器' },
    { id: 'messages', label: '消息' },
    { id: 'invites', label: '邀请码' },
    { id: 'requests', label: '申请' },
    { id: 'maintenance', label: '维护' },
  ] as const;

  return (
    <div className="flex-1 flex flex-col bg-discord-dark overflow-hidden">
      {/* 顶部标题栏 */}
      <div className="h-14 md:h-12 bg-discord-darker border-b border-discord-darkest flex items-center px-4 gap-4">
        <Link to="/app" className="md:hidden p-2 -ml-2 text-gray-400 hover:text-white">
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
        </Link>
        <div className="flex-1">
          <h1 className="text-lg md:text-xl font-bold text-white">管理员仪表板</h1>
          <p className="text-xs text-gray-400 hidden md:block">系统管理与监控</p>
        </div>
      </div>

      {/* 导航栏 */}
      <div className="bg-discord-darker border-b border-discord-border px-4 overflow-x-auto scrollbar-hide">
        <div className="flex space-x-4 min-w-max">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-2 py-3 font-medium border-b-2 transition-colors whitespace-nowrap ${
                activeTab === tab.id ? 'border-discord-blue text-white' : 'border-transparent text-gray-400 hover:text-gray-300'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* 消息提示 */}
      {(error || successMessage) && (
        <div className={`mx-4 mt-4 px-4 py-3 rounded ${error ? 'bg-red-500/10 border border-red-500 text-red-500' : 'bg-green-500/10 border border-green-500 text-green-500'}`}>
          {error || successMessage}
        </div>
      )}

      {/* 内容区域 */}
      <div className="flex-1 overflow-y-auto p-4 md:p-6 scrollbar-thin">
        {loading && activeTab !== 'maintenance' ? (
          <div className="flex items-center justify-center h-full text-gray-400">加载中...</div>
        ) : (
          <>
            {/* 统计 */}
            {activeTab === 'stats' && stats && (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {[
                  { label: '总用户', val: stats.totalUsers },
                  { label: '总服务器', val: stats.totalServers },
                  { label: '总消息', val: stats.totalMessages },
                  { label: '在线用户', val: stats.onlineUsers, hl: true },
                ].map((item, i) => (
                  <div key={i} className="bg-discord-gray rounded-lg p-4 shadow-sm">
                    <div className="text-sm text-gray-400 mb-1">{item.label}</div>
                    <div className={`text-3xl font-bold ${item.hl ? 'text-green-400' : 'text-white'}`}>{item.val}</div>
                  </div>
                ))}
              </div>
            )}

            {/* 用户列表 */}
            {activeTab === 'users' && (
              <div className="bg-discord-gray rounded-lg overflow-hidden shadow-sm">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[600px]">
                    <thead className="bg-discord-darkest">
                      <tr>
                        <th className="text-left py-3 px-4 text-xs font-medium text-gray-400 uppercase">用户名</th>
                        <th className="text-left py-3 px-4 text-xs font-medium text-gray-400 uppercase">邮箱</th>
                        <th className="text-left py-3 px-4 text-xs font-medium text-gray-400 uppercase">角色</th>
                        <th className="text-left py-3 px-4 text-xs font-medium text-gray-400 uppercase">注册时间</th>
                        <th className="text-right py-3 px-4 text-xs font-medium text-gray-400 uppercase">操作</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-discord-border">
                      {users.map((u) => (
                        <tr key={u.id} className="hover:bg-discord-hover">
                          <td className="py-3 px-4 text-white">{u.username}</td>
                          <td className="py-3 px-4 text-gray-400">{u.email || '-'}</td>
                          <td className="py-3 px-4"><span className={`px-2 py-0.5 rounded text-xs font-bold ${u.role === 'ADMIN' ? 'bg-red-500/20 text-red-400' : 'bg-blue-500/20 text-blue-400'}`}>{u.role}</span></td>
                          <td className="py-3 px-4 text-gray-400 text-sm">{new Date(u.createdAt).toLocaleDateString()}</td>
                          <td className="py-3 px-4 text-right space-x-2">
                            {u.id !== user?.id && (
                              <>
                                {u.role === 'USER' ? (
                                  <button onClick={() => handlePromoteToAdmin(u.id, u.username)} className="text-orange-400 hover:underline text-xs">提权</button>
                                ) : (
                                  <button onClick={() => handleDemoteToUser(u.id, u.username)} className="text-yellow-400 hover:underline text-xs">降权</button>
                                )}
                                <button onClick={() => handleDeleteUser(u.id, u.username)} className="text-red-400 hover:underline text-xs">删除</button>
                              </>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* 邀请码 */}
            {activeTab === 'invites' && (
              <div className="space-y-4">
                <button onClick={() => handleGenerateInvite()} className="w-full md:w-auto px-4 py-2 bg-discord-blue hover:bg-discord-blue/90 text-white rounded transition-colors">生成 7 天邀请码</button>
                <div className="bg-discord-gray rounded-lg overflow-hidden shadow-sm">
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[600px]">
                      <thead className="bg-discord-darkest">
                        <tr>
                          <th className="text-left py-3 px-4 text-xs font-medium text-gray-400 uppercase">邀请码</th>
                          <th className="text-left py-3 px-4 text-xs font-medium text-gray-400 uppercase">创建者</th>
                          <th className="text-left py-3 px-4 text-xs font-medium text-gray-400 uppercase">状态</th>
                          <th className="text-right py-3 px-4 text-xs font-medium text-gray-400 uppercase">操作</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-discord-border">
                        {inviteCodes.map((inv) => (
                          <tr key={inv.id} className="hover:bg-discord-hover">
                            <td className="py-3 px-4 font-mono text-white">{inv.code}</td>
                            <td className="py-3 px-4 text-gray-400">{inv.user.username}</td>
                            <td className="py-3 px-4 text-sm">{new Date(inv.expiresAt) < new Date() ? <span className="text-red-400">过期</span> : <span className="text-green-400">有效</span>}</td>
                            <td className="py-3 px-4 text-right"><button onClick={() => handleDeleteInviteCode(inv.id, inv.code)} className="text-red-400 hover:underline text-xs">删除</button></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {/* 服务器列表 */}
            {activeTab === 'servers' && (
              <div className="bg-discord-gray rounded-lg overflow-hidden shadow-sm">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[600px]">
                    <thead className="bg-discord-darkest">
                      <tr>
                        <th className="text-left py-3 px-4 text-xs font-medium text-gray-400 uppercase">名称</th>
                        <th className="text-left py-3 px-4 text-xs font-medium text-gray-400 uppercase">拥有者</th>
                        <th className="text-center py-3 px-4 text-xs font-medium text-gray-400 uppercase">成员/频道</th>
                        <th className="text-right py-3 px-4 text-xs font-medium text-gray-400 uppercase">操作</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-discord-border">
                      {servers.map((s: Server) => (
                        <tr key={s.id} className="hover:bg-discord-hover">
                          <td className="py-3 px-4 text-white font-medium">{s.name}</td>
                          <td className="py-3 px-4 text-gray-400">{s.owner?.username}</td>
                          <td className="py-3 px-4 text-center text-gray-400 text-sm">{s._count?.members ?? 0} / {s._count?.channels ?? s.channels?.length ?? 0}</td>
                          <td className="py-3 px-4 text-right"><button onClick={() => handleDeleteServer(s.id, s.name)} className="text-red-400 hover:underline text-xs">删除</button></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* 消息清理 */}
            {activeTab === 'messages' && (
              <div className="space-y-6">
                <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 md:p-6">
                  <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                    <div>
                      <h4 className="font-bold text-red-500 flex items-center gap-2">全局清理</h4>
                      <p className="text-sm text-gray-400 mt-1">删除系统中所有消息（包括私聊）。不可恢复！</p>
                    </div>
                    <button onClick={handleCleanAllMessages} className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded font-medium w-full md:w-auto">清理所有消息</button>
                  </div>
                </div>
                <div className="bg-discord-gray rounded-lg p-4">
                  <h4 className="font-bold text-white mb-4">按频道清理</h4>
                  <div className="space-y-2">
                    {servers.map((s: Server) => (
                      <div key={s.id} className="border border-gray-700 rounded p-3">
                        <div className="font-medium text-gray-300 mb-2">{s.name}</div>
                        {s.channels?.map((c) => (
                          <div key={c.id} className="flex justify-between items-center py-1 px-2 hover:bg-discord-darkest rounded">
                            <span className="text-sm text-gray-400"># {c.name}</span>
                            <button onClick={() => handleCleanChannelMessages(c.id, c.name)} className="text-xs text-orange-400 hover:underline">清空</button>
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* 申请管理 */}
            {activeTab === 'requests' && <ErrorBoundary><ServerRequestsManagement /></ErrorBoundary>}

            {/* 维护 */}
            {activeTab === 'maintenance' && (
              <div className="space-y-6">
                <SystemInfoPanel />
                <ThreadPoolConfig />
                <PersistentCleanupConfig />
                <div className="bg-discord-gray rounded-lg p-4 border border-gray-700">
                  <h3 className="font-semibold text-white mb-2">手动触发清理</h3>
                  <div className="flex gap-2">
                    <input value={cleanupHours} onChange={(e) => setCleanupHours(e.target.value)} className="w-24 px-2 py-1 bg-discord-darkest rounded text-sm" placeholder="小时" />
                    <button onClick={handleCleanupAvatars} disabled={cleanupRunning} className="px-3 py-1 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 text-white rounded text-sm">{cleanupRunning ? '运行中...' : '执行'}</button>
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

// --- 子组件 ---

function ServerRequestsManagement() {
  const [requests, setRequests] = useState<ServerRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [processingIds, setProcessingIds] = useState<Set<string>>(new Set());

  const loadRequests = async () => {
    try {
      setLoading(true); setError('');
      const response = await serverRequestAPI.getPendingRequests();
      setRequests(Array.isArray(response.data.data) ? response.data.data : []);
    } catch (err) { setError(getErrorMessage(err)); } finally { setLoading(false); }
  };

  useEffect(() => {
    loadRequests();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const handleNotification = (n: any) => { if (n?.type === 'server_request') loadRequests(); };
    socketService.on('notification', handleNotification);
    return () => { socketService.off('notification', handleNotification); };
  }, []);

  const handleReview = async (id: string, approved: boolean, name: string) => {
    if (!confirm(`确定要${approved ? '批准' : '拒绝'} "${name}" 的申请吗？`)) return;
    try {
      setProcessingIds(prev => new Set(prev).add(id));
      let reviewNote = '';
      if (!approved) reviewNote = prompt('拒绝原因（可选）：') || '';
      await serverRequestAPI.reviewRequest(id, { approved, reviewNote });
      setSuccessMessage('操作成功'); loadRequests();
    } catch (err) { setError(getErrorMessage(err)); } finally { setProcessingIds(prev => { const next = new Set(prev); next.delete(id); return next; }); }
  };

  if (loading) return <div className="text-center py-8 text-gray-400">加载中...</div>;

  return (
    <div className="space-y-4">
      {error && <div className="bg-red-500/10 text-red-500 px-4 py-2 rounded border border-red-500">{error}</div>}
      {successMessage && <div className="bg-green-500/10 text-green-500 px-4 py-2 rounded border border-green-500">{successMessage}</div>}
      {requests.length === 0 ? <div className="text-center py-12 text-gray-500">暂无待审核申请</div> : requests.map(req => (
        <div key={req.id} className="bg-discord-gray p-4 rounded-lg border border-gray-700 flex flex-col md:flex-row justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1"><h4 className="font-bold text-white">{req.name}</h4><span className="text-xs bg-yellow-500/20 text-yellow-500 px-2 py-0.5 rounded">待审核</span></div>
            <p className="text-sm text-gray-400">{req.description}</p>
            <div className="mt-2 text-xs text-gray-500">申请人: {req.requesterName} | 理由: {req.reason}</div>
          </div>
          <div className="flex gap-2 shrink-0">
            <button onClick={() => handleReview(req.id, true, req.requesterName)} disabled={processingIds.has(req.id)} className="px-3 py-1.5 bg-green-600 hover:bg-green-700 rounded text-white text-sm">批准</button>
            <button onClick={() => handleReview(req.id, false, req.requesterName)} disabled={processingIds.has(req.id)} className="px-3 py-1.5 bg-red-600 hover:bg-red-700 rounded text-white text-sm">拒绝</button>
          </div>
        </div>
      ))}
    </div>
  );
}

function PersistentCleanupConfig() {
  const [maxAgeHours, setMaxAgeHours] = useState('');
  const [intervalHours, setIntervalHours] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    adminAPI.getAvatarCleanupConfig().then(({ data }) => {
      const cfg = data.data || data;
      setMaxAgeHours(String(Math.round((cfg.maxAgeMs || 86400000) / 3600000)));
      setIntervalHours(String(Math.round((cfg.intervalMs || 21600000) / 3600000)));
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const onSave = async () => {
    try {
      await adminAPI.updateAvatarCleanupConfig({ maxAgeMs: Number(maxAgeHours) * 3600000, intervalMs: Number(intervalHours) * 3600000 });
      alert('保存成功');
    } catch { alert('保存失败'); }
  };

  if (loading) return null;

  return (
    <div className="bg-discord-gray rounded-lg p-4 border border-gray-700">
      <h3 className="font-semibold text-white mb-3">自动清理策略</h3>
      <div className="flex flex-wrap gap-4 items-center mb-3">
        <div><label className="text-xs text-gray-400 block mb-1">过期阈值(小时)</label><input value={maxAgeHours} onChange={e => setMaxAgeHours(e.target.value)} className="w-20 px-2 py-1 bg-discord-darkest rounded text-sm" /></div>
        <div><label className="text-xs text-gray-400 block mb-1">执行周期(小时)</label><input value={intervalHours} onChange={e => setIntervalHours(e.target.value)} className="w-20 px-2 py-1 bg-discord-darkest rounded text-sm" /></div>
        <button onClick={onSave} className="mt-auto px-4 py-1.5 bg-blue-600 rounded text-white text-sm">保存</button>
      </div>
    </div>
  );
}

function SystemInfoPanel() {
  const [info, setInfo] = useState<SystemInfoData | null>(null);
  useEffect(() => { adminAPI.getSystemInfo().then(({ data }) => setInfo(data.data || data)).catch(() => {}); }, []);
  if (!info) return null;
  return (
    <div className="bg-discord-gray rounded-lg p-4 border border-gray-700 grid grid-cols-2 gap-4 text-sm">
      <div><div className="text-gray-400">CPU</div><div className="text-white">{info.cpu?.model} ({info.cpu?.cores}核)</div></div>
      <div><div className="text-gray-400">内存</div><div className="text-white">{formatFileSize(info.memory?.used || 0)} / {formatFileSize(info.memory?.total || 0)}</div></div>
      <div><div className="text-gray-400">运行时间</div><div className="text-white">{Math.floor((info.uptime || 0) / 3600)}小时</div></div>
      <div><div className="text-gray-400">平台</div><div className="text-white">{info.platform}</div></div>
    </div>
  );
}

function ThreadPoolConfig() {
  const [threads, setThreads] = useState('');
  useEffect(() => { adminAPI.getThreadPoolConfig().then(({ data }) => setThreads(String((data.data || data).maxThreads))).catch(() => {}); }, []);
  const onSave = () => adminAPI.updateThreadPoolConfig({ maxThreads: Number(threads) }).then(() => alert('保存成功')).catch(() => alert('失败'));
  return (
    <div className="bg-discord-gray rounded-lg p-4 border border-gray-700 flex gap-3 items-center">
      <span className="text-gray-300 text-sm">最大线程数:</span>
      <input value={threads} onChange={e => setThreads(e.target.value)} className="w-16 px-2 py-1 bg-discord-darkest rounded text-sm text-center" />
      <button onClick={onSave} className="px-3 py-1 bg-blue-600 rounded text-white text-sm">保存</button>
    </div>
  );
}