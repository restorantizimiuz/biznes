package handlers

import (
	"context"
	"fmt"
	"strings"

	"cafesystem/backend/internal/middleware"

	"github.com/gofiber/fiber/v2"
	"github.com/jackc/pgx/v5/pgxpool"
	"golang.org/x/crypto/bcrypt"
)

type StaffHandler struct {
	DB *pgxpool.Pool
}

type staffDTO struct {
	ID       string `json:"id"`
	FullName string `json:"full_name"`
	Login    string `json:"login"`
	Role     string `json:"role"`
	IsActive bool   `json:"is_active"`
}

// editableRoles - admin qo'ya oladigan rollar. 'owner' ro'yxatda yo'q:
// kafe egasi bitta bo'ladi va uni interfeys orqali yaratib ham,
// o'zgartirib ham bo'lmaydi.
var editableRoles = map[string]bool{"admin": true, "cashier": true, "waiter": true}

// roleLimitColumn - tarif limiti qaysi ustunda saqlanadi.
// Admin roli limitga kirmaydi: u kafe boshqaruvi, xizmat ko'rsatuvchi xodim emas.
var roleLimitColumn = map[string]string{"waiter": "max_waiters", "cashier": "max_cashiers"}

func (h *StaffHandler) ListStaff(c *fiber.Ctx) error {
	businessID := c.Locals("business_id").(string)
	rows, err := h.DB.Query(context.Background(),
		`SELECT id, full_name, login, role, is_active FROM users WHERE business_id=$1 ORDER BY full_name`,
		businessID)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}
	defer rows.Close()

	staff := []staffDTO{}
	for rows.Next() {
		var s staffDTO
		if err := rows.Scan(&s.ID, &s.FullName, &s.Login, &s.Role, &s.IsActive); err != nil {
			return c.Status(500).JSON(fiber.Map{"error": err.Error()})
		}
		staff = append(staff, s)
	}
	return c.JSON(staff)
}

func (h *StaffHandler) GetStaff(c *fiber.Ctx) error {
	businessID := c.Locals("business_id").(string)
	var s staffDTO
	err := h.DB.QueryRow(context.Background(),
		`SELECT id, full_name, login, role, is_active FROM users WHERE id=$1 AND business_id=$2`,
		c.Params("id"), businessID).Scan(&s.ID, &s.FullName, &s.Login, &s.Role, &s.IsActive)
	if err != nil {
		return c.Status(404).JSON(fiber.Map{"error": "Xodim topilmadi"})
	}
	return c.JSON(s)
}

// checkRoleLimit - tarif bo'yicha rol limiti oshib ketmasligini tekshiradi.
//
// excludeUserID: tahrirlanayotgan xodimning o'zi hisobga olinmaydi — aks holda
// allaqachon kassir bo'lgan xodimni saqlaganda o'zi limitga to'sqinlik qilardi.
func (h *StaffHandler) checkRoleLimit(ctx context.Context, businessID, role, excludeUserID string) error {
	column, limited := roleLimitColumn[role]
	if !limited {
		return nil
	}

	var current, allowed int
	query := fmt.Sprintf(`
		SELECT (SELECT count(*) FROM users u
		         WHERE u.business_id=$1 AND u.role=$2 AND u.is_active AND u.id <> $3),
		       b.%s
		FROM businesses b WHERE b.id=$1`, column)

	// $3 UUID bilan solishtiriladi, shuning uchun bo'sh satr o'rniga hech
	// qachon mos kelmaydigan nol-UUID beriladi.
	if excludeUserID == "" {
		excludeUserID = "00000000-0000-0000-0000-000000000000"
	}
	if err := h.DB.QueryRow(ctx, query, businessID, role, excludeUserID).Scan(&current, &allowed); err != nil {
		return err
	}
	if current >= allowed {
		roleName := map[string]string{"waiter": "ofitsiant", "cashier": "kassir"}[role]
		return fiber.NewError(403,
			fmt.Sprintf("Tarifingiz bo'yicha maksimal %d ta %s qo'shish mumkin", allowed, roleName))
	}
	return nil
}

