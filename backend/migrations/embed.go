// Package migrations - SQL migratsiya fayllarini binarga qo'shib beradi.
//
// go:embed direktivasi faqat o'z papkasidagi (yoki uning ichidagi) fayllarni
// ola oladi — ota-papkaga murojaat qilib bo'lmaydi. Shuning uchun fayllar
// turgan joyning o'zida shu kichik paket yaratildi; `internal/database` esa
// undan foydalanadi.
package migrations

import "embed"

//go:embed *.sql
var Files embed.FS
