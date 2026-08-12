import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import {
  DEFAULT_CENTER,
  DEFAULT_ZOOM,
  MAX_ZOOM,
  PICKED_ZOOM,
  TILE_ATTRIBUTION,
  TILE_URL,
} from './provider';

/**
 * Manzil tanlash xaritasi.
 *
 * DIZAYN QARORI — nishon xarita **markazida qotib turadi**, uni sudrab
 * yurmaydi. Telefonda kichik nishonni barmoq bilan aniq ushlash qiyin;
 * xaritaning o'zini surish esa ancha oson va aniqroq. Shu sababli mijoz
 * xaritani suradi, nishon esa doim markazda qoladi.
 *
 * Leaflet React'dan tashqarida ishlaydi (o'z DOM'ini boshqaradi), shuning
 * uchun u ref orqali bir marta yaratiladi va React qayta chizishlariga
 * aralashmaydi.
 */
export default function MapPicker({
  value,
  onChange,
}: {
  value: { lat: number; lng: number } | null;
  onChange: (point: { lat: number; lng: number }) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  // onChange har renderda yangi funksiya bo'lishi mumkin, lekin Leaflet
  // hodisasi bir marta ulanadi — shuning uchun oxirgi nusxasi ref'da saqlanadi.
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = L.map(containerRef.current, {
      center: value ? [value.lat, value.lng] : DEFAULT_CENTER,
      zoom: value ? PICKED_ZOOM : DEFAULT_ZOOM,
      zoomControl: false,
      attributionControl: true,
    });
    L.tileLayer(TILE_URL, { maxZoom: MAX_ZOOM, attribution: TILE_ATTRIBUTION }).addTo(map);
    L.control.zoom({ position: 'bottomright' }).addTo(map);

    // Surish tugagach markaz koordinatasi beriladi. 'moveend' 'move' dan
    // afzal: har piksel siljishida so'rov yuborilmaydi.
    map.on('moveend', () => {
      const center = map.getCenter();
      onChangeRef.current({ lat: center.lat, lng: center.lng });
    });

    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
    };
    // Faqat bir marta yaratiladi — value keyingi effektda kuzatiladi.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Tashqaridan nuqta o'zgarsa (masalan "Mening joylashuvim" bosilganda)
  // xarita o'sha joyga suriladi.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !value) return;
    const center = map.getCenter();
    // Juda kichik farqda surmaymiz — aks holda moveend → onChange → setState
    // → bu effekt → yana surish degan cheksiz aylanma hosil bo'lardi.
    if (Math.abs(center.lat - value.lat) < 1e-6 && Math.abs(center.lng - value.lng) < 1e-6) return;
    map.setView([value.lat, value.lng], Math.max(map.getZoom(), PICKED_ZOOM));
  }, [value]);

  return (
    <div className="relative h-56 w-full overflow-hidden rounded-[var(--radius-md)]">
      <div ref={containerRef} className="h-full w-full" />
      {/* Markazdagi nishon — xarita ustida, hodisalarni to'smaydi */}
      <div className="pointer-events-none absolute inset-0 z-[400] flex items-center justify-center">
        <div className="-translate-y-3 text-3xl drop-shadow-md">📍</div>
      </div>
    </div>
  );
}