// CreateStaff - yangi kassir, ofitsiant yoki admin qo'shish
func (h *StaffHandler) CreateStaff(c *fiber.Ctx) error {
	businessID := c.Locals("business_id").(string)
	var body struct {
		FullName string `json:"full_name"`
		Login    string `json:"login"`
		Password string `json:"password"`
		Role     string `json:"role"`
	}
	if err := c.BodyParser(&body); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "Noto'g'ri so'rov"})
	}
	body.Login = strings.TrimSpace(body.Login)
	if body.Login == "" || body.Password == "" {
		return c.Status(400).JSON(fiber.Map{"error": "Ism, login va parol kiritilishi shart"})
	}
	if !editableRoles[body.Role] {
		body.Role = "cashier"
	}

	ctx := context.Background()
	if err := h.checkRoleLimit(ctx, businessID, body.Role, ""); err != nil {
		return err
	}

	hash, err := bcrypt.GenerateFromPassword([]byte(body.Password), bcrypt.DefaultCost)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "Parolni shifrlashda xatolik"})
	}

	var id string
	err = h.DB.QueryRow(ctx,
		`INSERT INTO users (business_id, full_name, login, password_hash, role)
		 VALUES ($1,$2,$3,$4,$5) RETURNING id`,
		businessID, body.FullName, body.Login, string(hash), body.Role,
	).Scan(&id)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "Bu login band bo'lishi mumkin"})
	}
	return c.Status(201).JSON(fiber.Map{"id": id})
}

// UpdateStaff - xodim ma'lumotini tahrirlash: ism, login, rol, faollik va
// (ixtiyoriy) yangi parol.
//
// Bloklangan xodimni qaytarish ham shu yerda — ilgari buning imkoni umuman
// yo'q edi: DeleteStaff is_active=false qilardi, orqaga qaytaradigan endpoint
// esa yozilmagan edi.
func (h *StaffHandler) UpdateStaff(c *fiber.Ctx) error {
	businessID := c.Locals("business_id").(string)
	currentUserID := c.Locals("user_id").(string)
	staffID := c.Params("id")
	ctx := context.Background()

	var body struct {
		FullName *string `json:"full_name"`
		Login    *string `json:"login"`
		Role     *string `json:"role"`
		IsActive *bool   `json:"is_active"`
		Password *string `json:"password"`
	}
	if err := c.BodyParser(&body); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "Noto'g'ri so'rov"})
	}

	var currentRole string
	if err := h.DB.QueryRow(ctx,
		`SELECT role FROM users WHERE id=$1 AND business_id=$2`, staffID, businessID).Scan(&currentRole); err != nil {
		return c.Status(404).JSON(fiber.Map{"error": "Xodim topilmadi"})
	}
	// Kafe egasi himoyalangan: uning roli va faolligi interfeys orqali
	// o'zgartirilmaydi (DeleteStaff dagi qoida bilan bir xil).
	if currentRole == "owner" {
		return c.Status(403).JSON(fiber.Map{"error": "Kafe egasining ma'lumotini o'zgartirib bo'lmaydi"})
	}

	// O'zini bloklab qo'yishning oldini olamiz — admin tizimdan chiqib
	// ketib, qaytib kira olmay qolardi.
	if staffID == currentUserID && body.IsActive != nil && !*body.IsActive {
		return c.Status(400).JSON(fiber.Map{"error": "O'zingizni bloklay olmaysiz"})
	}

	sets := []string{}
	args := []any{}
	add := func(expr string, value any) {
		args = append(args, value)
		sets = append(sets, fmt.Sprintf("%s=$%d", expr, len(args)))
	}

	if body.FullName != nil {
		add("full_name", strings.TrimSpace(*body.FullName))
	}
	if body.Login != nil {
		login := strings.TrimSpace(*body.Login)
		if login == "" {
			return c.Status(400).JSON(fiber.Map{"error": "Login bo'sh bo'lishi mumkin emas"})
		}
		add("login", login)
	}
	if body.Role != nil && *body.Role != currentRole {
		if !editableRoles[*body.Role] {
			return c.Status(400).JSON(fiber.Map{"error": "Noto'g'ri rol"})
		}
		// Yangi rol tarif limitiga sig'ishi kerak — masalan barcha kassir
		// o'rinlari band bo'lsa, ofitsiantni kassirga o'tkazib bo'lmaydi.
		if err := h.checkRoleLimit(ctx, businessID, *body.Role, staffID); err != nil {
			return err
		}
		// Admin o'zining boshqaruv huquqini yo'qotib qo'yishi mumkin emas.
		if staffID == currentUserID {
			return c.Status(400).JSON(fiber.Map{"error": "O'z rolingizni o'zgartira olmaysiz"})
		}
		add("role", *body.Role)
	}
	if body.IsActive != nil {
		// Bloklangan xodimni qaytarayotgan bo'lsak, u limitga qayta kiradi.
		if *body.IsActive {
			if err := h.checkRoleLimit(ctx, businessID, currentRole, staffID); err != nil {
				return err
			}
		}
		add("is_active", *body.IsActive)
	}
	if body.Password != nil && *body.Password != "" {
		hash, err := bcrypt.GenerateFromPassword([]byte(*body.Password), bcrypt.DefaultCost)
		if err != nil {
			return c.Status(500).JSON(fiber.Map{"error": "Parolni shifrlashda xatolik"})
		}
		add("password_hash", string(hash))
	}

	if len(sets) == 0 {
		return c.JSON(fiber.Map{"success": true})
	}

	args = append(args, staffID, businessID)
	query := fmt.Sprintf(`UPDATE users SET %s WHERE id=$%d AND business_id=$%d`,
		strings.Join(sets, ", "), len(args)-1, len(args))

	cmd, err := h.DB.Exec(ctx, query, args...)
	if err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "Bu login band bo'lishi mumkin"})
	}
	if cmd.RowsAffected() == 0 {
		return c.Status(404).JSON(fiber.Map{"error": "Xodim topilmadi"})
	}

	// Rol o'zgargan bo'lishi mumkin — keshdagi eski vakolatlar yaroqsiz.
	middleware.InvalidatePermissions(staffID)
	return c.JSON(fiber.Map{"success": true})
}

