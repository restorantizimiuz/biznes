import type { RefObject } from 'react';

export interface CategoryTab {
  id: string;
  name: string;
  emoji?: string;
}

export default function CategoryTabs({
  tabs,
  activeId,
  onSelect,
  pillRefs,
}: {
  tabs: CategoryTab[];
  activeId: string;
  onSelect: (id: string) => void;
  pillRefs: RefObject<Record<string, HTMLButtonElement | null>>;
}) {
  return (
    <div className="no-scrollbar flex gap-2 overflow-x-auto px-4 py-2.5">
      {tabs.map((tab) => {
        const active = activeId === tab.id;
        return (
          <button
            key={tab.id}
            ref={(el) => {
              pillRefs.current[tab.id] = el;
            }}
            onClick={() => onSelect(tab.id)}
            className={`shrink-0 rounded-full px-4 py-2 text-[13.5px] font-medium transition-colors ${
              active
                ? 'bg-[var(--color-accent)] text-[var(--color-accent-text)] shadow-[var(--shadow-sm)]'
                : 'bg-[var(--color-border)]/60 text-[var(--color-text-secondary)]'
            }`}
          >
            {tab.emoji ? `${tab.emoji} ` : ''}
            {tab.name}
          </button>
        );
      })}
    </div>
  );
}
