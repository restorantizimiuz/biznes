import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  getSettings,
  getTestReceipt,
  updateSettings,
  updateSubscription,
} from '../api/endpoints';
import type { SubscriptionPlan } from '../api/types';
import { tryPrintReceipt } from '../printer';
import { useTranslation } from '../i18n/LanguageContext';
import type { TranslationKey } from '../i18n/dictionaries';

const PLANS: SubscriptionPlan[] = ['basic', 'qr', 'full'];

export default function SettingsPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { data: settings } = useQuery({ queryKey: ['settings'], queryFn: getSettings });

  const [name, setName] = useState('');
  const [language, setLanguage] = useState('');
  const [printerMode, setPrinterMode] = useState('');
  const [printerAddress, setPrinterAddress] = useState('');
  const [paperWidth, setPaperWidth] = useState(32);
  const [notifySound, setNotifySound] = useState(true);
  const [message, setMessage] = useState<string | null>(null);

  // Serverdan kelgan qiymatlar bir marta formaga ko'chiriladi. Keyingi
  // yangilanishlarda foydalanuvchi kiritayotgan matn ustidan yozilmasligi
  // uchun bog'liqlik faqat settings ob'ektining kelishiga qo'yilgan.
  useEffect(() => {
    if (!settings) return;
    setName(settings.name);
    setLanguage(settings.language);
    setPrinterMode(settings.printer_mode);
    setPrinterAddress(settings.printer_address);
    setPaperWidth(settings.printer_paper_width);
    setNotifySound(settings.notify_sound);
  }, [settings]);

  const saveMutation = useMutation({
    mutationFn: () =>
      updateSettings({
        name: name.trim(),
        language,
        printer_mode: printerMode,
        printer_address: printerAddress.trim(),
        printer_paper_width: paperWidth,
        notify_sound: notifySound,
      }),
    // ['settings'] so'rovi LanguageProvider va bildirishnoma moduli tomonidan
    // ham ishlatiladi — saqlangan zahoti butun interfeys yangilanadi.
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings'] });
      setMessage(t('app.saved'));
    },
  });

  const planMutation = useMutation({
    mutationFn: (plan: SubscriptionPlan) => updateSubscription(plan),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings'] });
      setMessage(t('settings.planChanged'));
    },
  });

  const testPrintMutation = useMutation({
    mutationFn: async () => {
      const receipt = await getTestReceipt();
      return tryPrintReceipt(receipt);
    },
    onSuccess: (printed) => setMessage(printed ? t('receipt.printed') : t('receipt.failed')),
    onError: () => setMessage(t('receipt.failed')),
  });

  if (!settings) return <p className="text-sm text-slate-500">{t('app.loading')}</p>;

  return (
    <div className="max-w-2xl space-y-5">
      <h1 className="text-lg font-semibold text-slate-900 sm:text-xl">{t('settings.title')}</h1>

      {message && (
        <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{message}</p>
      )}

      {/* --- Kafe --- */}
      <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-slate-600">
            {t('settings.cafeName')}
          </span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
          <span className="mt-1 block text-xs text-slate-400">{t('settings.cafeNameHint')}</span>
        </label>

        <label className="block">
          <span className="mb-1 block text-xs font-medium text-slate-600">
            {t('settings.language')}
          </span>
          <select
            value={language}
            onChange={(e) => setLanguage(e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          >
            <option value="uz">O'zbek</option>
            <option value="ru">Русский</option>
            <option value="en">English</option>
          </select>
          <span className="mt-1 block text-xs text-slate-400">{t('settings.languageNote')}</span>
        </label>
      </section>

      {/* --- Chek printeri --- */}
      <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-800">{t('settings.printer')}</h2>

        <label className="block">
          <span className="mb-1 block text-xs font-medium text-slate-600">
            {t('settings.printerMode')}
          </span>
          <select
            value={printerMode}
            onChange={(e) => setPrinterMode(e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          >
            <option value="">{t('settings.printerOff')}</option>
            <option value="network">{t('settings.printerNetwork')}</option>
            <option value="file">{t('settings.printerFile')}</option>
          </select>
        </label>

        {printerMode !== '' && (
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-slate-600">
              {t('settings.printerAddress')}
            </span>
            <input
              value={printerAddress}
              onChange={(e) => setPrinterAddress(e.target.value)}
              placeholder={
                printerMode === 'network'
                  ? t('settings.printerAddressHintNetwork')
                  : t('settings.printerAddressHintFile')
              }
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </label>
        )}

        <label className="block">
          <span className="mb-1 block text-xs font-medium text-slate-600">
            {t('settings.paperWidth')}
          </span>
          <select
            value={paperWidth}
            onChange={(e) => setPaperWidth(Number(e.target.value))}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          >
            <option value={32}>{t('settings.paperWidth58')}</option>
            <option value={48}>{t('settings.paperWidth80')}</option>
          </select>
        </label>

        <button
          onClick={() => testPrintMutation.mutate()}
          disabled={testPrintMutation.isPending}
          className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-60"
        >
          🧾 {testPrintMutation.isPending ? t('receipt.printing') : t('settings.testPrint')}
        </button>
      </section>

      {/* --- Bildirishnomalar --- */}
      <section className="space-y-2 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-800">{t('settings.notifications')}</h2>
        <label className="flex items-center gap-3 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={notifySound}
            onChange={(e) => setNotifySound(e.target.checked)}
            className="h-4 w-4"
          />
          {t('settings.notifySound')}
        </label>
        <p className="text-xs text-slate-400">{t('settings.notifySoundHint')}</p>
      </section>

      <button
        onClick={() => saveMutation.mutate()}
        disabled={saveMutation.isPending}
        className="rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-60"
      >
        {saveMutation.isPending ? t('app.saving') : t('app.save')}
      </button>

      {/* --- Obuna --- */}
      <section className="space-y-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-800">{t('settings.subscription')}</h2>
        <p className="text-xs text-slate-500">
          {t('settings.currentPlan')}:{' '}
          <span className="font-medium text-slate-800">
            {t(`settings.plan.${settings.subscription_plan}` as TranslationKey)}
          </span>{' '}
          ({settings.subscription_status})
        </p>

        <div className="grid gap-2 sm:grid-cols-3">
          {PLANS.map((plan) => {
            const isCurrent = settings.subscription_plan === plan;
            return (
              <div
                key={plan}
                className={`rounded-lg border p-3 ${
                  isCurrent ? 'border-indigo-400 bg-indigo-50/60' : 'border-slate-200'
                }`}
              >
                <p className="text-sm font-semibold text-slate-900">
                  {t(`settings.plan.${plan}` as TranslationKey)}
                </p>
                <p className="mt-0.5 text-xs text-slate-500">
                  {t(`settings.plan.${plan}Desc` as TranslationKey)}
                </p>
                <button
                  onClick={() => planMutation.mutate(plan)}
                  disabled={isCurrent || planMutation.isPending}
                  className="mt-2 w-full rounded-lg border border-indigo-200 px-3 py-1.5 text-xs font-medium text-indigo-700 hover:bg-indigo-50 disabled:opacity-50"
                >
                  {isCurrent ? t('settings.currentPlan') : t('settings.choosePlan')}
                </button>
              </div>
            );
          })}
        </div>

        {/* TODO: Payme/Click integratsiyasi — tarif tanlanganda to'lov shu
            yerdan boshlanadi. Hozircha to'lov so'ralmaydi. */}
        <p className="text-xs text-amber-700">💳 {t('settings.paymentRequired')}</p>
      </section>
    </div>
  );
}
