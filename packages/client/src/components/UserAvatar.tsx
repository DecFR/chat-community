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

  // 构建完整的头像URL（头像文件名每次上传都会变化，无需时间戳防缓存）
  const getAvatarUrl = (url: string | null | undefined): string | null => {
    if (!url) return null;
    // 支持 data/blob 协议
    if (url.startsWith('data:') || url.startsWith('blob:')) return url;
    // 如果是完整URL，直接返回
    if (url.startsWith('http://') || url.startsWith('https://')) return url;
    // 如果是相对路径，补全API_URL
    const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';
    const baseUrl = API_URL.endsWith('/api') ? API_URL.replace('/api', '') : API_URL; // 移除 /api 后缀
    // 兼容缺少前导斜杠的路径
    const normalized = url.startsWith('/') ? url : `/${url}`;
    return `${baseUrl}${normalized}`;
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
          console.error('Failed to load avatar:', fullAvatarUrl);
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
