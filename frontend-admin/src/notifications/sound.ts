// Yangi buyurtma signali.
//
// Tashqi audio fayl ataylab ishlatilmaydi: qo'shimcha so'rov, kesh muammosi va
// fayl yo'qolib qolish xavfi bo'ladi. Web Audio API bilan qisqa ikki notali
// signal to'g'ridan-to'g'ri brauzerda hosil qilinadi — u har doim mavjud.

let audioContext: AudioContext | null = null;

type AudioContextCtor = typeof AudioContext;

function getAudioContextCtor(): AudioContextCtor | undefined {
  return (
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: AudioContextCtor }).webkitAudioContext
  );
}

/**
 * Brauzerlar foydalanuvchi sahifa bilan aloqa qilmaguncha ovozni bloklaydi
 * (autoplay siyosati). Shuning uchun birinchi bosishda AudioContext ishga
 * tushiriladi va shundan keyin signal muammosiz chiqadi.
 */
export function primeNotificationSound() {
  const Ctor = getAudioContextCtor();
  if (!Ctor) return;
  if (!audioContext) audioContext = new Ctor();
  if (audioContext.state === 'suspended') void audioContext.resume();
}

/** Ovoz chiqarishga tayyormi (bloklangan bo'lsa foydalanuvchiga eslatma ko'rsatiladi). */
export function isSoundReady(): boolean {
  return audioContext !== null && audioContext.state === 'running';
}

/**
 * Qisqa "ding-dong" signal. Shovqinli zalda eshitilishi uchun ikki nota
 * ketma-ket chalinadi, lekin umumiy davomiyligi ~0.4 soniya — kassirni
 * bezovta qilmaydi.
 */
export function playNotificationSound() {
  const Ctor = getAudioContextCtor();
  if (!Ctor) return;
  if (!audioContext) audioContext = new Ctor();
  if (audioContext.state === 'suspended') void audioContext.resume();

  const ctx = audioContext;
  const now = ctx.currentTime;

  [
    { frequency: 880, start: 0 },
    { frequency: 1320, start: 0.18 },
  ].forEach(({ frequency, start }) => {
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();

    oscillator.type = 'sine';
    oscillator.frequency.value = frequency;

    // Tovushni keskin boshlab, silliq so'ndiramiz — aks holda "chirt" etgan
    // yoqimsiz shiqillash eshitiladi.
    gain.gain.setValueAtTime(0, now + start);
    gain.gain.linearRampToValueAtTime(0.28, now + start + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, now + start + 0.18);

    oscillator.connect(gain).connect(ctx.destination);
    oscillator.start(now + start);
    oscillator.stop(now + start + 0.2);
  });
}
