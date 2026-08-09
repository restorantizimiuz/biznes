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
		`SELECT id, name, sort_order, is_active FROM categories
		 WHERE business_id=$1 ORDER BY sort_order`, businessID)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}
	defer rows.Close()

	var categories []models.Category
	for rows.Next() {
		var cat models.Category
		if err := rows.Scan(&cat.ID, &cat.Name, &cat.SortOrder, &cat.IsActive); err != nil {
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
		Name      string `json:"name"`
		SortOrder int    `json:"sort_order"`
	}
	if err := c.BodyParser(&body); err != nil || body.Name == "" {
		return c.Status(400).JSON(fiber.Map{"error": "Kategoriya nomi kiritilishi shart"})
	}

	var id string
	err := h.DB.QueryRow(context.Background(),
		`INSERT INTO categories (business_id, name, sort_order) VALUES ($1,$2,$3) RETURNING id`,
		businessID, body.Name, body.SortOrder,
	).Scan(&id)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}
	return c.Status(201).JSON(fiber.Map{"id": id})
}

func (h *MenuHandler) ListProducts(c *fiber.Ctx) error {
	businessID := c.Locals("business_id").(string)
	categoryID := c.Query("category_id")

	query := `SELECT id, category_id, name, COALESCE(description, ''), price, COALESCE(image_url, ''), is_available
	          FROM products WHERE business_id=$1`
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

	var products []models.Product
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

// ToggleProductAvailability - "mahsulot tugadi" tugmasi shu orqali ishlaydi.
// Mahsulot bazadan o'chirilmaydi, faqat is_available=false qilinadi,
// shunda QR-menyu va online menyudan avtomatik yashiriladi.
func (h *MenuHandler) ToggleProductAvailability(c *fiber.Ctx) error {
	productID := c.Params("id")
	var body struct {
		IsAvailable bool `json:"is_available"`
	}
	if err := c.BodyParser(&body); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "Noto'g'ri so'rov"})
	}

	_, err := h.DB.Exec(context.Background(),
		`UPDATE products SET is_available=$1 WHERE id=$2`, body.IsAvailable, productID)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}
	return c.JSON(fiber.Map{"success": true})
}
