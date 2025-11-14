import { useEffect, useState, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { useServerStore } from '../stores/serverStore';
import { useFriendStore } from '../stores/friendStore';
import { useAuthStore } from '../stores/authStore';
import { messageAPI } from '../lib/api';
import { socketService } from '../lib/socket';
import { UserAvatar } from './UserAvatar';

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
}

interface ChatViewProps {
  isDM?: boolean;
}

export default function ChatView({ isDM = false }: ChatViewProps) {
  const { channelId, friendId } = useParams();
  const { servers, currentChannelId, selectChannel, isLoading: isLoadingServers } = useServerStore();
  const { friends } = useFriendStore();
  const { user } = useAuthStore();

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

  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [lastReadMessageId, setLastReadMessageId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const loadMoreTriggerRef = useRef<HTMLDivElement>(null);
  const firstUnreadRef = useRef<HTMLDivElement>(null);

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

  // 标记消息为已读
  const markAsRead = () => {
    const targetId = isDM ? friendId : channelId;
    if (!targetId || !user || messages.length === 0) return;
    
    const lastMessage = messages[messages.length - 1];
    const key = `lastRead_${user.id}_${targetId}`;
    localStorage.setItem(key, lastMessage.id);
    setLastReadMessageId(lastMessage.id);
  };

  // 加载消息
  useEffect(() => {
    const targetId = isDM ? friendId : channelId;
    if (!targetId) return;

    const loadMessages = async () => {
      setIsLoading(true);
      setHasMore(true);
      try {
        if (isDM && friendId) {
          // 私聊：先获取或创建会话，然后获取消息
          const stateResponse = await messageAPI.getConversationState(friendId);
          const conversationId = stateResponse.data.data?.conversationId;
          
          if (conversationId) {
            const response = await messageAPI.getConversationMessages(conversationId, 50);
            const loadedMessages = response.data.data;
            setMessages(loadedMessages);
            setHasMore(loadedMessages.length === 50);
          } else {
            // 新会话，暂时没有消息
            setMessages([]);
            setHasMore(false);
          }
        } else {
          // 频道消息
          const response = await messageAPI.getChannelMessages(targetId, 50);
          const loadedMessages = response.data.data;
          setMessages(loadedMessages);
          setHasMore(loadedMessages.length === 50);
        }
        // 检查是否有未读消息
        const key = `lastRead_${user?.id}_${targetId}`;
        const savedLastRead = localStorage.getItem(key);
        if (savedLastRead) {
          setTimeout(() => scrollToFirstUnread(), 100);
        } else {
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

    const handleNewMessage = (message: Message & { channelId?: string; directMessageConversationId?: string }) => {
      if (isDM) {
        // 私聊消息：需要匹配当前好友ID
        if (message.authorId === friendId || message.authorId === user?.id) {
          setMessages((prev) => {
            if (prev.some(m => m.id === message.id)) {
              return prev;
            }
            return [...prev, message];
          });
          setTimeout(() => scrollToBottom(), 100);
          setTimeout(() => markAsRead(), 500);
        }
      } else {
        // 频道消息
        if (message.channelId === targetId) {
          setMessages((prev) => {
            if (prev.some(m => m.id === message.id)) {
              return prev;
            }
            return [...prev, message];
          });
          setTimeout(() => scrollToBottom(), 100);
          setTimeout(() => markAsRead(), 500);
        }
      }
    };

    const handleDirectMessage = (message: Message) => {
      if (isDM && (message.authorId === friendId || message.authorId === user?.id)) {
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
  }, [isDM, friendId, channelId, user]);

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
    if (!newMessage.trim()) return;

    if (isDM && friendId) {
      socketService.sendDirectMessage(friendId, newMessage);
    } else if (channelId) {
      socketService.sendChannelMessage(channelId, newMessage);
    }
    
    setNewMessage('');
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
            const showUnreadDivider = lastReadMessageId && 
              index > 0 && 
              messages[index - 1].id === lastReadMessageId &&
              message.authorId !== user?.id;

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
                    <p className="text-discord-light-gray break-words">{message.content}</p>
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
        <form onSubmit={handleSendMessage}>
          <div className="bg-discord-darker rounded-lg">
            <input
              type="text"
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              placeholder="发送消息..."
              className="w-full px-4 py-3 bg-transparent text-white placeholder-gray-500 focus:outline-none"
            />
          </div>
        </form>
      </div>
    </div>
  );
}
