// Bu bo'limlar uchun platforma darajasida hali backend endpoint yo'q
// (faqat /platform/login, /stats, /businesses, subscription, features bor).
// Shuning uchun soxta ma'lumot ko'rsatish o'rniga aniq, halol xabar beriladi —
// funksiya backend qo'shilgandan keyin shu sahifaning o'ziga ulanadi.
export default function ComingSoonPage({ icon, title }: { icon: string; title: string }) {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center">
      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-indigo-50 text-3xl">
        {icon}
      </div>
      <h1 className="text-lg font-semibold text-slate-900">{title}</h1>
      <p className="mt-2 max-w-sm text-sm text-slate-500">
        Bu bo'lim hali backend tomonidan qo'llab-quvvatlanmaydi. Platforma API'siga tegishli
        endpoint qo'shilgach, shu yerda ishga tushadi.
      </p>
      <span className="mt-4 rounded-full bg-amber-50 px-3 py-1 text-xs font-medium text-amber-700">
        Tez orada
      </span>
    </div>
  );
}
