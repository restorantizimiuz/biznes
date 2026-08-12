import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  activateOrder,
  addOrderItems,
  applyDiscount,
  cancelOrder,
  createOrder,
  deleteOrderItem,
  getDailySummary,
  getReceipt,
  listActiveOrders,
  listCategories,
  listFloors,
  listProducts,
  listTables,
  markReceiptPrinted,
  payOrder,
  sendReceiptTelegram,
  updateKitchenStatus,
  updateOrderItem,
} from '../api/endpoints';
import type { ActiveOrder, KitchenStatus, Table } from '../api/types';
import { checkPrinterHealth, tryPrintReceipt } from '../printer';
import { useAuth } from '../auth/AuthContext';
import { useTranslation } from '../i18n/LanguageContext';
import type { TranslationKey } from '../i18n/dictionaries';
import ModalShell from '../components/ModalShell';
import ProductPickCard from '../components/ProductPickCard';
import { useOrderNotifications } from '../notifications/useOrderNotifications';

type PaymentMethod = 'cash' | 'card' | 'transfer';
type CardType = 'uzcard' | 'humo' | 'visa' | 'mastercard';

/**
 * Buyurtma turiga mos tayyorlash bosqichlari.
 * Backend ham shu qoidani majburlaydi (orders.go: UpdateKitchenStatus) —
 * 'delivering'/'delivered' faqat yetkazib berish buyurtmasida qabul qilinadi.
 */
function kitchenStagesFor(order: ActiveOrder): KitchenStatus[] {
  return order.order_type === 'delivery'
    ? ['preparing', 'ready', 'delivering', 'delivered']
    : ['preparing', 'ready'];
}

const CARD_TYPES: CardType[] = ['uzcard', 'humo', 'visa', 'mastercard'];

// Stol katakchasining rangi buyurtma holatiga qarab tanlanadi — kassir zalga
// bir qarab qaysi stol e'tibor talab qilishini ko'rishi uchun.
function tableAppearance(order: ActiveOrder | undefined) {
  if (!order) return { box: 'border-slate-200 bg-white', badge: 'bg-slate-100 text-slate-500' };
  if (order.status === 'new')
    return { box: 'border-red-300 bg-red-50 ring-2 ring-red-200', badge: 'bg-red-100 text-red-700' };
  if (order.kitchen_status === 'ready')
    return { box: 'border-emerald-300 bg-emerald-50', badge: 'bg-emerald-100 text-emerald-700' };
  return { box: 'border-amber-300 bg-amber-50', badge: 'bg-amber-100 text-amber-700' };
}

function tableStatusKey(order: ActiveOrder | undefined): TranslationKey {
  if (!order) return 'orders.tableEmpty';
  if (order.status === 'new') return 'orders.pendingApproval';
  return order.kitchen_status === 'ready' ? 'orders.ready' : 'orders.preparing';
}

const ORDER_TYPE_EMOJI: Record<string, string> = {
  dine_in: '🍽️',
  delivery: '🚚',
  pickup: '🥡',
};

// Printer holati 30 soniyada bir tekshiriladi: tez-tez so'rash keraksiz,
// juda kam so'rash esa uzilishni kech ko'rsatadi.
const PRINTER_HEALTH_INTERVAL_MS = 30000;

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function StatCard({
  icon,
  title,
  value,
  hint,
  highlight,
}: {
  icon: string;
  title: string;
  value: string;
  hint: string;
  highlight?: boolean;
}) {
  return (
    <div
      className={`rounded-2xl border p-4 shadow-sm ${
        highlight ? 'border-indigo-200 bg-indigo-50/60' : 'border-slate-200 bg-white'
      }`}
    >
      <div className="mb-2 flex items-center gap-2">
        <span
          className={`flex h-8 w-8 items-center justify-center rounded-lg text-sm ${
            highlight ? 'bg-indigo-100' : 'bg-slate-100'
          }`}
        >
          {icon}
        </span>
        <p className="text-xs font-medium text-slate-500">{title}</p>
      </div>
      <p className="text-xl font-semibold text-slate-900 sm:text-2xl">{value}</p>
      <p className="mt-0.5 text-xs text-slate-400">{hint}</p>
    </div>
  );
}

