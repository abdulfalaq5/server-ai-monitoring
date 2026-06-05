# OpenClaw Discord Bot Integration

Layanan Discord Bot khusus (**Node.js 22 + TypeScript + discord.js**) yang menghubungkan server Discord Anda secara aman dengan **OpenClaw** dan **MCP Monitoring Server**.

Bot ini berfungsi untuk:
1. **Interactive AI Monitoring**: Memungkinkan multi-user berkirim pesan langsung secara natural dengan OpenClaw (via DM bot atau mention di channel `#ai-monitoring`).
2. **Discord Slash Commands**: Menjalankan perintah deterministik instan (seperti `/cpu`, `/postgres`, dll.).
3. **Proactive Alerting**: Mengawasi metrik host & docker dan mengirimkan alert secara realtime ke channel `#server-alerts` jika terjadi anomali (CPU > 90%, RAM > 90%, postgres mati, tunnel diskonek, dll.) lengkap dengan pemulihan otomatis (recovery notification) dan deduplikasi alert (cooldown 15 menit).

---

## 🏗️ Arsitektur Aliran Data

```
Discord App (User/Channel)
       │
       ▼ (DMs / Slash Commands)
Dedicated Discord Bot (Port 3000 / Internal Container)
       │
       ▼ (x-openclaw-session-key Header & API Token)
OpenClaw HTTP API (Port 9001 / Gateway)
       │
       ▼ (Streamable HTTP Transport)
MCP Monitoring Server (Port 9000)
       │
       ▼ (Read Only Query)
Infrastruktur Host & Docker (Sockets, /proc, API)
```

---

## 📂 Struktur Direktori

Proyek Discord Bot ini memiliki struktur berkas terorganisir berikut:
```
discord-bot/
├── Dockerfile              # Multi-stage build (builder compile TS -> runner JS)
├── package.json            # Daftar dependensi (discord.js, axios, dotenv)
├── tsconfig.json           # Konfigurasi transpiler TypeScript (NodeNext / ESM)
├── README.md               # Dokumentasi panduan setup dan panduan bot
└── src/
    ├── index.ts            # Entrypoint bot (discord gateway, command deployment)
    ├── config.ts           # Loader & validator environment variables dari .env
    ├── commands/
    │   └── slash.ts        # Builders & handler eksekusi slash commands
    ├── services/
    │   ├── alert.ts        # Loop deteksi ambang batas (interval 5m) & deduplikasi
    │   ├── openclaw.ts     # Client handler untuk gateway OpenClaw API
    │   └── storage.ts      # Helper read/write JSON storage state
    └── types/
        └── index.ts        # Kontrak antarmuka data TypeScript
```

---

## ⚙️ Environment Variables (`.env`)

Konfigurasi Discord Bot dibaca melalui berkas `.env` utama di root project:

```env
# --- DISCORD BOT ---
DISCORD_ENABLED=true
DISCORD_BOT_TOKEN=your-discord-bot-token-here
DISCORD_ALERT_CHANNEL_ID=1381234567890123456

# --- USER PRIVILEGES ---
# Comma-separated Discord User IDs yang ditunjuk sebagai Admin
DISCORD_ADMIN_USERS=123456789012345678,987654321098765432

# Whitelist Email yang diperbolehkan login ke mcp-monitoring
EMAIL_WHITELIST=falaq@example.com,user@example.com

# --- OPENCLAW CONFIGURATION ---
OPENCLAW_PORT=9001
OPENCLAW_GATEWAY_TOKEN=your-openclaw-gateway-token-here
```

*Catatan: Jika whitelist user chat di bot dinonaktifkan (karena `DISCORD_ALLOWED_USERS` dihapus), siapapun dapat mengirim pesan ke bot secara default. Namun, mereka tetap **wajib** melakukan login email yang valid terlebih dahulu untuk menghubungkan ke MCP.*

---

## 🚀 Panduan Deployment Produksi

