import { useEffect, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import QRCode from 'qrcode';
import { createFloor, createTable, getTableQR, listFloors, listTables } from '../api/endpoints';

const STATUS_LABEL: Record<string, string> = {
  empty: "Bo'sh",
  occupied: 'Band',
  pending_payment: "To'lov kutilmoqda",
};

const STATUS_COLOR: Record<string, string> = {
  empty: 'bg-emerald-100 text-emerald-700',
  occupied: 'bg-amber-100 text-amber-700',
  pending_payment: 'bg-red-100 text-red-700',
};

export default function TablesPage() {
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
      <h1 className="mb-6 text-xl font-semibold text-slate-900">Qavat va stollar</h1>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        {floors.map((f) => (
          <button
            key={f.id}
            onClick={() => setActiveFloor(f.id)}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
              f.id === floorId
                ? 'bg-indigo-600 text-white'
                : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
            }`}
          >
            {f.name}
          </button>
        ))}
        <form onSubmit={handleAddFloor} className="flex gap-1">
          <input
            value={newFloor}
            onChange={(e) => setNewFloor(e.target.value)}
            placeholder="Yangi qavat"
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
            placeholder="Yangi stol nomi (masalan: Stol 5)"
            className="w-64 rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
          <button className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700">
            Stol qo'shish
          </button>
        </form>
      )}

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
        {tables.map((t) => (
          <div
            key={t.id}
            className="rounded-xl border border-slate-200 bg-white p-4 text-center shadow-sm"
          >
            <p className="mb-2 font-medium text-slate-900">{t.name}</p>
            <span
              className={`mb-3 inline-block rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLOR[t.status]}`}
            >
              {STATUS_LABEL[t.status] ?? t.status}
            </span>
            <button
              onClick={() => handleShowQR(t.id, t.name)}
              className="block w-full rounded-lg border border-slate-200 px-2 py-1 text-xs text-slate-600 hover:bg-slate-50"
            >
              QR havola
            </button>
          </div>
        ))}
        {floorId && tables.length === 0 && (
          <p className="col-span-full rounded-xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-400">
            Bu qavatda stol yo'q
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
                  alt={`${qrInfo.tableName} QR kodi`}
                  className="h-56 w-56 rounded-lg border border-slate-200"
                />
              ) : (
                <div className="flex h-56 w-56 items-center justify-center rounded-lg border border-dashed border-slate-300 text-sm text-slate-400">
                  Yuklanmoqda...
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
                Rasmni yuklab olish
              </a>
            )}
            <button
              onClick={() => setQrInfo(null)}
              className="mt-2 rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50"
            >
              Yopish
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
