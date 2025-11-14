import { useState } from 'react';
import { useServerStore } from '../stores/serverStore';
import { serverAPI } from '../lib/api';

interface ChannelManagementModalProps {
  isOpen: boolean;
  onClose: () => void;
  serverId: string;
  channelId?: string;
}

export default function ChannelManagementModal({
  isOpen,
  onClose,
  serverId,
  channelId,
}: ChannelManagementModalProps) {
  const { servers, loadServers } = useServerStore();
  const currentServer = servers.find((s) => s.id === serverId);
  const currentChannel = currentServer?.channels?.find(
    (c) => c.id === channelId
  );

  const [mode] = useState<'create' | 'edit'>(!channelId ? 'create' : 'edit');
  const [name, setName] = useState(currentChannel?.name || '');
  const [description, setDescription] = useState(
    currentChannel?.description || ''
  );
  const [type, setType] = useState<'TEXT' | 'VOICE'>(
    (currentChannel?.type || 'TEXT') as 'TEXT' | 'VOICE'
  );
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    try {
      if (mode === 'create') {
        await serverAPI.createChannel(serverId, { name, description, type });
      } else if (channelId) {
        await serverAPI.updateChannel(serverId, channelId, { name, description });
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
    if (!channelId) return;
    if (!confirm('确定要删除这个频道吗？此操作不可撤销！')) return;

    setIsLoading(true);
    setError(null);

    try {
      await serverAPI.deleteChannel(serverId, channelId);
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
          {mode === 'create' ? '创建频道' : '编辑频道'}
        </h2>

        {error && (
          <div className="mb-4 p-4 bg-red-500 bg-opacity-10 border border-red-500 rounded-lg text-red-500">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {mode === 'create' && (
            <div>
              <label className="block text-sm font-medium mb-2">频道类型 *</label>
              <div className="flex gap-3">
                <label className="flex-1 flex items-center gap-2 p-4 bg-discord-gray rounded cursor-pointer hover:bg-opacity-80 transition-colors">
                  <input
                    type="radio"
                    name="type"
                    value="TEXT"
                    checked={type === 'TEXT'}
                    onChange={(e) => setType(e.target.value as 'TEXT' | 'VOICE')}
                    className="w-4 h-4"
                  />
                  <div>
                    <div className="font-medium"># 文字</div>
                    <div className="text-xs text-gray-400">发送消息和图片</div>
                  </div>
                </label>

                <label className="flex-1 flex items-center gap-2 p-4 bg-discord-gray rounded cursor-pointer hover:bg-opacity-80 transition-colors">
                  <input
                    type="radio"
                    name="type"
                    value="VOICE"
                    checked={type === 'VOICE'}
                    onChange={(e) => setType(e.target.value as 'TEXT' | 'VOICE')}
                    className="w-4 h-4"
                  />
                  <div>
                    <div className="font-medium">🔊 语音</div>
                    <div className="text-xs text-gray-400">语音通话</div>
                  </div>
                </label>
              </div>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium mb-2">频道名称 *</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="input"
              placeholder="输入频道名称"
              required
              minLength={2}
              maxLength={50}
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">频道描述</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="input resize-none"
              rows={3}
              placeholder="描述一下这个频道..."
              maxLength={200}
            />
          </div>

          <div className="flex gap-3 pt-4">
            <button
              type="submit"
              disabled={isLoading}
              className="btn btn-primary flex-1"
            >
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
              删除频道
            </button>
          )}
        </form>
      </div>
    </div>
  );
}
