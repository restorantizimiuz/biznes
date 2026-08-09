import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  cancelOrder,
  createOrder,
  listActiveOrders,
  listFloors,
  listProducts,
  listTables,
  payOrder,
} from '../api/endpoints';

const STATUS_LABEL: Record<string, string> = {
  new: 'Yangi',
  activated: 'Faol',
  paid: "To'langan",
  cancelled: 'Bekor qilingan',
};

function NewOrderForm({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();
  const { data: floors = [] } = useQuery({ queryKey: ['floors'], queryFn: listFloors });
  const [floorId, setFloorId] = useState('');
  const { data: tables = [] } = useQuery({
    queryKey: ['tables', floorId],
    queryFn: () => listTables(floorId),
    enabled: !!floorId,
  });
  const { data: products = [] } = useQuery({ queryKey: ['products'], queryFn: () => listProducts() });
  const [tableId, setTableId] = useState('');
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: createOrder,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['active-orders'] });
      queryClient.invalidateQueries({ queryKey: ['tables', floorId] });
      onClose();
    },
    onError: (err: any) => setError(err?.response?.data?.error ?? 'Xatolik yuz berdi'),
  });

  function submit() {
    const items = Object.entries(quantities)
      .filter(([, qty]) => qty > 0)
      .map(([product_id, quantity]) => ({ product_id, quantity }));
    if (!tableId || items.length === 0) {
      setError('Stol va kamida bitta mahsulot tanlang');
      return;
    }
    mutation.mutate({ table_id: tableId, source: 'cashier', items });
  }

  return (
    <div className="fixed inset-0 z-10 flex items-center justify-center bg-black/30 p-4">
      <div className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-xl bg-white p-6 shadow-lg">
        <h2 className="mb-4 text-lg font-semibold text-slate-900">Yangi buyurtma</h2>

        <label className="mb-1 block text-sm font-medium text-slate-700">Qavat</label>
        <select
          className="mb-3 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          value={floorId}
          onChange={(e) => {
            setFloorId(e.target.value);
            setTableId('');
          }}
        >
          <option value="">Tanlang...</option>
          {floors.map((f) => (
            <option key={f.id} value={f.id}>
              {f.name}
            </option>
          ))}
        </select>

        <label className="mb-1 block text-sm font-medium text-slate-700">Stol</label>
        <select
          className="mb-4 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          value={tableId}
          onChange={(e) => setTableId(e.target.value)}
          disabled={!floorId}
        >
          <option value="">Tanlang...</option>
          {tables.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name} {t.status !== 'empty' ? `(${t.status})` : ''}
            </option>
          ))}
        </select>

        <p className="mb-2 text-sm font-medium text-slate-700">Mahsulotlar</p>
        <div className="mb-4 max-h-60 space-y-2 overflow-y-auto rounded-lg border border-slate-200 p-3">
          {products.length === 0 && <p className="text-sm text-slate-400">Mahsulot topilmadi</p>}
          {products.map((p) => (
            <div key={p.id} className="flex items-center justify-between gap-2">
              <div>
                <p className="text-sm text-slate-800">{p.name}</p>
                <p className="text-xs text-slate-400">{p.price.toLocaleString()} so'm</p>
              </div>
              <input
                type="number"
                min={0}
                className="w-16 rounded-lg border border-slate-300 px-2 py-1 text-sm"
                value={quantities[p.id] ?? 0}
                onChange={(e) =>
                  setQuantities((q) => ({ ...q, [p.id]: Number(e.target.value) }))
                }
              />
            </div>
          ))}
        </div>

        {error && <p className="mb-3 text-sm text-red-600">{error}</p>}

        <div className="flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-600 hover:bg-slate-50"
          >
            Bekor qilish
          </button>
          <button
            onClick={submit}
            disabled={mutation.isPending}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-60"
          >
            {mutation.isPending ? 'Saqlanmoqda...' : 'Buyurtma yaratish'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function OrdersPage() {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const { data: orders = [], isLoading } = useQuery({
    queryKey: ['active-orders'],
    queryFn: listActiveOrders,
    refetchInterval: 5000,
  });

  const payMutation = useMutation({
    mutationFn: ({ id, amount }: { id: string; amount: number }) =>
      payOrder(id, [{ method: 'cash', amount }]),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['active-orders'] }),
  });

  const cancelMutation = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) => cancelOrder(id, reason),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['active-orders'] }),
  });

  function handlePay(id: string, amount: number) {
    if (confirm(`${amount.toLocaleString()} so'm naqd to'lov sifatida qabul qilinsinmi?`)) {
      payMutation.mutate({ id, amount });
    }
  }

  function handleCancel(id: string) {
    const reason = prompt("Bekor qilish sababini kiriting:");
    if (reason) cancelMutation.mutate({ id, reason });
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Kassa — faol buyurtmalar</h1>
          <p className="text-sm text-slate-500">Har 5 soniyada avtomatik yangilanadi</p>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
        >
          + Yangi buyurtma
        </button>
      </div>

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
            <p className="mb-1 text-lg font-semibold text-slate-900">
              {o.final_amount.toLocaleString()} so'm
            </p>
            <p className="mb-4 text-xs text-slate-400">ID: {o.id.slice(0, 8)}</p>
            <div className="flex gap-2">
              <button
                onClick={() => handlePay(o.id, o.final_amount)}
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

      {showForm && <NewOrderForm onClose={() => setShowForm(false)} />}
    </div>
  );
}
