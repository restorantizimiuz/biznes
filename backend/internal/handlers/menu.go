package handlers

import (
	"context"

	"cafesystem/backend/internal/models"

	"github.com/gofiber/fiber/v2"
	"github.com/jackc/pgx/v5/pgxpool"
)

type MenuHandler struct {
	DB *pgxpool.Pool
}

func (h *MenuHandler) ListCategories(c *fiber.Ctx) error {
	businessID := c.Locals("business_id").(string)
	rows, err := h.DB.Query(context.Background(),
		`SELECT id, name, COALESCE(description, ''), COALESCE(image_url, ''), sort_order, is_active
		 FROM categories
		 WHERE business_id=$1 AND is_deleted=false ORDER BY sort_order, name`, businessID)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}
	defer rows.Close()

	categories := []models.Category{}
	for rows.Next() {
		var cat models.Category
		if err := rows.Scan(&cat.ID, &cat.Name, &cat.Description, &cat.ImageURL,
			&cat.SortOrder, &cat.IsActive); err != nil {
			return c.Status(500).JSON(fiber.Map{"error": err.Error()})
		}
		cat.BusinessID = businessID
		categories = append(categories, cat)
	}
	return c.JSON(categories)
}

func (h *MenuHandler) CreateCategory(c *fiber.Ctx) error {
	businessID := c.Locals("business_id").(string)
	var body struct {
		Name        string `json:"name"`
		Description string `json:"description"`
		ImageURL    string `json:"image_url"`
		SortOrder   int    `json:"sort_order"`
	}
	if err := c.BodyParser(&body); err != nil || body.Name == "" {
		return c.Status(400).JSON(fiber.Map{"error": "Kategoriya nomi kiritilishi shart"})
	}

	var id string
	err := h.DB.QueryRow(context.Background(),
		`INSERT INTO categories (business_id, name, description, image_url, sort_order)
		 VALUES ($1,$2,$3,$4,$5) RETURNING id`,
		businessID, body.Name, body.Description, body.ImageURL, body.SortOrder,
	).Scan(&id)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}
	return c.Status(201).JSON(fiber.Map{"id": id})
}

// UpdateCategory - kategoriya nomi, izohi, rasmi, tartibi va faolligini
// o'zgartirish.
//
// is_active=false qilingan kategoriya mijoz menyusidan yashiriladi, lekin
// kassa panelida qoladi — mavsumiy taomlarni butunlay o'chirmasdan vaqtincha
// yopish uchun (o'chirish esa ichidagi mahsulotlarni ham yo'qotardi).
func (h *MenuHandler) UpdateCategory(c *fiber.Ctx) error {
	businessID := c.Locals("business_id").(string)
	categoryID := c.Params("id")
	var body struct {
		Name        string `json:"name"`
		Description string `json:"description"`
		ImageURL    string `json:"image_url"`
		SortOrder   int    `json:"sort_order"`
		IsActive    *bool  `json:"is_active"`
	}
	if err := c.BodyParser(&body); err != nil || body.Name == "" {
		return c.Status(400).JSON(fiber.Map{"error": "Kategoriya nomi kiritilishi shart"})
	}

	isActive := true
	if body.IsActive != nil {
		isActive = *body.IsActive
	}

	cmd, err := h.DB.Exec(context.Background(),
		`UPDATE categories SET name=$1, description=$2, image_url=$3, sort_order=$4, is_active=$5
		 WHERE id=$6 AND business_id=$7 AND is_deleted=false`,
		body.Name, body.Description, body.ImageURL, body.SortOrder, isActive, categoryID, businessID)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}
	if cmd.RowsAffected() == 0 {
		return c.Status(404).JSON(fiber.Map{"error": "Kategoriya topilmadi"})
	}
	return c.JSON(fiber.Map{"success": true})
}

// DeleteCategory - kategoriyani va ichidagi barcha mahsulotlarni yashirin o'chiradi.
// Bazadan o'chirilmaydi, chunki eski buyurtmalar mahsulotlarga bog'langan —
// lekin shu daqiqadan boshlab menyu va ro'yxatlarda umuman ko'rinmaydi.
func (h *MenuHandler) DeleteCategory(c *fiber.Ctx) error {
	businessID := c.Locals("business_id").(string)
	categoryID := c.Params("id")
	ctx := context.Background()

	tx, err := h.DB.Begin(ctx)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}
	defer tx.Rollback(ctx)

	cmd, err := tx.Exec(ctx,
		`UPDATE categories SET is_deleted=true WHERE id=$1 AND business_id=$2 AND is_deleted=false`,
		categoryID, businessID)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}
	if cmd.RowsAffected() == 0 {
		return c.Status(404).JSON(fiber.Map{"error": "Kategoriya topilmadi"})
	}

	if _, err := tx.Exec(ctx,
		`UPDATE products SET is_deleted=true WHERE category_id=$1 AND business_id=$2`,
		categoryID, businessID); err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}

	if err := tx.Commit(ctx); err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}
	return c.JSON(fiber.Map{"success": true})
}

