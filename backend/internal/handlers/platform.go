package handlers

import (
	"context"
	"fmt"
	"strings"
	"time"

	"cafesystem/backend/internal/config"
	"cafesystem/backend/internal/middleware"

	"github.com/gofiber/fiber/v2"
	"github.com/golang-jwt/jwt/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"golang.org/x/crypto/bcrypt"
)

// PlatformHandler - super-admin (platforma egalari) uchun API.
//
// Bu guruh kafe API'sidan ataylab ajratilgan: alohida jadval (platform_admins),
// alohida middleware va alohida JWT kalit. Kafe xodimi bu endpointlarga hech
// qanday yo'l bilan yeta olmaydi.
type PlatformHandler struct {
	DB  *pgxpool.Pool
	Cfg *config.Config
}

// Barcha boshqariladigan funksiya kalitlari — interfeys shu ro'yxatni ko'rsatadi.
var platformFeatureKeys = []string{
	middleware.FeatureQRMenu,
	middleware.FeatureOnlineOrder,
	middleware.FeatureTelegramBot,
	middleware.FeatureReceiptPrint,
	middleware.FeatureReportExport,
}

// ---------------------------------------------------------------------------
// Autentifikatsiya
// ---------------------------------------------------------------------------

func (h *PlatformHandler) Login(c *fiber.Ctx) error {
	var req struct {
		Login    string `json:"login"`
		Password string `json:"password"`
	}
	if err := c.BodyParser(&req); err != nil || req.Login == "" || req.Password == "" {
		return c.Status(400).JSON(fiber.Map{"error": "Login va parol kiritilishi shart"})
	}

	var id, fullName, hash string
	var isActive bool
	err := h.DB.QueryRow(context.Background(),
		`SELECT id, full_name, password_hash, is_active FROM platform_admins WHERE login=$1`,
		req.Login).Scan(&id, &fullName, &hash, &isActive)
	if err != nil {
		return c.Status(401).JSON(fiber.Map{"error": "Login yoki parol xato"})
	}
	if !isActive {
		return c.Status(403).JSON(fiber.Map{"error": "Hisob bloklangan"})
	}
	if err := bcrypt.CompareHashAndPassword([]byte(hash), []byte(req.Password)); err != nil {
		return c.Status(401).JSON(fiber.Map{"error": "Login yoki parol xato"})
	}

	claims := middleware.PlatformClaims{
		AdminID: id,
		Login:   req.Login,
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(12 * time.Hour)),
		},
	}
	signed, err := jwt.NewWithClaims(jwt.SigningMethodHS256, claims).
		SignedString([]byte(h.Cfg.PlatformJWTSecret))
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "Token yaratishda xatolik"})
	}

	return c.JSON(fiber.Map{"token": signed, "admin_id": id, "full_name": fullName, "login": req.Login})
}

// ---------------------------------------------------------------------------
// Kafelar
// ---------------------------------------------------------------------------

type platformBusiness struct {
	ID             string          `json:"id"`
	BusinessCode   string          `json:"business_code"`
	Name           string          `json:"name"`
	Type           string          `json:"type"`
	Phone          *string         `json:"phone"`
	Language       string          `json:"language"`
	IsActive       bool            `json:"is_active"`
	CreatedAt      time.Time       `json:"created_at"`
	MaxTables      int             `json:"max_tables"`
	MaxWaiters     int             `json:"max_waiters"`
	MaxCashiers    int             `json:"max_cashiers"`
	TableCount     int             `json:"table_count"`
	WaiterCount    int             `json:"waiter_count"`
	CashierCount   int             `json:"cashier_count"`
	Plan           *string         `json:"subscription_plan"`
	Status         *string         `json:"subscription_status"`
	EndsAt         *time.Time      `json:"subscription_ends_at"`
	LastActivityAt *time.Time      `json:"last_activity_at"`
	Features       map[string]bool `json:"features"`
}

