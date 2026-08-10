import type { ReactNode } from 'react';

// Kafe panelidagi ModalShell bilan bir xil naqsh — telefonda butun ekran,
// kattaroq ekranda markazdagi oyna.
export default function ModalShell({
  title,
  subtitle,
  onClose,
  children,
}: {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-30 flex items-stretch justify-center bg-black/50 sm:items-center sm:p-4">
      <div className="flex h-full w-full flex-col overflow-hidden bg-white shadow-lg sm:max-h-[90vh] sm:max-w-2xl sm:rounded-xl">
        <div className="flex shrink-0 items-center gap-3 border-b border-slate-200 px-5 py-4">
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-lg font-semibold text-slate-900">{title}</h2>
            {subtitle && <p className="truncate text-xs text-slate-500">{subtitle}</p>}
          </div>
          <button
            onClick={onClose}
            className="shrink-0 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-600 hover:bg-slate-50"
          >
            Yopish
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
      </div>
    </div>
  );
}
