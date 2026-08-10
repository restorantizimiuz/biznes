package handlers

import (
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"

	"cafesystem/backend/internal/config"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
)

// UploadHandler - mahsulot rasmlarini qabul qiladi.
// Rasm serverning diskiga (cfg.UploadDir) yoziladi va /uploads/... havolasi
// orqali beriladi — shunda menyu so'rovi yengil qoladi (rasm JSON ichida emas)
// va brauzer rasmlarni alohida keshlaydi.
type UploadHandler struct {
	Cfg *config.Config
}

const maxImageSize = 5 << 20 // 5 MB

// allowedImageTypes - fayl mazmunidan aniqlangan MIME turlari.
// Kengaytmaga ishonmaymiz: ".jpg" deb nomlangan fayl ichida ixtiyoriy
// ma'lumot bo'lishi mumkin, shuning uchun haqiqiy tur baytlardan aniqlanadi.
var allowedImageTypes = map[string]string{
	"image/jpeg": ".jpg",
	"image/png":  ".png",
	"image/webp": ".webp",
}

func (h *UploadHandler) UploadImage(c *fiber.Ctx) error {
	fileHeader, err := c.FormFile("file")
	if err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "Rasm fayli yuborilmadi"})
	}
	if fileHeader.Size > maxImageSize {
		return c.Status(400).JSON(fiber.Map{"error": "Rasm hajmi 5 MB dan oshmasligi kerak"})
	}

	src, err := fileHeader.Open()
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "Faylni o'qib bo'lmadi"})
	}
	defer src.Close()

	// http.DetectContentType faqat dastlabki 512 baytga qaraydi
	head := make([]byte, 512)
	n, err := io.ReadFull(src, head)
	if err != nil && err != io.ErrUnexpectedEOF && err != io.EOF {
		return c.Status(500).JSON(fiber.Map{"error": "Faylni o'qib bo'lmadi"})
	}
	head = head[:n]

	ext, ok := allowedImageTypes[http.DetectContentType(head)]
	if !ok {
		return c.Status(400).JSON(fiber.Map{"error": "Faqat JPEG, PNG yoki WebP rasm yuklash mumkin"})
	}

	if err := os.MkdirAll(h.Cfg.UploadDir, 0o755); err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "Yuklash papkasini yaratib bo'lmadi"})
	}

	name := uuid.NewString() + ext
	dstPath := filepath.Join(h.Cfg.UploadDir, name)
	dst, err := os.Create(dstPath)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "Faylni saqlab bo'lmadi"})
	}
	defer dst.Close()

	// Tekshiruv uchun o'qib olingan bosh qismni ham yozamiz, so'ng qolganini
	if _, err := dst.Write(head); err != nil {
		os.Remove(dstPath)
		return c.Status(500).JSON(fiber.Map{"error": "Faylni saqlab bo'lmadi"})
	}
	if _, err := io.Copy(dst, io.LimitReader(src, maxImageSize)); err != nil {
		os.Remove(dstPath)
		return c.Status(500).JSON(fiber.Map{"error": "Faylni saqlab bo'lmadi"})
	}

	return c.Status(201).JSON(fiber.Map{"url": fmt.Sprintf("/uploads/%s", name)})
}