// DeleteStaff - xodimni bloklaydi (is_active=false). Bazadan o'chirilmaydi,
// chunki eski buyurtmalarda "kim qabul qildi / kim to'lovni oldi" ma'lumoti
// shu foydalanuvchiga bog'langan — hisobot tarixi buzilmasligi kerak.
// Qaytarish uchun UpdateStaff ishlatiladi.
func (h *StaffHandler) DeleteStaff(c *fiber.Ctx) error {
	businessID := c.Locals("business_id").(string)
	currentUserID := c.Locals("user_id").(string)
	staffID := c.Params("id")

	if staffID == currentUserID {
		return c.Status(400).JSON(fiber.Map{"error": "O'zingizni o'chira olmaysiz"})
	}

	cmd, err := h.DB.Exec(context.Background(),
		`UPDATE users SET is_active=false WHERE id=$1 AND business_id=$2 AND role <> 'owner'`,
		staffID, businessID)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}
	if cmd.RowsAffected() == 0 {
		return c.Status(404).JSON(fiber.Map{"error": "Xodim topilmadi (yoki kafe egasini o'chirib bo'lmaydi)"})
	}

	middleware.InvalidatePermissions(staffID)
	return c.JSON(fiber.Map{"success": true})
}

// ---------------------------------------------------------------------------
// Vakolatlar
// ---------------------------------------------------------------------------