func (h *MenuHandler) ListProducts(c *fiber.Ctx) error {
	businessID := c.Locals("business_id").(string)
	categoryID := c.Query("category_id")

	query := `SELECT id, category_id, name, COALESCE(description, ''), price, COALESCE(image_url, ''), is_available
	          FROM products WHERE business_id=$1 AND is_deleted=false`
	args := []interface{}{businessID}
	if categoryID != "" {
		query += ` AND category_id=$2`
		args = append(args, categoryID)
	}

	rows, err := h.DB.Query(context.Background(), query, args...)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}
	defer rows.Close()

	products := []models.Product{}
	for rows.Next() {
		var p models.Product
		if err := rows.Scan(&p.ID, &p.CategoryID, &p.Name, &p.Description, &p.Price, &p.ImageURL, &p.IsAvailable); err != nil {
			return c.Status(500).JSON(fiber.Map{"error": err.Error()})
		}
		p.BusinessID = businessID
		products = append(products, p)
	}
	return c.JSON(products)
}

func (h *MenuHandler) CreateProduct(c *fiber.Ctx) error {
	businessID := c.Locals("business_id").(string)
	var body struct {
		CategoryID  string  `json:"category_id"`
		Name        string  `json:"name"`
		Description string  `json:"description"`
		Price       float64 `json:"price"`
		ImageURL    string  `json:"image_url"`
	}
	if err := c.BodyParser(&body); err != nil || body.Name == "" || body.CategoryID == "" {
		return c.Status(400).JSON(fiber.Map{"error": "Kategoriya va nom kiritilishi shart"})
	}
	if body.Price < 0 {
		return c.Status(400).JSON(fiber.Map{"error": "Narx manfiy bo'lishi mumkin emas"})
	}

	// Kategoriya shu biznesga tegishli ekanini tekshiramiz (boshqa kafening
	// kategoriyasiga mahsulot qo'shib bo'lmasligi uchun)
	var exists string
	if err := h.DB.QueryRow(context.Background(),
		`SELECT id FROM categories WHERE id=$1 AND business_id=$2 AND is_deleted=false`,
		body.CategoryID, businessID).Scan(&exists); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "Kategoriya topilmadi"})
	}

	var id string
	err := h.DB.QueryRow(context.Background(),
		`INSERT INTO products (business_id, category_id, name, description, price, image_url)
		 VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
		businessID, body.CategoryID, body.Name, body.Description, body.Price, body.ImageURL,
	).Scan(&id)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}
	return c.Status(201).JSON(fiber.Map{"id": id})
}

// UpdateProduct - mahsulotning nomi, tavsifi, narxi, kategoriyasi va rasmini o'zgartirish
func (h *MenuHandler) UpdateProduct(c *fiber.Ctx) error {
	businessID := c.Locals("business_id").(string)
	productID := c.Params("id")

	var body struct {
		CategoryID  string  `json:"category_id"`
		Name        string  `json:"name"`
		Description string  `json:"description"`
		Price       float64 `json:"price"`
		ImageURL    string  `json:"image_url"`
	}
	if err := c.BodyParser(&body); err != nil || body.Name == "" || body.CategoryID == "" {
		return c.Status(400).JSON(fiber.Map{"error": "Kategoriya va nom kiritilishi shart"})
	}
	if body.Price < 0 {
		return c.Status(400).JSON(fiber.Map{"error": "Narx manfiy bo'lishi mumkin emas"})
	}

	var exists string
	if err := h.DB.QueryRow(context.Background(),
		`SELECT id FROM categories WHERE id=$1 AND business_id=$2 AND is_deleted=false`,
		body.CategoryID, businessID).Scan(&exists); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "Kategoriya topilmadi"})
	}

	cmd, err := h.DB.Exec(context.Background(),
		`UPDATE products SET category_id=$1, name=$2, description=$3, price=$4, image_url=$5
		 WHERE id=$6 AND business_id=$7 AND is_deleted=false`,
		body.CategoryID, body.Name, body.Description, body.Price, body.ImageURL, productID, businessID)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}
	if cmd.RowsAffected() == 0 {
		return c.Status(404).JSON(fiber.Map{"error": "Mahsulot topilmadi"})
	}
	return c.JSON(fiber.Map{"success": true})
}

// DeleteProduct - mahsulotni yashirin o'chiradi (eski cheklar va hisobotlar buzilmasin).
func (h *MenuHandler) DeleteProduct(c *fiber.Ctx) error {
	businessID := c.Locals("business_id").(string)
	productID := c.Params("id")

	cmd, err := h.DB.Exec(context.Background(),
		`UPDATE products SET is_deleted=true WHERE id=$1 AND business_id=$2 AND is_deleted=false`,
		productID, businessID)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}
	if cmd.RowsAffected() == 0 {
		return c.Status(404).JSON(fiber.Map{"error": "Mahsulot topilmadi"})
	}
	return c.JSON(fiber.Map{"success": true})
}

// ToggleProductAvailability - "mahsulot tugadi" tugmasi shu orqali ishlaydi.
// Mahsulot bazadan o'chirilmaydi, faqat is_available=false qilinadi,
// shunda QR-menyu va online menyudan avtomatik yashiriladi.
func (h *MenuHandler) ToggleProductAvailability(c *fiber.Ctx) error {
	businessID := c.Locals("business_id").(string)
	productID := c.Params("id")
	var body struct {
		IsAvailable bool `json:"is_available"`
	}
	if err := c.BodyParser(&body); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "Noto'g'ri so'rov"})
	}

	cmd, err := h.DB.Exec(context.Background(),
		`UPDATE products SET is_available=$1 WHERE id=$2 AND business_id=$3 AND is_deleted=false`,
		body.IsAvailable, productID, businessID)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}
	if cmd.RowsAffected() == 0 {
		return c.Status(404).JSON(fiber.Map{"error": "Mahsulot topilmadi"})
	}
	return c.JSON(fiber.Map{"success": true})
}
