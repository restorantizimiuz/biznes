// Stol endi WebApp ochilishida ma'lum emas (checkout bosqichida QR skaner orqali
// aniqlanadi), shuning uchun sarlavhada faqat restoran nomi ko'rsatiladi.
export default function Header({ businessName }: { businessName: string }) {
  const initial = businessName.trim().charAt(0).toUpperCase() || '🍽';

  return (
    <header
      className="flex shrink-0 items-center gap-2.5 bg-[var(--color-bg)] px-4 pb-3"
      style={{ paddingTop: 'calc(var(--safe-top) + 12px)' }}
    >
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--color-accent)] text-[15px] font-bold text-[var(--color-accent-text)]">
        {initial}
      </div>
      <h1 className="truncate text-[17px] font-bold text-[var(--color-text)]">{businessName}</h1>
    </header>
  );
}
