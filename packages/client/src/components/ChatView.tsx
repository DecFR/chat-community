import { useEffect, useState, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { useServerStore } from '../stores/serverStore';
import { useFriendStore } from '../stores/friendStore';
import { useAuthStore } from '../stores/authStore';
import { messageAPI } from '../lib/api';
import { socketService } from '../lib/socket';
import { UserAvatar } from './UserAvatar';
import { useUnreadStore } from '../stores/unreadStore';
import TypingIndicator from './TypingIndicator';

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

export default function ChatView({ isDM = false }: ChatViewProps) {
  const { channelId, friendId } = useParams();
  const { servers, currentChannelId, selectChannel, isLoading: isLoadingServers } = useServerStore();
  const { friends } = useFriendStore();
  const { user } = useAuthStore();
  const { decrementDM, decrementChannel } = useUnreadStore();

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

  // 获取当前好友信息（如果是私聊模式）
  const currentFriend = isDM && friendId ? friends.find(f => f.id === friendId) : null;

  // 获取当前频道信息
  const currentChannel = !isDM && channelId ? 
    servers.flatMap(s => s.channels).find(c => c.id === channelId) : null;

  // 同步URL参数和store状态
  useEffect(() => {
    if (!isDM && channelId) {
      // 确保 store 中的 currentChannelId 与 URL 同步
      if (channelId !== currentChannelId) {
        selectChannel(channelId);
      }
    }
  }, [isDM, channelId, currentChannelId, selectChannel]);

  // 进入/离开频道房间（用于 typing 等）
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
  const [newMessage, setNewMessage] = useState('');
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [lastReadMessageId, setLastReadMessageId] = useState<string | null>(null);
  const [dmConversationId, setDmConversationId] = useState<string | null>(null);
  const prevChannelRef = useRef<string | null>(null);
  const prevConversationRef = useRef<string | null>(null);
  const [typingUsers, setTypingUsers] = useState<string[]>([]);
  const typingTimeoutsRef = useRef<Record<string, any>>({});
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const loadMoreTriggerRef = useRef<HTMLDivElement>(null);
  const firstUnreadRef = useRef<HTMLDivElement>(null);
  const [firstUnreadIndex, setFirstUnreadIndex] = useState<number | null>(null);
  // 追踪上一次加载的目标ID,防止不必要的重新加载导致消息丢失
  const lastLoadedTargetRef = useRef<string>('');

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const scrollToFirstUnread = () => {
    if (firstUnreadRef.current) {
      firstUnreadRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } else {
      scrollToBottom();
    }
  };

  // 获取已读位置
  useEffect(() => {
    const targetId = isDM ? friendId : channelId;
    if (!targetId || !user) return;
    
    const key = `lastRead_${user.id}_${targetId}`;
    const savedLastRead = localStorage.getItem(key);
    setLastReadMessageId(savedLastRead);
  }, [isDM, friendId, channelId, user]);

  // 计算并按阅读量递减未读计数，然后标记为已读
  const markAsRead = () => {
    const targetId = isDM ? friendId : channelId;
    if (!targetId || !user || messages.length === 0) return;
    
    const lastMessage = messages[messages.length - 1];
    const key = `lastRead_${user.id}_${targetId}`;
    const prevLastRead = localStorage.getItem(key);

    // 统计这次新读了多少条（只统计他人消息）
    let startIndex = 0;
    if (prevLastRead) {
      const idx = messages.findIndex((m) => m.id === prevLastRead);
      startIndex = idx >= 0 ? idx + 1 : 0;
    }
    const newlyRead = messages.slice(startIndex).filter((m) => m.authorId !== user.id).length;

    localStorage.setItem(key, lastMessage.id);
    setLastReadMessageId(lastMessage.id);

    // 同步服务端阅读位置
    if (isDM && dmConversationId) {
      socketService.markConversationAsRead(dmConversationId, lastMessage.id);
      if (friendId && newlyRead > 0) {
        decrementDM(friendId, newlyRead);
      }
    } else if (!isDM && channelId) {
      socketService.markChannelAsRead(channelId, lastMessage.id);
      if (newlyRead > 0) {
        decrementChannel(channelId, newlyRead);
      }
    }
  };

  // 加载消息
  useEffect(() => {
    const targetId = isDM ? friendId : channelId;
    if (!targetId) {
      // 清空消息仅当真正离开频道时
      if (lastLoadedTargetRef.current) {
        setMessages([]);
        lastLoadedTargetRef.current = '';
      }
      return;
    }

    // 只有当targetId真正改变时才重新加载,避免因其他原因导致的组件重渲染清空消息
    if (lastLoadedTargetRef.current === targetId) {
      return;
    }
    lastLoadedTargetRef.current = targetId;

    const loadMessages = async () => {
      setIsLoading(true);
      setHasMore(true);
      try {
        // 检查是否有已读位置
        const key = `lastRead_${user?.id}_${targetId}`;
        const savedLastRead = localStorage.getItem(key);
        
        if (isDM && friendId) {
          // 私聊：先获取或创建会话，然后获取消息
          const stateResponse = await messageAPI.getConversationState(friendId);
          const conversationId = stateResponse.data.data?.conversationId;
          setDmConversationId(conversationId || null);
          
          if (conversationId) {
            let response;
            if (savedLastRead) {
              // Telegram 风格：前20条上下文 + 未读之后消息
              const olderRes = await messageAPI.getConversationMessages(conversationId, 20, savedLastRead);
              const newerRes = await messageAPI.getConversationMessages(conversationId, 100, undefined, savedLastRead);
              const older = olderRes.data.data || [];
              const newer = newerRes.data.data || [];
              const loaded = [...older, ...newer];
              setMessages(loaded);
              setFirstUnreadIndex(older.length);
              setHasMore(true);
            } else {
              // 没有已读位置，加载最新50条
              response = await messageAPI.getConversationMessages(conversationId, 50);
              const loadedMessages = response.data.data;
              setMessages(loadedMessages);
              setHasMore(loadedMessages.length === 50);
            }
          } else {
            // 新会话，暂时没有消息
            setMessages([]);
            setHasMore(false);
          }
        } else if (channelId) {
          // 频道消息：请求服务端阅读状态
          const stateRes = await messageAPI.getChannelState(channelId);
          const serverLastRead = stateRes.data.data?.lastReadMessageId as string | undefined;

          let response;
          const effectiveLastRead = savedLastRead || serverLastRead;
          if (effectiveLastRead) {
            const olderRes = await messageAPI.getChannelMessages(targetId, 20, effectiveLastRead);
            const newerRes = await messageAPI.getChannelMessages(targetId, 100, undefined, effectiveLastRead);
            const older = olderRes.data.data || [];
            const newer = newerRes.data.data || [];
            const loaded = [...older, ...newer];
            setMessages(loaded);
            setFirstUnreadIndex(older.length);
            setHasMore(true);
          } else {
            response = await messageAPI.getChannelMessages(targetId, 50);
            const loadedMessages = response.data.data;
            setMessages(loadedMessages);
            setHasMore(loadedMessages.length === 50);
          }
        }
        
        // 根据是否有已读位置决定滚动行为
        if (savedLastRead) {
          // 有已读位置时，滚动到第一条未读消息
          setTimeout(() => scrollToFirstUnread(), 100);
        } else {
          // 没有已读位置，滚动到底部
          setTimeout(() => scrollToBottom(), 100);
        }
      } catch (error) {
        console.error('Failed to load messages:', error);
        setMessages([]);
        setHasMore(false);
      } finally {
        setIsLoading(false);
      }
    };

    loadMessages();
  }, [isDM, friendId, channelId]);

  // 加载更多消息(历史记录)
  const loadMoreMessages = async () => {
    if (isLoadingMore || !hasMore || messages.length === 0) return;

    setIsLoadingMore(true);
    try {
      const oldestMessage = messages[0];
      let response;
      
      if (isDM && friendId) {
        // 私聊模式:需要先获取 conversationId
        const stateRes = await messageAPI.getConversationState(friendId);
        const conversationId = stateRes.data.data.conversationId;
        setDmConversationId(conversationId || null);
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
        
        setMessages((prev) => [...olderMessages, ...prev]);
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
  };

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
  }, [hasMore, isLoadingMore, messages]);

  // 监听新消息
  useEffect(() => {
    const targetId = isDM ? friendId : channelId;
    if (!targetId) return;

    const currentUserId = user?.id;

    const handleNewMessage = (message: Message & { channelId?: string; directMessageConversationId?: string }) => {
      // 只处理频道消息，必须有 channelId 且没有 directMessageConversationId
      if (!isDM && message.channelId && !message.directMessageConversationId && message.channelId === targetId) {
        setMessages((prev) => {
          if (prev.some(m => m.id === message.id)) {
            return prev;
          }
          return [...prev, message];
        });
        setTimeout(() => scrollToBottom(), 100);
        setTimeout(() => markAsRead(), 500);
      }
    };

    const handleDirectMessage = (message: Message) => {
      if (isDM && (message.authorId === friendId || message.authorId === currentUserId)) {
        setMessages((prev) => {
          if (prev.some(m => m.id === message.id)) {
            return prev;
          }
          return [...prev, message];
        });
        setTimeout(() => scrollToBottom(), 100);
        setTimeout(() => markAsRead(), 500);
      }
    };

    socketService.on('channelMessage', handleNewMessage);
    socketService.on('directMessage', handleDirectMessage);

    return () => {
      socketService.off('channelMessage', handleNewMessage);
      socketService.off('directMessage', handleDirectMessage);
    };
  }, [isDM, friendId, channelId, user?.id]);

  // 监听正在输入事件并管理显示列表
  useEffect(() => {
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

    socketService.on('userTyping', handleTyping);
    return () => {
      socketService.off('userTyping', handleTyping);
    };
  }, [isDM, channelId, dmConversationId]);

  // 当消息加载完成或有新消息时，标记为已读
  useEffect(() => {
    if (messages.length > 0) {
      // 延迟标记，给用户时间查看消息
      const timer = setTimeout(() => {
        markAsRead();
      }, 1000);
      
      return () => clearTimeout(timer);
    }
  }, [messages]);

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() && pendingFiles.length === 0) return;

    const send = async () => {
      let attachments: any[] | undefined;
      if (pendingFiles.length > 0) {
        attachments = [];
        for (const f of pendingFiles) {
          const fd = new FormData();
          fd.append('file', f);
          const resp = await messageAPI.uploadAttachment(fd);
          attachments.push(resp.data.data);
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
              <div
                className={`w-2 h-2 rounded-full ${
                  currentFriend.status === 'ONLINE'
                    ? 'bg-green-500'
                    : currentFriend.status === 'IDLE'
                    ? 'bg-yellow-500'
                    : currentFriend.status === 'DO_NOT_DISTURB'
                    ? 'bg-red-500'
                    : 'bg-gray-500'
                }`}
              />
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

            return (
              <div key={message.id}>
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
                const last = (window as any).__typingEmitAt || 0;
                if (now - last > 1000) {
                  if (isDM && dmConversationId) {
                    socketService.sendTyping({ conversationId: dmConversationId });
                  } else if (!isDM && channelId) {
                    socketService.sendTyping({ channelId });
                  }
                  (window as any).__typingEmitAt = now;
                }
              }}
              placeholder="发送消息..."
              className="flex-1 px-2 py-3 bg-transparent text-white placeholder-gray-500 focus:outline-none"
            />
          </div>
          <TypingIndicator typingUsers={typingUsers} />
        </form>
      </div>
    </div>
  );
}