const platformBusinessSQL = `
	SELECT b.id, b.business_code, b.name, b.type, b.phone, b.language, b.is_active, b.created_at,
	       b.max_tables, b.max_waiters, b.max_cashiers,
	       (SELECT count(*) FROM tables t
	          JOIN floors f ON f.id = t.floor_id
	         WHERE f.business_id = b.id AND t.is_deleted = false),
	       (SELECT count(*) FROM users u WHERE u.business_id = b.id AND u.role='waiter'  AND u.is_active),
	       (SELECT count(*) FROM users u WHERE u.business_id = b.id AND u.role='cashier' AND u.is_active),
	       s.plan::text, s.status::text, s.ends_at,
	       (SELECT max(o.created_at) FROM orders o WHERE o.business_id = b.id)
	FROM businesses b
	LEFT JOIN LATERAL (
	    SELECT plan, status, ends_at FROM subscriptions
	    WHERE business_id = b.id ORDER BY created_at DESC LIMIT 1
	) s ON true
	ORDER BY b.created_at DESC`

// ListBusinesses - barcha kafelar: holati, obunasi, stollar/xodimlar soni,
// oxirgi faollik va yoqilgan funksiyalar.
func (h *PlatformHandler) ListBusinesses(c *fiber.Ctx) error {
	ctx := context.Background()

	rows, err := h.DB.Query(ctx, platformBusinessSQL)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}
	defer rows.Close()

	list := []platformBusiness{}
	for rows.Next() {
		b, err := scanPlatformBusiness(rows)
		if err != nil {
			return c.Status(500).JSON(fiber.Map{"error": err.Error()})
		}
		list = append(list, b)
	}
	if err := rows.Err(); err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}

	// Funksiya bayroqlari bitta so'rovda olinadi (har bir kafe uchun alohida
	// so'rov yubormaslik uchun) va keyin xotirada taqsimlanadi.
	flagRows, err := h.DB.Query(ctx, `SELECT business_id, feature_key, is_enabled FROM feature_flags`)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}
	defer flagRows.Close()
	flagsByBusiness := map[string]map[string]bool{}
	for flagRows.Next() {
		var bid, key string
		var enabled bool
		if err := flagRows.Scan(&bid, &key, &enabled); err != nil {
			return c.Status(500).JSON(fiber.Map{"error": err.Error()})
		}
		if flagsByBusiness[bid] == nil {
			flagsByBusiness[bid] = map[string]bool{}
		}
		flagsByBusiness[bid][key] = enabled
	}

	for i := range list {
		list[i].Features = mergeFeatureDefaults(flagsByBusiness[list[i].ID])
	}
	return c.JSON(list)
}

// mergeFeatureDefaults - yozuvi yo'q funksiya yoqilgan deb hisoblanadi
// (middleware.FeatureEnabled bilan bir xil mantiq).
func mergeFeatureDefaults(stored map[string]bool) map[string]bool {
	result := map[string]bool{}
	for _, key := range platformFeatureKeys {
		if v, ok := stored[key]; ok {
			result[key] = v
		} else {
			result[key] = true
		}
	}
	return result
}

type platformRowScanner interface {
	Scan(dest ...any) error
}

func scanPlatformBusiness(row platformRowScanner) (platformBusiness, error) {
	var b platformBusiness
	err := row.Scan(&b.ID, &b.BusinessCode, &b.Name, &b.Type, &b.Phone, &b.Language,
		&b.IsActive, &b.CreatedAt, &b.MaxTables, &b.MaxWaiters, &b.MaxCashiers,
		&b.TableCount, &b.WaiterCount, &b.CashierCount,
		&b.Plan, &b.Status, &b.EndsAt, &b.LastActivityAt)
	return b, err
}

type createBusinessRequest struct {
	BusinessCode  string `json:"business_code"`
	Name          string `json:"name"`
	Type          string `json:"type"`
	Phone         string `json:"phone"`
	OwnerFullName string `json:"owner_full_name"`
	OwnerLogin    string `json:"owner_login"`
	OwnerPassword string `json:"owner_password"`
	Plan          string `json:"plan"`
	DurationDays  int    `json:"duration_days"`
}

