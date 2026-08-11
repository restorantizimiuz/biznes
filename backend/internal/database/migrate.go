package database

import (
	"context"
	"fmt"
	"log"
	"sort"
	"strings"

	"cafesystem/backend/migrations"

	"github.com/jackc/pgx/v5/pgxpool"
)

// Migratsiya fayllari binarga qo'shib qo'yilgan (migrations paketi, go:embed).
//
// Nega? Lokal mashinada ular `psql -f` bilan qo'lda qo'llanardi, lekin bulutda
// (Railway) bazaga qo'lda ulanib bo'lmaydi va konteyner ichida `migrations/`
// papkasi ham bo'lmaydi — Dockerfile faqat tayyor binarni ko'chiradi.
// Embed qilinganda migratsiyalar binarning bir qismi bo'ladi va server ishga
// tushganda o'zi qo'llaydi. Shu bilan "deploy qildim, lekin jadval yo'q"
// muammosi butunlay yo'qoladi.
var migrationFiles = migrations.Files

// seedMigration - namunaviy (demo) ma'lumotlar. U faqat SEED_DEMO=true
// bo'lganda qo'llanadi: ishlab chiqarish bazasiga "Demo Cafe" va uning
// `demo1234` parolli hisobini tushirib qo'yish xavfli bo'lardi.
const seedMigration = "002_seed_demo.sql"

// baselineTable - migratsiyalar allaqachon qo'lda qo'llangan bazani aniqlash
// uchun tayanch jadval. U bor, lekin schema_migrations yo'q bo'lsa — bu eski
// (qo'lda tayyorlangan) baza demak.
const baselineTable = "businesses"

// RunMigrations - qo'llanmagan migratsiyalarni tartib bilan bajaradi.
//
// Har bir migratsiya **alohida tranzaksiyada** ishlaydi: biri xato bersa,
// undan oldingilari saqlanib qoladi va xatoning qayerdaligi aniq bo'ladi.
func RunMigrations(ctx context.Context, db *pgxpool.Pool, seedDemo bool) error {
	if _, err := db.Exec(ctx, `
		CREATE TABLE IF NOT EXISTS schema_migrations (
			version    TEXT PRIMARY KEY,
			applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
		)`); err != nil {
		return fmt.Errorf("schema_migrations jadvalini yaratib bo'lmadi: %w", err)
	}

	versions, err := listMigrations()
	if err != nil {
		return err
	}

	applied, err := appliedVersions(ctx, db)
	if err != nil {
		return err
	}

	// Eski, qo'lda tayyorlangan bazani "belgilab" qo'yamiz: jadvallar bor,
	// lekin hisob yuritilmagan. Ularni qayta bajarish "already exists"
	// xatosini berardi, shuning uchun faqat bajarilgan deb yoziladi.
	if len(applied) == 0 {
		exists, err := tableExists(ctx, db, baselineTable)
		if err != nil {
			return err
		}
		if exists {
			log.Printf("migratsiya: mavjud baza aniqlandi — %d ta migratsiya bajarilgan deb belgilanmoqda", len(versions))
			for _, version := range versions {
				if err := markApplied(ctx, db, version); err != nil {
					return err
				}
				applied[version] = true
			}
			return nil
		}
	}

	pending := 0
	for _, version := range versions {
		if applied[version] {
			continue
		}
		if version == seedMigration && !seedDemo {
			log.Printf("migratsiya: %s o'tkazib yuborildi (namunaviy ma'lumot — yoqish uchun SEED_DEMO=true)", version)
			continue
		}

		body, err := migrationFiles.ReadFile(version)
		if err != nil {
			return fmt.Errorf("%s ni o'qib bo'lmadi: %w", version, err)
		}

		if err := applyOne(ctx, db, version, string(body)); err != nil {
			return err
		}
		log.Printf("migratsiya: %s qo'llandi", version)
		pending++
	}

	if pending == 0 {
		log.Println("migratsiya: baza dolzarb, yangi migratsiya yo'q")
	}
	return nil
}

func applyOne(ctx context.Context, db *pgxpool.Pool, version, body string) error {
	tx, err := db.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	if _, err := tx.Exec(ctx, body); err != nil {
		return fmt.Errorf("%s migratsiyasida xatolik: %w", version, err)
	}
	if _, err := tx.Exec(ctx,
		`INSERT INTO schema_migrations (version) VALUES ($1)`, version); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

func markApplied(ctx context.Context, db *pgxpool.Pool, version string) error {
	_, err := db.Exec(ctx,
		`INSERT INTO schema_migrations (version) VALUES ($1) ON CONFLICT DO NOTHING`, version)
	return err
}

// listMigrations - fayl nomlari bo'yicha tartiblangan ro'yxat.
// Nomlar raqam bilan boshlangani uchun oddiy alifbo tartibi to'g'ri ketma-ketlikni beradi.
func listMigrations() ([]string, error) {
	entries, err := migrationFiles.ReadDir(".")
	if err != nil {
		return nil, fmt.Errorf("migratsiyalar ro'yxatini olib bo'lmadi: %w", err)
	}
	var versions []string
	for _, e := range entries {
		if !e.IsDir() && strings.HasSuffix(e.Name(), ".sql") {
			versions = append(versions, e.Name())
		}
	}
	sort.Strings(versions)
	return versions, nil
}

func appliedVersions(ctx context.Context, db *pgxpool.Pool) (map[string]bool, error) {
	rows, err := db.Query(ctx, `SELECT version FROM schema_migrations`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	applied := map[string]bool{}
	for rows.Next() {
		var version string
		if err := rows.Scan(&version); err != nil {
			return nil, err
		}
		applied[version] = true
	}
	return applied, rows.Err()
}

func tableExists(ctx context.Context, db *pgxpool.Pool, name string) (bool, error) {
	var exists bool
	err := db.QueryRow(ctx,
		`SELECT EXISTS (SELECT 1 FROM information_schema.tables
		                 WHERE table_schema='public' AND table_name=$1)`, name).Scan(&exists)
	return exists, err
}
