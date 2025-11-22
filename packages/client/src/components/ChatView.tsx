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

interface MessageWithKey extends Message {
  _key?: string;
}

export default function ChatView({ isDM = false }: ChatViewProps) {
  const { channelId, friendId } = useParams();
  const { servers, isLoading: isLoadingServers } = useServerStore();
  const { friends } = useFriendStore();
  const { user } = useAuthStore();

  const [rateLimitWaitMs, setRateLimitWaitMs] = useState(0);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const currentFriend = isDM && friendId ? friends.find(f => f.id === friendId) : null;

  // 媒体预览状态
  const [previewMedia, setPreviewMedia] = useState<{ url: string; type: 'IMAGE' | 'VIDEO' } | null>(null);
  
  const lastTypingEmitTimeRef = useRef<number>(0);

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

  const getMediaUrl = (url: string | null | undefined): string => {
    if (!url) return '';
    if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('data:')) {
      return url;
    }
    const API_URL = (import.meta.env.VITE_API_URL || '').replace(/\/api\/?$/, '');
    const normalized = url.startsWith('/') ? url : `/${url}`;
    if (!API_URL) return normalized;
    return `${API_URL}${normalized}`;
  };

  // --- 智能文件类型判断函数 ---
  const getFileType = (att: { type: string; filename?: string; mimeType?: string }) => {
    // 1. 如果后端明确是 IMAGE/VIDEO，直接信
    if (att.type === 'IMAGE') return 'IMAGE';
    if (att.type === 'VIDEO') return 'VIDEO';

    // 2. 否则，根据后缀名或 mimeType 再次判断
    const name = (att.filename || '').toLowerCase();
    const mime = (att.mimeType || '').toLowerCase();

    if (mime.startsWith('image/') || /\.(jpg|jpeg|png|gif|webp|bmp|svg)$/.test(name)) {
      return 'IMAGE';
    }
    if (mime.startsWith('video/') || /\.(mp4|webm|ogg|mov|mkv)$/.test(name)) {
      return 'VIDEO';
    }

    return 'FILE';
  };

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
  const lastLoadedTargetRef = useRef<string>('');
  const [isNearBottom, setIsNearBottom] = useState(true);
  const rateLimitTimerRef = useRef<number | null>(null);
  const [uploadFileName, setUploadFileName] = useState<string | null>(null);
  const toastStore = useToastStore();

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    const targetId = isDM ? friendId : channelId;
    if (!targetId || !user) return;
    const key = `lastRead_${user.id}_${targetId}`;
    const savedLastRead = localStorage.getItem(key);
    setLastReadMessageId(savedLastRead);
  }, [isDM, friendId, channelId, user]);

  const markAsRead = useCallback(() => {
    const targetId = isDM ? friendId : channelId;
    if (!targetId || !user || messages.length === 0) return;
    const lastMessage = messages[messages.length - 1];
    const key = `lastRead_${user.id}_${targetId}`;
    localStorage.setItem(key, lastMessage.id);
    setLastReadMessageId(lastMessage.id);
    if (isDM && dmConversationId) {
      socketService.markConversationAsRead(dmConversationId, lastMessage.id);
      if (friendId) useUnreadStore.getState().clearDM(friendId);
    } else if (!isDM && channelId) {
      socketService.markChannelAsRead(channelId, lastMessage.id);
      useUnreadStore.getState().clearChannel(channelId);
    }
  }, [isDM, friendId, channelId, user, messages, dmConversationId]);

  useEffect(() => {
    const loadMessages = async () => {
      const mySeq = ++loadSeqRef.current;
      const targetId = isDM ? friendId : channelId;
      if (!targetId) {
        setMessages([]);
        setDmConversationId(null);
        lastLoadedTargetRef.current = '';
        return;
      }
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
            if (savedLastRead) {
              const idx = list.findIndex(m => m.id === savedLastRead || (m as MessageWithKey)._key === savedLastRead);
              setFirstUnreadIndex(idx >= 0 ? idx + 1 : null);
            }
          }
        } else if (channelId) {
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
          const stateRes = await messageAPI.getChannelState(channelId);
          const serverLastRead = stateRes.data.data?.lastReadMessageId as string | undefined;
          const effectiveLastRead = savedLastRead || serverLastRead;
          if (effectiveLastRead) {
            const idx = list.findIndex(m => m.id === effectiveLastRead || (m as MessageWithKey)._key === effectiveLastRead);
            setFirstUnreadIndex(idx >= 0 ? idx + 1 : null);
          }
        }
        setTimeout(() => scrollToBottom(), 100);
      } finally {
        setIsLoading(false);
      }
    };
    loadMessages();
  }, [isDM, friendId, channelId, user?.id, messages.length]);

  const loadMoreMessages = useCallback(async () => {
    if (isLoadingMore || !hasMore || messages.length === 0) return;
    setIsLoadingMore(true);
    try {
      const oldestMessage = messages[0];
      let response;
      if (isDM && friendId) {
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
        response = await messageAPI.getChannelMessages(channelId, 50, oldestMessage.id);
      } else {
        setIsLoadingMore(false);
        return;
      }
      const olderMessages = response.data.data;
      if (olderMessages.length > 0) {
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
          return Array.from(uniqueMap.values()).sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
        });
        setHasMore(olderMessages.length === 50);
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
    if (trigger) observer.observe(trigger);
    return () => {
      if (trigger) observer.unobserve(trigger);
    };
  }, [hasMore, isLoadingMore, loadMoreMessages]);

  useEffect(() => {
    const container = messagesContainerRef.current;
    if (!container) return;
    const handleScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = container;
      const distanceFromBottom = scrollHeight - scrollTop - clientHeight;
      const nearBottom = distanceFromBottom < 100;
      setIsNearBottom(nearBottom);
      if (nearBottom && messages.length > 0) {
        markAsRead();
      }
    };
    container.addEventListener('scroll', handleScroll);
    return () => container.removeEventListener('scroll', handleScroll);
  }, [messages.length, isDM, friendId, channelId, markAsRead]);

  useEffect(() => {
    const targetId = isDM ? friendId : channelId;
    if (!targetId) return;
    const currentUserId = user?.id;
    const socket = socketService.getSocket();
    if (!socket) return;

    const handleNewMessage = (message: Message & { channelId?: string; directMessageConversationId?: string }) => {
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
        setTimeout(() => scrollToBottom(), 100);
        setTimeout(() => markAsRead(), 500);
      }
    };

    const handleDirectMessage = (message: Message & { directMessageConversationId?: string }) => {
      if (isDM && friendId) {
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
          setTimeout(() => scrollToBottom(), 100);
          setTimeout(() => markAsRead(), 500);
        }
      }
    };

    socket.off('channelMessage');
    socket.off('directMessage');
    socket.off('friendProfileUpdate');
    socket.off('userProfileUpdate');
    socket.off('messageRateLimited');
    
    socket.on('channelMessage', handleNewMessage);
    socket.on('directMessage', handleDirectMessage);

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
    
    const handleFriendRemoved = (data: { friendId: string }) => {
      if (isDM && friendId === data.friendId) {
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
  }, [isDM, friendId, channelId, user?.id]);

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

  useEffect(() => {
    if (messages.length > 0 && isNearBottom) {
      const timer = setTimeout(() => {
        markAsRead();
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [messages, isNearBottom]);

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (rateLimitWaitMs > 0) return;
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
          const maxSize = 3 * 1024 * 1024 * 1024;
          if (f.size > maxSize) {
            toastStore.addToast({ message: `文件过大！${(f.size / 1024 / 1024).toFixed(2)} MB`, type: 'error' });
            continue;
          }
          setUploadFileName(f.name);
          await uploadFileInChunks({
            file: f,
            chunkSize: 5 * 1024 * 1024,
            onProgress: (percent) => setUploadProgress(percent),
            onError: (err) => toastStore.addToast({ message: '上传失败: ' + err.message, type: 'error' }),
            onComplete: (url) => {
              // 🟢 智能判断类型，避免默认为 FILE
              let type: 'IMAGE' | 'VIDEO' | 'FILE' = 'FILE';
              if (f.type.startsWith('image/')) type = 'IMAGE';
              else if (f.type.startsWith('video/')) type = 'VIDEO';
              
              (attachments ?? []).push({ url, type, filename: f.name, mimeType: f.type, size: f.size });
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

  if (!isDM && channelId && isLoadingServers && !currentChannel) {
    return (
      <div className="flex-1 flex items-center justify-center bg-discord-gray">
        <div className="text-center"><div className="text-discord-light-gray">加载中...</div></div>
      </div>
    );
  }

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
    <div className="flex-1 flex flex-col bg-discord-gray min-h-0 min-w-0 relative">
      {/* 图片/视频预览 Modal */}
      {previewMedia && (
        <div className="absolute inset-0 z-50 bg-black/90 flex items-center justify-center p-4" onClick={() => setPreviewMedia(null)}>
          <div className="relative max-w-full max-h-full" onClick={(e) => e.stopPropagation()}>
            <button className="absolute top-[-40px] right-0 text-white text-xl hover:text-gray-300" onClick={() => setPreviewMedia(null)}>✕</button>
            {previewMedia.type === 'IMAGE' ? (
              <img src={previewMedia.url} alt="Preview" className="max-w-full max-h-[90vh] object-contain rounded" crossOrigin="anonymous" />
            ) : (
              <video src={previewMedia.url} controls autoPlay className="max-w-full max-h-[90vh] rounded" crossOrigin="anonymous" />
            )}
          </div>
        </div>
      )}

      <div className="h-12 bg-discord-darker border-b border-discord-darkest flex items-center px-4 shadow-md">
        <div className="flex items-center gap-2">
          {isDM && currentFriend ? (
            <>
              <UserAvatar username={currentFriend.username} avatarUrl={currentFriend.avatarUrl} size="sm" />
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

      <div ref={messagesContainerRef} className="flex-1 overflow-y-auto scrollbar-thin p-4 space-y-4 min-h-0">
        {isLoading ? (
          <div className="flex items-center justify-center h-full"><div className="text-discord-light-gray">加载中...</div></div>
        ) : messages.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center"><p className="text-discord-light-gray">还没有消息</p></div>
          </div>
        ) : (
          <>
            <div ref={loadMoreTriggerRef} className="h-1">
              {isLoadingMore && <div className="flex justify-center py-2"><div className="text-discord-light-gray text-sm">加载更多消息...</div></div>}
              {!hasMore && messages.length > 0 && <div className="flex justify-center py-2"><div className="text-gray-500 text-sm">没有更多消息了</div></div>}
            </div>

            {messages.map((message, index) => {
            const showUnreadDivider = (firstUnreadIndex !== null && index === firstUnreadIndex) || (lastReadMessageId && index > 0 && messages[index - 1].id === lastReadMessageId && message.authorId !== user?.id);
            const renderKey = (message as MessageWithKey)._key || message.id;
            return (
              <div key={renderKey}>
                {showUnreadDivider && (
                  <div ref={firstUnreadRef} className="relative flex items-center py-4">
                    <div className="flex-1 border-t-2 border-discord-red"></div>
                    <span className="px-3 text-xs font-semibold text-discord-red uppercase">未读消息</span>
                    <div className="flex-1 border-t-2 border-discord-red"></div>
                  </div>
                )}
                <div className="flex items-start space-x-3 hover:bg-discord-darker/30 p-2 rounded">
                  <UserAvatar username={message.author.username} avatarUrl={message.author.avatarUrl} size="md" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline space-x-2">
                      <span className="font-semibold text-white">{message.author.username}</span>
                      <span className="text-xs text-gray-500">{new Date(message.createdAt).toLocaleString('zh-CN')}</span>
                    </div>
                    {message.content && <p className="text-discord-light-gray break-words">{message.content}</p>}
                    
                    {/* 🚀 附件渲染 (使用智能判断) */}
                    {message.attachments && message.attachments.length > 0 && (
                      <div className="mt-2 space-y-2 flex flex-wrap gap-2">
                        {message.attachments.map((att, idx) => {
                          const mediaUrl = getMediaUrl(att.url);
                          // 🟢 使用智能类型判断
                          const fileType = getFileType(att);

                          if (fileType === 'IMAGE') {
                            return (
                              <img
                                key={idx}
                                src={mediaUrl}
                                alt={att.filename}
                                crossOrigin="anonymous"
                                className="max-w-full sm:max-w-sm max-h-[400px] rounded cursor-pointer object-contain hover:opacity-95 border border-discord-darkest bg-black/20"
                                onClick={() => setPreviewMedia({ url: mediaUrl, type: 'IMAGE' })}
                              />
                            );
                          } else if (fileType === 'VIDEO') {
                            return (
                              <video
                                key={idx}
                                src={mediaUrl}
                                crossOrigin="anonymous"
                                controls
                                className="max-w-full sm:max-w-sm max-h-[400px] rounded border border-discord-darkest bg-black"
                              />
                            );
                          } else {
                            return (
                              <a
                                key={idx}
                                href={mediaUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="flex items-center gap-2 bg-discord-darker p-3 rounded border border-discord-darkest hover:bg-discord-darkest transition"
                              >
                                <div className="text-3xl">📄</div>
                                <div className="overflow-hidden">
                                  <div className="text-blue-400 truncate max-w-[200px] font-medium">{att.filename}</div>
                                  <div className="text-xs text-gray-500">{(att.size ? (att.size / 1024).toFixed(1) + ' KB' : 'Unknown size')}</div>
                                </div>
                              </a>
                            );
                          }
                        })}
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

      <div className="p-4">
        <form onSubmit={handleSendMessage} className="space-y-2">
          {pendingFiles.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {pendingFiles.map((f, i) => (
                <span key={i} className="text-xs bg-discord-darkest px-2 py-1 rounded text-gray-300 flex items-center gap-1">
                  {f.name}
                  <button type="button" onClick={() => setPendingFiles(prev => prev.filter((_, idx) => idx !== i))} className="text-red-400 hover:text-red-300 ml-1">×</button>
                </span>
              ))}
            </div>
          )}
          <div className="bg-discord-darker rounded-lg flex items-center">
            <label className="px-3 py-3 cursor-pointer text-gray-400 hover:text-white">
              <input type="file" className="hidden" multiple onChange={(e) => setPendingFiles(prev => [...prev, ...Array.from(e.target.files || [])])} />
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20"><path d="M4 3a2 2 0 00-2 2v6a6 6 0 006 6h3a5 5 0 005-5V9a3 3 0 00-3-3H9a2 2 0 000 4h5v2a3 3 0 01-3 3H8a4 4 0 01-4-4V5a1 1 0 011-1h9a1 1 0 110 2H5v2H4V5a2 2 0 012-2h9a3 3 0 013 3v6a6 6 0 01-6 6H8a8 8 0 01-8-8V5a4 4 0 014-4h9a5 5 0 015 5v1h-2V6a3 3 0 00-3-3H4z"/></svg>
            </label>
            <input
              type="text"
              value={newMessage}
              onChange={(e) => {
                const v = e.target.value;
                setNewMessage(v);
                const now = Date.now();
                if (now - lastTypingEmitTimeRef.current > 1000) {
                  if (isDM && dmConversationId) socketService.sendTyping({ conversationId: dmConversationId });
                  else if (!isDM && channelId) socketService.sendTyping({ channelId });
                  lastTypingEmitTimeRef.current = now;
                }
              }}
              placeholder="发送消息..."
              className={inputClass}
              disabled={rateLimitWaitMs > 0}
            />
            {rateLimitWaitMs > 0 && <span className="px-3 text-xs text-red-400 select-none">冷却 {Math.ceil(rateLimitWaitMs/1000)}s...</span>}
          </div>
          <TypingIndicator typingUsers={typingUsers} />
          {uploadProgress !== null && uploadFileName && (
            <div className="w-full bg-gray-700 h-2 mt-2 relative rounded overflow-hidden">
              <div className="bg-blue-500 h-2 transition-all duration-300" style={{ width: progressValue + '%' }}></div>
              <span className="absolute left-2 top-[-20px] text-xs text-white">{uploadFileName} {progressValue.toFixed(0)}%</span>
            </div>
          )}
          <Toasts />
        </form>
      </div>
    </div>
  );
}