export default function OrdersPage() {
  const { t } = useTranslation();
  const { can } = useAuth();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { focusOrderId, clearFocus } = useOrderNotifications();

  // Ofitsiant uchun kassa ko'rsatkichlari yopiq: kunlik daromad — moliyaviy
  // ma'lumot va `/reports/daily` unga 403 qaytaradi. Shuning uchun so'rov
  // umuman yuborilmaydi (aks holda har sahifa ochilishida behuda xato).
  const canSeeMoney = can('reports.view');
  const canPay = can('orders.pay');

  const { data: floors = [] } = useQuery({ queryKey: ['floors'], queryFn: listFloors });
  // '' — birinchi qavat, 'online' — stolsiz (yetkazib berish/olib ketish) buyurtmalar
  const [activeFloor, setActiveFloor] = useState('');
  const onlineView = activeFloor === 'online';
  const floorId = onlineView ? '' : activeFloor || floors[0]?.id || '';

  const { data: tables = [] } = useQuery({
    queryKey: ['tables', floorId],
    queryFn: () => listTables(floorId),
    enabled: !!floorId,
  });

  // WebSocket asosiy yo'l, lekin 5 soniyalik so'rov zaxira bo'lib qoladi —
  // ulanish uzilsa ham kassa ishlashda davom etadi.
  const { data: orders = [] } = useQuery({
    queryKey: ['active-orders'],
    queryFn: listActiveOrders,
    refetchInterval: 5000,
  });

  // Printer faqat chek chiqaradiganga kerak — ofitsiantda bu tugma yo'q.
  const { data: printerOnline = false } = useQuery({
    queryKey: ['printer-health'],
    queryFn: checkPrinterHealth,
    refetchInterval: PRINTER_HEALTH_INTERVAL_MS,
    enabled: canPay,
  });

  // Bugungi umumiy son/daromad — hozir ochiq bo'lmagan (allaqachon to'langan)
  // buyurtmalarni ham hisobga oladi, shuning uchun alohida kunlik hisobotdan olinadi.
  const { data: dailySummary } = useQuery({
    queryKey: ['daily-summary', 'today'],
    queryFn: () => getDailySummary(todayISO(), todayISO()),
    refetchInterval: 30000,
    enabled: canSeeMoney,
  });

  const ordersByTable = useMemo(() => {
    const map: Record<string, ActiveOrder> = {};
    for (const o of orders) if (o.table_id) map[o.table_id] = o;
    return map;
  }, [orders]);

  const preparingCount = useMemo(
    () => orders.filter((o) => o.status !== 'new' && o.kitchen_status === 'preparing').length,
    [orders],
  );
  const readyCount = useMemo(
    () => orders.filter((o) => o.kitchen_status === 'ready').length,
    [orders],
  );

  const onlineOrders = useMemo(() => orders.filter((o) => !o.table_id), [orders]);
  const newOnlineCount = onlineOrders.filter((o) => o.status === 'new').length;

  const [openTableId, setOpenTableId] = useState<string | null>(null);
  const [openOrderId, setOpenOrderId] = useState<string | null>(null);
  const [receiptStatus, setReceiptStatus] = useState<string | null>(null);

  // Bildirishnoma banneri bosilganda o'sha buyurtma oynasi ochiladi.
  useEffect(() => {
    if (!focusOrderId) return;
    const order = orders.find((o) => o.id === focusOrderId);
    if (!order) return;
    if (order.table_id) {
      const floor = floors.find(() => true);
      if (floor) setActiveFloor((current) => current || floor.id);
      setOpenTableId(order.table_id);
    } else {
      setActiveFloor('online');
      setOpenOrderId(order.id);
    }
    clearFocus();
  }, [focusOrderId, orders, floors, clearFocus]);

  // Ochiq oyna ma'lumoti har yangilanishdan keyin ham dolzarb bo'lishi uchun
  // ID orqali qidiriladi (nusxa saqlanmaydi).
  const openTable = tables.find((tb) => tb.id === openTableId) ?? null;
  const openTableOrder = openTableId ? ordersByTable[openTableId] : undefined;
  const openOnlineOrder = orders.find((o) => o.id === openOrderId);

  function refreshOrders() {
    queryClient.invalidateQueries({ queryKey: ['active-orders'] });
    queryClient.invalidateQueries({ queryKey: ['tables', floorId] });
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3 sm:mb-6">
        <div>
          <h1 className="text-lg font-semibold text-slate-900 sm:text-xl">{t('orders.title')}</h1>
          <p className="text-sm text-slate-500">{t('orders.subtitle')}</p>
        </div>
        {/* Printer holati: kassir chek chiqmasligini to'lov paytida emas,
            oldindan bilib turishi kerak. Ofitsiantga bu belgi ma'nosiz. */}
        {canPay && (
          <span
            className={`rounded-full px-3 py-1 text-xs font-medium ${
              printerOnline ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'
            }`}
          >
            🖨️ {printerOnline ? t('receipt.printerOnline') : t('receipt.printerOffline')}
          </span>
        )}
      </div>

      {/* Ofitsiantga faqat ish bilan bog'liq ikkita ko'rsatkich qoladi —
          buyurtma soni va daromad moliyaviy ma'lumot hisoblanadi. */}
      <div
        className={`mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2 ${
          canSeeMoney ? 'lg:grid-cols-4' : 'lg:grid-cols-2'
        }`}
      >
        {canSeeMoney && (
          <StatCard
            icon="🧾"
            title={t('orders.stat.todayOrders')}
            value={String(dailySummary?.total_orders ?? 0)}
            hint={t('orders.stat.todayOrdersHint')}
          />
        )}
        <StatCard
          icon="🔥"
          title={t('orders.preparing')}
          value={String(preparingCount)}
          hint={t('orders.stat.preparingHint')}
        />
        <StatCard
          icon="✅"
          title={t('orders.ready')}
          value={String(readyCount)}
          hint={t('orders.stat.readyHint')}
        />
        {canSeeMoney && (
          <StatCard
            icon="💰"
            title={t('orders.stat.revenue')}
            value={`${(dailySummary?.total_revenue ?? 0).toLocaleString()} ${t('app.currency')}`}
            hint={t('orders.stat.revenueHint')}
            highlight
          />
        )}
      </div>

      {receiptStatus && (
        <p className="mb-4 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          {receiptStatus}
        </p>
      )}

      <div className="mb-4 flex flex-wrap gap-2">
        {floors.map((f) => (
          <button
            key={f.id}
            onClick={() => setActiveFloor(f.id)}
            className={`rounded-lg px-3 py-2 text-sm font-medium ${
              !onlineView && f.id === floorId
                ? 'bg-indigo-600 text-white'
                : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
            }`}
          >
            {f.name}
          </button>
        ))}
        <button
          onClick={() => setActiveFloor('online')}
          className={`relative rounded-lg px-3 py-2 text-sm font-medium ${
            onlineView
              ? 'bg-indigo-600 text-white'
              : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
          }`}
        >
          🚚 {t('orders.online')}
          {newOnlineCount > 0 && (
            <span className="absolute -right-1.5 -top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-600 px-1 text-[11px] font-bold text-white">
              {newOnlineCount}
            </span>
          )}
        </button>
      </div>

      {onlineView ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {onlineOrders.map((o) => {
            const look = tableAppearance(o);
            return (
              <button
                key={o.id}
                onClick={() => setOpenOrderId(o.id)}
                className={`rounded-xl border p-4 text-left shadow-sm transition hover:shadow-md ${look.box}`}
              >
                <div className="mb-2 flex items-start justify-between gap-2">
                  <p className="font-semibold text-slate-900">
                    {ORDER_TYPE_EMOJI[o.order_type]} {t(`orders.type.${o.order_type}` as TranslationKey)}
                  </p>
                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${look.badge}`}
                  >
                    {t(tableStatusKey(o))}
                  </span>
                </div>
                {o.customer_phone && <p className="text-xs text-slate-600">📞 {o.customer_phone}</p>}
                {o.delivery_address && (
                  <p className="truncate text-xs text-slate-500">📍 {o.delivery_address}</p>
                )}
                <p className="mt-1.5 text-lg font-semibold text-slate-900">
                  {o.final_amount.toLocaleString()} {t('app.currency')}
                </p>
                <p className="mt-1 truncate text-xs text-slate-500">
                  {o.items.map((i) => `${i.product_name} ×${i.quantity}`).join(', ')}
                </p>
              </button>
            );
          })}
          {onlineOrders.length === 0 && (
            <p className="col-span-full rounded-xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-400">
              {t('orders.noOnlineOrders')}
            </p>
          )}
        </div>
      ) : floors.length === 0 ? (
        <div className="mx-auto flex max-w-md flex-col items-center rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-10 text-center sm:px-10 sm:py-14">
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-indigo-50 text-3xl">
            🪑
          </div>
          <h2 className="text-base font-semibold text-slate-900 sm:text-lg">
            {t('orders.emptyFloorsTitle')}
          </h2>
          <p className="mt-2 whitespace-pre-line text-sm text-slate-500">
            {t('orders.emptyFloorsText')}
          </p>
          <button
            onClick={() => navigate('/tables')}
            className="mt-6 w-full rounded-xl bg-gradient-to-r from-indigo-600 to-indigo-500 px-5 py-3 text-sm font-medium text-white shadow-sm transition hover:from-indigo-700 hover:to-indigo-600 sm:w-auto"
          >
            {t('orders.goToTables')}
          </button>
        </div>
      ) : (
        // Telefonda 2 ustun, planshetda 3, kompyuterda 4-5 — stol katakchalari
        // barmoq bilan bosiladigan o'lchamda qoladi.
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {tables.map((table) => {
            const order = ordersByTable[table.id];
            const look = tableAppearance(order);
            return (
              <button
                key={table.id}
                onClick={() => setOpenTableId(table.id)}
                className={`rounded-xl border p-3 text-left shadow-sm transition hover:shadow-md sm:p-4 ${look.box}`}
              >
                <div className="mb-2 flex items-start justify-between gap-1.5">
                  <p className="truncate font-semibold text-slate-900">{table.name}</p>
                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${look.badge}`}
                  >
                    {t(tableStatusKey(order))}
                  </span>
                </div>
                {order ? (
                  <>
                    <p className="text-base font-semibold text-slate-900 sm:text-lg">
                      {order.final_amount.toLocaleString()} {t('app.currency')}
                    </p>
                    <p className="mt-1 truncate text-xs text-slate-500">
                      {order.items.map((i) => `${i.product_name} ×${i.quantity}`).join(', ')}
                    </p>
                  </>
                ) : (
                  <p className="text-sm text-slate-400">—</p>
                )}
              </button>
            );
          })}
          {floorId && tables.length === 0 && (
            <p className="col-span-full rounded-xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-400">
              {t('orders.noTables')}
            </p>
          )}
        </div>
      )}

      {openTable && (
        <OrderModal
          title={openTable.name}
          table={openTable}
          order={openTableOrder}
          onClose={() => setOpenTableId(null)}
          onChanged={refreshOrders}
          onReceiptStatus={setReceiptStatus}
        />
      )}

      {openOnlineOrder && (
        <OrderModal
          title={`${ORDER_TYPE_EMOJI[openOnlineOrder.order_type]} ${t(
            `orders.type.${openOnlineOrder.order_type}` as TranslationKey,
          )}`}
          order={openOnlineOrder}
          onClose={() => setOpenOrderId(null)}
          onChanged={refreshOrders}
          onReceiptStatus={setReceiptStatus}
        />
      )}
    </div>
  );
}

