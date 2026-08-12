/**
 * XARITA PROVAYDERI — bitta almashtiriladigan qatlam.
 *
 * Hozir OpenStreetMap ishlatiladi, chunki u **API kalit talab qilmaydi**:
 * Yandex ham, Google ham ro'yxatdan o'tish va (Google'da) to'lov kartasi
 * biriktirilgan billing akkaunt talab qiladi.
 *
 * CHEKLOVI: O'zbekistonda OSM manzil bazasi to'liq emas — ko'p joyda ko'cha
 * nomi chiqadi, uy raqami chiqmaydi. Shuning uchun interfeys manzilni faqat
 * **taklif** sifatida ko'rsatadi, mijoz uni doim qo'lda tahrirlay oladi va
 * "mo'ljal" maydonini to'ldiradi. Kuryerga esa aniq koordinata boradi.
 *
 * YANDEX'GA O'TISH: kalit olganingizdan keyin faqat shu fayl o'zgaradi —
 * TILE_URL va TILE_ATTRIBUTION almashtiriladi, reverseGeocode esa api.ts da
 * backend proksisiga qarab turadi (u yerda Nominatim manzili NOMINATIM_URL
 * muhit o'zgaruvchisi bilan sozlanadi). Qolgan kod tegilmaydi.
 */

export const TILE_URL = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';

// OSM litsenziyasi manba ko'rsatishni talab qiladi — xarita ustida chiqadi.
export const TILE_ATTRIBUTION = '© OpenStreetMap';

export const MAX_ZOOM = 19;

/** Nuqta belgilanmaganda xarita ochiladigan joy — Toshkent markazi. */
export const DEFAULT_CENTER: [number, number] = [41.2995, 69.2401];
export const DEFAULT_ZOOM = 13;

/** Mijoz joylashuvi aniqlangandan keyingi yaqinlashtirish darajasi. */
export const PICKED_ZOOM = 17;

/** Kassir/kuryer uchun tashqi xarita havolasi. */
export function externalMapLink(lat: number, lng: number): string {
  return `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=18/${lat}/${lng}`;
}
