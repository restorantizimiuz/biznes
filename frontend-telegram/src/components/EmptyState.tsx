export default function EmptyState({
  emoji,
  title,
  subtitle,
  isError,
}: {
  emoji: string;
  title: string;
  subtitle?: string;
  isError?: boolean;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-8 py-16 text-center">
      <div className="text-4xl">{emoji}</div>
      <p
        className={`text-[15px] font-medium ${isError ? 'text-[var(--color-danger)]' : 'text-[var(--color-text)]'}`}
      >
        {title}
      </p>
      {subtitle && <p className="text-[13px] text-[var(--color-text-secondary)]">{subtitle}</p>}
    </div>
  );
}