### Langkah 1: Persiapan Bot di Discord Developer Portal
1. Buka [Discord Developer Portal](https://discord.com/developers/applications).
2. Buat aplikasi baru (klik **New Application**).
3. Buka menu **Bot** di sidebar kiri:
   - Salin **Token** dan tempel di `.env` pada field `DISCORD_BOT_TOKEN`.
   - Aktifkan **Privileged Gateway Intents**:
     - **Guild Members Intent** (ON)
     - **Message Content Intent** (ON)
4. Buka menu **OAuth2 -> URL Generator**:
   - Pilih scopes: `bot`, `applications.commands`.
   - Pilih bot permissions: `Send Messages`, `Embed Links`, `Use Application Commands`.
   - Salin link yang digenerate di bagian bawah, buka di browser, dan undang bot ke server Discord Anda.

### Langkah 2: Buat Saluran (Channels) & Peran (Roles)
Pastikan server Discord Anda memiliki saluran dan peran berikut:
* **Channels**:
  - `#server-alerts` (Saluran khusus untuk notifikasi alert system). Salin ID channel ini dan isi ke `DISCORD_ALERT_CHANNEL_ID` di `.env`.
  - `#ai-monitoring` (Saluran interaktif untuk chat bebas dengan AI).
* **Roles**:
  - `Infra Admin` - Memberikan akses penuh ke perintah bot, termasuk `/logs` (log server).
  - `Infra Engineer` - Memberikan akses monitoring standar.
  - `Viewer` - Memberikan akses monitoring read-only.

### Langkah 3: Deploy via Docker Compose
Jalankan perintah ini di root direktori untuk membangun dan menjalankan bot bersama OpenClaw:
```bash
# Build image dan deploy container di latar belakang
docker compose up -d --build

# Verifikasi status container berjalan
docker compose ps
```

### Langkah 4: Hubungkan Email Anda (Login Pertama)
1. Setelah bot aktif, buka channel `#ai-monitoring` atau lakukan DM ke bot.
2. Hubungkan akun Discord Anda ke email whitelist dengan perintah slash:
   ```
   /login email@example.com
   ```
3. Bot akan memverifikasi email tersebut di `EMAIL_WHITELIST`. Jika cocok, mapping disimpan secara permanen di `/app/storage/discord/users.json`.
4. Anda sekarang dapat mengetik apa saja ke AI (seperti "Bagaimana kondisi CPU server saat ini?") atau menggunakan slash command monitoring lainnya!

---

## ⚡ Slash Commands Guide

| Perintah | Deskripsi | Hak Akses |
|----------|-----------|-----------|
| `/help` | Menampilkan bantuan penggunaan bot dan daftar commands. | Publik |
| `/login <email>` | Menghubungkan akun Discord Anda ke email whitelist. | Publik |
| `/status` | Periksa kesehatan menyeluruh host & docker. | Terdaftar |
| `/cpu` | Periksa rata-rata load average & core CPU. | Terdaftar |
| `/memory` | Periksa penggunaan memori RAM & swap. | Terdaftar |
| `/disk` | Periksa sisa kapasitas harddisk pada host. | Terdaftar |
| `/docker` | Tampilkan container docker beserta status kesehatannya. | Terdaftar |
| `/postgres` | Cek konektivitas PostgreSQL prod. | Terdaftar |
| `/rabbitmq` | Cek status antrean RabbitMQ cluster. | Terdaftar |
| `/cloudflare` | Periksa koneksi tunnel Cloudflare (cfd_tunnel). | Terdaftar |
| `/logs <logfile> [lines] [filter]` | Membaca baris log terakhir pada server secara realtime. | **Admin Only** |

---

## 🚨 Alerting Conditions & Deduplication

Bot mengevaluasi metrik host setiap **5 menit**.

### 1. Kondisi Alert
* **CPU Load**: Penggunaan CPU > 90% selama **2 check berturut-turut** (setara 5 menit).
* **Memory Load**: Penggunaan memori RAM > 90%.
* **Disk Space**: Sisa kapasitas disk terpakai > 90%.
* **PostgreSQL**: Status connection `ERROR`.
* **RabbitMQ**: Status API `ERROR`.
* **Cloudflare Tunnel**: Status tunnel cfd `ERROR`.
* **Docker**: Ditemukan container dengan status `unhealthy` (Count > 0).
* **Nginx**: Proses nginx terhenti / tidak ditemukan di `/proc`.

### 2. Mekanisme Anti-Spam (Deduplication Cooldown)
* Apabila alert dipicu, bot akan memposting Embed merah ke `#server-alerts`.
* Jika masalah menetap pada interval berikutnya (5m, 10m), bot **tidak akan** mengirim alert baru.
* Alert yang sama hanya akan dikirim ulang jika gangguan berlangsung lebih dari **15 menit** sejak notifikasi terakhir.
* Ketika kondisi kembali normal, alert dihapus dari state file (`/app/storage/alerts/alert-state.json`) dan bot mengirimkan Embed hijau pemulihan (**RECOVERED**).
