import type { ReactNode } from 'react';
import { useTranslation } from '../i18n/LanguageContext';

// Barcha modal oynalar uchun umumiy qobiq.
// `onBack` berilsa sarlavhada "←" tugmasi chiqadi — shunda ichki ekranga
// (masalan to'lov yoki rasm kesish) o'tgan kassir bir bosishda orqaga qaytadi
// va tasodifan butun oynani yopib yubormaydi.
//
// O'lchamlar:
//   sm/md/lg — kontentga qarab o'sadigan oddiy oynalar (max-h bilan cheklangan).
//   pos      — kassa oynasi: **aniq balandlik**. Sabab: kassirning ishida taom
//              tanlash oynasi kategoriya almashganda o'lchamini o'zgartirsa
//              (bir kategoriyada 2 ta taom, boshqasida 20 ta), tugmalar joyini
//              o'zgartiradi va noto'g'ri bosish ehtimolini oshiradi. Shuning
//              uchun oyna doim bir xil kattalikda turadi, ichki ro'yxat esa
//              o'zi siljiydi.
//
// Telefonda (< 640px) modal butun ekranni egallaydi: kichik ekranda chetlardagi
// bo'sh joy foydali maydonni yeb qo'yadi va tugmalar barmoq uchun kichrayadi.
const SIZE_CLASSES: Record<string, string> = {
  sm: 'sm:max-w-sm sm:max-h-[90vh]',
  md: 'sm:max-w-xl sm:max-h-[90vh]',
  lg: 'sm:max-w-3xl sm:max-h-[90vh]',
  pos: 'sm:max-w-6xl sm:h-[85vh]',
};

export default function ModalShell({
  title,
  subtitle,
  onBack,
  onClose,
  children,
  footer,
  size = 'md',
}: {
  title: string;
  subtitle?: string;
  onBack?: () => void;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'pos';
}) {
  const { t } = useTranslation();

  return (
    <div className="fixed inset-0 z-30 flex items-stretch justify-center bg-black/40 sm:items-center sm:p-4">
      <div
        className={`flex h-full w-full flex-col overflow-hidden bg-white shadow-lg sm:rounded-2xl ${SIZE_CLASSES[size]}`}
      >
        <div className="flex shrink-0 items-center gap-3 border-b border-slate-200 px-4 py-3 sm:px-5 sm:py-4">
          {onBack && (
            <button
              onClick={onBack}
              aria-label={t('app.back')}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50"
            >
              ←
            </button>
          )}
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-base font-semibold text-slate-900 sm:text-lg">{title}</h2>
            {subtitle && <p className="truncate text-xs text-slate-500">{subtitle}</p>}
          </div>
          <button
            onClick={onClose}
            className="shrink-0 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-600 hover:bg-slate-50"
          >
            {t('app.close')}
          </button>
        </div>

        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">{children}</div>

        {footer && (
          <div className="shrink-0 border-t border-slate-200 px-4 py-3 sm:px-5 sm:py-4">{footer}</div>
        )}
      </div>
    </div>
  );
}
