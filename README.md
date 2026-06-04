# server-ai-monitoring

> 🔍 **AI-powered server monitoring** menggunakan OpenClaw + MCP (Model Context Protocol)

Stack: **Node.js 22** · **TypeScript** · **Docker** · **MCP SDK** · **OpenAI-compatible API**

---

## Arsitektur

```
OpenClaw (AI Agent UI)
    │
    │ MCP Protocol (HTTP)
    ▼
MCP Monitoring Server (Node.js + TypeScript)
    │
    ├── /proc (CPU, Memory, Network, Disk) ← host mount :ro
    ├── /sys                               ← host mount :ro
    ├── /var/log                           ← host mount :ro
    ├── docker.sock                        ← host mount :ro
    ├── PostgreSQL (SELECT only)
    ├── RabbitMQ Management API (GET only)
    └── Cloudflare API (GET only)
```

---

## Quick Start

```bash
# 1. Buat network docker (jika belum ada)
docker network create infra_net

# 2. Clone dan setup
git clone <repo-url> server-ai-monitoring
cd server-ai-monitoring
cp .env.example .env
nano .env

# 3. Jalankan
docker compose up -d

# 4. Verifikasi
curl http://localhost:3000/health
```

---

## Monitoring Tools

| Tool | Sumber Data |
|------|------------|
| `get_cpu_usage` | `/proc/stat`, `/proc/loadavg` |
| `get_memory_usage` | `/proc/meminfo` |
| `get_disk_usage` | `/proc/mounts` |
| `get_network_status` | `/proc/net/dev` |
| `get_docker_containers` | Docker API |
| `get_docker_stats` | Docker API |
| `get_postgres_status` | PostgreSQL (read-only) |
| `get_rabbitmq_status` | RabbitMQ Management API |
| `get_nginx_status` | `/proc` + nginx stub_status |
| `get_cloudflared_status` | Cloudflare API |
| `read_recent_logs` | `/var/log` (allowlist protected) |

---

## Security

- ✅ Semua tool **READ-ONLY** — tidak ada yang dapat memodifikasi sistem
- ✅ Container berjalan sebagai **non-root user**
- ✅ Semua host mount bersifat **`:ro`** (read-only)
- ✅ Flag **`no-new-privileges`** aktif
- ✅ Log reader dilindungi **strict allowlist** (anti path traversal)
- ✅ Docker API hanya digunakan untuk **list & stats**

Lihat [docs/security.md](docs/security.md) untuk penjelasan lengkap.

---

## Dokumentasi

- [Setup & Installation](docs/setup.md)
- [Architecture](docs/architecture.md)
- [Security Guide](docs/security.md)

---

## Structure

```
server-ai-monitoring/
├── docker-compose.yml
├── .env.example
├── docs/
│   ├── architecture.md
│   ├── setup.md
│   └── security.md
├── openclaw/
│   └── config/
│       └── config.toml
└── mcp-monitoring/
    ├── src/
    │   ├── tools/          # 11 monitoring tools
    │   ├── services/       # host-reader
    │   ├── config/         # configuration
    │   ├── types/          # TypeScript interfaces
    │   └── server.ts       # main entry point
    ├── Dockerfile
    ├── package.json
    └── tsconfig.json
```