/**
 * Chekni chiqarish: avval lokal printer, bo'lmasa Telegram, u ham bo'lmasa
 * kassirga xabar. Bu oqim to'lovdan **mustaqil** — hisob-fakturani ham,
 * to'langan chekni ham shu funksiya chiqaradi.
 */
async function printReceiptFlow(
  order: ActiveOrder,
  preBill: boolean,
  t: (key: TranslationKey) => string,
): Promise<string> {
  try {
    const receipt = await getReceipt(order.id, preBill);
    if (await tryPrintReceipt(receipt)) {
      await markReceiptPrinted(order.id, preBill);
      return t('receipt.printed');
    }
    if (order.telegram_id) {
      await sendReceiptTelegram(order.id);
      return t('pay.receipt.telegram');
    }
    return t('receipt.failed');
  } catch {
    return t('receipt.failed');
  }
}

// Stol oynasi va online buyurtma oynasi bir xil ichki ekranlardan foydalanadi.
// `table` berilmasa (online buyurtma) — taom qo'shish paneli ko'rsatilmaydi,
// chunki yangi buyurtma faqat stol uchun ochiladi.
function OrderModal({
  title,
  table,
  order,
  onClose,
  onChanged,
  onReceiptStatus,
}: {
  title: string;
  table?: Table;
  order: ActiveOrder | undefined;
  onClose: () => void;
  onChanged: () => void;
  onReceiptStatus: (message: string) => void;
}) {
  const { t } = useTranslation();
  const [screen, setScreen] = useState<'main' | 'pay'>('main');

  const subtitleParts: string[] = [];
  if (order) {
    subtitleParts.push(t(`orders.source.${order.source}` as TranslationKey));
    if (order.telegram_username) subtitleParts.push(`@${order.telegram_username}`);
    if (order.customer_phone) subtitleParts.push(order.customer_phone);
    if (order.delivery_address) subtitleParts.push(order.delivery_address);
  }

  return (
    <ModalShell
      title={screen === 'pay' ? t('pay.title') : title}
      subtitle={screen === 'pay' ? title : subtitleParts.join(' · ')}
      size="pos"
      onBack={screen === 'pay' ? () => setScreen('main') : undefined}
      onClose={onClose}
    >
      {screen === 'pay' && order ? (
        <PaymentPanel
          order={order}
          label={title}
          onBack={() => setScreen('main')}
          onPaid={(message) => {
            onReceiptStatus(message);
            onChanged();
            onClose();
          }}
        />
      ) : order && order.status === 'new' ? (
        <PendingApprovalPanel order={order} onChanged={onChanged} onClose={onClose} />
      ) : (
        <ActiveOrderPanel
          table={table}
          order={order}
          onChanged={onChanged}
          onPay={() => setScreen('pay')}
          onReceiptStatus={onReceiptStatus}
        />
      )}
    </ModalShell>
  );
}