// CreateBusiness - yangi kafe: biznes yozuvi, birinchi `owner` hisobi va obuna
// bitta tranzaksiyada yaratiladi. Yarim yaratilgan kafe (egasiz yoki obunasiz)
// qolib ketmasligi uchun.
func (h *PlatformHandler) CreateBusiness(c *fiber.Ctx) error {
	var req createBusinessRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "Noto'g'ri so'rov"})
	}
	req.BusinessCode = strings.TrimSpace(strings.ToLower(req.BusinessCode))
	req.Name = strings.TrimSpace(req.Name)
	req.OwnerLogin = strings.TrimSpace(req.OwnerLogin)

	if req.BusinessCode == "" || req.Name == "" || req.OwnerLogin == "" || len(req.OwnerPassword) < 6 {
		return c.Status(400).JSON(fiber.Map{
			"error": "Kafe kodi, nomi, egasining logini va kamida 6 belgili parol kiritilishi shart",
		})
	}
	if req.Type != "restaurant" {
		req.Type = "cafe"
	}
	if !subscriptionPlans[req.Plan] {
		req.Plan = "basic"
	}
	if req.DurationDays <= 0 {
		req.DurationDays = 30
	}
	if req.OwnerFullName == "" {
		req.OwnerFullName = "Kafe egasi"
	}

	hash, err := bcrypt.GenerateFromPassword([]byte(req.OwnerPassword), bcrypt.DefaultCost)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "Parolni shifrlashda xatolik"})
	}

	ctx := context.Background()
	tx, err := h.DB.Begin(ctx)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}
	defer tx.Rollback(ctx)

	var businessID string
	if err := tx.QueryRow(ctx,
		`INSERT INTO businesses (business_code, name, type, phone) VALUES ($1,$2,$3,$4) RETURNING id`,
		req.BusinessCode, req.Name, req.Type, nullIfEmpty(req.Phone)).Scan(&businessID); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "Bu kafe kodi allaqachon band"})
	}

	if _, err := tx.Exec(ctx,
		`INSERT INTO users (business_id, full_name, login, password_hash, role)
		 VALUES ($1,$2,$3,$4,'owner')`,
		businessID, req.OwnerFullName, req.OwnerLogin, string(hash)); err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}

	if _, err := tx.Exec(ctx,
		`INSERT INTO subscriptions (business_id, plan, status, ends_at, created_by_admin)
		 VALUES ($1,$2,'active', now() + make_interval(days => $3), $4)`,
		businessID, req.Plan, req.DurationDays, c.Locals("platform_admin_login")); err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}

	for _, key := range platformFeatureKeys {
		if _, err := tx.Exec(ctx,
			`INSERT INTO feature_flags (business_id, feature_key, is_enabled) VALUES ($1,$2,true)`,
			businessID, key); err != nil {
			return c.Status(500).JSON(fiber.Map{"error": err.Error()})
		}
	}

	if err := tx.Commit(ctx); err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}
	return c.Status(201).JSON(fiber.Map{"id": businessID, "business_code": req.BusinessCode})
}

type updateBusinessRequest struct {
	Name        string `json:"name"`
	Phone       string `json:"phone"`
	IsActive    *bool  `json:"is_active"`
	MaxTables   int    `json:"max_tables"`
	MaxWaiters  int    `json:"max_waiters"`
	MaxCashiers int    `json:"max_cashiers"`
}

// UpdateBusiness - kafe nomi/telefoni, limitlar va faollik holati.
// is_active=false qilinsa kafe xodimlari tizimga kira olmaydi (auth.Login
// buni tekshiradi).
func (h *PlatformHandler) UpdateBusiness(c *fiber.Ctx) error {
	businessID := c.Params("id")
	var body updateBusinessRequest
	if err := c.BodyParser(&body); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "Noto'g'ri so'rov"})
	}
	for _, limit := range []int{body.MaxTables, body.MaxWaiters, body.MaxCashiers} {
		if limit < 0 {
			return c.Status(400).JSON(fiber.Map{"error": "Limit manfiy bo'lishi mumkin emas"})
		}
	}

	cmd, err := h.DB.Exec(context.Background(), `
		UPDATE businesses SET
			name         = COALESCE(NULLIF($1,''), name),
			phone        = COALESCE(NULLIF($2,''), phone),
			is_active    = COALESCE($3, is_active),
			max_tables   = COALESCE(NULLIF($4,0), max_tables),
			max_waiters  = COALESCE(NULLIF($5,0), max_waiters),
			max_cashiers = COALESCE(NULLIF($6,0), max_cashiers),
			updated_at   = now()
		WHERE id=$7`,
		body.Name, body.Phone, body.IsActive,
		body.MaxTables, body.MaxWaiters, body.MaxCashiers, businessID)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}
	if cmd.RowsAffected() == 0 {
		return c.Status(404).JSON(fiber.Map{"error": "Kafe topilmadi"})
	}
	return c.JSON(fiber.Map{"success": true})
}

