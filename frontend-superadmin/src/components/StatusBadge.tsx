export default function StatusBadge({ active }: { active: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${
        active ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'
      }`}
    >
      <span className={active ? 'text-emerald-500' : 'text-red-500'}>●</span>
      {active ? 'Faol' : "To'xtatilgan"}
    </span>
  );
}