// GetStaffPermissions - uchta ro'yxatni qaytaradi:
//
//	defaults  - rol standarti (interfeysda "rol bo'yicha" deb ko'rsatiladi)
//	overrides - shu xodim uchun qo'lda o'rnatilganlari
//	effective - yakuniy holat (defaults ustiga overrides qo'yilgan)
//
// Interfeys uchtasi ham kerak: har bir vakolat "rol standarti / ruxsat
// berilgan / taqiqlangan" uch holatli tugma bilan ko'rsatiladi.
func (h *StaffHandler) GetStaffPermissions(c *fiber.Ctx) error {
	businessID := c.Locals("business_id").(string)
	staffID := c.Params("id")
	ctx := context.Background()

	var role string
	if err := h.DB.QueryRow(ctx,
		`SELECT role FROM users WHERE id=$1 AND business_id=$2`, staffID, businessID).Scan(&role); err != nil {
		return c.Status(404).JSON(fiber.Map{"error": "Xodim topilmadi"})
	}

	rows, err := h.DB.Query(ctx,
		`SELECT permission_key, is_allowed FROM user_permissions WHERE user_id=$1`, staffID)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}
	defer rows.Close()

	overrides := map[string]bool{}
	for rows.Next() {
		var key string
		var allowed bool
		if err := rows.Scan(&key, &allowed); err != nil {
			return c.Status(500).JSON(fiber.Map{"error": err.Error()})
		}
		overrides[key] = allowed
	}

	effective := middleware.RoleDefaults(role)
	for key, allowed := range overrides {
		effective[key] = allowed
	}

	return c.JSON(fiber.Map{
		"role":      role,
		"all":       middleware.AllPermissions,
		"defaults":  middleware.RoleDefaults(role),
		"overrides": overrides,
		"effective": effective,
	})
}

// UpdateStaffPermissions - shaxsiy o'zgartirishlarni **to'liq almashtiradi**.
// Ro'yxatda bo'lmagan kalit o'chiriladi, ya'ni rol standartiga qaytadi.
func (h *StaffHandler) UpdateStaffPermissions(c *fiber.Ctx) error {
	businessID := c.Locals("business_id").(string)
	currentUserID := c.Locals("user_id").(string)
	staffID := c.Params("id")
	ctx := context.Background()

	var body struct {
		Overrides map[string]bool `json:"overrides"`
	}
	if err := c.BodyParser(&body); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "Noto'g'ri so'rov"})
	}

	var role string
	if err := h.DB.QueryRow(ctx,
		`SELECT role FROM users WHERE id=$1 AND business_id=$2`, staffID, businessID).Scan(&role); err != nil {
		return c.Status(404).JSON(fiber.Map{"error": "Xodim topilmadi"})
	}
	if role == "owner" {
		return c.Status(403).JSON(fiber.Map{"error": "Kafe egasining vakolatlarini cheklab bo'lmaydi"})
	}

	valid := map[string]bool{}
	for _, key := range middleware.AllPermissions {
		valid[key] = true
	}
	for key := range body.Overrides {
		if !valid[key] {
			return c.Status(400).JSON(fiber.Map{"error": "Noma'lum vakolat: " + key})
		}
	}

	// Admin o'zidan xodim boshqarish huquqini olib qo'ysa, boshqa hech kim
	// uni qaytara olmasligi mumkin — o'zini tizimdan qulflab qo'yardi.
	if staffID == currentUserID {
		effective := middleware.RoleDefaults(role)
		for key, allowed := range body.Overrides {
			effective[key] = allowed
		}
		if !effective[middleware.PermStaffManage] {
			return c.Status(400).JSON(fiber.Map{
				"error": "O'zingizdan xodimlarni boshqarish vakolatini olib tashlay olmaysiz",
			})
		}
	}

	tx, err := h.DB.Begin(ctx)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}
	defer tx.Rollback(ctx)

	if _, err := tx.Exec(ctx, `DELETE FROM user_permissions WHERE user_id=$1`, staffID); err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}
	for key, allowed := range body.Overrides {
		if _, err := tx.Exec(ctx,
			`INSERT INTO user_permissions (user_id, permission_key, is_allowed) VALUES ($1,$2,$3)`,
			staffID, key, allowed); err != nil {
			return c.Status(500).JSON(fiber.Map{"error": err.Error()})
		}
	}
	if err := tx.Commit(ctx); err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}

	middleware.InvalidatePermissions(staffID)
	return c.JSON(fiber.Map{"success": true})
}
