package models

import "time"

// Business - tizimdan foydalanuvchi kafe/restoran
type Business struct {
	ID        string    `json:"id"`
	Name      string    `json:"name"`
	Type      string    `json:"type"`
	Phone     string    `json:"phone"`
	Address   string    `json:"address"`
	Language  string    `json:"language"`
	ThemeMode string    `json:"theme_mode"`
	IsActive  bool      `json:"is_active"`
	CreatedAt time.Time `json:"created_at"`
}

// User - tizim foydalanuvchisi (owner, admin, cashier, waiter)
type User struct {
	ID           string    `json:"id"`
	BusinessID   string    `json:"business_id"`
	FullName     string    `json:"full_name"`
	Login        string    `json:"login"`
	PasswordHash string    `json:"-"` // hech qachon JSON javobga chiqmaydi
	Role         string    `json:"role"`
	IsActive     bool      `json:"is_active"`
	CreatedAt    time.Time `json:"created_at"`
}

// Floor - qavat
type Floor struct {
	ID         string `json:"id"`
	BusinessID string `json:"business_id"`
	Name       string `json:"name"`
	SortOrder  int    `json:"sort_order"`
}

// Table - stol
type Table struct {
	ID          string `json:"id"`
	FloorID     string `json:"floor_id"`
	Name        string `json:"name"`
	QRCodeToken string `json:"qr_code_token"`
	Status      string `json:"status"` // empty, occupied, pending_payment
}

// Category - menyu kategoriyasi
type Category struct {
	ID         string `json:"id"`
	BusinessID string `json:"business_id"`
	Name       string `json:"name"`
	SortOrder  int    `json:"sort_order"`
	IsActive   bool   `json:"is_active"`
}

// Product - menyudagi mahsulot
type Product struct {
	ID          string  `json:"id"`
	CategoryID  string  `json:"category_id"`
	BusinessID  string  `json:"business_id"`
	Name        string  `json:"name"`
	Description string  `json:"description"`
	Price       float64 `json:"price"`
	ImageURL    string  `json:"image_url"`
	IsAvailable bool    `json:"is_available"`
}

// Order - buyurtma
type Order struct {
	ID              string      `json:"id"`
	BusinessID      string      `json:"business_id"`
	TableID         *string     `json:"table_id"`
	Source          string      `json:"source"` // cashier, qr, online_telegram, waiter
	Status          string      `json:"status"` // new, activated, paid, cancelled
	CreatedByUserID *string     `json:"created_by_user_id"`
	TotalAmount     float64     `json:"total_amount"`
	DiscountAmount  float64     `json:"discount_amount"`
	DiscountReason  string      `json:"discount_reason"`
	FinalAmount     float64     `json:"final_amount"`
	CreatedAt       time.Time   `json:"created_at"`
	Items           []OrderItem `json:"items,omitempty"`
}

// OrderItem - buyurtmadagi bitta mahsulot qatori
type OrderItem struct {
	ID          string  `json:"id"`
	OrderID     string  `json:"order_id"`
	ProductID   string  `json:"product_id"`
	ProductName string  `json:"product_name"`
	UnitPrice   float64 `json:"unit_price"`
	Quantity    int     `json:"quantity"`
}

// Payment - to'lov (bir buyurtma bir nechta to'lov qismidan iborat bo'lishi mumkin)
type Payment struct {
	ID         string    `json:"id"`
	OrderID    string    `json:"order_id"`
	Method     string    `json:"method"`    // cash, transfer, card
	CardType   *string   `json:"card_type"` // uzcard, humo, visa, mastercard
	Amount     float64   `json:"amount"`
	ReceivedBy string    `json:"received_by"`
	CreatedAt  time.Time `json:"created_at"`
}
