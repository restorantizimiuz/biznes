export default function SearchBar({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="relative">
      <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[15px] text-[var(--color-text-secondary)]">
        🔍
      </span>
      <input
        type="text"
        inputMode="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Taom qidirish..."
        className="h-11 w-full rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] pl-10 pr-9 text-[15px] text-[var(--color-text)] outline-none placeholder:text-[var(--color-text-secondary)] focus:border-[var(--color-accent)]"
      />
      {value && (
        <button
          onClick={() => onChange('')}
          aria-label="Tozalash"
          className="absolute right-3 top-1/2 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded-full bg-[var(--color-border)] text-[11px] text-[var(--color-text-secondary)]"
        >
          ✕
        </button>
      )}
    </div>
  );
}
