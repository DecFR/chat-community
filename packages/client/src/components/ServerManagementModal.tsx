import { useEffect, useState, useCallback } from 'react';
import { useServerStore } from '../stores/serverStore';
import { serverAPI } from '../lib/api';
import { useAuthStore } from '../stores/authStore';
import { socketService } from '../lib/socket';
import Modal from './ui/Modal';

interface ServerManagementModalProps {
  isOpen: boolean;
  onClose: () => void;
  serverId?: string;
}

export default function ServerManagementModal({ isOpen, onClose, serverId }: ServerManagementModalProps) {
  const { servers, loadServers } = useServerStore();
  const { user } = useAuthStore();
  const currentServer = servers.find((s) => s.id === serverId);

  const mode: 'create' | 'edit' = !serverId ? 'create' : 'edit';
  const [name, setName] = useState(currentServer?.name || '');
  const [description, setDescription] = useState(currentServer?.description || '');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isOwner = !!(user && currentServer && currentServer.ownerId === user.id);

  // 打开时刷新一次（编辑态）
  useEffect(() => {
    if (isOpen && serverId) {
      loadServers();
    }
  }, [isOpen, serverId, loadServers]);

  // 申请列表
  const [activeTab, setActiveTab] = useState<'basic' | 'requests'>('basic');
  type JoinRequest = {
    id: string;
    status: 'PENDING' | 'APPROVED' | 'REJECTED';
    reason?: string | null;
    reviewNote?: string | null;
    createdAt: string;
    reviewedAt?: string | null;
    applicant: { id: string; username: string; avatarUrl?: string | null };
  };
  const [requests, setRequests] = useState<JoinRequest[]>([]);
  const [loadingReq, setLoadingReq] = useState(false);

  const loadRequests = useCallback(async () => {
    if (!serverId || !isOwner) return;
    try {
      setLoadingReq(true);
      const res = await serverAPI.getJoinRequests(serverId);
      setRequests(res.data.data as JoinRequest[]);
    } catch (err) {
      console.error('加载申请失败:', err);
    } finally {
      setLoadingReq(false);
    }
  }, [serverId, isOwner]);

  useEffect(() => {
    if (isOpen && activeTab === 'requests' && serverId && isOwner) {
      loadRequests();
    }
  }, [isOpen, activeTab, serverId, isOwner, loadRequests]);

  // 实时监听新的加入申请
  useEffect(() => {
    if (!isOpen || activeTab !== 'requests' || !serverId) return;
    const socket = socketService.getSocket();
    const handleNewRequest = (data: { serverId: string; serverName: string; request: JoinRequest }) => {
      if (data.serverId === serverId) loadRequests();
    };
    socket?.on('serverJoinRequest', handleNewRequest);
    return () => {
      socket?.off('serverJoinRequest', handleNewRequest);
    };
  }, [isOpen, activeTab, serverId, loadRequests]);

  if (!isOpen) return null;

  // 审批
  const review = async (requestId: string, approved: boolean) => {
    if (!serverId) return;
    const note = approved ? '' : prompt('填写拒绝理由（可选）：') || '';
    try {
      await serverAPI.reviewJoinRequest(serverId, requestId, { approved, reviewNote: note.trim() || undefined });
      await loadRequests();
      if (approved) await loadServers();
    } catch (err: unknown) {
      const errorMessage = err instanceof Error && 'response' in err
        ? ((err as { response?: { data?: { error?: string } } }).response?.data?.error || '操作失败')
        : '操作失败';
      alert(errorMessage);
    }
  };

  // 保存
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);
    try {
      if (mode === 'create') {
        await serverAPI.createServer({ name, description });
      } else if (serverId) {
        await serverAPI.updateServer(serverId, { name, description });
      }
      await loadServers();
      onClose();
    } catch (err: unknown) {
      const errorMessage = err instanceof Error && 'response' in err
        ? ((err as { response?: { data?: { message?: string } } }).response?.data?.message || '操作失败')
        : '操作失败';
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  // 删除
  const handleDelete = async () => {
    if (!serverId) return;
    if (!confirm('确定要删除这个服务器吗？此操作不可撤销！')) return;
    setIsLoading(true);
    setError(null);
    try {
      await serverAPI.deleteServer(serverId);
      await loadServers();
      onClose();
    } catch (err: unknown) {
      const errorMessage = err instanceof Error && 'response' in err
        ? ((err as { response?: { data?: { message?: string } } }).response?.data?.message || '删除失败')
        : '删除失败';
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={mode === 'create' ? '创建服务器' : '服务器管理'} maxWidthClass="max-w-2xl">
      {mode === 'edit' && isOwner && (
        <div className="flex space-x-2 mb-4">
          <button
            className={`flex-1 py-2 px-4 rounded transition-colors ${activeTab === 'basic' ? 'bg-discord-blue text-white' : 'bg-discord-gray text-gray-400 hover:text-white'}`}
            onClick={() => setActiveTab('basic')}
          >基本信息</button>
          <button
            className={`flex-1 py-2 px-4 rounded transition-colors ${activeTab === 'requests' ? 'bg-discord-blue text-white' : 'bg-discord-gray text-gray-400 hover:text-white'}`}
            onClick={() => setActiveTab('requests')}
          >加入申请</button>
        </div>
      )}

      <div>
        {error && (
          <div className="mb-4 p-4 bg-red-500 bg-opacity-10 border border-red-500 rounded-lg text-red-500">{error}</div>
        )}

        {activeTab === 'basic' && (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">服务器名称 <span className="text-red-500">*</span></label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-3 py-2 bg-discord-gray border border-gray-600 rounded text-white placeholder-gray-500 focus:outline-none focus:border-discord-blue"
                placeholder="输入服务器名称"
                required
                minLength={2}
                maxLength={50}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">服务器描述</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full px-3 py-2 bg-discord-gray border border-gray-600 rounded text-white placeholder-gray-500 focus:outline-none focus:border-discord-blue resize-none"
                rows={3}
                placeholder="描述一下你的服务器..."
                maxLength={200}
              />
            </div>

            <button type="submit" disabled={isLoading} className="w-full py-2 bg-discord-blue hover:bg-blue-600 disabled:bg-gray-600 text-white font-medium rounded transition-colors">
              {isLoading ? '保存中...' : mode === 'create' ? '创建' : '保存'}
            </button>

            <button type="button" onClick={onClose} disabled={isLoading} className="w-full py-2 bg-discord-gray hover:bg-gray-600 disabled:bg-gray-700 text-white font-medium rounded transition-colors">
              取消
            </button>

            {mode === 'edit' && (
              <button type="button" onClick={handleDelete} disabled={isLoading} className="w-full py-2 bg-red-600 hover:bg-red-700 disabled:bg-gray-600 text-white font-medium rounded transition-colors">
                删除服务器
              </button>
            )}
          </form>
        )}

        {activeTab === 'requests' && isOwner && mode === 'edit' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="text-sm text-gray-400">仅服务器创建者可管理加入申请</div>
              <button onClick={loadRequests} disabled={loadingReq} className="px-3 py-1 bg-discord-blue hover:bg-blue-600 disabled:bg-gray-600 text-white text-sm rounded transition-colors">
                {loadingReq ? '刷新中...' : '刷新'}
              </button>
            </div>
            {loadingReq && requests.length === 0 ? (
              <div className="text-gray-400">加载中...</div>
            ) : requests.length === 0 ? (
              <div className="text-gray-400">暂无申请</div>
            ) : (
              <div className="space-y-3 max-h-96 overflow-y-auto">
                {requests.map((r) => (
                  <div key={r.id} className="p-3 rounded border border-gray-700 bg-discord-gray">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="text-white font-medium">{r.applicant.username}</div>
                        {r.reason && <div className="text-sm text-gray-300 mt-1">理由：{r.reason}</div>}
                        <div className="text-xs text-gray-500 mt-1">提交时间：{new Date(r.createdAt).toLocaleString()}</div>
                        {r.status !== 'PENDING' && (
                          <div className="text-xs text-gray-500 mt-1">状态：{r.status} {r.reviewedAt ? `（于 ${new Date(r.reviewedAt).toLocaleString()}）` : ''}</div>
                        )}
                        {r.reviewNote && <div className="text-xs text-gray-500 mt-1">备注：{r.reviewNote}</div>}
                      </div>
                      <div className="flex items-center space-x-2 ml-3">
                        {r.status === 'PENDING' ? (
                          <>
                            <button className="px-3 py-1 rounded bg-green-600 hover:bg-green-700 text-white text-sm transition-colors" onClick={() => review(r.id, true)}>同意</button>
                            <button className="px-3 py-1 rounded bg-red-600 hover:bg-red-700 text-white text-sm transition-colors" onClick={() => review(r.id, false)}>拒绝</button>
                          </>
                        ) : (
                          <span className="text-xs text-gray-400">已处理</span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}
