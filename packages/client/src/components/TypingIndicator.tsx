import { useState, useEffect } from 'react';

interface TypingIndicatorProps {
  typingUsers: string[];
}

export default function TypingIndicator({ typingUsers }: TypingIndicatorProps) {
  const [dots, setDots] = useState('');

  useEffect(() => {
    const interval = setInterval(() => {
      setDots((prev) => {
        if (prev === '...') return '';
        return prev + '.';
      });
    }, 500);

    return () => clearInterval(interval);
  }, []);

  if (typingUsers.length === 0) return null;

  const getTypingText = () => {
    if (typingUsers.length === 1) {
      return `${typingUsers[0]} 正在输入`;
    } else if (typingUsers.length === 2) {
      return `${typingUsers[0]} 和 ${typingUsers[1]} 正在输入`;
    } else {
      return `${typingUsers[0]} 和其他 ${typingUsers.length - 1} 人正在输入`;
    }
  };

  return (
    <div className="px-4 py-2 text-sm text-gray-400 flex items-center gap-2">
      <div className="flex gap-1">
        <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" />
        <div
          className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"
          style={{ animationDelay: '0.2s' }}
        />
        <div
          className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"
          style={{ animationDelay: '0.4s' }}
        />
      </div>
      <span>
        {getTypingText()}
        {dots}
      </span>
    </div>
  );
}
