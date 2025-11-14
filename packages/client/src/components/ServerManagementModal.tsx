import { useState } from 'react';
import { useServerStore } from '../stores/serverStore';
import { serverAPI } from '../lib/api';

interface ServerManagementModalProps {
  isOpen: boolean;
  onClose: () => void;
  serverId?: string;
}

export default function ServerManagementModal({
  isOpen,
  onClose,
  serverId,
}: ServerManagementModalProps) {
  const { servers, loadServers } = useServerStore();
  const currentServer = servers.find((s) => s.id === serverId);

  const mode = !serverId ? 'create' : 'edit';
  const [name, setName] = useState(currentServer?.name || '');
  const [description, setDescription] = useState(currentServer?.description || '');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

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
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-discord-dark rounded-lg w-full max-w-md p-6">
        <h2 className="text-2xl font-bold mb-6">
          {mode === 'create' ? '创建服务器' : '编辑服务器'}
        </h2>

        {error && (
          <div className="mb-4 p-4 bg-red-500 bg-opacity-10 border border-red-500 rounded-lg text-red-500">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2">服务器名称 *</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="input"
              placeholder="输入服务器名称"
              required
              minLength={2}
              maxLength={50}
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">服务器描述</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="input resize-none"
              rows={3}
              placeholder="描述一下你的服务器..."
              maxLength={200}
            />
          </div>

          <div className="flex gap-3 pt-4">
            <button type="submit" disabled={isLoading} className="btn btn-primary flex-1">
              {isLoading ? '保存中...' : mode === 'create' ? '创建' : '保存'}
            </button>
            <button
              type="button"
              onClick={onClose}
              disabled={isLoading}
              className="btn btn-secondary flex-1"
            >
              取消
            </button>
          </div>

          {mode === 'edit' && (
            <button
              type="button"
              onClick={handleDelete}
              disabled={isLoading}
              className="btn btn-danger w-full mt-2"
            >
              删除服务器
            </button>
          )}
        </form>
      </div>
    </div>
  );
}
