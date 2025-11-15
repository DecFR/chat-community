import { useState } from 'react';
import { serverRequestAPI, serverAPI } from '../lib/api';
import { useServerStore } from '../stores/serverStore';
import { useAuthStore } from '../stores/authStore';

interface AddServerModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function AddServerModal({ isOpen, onClose }: AddServerModalProps) {
  const [activeTab, setActiveTab] = useState<'create' | 'search'>('create');
  const [isLoading, setIsLoading] = useState(false);
  const { user } = useAuthStore();
   const { createServer } = useServerStore();
  
  // 创建服务器状态
  const [serverName, setServerName] = useState('');
  const [description, setDescription] = useState('');
  const [reason, setReason] = useState('');
  
  // 查找服务器状态
  const [searchResults, setSearchResults] = useState<Array<{
     id: string;
     name: string;
     description?: string;
     _count?: { members: number; channels: number };
   }>>([]);
  const [hasSearched, setHasSearched] = useState(false);
  const [query, setQuery] = useState('');

  if (!isOpen) return null;

  const handleCreate = async () => {
    if (!serverName.trim()) {
      alert('请输入服务器名称');
      return;
    }

    if (user?.role !== 'ADMIN' && !reason.trim()) {
      alert('必须提供创建理由');
      return;
    }

    try {
      setIsLoading(true);
      
      if (user?.role === 'ADMIN') {
        // 管理员直接创建
        await createServer(serverName.trim(), description?.trim());
        alert('服务器创建成功！');
        onClose();
        resetForm();
      } else {
        // 普通用户提交申请
        await serverRequestAPI.createRequest({
          name: serverName.trim(),
          description: description?.trim(),
          reason: reason.trim(),
        });
        alert('申请已提交！\n\n请等待管理员审批。您可以在设置中查看申请状态。');
        onClose();
        resetForm();
      }
     } catch (error: unknown) {
       const errorMessage = error instanceof Error && 'response' in error
         ? ((error as { response?: { data?: { error?: string } } }).response?.data?.error || '操作失败')
         : '操作失败';
       alert(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSearch = async () => {
    try {
      setIsLoading(true);
      setHasSearched(true);
      const response = await serverAPI.searchServers(query || '');
      const allServers = response.data.data as Array<{ id: string; name: string; description?: string; _count?: { members: number; channels: number } }>;
      
      // 获取用户已加入的服务器ID
      const { servers: joinedServers } = useServerStore.getState();
      const joinedServerIds = new Set(joinedServers.map(s => s.id));
      
      // 过滤出未加入的服务器
       const availableServers = allServers.filter((s: { id: string }) => !joinedServerIds.has(s.id));
      setSearchResults(availableServers);
     } catch (error: unknown) {
       const errorMessage = error instanceof Error && 'response' in error
         ? ((error as { response?: { data?: { error?: string } } }).response?.data?.error || '查找服务器失败')
         : '查找服务器失败';
       alert(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  // 加入逻辑在渲染处内联处理

  const resetForm = () => {
    setServerName('');
    setDescription('');
    setReason('');
    setSearchResults([]);
    setHasSearched(false);
    setActiveTab('create');
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-discord-dark rounded-lg shadow-xl w-full max-w-md mx-4">
        {/* 头部 */}
        <div className="p-4 border-b border-gray-700">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold text-white">创建/查找服务器</h2>
            <button
              onClick={() => {
                onClose();
                resetForm();
              }}
              className="text-gray-400 hover:text-white transition-colors"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          
          {/* 标签页 */}
          <div className="flex space-x-2">
            <button
              onClick={() => setActiveTab('create')}
              className={`flex-1 py-2 px-4 rounded transition-colors ${
                activeTab === 'create'
                  ? 'bg-discord-blue text-white'
                  : 'bg-discord-gray text-gray-400 hover:text-white'
              }`}
            >
              创建服务器
            </button>
            <button
              onClick={() => setActiveTab('search')}
              className={`flex-1 py-2 px-4 rounded transition-colors ${
                activeTab === 'search'
                  ? 'bg-discord-blue text-white'
                  : 'bg-discord-gray text-gray-400 hover:text-white'
              }`}
            >
              查找服务器
            </button>
          </div>
        </div>

        {/* 内容区 */}
        <div className="p-4">
          {activeTab === 'create' ? (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  服务器名称 <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={serverName}
                  onChange={(e) => setServerName(e.target.value)}
                  placeholder="输入服务器名称"
                  className="w-full px-3 py-2 bg-discord-gray border border-gray-600 rounded text-white placeholder-gray-500 focus:outline-none focus:border-discord-blue"
                  maxLength={100}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  服务器描述
                </label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="输入服务器描述（可选）"
                  className="w-full px-3 py-2 bg-discord-gray border border-gray-600 rounded text-white placeholder-gray-500 focus:outline-none focus:border-discord-blue resize-none"
                  rows={3}
                  maxLength={500}
                />
              </div>

              {user?.role !== 'ADMIN' && (
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    创建理由 <span className="text-red-500">*</span>
                  </label>
                  <textarea
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder="说明创建服务器的理由"
                    className="w-full px-3 py-2 bg-discord-gray border border-gray-600 rounded text-white placeholder-gray-500 focus:outline-none focus:border-discord-blue resize-none"
                    rows={3}
                    maxLength={500}
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    普通用户需要提交申请，等待管理员审批
                  </p>
                </div>
              )}

              <button
                onClick={handleCreate}
                disabled={isLoading}
                className="w-full py-2 bg-discord-blue hover:bg-blue-600 disabled:bg-gray-600 text-white font-medium rounded transition-colors"
              >
                {isLoading ? '处理中...' : user?.role === 'ADMIN' ? '创建服务器' : '提交申请'}
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex space-x-2">
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="输入关键词搜索服务器"
                  className="flex-1 px-3 py-2 bg-discord-gray border border-gray-600 rounded text-white placeholder-gray-500 focus:outline-none focus:border-discord-blue"
                />
                <button
                  onClick={handleSearch}
                  disabled={isLoading}
                  className="px-4 py-2 bg-discord-blue hover:bg-blue-600 disabled:bg-gray-600 text-white font-medium rounded transition-colors"
                >
                  {isLoading ? '搜索中...' : '搜索'}
                </button>
              </div>

              {hasSearched && (
                <div className="max-h-96 overflow-y-auto space-y-2">
                  {searchResults.length === 0 ? (
                    <div className="text-center py-8 text-gray-400">
                      <p>暂无可加入的服务器</p>
                      <p className="text-sm mt-2">请向服务器管理员索取邀请码</p>
                    </div>
                  ) : (
                    searchResults.map((server) => (
                      <div
                        key={server.id}
                        className="bg-discord-gray p-3 rounded border border-gray-700 hover:border-gray-600 transition-colors"
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <h3 className="text-white font-medium">{server.name}</h3>
                            {server.description && (
                              <p className="text-sm text-gray-400 mt-1 line-clamp-2">
                                {server.description}
                              </p>
                            )}
                            <div className="flex items-center space-x-4 mt-2 text-xs text-gray-500">
                              <span>{server._count?.members || 0} 成员</span>
                              <span>{server._count?.channels || 0} 频道</span>
                            </div>
                          </div>
                          <button
                            onClick={async () => {
                              if (!server?.id) {
                                alert('服务器信息无效');
                                return;
                              }
                              
                              try {
                                const r = prompt('请填写申请理由(可选):');
                                if (r === null) return; // 用户取消
                                
                                setIsLoading(true);
                                await serverAPI.createJoinRequest(server.id, r.trim() || undefined);
                                alert('申请已提交,等待服务器创建者审核');
                                // 刷新搜索结果
                                await handleSearch();
                              } catch (err: unknown) {
                                console.error('提交加入申请失败:', err);
                                const msg = err instanceof Error && 'response' in err
                                  ? ((err as { response?: { data?: { error?: string } } }).response?.data?.error || '提交申请失败')
                                  : '提交申请失败';
                                alert(msg);
                              } finally {
                                setIsLoading(false);
                              }
                            }}
                            disabled={isLoading || !server?.id}
                            className="ml-3 px-3 py-1 bg-discord-blue hover:bg-blue-600 disabled:bg-gray-600 disabled:cursor-not-allowed text-white text-sm rounded transition-colors"
                          >
                            申请加入
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
