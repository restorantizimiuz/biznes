export default function Header({
  businessName,
  tableName,
}: {
  businessName: string;
  tableName: string;
}) {
  const initial = businessName.trim().charAt(0).toUpperCase() || '🍽';

  return (
    <header
      className="flex shrink-0 items-center justify-between gap-3 bg-[var(--color-bg)] px-4 pb-3"
      style={{ paddingTop: 'calc(var(--safe-top) + 12px)' }}
    >
      <div className="flex min-w-0 items-center gap-2.5">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--color-accent)] text-[15px] font-bold text-[var(--color-accent-text)]">
          {initial}
        </div>
        <h1 className="truncate text-[17px] font-bold text-[var(--color-text)]">{businessName}</h1>
      </div>
      <span className="shrink-0 rounded-full bg-[var(--color-surface)] px-3 py-1.5 text-[12.5px] font-medium text-[var(--color-text-secondary)] shadow-[var(--shadow-sm)]">
        📍 {tableName}
      </span>
    </header>
  );
}
