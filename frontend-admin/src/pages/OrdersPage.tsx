import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  cancelOrder,
  getReceipt,
  listActiveOrders,
  payOrder,
  sendReceiptTelegram,
} from '../api/endpoints';
import type { ActiveOrder } from '../api/types';
import { tryPrintReceipt } from '../printer';

const STATUS_LABEL: Record<string, string> = {
  new: 'Yangi',
  activated: 'Faol',
  paid: "To'langan",
  cancelled: 'Bekor qilingan',
};

// Buyurtma yaratish endi faqat Telegram bot orqali (mijoz stol QR kodini skanerlab,
// botda menyuni ochib buyurtma beradi) — kassa paneli faqat kuzatish va to'lov uchun.
export default function OrdersPage() {
  const queryClient = useQueryClient();
  const { data: orders = [], isLoading } = useQuery({
    queryKey: ['active-orders'],
    queryFn: listActiveOrders,
    refetchInterval: 5000,
  });

  const [payTarget, setPayTarget] = useState<ActiveOrder | null>(null);
  const [paying, setPaying] = useState(false);
  const [payError, setPayError] = useState<string | null>(null);
  const [receiptStatus, setReceiptStatus] = useState<string | null>(null);

  const cancelMutation = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) => cancelOrder(id, reason),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['active-orders'] }),
  });

  function handleCancel(id: string) {
    const reason = prompt("Bekor qilish sababini kiriting:");
    if (reason) cancelMutation.mutate({ id, reason });
  }

  async function confirmPayment(order: ActiveOrder) {
    setPaying(true);
    setPayError(null);
    try {
      await payOrder(order.id, [{ method: 'cash', amount: order.final_amount }]);
      queryClient.invalidateQueries({ queryKey: ['active-orders'] });
      setPayTarget(null);

      const tableLabel = order.table_name ?? 'Buyurtma';
      try {
        const receipt = await getReceipt(order.id);
        const printed = await tryPrintReceipt(receipt);
        if (printed) {
          setReceiptStatus(`${tableLabel}: chek printerga yuborildi.`);
        } else if (order.telegram_id) {
          await sendReceiptTelegram(order.id);
          setReceiptStatus(`${tableLabel}: printer topilmadi, chek mijozga Telegram orqali yuborildi.`);
        } else {
          setReceiptStatus(`${tableLabel}: printer topilmadi va mijozning Telegram profili yo'q — chekni qo'lda taqdim eting.`);
        }
      } catch {
        setReceiptStatus(`${tableLabel}: to'lov saqlandi, lekin chekni chiqarib/yuborib bo'lmadi.`);
      }
    } catch (err: any) {
      setPayError(err?.response?.data?.error ?? "To'lovni saqlashda xatolik yuz berdi");
    } finally {
      setPaying(false);
    }
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-slate-900">Kassa — faol buyurtmalar</h1>
        <p className="text-sm text-slate-500">
          Har 5 soniyada avtomatik yangilanadi. Yangi buyurtmalar mijozlar tomonidan Telegram bot
          orqali beriladi.
        </p>
      </div>

      {receiptStatus && (
        <p className="mb-4 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          {receiptStatus}
        </p>
      )}

      {isLoading && <p className="text-sm text-slate-500">Yuklanmoqda...</p>}
      {!isLoading && orders.length === 0 && (
        <p className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-400">
          Hozircha faol buyurtma yo'q
        </p>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {orders.map((o) => (
          <div key={o.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="mb-2 flex items-center justify-between">
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
                {STATUS_LABEL[o.status] ?? o.status}
              </span>
              <span className="text-xs text-slate-400">{o.source}</span>
            </div>
            <p className="text-sm font-medium text-slate-900">{o.table_name ?? 'Onlayn buyurtma'}</p>
            {o.telegram_username ? (
              <p className="mb-1 text-xs text-sky-600">@{o.telegram_username}</p>
            ) : o.telegram_id ? (
              <p className="mb-1 text-xs text-sky-600">Telegram ID: {o.telegram_id}</p>
            ) : null}
            <p className="mb-1 mt-1 text-lg font-semibold text-slate-900">
              {o.final_amount.toLocaleString()} so'm
            </p>
            <p className="mb-4 text-xs text-slate-400">ID: {o.id.slice(0, 8)}</p>
            <div className="flex gap-2">
              <button
                onClick={() => setPayTarget(o)}
                className="flex-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700"
              >
                To'lash
              </button>
              <button
                onClick={() => handleCancel(o.id)}
                className="flex-1 rounded-lg border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50"
              >
                Bekor qilish
              </button>
            </div>
          </div>
        ))}
      </div>

      {payTarget && (
        <PaymentConfirmModal
          order={payTarget}
          submitting={paying}
          error={payError}
          onCancel={() => {
            setPayTarget(null);
            setPayError(null);
          }}
          onConfirm={() => confirmPayment(payTarget)}
        />
      )}
    </div>
  );
}

// Xato bilan noto'g'ri stolni to'langan deb belgilashning oldini olish uchun
// to'lov ikki bosqichda tasdiqlanadi: avval ma'lumot ko'rsatiladi, so'ng
// alohida "haqiqatan ham?" bosqichida yakuniy tasdiq so'raladi.
function PaymentConfirmModal({
  order,
  submitting,
  error,
  onCancel,
  onConfirm,
}: {
  order: ActiveOrder;
  submitting: boolean;
  error: string | null;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const [step, setStep] = useState<1 | 2>(1);
  const tableLabel = order.table_name ?? 'Onlayn buyurtma';

  return (
    <div className="fixed inset-0 z-20 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-sm rounded-xl bg-white p-6 shadow-lg">
        {step === 1 ? (
          <>
            <h2 className="mb-2 text-lg font-semibold text-slate-900">To'lovni tasdiqlash</h2>
            <p className="mb-1 text-sm text-slate-600">
              <span className="font-medium">{tableLabel}</span> uchun{' '}
              <span className="font-semibold text-slate-900">
                {order.final_amount.toLocaleString()} so'm
              </span>{' '}
              to'landi deb belgilanadi.
            </p>
            {order.telegram_username && (
              <p className="mb-3 text-xs text-slate-400">Mijoz: @{order.telegram_username}</p>
            )}
            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={onCancel}
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-600 hover:bg-slate-50"
              >
                Bekor qilish
              </button>
              <button
                onClick={() => setStep(2)}
                className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
              >
                Davom etish
              </button>
            </div>
          </>
        ) : (
          <>
            <h2 className="mb-2 text-lg font-semibold text-red-600">Haqiqatan ham tasdiqlaysizmi?</h2>
            <p className="mb-4 text-sm text-slate-600">
              <span className="font-medium">{tableLabel}</span> —{' '}
              <span className="font-semibold">{order.final_amount.toLocaleString()} so'm</span>.
              Bu amalni keyin bekor qilib bo'lmaydi. To'g'ri stolni tanlaganingizga ishonch hosil
              qiling.
            </p>
            {error && <p className="mb-3 text-sm text-red-600">{error}</p>}
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setStep(1)}
                disabled={submitting}
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-600 hover:bg-slate-50 disabled:opacity-60"
              >
                Orqaga
              </button>
              <button
                onClick={onConfirm}
                disabled={submitting}
                className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-60"
              >
                {submitting ? 'Saqlanmoqda...' : "Ha, to'landi"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