// SetSubscription - obuna turi va muddatini belgilash.
func (h *PlatformHandler) SetSubscription(c *fiber.Ctx) error {
	businessID := c.Params("id")
	var body struct {
		Plan         string `json:"plan"`
		Status       string `json:"status"`
		DurationDays int    `json:"duration_days"`
	}
	if err := c.BodyParser(&body); err != nil || !subscriptionPlans[body.Plan] {
		return c.Status(400).JSON(fiber.Map{"error": "Tarif noto'g'ri (basic, qr yoki full)"})
	}
	if body.Status != "active" && body.Status != "expired" && body.Status != "suspended" {
		body.Status = "active"
	}
	if body.DurationDays <= 0 {
		body.DurationDays = 30
	}

	var id string
	err := h.DB.QueryRow(context.Background(),
		`INSERT INTO subscriptions (business_id, plan, status, ends_at, created_by_admin)
		 VALUES ($1,$2,$3, now() + make_interval(days => $4), $5) RETURNING id`,
		businessID, body.Plan, body.Status, body.DurationDays,
		c.Locals("platform_admin_login")).Scan(&id)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}
	return c.JSON(fiber.Map{"success": true})
}

// SetFeature - kafe uchun bitta funksiyani yoqish/o'chirish.
func (h *PlatformHandler) SetFeature(c *fiber.Ctx) error {
	businessID := c.Params("id")
	var body struct {
		FeatureKey string `json:"feature_key"`
		IsEnabled  bool   `json:"is_enabled"`
	}
	if err := c.BodyParser(&body); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "Noto'g'ri so'rov"})
	}
	valid := false
	for _, key := range platformFeatureKeys {
		if key == body.FeatureKey {
			valid = true
			break
		}
	}
	if !valid {
		return c.Status(400).JSON(fiber.Map{"error": "Noma'lum funksiya kaliti"})
	}

	_, err := h.DB.Exec(context.Background(),
		`INSERT INTO feature_flags (business_id, feature_key, is_enabled) VALUES ($1,$2,$3)
		 ON CONFLICT (business_id, feature_key) DO UPDATE SET is_enabled = EXCLUDED.is_enabled`,
		businessID, body.FeatureKey, body.IsEnabled)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}
	return c.JSON(fiber.Map{"success": true})
}

// Stats - bosh sahifadagi umumiy raqamlar.
func (h *PlatformHandler) Stats(c *fiber.Ctx) error {
	var totalBusinesses, activeBusinesses, totalUsers, ordersToday int
	var revenueToday float64

	err := h.DB.QueryRow(context.Background(), `
		SELECT (SELECT count(*) FROM businesses),
		       (SELECT count(*) FROM businesses WHERE is_active),
		       (SELECT count(*) FROM users WHERE is_active),
		       (SELECT count(*) FROM orders WHERE created_at::date = current_date),
		       (SELECT COALESCE(SUM(final_amount),0) FROM orders
		         WHERE status='paid' AND created_at::date = current_date)`,
	).Scan(&totalBusinesses, &activeBusinesses, &totalUsers, &ordersToday, &revenueToday)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}

	return c.JSON(fiber.Map{
		"total_businesses":  totalBusinesses,
		"active_businesses": activeBusinesses,
		"total_users":       totalUsers,
		"orders_today":      ordersToday,
		"revenue_today":     revenueToday,
	})
}

// ---------------------------------------------------------------------------
// Foydalanuvchilar (barcha kafelar bo'yicha)
// ---------------------------------------------------------------------------

type platformUser struct {
	ID             string     `json:"id"`
	BusinessID     string     `json:"business_id"`
	BusinessName   string     `json:"business_name"`
	FullName       string     `json:"full_name"`
	Login          string     `json:"login"`
	Role           string     `json:"role"`
	IsActive       bool       `json:"is_active"`
	CreatedAt      time.Time  `json:"created_at"`
	LastActivityAt *time.Time `json:"last_activity_at"`
}

const (
	platformListLimitDefault = 100
	platformListLimitMax     = 500
)

