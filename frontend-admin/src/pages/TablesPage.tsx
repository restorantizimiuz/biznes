import { useEffect, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import QRCode from 'qrcode';
import {
  createFloor,
  createTable,
  deleteFloor,
  deleteTable,
  getTableQR,
  listFloors,
  listTables,
  updateFloor,
  updateTable,
} from '../api/endpoints';
import { useTranslation } from '../i18n/LanguageContext';
import type { TranslationKey } from '../i18n/dictionaries';

const STATUS_COLOR: Record<string, string> = {
  empty: 'bg-emerald-100 text-emerald-700',
  occupied: 'bg-amber-100 text-amber-700',
  pending_payment: 'bg-red-100 text-red-700',
};

export default function TablesPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { data: floors = [] } = useQuery({ queryKey: ['floors'], queryFn: listFloors });
  const [activeFloor, setActiveFloor] = useState<string>('');
  const floorId = activeFloor || floors[0]?.id || '';

  const { data: tables = [] } = useQuery({
    queryKey: ['tables', floorId],
    queryFn: () => listTables(floorId),
    enabled: !!floorId,
  });

  const [newFloor, setNewFloor] = useState('');
  const floorMutation = useMutation({
    mutationFn: () => createFloor(newFloor),
    onSuccess: () => {
      setNewFloor('');
      queryClient.invalidateQueries({ queryKey: ['floors'] });
    },
  });

  const [newTable, setNewTable] = useState('');
  const tableMutation = useMutation({
    mutationFn: () => createTable(floorId, newTable),
    onSuccess: () => {
      setNewTable('');
      queryClient.invalidateQueries({ queryKey: ['tables', floorId] });
    },
  });

  const [actionError, setActionError] = useState<string | null>(null);
  const onActionError = (err: any) =>
    setActionError(err?.response?.data?.error ?? t('app.error'));

  const renameFloorMutation = useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) => updateFloor(id, name),
    onSuccess: () => {
      setActionError(null);
      queryClient.invalidateQueries({ queryKey: ['floors'] });
    },
    onError: onActionError,
  });

  const deleteFloorMutation = useMutation({
    mutationFn: (id: string) => deleteFloor(id),
    onSuccess: () => {
      setActionError(null);
      setActiveFloor('');
      queryClient.invalidateQueries({ queryKey: ['floors'] });
    },
    onError: onActionError,
  });

  const renameTableMutation = useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) => updateTable(id, name),
    onSuccess: () => {
      setActionError(null);
      queryClient.invalidateQueries({ queryKey: ['tables', floorId] });
    },
    onError: onActionError,
  });

  const deleteTableMutation = useMutation({
    mutationFn: (id: string) => deleteTable(id),
    onSuccess: () => {
      setActionError(null);
      queryClient.invalidateQueries({ queryKey: ['tables', floorId] });
    },
    onError: onActionError,
  });

  const [qrInfo, setQrInfo] = useState<{ tableName: string; url: string } | null>(null);
  const [qrImage, setQrImage] = useState<string | null>(null);

  async function handleShowQR(tableId: string, tableName: string) {
    const { url } = await getTableQR(tableId);
    setQrInfo({ tableName, url });
  }

  useEffect(() => {
    if (!qrInfo) {
      setQrImage(null);
      return;
    }
    let cancelled = false;
    QRCode.toDataURL(qrInfo.url, { width: 260, margin: 1 }).then((dataUrl) => {
      if (!cancelled) setQrImage(dataUrl);
    });
    return () => {
      cancelled = true;
    };
  }, [qrInfo]);

  function handleAddFloor(e: FormEvent) {
    e.preventDefault();
    if (newFloor.trim()) floorMutation.mutate();
  }

  function handleAddTable(e: FormEvent) {
    e.preventDefault();
    if (newTable.trim() && floorId) tableMutation.mutate();
  }

  return (
    <div>
      <h1 className="mb-6 text-xl font-semibold text-slate-900">{t('tables.title')}</h1>

      {actionError && (
        <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{actionError}</p>
      )}

      <div className="mb-4 flex flex-wrap items-center gap-2">
        {floors.map((f) => (
          <div
            key={f.id}
            className={`flex items-center rounded-lg ${
              f.id === floorId ? 'bg-indigo-600' : 'border border-slate-200 bg-white'
            }`}
          >
            <button
              onClick={() => setActiveFloor(f.id)}
              className={`px-3 py-1.5 text-sm font-medium ${
                f.id === floorId ? 'text-white' : 'text-slate-600'
              }`}
            >
              {f.name}
            </button>
            <button
              onClick={() => {
                const name = prompt(t('tables.renameFloor'), f.name);
                if (name?.trim() && name !== f.name) {
                  renameFloorMutation.mutate({ id: f.id, name: name.trim() });
                }
              }}
              title={t('app.edit')}
              className={`px-1.5 py-1.5 text-xs ${
                f.id === floorId ? 'text-indigo-100 hover:text-white' : 'text-slate-400 hover:text-slate-700'
              }`}
            >
              ✎
            </button>
            <button
              onClick={() => {
                if (confirm(t('tables.deleteFloorConfirm'))) deleteFloorMutation.mutate(f.id);
              }}
              title={t('app.delete')}
              className={`px-1.5 py-1.5 pr-2 text-xs ${
                f.id === floorId ? 'text-indigo-100 hover:text-white' : 'text-slate-400 hover:text-red-600'
              }`}
            >
              🗑
            </button>
          </div>
        ))}
        <form onSubmit={handleAddFloor} className="flex gap-1">
          <input
            value={newFloor}
            onChange={(e) => setNewFloor(e.target.value)}
            placeholder={t('tables.newFloor')}
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
          />
          <button className="rounded-lg bg-slate-800 px-3 py-1.5 text-sm text-white hover:bg-slate-900">
            +
          </button>
        </form>
      </div>

      {floorId && (
        <form onSubmit={handleAddTable} className="mb-4 flex gap-2">
          <input
            value={newTable}
            onChange={(e) => setNewTable(e.target.value)}
            placeholder={t('tables.newTable')}
            className="w-64 rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
          <button className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700">
            {t('tables.addTable')}
          </button>
        </form>
      )}

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
        {tables.map((table) => (
          <div
            key={table.id}
            className="rounded-xl border border-slate-200 bg-white p-4 text-center shadow-sm"
          >
            <p className="mb-2 font-medium text-slate-900">{table.name}</p>
            <span
              className={`mb-3 inline-block rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLOR[table.status]}`}
            >
              {t(`tables.status.${table.status}` as TranslationKey)}
            </span>
            <button
              onClick={() => handleShowQR(table.id, table.name)}
              className="block w-full rounded-lg border border-slate-200 px-2 py-1 text-xs text-slate-600 hover:bg-slate-50"
            >
              {t('tables.qrLink')}
            </button>
            <div className="mt-1.5 flex gap-1">
              <button
                onClick={() => {
                  const name = prompt(t('tables.renameTable'), table.name);
                  if (name?.trim() && name !== table.name) {
                    renameTableMutation.mutate({ id: table.id, name: name.trim() });
                  }
                }}
                className="flex-1 rounded-lg border border-slate-200 px-2 py-1 text-xs text-slate-500 hover:bg-slate-50"
              >
                {t('app.edit')}
              </button>
              <button
                onClick={() => {
                  if (confirm(t('tables.deleteTableConfirm'))) deleteTableMutation.mutate(table.id);
                }}
                className="flex-1 rounded-lg border border-red-200 px-2 py-1 text-xs text-red-600 hover:bg-red-50"
              >
                {t('app.delete')}
              </button>
            </div>
          </div>
        ))}
        {floorId && tables.length === 0 && (
          <p className="col-span-full rounded-xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-400">
            {t('tables.noTables')}
          </p>
        )}
      </div>

      {qrInfo && (
        <div
          className="fixed inset-0 z-10 flex items-center justify-center bg-black/30 p-4"
          onClick={() => setQrInfo(null)}
        >
          <div
            className="w-full max-w-sm rounded-xl bg-white p-6 text-center shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="mb-3 text-lg font-semibold text-slate-900">{qrInfo.tableName}</h2>
            <div className="mb-3 flex justify-center">
              {qrImage ? (
                <img
                  src={qrImage}
                  alt={`${qrInfo.tableName} QR`}
                  className="h-56 w-56 rounded-lg border border-slate-200"
                />
              ) : (
                <div className="flex h-56 w-56 items-center justify-center rounded-lg border border-dashed border-slate-300 text-sm text-slate-400">
                  {t('app.loading')}
                </div>
              )}
            </div>
            <p className="mb-4 break-all text-xs text-slate-400">{qrInfo.url}</p>
            {qrImage && (
              <a
                href={qrImage}
                download={`${qrInfo.tableName}-qr.png`}
                className="mb-2 inline-block w-full rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
              >
                {t('tables.downloadQr')}
              </a>
            )}
            <button
              onClick={() => setQrInfo(null)}
              className="mt-2 rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50"
            >
              {t('app.close')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
