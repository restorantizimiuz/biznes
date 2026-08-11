// Package i18n - backend tomonda hosil qilinadigan hujjatlar (hozircha Excel
// hisoboti) uchun kichik tarjima lug'ati.
//
// Nega backendda ham lug'at kerak? Excel fayl serverda yig'iladi va brauzerga
// tayyor holda yuboriladi — frontenddagi tarjimalar u yerga yetib bormaydi.
// Sarlavhalar `businesses.language` qiymatiga qarab tanlanadi.
//
// Tuzilishi frontend-admin/src/i18n/dictionaries.ts bilan bir xil: o'zbekcha
// lug'at etalon, qolganlari to'liq to'ldiriladi. Kalit topilmasa o'zbekcha
// variant, u ham bo'lmasa kalitning o'zi qaytariladi — hisobot hech qachon
// bo'sh sarlavha bilan chiqmaydi.
package i18n

// Language - qo'llab-quvvatlanadigan tillar (businesses.language qiymatlari)
const (
	LangUz = "uz"
	LangRu = "ru"
	LangEn = "en"
)

type dict map[string]string

var uz = dict{
	"report.sheet":     "Hisobot",
	"report.fileName":  "hisobot",
	"report.title":     "Buyurtmalar hisoboti",
	"report.period":    "Davr",
	"report.generated": "Yaratilgan vaqti",

	"col.datetime":      "Sana/Vaqt",
	"col.table":         "Stol",
	"col.orderType":     "Buyurtma turi",
	"col.source":        "Manba",
	"col.status":        "Holat",
	"col.items":         "Tarkibi",
	"col.total":         "Summa",
	"col.discount":      "Chegirma",
	"col.final":         "Yakuniy summa",
	"col.createdBy":     "Kim ochgan",
	"col.paidBy":        "Kim to'lov olgan",
	"col.waiter":        "Ofitsiant",
	"col.paymentMethod": "To'lov turi",
	"col.phone":         "Telefon",
	"col.address":       "Manzil",
	"col.edited":        "Tahrirlangan",

	"source.cashier":         "Kassa",
	"source.qr":              "QR",
	"source.online_telegram": "Telegram",
	"source.waiter":          "Ofitsiant",

	"status.new":       "Yangi",
	"status.activated": "Qabul qilingan",
	"status.paid":      "To'langan",
	"status.cancelled": "Bekor qilingan",

	"type.dine_in":  "Stolga",
	"type.delivery": "Yetkazib berish",
	"type.pickup":   "Olib ketish",

	"method.cash":     "Naqd",
	"method.card":     "Karta",
	"method.transfer": "O'tkazma",

	"value.online": "Online",
	"value.yes":    "Ha",
	"value.no":     "",
}

var ru = dict{
	"report.sheet":     "Отчёт",
	"report.fileName":  "otchet",
	"report.title":     "Отчёт по заказам",
	"report.period":    "Период",
	"report.generated": "Дата формирования",

	"col.datetime":      "Дата/Время",
	"col.table":         "Стол",
	"col.orderType":     "Тип заказа",
	"col.source":        "Источник",
	"col.status":        "Статус",
	"col.items":         "Состав",
	"col.total":         "Сумма",
	"col.discount":      "Скидка",
	"col.final":         "Итоговая сумма",
	"col.createdBy":     "Кто открыл",
	"col.paidBy":        "Кто принял оплату",
	"col.waiter":        "Официант",
	"col.paymentMethod": "Способ оплаты",
	"col.phone":         "Телефон",
	"col.address":       "Адрес",
	"col.edited":        "Изменён",

	"source.cashier":         "Касса",
	"source.qr":              "QR",
	"source.online_telegram": "Telegram",
	"source.waiter":          "Официант",

	"status.new":       "Новый",
	"status.activated": "Принят",
	"status.paid":      "Оплачен",
	"status.cancelled": "Отменён",

	"type.dine_in":  "За столом",
	"type.delivery": "Доставка",
	"type.pickup":   "Самовывоз",

	"method.cash":     "Наличные",
	"method.card":     "Карта",
	"method.transfer": "Перевод",

	"value.online": "Онлайн",
	"value.yes":    "Да",
	"value.no":     "",
}

var en = dict{
	"report.sheet":     "Report",
	"report.fileName":  "report",
	"report.title":     "Orders report",
	"report.period":    "Period",
	"report.generated": "Generated at",

	"col.datetime":      "Date/Time",
	"col.table":         "Table",
	"col.orderType":     "Order type",
	"col.source":        "Source",
	"col.status":        "Status",
	"col.items":         "Items",
	"col.total":         "Amount",
	"col.discount":      "Discount",
	"col.final":         "Final amount",
	"col.createdBy":     "Opened by",
	"col.paidBy":        "Payment taken by",
	"col.waiter":        "Waiter",
	"col.paymentMethod": "Payment method",
	"col.phone":         "Phone",
	"col.address":       "Address",
	"col.edited":        "Edited",

	"source.cashier":         "Register",
	"source.qr":              "QR",
	"source.online_telegram": "Telegram",
	"source.waiter":          "Waiter",

	"status.new":       "New",
	"status.activated": "Accepted",
	"status.paid":      "Paid",
	"status.cancelled": "Cancelled",

	"type.dine_in":  "Dine in",
	"type.delivery": "Delivery",
	"type.pickup":   "Pickup",

	"method.cash":     "Cash",
	"method.card":     "Card",
	"method.transfer": "Transfer",

	"value.online": "Online",
	"value.yes":    "Yes",
	"value.no":     "",
}

var dictionaries = map[string]dict{LangUz: uz, LangRu: ru, LangEn: en}

// T - tarjima. Noma'lum til yoki kalit bo'lsa ham hech qachon bo'sh qaytmaydi.
func T(lang, key string) string {
	if d, ok := dictionaries[lang]; ok {
		if v, ok := d[key]; ok {
			return v
		}
	}
	if v, ok := uz[key]; ok {
		return v
	}
	return key
}

// Normalize - bazadan kelgan til qiymatini qo'llab-quvvatlanadigan tilga keltiradi.
func Normalize(lang string) string {
	if _, ok := dictionaries[lang]; ok {
		return lang
	}
	return LangUz
}
