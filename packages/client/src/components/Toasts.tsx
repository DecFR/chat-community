import { useToastStore } from '../stores/toastStore';

const typeStyles: Record<string, { bg: string; border: string; icon: string }> = {
  success: { bg: 'bg-green-500/10', border: 'border-green-500', icon: '✅' },
  error: { bg: 'bg-red-500/10', border: 'border-red-500', icon: '⛔' },
  info: { bg: 'bg-blue-500/10', border: 'border-blue-500', icon: 'ℹ️' },
  warning: { bg: 'bg-yellow-500/10', border: 'border-yellow-500', icon: '⚠️' },
};

export default function Toasts() {
  const { toasts, removeToast } = useToastStore();

  return (
    <div className="pointer-events-none fixed top-4 right-4 z-[100] flex flex-col gap-2">
      {toasts.map((t) => {
        const s = typeStyles[t.type] || typeStyles.info;
        return (
          <div
            key={t.id}
            className={`pointer-events-auto min-w-[260px] max-w-[360px] ${s.bg} ${s.border} border text-white rounded shadow-lg px-3 py-2 flex items-start gap-2 animate-fade-in`}
          >
            <span className="mt-0.5 select-none">{s.icon}</span>
            <div className="flex-1 text-sm leading-5">{t.message}</div>
            <button
              onClick={() => removeToast(t.id)}
              className="text-gray-400 hover:text-white ml-2"
              aria-label="Close"
            >
              ✖
            </button>
          </div>
        );
      })}
    </div>
  );
}
