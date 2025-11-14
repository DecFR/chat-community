import { useEffect, useState, useRef } from 'react';
import { useServerStore } from '../stores/serverStore';
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

export default function ChatView() {
  const { currentChannelId } = useServerStore();
  const { user } = useAuthStore();
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [lastReadMessageId, setLastReadMessageId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const loadMoreTriggerRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  // 获取已读位置
  useEffect(() => {
    if (!currentChannelId || !user) return;
    
    const key = `lastRead_${user.id}_${currentChannelId}`;
    const savedLastRead = localStorage.getItem(key);
    setLastReadMessageId(savedLastRead);
  }, [currentChannelId, user]);

  // 标记消息为已读
  const markAsRead = () => {
    if (!currentChannelId || !user || messages.length === 0) return;
    
    const lastMessage = messages[messages.length - 1];
    const key = `lastRead_${user.id}_${currentChannelId}`;
    localStorage.setItem(key, lastMessage.id);
    setLastReadMessageId(lastMessage.id);
  };

  // 加载消息
  useEffect(() => {
    if (!currentChannelId) return;

    const loadMessages = async () => {
      setIsLoading(true);
      setHasMore(true);
      try {
        const response = await messageAPI.getChannelMessages(currentChannelId, 50);
        const loadedMessages = response.data.data;
        setMessages(loadedMessages);
        setHasMore(loadedMessages.length === 50); // 如果返回50条，可能还有更多
        setTimeout(() => scrollToBottom(), 100);
      } catch (error) {
        console.error('Failed to load messages:', error);
      } finally {
        setIsLoading(false);
      }
    };

    loadMessages();
  }, [currentChannelId]);

  // 加载更多消息（历史记录）
  const loadMoreMessages = async () => {
    if (!currentChannelId || isLoadingMore || !hasMore || messages.length === 0) return;

    setIsLoadingMore(true);
    try {
      const oldestMessage = messages[0];
      const response = await messageAPI.getChannelMessages(currentChannelId, 50, oldestMessage.id);
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
    const handleNewMessage = (message: Message & { channelId?: string }) => {
      if (message.channelId === currentChannelId) {
        setMessages((prev) => [...prev, message]);
        setTimeout(() => scrollToBottom(), 100);
      }
    };

    socketService.on('channelMessage', handleNewMessage);

    return () => {
      socketService.off('channelMessage', handleNewMessage);
    };
  }, [currentChannelId]);

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
    if (!newMessage.trim() || !currentChannelId) return;

    socketService.sendChannelMessage(currentChannelId, newMessage);
    setNewMessage('');
    // 发送消息后立即标记为已读
    setTimeout(() => markAsRead(), 500);
  };

  if (!currentChannelId) {
    return (
      <div className="flex-1 flex items-center justify-center bg-discord-gray">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-white mb-2">欢迎来到 Chat & Community</h2>
          <p className="text-discord-light-gray">选择一个频道开始聊天</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col bg-discord-gray">
      {/* 消息列表 */}
      <div
        ref={messagesContainerRef}
        className="flex-1 overflow-y-auto scrollbar-thin p-4 space-y-4"
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
                  <div className="relative flex items-center py-4">
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