// listUsers - ListUsers va ListStaff bir xil manbadan (users jadvali) o'qiydi,
// faqat rol filtri bilan farqlanadi — shuning uchun SQL bitta joyda.
// `users` jadvalida alohida "staff" jadval yo'q: kassir/ofitsiant ham shu
// jadvalda role ustuni bilan saqlanadi (backend/migrations/001_init_schema.sql).
//
// allowedRoles berilsa (ListStaff uchun), natija HAR DOIM shu ro'yxat bilan
// cheklanadi — ?role= parametri orqali ham chetlab o'tib bo'lmaydi (masalan
// /platform/staff?role=owner bo'sh natija qaytaradi, owner qatorlarini emas).
func (h *PlatformHandler) listUsers(c *fiber.Ctx, defaultRoles, allowedRoles []string) error {
	ctx := context.Background()

	limit := c.QueryInt("limit", platformListLimitDefault)
	if limit <= 0 || limit > platformListLimitMax {
		limit = platformListLimitDefault
	}
	offset := c.QueryInt("offset", 0)
	if offset < 0 {
		offset = 0
	}

	var args []any
	var where []string

	if businessID := c.Query("business_id"); businessID != "" {
		args = append(args, businessID)
		where = append(where, fmt.Sprintf("u.business_id = $%d", len(args)))
	}

	roles := defaultRoles
	if roleParam := c.Query("role"); roleParam != "" {
		roles = strings.Split(roleParam, ",")
	}
	if allowedRoles != nil {
		roles = intersectRoles(roles, allowedRoles)
	}
	// `roles != nil` (nafaqat len>0) — chunki ruxsat etilgan ro'yxatga
	// mos kelmagan so'rov (masalan staff'da role=owner) bo'sh, lekin
	// nil BO'LMAGAN slice beradi: filtr baribir qo'shiladi va SQL
	// `= ANY('{}')` hech qanday qator bilan mos kelmaydi — filtrsiz
	// "hammasi" qaytarish o'rniga to'g'ri bo'sh natija chiqadi.
	if roles != nil {
		args = append(args, roles)
		where = append(where, fmt.Sprintf("u.role::text = ANY($%d)", len(args)))
	}

	switch c.Query("status") {
	case "active":
		where = append(where, "u.is_active = true")
	case "inactive":
		where = append(where, "u.is_active = false")
	}

	whereSQL := ""
	if len(where) > 0 {
		whereSQL = "WHERE " + strings.Join(where, " AND ")
	}

	args = append(args, limit, offset)
	query := fmt.Sprintf(`
		SELECT u.id, u.business_id, b.name, u.full_name, u.login, u.role::text, u.is_active, u.created_at,
		       (SELECT max(o.created_at) FROM orders o WHERE o.created_by_user_id = u.id)
		FROM users u
		JOIN businesses b ON b.id = u.business_id
		%s
		ORDER BY u.created_at DESC
		LIMIT $%d OFFSET $%d`, whereSQL, len(args)-1, len(args))

	rows, err := h.DB.Query(ctx, query, args...)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}
	defer rows.Close()

	users := []platformUser{}
	for rows.Next() {
		var u platformUser
		if err := rows.Scan(&u.ID, &u.BusinessID, &u.BusinessName, &u.FullName, &u.Login,
			&u.Role, &u.IsActive, &u.CreatedAt, &u.LastActivityAt); err != nil {
			return c.Status(500).JSON(fiber.Map{"error": err.Error()})
		}
		users = append(users, u)
	}
	if err := rows.Err(); err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}

	return c.JSON(fiber.Map{"users": users, "limit": limit, "offset": offset})
}

// ListUsers - platformadagi barcha foydalanuvchilar (istalgan rol).
// Filtrlar: ?business_id=, ?role=cashier,waiter, ?status=active|inactive,
// sahifalash: ?limit=&offset=.
func (h *PlatformHandler) ListUsers(c *fiber.Ctx) error {
	return h.listUsers(c, nil, nil)
}

// staffRoles - "xodim" kontraktini belgilaydi: faqat kassir va ofitsiant.
var staffRoles = []string{"cashier", "waiter"}

