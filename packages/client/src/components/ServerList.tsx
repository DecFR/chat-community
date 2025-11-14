import { useServerStore } from '../stores/serverStore';
import { useAuthStore } from '../stores/authStore';
import { useNavigate } from 'react-router-dom';
import { useState, useEffect, useRef } from 'react';
import { serverRequestAPI } from '../lib/api';

export default function ServerList() {
  const { servers, currentServerId, selectServer, createServer, isServersLoaded } = useServerStore();
  const { user } = useAuthStore();
  const navigate = useNavigate();
  const [isCreating, setIsCreating] = useState(false);
  const hasAutoSelected = useRef(false); // 标记是否已经自动选择过服务器（仅首轮）
  const initialPathRef = useRef<string>(window.location.pathname); // 记录挂载时的URL

  const handleHomeClick = () => {
    // 先清空状态，然后导航
    selectServer('');
    navigate('/app', { replace: true });
  };

  const handleServerClick = (serverId: string) => {
    const server = servers.find(s => s.id === serverId);
    
    if (!server) {
      console.error(`Server ${serverId} not found`);
      alert('未找到服务器，请刷新页面后重试。');
      return;
    }
    
    if (!server.channels || server.channels.length === 0) {
      console.warn(`Server ${serverId} has no channels.`);
      alert('该服务器还没有频道，请刷新页面后重试或联系管理员。');
      return;
    }
    
    selectServer(serverId);
    navigate(`/app/channel/${server.channels[0].id}`);
  };

  // 首次加载：仅依据“初始URL”决定是否需要根据频道自动选中服务器
  // 这样后续从频道返回 /app 时，不会被此逻辑再次干扰
  useEffect(() => {
    const pathname = initialPathRef.current;
    if (isServersLoaded && !hasAutoSelected.current && pathname.includes('/app/channel/')) {
      const pathParts = pathname.split('/');
      const channelIdFromUrl = pathParts[pathParts.length - 1];

      for (const server of servers) {
        if (server.channels.some(c => c.id === channelIdFromUrl)) {
          selectServer(server.id);
          hasAutoSelected.current = true;
          break;
        }
      }
    }
  }, [isServersLoaded, servers, selectServer]);

  const handleAddServer = async () => {
    if (isCreating) return;

    if (user?.role === 'ADMIN') {
      // 管理员直接创建
      const serverName = prompt('请输入服务器名称：');
      if (!serverName || !serverName.trim()) return;

      const description = prompt('请输入服务器描述（可选）：');

      try {
        setIsCreating(true);
        await createServer(serverName.trim(), description?.trim());
        alert('服务器创建成功！');
      } catch (error: unknown) {
        const errorMessage = error instanceof Error && 'response' in error
          ? ((error as { response?: { data?: { error?: string } } }).response?.data?.error || '创建服务器失败')
          : '创建服务器失败';
        alert(errorMessage);
      } finally {
        setIsCreating(false);
      }
    } else {
      // 普通用户需要申请
        const description = prompt('请输入服务器描述（可选）：');
      
      const serverName = prompt('请输入服务器名称：');
      if (!serverName || !serverName.trim()) return;
      
      const reason = prompt('请说明创建服务器的理由：');
      if (!reason || !reason.trim()) {
        alert('必须提供创建理由');
        return;
      }
      
      try {
        setIsCreating(true);
        await serverRequestAPI.createRequest({
          name: serverName.trim(),
          description: description?.trim(),
          reason: reason.trim(),
        });
        alert('申请已提交！\n\n请等待管理员审批。您可以在设置中查看申请状态。');
      } catch (error: unknown) {
        const errorMessage = error instanceof Error && 'response' in error
          ? ((error as { response?: { data?: { error?: string } } }).response?.data?.error || '提交申请失败')
          : '提交申请失败';
        alert(errorMessage);
      } finally {
        setIsCreating(false);
      }
    }
  };

  return (
    <div className="w-18 bg-discord-darkest flex flex-col items-center py-3 space-y-2 overflow-y-auto scrollbar-thin">
      {/* Home 按钮 */}
      <button
        onClick={handleHomeClick}
        className={`w-12 h-12 rounded-full flex items-center justify-center transition-all ${
          !currentServerId
            ? 'bg-discord-blue text-white'
            : 'bg-discord-gray text-discord-light-gray hover:bg-discord-blue hover:text-white hover:rounded-2xl'
        }`}
        title="回到主页"
      >
        <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 20 20">
          <path d="M10.707 2.293a1 1 0 00-1.414 0l-7 7a1 1 0 001.414 1.414L4 10.414V17a1 1 0 001 1h2a1 1 0 001-1v-2a1 1 0 011-1h2a1 1 0 011 1v2a1 1 0 001 1h2a1 1 0 001-1v-6.586l.293.293a1 1 0 001.414-1.414l-7-7z" />
        </svg>
      </button>

      <div className="w-8 h-0.5 bg-discord-gray rounded-full"></div>

      {/* 服务器列表 */}
      {servers.map((server) => (
        <button
          key={server.id}
          onClick={() => handleServerClick(server.id)}
          className={`w-12 h-12 rounded-full flex items-center justify-center font-semibold transition-all ${
            currentServerId === server.id
              ? 'bg-discord-blue text-white rounded-2xl'
              : 'bg-discord-gray text-white hover:bg-discord-blue hover:rounded-2xl'
          }`}
          title={server.name}
        >
          {server.imageUrl ? (
            <img src={server.imageUrl} alt={server.name} className="w-full h-full rounded-full object-cover" />
          ) : (
            <span className="text-lg">{server.name.substring(0, 2).toUpperCase()}</span>
          )}
        </button>
      ))}

      {/* 添加服务器按钮 */}
      <button
        onClick={handleAddServer}
        className="w-12 h-12 rounded-full bg-discord-gray text-discord-green hover:bg-discord-green hover:text-white hover:rounded-2xl transition-all flex items-center justify-center text-2xl"
        title="添加服务器"
      >
        +
      </button>

      {/* 管理员设置按钮 */}
      {user?.role === 'ADMIN' && (
        <>
          <div className="w-8 h-0.5 bg-discord-gray rounded-full"></div>
          <button
            onClick={() => {
              selectServer(null!);
              navigate('/app/admin');
            }}
            className="w-12 h-12 rounded-full bg-discord-gray text-orange-500 hover:bg-orange-600 hover:text-white hover:rounded-2xl transition-all flex items-center justify-center"
            title="管理员面板"
          >
            <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.533 1.533 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.533 1.533 0 01.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z" clipRule="evenodd" />
            </svg>
          </button>
        </>
      )}
    </div>
  );
}
