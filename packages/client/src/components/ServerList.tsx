import { useServerStore } from '../stores/serverStore';
import { useAuthStore } from '../stores/authStore';
import { useNavigate } from 'react-router-dom';

export default function ServerList() {
  const { servers, currentServerId, selectServer } = useServerStore();
  const { user } = useAuthStore();
  const navigate = useNavigate();

  const handleHomeClick = () => {
    selectServer(null!);
    navigate('/app'); // 导航到主页面（好友列表）
  };

  const handleAddServer = () => {
    const serverName = prompt('请输入服务器名称：');
    if (serverName && serverName.trim()) {
      // TODO: 调用创建服务器的API
      alert('创建服务器功能开发中...\n服务器名称：' + serverName);
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
          onClick={() => selectServer(server.id)}
          className={`w-12 h-12 rounded-full flex items-center justify-center font-semibold transition-all ${
            currentServerId === server.id
              ? 'bg-discord-blue text-white rounded-2xl'
              : 'bg-discord-gray text-white hover:bg-discord-blue hover:rounded-2xl'
          }`}
          title={server.name}
        >
          {server.iconUrl ? (
            <img src={server.iconUrl} alt={server.name} className="w-full h-full rounded-full object-cover" />
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

      {/* 管理员面板按钮 */}
      {user?.role === 'ADMIN' && (
        <>
          <div className="w-8 h-0.5 bg-discord-gray rounded-full"></div>
          <button
            onClick={() => navigate('/app/admin')}
            className="w-12 h-12 rounded-full bg-discord-gray text-discord-red hover:bg-discord-red hover:text-white hover:rounded-2xl transition-all flex items-center justify-center"
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
