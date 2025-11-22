import React, { useState } from 'react';

interface UserAvatarProps {
  username: string;
  avatarUrl?: string | null;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
}

const sizeClasses = {
  sm: 'w-8 h-8 text-xs',
  md: 'w-10 h-10 text-sm',
  lg: 'w-16 h-16 text-xl',
  xl: 'w-24 h-24 text-3xl',
};

/**
 * 用户头像组件
 * 如果有头像URL则显示头像图片，否则显示用户名首字符作为默认头像
 */
export const UserAvatar: React.FC<UserAvatarProps> = ({
  username,
  avatarUrl,
  size = 'md',
  className = '',
}) => {
  const [imageError, setImageError] = useState(false);

  // 获取用户名首字符（大写）
  const getInitial = (name: string): string => {
    if (!name || name.length === 0) return '?';
    return name.charAt(0).toUpperCase();
  };

  // 根据用户名生成背景颜色（使用哈希算法保证同一用户名颜色一致）
  const getBackgroundColor = (name: string): string => {
    const colors = [
      'bg-discord-blue',
      'bg-discord-green',
      'bg-discord-red',
      'bg-purple-600',
      'bg-pink-600',
      'bg-yellow-600',
      'bg-indigo-600',
      'bg-teal-600',
    ];
    
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
      hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }
    
    return colors[Math.abs(hash) % colors.length];
  };

  const sizeClass = sizeClasses[size];

  // 🟢 修复：更稳健的 URL 拼接逻辑
  const getAvatarUrl = (url: string | null | undefined): string | null => {
    if (!url) return null;
    
    // 1. 如果是 base64 或 blob，直接返回
    if (url.startsWith('data:') || url.startsWith('blob:')) return url;
    
    // 2. 如果是完整 URL (http/https)，直接返回
    if (url.startsWith('http://') || url.startsWith('https://')) return url;

    // 3. 处理相对路径
    let envApiUrl = import.meta.env.VITE_API_URL ?? '';

    // 移除末尾的 /api (如果存在)
    if (envApiUrl.endsWith('/api')) {
      envApiUrl = envApiUrl.replace(/\/api$/, '');
    }
    // 移除末尾的斜杠 (防止双斜杠问题)
    if (envApiUrl.endsWith('/')) {
      envApiUrl = envApiUrl.slice(0, -1);
    }

    // 确保路径以 / 开头
    const normalizedPath = url.startsWith('/') ? url : `/${url}`;

    // 拼接结果
    // 如果 envApiUrl 为空字符串 (例如原本是 / 被去掉了)，结果就是 /uploads/... (正确的相对路径)
    return `${envApiUrl}${normalizedPath}`;
  };

  const fullAvatarUrl = getAvatarUrl(avatarUrl);

  if (fullAvatarUrl && !imageError) {
    return (
      <img
        src={fullAvatarUrl}
        alt={username}
        crossOrigin="anonymous"
        className={`${sizeClass} rounded-full object-cover flex-shrink-0 ${className}`}
        onError={() => {
          // 仅在开发模式或调试时打印错误，防止生产环境刷屏
          // console.error('Failed to load avatar:', fullAvatarUrl); 
          setImageError(true);
        }}
      />
    );
  }

  return (
    <div
      className={`${sizeClass} rounded-full ${getBackgroundColor(username)} flex items-center justify-center text-white font-semibold flex-shrink-0 ${className}`}
    >
      {getInitial(username)}
    </div>
  );
};