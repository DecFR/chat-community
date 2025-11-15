import React from 'react';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string | React.ReactNode;
  children: React.ReactNode;
  className?: string; // extra classes for container
  maxWidthClass?: string; // e.g., max-w-md, max-w-2xl
}

export default function Modal({
  isOpen,
  onClose,
  title,
  children,
  className,
  maxWidthClass = 'max-w-md',
}: ModalProps) {
  if (!isOpen) return null;

  const stop: React.MouseEventHandler<HTMLDivElement> = (e) => {
    e.stopPropagation();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className={`w-full ${maxWidthClass} mx-4 rounded-2xl border border-white/5 bg-discord-dark/90 shadow-2xl ${className || ''}`}
        onClick={stop}
      >
        <div className="px-5 py-4 border-b border-white/5 flex items-center justify-between">
          <div className="text-lg font-bold text-white">{title}</div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors"
            aria-label="Close"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}