// Mijoz QR/Telegram orqali yuborgan, hali kassir tasdiqlamagan buyurtma
function PendingApprovalPanel({
  order,
  onChanged,
  onClose,
}: {
  order: ActiveOrder;
  onChanged: () => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const { can } = useAuth();

  const acceptMutation = useMutation({
    mutationFn: () => activateOrder(order.id),
    onSuccess: onChanged,
  });

  const rejectMutation = useMutation({
    mutationFn: (reason: string) => cancelOrder(order.id, reason),
    onSuccess: () => {
      onChanged();
      onClose();
    },
  });

  function handleReject() {
    const reason = prompt(t('orders.rejectReason'));
    if (reason) rejectMutation.mutate(reason);
  }

  return (
    <>
      <div className="flex-1 overflow-y-auto px-4 py-4 sm:px-5">
        <OnlineCustomerDetails order={order} />
        <OrderItemsList order={order} onChanged={onChanged} />
      </div>
      <div className="flex gap-2 border-t border-slate-200 px-4 py-4 sm:px-5">
        {can('orders.cancel') && (
          <button
            onClick={handleReject}
            disabled={rejectMutation.isPending}
            className="flex-1 rounded-lg border border-red-200 px-4 py-3 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-60"
          >
            {t('orders.reject')}
          </button>
        )}
        <button
          onClick={() => acceptMutation.mutate()}
          disabled={acceptMutation.isPending}
          className="flex-1 rounded-lg bg-emerald-600 px-4 py-3 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-60"
        >
          {acceptMutation.isPending ? t('app.saving') : t('orders.accept')}
        </button>
      </div>
    </>
  );
}

/**
 * Online buyurtmaning mijoz ma'lumotlari.
 *
 * Koordinata manzil matnidan ustun turadi — OSM O'zbekistonda uy raqamini
 * ko'pincha topa olmaydi, shuning uchun kuryerga aniq nuqta havolasi beriladi.
 */
function OnlineCustomerDetails({ order }: { order: ActiveOrder }) {
  const { t } = useTranslation();
  const hasPoint = order.delivery_lat != null && order.delivery_lng != null;

  if (!order.customer_name && !order.customer_phone && !order.delivery_address) return null;

  return (
    <div className="mb-3 space-y-1 rounded-xl bg-slate-50 px-3 py-2.5 text-xs">
      {order.customer_name && (
        <p className="font-medium text-slate-900">👤 {order.customer_name}</p>
      )}
      {order.customer_phone && (
        <p className="text-slate-600">
          📞 <a href={`tel:${order.customer_phone}`}>{order.customer_phone}</a>
        </p>
      )}
      {order.delivery_address && <p className="text-slate-600">📍 {order.delivery_address}</p>}
      {order.delivery_note && <p className="text-slate-500">💬 {order.delivery_note}</p>}
      {order.preferred_payment_method && (
        <p className="text-slate-600">
          💳 {t(`orders.payment.${order.preferred_payment_method}` as TranslationKey) ??
            order.preferred_payment_method}
        </p>
      )}
      {hasPoint && (
        <a
          href={`https://www.openstreetmap.org/?mlat=${order.delivery_lat}&mlon=${order.delivery_lng}#map=18/${order.delivery_lat}/${order.delivery_lng}`}
          target="_blank"
          rel="noreferrer"
          className="inline-block pt-0.5 font-medium text-indigo-600 hover:underline"
        >
          🗺 {t('orders.openOnMap')}
        </a>
      )}
    </div>
  );
}

function ActiveOrderPanel({
  table,
  order,
  onChanged,
  onPay,
  onReceiptStatus,
}: {
  table?: Table;
  order: ActiveOrder | undefined;
  onChanged: () => void;
  onPay: () => void;
  onReceiptStatus: (message: string) => void;
}) {
  const { t } = useTranslation();
  // Ofitsiant ham shu panelni ochadi, lekin pul bilan bog'liq tugmalarni
  // ko'rmasligi kerak. Yashirish faqat qulaylik — backend baribir 403 beradi
  // (routes.go: orders.pay / orders.discount).
  const { can } = useAuth();
  const canPay = can('orders.pay');
  const canDiscount = can('orders.discount');
  const { data: categories = [] } = useQuery({ queryKey: ['categories'], queryFn: listCategories });
  const [selectedCategory, setSelectedCategory] = useState('');
  // Barcha mahsulotlar bir marta olinadi va kategoriya bo'yicha shu yerda filtrlanadi —
  // shunda kassir kategoriyalar orasida yurganda tanlangan taomlar ro'yxatdan yo'qolmaydi.
  const { data: allProducts = [] } = useQuery({ queryKey: ['products'], queryFn: () => listProducts() });
  const products = useMemo(
    () =>
      allProducts.filter(
        (p) => p.is_available && (!selectedCategory || p.category_id === selectedCategory),
      ),
    [allProducts, selectedCategory],
  );

  const [draft, setDraft] = useState<Record<string, number>>({});
  const [error, setError] = useState<string | null>(null);
  const [printing, setPrinting] = useState(false);

  const draftLines = useMemo(
    () =>
      Object.entries(draft)
        .filter(([, qty]) => qty > 0)
        .map(([id, qty]) => ({ product: allProducts.find((p) => p.id === id), quantity: qty }))
        .filter((l): l is { product: NonNullable<typeof l.product>; quantity: number } => !!l.product),
    [draft, allProducts],
  );
  const draftTotal = draftLines.reduce((sum, l) => sum + l.product.price * l.quantity, 0);

  const saveMutation = useMutation({
    mutationFn: () => {
      const items = Object.entries(draft)
        .filter(([, qty]) => qty > 0)
        .map(([product_id, quantity]) => ({ product_id, quantity }));
      if (order) return addOrderItems(order.id, items);
      if (!table) throw new Error('Stol tanlanmagan');
      return createOrder(table.id, items);
    },
    onSuccess: () => {
      setDraft({});
      setError(null);
      onChanged();
    },
    onError: (err: any) => setError(err?.response?.data?.error ?? t('app.error')),
  });

  const kitchenMutation = useMutation({
    mutationFn: (status: KitchenStatus) => updateKitchenStatus(order!.id, status),
    onSuccess: onChanged,
    onError: (err: any) => setError(err?.response?.data?.error ?? t('app.error')),
  });

  const discountMutation = useMutation({
    mutationFn: ({ amount, reason }: { amount: number; reason: string }) =>
      applyDiscount(order!.id, amount, reason),
    onSuccess: onChanged,
    onError: (err: any) => setError(err?.response?.data?.error ?? t('app.error')),
  });

  function changeQuantity(productId: string, delta: number) {
    setDraft((d) => ({ ...d, [productId]: Math.max(0, (d[productId] ?? 0) + delta) }));
  }

  function handleDiscount() {
    if (!order) return;
    const raw = prompt(t('orders.discountAmount'), String(order.discount_amount || 0));
    if (raw === null) return;
    const amount = Number(raw);
    if (Number.isNaN(amount) || amount < 0) return;
    const reason = prompt(t('orders.discountReason')) ?? '';
    discountMutation.mutate({ amount, reason });
  }

  async function handlePrint(preBill: boolean) {
    if (!order) return;
    setPrinting(true);
    onReceiptStatus(await printReceiptFlow(order, preBill, t));
    setPrinting(false);
  }

  return (
    // Telefonda ustun (taomlar tepada, hisob pastda), kompyuterda ikki ustun.
    <div className="flex flex-1 flex-col overflow-hidden lg:flex-row">
      {table && (
        <div className="flex min-h-0 flex-1 flex-col border-b border-slate-200 lg:border-b-0 lg:border-r">
          <div className="shrink-0 px-4 pt-3 sm:px-5">
            <div className="flex flex-wrap gap-1.5 pb-2">
              <button
                onClick={() => setSelectedCategory('')}
                className={`rounded-lg px-3 py-1.5 text-xs font-medium ${
                  selectedCategory === ''
                    ? 'bg-indigo-600 text-white'
                    : 'border border-slate-200 text-slate-600 hover:bg-slate-50'
                }`}
              >
                {t('orders.allCategories')}
              </button>
              {categories.map((c) => (
                <button
                  key={c.id}
                  onClick={() => setSelectedCategory(c.id)}
                  className={`rounded-lg px-3 py-1.5 text-xs font-medium ${
                    selectedCategory === c.id
                      ? 'bg-indigo-600 text-white'
                      : 'border border-slate-200 text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  {c.name}
                </button>
              ))}
            </div>
          </div>

          {/* Faqat shu ro'yxat siljiydi — oyna o'lchami kategoriya
              almashganda o'zgarmaydi (ModalShell size="pos"). */}
          <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4 sm:px-5">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
              {products.map((p) => (
                <ProductPickCard
                  key={p.id}
                  product={p}
                  quantity={draft[p.id] ?? 0}
                  currency={t('app.currency')}
                  onAdd={(id) => changeQuantity(id, 1)}
                  onRemove={(id) => changeQuantity(id, -1)}
                />
              ))}
            </div>
            {products.length === 0 && (
              <p className="py-8 text-center text-sm text-slate-400">{t('menu.noProducts')}</p>
            )}
          </div>
        </div>
      )}

      <div className={`flex min-h-0 w-full flex-col ${table ? 'lg:w-80 xl:w-96' : ''}`}>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-5">
          {/* Mijoz ma'lumoti buyurtma qabul qilingandan **keyin** ham kerak:
              kuryerni aynan shu bosqichda jo'natishadi va kassirga telefon,
              manzil va xarita nuqtasi shu paytda kerak bo'ladi. */}
          {order && <OnlineCustomerDetails order={order} />}
          <OrderItemsList order={order} onChanged={onChanged} />

          {draftLines.length > 0 && (
            <div className="mt-4 border-t border-dashed border-slate-200 pt-3">
              <p className="mb-2 text-xs font-semibold text-indigo-600">{t('orders.selected')}</p>
              {draftLines.map((l) => (
                <div key={l.product.id} className="flex justify-between py-0.5 text-sm">
                  <span className="text-slate-600">
                    {l.product.name} × {l.quantity}
                  </span>
                  <span className="text-slate-900">
                    {(l.product.price * l.quantity).toLocaleString()}
                  </span>
                </div>
              ))}
              <div className="mt-2 flex justify-between text-sm font-semibold">
                <span>{t('orders.newItemsTotal')}</span>
                <span>
                  {draftTotal.toLocaleString()} {t('app.currency')}
                </span>
              </div>
            </div>
          )}
        </div>

        {error && <p className="px-4 pb-2 text-sm text-red-600 sm:px-5">{error}</p>}

        <div className="shrink-0 space-y-2 border-t border-slate-200 px-4 py-3 sm:px-5 sm:py-4">
          {draftLines.length > 0 && (
            <button
              onClick={() => saveMutation.mutate()}
              disabled={saveMutation.isPending}
              className="w-full rounded-lg bg-indigo-600 px-4 py-3 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-60"
            >
              {saveMutation.isPending ? t('app.saving') : t('orders.saveItems')}
            </button>
          )}

          {order && (
            <>
              <div className="flex flex-wrap gap-2">
                {/* Yetkazib berish buyurtmasida bosqichlar ko'proq: mijoz
                    o'z sahifasida "kuryerga berildi" va "yetkazildi" ni ham
                    kutadi. Stolga/olib ketishda esa ikkitasi kifoya. */}
                {kitchenStagesFor(order).map((stage) => (
                  <button
                    key={stage}
                    onClick={() => kitchenMutation.mutate(stage)}
                    disabled={kitchenMutation.isPending || order.kitchen_status === stage}
                    className={`flex-1 rounded-lg px-3 py-2.5 text-xs font-medium disabled:opacity-100 ${
                      order.kitchen_status === stage
                        ? 'bg-slate-800 text-white'
                        : 'border border-slate-300 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    {t(`orders.kitchen.${stage}` as TranslationKey) ?? stage}
                  </button>
                ))}
              </div>
              <div className="flex gap-2">
                {canDiscount && (
                  <button
                    onClick={handleDiscount}
                    disabled={discountMutation.isPending}
                    className="rounded-lg border border-slate-200 px-3 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-60"
                  >
                    {t('orders.discount')}
                  </button>
                )}
              </div>

              {/* Chek to'lovdan mustaqil chiqariladi: hisob-faktura mijozga
                  to'lovdan oldin beriladi (restoranda odatiy amaliyot).
                  Chek endpointi ham orders.pay vakolatini talab qiladi. */}
              {canPay && (
                <>
                  <button
                    onClick={() => handlePrint(true)}
                    disabled={printing}
                    title={t('receipt.preBillHint')}
                    className="w-full rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-60"
                  >
                    🧾 {printing ? t('receipt.printing') : t('receipt.preBill')}
                  </button>

                  <button
                    onClick={onPay}
                    className="w-full rounded-lg bg-emerald-600 px-4 py-3 text-sm font-medium text-white hover:bg-emerald-700"
                  >
                    {t('orders.pay')} · {order.final_amount.toLocaleString()} {t('app.currency')}
                  </button>
                </>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// Joriy hisob — kassir har bir qatorni tahrirlashi yoki o'chirishi mumkin.
// Mijoz tomonidan tahrirlash yo'q: shunda ikki tomondan bir vaqtda o'zgartirish nizosi bo'lmaydi.
function OrderItemsList({
  order,
  onChanged,
}: {
  order: ActiveOrder | undefined;
  onChanged: () => void;
}) {
  const { t } = useTranslation();

  const updateMutation = useMutation({
    mutationFn: ({ itemId, quantity }: { itemId: string; quantity: number }) =>
      updateOrderItem(order!.id, itemId, quantity),
    onSuccess: onChanged,
  });

  const deleteMutation = useMutation({
    mutationFn: (itemId: string) => deleteOrderItem(order!.id, itemId),
    onSuccess: onChanged,
  });

  if (!order) {
    return <p className="text-sm text-slate-400">{t('orders.noCurrentOrder')}</p>;
  }

  const isLastItem = order.items.length === 1;
  const busy = updateMutation.isPending || deleteMutation.isPending;

  function handleDelete(itemId: string) {
    const message = isLastItem
      ? `${t('orders.confirmRemoveItem')}\n\n${t('orders.lastItemWarning')}`
      : t('orders.confirmRemoveItem');
    if (confirm(message)) deleteMutation.mutate(itemId);
  }

  return (
    <div>
      <p className="mb-2 text-xs font-semibold text-slate-500">{t('orders.currentOrder')}</p>
      <div className="space-y-1">
        {order.items.map((item) => (
          <div key={item.id} className="flex items-center justify-between gap-2 text-sm">
            <span className="min-w-0 flex-1 truncate text-slate-600">{item.product_name}</span>
            <div className="flex shrink-0 items-center gap-1">
              <button
                onClick={() =>
                  item.quantity > 1
                    ? updateMutation.mutate({ itemId: item.id, quantity: item.quantity - 1 })
                    : handleDelete(item.id)
                }
                disabled={busy}
                className="h-7 w-7 rounded-full border border-slate-200 text-xs text-slate-600 hover:bg-slate-50 disabled:opacity-50"
              >
                −
              </button>
              <span className="w-5 text-center text-xs font-medium">{item.quantity}</span>
              <button
                onClick={() => updateMutation.mutate({ itemId: item.id, quantity: item.quantity + 1 })}
                disabled={busy}
                className="h-7 w-7 rounded-full border border-slate-200 text-xs text-slate-600 hover:bg-slate-50 disabled:opacity-50"
              >
                +
              </button>
              <span className="w-20 text-right text-slate-900">
                {(item.unit_price * item.quantity).toLocaleString()}
              </span>
              <button
                onClick={() => handleDelete(item.id)}
                disabled={busy}
                title={t('orders.removeItem')}
                className="rounded px-1 text-slate-300 hover:text-red-600 disabled:opacity-50"
              >
                ✕
              </button>
            </div>
          </div>
        ))}
      </div>

      {order.discount_amount > 0 && (
        <div className="mt-2 flex justify-between text-sm text-amber-700">
          <span>{t('orders.discount')}</span>
          <span>−{order.discount_amount.toLocaleString()}</span>
        </div>
      )}

      <div className="mt-2 flex justify-between border-t border-slate-200 pt-2 text-sm font-semibold">
        <span>{t('orders.orderTotal')}</span>
        <span>
          {order.final_amount.toLocaleString()} {t('app.currency')}
        </span>
      </div>
    </div>
  );
}

// To'lov: usul tanlash → yakuniy tasdiq. Xato bilan noto'g'ri hisobni to'langan deb
// belgilashning oldini olish uchun ikki bosqichda tasdiqlanadi.
function PaymentPanel({
  order,
  label,
  onBack,
  onPaid,
}: {
  order: ActiveOrder;
  label: string;
  onBack: () => void;
  onPaid: (receiptMessage: string) => void;
}) {
  const { t } = useTranslation();
  const [step, setStep] = useState<1 | 2>(1);
  const [method, setMethod] = useState<PaymentMethod>('cash');
  const [cardType, setCardType] = useState<CardType>('uzcard');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirm() {
    setSubmitting(true);
    setError(null);
    try {
      await payOrder(order.id, [
        {
          method,
          card_type: method === 'card' ? cardType : undefined,
          amount: order.final_amount,
        },
      ]);

      // To'lov saqlandi. Chek bosqichidagi xatolar to'lovni bekor qilmaydi,
      // faqat kassirga xabar qilinadi.
      onPaid(`${label}: ${await printReceiptFlow(order, false, t)}`);
    } catch (err: any) {
      setError(err?.response?.data?.error ?? t('pay.failed'));
      setSubmitting(false);
    }
  }

  return (
    <div className="overflow-y-auto px-4 py-5 sm:px-5">
      {step === 1 ? (
        <>
          <p className="mb-4 text-sm text-slate-600">
            <span className="font-medium">{label}</span> —{' '}
            <span className="font-semibold text-slate-900">
              {order.final_amount.toLocaleString()} {t('app.currency')}
            </span>{' '}
            {t('pay.amountNote')}
          </p>

          <p className="mb-2 text-xs font-medium text-slate-600">{t('pay.method')}</p>
          <div className="mb-4 flex gap-2">
            {(['cash', 'card', 'transfer'] as PaymentMethod[]).map((m) => (
              <button
                key={m}
                onClick={() => setMethod(m)}
                className={`flex-1 rounded-lg px-3 py-3 text-sm font-medium ${
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
            <>
              <p className="mb-2 text-xs font-medium text-slate-600">{t('pay.cardType')}</p>
              <div className="mb-4 flex flex-wrap gap-2">
                {CARD_TYPES.map((ct) => (
                  <button
                    key={ct}
                    onClick={() => setCardType(ct)}
                    className={`rounded-lg px-3 py-2 text-sm capitalize ${
                      cardType === ct
                        ? 'bg-slate-800 text-white'
                        : 'border border-slate-200 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    {ct}
                  </button>
                ))}
              </div>
            </>
          )}

          <div className="flex justify-end gap-2">
            <button
              onClick={onBack}
              className="rounded-lg border border-slate-200 px-4 py-2.5 text-sm text-slate-600 hover:bg-slate-50"
            >
              {t('app.cancel')}
            </button>
            <button
              onClick={() => setStep(2)}
              className="rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-indigo-700"
            >
              {t('app.continue')}
            </button>
          </div>
        </>
      ) : (
        <>
          <h3 className="mb-2 text-lg font-semibold text-red-600">{t('pay.confirmTitle')}</h3>
          <p className="mb-4 text-sm text-slate-600">
            <span className="font-medium">{label}</span> —{' '}
            <span className="font-semibold">
              {order.final_amount.toLocaleString()} {t('app.currency')}
            </span>{' '}
            ({t(`pay.method.${method}` as TranslationKey)}
            {method === 'card' ? ` · ${cardType}` : ''}). {t('pay.confirmWarning')}
          </p>
          {error && <p className="mb-3 text-sm text-red-600">{error}</p>}
          <div className="flex justify-end gap-2">
            <button
              onClick={() => setStep(1)}
              disabled={submitting}
              className="rounded-lg border border-slate-200 px-4 py-2.5 text-sm text-slate-600 hover:bg-slate-50 disabled:opacity-60"
            >
              {t('app.back')}
            </button>
            <button
              onClick={confirm}
              disabled={submitting}
              className="rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-60"
            >
              {submitting ? t('app.saving') : t('pay.confirmYes')}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
