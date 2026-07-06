# Dokumentasi Recess

Folder ini berisi dokumen perencanaan & keputusan produk untuk **Recess** — ruang istirahat digital untuk pekerja kantoran ("Discord untuk waktu istirahat kantor").

## Isi

| Dokumen | Deskripsi |
|---|---|
| [roadmap-recess-id.md](roadmap-recess-id.md) | Roadmap pengembangan lengkap menuju peluncuran produksi (Bahasa Indonesia) |
| [roadmap-recess-en.md](roadmap-recess-en.md) | Development roadmap to production launch (English) |

## Ringkasan cepat

- **Positioning:** "Discord untuk waktu istirahat kantor"
- **Pilar inti:** Games · Rooms · Anonymous Chat
- **Tiga milestone rilis:**
  - **A — "It's Alive"** (closed beta): lounge + presence + chat, tanpa game
  - **B — "Play Together"** (public beta): satu game (Connect Four) di dalam room
  - **C — Public Launch:** hardening, moderasi, monitoring
- **Game MVP:** Connect Four (alasan ada di roadmap §3, Fase 3)
- **Backend:** **Supabase** — semua tool di free tier
- **Stack aktual repo:** Next.js 16 · React 19 · Tailwind v4 · Radix (shadcn-style) · Supabase · Vercel

## Prinsip yang menyetir semua keputusan

> Musuh utama bukan fitur yang belum ada, tapi **ruangan kosong (cold-start)**.
> Optimalkan untuk: MVP cepat, effort minimum, validasi nyata. Hindari overengineering.

_Terakhir diperbarui: Juli 2026_
