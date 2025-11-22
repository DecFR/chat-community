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

// --- 组件 ---

const AutoToast = ({ message, type, onClose }: { message: string, type: 'success'|'error', onClose: () => void }) => {
  useEffect(() => {
    const timer = setTimeout(onClose, 3000);
    return () => clearTimeout(timer);
  }, [onClose]);

  if (!message) return null;

  return (
    <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded shadow-lg animate-slide-in ${type === 'success' ? 'bg-green-600' : 'bg-red-600'} text-white font-medium`}>
      {message}
    </div>
  );
};

type ErrorBoundaryProps = { children: React.ReactNode; fallback?: React.ReactNode; };
type ErrorBoundaryState = { hasError: boolean; error?: Error; };
class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) { super(props); this.state = { hasError: false }; }
  static getDerivedStateFromError(error: Error) { return { hasError: true, error }; }
  render() {
    if (this.state.hasError) return this.props.fallback || <div className="text-red-500 p-4 text-center">组件加载错误</div>;
    return this.props.children;
  }
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
  
  const [msg, setMsg] = useState<{ text: string, type: 'success'|'error' } | null>(null);

  // 🟢 修复 1: 使用 useCallback 包裹 showToast，使其成为稳定依赖
  const showToast = useCallback((text: string, type: 'success'|'error') => {
    setMsg({ text, type });
  }, []);

  // 🟢 修复 2: 添加 showToast 和 API 到依赖数组
  const loadStats = useCallback(async () => {
    try { setLoading(true); const res = await adminAPI.getStats(); setStats(res.data.data); } 
    catch (err) { showToast(getErrorMessage(err), 'error'); } finally { setLoading(false); }
  }, [showToast]);

  const loadUsers = useCallback(async () => {
    try { setLoading(true); const res = await adminAPI.getUsers(); setUsers(res.data.data); }
    catch (err) { showToast(getErrorMessage(err), 'error'); } finally { setLoading(false); }
  }, [showToast]);

  const loadInviteCodes = useCallback(async () => {
    try { setLoading(true); const res = await adminAPI.getInviteCodes(); setInviteCodes(res.data.data); }
    catch (err) { showToast(getErrorMessage(err), 'error'); } finally { setLoading(false); }
  }, [showToast]);

  // 🟢 修复 3: 必须包含 loadServersFromStore 和 showToast
  const loadServers = useCallback(async () => {
    try { setLoading(true); await loadServersFromStore(); }
    catch (err) { showToast(getErrorMessage(err), 'error'); } finally { setLoading(false); }
  }, [loadServersFromStore, showToast]);

  useEffect(() => {
    if (activeTab === 'stats') loadStats();
    else if (activeTab === 'users') loadUsers();
    else if (activeTab === 'invites') loadInviteCodes();
    else if (activeTab === 'servers') loadServers();
  }, [activeTab, loadStats, loadUsers, loadInviteCodes, loadServers]);

  // 操作函数
  const handleGenerateInvite = async () => {
    try { await adminAPI.generateInviteCode(undefined, 7); showToast('生成成功', 'success'); loadInviteCodes(); }
    catch (err) { showToast(getErrorMessage(err), 'error'); }
  };
  
  const handleDeleteServer = async (id: string, name: string) => {
    if (!confirm(`删除服务器 ${name}?`)) return;
    try { await deleteServer(id); showToast('删除成功', 'success'); } catch (err) { showToast(getErrorMessage(err), 'error'); }
  };

  const handlePromote = async (id: string, name: string) => {
    if (!confirm(`提升 ${name} 为管理员?`)) return;
    try { await adminAPI.updateUserRole(id, 'ADMIN'); showToast('操作成功', 'success'); loadUsers(); } catch (err) { showToast(getErrorMessage(err), 'error'); }
  };

  const handleDemote = async (id: string, name: string) => {
    if (!confirm(`降级 ${name}?`)) return;
    try { await adminAPI.updateUserRole(id, 'USER'); showToast('操作成功', 'success'); loadUsers(); } catch (err) { showToast(getErrorMessage(err), 'error'); }
  };

  const handleDeleteUser = async (id: string, name: string) => {
    if (!confirm(`删除用户 ${name}?`)) return;
    try { await adminAPI.deleteUser(id); showToast('删除成功', 'success'); loadUsers(); } catch (err) { showToast(getErrorMessage(err), 'error'); }
  };

  const handleDeleteInvite = async (id: string) => {
    try { await inviteAPI.deleteUserInvite(id); showToast('删除成功', 'success'); loadInviteCodes(); } catch (err) { showToast(getErrorMessage(err), 'error'); }
  };

  const handleCleanAll = async () => {
    if (!confirm('清空所有消息？不可恢复！')) return;
    try { setLoading(true); const res = await adminAPI.cleanMessages(); showToast(`清理 ${res.data.deletedCount} 条`, 'success'); } catch (err) { showToast(getErrorMessage(err), 'error'); } finally { setLoading(false); }
  };

  const handleCleanChannel = async (id: string) => {
    if (!confirm('清空频道消息？')) return;
    try { const res = await adminAPI.cleanMessages(id); showToast(`清理 ${res.data.deletedCount} 条`, 'success'); } catch (err) { showToast(getErrorMessage(err), 'error'); }
  };

  const handleCleanupAvatars = async () => {
    if (!confirm('执行头像清理？')) return;
    try {
      setCleanupRunning(true);
      const h = parseFloat(cleanupHours);
      const maxAgeMs = !isNaN(h) && h > 0 ? Math.round(h * 3600000) : undefined;
      const res = await adminAPI.cleanupAvatars(maxAgeMs);
      showToast(`删除 ${res.data.data?.removed ?? 0} 个文件`, 'success');
    } catch (err) { showToast(getErrorMessage(err), 'error'); } finally { setCleanupRunning(false); }
  };

  if (user?.role !== 'ADMIN') return <div className="text-center py-20 text-white">无权访问</div>;

  const tabs = [
    { id: 'stats', label: '统计' }, { id: 'users', label: '用户' },
    { id: 'servers', label: '服务器' }, { id: 'messages', label: '消息' },
    { id: 'invites', label: '邀请码' }, { id: 'requests', label: '申请' },
    { id: 'maintenance', label: '维护' },
  ] as const;

  return (
    <div className="flex-1 flex flex-col bg-discord-dark overflow-hidden relative">
      {msg && <AutoToast message={msg.text} type={msg.type} onClose={() => setMsg(null)} />}

      <div className="h-14 md:h-12 bg-discord-darker border-b border-discord-darkest flex items-center px-4 gap-4">
        <Link to="/app" className="md:hidden text-gray-400"><svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg></Link>
        <h1 className="text-lg font-bold text-white">管理面板</h1>
      </div>

      <div className="bg-discord-darker border-b border-discord-border px-4 overflow-x-auto scrollbar-hide">
        <div className="flex space-x-4 min-w-max">
          {tabs.map(tab => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)} className={`px-2 py-3 border-b-2 transition-colors ${activeTab === tab.id ? 'border-blue-500 text-white' : 'border-transparent text-gray-400'}`}>{tab.label}</button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 md:p-6 scrollbar-thin">
        {loading && activeTab !== 'maintenance' ? <div className="text-center text-gray-400">加载中...</div> : (
          <>
            {activeTab === 'stats' && stats && (
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                {[ {L:'用户',V:stats.totalUsers}, {L:'服务器',V:stats.totalServers}, {L:'消息',V:stats.totalMessages}, {L:'在线',V:stats.onlineUsers,HL:true} ].map((d,i)=>(
                  <div key={i} className="bg-discord-gray p-4 rounded-lg"><div className="text-sm text-gray-400">{d.L}</div><div className={`text-2xl font-bold ${d.HL?'text-green-400':'text-white'}`}>{d.V}</div></div>
                ))}
              </div>
            )}

            {activeTab === 'users' && (
              <div className="bg-discord-gray rounded-lg overflow-x-auto"><table className="w-full min-w-[600px]"><thead className="bg-discord-darkest text-gray-400 text-xs uppercase"><tr><th className="p-3 text-left">用户</th><th className="p-3 text-left">角色</th><th className="p-3 text-right">操作</th></tr></thead>
              <tbody className="divide-y divide-gray-700">{users.map(u=><tr key={u.id} className="hover:bg-discord-hover"><td className="p-3 text-white">{u.username}<div className="text-xs text-gray-500">{u.email}</div></td><td className="p-3"><span className={`px-2 py-0.5 rounded text-xs ${u.role==='ADMIN'?'bg-red-900 text-red-200':'bg-blue-900 text-blue-200'}`}>{u.role}</span></td><td className="p-3 text-right space-x-2">{u.id!==user?.id&&(<> {u.role==='USER'?<button onClick={()=>handlePromote(u.id,u.username)} className="text-orange-400 text-xs">提权</button>:<button onClick={()=>handleDemote(u.id,u.username)} className="text-yellow-400 text-xs">降权</button>} <button onClick={()=>handleDeleteUser(u.id,u.username)} className="text-red-400 text-xs">删除</button> </>)}</td></tr>)}</tbody></table></div>
            )}

            {activeTab === 'invites' && (
              <div className="space-y-4"><button onClick={handleGenerateInvite} className="px-4 py-2 bg-blue-600 text-white rounded">生成邀请码</button>
              <div className="bg-discord-gray rounded-lg overflow-x-auto"><table className="w-full min-w-[600px]"><thead className="bg-discord-darkest text-gray-400 text-xs uppercase"><tr><th className="p-3 text-left">代码</th><th className="p-3 text-left">状态</th><th className="p-3 text-right">操作</th></tr></thead><tbody>{inviteCodes.map(inv=><tr key={inv.id} className="hover:bg-discord-hover"><td className="p-3 text-white font-mono">{inv.code}</td><td className="p-3 text-gray-400">{inv.user.username}</td><td className="p-3 text-xs">{new Date(inv.expiresAt)<new Date()?<span className="text-red-400">过期</span>:<span className="text-green-400">有效</span>}</td><td className="p-3 text-right"><button onClick={()=>handleDeleteInvite(inv.id)} className="text-red-400 text-xs">删除</button></td></tr>)}</tbody></table></div></div>
            )}

            {activeTab === 'servers' && (
              <div className="bg-discord-gray rounded-lg overflow-x-auto"><table className="w-full min-w-[600px]"><thead className="bg-discord-darkest text-gray-400 text-xs uppercase"><tr><th className="p-3 text-left">名称</th><th className="p-3 text-center">统计</th><th className="p-3 text-right">操作</th></tr></thead><tbody>{servers.map((s: Server) => (
                <tr key={s.id} className="hover:bg-discord-hover"><td className="p-3 text-white">{s.name}<div className="text-xs text-gray-500">{s.owner?.username}</div></td><td className="p-3 text-center text-xs text-gray-400">{s._count?.members??0}人 / {s._count?.channels??0}频道</td><td className="p-3 text-right"><button onClick={()=>handleDeleteServer(s.id,s.name)} className="text-red-400 text-xs">删除</button></td></tr>
              ))}</tbody></table></div>
            )}

            {activeTab === 'messages' && (
              <div className="space-y-6">
                <div className="bg-red-900/20 border border-red-900 p-4 rounded flex justify-between items-center"><div><h4 className="text-red-400 font-bold">全局清理</h4><p className="text-xs text-gray-400">删除所有消息</p></div><button onClick={handleCleanAll} className="px-3 py-1 bg-red-600 text-white rounded text-sm">清理全部</button></div>
                <div className="bg-discord-gray rounded p-4"><h4 className="text-white mb-4">按频道清理</h4><div className="space-y-2">{servers.map((s: Server) => (
                  <div key={s.id} className="border border-gray-700 rounded p-2"><div className="text-gray-300 text-sm mb-2">{s.name}</div>{s.channels?.map((c) => (
                    <div key={c.id} className="flex justify-between items-center px-2 py-1 bg-discord-darkest rounded mb-1"><span className="text-xs text-gray-400">#{c.name}</span><button onClick={()=>handleCleanChannel(c.id)} className="text-xs text-orange-400">清空</button></div>
                  ))}</div>
                ))}</div></div>
              </div>
            )}

            {activeTab === 'requests' && <ErrorBoundary><ServerRequestsManagement showToast={showToast} /></ErrorBoundary>}

            {activeTab === 'maintenance' && (
              <div className="space-y-6">
                <SystemInfoPanel />
                <ThreadPoolConfig showToast={showToast} />
                <PersistentCleanupConfig showToast={showToast} />
                <div className="bg-discord-gray rounded p-4 flex gap-2 items-center"><span className="text-white text-sm">手动清理头像:</span><input value={cleanupHours} onChange={e=>setCleanupHours(e.target.value)} className="w-16 bg-discord-darkest text-white px-2 py-1 rounded text-sm" placeholder="H"/><button onClick={handleCleanupAvatars} disabled={cleanupRunning} className="px-3 py-1 bg-blue-600 text-white rounded text-sm">{cleanupRunning?'...':'执行'}</button></div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function ServerRequestsManagement({ showToast }: { showToast: (msg: string, type: 'success'|'error') => void }) {
  const [requests, setRequests] = useState<ServerRequest[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try { setLoading(true); const res = await serverRequestAPI.getPendingRequests(); setRequests(Array.isArray(res.data.data) ? res.data.data : []); }
    catch { showToast('加载申请失败', 'error'); } finally { setLoading(false); }
  }, [showToast]);

  useEffect(() => {
    load();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const h = (n: any) => { if (n?.type === 'server_request') load(); };
    socketService.on('notification', h); return () => { socketService.off('notification', h); };
  }, [load]);

  const review = async (id: string, ok: boolean) => {
    if (!confirm(ok ? '批准?' : '拒绝?')) return;
    const note = !ok ? prompt('拒绝理由') : undefined;
    try { await serverRequestAPI.reviewRequest(id, { approved: ok, reviewNote: note || undefined }); showToast('操作成功', 'success'); load(); }
    catch (err) { showToast(getErrorMessage(err), 'error'); }
  };

  if (loading) return <div className="text-gray-400 text-center">加载中...</div>;
  if (!requests.length) return <div className="text-gray-500 text-center py-8">暂无申请</div>;

  return (
    <div className="space-y-3">{requests.map(r => (
      <div key={r.id} className="bg-discord-gray p-4 rounded flex justify-between items-center border border-gray-700">
        <div><div className="text-white font-bold">{r.name} <span className="text-xs font-normal text-gray-400">({r.requesterName})</span></div><div className="text-xs text-gray-500">{r.reason}</div></div>
        <div className="flex gap-2"><button onClick={()=>review(r.id, true)} className="px-3 py-1 bg-green-600 text-white text-xs rounded">批准</button><button onClick={()=>review(r.id, false)} className="px-3 py-1 bg-red-600 text-white text-xs rounded">拒绝</button></div>
      </div>
    ))}</div>
  );
}

function PersistentCleanupConfig({ showToast }: { showToast: (msg: string, type: 'success'|'error') => void }) {
  const [max, setMax] = useState('');
  const [int, setInt] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    adminAPI.getAvatarCleanupConfig().then(({ data }) => {
      const c = data.data || data;
      setMax(String(Math.round((c.maxAgeMs||86400000)/3600000)));
      setInt(String(Math.round((c.intervalMs||21600000)/3600000)));
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const save = async () => {
    try { await adminAPI.updateAvatarCleanupConfig({ maxAgeMs: Number(max)*3600000, intervalMs: Number(int)*3600000 }); showToast('保存成功', 'success'); }
    catch { showToast('保存失败', 'error'); }
  };

  if (loading) return null;
  return (
    <div className="bg-discord-gray p-4 rounded border border-gray-700 flex flex-wrap gap-4 items-end">
      <div><label className="text-xs text-gray-400 block">过期(时)</label><input value={max} onChange={e=>setMax(e.target.value)} className="w-16 bg-discord-darkest text-white px-2 py-1 rounded text-sm"/></div>
      <div><label className="text-xs text-gray-400 block">周期(时)</label><input value={int} onChange={e=>setInt(e.target.value)} className="w-16 bg-discord-darkest text-white px-2 py-1 rounded text-sm"/></div>
      <button onClick={save} className="px-4 py-1 bg-blue-600 text-white rounded text-sm">保存策略</button>
    </div>
  );
}

function SystemInfoPanel() {
  const [info, setInfo] = useState<SystemInfoData | null>(null);
  useEffect(() => { adminAPI.getSystemInfo().then(({ data }) => setInfo(data.data || data)).catch(() => {}); }, []);
  if (!info) return null;
  return (
    <div className="bg-discord-gray p-4 rounded grid grid-cols-2 gap-4 text-sm border border-gray-700">
      <div><div className="text-gray-400">CPU</div><div className="text-white">{info.cpu?.model} ({info.cpu?.cores}核)</div></div>
      <div><div className="text-gray-400">内存</div><div className="text-white">{formatFileSize(info.memory?.used||0)} / {formatFileSize(info.memory?.total||0)}</div></div>
    </div>
  );
}

function ThreadPoolConfig({ showToast }: { showToast: (msg: string, type: 'success'|'error') => void }) {
  const [threads, setThreads] = useState('');
  const [cores, setCores] = useState(0);
  const [warn, setWarn] = useState('');

  useEffect(() => {
    Promise.all([adminAPI.getThreadPoolConfig(), adminAPI.getSystemInfo()]).then(([cRes, sRes]) => {
      const c = cRes.data.data || cRes.data;
      const s = sRes.data.data || sRes.data;
      setCores(s.cpu?.cores || 1);
      setThreads(String(c.maxThreads));
    });
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value.replace(/\D/g, '');
    setThreads(val);
    if (Number(val) > cores * 2) setWarn(`建议不超过 ${cores * 2}`); else setWarn('');
  };

  const save = async () => {
    try { await adminAPI.updateThreadPoolConfig({ maxThreads: Number(threads) }); showToast('保存成功', 'success'); }
    catch { showToast('保存失败', 'error'); }
  };

  return (
    <div className="bg-discord-gray p-4 rounded border border-gray-700">
      <div className="text-white font-semibold mb-2">线程池 (CPU: {cores}核)</div>
      <div className="flex gap-2 items-center">
        <input value={threads} onChange={handleChange} className={`w-20 bg-discord-darkest text-white px-2 py-1 rounded text-sm ${warn ? 'border border-yellow-500' : ''}`} />
        <button onClick={save} className="px-3 py-1 bg-blue-600 text-white rounded text-sm">保存</button>
        {warn && <span className="text-xs text-yellow-500">{warn}</span>}
      </div>
    </div>
  );
}