// ListStaff - platformadagi xizmat ko'rsatuvchi xodimlar (kassir/ofitsiant).
// Bu kontrakt qat'iy: ?role= parametri faqat staffRoles ichida TORAYTIRISH
// uchun ishlatiladi (masalan ?role=cashier), undan tashqariga chiqib
// bo'lmaydi — ?role=owner yoki ?role=admin bo'sh natija qaytaradi.
func (h *PlatformHandler) ListStaff(c *fiber.Ctx) error {
	return h.listUsers(c, staffRoles, staffRoles)
}

// intersectRoles - so'ralgan rollarni ruxsat etilganlar bilan kesishmasiga
// qisqartiradi. Har doim NIL BO'LMAGAN slice qaytaradi (bo'sh bo'lsa ham) —
// shu orqali chaqiruvchi "filtr yo'q" bilan "filtr hech narsaga mos kelmadi"ni
// ajrata oladi.
func intersectRoles(requested, allowed []string) []string {
	allowedSet := make(map[string]bool, len(allowed))
	for _, r := range allowed {
		allowedSet[strings.TrimSpace(r)] = true
	}
	result := []string{}
	for _, r := range requested {
		r = strings.TrimSpace(r)
		if allowedSet[r] {
			result = append(result, r)
		}
	}
	return result
}

// ---------------------------------------------------------------------------
// Audit jurnali (barcha kafelar bo'yicha)
// ---------------------------------------------------------------------------

type platformAuditEntry struct {
	ID           string         `json:"id"`
	CreatedAt    time.Time      `json:"created_at"`
	BusinessID   string         `json:"business_id"`
	BusinessName string         `json:"business_name"`
	Action       string         `json:"action"`
	Actor        string         `json:"actor"`
	OrderID      *string        `json:"order_id"`
	Details      map[string]any `json:"details"`
}

// ListAuditLogs - barcha kafelar bo'yicha audit jurnali. Mavjud `audit_log`
// jadvalidan o'qiydi (yozish uchun handlers/audit.go'dagi writeAudit() dan
// foydalaniladi, u shu yerda o'zgartirilmaydi) — reports.go'dagi
// fetchActivity bilan bir xil SQL uslubida, faqat business_id filtri yo'q.
// Filtrlar: ?business_id=, ?action=, sahifalash: ?limit=&offset=.
func (h *PlatformHandler) ListAuditLogs(c *fiber.Ctx) error {
	ctx := context.Background()

	limit := c.QueryInt("limit", platformListLimitDefault)
	if limit <= 0 || limit > platformListLimitMax {
		limit = platformListLimitDefault
	}
	offset := c.QueryInt("offset", 0)
	if offset < 0 {
		offset = 0
	}

	var args []any
	var where []string
	if businessID := c.Query("business_id"); businessID != "" {
		args = append(args, businessID)
		where = append(where, fmt.Sprintf("al.business_id = $%d", len(args)))
	}
	if action := c.Query("action"); action != "" {
		args = append(args, action)
		where = append(where, fmt.Sprintf("al.action = $%d", len(args)))
	}
	whereSQL := ""
	if len(where) > 0 {
		whereSQL = "WHERE " + strings.Join(where, " AND ")
	}

	args = append(args, limit, offset)
	query := fmt.Sprintf(`
		SELECT al.id, al.created_at, al.business_id, b.name, al.action,
		       COALESCE(u.full_name, al.actor_label, ''), al.order_id, al.details
		FROM audit_log al
		JOIN businesses b ON b.id = al.business_id
		LEFT JOIN users u ON u.id = al.user_id
		%s
		ORDER BY al.created_at DESC
		LIMIT $%d OFFSET $%d`, whereSQL, len(args)-1, len(args))

	rows, err := h.DB.Query(ctx, query, args...)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}
	defer rows.Close()

	entries := []platformAuditEntry{}
	for rows.Next() {
		var e platformAuditEntry
		if err := rows.Scan(&e.ID, &e.CreatedAt, &e.BusinessID, &e.BusinessName, &e.Action,
			&e.Actor, &e.OrderID, &e.Details); err != nil {
			return c.Status(500).JSON(fiber.Map{"error": err.Error()})
		}
		entries = append(entries, e)
	}
	if err := rows.Err(); err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}

	return c.JSON(fiber.Map{"entries": entries, "limit": limit, "offset": offset})
}
