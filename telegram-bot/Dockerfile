# Telegram bot — mustaqil Go moduli.
# U hech qanday port tinglamaydi (Telegram'dan long polling bilan yangilanish oladi),
# shuning uchun Railway'da "worker" sifatida ishlaydi va unga domen berilmaydi.
FROM golang:1.22-alpine AS builder
WORKDIR /app
COPY go.mod go.sum* ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -o bot .

FROM alpine:latest
# ca-certificates — Telegram API'ga HTTPS orqali ulanish uchun shart
RUN apk --no-cache add ca-certificates tzdata
WORKDIR /root/
COPY --from=builder /app/bot .
CMD ["./bot"]
