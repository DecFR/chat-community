import axios from 'axios';

// 统一 API 基址：确保恰好包含一次 /api
const RAW_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3000';
const BASE_NO_API = RAW_BASE.replace(/\/?api\/?$/i, '');
const API_URL = `${BASE_NO_API.replace(/\/$/, '')}/api`;

export const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// 请求拦截器 - 添加 token
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// 响应拦截器 - 处理错误
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('token');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

// 认证 API
export const authAPI = {
  register: (data: { username: string; password: string; email?: string; inviteCode?: string }) =>
    api.post('/auth/register', data),
  login: (data: { username: string; password: string }) =>
    api.post('/auth/login', data),
  getMe: () => api.get('/auth/me'),
  checkUsers: () => api.get('/auth/check-users'),
};

// 用户 API
export const userAPI = {
  getProfile: (userId: string) => api.get(`/users/${userId}`),
  updateProfile: (data: any) => api.put('/users/profile', data),
  uploadAvatar: (formData: FormData) =>
    api.post('/users/avatar', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }),
  getSettings: () => api.get('/users/settings'),
  updateSettings: (data: any) => api.put('/users/settings', data),
  updatePassword: (data: { currentPassword: string; newPassword: string }) => 
    api.put('/users/password', data),
  // 使用 params 方式确保正确编码
  searchUsers: (query: string) => api.get('/users/search', { params: { q: query } }),
  checkUsername: (username: string) => api.get('/users/check-username', { params: { username } }),
};

// 好友 API
export const friendAPI = {
  sendRequest: (receiverId: string) =>
    api.post('/friends/request', { receiverId }),
  acceptRequest: (friendshipId: string) =>
    api.post(`/friends/${friendshipId}/accept`),
  declineRequest: (friendshipId: string) =>
    api.post(`/friends/${friendshipId}/decline`),
  getFriends: () => api.get('/friends'),
  getPendingRequests: () => api.get('/friends/pending'),
  removeFriend: (friendshipId: string) =>
    api.delete(`/friends/${friendshipId}`),
};

// 服务器 API
export const serverAPI = {
  createServer: (data: { name: string; description?: string }) =>
    api.post('/servers', data),
  getServers: () => api.get('/servers'),
  searchServers: (q: string) => api.get('/servers/search', { params: { q } }),
  getServer: (serverId: string) => api.get(`/servers/${serverId}`),
  updateServer: (serverId: string, data: { name?: string; description?: string; isPublic?: boolean }) =>
    api.put(`/servers/${serverId}`, data),
  deleteServer: (serverId: string) => api.delete(`/servers/${serverId}`),
  leaveServer: (serverId: string) => api.delete(`/servers/${serverId}/leave`),
  createChannel: (serverId: string, data: { name: string; description?: string; type?: string }) =>
    api.post(`/servers/${serverId}/channels`, data),
  updateChannel: (serverId: string, channelId: string, data: { name?: string; description?: string }) =>
    api.put(`/servers/${serverId}/channels/${channelId}`, data),
  deleteChannel: (serverId: string, channelId: string) =>
    api.delete(`/servers/${serverId}/channels/${channelId}`),
  // 加入申请
  createJoinRequest: (serverId: string, reason?: string) =>
    api.post(`/servers/${serverId}/join-requests`, { reason }),
  getJoinRequests: (serverId: string) =>
    api.get(`/servers/${serverId}/join-requests`),
  reviewJoinRequest: (serverId: string, requestId: string, data: { approved: boolean; reviewNote?: string }) =>
    api.post(`/servers/${serverId}/join-requests/${requestId}/review`, data),
};

// 服务器申请 API
export const serverRequestAPI = {
  createRequest: (data: { name: string; description?: string; reason: string }) =>
    api.post('/server-requests', data),
  getMyRequests: () => api.get('/servers/my-join-requests'),
  getAllRequests: () => api.get('/server-requests'),
  getPendingRequests: () => api.get('/server-requests/pending'),
  reviewRequest: (requestId: string, data: { approved: boolean; reviewNote?: string }) =>
    api.post(`/server-requests/${requestId}/review`, data),
  deleteRequest: (requestId: string) => api.delete(`/server-requests/${requestId}`),
};

// 消息 API
export const messageAPI = {
  getChannelMessages: (channelId: string, limit = 50, before?: string, after?: string) =>
    api.get(`/messages/channel/${channelId}`, { params: { limit, before, after } }),
  getChannelState: (channelId: string) =>
    api.get(`/messages/channel/${channelId}/state`),
  getConversationMessages: (conversationId: string, limit = 50, before?: string, after?: string) =>
    api.get(`/messages/conversation/${conversationId}`, { params: { limit, before, after } }),
  getConversationState: (friendId: string) =>
    api.get(`/messages/conversation/${friendId}/state`),
  uploadAttachment: (formData: FormData) =>
    api.post('/messages/upload', formData, { headers: { 'Content-Type': 'multipart/form-data' } }),
};

// 管理员 API
export const adminAPI = {
  getUsers: () => api.get('/admin/users'),
  getServers: () => api.get('/admin/servers'),
  deleteUser: (userId: string) => api.delete(`/admin/users/${userId}`),
  deleteServer: (serverId: string) => api.delete(`/admin/servers/${serverId}`),
  // 邀请码管理
  generateInviteCode: (userId?: string, expiresInDays?: number) => 
    api.post('/admin/invite-codes', { userId, expiresInDays }),
  getInviteCodes: () => api.get('/admin/invite-codes'),
  // 用户角色管理
  updateUserRole: (userId: string, role: 'ADMIN' | 'USER') =>
    api.patch(`/admin/users/${userId}/role`, { role }),
  // 系统统计
  getStats: () => api.get('/admin/stats'),
  // 清理消息
  cleanMessages: (channelId?: string, conversationId?: string) => 
    api.delete('/admin/messages', { params: { channelId, conversationId } }),
  // 手动清理未使用头像
  cleanupAvatars: (maxAgeMs?: number) =>
    api.post('/admin/maintenance/cleanup-avatars', typeof maxAgeMs === 'number' ? { maxAgeMs } : {}),
  // 持久化配置：头像清理
  getAvatarCleanupConfig: () => api.get('/admin/config/cleanup-avatars'),
  updateAvatarCleanupConfig: (data: { maxAgeMs?: number; intervalMs?: number }) =>
    api.put('/admin/config/cleanup-avatars', data),
  // 系统信息
  getSystemInfo: () => api.get('/admin/system-info'),
  // 线程池配置
  getThreadPoolConfig: () => api.get('/admin/config/thread-pool'),
  updateThreadPoolConfig: (data: { maxThreads?: number }) =>
    api.put('/admin/config/thread-pool', data),
  // 管理员通知
  getAdminNotifications: () => api.get('/admin/notifications'),
};

// 邀请码 API
export const inviteAPI = {
  // 用户邀请码
  generateUserInvite: (expiresInDays?: number) =>
    api.post('/invites/user', { expiresInDays }),
  getUserInvites: () => api.get('/invites/user'),
  deleteUserInvite: (id: string) => api.delete(`/invites/user/${id}`),
  validateUserInvite: (code: string) => api.post('/invites/validate/user', { code }),
  // 服务器邀请码
  generateServerInvite: (serverId: string, expiresInDays?: number) =>
    api.post('/invites/server', { serverId, expiresInDays }),
  getServerInvites: (serverId: string) => api.get(`/invites/server/${serverId}`),
  deleteServerInvite: (id: string) => api.delete(`/invites/server/${id}`),
  joinByInvite: (code: string) => api.post(`/invites/join/${code}`),
};

export default api;
