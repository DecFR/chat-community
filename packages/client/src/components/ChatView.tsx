// 状态点颜色变量
  // 状态点颜色变量已在下方声明并使用，无需重复声明
import { useEffect, useState, useRef, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { useServerStore } from '../stores/serverStore';
import { useFriendStore } from '../stores/friendStore';
import { useAuthStore } from '../stores/authStore';
import { messageAPI } from '../lib/api';
import { socketService } from '../lib/socket';
import { UserAvatar } from './UserAvatar';
import { useUnreadStore } from '../stores/unreadStore';
import TypingIndicator from './TypingIndicator';
import { uploadFileInChunks } from '../lib/chunkUploader';
import Toasts from './Toasts';
import { useToastStore } from '../stores/toastStore';

interface Message {
  id: string;
  content: string;
  authorId: string;
  author: {
    id: string;
    username: string;
    avatarUrl?: string;
  };
  createdAt: string;
  attachments?: Array<{
    id?: string;
    url: string;
    type: 'IMAGE' | 'VIDEO' | 'FILE';
    filename?: string;
    mimeType?: string;
    size?: number;
    width?: number;
    height?: number;
    durationMs?: number;
  }>;
}

interface ChatViewProps {
  isDM?: boolean;
}

// 定义带 _key 的消息类型，避免 any
interface MessageWithKey extends Message {
  _key?: string;
}

export default function ChatView({ isDM = false }: ChatViewProps) {
    // 顶部唯一声明 currentFriend、rateLimitWaitMs、uploadProgress
  const { channelId, friendId } = useParams();
  const { servers, isLoading: isLoadingServers } = useServerStore();
  const { friends } = useFriendStore();
  const { user } = useAuthStore();
  // const { decrementDM, decrementChannel } = useUnreadStore(); // 未使用，已移除

  // 统一声明
  const [rateLimitWaitMs, setRateLimitWaitMs] = useState(0);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const currentFriend = isDM && friendId ? friends.find(f => f.id === friendId) : null;

  // 获取当前频道信息（如果是频道模式）
  let currentChannel = null;
  if (!isDM && channelId) {
    for (const s of servers) {
      const found = s.channels.find(c => c.id === channelId);
      if (found) {
        currentChannel = found;
        break;
      }
    }
  }

  // 状态点颜色变量
  let statusColor = 'bg-gray-500';
  if (isDM && currentFriend) {
    if (currentFriend.status === 'ONLINE') statusColor = 'bg-green-500';
    else if (currentFriend.status === 'IDLE') statusColor = 'bg-yellow-500';
    else if (currentFriend.status === 'DO_NOT_DISTURB') statusColor = 'bg-red-500';
  }
  const statusDot = isDM && currentFriend ? (
    <div className={`w-2 h-2 rounded-full ${statusColor}`}></div>
  ) : null;

  const progressValue = typeof uploadProgress === 'number' ? uploadProgress : 0;
  const inputClass = `flex-1 px-2 py-3 bg-transparent text-white placeholder-gray-500 focus:outline-none${rateLimitWaitMs > 0 ? ' opacity-60 cursor-not-allowed' : ''}`;

  // 构建完整的媒体URL
  const getMediaUrl = (url: string | null | undefined): string => {
    if (!url) return '';
    // 如果是完整URL,直接返回
    if (url.startsWith('http://') || url.startsWith('https://')) {
      return url;
    }
    // 如果是相对路径,补全API_URL
    const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';
    const baseUrl = API_URL.replace('/api', ''); // 移除 /api 后缀
    return `${baseUrl}${url}`;
  };

  // 已在顶部声明，无需重复

  useEffect(() => {
    if (!isDM) {
      const sock = socketService.getSocket();
      const prev = prevChannelRef.current;
      if (prev && prev !== channelId) {
        sock?.emit('leaveChannel', { channelId: prev });
      }
      if (channelId) {
        sock?.emit('joinChannel', { channelId });
        prevChannelRef.current = channelId;
      }
      return () => {
        if (channelId) sock?.emit('leaveChannel', { channelId });
      };
    }
  }, [isDM, channelId]);

  const [messages, setMessages] = useState<Message[]>([]);
  const messagesRef = useRef<Message[]>([]);
  useEffect(() => { messagesRef.current = messages; }, [messages]);
  const loadSeqRef = useRef(0);
  const [newMessage, setNewMessage] = useState('');
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [lastReadMessageId, setLastReadMessageId] = useState<string | null>(null);
  const [dmConversationId, setDmConversationId] = useState<string | null>(null);
  const prevChannelRef = useRef<string | null>(null);
  const prevConversationRef = useRef<string | null>(null);
  const [typingUsers, setTypingUsers] = useState<string[]>([]);
  const typingTimeoutsRef = useRef<Record<string, number>>({});
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const loadMoreTriggerRef = useRef<HTMLDivElement>(null);
  const firstUnreadRef = useRef<HTMLDivElement>(null);
  const [firstUnreadIndex, setFirstUnreadIndex] = useState<number | null>(null);
  // 追踪上一次加载的目标ID,防止不必要的重新加载导致消息丢失
  const lastLoadedTargetRef = useRef<string>('');
  const [isNearBottom, setIsNearBottom] = useState(true);
  // 已在顶部声明，无需重复
  const rateLimitTimerRef = useRef<number | null>(null);
  // uploadProgress 已在顶部声明，移除重复声明
  const [uploadFileName, setUploadFileName] = useState<string | null>(null);
  const toastStore = useToastStore();

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  // scrollToFirstUnread 已不再使用，移除以避免未使用警告

  // 获取已读位置
  useEffect(() => {
    const targetId = isDM ? friendId : channelId;
    if (!targetId || !user) return;
    
    const key = `lastRead_${user.id}_${targetId}`;
    const savedLastRead = localStorage.getItem(key);
    setLastReadMessageId(savedLastRead);
  }, [isDM, friendId, channelId, user]);

  // 计算并按阅读量递减未读计数，然后标记为已读
  const markAsRead = useCallback(() => {
    const targetId = isDM ? friendId : channelId;
    if (!targetId || !user || messages.length === 0) return;
    
    const lastMessage = messages[messages.length - 1];
    const key = `lastRead_${user.id}_${targetId}`;

    localStorage.setItem(key, lastMessage.id);
    setLastReadMessageId(lastMessage.id);

    // 同步服务端阅读位置
    if (isDM && dmConversationId) {
      socketService.markConversationAsRead(dmConversationId, lastMessage.id);
      if (friendId) {
        // 直接清零未读计数
        const { clearDM } = useUnreadStore.getState();
        clearDM(friendId);
      }
    } else if (!isDM && channelId) {
      socketService.markChannelAsRead(channelId, lastMessage.id);
      // 直接清零未读计数
      const { clearChannel } = useUnreadStore.getState();
      clearChannel(channelId);
    }
  }, [isDM, friendId, channelId, user, messages, dmConversationId]);

  // 首次加载消息
  useEffect(() => {
    const loadMessages = async () => {
      const mySeq = ++loadSeqRef.current;
      const targetId = isDM ? friendId : channelId;
      // 离开会话/频道时清理
      if (!targetId) {
        setMessages([]);
        setDmConversationId(null);
        lastLoadedTargetRef.current = '';
        return;
      }
      // 如果是同一个目标且已有消息,不重复加载(防止切换tab时重复请求)
      if (lastLoadedTargetRef.current === targetId && messages.length > 0) return;
      lastLoadedTargetRef.current = targetId;

      const key = `lastRead_${user?.id}_${targetId}`;
      const savedLastRead = localStorage.getItem(key);
      setIsLoading(true);

      try {
        if (isDM && friendId) {
          const stateResponse = await messageAPI.getConversationState(friendId);
          const conversationId = stateResponse.data.data?.conversationId;
          setDmConversationId(conversationId || null);
          if (!conversationId) {
            setMessages([]);
            setHasMore(false);
          } else {
            // 始终加载最新 N 条，避免基于 lastRead 导致最新一条缺失
            const res = await messageAPI.getConversationMessages(conversationId, 50);
            const loaded = (res.data.data || []) as Message[];
            const uniqueMap = new Map<string, Message>();
            loaded.forEach((m: Message, idx) => {
              const key = m.id || `temp-${idx}-${Date.now()}-${Math.random()}`;
              (m as MessageWithKey)._key = key;
              uniqueMap.set(key, m);
            });
            const list = Array.from(uniqueMap.values()).sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
            if (mySeq === loadSeqRef.current) setMessages(list);
            setHasMore(loaded.length === 50);

            // 计算未读分隔线位置（如命中则在该元素后显示）
            if (savedLastRead) {
              const idx = list.findIndex(m => m.id === savedLastRead || (m as MessageWithKey)._key === savedLastRead);
              setFirstUnreadIndex(idx >= 0 ? idx + 1 : null);
            }
          }
        } else if (channelId) {
          // 频道：同样加载最新 N 条
          const res = await messageAPI.getChannelMessages(channelId, 50);
          const loaded = (res.data.data || []) as Message[];
          const uniqueMap = new Map<string, Message>();
          loaded.forEach((m: Message, idx) => {
            const key = m.id || `temp-${idx}-${Date.now()}-${Math.random()}`;
            (m as MessageWithKey)._key = key;
            uniqueMap.set(key, m);
          });
          const list = Array.from(uniqueMap.values()).sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
          if (mySeq === loadSeqRef.current) setMessages(list);
          setHasMore(loaded.length === 50);

          // 读取服务端 lastRead 仅用于定位分隔线，不影响加载范围
          const stateRes = await messageAPI.getChannelState(channelId);
          const serverLastRead = stateRes.data.data?.lastReadMessageId as string | undefined;
          const effectiveLastRead = savedLastRead || serverLastRead;
          if (effectiveLastRead) {
            const idx = list.findIndex(m => m.id === effectiveLastRead || (m as MessageWithKey)._key === effectiveLastRead);
            setFirstUnreadIndex(idx >= 0 ? idx + 1 : null);
          }
        }

        // 滚动行为:始终滚动到底部(最新消息)
        setTimeout(() => scrollToBottom(), 100);
      } finally {
        setIsLoading(false);
      }
    };
    loadMessages();
  }, [isDM, friendId, channelId, user?.id, messages.length]);

  // 加载更多消息(历史记录)
  const loadMoreMessages = useCallback(async () => {
    if (isLoadingMore || !hasMore || messages.length === 0) return;

    setIsLoadingMore(true);
    try {
      const oldestMessage = messages[0];
      let response;
      
      if (isDM && friendId) {
        // 私聊模式: 优先使用已有会话ID，避免重复请求
        let conversationId = dmConversationId;
        if (!conversationId) {
          const stateRes = await messageAPI.getConversationState(friendId);
          conversationId = stateRes.data.data.conversationId;
          setDmConversationId(conversationId || null);
        }
        if (!conversationId) {
          setIsLoadingMore(false);
          return;
        }
        response = await messageAPI.getConversationMessages(conversationId, 50, oldestMessage.id);
      } else if (channelId) {
        // 频道模式
        response = await messageAPI.getChannelMessages(channelId, 50, oldestMessage.id);
      } else {
        setIsLoadingMore(false);
        return;
      }
      
      const olderMessages = response.data.data;
      
      if (olderMessages.length > 0) {
        // 保存当前滚动位置
        const container = messagesContainerRef.current;
        const scrollHeightBefore = container?.scrollHeight || 0;
        
        setMessages((prev) => {
          const merged: Message[] = [...olderMessages, ...prev];
          const uniqueMap = new Map<string, Message>();
          merged.forEach((m: Message, idx) => {
            const key = m.id || (m as MessageWithKey)._key || `temp-${idx}-${Date.now()}-${Math.random()}`;
            (m as MessageWithKey)._key = key;
            uniqueMap.set(key, m);
          });
          const unique = Array.from(uniqueMap.values()).sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
          return unique;
        });
        setHasMore(olderMessages.length === 50);
        
        // 恢复滚动位置，避免跳动
        setTimeout(() => {
          if (container) {
            const scrollHeightAfter = container.scrollHeight;
            container.scrollTop = scrollHeightAfter - scrollHeightBefore;
          }
        }, 0);
      } else {
        setHasMore(false);
      }
    } catch (error) {
      console.error('Failed to load more messages:', error);
    } finally {
      setIsLoadingMore(false);
    }
  }, [isLoadingMore, hasMore, messages, isDM, friendId, channelId, dmConversationId]);

  // 进入/离开私聊会话房间（用于 typing 等）
  useEffect(() => {
    if (isDM) {
      const sock = socketService.getSocket();
      const prev = prevConversationRef.current;
      if (prev && prev !== dmConversationId) {
        sock?.emit('leaveConversation', { conversationId: prev });
      }
      if (dmConversationId) {
        sock?.emit('joinConversation', { conversationId: dmConversationId });
        prevConversationRef.current = dmConversationId;
      }
      return () => {
        if (dmConversationId) sock?.emit('leaveConversation', { conversationId: dmConversationId });
      };
    }
  }, [isDM, dmConversationId]);

  // Intersection Observer 监听滚动到顶部
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !isLoadingMore) {
          loadMoreMessages();
        }
      },
      { threshold: 1.0 }
    );

    const trigger = loadMoreTriggerRef.current;
    if (trigger) {
      observer.observe(trigger);
    }

    return () => {
      if (trigger) {
        observer.unobserve(trigger);
      }
    };
  }, [hasMore, isLoadingMore, loadMoreMessages]);

  // 监听滚动位置，检测是否在底部
  useEffect(() => {
    const container = messagesContainerRef.current;
    if (!container) return;

    const handleScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = container;
      const distanceFromBottom = scrollHeight - scrollTop - clientHeight;
      const nearBottom = distanceFromBottom < 100; // 100px阈值
      setIsNearBottom(nearBottom);

      // 如果滚动到底部，清零未读计数
      if (nearBottom && messages.length > 0) {
        markAsRead();
      }
    };

    container.addEventListener('scroll', handleScroll);
    return () => container.removeEventListener('scroll', handleScroll);
  }, [messages.length, isDM, friendId, channelId, markAsRead]);

  // 监听新消息
  useEffect(() => {
    const targetId = isDM ? friendId : channelId;
    if (!targetId) return;

    const currentUserId = user?.id;
    const socket = socketService.getSocket();
    if (!socket) return;

    const handleNewMessage = (message: Message & { channelId?: string; directMessageConversationId?: string }) => {
      // 只处理频道消息，必须有 channelId 且没有 directMessageConversationId
      if (!isDM && message.channelId && !message.directMessageConversationId && message.channelId === targetId) {
        setMessages((prev) => {
          const exists = prev.some(m => (m as MessageWithKey)._key ? (m as MessageWithKey)._key === ((message as MessageWithKey)._key || message.id) : m.id === message.id);
          if (exists) return prev;
          const merged = [...prev, message];
          const uniq = new Map<string, Message>();
          merged.forEach((m: Message, idx) => {
            const key = (m as MessageWithKey)._key || m.id || `temp-${idx}-${Date.now()}-${Math.random()}`;
            (m as MessageWithKey)._key = key;
            uniq.set(key, m);
          });
          return Array.from(uniq.values());
        });
        // 自动滚动到底部并标记已读
        setTimeout(() => scrollToBottom(), 100);
        setTimeout(() => markAsRead(), 500);
      }
    };

    const handleDirectMessage = (message: Message & { directMessageConversationId?: string }) => {
      // 检查消息是否属于当前DM会话
      if (isDM && friendId) {
        // 消息应该显示在当前会话中(发送者是当前用户或好友)
        const isMyMessage = message.authorId === currentUserId;
        const isFriendMessage = message.authorId === friendId;
        
        if (isMyMessage || isFriendMessage) {
          setMessages((prev) => {
            const exists = prev.some(m => (m as MessageWithKey)._key ? (m as MessageWithKey)._key === ((message as MessageWithKey)._key || message.id) : m.id === message.id);
            if (exists) return prev;
            const merged = [...prev, message];
            const uniq = new Map<string, Message>();
            merged.forEach((m: Message, idx) => {
              const key = (m as MessageWithKey)._key || m.id || `temp-${idx}-${Date.now()}-${Math.random()}`;
              (m as MessageWithKey)._key = key;
              uniq.set(key, m);
            });
            return Array.from(uniq.values());
          });
          // 自动滚动到底部并标记已读
          setTimeout(() => scrollToBottom(), 100);
          setTimeout(() => markAsRead(), 500);
        }
      }
    };

    // 先移除可能存在的旧监听器
    socket.off('channelMessage');
    socket.off('directMessage');
    socket.off('friendProfileUpdate');
    socket.off('userProfileUpdate');
    socket.off('messageRateLimited');
    
    // 注册新监听器
    socket.on('channelMessage', handleNewMessage);
    socket.on('directMessage', handleDirectMessage);

    // 速率限制提示
    const handleRateLimited = (data: { waitMs: number }) => {
      if (data.waitMs > 0) {
        setRateLimitWaitMs(data.waitMs);
        if (rateLimitTimerRef.current) window.clearInterval(rateLimitTimerRef.current);
        const start = Date.now();
        rateLimitTimerRef.current = window.setInterval(() => {
          const elapsed = Date.now() - start;
          const remain = data.waitMs - elapsed;
          if (remain <= 0) {
            setRateLimitWaitMs(0);
            if (rateLimitTimerRef.current) window.clearInterval(rateLimitTimerRef.current);
            rateLimitTimerRef.current = null;
          } else {
            setRateLimitWaitMs(remain);
          }
        }, 120);
      }
    };
    socket.on('messageRateLimited', handleRateLimited);

    // 监听好友资料更新,实时刷新聊天消息中的头像
    const handleProfileUpdate = (data: { userId: string; avatarUrl?: string; username?: string }) => {
      setMessages((prev) =>
        prev.map((msg) =>
          msg.authorId === data.userId
            ? {
                ...msg,
                author: {
                  ...msg.author,
                  ...(data.avatarUrl !== undefined && { avatarUrl: data.avatarUrl }),
                  ...(data.username && { username: data.username }),
                },
              }
            : msg
        )
      );
    };

    socket.on('friendProfileUpdate', handleProfileUpdate);
    socket.on('userProfileUpdate', handleProfileUpdate);
    
    // 监听好友删除事件
    const handleFriendRemoved = (data: { friendId: string }) => {
      if (isDM && friendId === data.friendId) {
        // 清空消息并返回主页
        setMessages([]);
        lastLoadedTargetRef.current = '';
        window.location.href = '/app';
      }
    };
    socket.on('friendRemoved', handleFriendRemoved);

    return () => {
      socket.off('channelMessage', handleNewMessage);
      socket.off('directMessage', handleDirectMessage);
      socket.off('friendProfileUpdate', handleProfileUpdate);
      socket.off('userProfileUpdate', handleProfileUpdate);
      socket.off('friendRemoved', handleFriendRemoved);
      socket.off('messageRateLimited', handleRateLimited);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDM, friendId, channelId, user?.id]);

  // 监听正在输入事件并管理显示列表
  useEffect(() => {
    const socket = socketService.getSocket();
    if (!socket) return;
    
    const handleTyping = (data: { userId?: string; username?: string; channelId?: string; conversationId?: string }) => {
      const match = isDM ? data.conversationId === dmConversationId : data.channelId === channelId;
      if (!match || !data.username) return;

      setTypingUsers((prev) => (prev.includes(data.username!) ? prev : [...prev, data.username!]));

      const key = data.username!;
      if (typingTimeoutsRef.current[key]) clearTimeout(typingTimeoutsRef.current[key]);
      typingTimeoutsRef.current[key] = setTimeout(() => {
        setTypingUsers((prev) => prev.filter((u) => u !== key));
        delete typingTimeoutsRef.current[key];
      }, 3000);
    };

    socket.off('userTyping');
    socket.on('userTyping', handleTyping);
    return () => {
      socket.off('userTyping', handleTyping);
    };
  }, [isDM, channelId, dmConversationId]);

  // 当消息加载完成或有新消息时，标记为已读
  useEffect(() => {
    if (messages.length > 0 && isNearBottom) {
      // 延迟标记，给用户时间查看消息
      const timer = setTimeout(() => {
        markAsRead();
      }, 1000);
      
      return () => clearTimeout(timer);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages, isNearBottom]);

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (rateLimitWaitMs > 0) return; // 速率限制期间禁止发送
    if (!newMessage.trim() && pendingFiles.length === 0) return;

    const send = async () => {
      let attachments: Array<{
        url: string;
        type: 'IMAGE' | 'VIDEO' | 'FILE';
        filename?: string;
        mimeType?: string;
        size?: number;
      }> | undefined;
      if (pendingFiles.length > 0) {
        attachments = [];
        for (const f of pendingFiles) {
          // 附件最大 100MB
          const maxSize = 100 * 1024 * 1024;
          if (f.size > maxSize) {
            toastStore.addToast({ message: `文件过大！文件大小为 ${(f.size / 1024 / 1024).toFixed(2)} MB`, type: 'error' });
            continue;
          }
          setUploadFileName(f.name);
          // 分片上传
          await uploadFileInChunks({
            file: f,
            chunkSize: 5 * 1024 * 1024,
            onProgress: (percent) => setUploadProgress(percent),
            onError: (err) => toastStore.addToast({ message: '分片上传失败: ' + err.message, type: 'error' }),
            onComplete: (url) => {
              (attachments ?? []).push({ url, type: 'FILE', filename: f.name, mimeType: f.type, size: f.size });
              setUploadProgress(null);
              setUploadFileName(null);
              toastStore.addToast({ message: '文件上传成功', type: 'success' });
            },
          });
        }
      }

      if (isDM && friendId) {
        socketService.sendDirectMessage(friendId, newMessage, attachments);
      } else if (channelId) {
        socketService.sendChannelMessage(channelId, newMessage, attachments);
      }
    };
    send();
    setNewMessage('');
    setPendingFiles([]);
    setTimeout(() => markAsRead(), 500);
  };

  // 如果服务器数据正在加载且当前频道未找到，显示加载状态
  if (!isDM && channelId && isLoadingServers && !currentChannel) {
    return (
      <div className="flex-1 flex items-center justify-center bg-discord-gray">
        <div className="text-center">
          <div className="text-discord-light-gray">加载中...</div>
        </div>
      </div>
    );
  }

  // 如果没有选中频道或好友，显示欢迎界面
  if ((!isDM && !channelId) || (isDM && !friendId)) {
    return (
      <div className="flex-1 flex items-center justify-center bg-discord-gray">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-white mb-2">欢迎来到 Chat & Community</h2>
          <p className="text-discord-light-gray">选择一个频道或好友开始聊天</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col bg-discord-gray min-h-0 min-w-0">
      {/* 标题栏 */}
      <div className="h-12 bg-discord-darker border-b border-discord-darkest flex items-center px-4 shadow-md">
        <div className="flex items-center gap-2">
          {isDM && currentFriend ? (
            <>
              <UserAvatar
                username={currentFriend.username}
                avatarUrl={currentFriend.avatarUrl}
                size="sm"
              />
              <span className="text-white font-semibold">{currentFriend.username}</span>
              {statusDot}
            </>
          ) : (
            <>
              <span className="text-gray-400">#</span>
              <span className="text-white font-semibold">{currentChannel?.name || '频道'}</span>
            </>
          )}
        </div>
      </div>

      {/* 消息列表 */}
      <div
        ref={messagesContainerRef}
        className="flex-1 overflow-y-auto scrollbar-thin p-4 space-y-4 min-h-0"
      >
        {isLoading ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-discord-light-gray">加载中...</div>
          </div>
        ) : messages.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <p className="text-discord-light-gray">还没有消息</p>
              <p className="text-gray-500 text-sm mt-2">发送第一条消息开始聊天吧！</p>
            </div>
          </div>
        ) : (
          <>
            {/* 加载更多触发器 */}
            <div ref={loadMoreTriggerRef} className="h-1">
              {isLoadingMore && (
                <div className="flex justify-center py-2">
                  <div className="text-discord-light-gray text-sm">加载更多消息...</div>
                </div>
              )}
              {!hasMore && messages.length > 0 && (
                <div className="flex justify-center py-2">
                  <div className="text-gray-500 text-sm">没有更多消息了</div>
                </div>
              )}
            </div>

            {messages.map((message, index) => {
            // 检查是否需要显示未读分隔线
            const showUnreadDivider =
              (firstUnreadIndex !== null && index === firstUnreadIndex) ||
              (lastReadMessageId && index > 0 && messages[index - 1].id === lastReadMessageId && message.authorId !== user?.id);

            const renderKey = (message as MessageWithKey)._key || message.id;
            return (
              <div key={renderKey}>
                {showUnreadDivider && (
                  <div ref={firstUnreadRef} className="relative flex items-center py-4">
                    <div className="flex-1 border-t-2 border-discord-red"></div>
                    <span className="px-3 text-xs font-semibold text-discord-red uppercase">
                      未读消息
                    </span>
                    <div className="flex-1 border-t-2 border-discord-red"></div>
                  </div>
                )}
                <div className="flex items-start space-x-3 hover:bg-discord-darker/30 p-2 rounded">
                  <UserAvatar
                    username={message.author.username}
                    avatarUrl={message.author.avatarUrl}
                    size="md"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline space-x-2">
                      <span className="font-semibold text-white">{message.author.username}</span>
                      <span className="text-xs text-gray-500">
                        {new Date(message.createdAt).toLocaleString('zh-CN')}
                      </span>
                    </div>
                    {message.content && (
                      <p className="text-discord-light-gray break-words">{message.content}</p>
                    )}
                    {message.attachments && message.attachments.length > 0 && (
                      <div className="mt-2 space-y-2">
                        {message.attachments.map((att, idx) => (
                          <div key={idx}>
                            {att.type === 'IMAGE' ? (
                              <img 
                                src={getMediaUrl(att.url)} 
                                alt={att.filename || ''} 
                                crossOrigin="anonymous"
                                className="max-w-md rounded cursor-pointer hover:opacity-90 transition-opacity" 
                              />
                            ) : att.type === 'VIDEO' ? (
                              <video 
                                src={getMediaUrl(att.url)} 
                                crossOrigin="anonymous"
                                controls 
                                className="max-w-md rounded" 
                              />
                            ) : (
                              <a 
                                href={getMediaUrl(att.url)} 
                                target="_blank" 
                                rel="noreferrer" 
                                className="text-blue-400 underline hover:text-blue-300"
                              >
                                {att.filename || att.url}
                              </a>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
          </>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* 输入框 */}
      <div className="p-4">
        <form onSubmit={handleSendMessage} className="space-y-2">
          {pendingFiles.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {pendingFiles.map((f, i) => (
                <span key={i} className="text-xs bg-discord-darkest px-2 py-1 rounded">{f.name}</span>
              ))}
            </div>
          )}
          <div className="bg-discord-darker rounded-lg flex items-center">
            <label className="px-3 py-3 cursor-pointer text-gray-400 hover:text-white">
              <input
                type="file"
                className="hidden"
                multiple
                onChange={(e) => {
                  const files = Array.from(e.target.files || []);
                  setPendingFiles((prev) => [...prev, ...files]);
                }}
              />
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20"><path d="M4 3a2 2 0 00-2 2v6a6 6 0 006 6h3a5 5 0 005-5V9a3 3 0 00-3-3H9a2 2 0 000 4h5v2a3 3 0 01-3 3H8a4 4 0 01-4-4V5a1 1 0 011-1h9a1 1 0 110 2H5v2H4V5a2 2 0 012-2h9a3 3 0 013 3v6a6 6 0 01-6 6H8a8 8 0 01-8-8V5a4 4 0 014-4h9a5 5 0 015 5v1h-2V6a3 3 0 00-3-3H4z"/></svg>
            </label>
            <input
              type="text"
              value={newMessage}
              onChange={(e) => {
                const v = e.target.value;
                setNewMessage(v);
                // 发送 typing 事件（简单节流：1s）
                const now = Date.now();
                const last = (window as Window & typeof globalThis & { __typingEmitAt?: number }).__typingEmitAt || 0;
                if (now - last > 1000) {
                  if (isDM && dmConversationId) {
                    socketService.sendTyping({ conversationId: dmConversationId });
                  } else if (!isDM && channelId) {
                    socketService.sendTyping({ channelId });
                  }
                  (window as Window & typeof globalThis & { __typingEmitAt?: number }).__typingEmitAt = now;
                }
              }}
              placeholder="发送消息..."
              className={inputClass}
              disabled={rateLimitWaitMs > 0}
            />
            {rateLimitWaitMs > 0 && (
              <span className="px-3 text-xs text-red-400 select-none">
                冷却 {Math.ceil(rateLimitWaitMs/1000)}s...
              </span>
            )}
          </div>
          <TypingIndicator typingUsers={typingUsers} />
          {/* 上传进度条与文件名 */}
          {uploadProgress !== null && uploadFileName && (
            <div className="w-full bg-gray-700 h-2 mt-2 relative">
              <div className="bg-blue-500 h-2" style={{ width: progressValue + '%' }}></div>
              <span className="absolute left-2 top-[-20px] text-xs text-white">{uploadFileName} {progressValue}%</span>
            </div>
          )}
          {/* Toast 弹窗统一提示 */}
          <Toasts />
        </form>
      </div>
    </div>
  );
}
