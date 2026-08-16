// Stol endi WebApp ochilishida ma'lum emas (checkout bosqichida QR skaner orqali
// aniqlanadi), shuning uchun sarlavhada faqat restoran nomi ko'rsatiladi.
export default function Header({
  businessName,
  onOpenProfile,
}: {
  businessName: string;
  /**
   * Profil tugmasi. Faqat Telegram ichida beriladi — oddiy brauzerda
   * (Instagram havolasi) mijozning shaxsi yo'q, tugma ham chizilmaydi.
   */
  onOpenProfile?: () => void;
}) {
  const initial = businessName.trim().charAt(0).toUpperCase() || '🍽';

  return (
    <header
      className="flex shrink-0 items-center gap-2.5 bg-[var(--color-bg)] px-4 pb-3"
      style={{ paddingTop: 'calc(var(--safe-top) + 12px)' }}
    >
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--color-accent)] text-[15px] font-bold text-[var(--color-accent-text)]">
        {initial}
      </div>
      <h1 className="min-w-0 flex-1 truncate text-[17px] font-bold text-[var(--color-text)]">
        {businessName}
      </h1>
      {onOpenProfile && (
        <button
          onClick={onOpenProfile}
          aria-label="Profil"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--color-surface)] text-base shadow-[var(--shadow-sm)] transition active:scale-90"
        >
          👤
        </button>
      )}
    </header>
  );
}
