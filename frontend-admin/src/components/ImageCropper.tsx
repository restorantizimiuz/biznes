import { useCallback, useState } from 'react';
import Cropper, { type Area } from 'react-easy-crop';
import ModalShell from './ModalShell';
import { useTranslation } from '../i18n/LanguageContext';

// Menyu kartochkalari kvadrat, shuning uchun rasm ham 1:1 kesiladi.
// Katta rasmlarni saqlashning ma'nosi yo'q — 800×800 menyu uchun yetarli.
const OUTPUT_SIZE = 800;
const JPEG_QUALITY = 0.85;

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.addEventListener('load', () => resolve(img));
    img.addEventListener('error', () => reject(new Error('Rasmni yuklab bo\'lmadi')));
    img.src = src;
  });
}

// Tanlangan kvadrat sohani <canvas> ga chizib, JPEG blob qaytaradi.
async function cropToBlob(imageSrc: string, area: Area): Promise<Blob> {
  const image = await loadImage(imageSrc);
  const canvas = document.createElement('canvas');
  canvas.width = OUTPUT_SIZE;
  canvas.height = OUTPUT_SIZE;

  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas mavjud emas');

  // JPEG shaffoflikni qo'llamaydi — PNG'dan kelgan shaffof joylar qora
  // bo'lib qolmasligi uchun fonni oq bilan to'ldiramiz.
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, OUTPUT_SIZE, OUTPUT_SIZE);
  ctx.drawImage(
    image,
    area.x,
    area.y,
    area.width,
    area.height,
    0,
    0,
    OUTPUT_SIZE,
    OUTPUT_SIZE,
  );

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Rasmni tayyorlab bo\'lmadi'))),
      'image/jpeg',
      JPEG_QUALITY,
    );
  });
}

export default function ImageCropper({
  imageSrc,
  onCancel,
  onCropped,
}: {
  imageSrc: string;
  onCancel: () => void;
  onCropped: (blob: Blob) => void;
}) {
  const { t } = useTranslation();
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [area, setArea] = useState<Area | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onCropComplete = useCallback((_: Area, pixels: Area) => setArea(pixels), []);

  async function apply() {
    if (!area) return;
    setBusy(true);
    setError(null);
    try {
      onCropped(await cropToBlob(imageSrc, area));
    } catch {
      setError(t('menu.uploadFailed'));
      setBusy(false);
    }
  }

  return (
    <ModalShell
      title={t('menu.cropTitle')}
      subtitle={t('menu.cropHint')}
      onBack={onCancel}
      onClose={onCancel}
      footer={
        <div className="flex items-center gap-3">
          <label className="flex flex-1 items-center gap-2 text-xs text-slate-500">
            {t('menu.zoom')}
            <input
              type="range"
              min={1}
              max={3}
              step={0.01}
              value={zoom}
              onChange={(e) => setZoom(Number(e.target.value))}
              className="flex-1"
            />
          </label>
          <button
            onClick={apply}
            disabled={busy || !area}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-60"
          >
            {busy ? t('menu.uploading') : t('menu.cropApply')}
          </button>
        </div>
      }
    >
      <div className="relative h-[360px] w-full bg-slate-900">
        <Cropper
          image={imageSrc}
          crop={crop}
          zoom={zoom}
          aspect={1}
          onCropChange={setCrop}
          onZoomChange={setZoom}
          onCropComplete={onCropComplete}
        />
      </div>
      {error && <p className="px-5 py-2 text-sm text-red-600">{error}</p>}
    </ModalShell>
  );
}
