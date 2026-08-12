import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  addClosedOrderItem,
  deleteClosedOrderItem,
  downloadReportExcel,
  getDetailedReport,
  getReceipt,
  listFloors,
  listProducts,
  listTables,
  markReceiptPrinted,
  revertClosedOrder,
  updateClosedOrderPayment,
} from '../api/endpoints';
import type { ReportActivity, ReportFilters, ReportOrder } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { useTranslation } from '../i18n/LanguageContext';
import type { TranslationKey } from '../i18n/dictionaries';
import ModalShell from '../components/ModalShell';
import { tryPrintReceipt } from '../printer';

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function formatDateTime(iso: string) {
  const d = new Date(iso);
  return `${d.toLocaleDateString()} ${formatTime(iso)}`;
}

const STATUS_TONE: Record<string, string> = {
  paid: 'bg-emerald-100 text-emerald-700',
  cancelled: 'bg-red-100 text-red-700',
  new: 'bg-amber-100 text-amber-700',
  activated: 'bg-sky-100 text-sky-700',
};

export default function ReportsPage() {
  const { t } = useTranslation();
  const { can } = useAuth();
  const queryClient = useQueryClient();

  // Yopilgan buyurtmani tuzatish — moliyaviy yozuvni o'zgartirish, shuning
  // uchun u xodim boshqarish vakolati bilan bir xil darajada turadi
  // (backendda ham aynan shu kalit tekshiriladi: routes.go dagi closedEdit).
  // Kassir hisobotni ko'radi, lekin tahrirlay olmaydi.
  const canEdit = can('staff.manage');

  // Excel yuklash alohida vakolat — tugmani shunga qarab yashiramiz.
  const canExport = can('reports.export');

  const [filters, setFilters] = useState<ReportFilters>({ from: todayISO(), to: todayISO() });
  const [openOrder, setOpenOrder] = useState<ReportOrder | null>(null);

  // Sahifaga kirilganda hech narsa tanlanmasa ham bugungi hisobot yuklanadi —
  // kassir "Ko'rish" tugmasini bosmasdan oxirgi buyurtmalarni ko'radi.
  const { data, isFetching } = useQuery({
    queryKey: ['report', filters],
    queryFn: () => getDetailedReport(filters),
  });

  const { data: floors = [] } = useQuery({ queryKey: ['floors'], queryFn: listFloors });
  const firstFloorId = floors[0]?.id ?? '';
  const { data: tables = [] } = useQuery({
    queryKey: ['tables', firstFloorId],
    queryFn: () => listTables(firstFloorId),
    enabled: !!firstFloorId,
  });

  const exportMutation = useMutation({ mutationFn: () => downloadReportExcel(filters) });

  const summary = data?.summary;
  // Ochiq oyna ma'lumoti yangilangandan keyin ham dolzarb bo'lishi uchun
  // ID orqali qayta topiladi.
  const activeOrder = openOrder ? data?.orders.find((o) => o.id === openOrder.id) ?? null : null;

  function patchFilters(patch: Partial<ReportFilters>) {
    setFilters((current) => ({ ...current, ...patch }));
  }

  function refresh() {
    queryClient.invalidateQueries({ queryKey: ['report'] });
  }

  return (
    <div>
      <h1 className="mb-4 text-lg font-semibold text-slate-900 sm:mb-6 sm:text-xl">
        {t('reports.title')}
      </h1>

      {/* Filtrlar ham ekranga, ham Excel yuklashga bir xil qo'llanadi */}
      <div className="mb-5 space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-end gap-3">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-slate-600">{t('reports.from')}</span>
            <input
              type="date"
              value={filters.from}
              onChange={(e) => patchFilters({ from: e.target.value })}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-slate-600">{t('reports.to')}</span>
            <input
              type="date"
              value={filters.to}
              onChange={(e) => patchFilters({ to: e.target.value })}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </label>
          {canExport && (
            <button
              onClick={() => exportMutation.mutate()}
              disabled={exportMutation.isPending}
              className="ml-auto rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-60"
            >
              {exportMutation.isPending ? t('app.loading') : t('reports.export')}
            </button>
          )}
        </div>

        <div className="flex flex-wrap items-end gap-3 border-t border-slate-100 pt-3">
          <div className="flex gap-1.5">
            <FilterChip
              active={!filters.source}
              label={t('reports.allOrders')}
              onClick={() => patchFilters({ source: '' })}
            />
            <FilterChip
              active={filters.source === 'online'}
              label={t('reports.onlyOnline')}
              onClick={() => patchFilters({ source: 'online', table_id: '' })}
            />
          </div>

          <label className="block">
            <span className="mb-1 block text-xs font-medium text-slate-600">{t('reports.byTable')}</span>
            <select
              value={filters.table_id ?? ''}
              onChange={(e) => patchFilters({ table_id: e.target.value, source: '' })}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
            >
              <option value="">{t('reports.anyTable')}</option>
              {tables.map((tb) => (
                <option key={tb.id} value={tb.id}>
                  {tb.name}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="mb-1 block text-xs font-medium text-slate-600">
              {t('reports.byPayment')}
            </span>
            <select
              value={filters.payment_method ?? ''}
              onChange={(e) => patchFilters({ payment_method: e.target.value })}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
            >
              <option value="">{t('reports.anyPayment')}</option>
              <option value="cash">{t('pay.method.cash')}</option>
              <option value="card">{t('pay.method.card')}</option>
              <option value="transfer">{t('pay.method.transfer')}</option>
            </select>
          </label>

          <label className="block">
            <span className="mb-1 block text-xs font-medium text-slate-600">
              {t('reports.byStatus')}
            </span>
            <select
              value={filters.status ?? ''}
              onChange={(e) => patchFilters({ status: e.target.value })}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
            >
              <option value="">{t('reports.anyStatus')}</option>
              <option value="paid">{t('reports.status.paid')}</option>
              <option value="activated">{t('reports.status.activated')}</option>
              <option value="new">{t('reports.status.new')}</option>
              <option value="cancelled">{t('reports.status.cancelled')}</option>
            </select>
          </label>

          <button
            onClick={() => setFilters({ from: filters.from, to: filters.to })}
            className="rounded-lg px-3 py-2 text-sm text-slate-500 underline hover:text-slate-700"
          >
            {t('reports.resetFilters')}
          </button>
        </div>
      </div>

      {summary && (
        <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7">
          <StatCard label={t('reports.totalOrders')} value={summary.total_orders} />
          <StatCard label={t('reports.onlineOrders')} value={summary.online_orders} />
          <StatCard label={t('reports.openOrders')} value={summary.open_orders} />
          <StatCard label={t('reports.cancelledOrders')} value={summary.cancelled_orders} />
          <StatCard
            label={t('reports.totalRevenue')}
            value={`${summary.total_revenue.toLocaleString()} ${t('app.currency')}`}
            highlight
          />
          <StatCard label={t('reports.cash')} value={summary.cash_total.toLocaleString()} />
          <StatCard
            label={t('reports.cardTransfer')}
            value={(summary.card_total + summary.transfer_total).toLocaleString()}
          />
        </div>
      )}

      <section className="mb-6">
        <h2 className="mb-2 text-sm font-semibold text-slate-700">
          {t('reports.ordersList')}
          {isFetching && <span className="ml-2 text-xs font-normal text-slate-400">…</span>}
        </h2>
        <OrdersTable orders={data?.orders ?? []} onOpen={setOpenOrder} />
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold text-slate-700">{t('reports.activityLog')}</h2>
        <ActivityList activity={data?.activity ?? []} />
      </section>

      {activeOrder && (
        <OrderDetailModal
          order={activeOrder}
          activity={(data?.activity ?? []).filter((a) => a.order_id === activeOrder.id)}
          canEdit={canEdit}
          onClose={() => setOpenOrder(null)}
          onChanged={refresh}
        />
      )}
    </div>
  );
}

function FilterChip({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-lg px-3 py-2 text-sm font-medium ${
        active
          ? 'bg-indigo-600 text-white'
          : 'border border-slate-200 text-slate-600 hover:bg-slate-50'
      }`}
    >
      {label}
    </button>
  );
}

function StatCard({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string | number;
  highlight?: boolean;
}) {
  return (
    <div
      className={`rounded-2xl border p-3 shadow-sm ${
        highlight ? 'border-emerald-200 bg-emerald-50' : 'border-slate-200 bg-white'
      }`}
    >
      <p className="mb-1 text-xs text-slate-500">{label}</p>
      <p className="text-base font-semibold text-slate-900">{value}</p>
    </div>
  );
}

// Buyurtmalar jadvali. Keng jadval telefonda gorizontal siljiydi — sahifaning
// o'zi hech qachon yon tomonga siljimaydi.
function OrdersTable({
  orders,
  onOpen,
}: {
  orders: ReportOrder[];
  onOpen: (order: ReportOrder) => void;
}) {
  const { t } = useTranslation();

  if (orders.length === 0) {
    return (
      <p className="rounded-2xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-400">
        {t('reports.noOrders')}
      </p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
      <table className="w-full min-w-[880px] text-sm">
        <thead className="bg-slate-50 text-left text-xs text-slate-500">
          <tr>
            <th className="px-3 py-2 font-medium">{t('reports.time')}</th>
            <th className="px-3 py-2 font-medium">{t('reports.table')}</th>
            <th className="px-3 py-2 font-medium">{t('reports.source')}</th>
            <th className="px-3 py-2 font-medium">{t('reports.status')}</th>
            <th className="px-3 py-2 font-medium">{t('reports.openedBy')}</th>
            <th className="px-3 py-2 font-medium">{t('reports.paidBy')}</th>
            <th className="px-3 py-2 font-medium">{t('reports.paymentMethod')}</th>
            <th className="px-3 py-2 text-right font-medium">{t('reports.amount')}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {orders.map((o) => (
            <tr
              key={o.id}
              onClick={() => onOpen(o)}
              className="cursor-pointer hover:bg-indigo-50/50"
            >
              <td className="whitespace-nowrap px-3 py-2 text-slate-600">
                {formatDateTime(o.created_at)}
              </td>
              <td className="px-3 py-2 text-slate-900">
                {o.table_name ?? (
                  <span className="text-slate-500">
                    {t(`orders.type.${o.order_type}` as TranslationKey)}
                  </span>
                )}
                {/* Yopilgandan keyin tuzatilgan buyurtma alohida belgilanadi */}
                {o.edited && (
                  <span className="ml-1.5 text-amber-600" title={t('reports.edited')}>
                    ✎
                  </span>
                )}
              </td>
              <td className="px-3 py-2 text-slate-500">
                {t(`orders.source.${o.source}` as TranslationKey)}
              </td>
              <td className="px-3 py-2">
                <span
                  className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                    STATUS_TONE[o.status] ?? 'bg-slate-100 text-slate-600'
                  }`}
                >
                  {t(`reports.status.${o.status}` as TranslationKey)}
                </span>
              </td>
              <td className="px-3 py-2 text-slate-600">{o.created_by ?? '—'}</td>
              <td className="px-3 py-2 text-slate-600">{o.paid_by ?? '—'}</td>
              <td className="px-3 py-2 text-slate-500">{o.payment_methods ?? '—'}</td>
              <td className="whitespace-nowrap px-3 py-2 text-right font-medium text-slate-900">
                {o.final_amount.toLocaleString()}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// Amallar jurnali: "14:32 — Kassir Ali: Stol 5 ga Osh ×2 qo'shdi".
function ActivityList({ activity }: { activity: ReportActivity[] }) {
  const { t } = useTranslation();

  if (activity.length === 0) {
    return (
      <p className="rounded-2xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-400">
        {t('reports.noActivity')}
      </p>
    );
  }

  return (
    <div className="max-h-[420px] overflow-y-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
      <ul className="divide-y divide-slate-100">
        {activity.map((entry) => (
          <li key={entry.id} className="flex gap-3 px-3 py-2 text-sm">
            <span className="w-12 shrink-0 text-xs text-slate-400">
              {formatTime(entry.created_at)}
            </span>
            <span className="min-w-0 flex-1">
              <span className="font-medium text-slate-800">{entry.actor || '—'}</span>
              {entry.table_name && <span className="text-slate-500"> · {entry.table_name}</span>}
              <span className="text-slate-600">
                {' '}
                {t(`audit.${entry.action}` as TranslationKey)}
              </span>
              <span className="block text-xs text-slate-400">{describeDetails(entry.details)}</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Jurnal tafsilotlarini o'qish uchun qulay satrga aylantiradi.
 *
 * Tafsilotlar JSONB — har bir amal turi uchun turli maydonlar bo'ladi.
 * Shuning uchun aniq kalitlar emas, umumiy "kalit: qiymat" ko'rinishi
 * ishlatiladi: yangi amal turi qo'shilsa ham jurnal o'qiladigan bo'lib qoladi.
 */
function describeDetails(details: Record<string, unknown> | null): string {
  if (!details) return '';
  return Object.entries(details)
    .filter(([, value]) => value !== null && value !== '' && value !== undefined)
    .map(([key, value]) => {
      const text = Array.isArray(value) ? value.join(', ') : String(value);
      return `${key}: ${text}`;
    })
    .join(' · ');
}

// ---------------------------------------------------------------------------
// Buyurtma tafsiloti va tuzatish
// ---------------------------------------------------------------------------

function OrderDetailModal({
  order,
  activity,
  canEdit,
  onClose,
  onChanged,
}: {
  order: ReportOrder;
  activity: ReportActivity[];
  canEdit: boolean;
  onClose: () => void;
  onChanged: () => void;
}) {
  const { t } = useTranslation();
  const [screen, setScreen] = useState<'detail' | 'edit'>('detail');
  const [message, setMessage] = useState<string | null>(null);
  const [printing, setPrinting] = useState(false);

  // Hisobotdan eski chekni qayta chiqarish.
  async function reprint() {
    setPrinting(true);
    try {
      const receipt = await getReceipt(order.id);
      if (await tryPrintReceipt(receipt)) {
        await markReceiptPrinted(order.id, false);
        setMessage(t('receipt.printed'));
      } else {
        setMessage(t('receipt.failed'));
      }
    } catch {
      setMessage(t('receipt.failed'));
    }
    setPrinting(false);
  }

  return (
    <ModalShell
      title={order.table_name ?? t(`orders.type.${order.order_type}` as TranslationKey)}
      subtitle={`${formatDateTime(order.created_at)} · ${t(`reports.status.${order.status}` as TranslationKey)}`}
      size="lg"
      onBack={screen === 'edit' ? () => setScreen('detail') : undefined}
      onClose={onClose}
    >
      {screen === 'edit' ? (
        <EditOrderPanel
          order={order}
          onChanged={() => {
            onChanged();
            setScreen('detail');
          }}
        />
      ) : (
        <div className="flex-1 overflow-y-auto px-4 py-4 sm:px-5">
          {message && (
            <p className="mb-3 rounded-lg bg-slate-100 px-3 py-2 text-sm text-slate-700">{message}</p>
          )}

          <dl className="mb-4 grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
            <DetailRow label={t('reports.openedBy')} value={order.created_by} />
            <DetailRow label={t('reports.paidBy')} value={order.paid_by} />
            <DetailRow label={t('reports.waiter')} value={order.waiter_name} />
            <DetailRow label={t('reports.paymentMethod')} value={order.payment_methods} />
            <DetailRow label={t('orders.phone')} value={order.customer_phone} />
            <DetailRow label={t('orders.address')} value={order.delivery_address} />
          </dl>

          <div className="mb-4 rounded-lg border border-slate-200">
            {order.items.map((item) => (
              <div
                key={item.id}
                className="flex justify-between border-b border-slate-100 px-3 py-2 text-sm last:border-b-0"
              >
                <span className="text-slate-600">
                  {item.product_name} × {item.quantity}
                </span>
                <span className="text-slate-900">
                  {(item.unit_price * item.quantity).toLocaleString()}
                </span>
              </div>
            ))}
            {order.discount_amount > 0 && (
              <div className="flex justify-between border-t border-slate-200 px-3 py-2 text-sm text-amber-700">
                <span>
                  {t('orders.discount')}
                  {order.discount_reason ? ` (${order.discount_reason})` : ''}
                </span>
                <span>−{order.discount_amount.toLocaleString()}</span>
              </div>
            )}
            <div className="flex justify-between border-t border-slate-200 px-3 py-2 text-sm font-semibold">
              <span>{t('orders.orderTotal')}</span>
              <span>
                {order.final_amount.toLocaleString()} {t('app.currency')}
              </span>
            </div>
          </div>

          <h3 className="mb-2 text-xs font-semibold text-slate-500">{t('reports.activityLog')}</h3>
          <ActivityList activity={activity} />

          <div className="mt-4 flex flex-wrap gap-2">
            <button
              onClick={reprint}
              disabled={printing}
              className="rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-60"
            >
              🧾 {printing ? t('receipt.printing') : t('receipt.reprint')}
            </button>
            {canEdit ? (
              <button
                onClick={() => setScreen('edit')}
                className="rounded-lg bg-amber-500 px-4 py-2.5 text-sm font-medium text-white hover:bg-amber-600"
              >
                ✎ {t('reports.editTitle')}
              </button>
            ) : (
              <p className="self-center text-xs text-slate-400">{t('reports.onlyOwnerCanEdit')}</p>
            )}
          </div>
        </div>
      )}
    </ModalShell>
  );
}

function DetailRow({ label, value }: { label: string; value: string | null }) {
  if (!value) return null;
  return (
    <>
      <dt className="text-slate-500">{label}</dt>
      <dd className="text-slate-900">{value}</dd>
    </>
  );
}

/**
 * Yopilgan buyurtmani tuzatish.
 *
 * Har bir amal uchun sabab majburiy: vaqt o'tib "nega o'zgardi?" degan
 * savolga javob topilishi kerak. Sabab audit jurnaliga yoziladi.
 */
function EditOrderPanel({ order, onChanged }: { order: ReportOrder; onChanged: () => void }) {
  const { t } = useTranslation();
  const { data: products = [] } = useQuery({ queryKey: ['products'], queryFn: () => listProducts() });

  const [reason, setReason] = useState('');
  const [method, setMethod] = useState('cash');
  const [cardType, setCardType] = useState('uzcard');
  const [productId, setProductId] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [error, setError] = useState<string | null>(null);

  const availableProducts = useMemo(() => products.filter((p) => p.is_available), [products]);

  function requireReason(): boolean {
    if (reason.trim()) return true;
    setError(t('app.reasonRequired'));
    return false;
  }

  function handleError(err: any) {
    setError(err?.response?.data?.error ?? t('app.error'));
  }

  const paymentMutation = useMutation({
    mutationFn: () =>
      updateClosedOrderPayment(order.id, {
        method,
        card_type: method === 'card' ? cardType : undefined,
        reason: reason.trim(),
      }),
    onSuccess: onChanged,
    onError: handleError,
  });

  const addItemMutation = useMutation({
    mutationFn: () =>
      addClosedOrderItem(order.id, { product_id: productId, quantity, reason: reason.trim() }),
    onSuccess: onChanged,
    onError: handleError,
  });

  const removeItemMutation = useMutation({
    mutationFn: (itemId: string) => deleteClosedOrderItem(order.id, itemId, reason.trim()),
    onSuccess: onChanged,
    onError: handleError,
  });

  const revertMutation = useMutation({
    mutationFn: () => revertClosedOrder(order.id, reason.trim()),
    onSuccess: onChanged,
    onError: handleError,
  });

  const busy =
    paymentMutation.isPending ||
    addItemMutation.isPending ||
    removeItemMutation.isPending ||
    revertMutation.isPending;

  return (
    <div className="flex-1 space-y-5 overflow-y-auto px-4 py-4 sm:px-5">
      <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
        {t('reports.editHint')}
      </p>

      <label className="block">
        <span className="mb-1 block text-xs font-medium text-slate-600">{t('app.reason')} *</span>
        <input
          value={reason}
          onChange={(e) => {
            setReason(e.target.value);
            setError(null);
          }}
          placeholder={t('app.reason')}
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
        />
      </label>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {/* 1. To'lov turini tuzatish */}
      <section className="rounded-lg border border-slate-200 p-3">
        <h3 className="mb-2 text-sm font-semibold text-slate-700">{t('reports.fixPayment')}</h3>
        <div className="mb-2 flex flex-wrap gap-2">
          {['cash', 'card', 'transfer'].map((m) => (
            <button
              key={m}
              onClick={() => setMethod(m)}
              className={`rounded-lg px-3 py-2 text-sm ${
                method === m
                  ? 'bg-indigo-600 text-white'
                  : 'border border-slate-200 text-slate-600 hover:bg-slate-50'
              }`}
            >
              {t(`pay.method.${m}` as TranslationKey)}
            </button>
          ))}
        </div>
        {method === 'card' && (
          <div className="mb-2 flex flex-wrap gap-2">
            {['uzcard', 'humo', 'visa', 'mastercard'].map((ct) => (
              <button
                key={ct}
                onClick={() => setCardType(ct)}
                className={`rounded-lg px-3 py-1.5 text-sm capitalize ${
                  cardType === ct
                    ? 'bg-slate-800 text-white'
                    : 'border border-slate-200 text-slate-600 hover:bg-slate-50'
                }`}
              >
                {ct}
              </button>
            ))}
          </div>
        )}
        <button
          onClick={() => requireReason() && paymentMutation.mutate()}
          disabled={busy}
          className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-60"
        >
          {t('app.save')}
        </button>
      </section>

      {/* 2. Taom qo'shish */}
      <section className="rounded-lg border border-slate-200 p-3">
        <h3 className="mb-2 text-sm font-semibold text-slate-700">{t('reports.addItem')}</h3>
        <div className="flex flex-wrap items-end gap-2">
          <select
            value={productId}
            onChange={(e) => setProductId(e.target.value)}
            className="min-w-40 flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm"
          >
            <option value="">{t('reports.selectProduct')}</option>
            {availableProducts.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} — {p.price.toLocaleString()}
              </option>
            ))}
          </select>
          <input
            type="number"
            min={1}
            value={quantity}
            onChange={(e) => setQuantity(Math.max(1, Number(e.target.value)))}
            className="w-20 rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
          <button
            onClick={() => productId && requireReason() && addItemMutation.mutate()}
            disabled={busy || !productId}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-60"
          >
            {t('app.add')}
          </button>
        </div>
      </section>

      {/* 3. Taomni o'chirish */}
      <section className="rounded-lg border border-slate-200 p-3">
        <h3 className="mb-2 text-sm font-semibold text-slate-700">{t('reports.removeItem')}</h3>
        <div className="space-y-1">
          {order.items.map((item) => (
            <div key={item.id} className="flex items-center justify-between gap-2 text-sm">
              <span className="min-w-0 flex-1 truncate text-slate-600">
                {item.product_name} × {item.quantity}
              </span>
              <button
                onClick={() => requireReason() && removeItemMutation.mutate(item.id)}
                disabled={busy}
                className="rounded-lg border border-red-200 px-3 py-1.5 text-xs text-red-600 hover:bg-red-50 disabled:opacity-60"
              >
                {t('app.delete')}
              </button>
            </div>
          ))}
        </div>
      </section>

      {/* 4. Butun buyurtmani qaytarish */}
      <section className="rounded-lg border border-red-200 bg-red-50/50 p-3">
        <h3 className="mb-2 text-sm font-semibold text-red-700">{t('reports.revert')}</h3>
        <button
          onClick={() => {
            if (!requireReason()) return;
            if (confirm(t('reports.revertConfirm'))) revertMutation.mutate();
          }}
          disabled={busy || order.status === 'cancelled'}
          className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-60"
        >
          {t('reports.revert')}
        </button>
      </section>
    </div>
  );
}
