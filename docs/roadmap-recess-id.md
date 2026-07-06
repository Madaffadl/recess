# Recess — Roadmap Pengembangan Menuju Peluncuran Produksi

> **Musuhmu bukan fitur yang belum ada. Musuhmu adalah ruangan kosong.**
> "Ruang istirahat digital" yang kamu masuki sendirian sudah mati sejak awal. Roadmap ini mengoptimalkan satu hal di atas segalanya: **mencapai kondisi "terasa hidup/ramai" secepat dan semurah mungkin, lalu mengumpulkan manusia nyata di tempat yang sama pada waktu yang sama.** Fitur nomor dua; kehadiran (presence) nomor satu.

Tiga milestone rilis (bukan enam); keenam fase memberi makan ketiganya:

| Milestone | Setelah Fase | Yang dirilis | Hipotesis yang divalidasi |
|---|---|---|---|
| **A — "It's Alive"** (closed beta) | 2 | Anonymous lounge + presence + room chat, **tanpa game** | Apakah pekerja kantoran mau muncul saat istirahat dan mengobrol? |
| **B — "Play Together"** (public beta) | 4 | Satu game (Connect Four) di dalam room | Apakah aktivitas bersama menghasilkan kunjungan berulang? |
| **C — Public Launch** | 6 | Sudah di-hardening, dimoderasi, dimonitor | Bisakah ia bertahan menghadapi orang asing dan skala? |

Kamu sudah bisa mulai belajar di **Milestone A dalam ~6–8 minggu** tanpa satu game pun dibangun.

Catatan stack: repo saat ini sudah memakai **Next.js 16 + React 19 + Tailwind v4 + Radix (komponen gaya shadcn)**, bukan Next 15. Pertahankan.

---

## 1. Visi Produk

**Jangka pendek:** Cara tercepat & paling tanpa hambatan bagi rekan kerja untuk beristirahat *bersama* — buka satu tab, dalam 10 detik sudah mengobrol atau bermain dengan seseorang. Tanpa unduh, tanpa daftar akun, tanpa undangan meeting.

**Jangka panjang:** Recess menjadi **lapisan sosial ambient sepanjang hari kerja** — padanan digital dari ruang istirahat, koridor, dan pojok permainan kantor. Titik masuk B2C-viral (satu karyawan menjatuhkan link room di Slack), tapi bisnis tahan lama = **paket B2B untuk tim/culture**. "Discord untuk waktu istirahat kantor" adalah pancingannya; **"alat culture yang benar-benar diadopsi tim People karena karyawannya sudah memakainya"** adalah moat-nya.

**Recess BUKAN:** alat produktivitas, pesaing Slack/Teams, media sosial dengan profil/feed, atau platform game lengkap. Ia adalah *downtime yang dibuat sosial.*

---

## 2. Definisi MVP

MVP = hal terkecil yang menguji **"rekan kerja akan kembali ke ruang istirahat bersama."**

### ✅ Termasuk
- **Identitas anonim** — handle + avatar acak, disimpan per-browser via session anonim Supabase. Tanpa email/password/profil.
- **Global Anonymous Lounge** — chat realtime, jumlah online live, presence, typing indicator.
- **Rooms** — buat, gabung (via link/kode), keluar; daftar publik + privat (via kode); kapasitas; presence + chat per-room.
- **Satu game — Connect Four** — 2 pemain, server-authoritative, dimainkan di dalam room.
- **Halaman Discover** — jelajahi game; hanya Connect Four bisa dimainkan, sisanya "Coming soon".
- **Moderasi ramping** — rate limit, blocklist kata kasar, slow mode, tombol report, kill-switch admin.
- **Instrumentasi** — PostHog, Sentry, Vercel, Better Stack.

### ❌ Di luar scope (jangan dibangun untuk MVP)
Akun/login/identitas lintas-device · profil pengguna · banyak game / game framework · workspace perusahaan · SSO · voice/video · teman/DM/follow · gamifikasi (XP/level/leaderboard/achievement) · notifikasi · aplikasi mobile · pembayaran/premium · riwayat chat persisten & pencarian · moderasi AI · i18n · light theme.

**Aturan praktis:** kalau sebuah fitur tidak membantu orang *muncul*, *merasa ada orang lain*, atau *kembali besok* — itu bukan MVP.

---

## 3. Fase Pengembangan

**Asumsi velocity:** sprint 2 mingguan; kapasitas build ≈ **20 story points/sprint**, naik ke **~24** setelah Game Dev bergabung (Fase 3).
**Critical path:** Fase 1 tumpang tindih dengan Fase 2; Fase 5 (instrumentasi) ditarik lebih awal & berjalan terus.

### Fase 1 — Fondasi Frontend & Design System
- **Tujuan:** Ubah "UI hampir jadi" jadi frontend siap-produksi, siap-data, dengan design system formal + sambungan data bersih.
- **Deliverables:** Semua layar selesai & bisa dinavigasi; token/komponen terdokumentasi; **data-access layer** bertipe (`lib/api`) yang hari ini mock, besok Supabase; state loading/empty/error; lolos responsive + a11y.
- **Dependensi:** Tidak ada.
- **Effort:** ~2 sprint.
- **Risiko:** Gold-plating desain; komponen tak terpakai. **Mitigasi:** kunci scope ke halaman yang ada.
- **Kriteria sukses:** Menukar mock→real hanya mengubah `lib/api`.

### Fase 2 — Infrastruktur Realtime ("It's Alive") → **Milestone A**
- **Tujuan:** Membuat Recess terasa berpenghuni.
- **Deliverables:** Bootstrap session anonim; channel lounge global (presence + online count + chat broadcast + typing); channel chat per-room; reconnect/backoff; **pesan ephemeral** (Broadcast) + buffer pesan terbaru.
- **Dependensi:** Data layer Fase 1; project Supabase.
- **Effort:** ~2 sprint.
- **Risiko:** Biaya persist pesan; hotspot channel global. **Mitigasi:** ephemeral-first (§6), rate limit hari pertama.
- **Kriteria sukses:** 20 tester bersamaan → presence akurat, kirim < 500ms, typing jalan, reconnect mulus. **Rilis closed beta ke 1–3 tim.**

### Fase 3 — Satu Game: Connect Four
- **Tujuan:** Validasi bahwa *aktivitas* bersama mendorong engagement, dengan effort minimal.
- **Deliverables:** Connect Four server-authoritative (match dalam room, giliran bergantian, validasi move + deteksi menang/seri di server, rematch); mode penonton; state di Postgres, disebar via realtime.
- **Dependensi:** Realtime Fase 2; **Game Dev bergabung.**
- **Effort:** ~1,5–2 sprint.
- **Risiko:** Scope-creep jadi "platform game"; desync. **Mitigasi:** hardcode 1 game, server otoritas.
- **Kriteria sukses:** Dua orang asing menyelesaikan game tanpa desync/cheat; rematch rate terukur.

**→ Kenapa Connect Four (analisis):**

| Kandidat | Effort | Fun/retensi | Anti-cheat | Putusan |
|---|---|---|---|---|
| Tic-Tac-Toe | Sepele | **Terlalu rendah** — sering seri, bosan cepat | Sepele | ❌ Menghasilkan **false negative** retensi |
| **Connect Four** | Sepele–Rendah | Bagus — belajar nol, cukup dalam, memancing obrolan | Sepele (state 7×6, dicek server) | ✅ **Rekomendasi** |
| Word Guess | Sedang | Bagus, ramah grup | Sedang | ⚠️ Fast-follow |
| Draw Together | **Tinggi** | **Tertinggi/paling viral** | Sulit + moderasi gambar | ⚠️ Game kedua |

**Rekomendasi: Connect Four** — semurah TTT untuk dibangun tapi cukup dalam untuk dimainkan ulang (jadi benar-benar menguji retensi, bukan meracuninya). Turn-based = tanpa engine latensi/fisika (pas untuk Supabase Realtime), state mungil = validasi server & anti-cheat sepele.

### Fase 4 — Sistem Room (+ Integrasi Game) → **Milestone B**
- **Tujuan:** Room jadi wadah sosial; game hidup di dalamnya.
- **Deliverables:** Buat/gabung/keluar; direktori publik (hitungan live); privat via kode tak-tertebak; **link undangan yang bisa dibagikan** (unit viral); kontrol host (start/kick); kapasitas + auto-expire idle.
- **Dependensi:** Fase 2 & 3.
- **Effort:** ~2 sprint.
- **Risiko:** Race state room; room yatim. **Mitigasi:** constraint DB + job `expires_at`.
- **Kriteria sukses:** Buat room → share link Slack → rekan gabung & main < 60 dtk. **Rilis public beta.**

### Fase 5 — Instrumentasi Beta (dijalankan terus sejak Fase 2)
- **Tujuan:** Mengubah pemakaian jadi pembelajaran.
- **Deliverables:** PostHog (funnel, retensi D1/D7, session replay), Sentry, Vercel Speed Insights, widget feedback + survei, uptime check.
- **Effort:** ~1 sprint kerja baru (tersebar lebih awal).
- **Risiko:** Buta arah bila ditunda; PII di replay. **Mitigasi:** integrasi awal; mask input.
- **Kriteria sukses:** Bisa menjawab "apakah pengguna kembali besok?" dengan data.

### Fase 6 — Hardening Produksi → **Milestone C**
- **Tujuan:** Bertahan menghadapi orang asing, penyalahgunaan, beban.
- **Deliverables:** Rate limiting (session+IP); Turnstile pada pembuatan session/room; filter kata kasar + slow mode; ambang report→auto-mute; dashboard mod minimal + kill-switch/shadow-ban; audit RLS; alerting/on-call; staging + rollback; ToS/Privacy; load test.
- **Dependensi:** Semua fase.
- **Effort:** ~2 sprint.
- **Risiko:** Penyalahgunaan merusak kesan pertama; banjir koneksi. **Mitigasi:** §7.
- **Kriteria sukses:** Lolos red-team + load test; waktu memute pelaku < 1 menit.

---

## 4. Perencanaan Sprint

Prioritas: **P0** pemblokir milestone · **P1** penting · **P2** nice-to-have (potong duluan). Poin = Fibonacci.

### Fase 1
**Sprint 1 — Sambungan data & penyelesaian layar** *(≈20 pts)*
| Task | Pri | Pts |
|---|---|---|
| Interface `lib/api` bertipe (rooms, messages, session, game) → mock | P0 | 5 |
| Room detail + create-room + state empty/loading/error | P0 | 5 |
| Ekstrak komponen reusable (ChatBubble, RoomCard, PresenceBadge) | P1 | 3 |
| Lolos responsive + a11y | P1 | 5 |
| Audit route/navigasi | P0 | 2 |

**Sprint 2 — Design system + fondasi Supabase** *(≈20 pts)*
| Task | Pri | Pts |
|---|---|---|
| Dokumentasi token/komponen | P1 | 5 |
| Provision Supabase + env + CI + preview Vercel | P0 | 3 |
| Bootstrap session anonim (auth anon + handle/avatar) | P0 | 5 |
| Migrasi schema v1 + kerangka RLS | P0 | 5 |
| SDK PostHog/Sentry terpasang | P1 | 2 |

### Fase 2 → Milestone A
**Sprint 3 — Realtime lounge** *(≈20 pts)*
| Task | Pri | Pts |
|---|---|---|
| Channel presence lounge + online count akurat | P0 | 5 |
| Chat Broadcast + buffer pesan terbaru | P0 | 8 |
| Typing indicator via presence | P0 | 3 |
| Reconnect/backoff + optimistic send | P0 | 5 |

**Sprint 4 — Room chat + persiapan beta** *(≈18 pts)*
| Task | Pri | Pts |
|---|---|---|
| Channel chat + presence per-room | P0 | 5 |
| Rate limiting dasar (klien+server) | P0 | 5 |
| Event PostHog inti | P0 | 3 |
| Onboarding closed-beta + prompt "recess jam 3" | P1 | 3 |
| Widget feedback | P1 | 2 |

### Fase 3 (Game Dev bergabung, velocity ≈24)
**Sprint 5 — Inti Connect Four** *(≈21 pts)*
| Task | Pri | Pts |
|---|---|---|
| Model state + validasi move server (RPC/Edge Fn) | P0 | 8 |
| Penyebaran state via realtime | P0 | 5 |
| UI papan + giliran/timer + deteksi menang/seri | P0 | 5 |
| Instrumentasi funnel game | P1 | 3 |

**Sprint 6 — Poles & penonton** *(≈18 pts)*
| Task | Pri | Pts |
|---|---|---|
| Rematch + game-over + penanganan disconnect | P0 | 8 |
| Mode penonton | P2 | 5 |
| Review anti-cheat | P0 | 3 |
| Playtest + tuning | P1 | 2 |

### Fase 4 → Milestone B
**Sprint 7 — Siklus hidup room** *(≈22 pts)*
| Task | Pri | Pts |
|---|---|---|
| Buat/gabung/keluar + kapasitas + join aman-race | P0 | 8 |
| Direktori publik + hitungan live | P0 | 5 |
| Room privat + kode tak-tertebak | P0 | 5 |
| Job auto-expiry room idle | P1 | 3 |

**Sprint 8 — Undangan + game-di-room** *(≈20 pts)*
| Task | Pri | Pts |
|---|---|---|
| Link undangan + flow join-by-link | P0 | 8 |
| Jalankan Connect Four dari room; host start | P0 | 5 |
| Kontrol host (kick) | P1 | 3 |
| Poles public-beta + copy share-to-Slack | P1 | 4 |

### Fase 5
**Sprint 9 — Menutup loop** *(≈16 pts)*
| Task | Pri | Pts |
|---|---|---|
| Dashboard retensi (D1/D7) + funnel + replay (mask) | P0 | 5 |
| Sentry performance tracing | P0 | 3 |
| Survei in-app | P1 | 3 |
| Vercel Speed Insights + alert Supabase | P1 | 2 |
| Ritual review pembelajaran mingguan (PO) | P0 | 3 |

### Fase 6 → Milestone C
**Sprint 10 — Penyalahgunaan & moderasi** *(≈22 pts)*
| Task | Pri | Pts |
|---|---|---|
| Turnstile + rate limit IP+session | P0 | 8 |
| Blocklist + slow mode + batas pesan | P0 | 5 |
| Report→auto-mute; shadow-ban | P0 | 5 |
| Dashboard mod minimal + kill-switch | P0 | 4 |

**Sprint 11 — Kesiapan peluncuran** *(≈20 pts)*
| Task | Pri | Pts |
|---|---|---|
| Audit RLS + pen-test + higiene secret | P0 | 5 |
| Load test + perbaiki hotspot | P0 | 8 |
| Staging + rollback + alerting on-call | P0 | 5 |
| ToS/Privacy + kontak penyalahgunaan | P0 | 2 |

**Kalender:** ~11 sprint ≈ 22 minggu skenario terburuk. Optimalkan untuk **milestone, bukan kalender** — closed beta (~minggu 8) adalah titik pembelajaran nyata.

---

## 5. Perencanaan Database

**Prinsip:** persist sesedikit mungkin. **Presence & chat lounge ephemeral** (memori Realtime, bukan Postgres). Postgres hanya menyimpan yang butuh durabilitas/otoritas.

| Entitas | Field kunci | Catatan |
|---|---|---|
| **profile** (anon) | `id`(=auth.uid), `handle`, `avatar_seed`, `created_at`, `last_seen_at` | User anonim Supabase. |
| **room** | `id`, `code`(unik), `name`, `game_type`, `visibility`, `host_id→profile`, `capacity`, `status`, `created_at`, `expires_at` | Direktori: `visibility='public' AND status<>'closed'`. |
| **room_member** | `room_id→room`, `profile_id→profile`, `role`, `joined_at` | *Opsional* — mulai Presence-only; tambah bila butuh roster durabel. |
| **game_session** | `id`, `room_id→room`, `game_type`, `state`(jsonb), `status`, `winner_id→profile`, `started_at`, `ended_at` | **Sumber kebenaran** game. |
| **game_move** | `id`, `game_session_id→game_session`, `profile_id→profile`, `ply`, `move`(jsonb), `created_at` | Opsional; audit/anti-cheat/replay. |
| **report** | `id`, `target_type`, `target_ref`, `reporter_id→profile`, `reason`, `created_at`, `status` | Moderasi. |
| **feedback** | `id`, `profile_id→profile`, `rating`, `message`, `context`(jsonb), `created_at` | Melengkapi survei PostHog. |
| **moderation_action** | `id`, `actor`, `profile_id`, `action`, `until`, `reason`, `created_at` | Diberlakukan saat write + realtime. |

**Relasi:** `profile 1—* room` (host); `profile 1—* game_session` (winner); `room 1—* game_session`; `game_session 1—* game_move`; `profile 1—* report/feedback/moderation_action`.

**BUKAN tabel:** presence, online count, typing (Realtime Presence); chat lounge (Broadcast); event analytics (PostHog).

**RLS:** default-deny semua tabel. Write game hanya via RPC `SECURITY DEFINER` yang memvalidasi move di server (klien tak bisa menulis `game_session.state` langsung).

---

## 6. Arsitektur Realtime

| Kebutuhan | Mekanisme | Keputusan & alasan |
|---|---|---|
| **Presence** (online count, siapa di room, typing) | **Realtime Presence** | Ephemeral, auto-clean saat disconnect. Jangan modelkan di Postgres. |
| **Chat** (lounge + room) | **Broadcast** | Ephemeral, latensi rendah, **tak menyentuh DB**. Ring buffer kecil untuk pesan terbaru. Lebih murah + liabilitas moderasi lebih kecil. |
| **State game** | **Postgres (otoritatif) + Postgres Changes** | Satu-satunya yang wajib benar & anti-cheat. Move → RPC/Edge Fn validasi → tulis state → subscriber terima update. Klien render hanya dari state server. |

**Sinkronisasi room:** 1 channel/room untuk presence+chat; update game via Postgres Changes untuk `game_session`. Aksi host = RPC.

**Skalabilitas:**
- **Broadcast > Postgres Changes** untuk chat/frekuensi tinggi.
- **Lounge global = hotspot**; MVP 1 channel cukup, rencanakan **sharding** ("Lounge #1/#2") saat ramai (sekaligus lebih hangat sosialnya).
- **Rate-limit di edge** sebelum mencapai Realtime.
- **Batasi koneksi bersamaan** per plan Supabase; desain ephemeral-first menjaga beban DB datar.
- **Reconnect idempoten:** sinkronkan ulang state game dari Postgres; jangan percaya cache klien.

---

## 7. Rencana Keamanan

Anonimitas = keajaiban **dan** risiko eksistensial terbesar. Rancang keamanan kelas satu, tapi *ramping*.

| Risiko | Vektor | Solusi (skala MVP) |
|---|---|---|
| **Penyalahgunaan anonim** | Pelecehan, NSFW, kebencian, ban-evasion via handle baru | Token anon persisten + fingerprint IP; slow mode; report→**auto-mute pada ambang**; shadow-ban; kill-switch admin; pertimbangkan gerbang Turnstile untuk lounge global. |
| **Spam/banjir** | Spam pesan/link, banjir koneksi, bot | Rate limit (N/10dtk per session+IP); **Turnstile** pada pembuatan session/room; batas duplikat & panjang; throttling edge. |
| **Kecurangan game** | Move palsu, state ilegal | Validasi **server-authoritative** via RPC; klien tak bisa tulis state; jejak audit. |
| **Celah moderasi** | Report terlewat, mod burnout | Dashboard mod minimal (mute/ban/lock sekali klik); ambang otomatis garis pertama. |
| **Data/hukum** | IP = PII; gambar/UGC | RLS default-deny; chat ephemeral minimalkan UGC; ToS+Privacy; replay input di-mask; tunda Draw Together (moderasi gambar). |
| **Kepercayaan kerja** | Doxxing/bocor di ruang anonim | Norma jelas saat masuk; tanpa riwayat persisten; arahkan interaksi ke room terpilih. |

**Tak bisa ditawar sebelum trafik publik:** RLS setiap tabel, Turnstile pada pembuatan, rate limit aktif, kill-switch teruji, blocklist+report+auto-mute jalan.

---

## 8. Checklist Kesiapan Produksi

**Keamanan & penyalahgunaan**
- [ ] RLS default-deny semua tabel; write game hanya via RPC tervalidasi
- [ ] Turnstile pada pembuatan session + room
- [ ] Rate limiting (session + IP)
- [ ] Blocklist + slow mode + batas pesan aktif
- [ ] Report→auto-mute; shadow-ban; kill-switch global teruji
- [ ] Secret hanya di env; scan dependency

**Reliabilitas & performa**
- [ ] Load test pada target concurrency
- [ ] Reconnection realtime terverifikasi; game re-sync dari DB
- [ ] Job pembersihan room idle jalan
- [ ] Alert Vercel + Supabase; uptime + status page
- [ ] Staging + rollback

**Observability**
- [ ] Sentry (frontend + serverless) + release tagging
- [ ] Funnel PostHog + retensi D1/D7 + replay (mask)
- [ ] Dashboard: concurrency, error rate, p95 latency, retensi

**Produk & hukum**
- [ ] State empty/loading/error di mana-mana; lolos mobile
- [ ] Onboarding "cara membuatnya terasa hidup" (recess terjadwal, share link)
- [ ] ToS, Privacy Policy, notice cookie/PII, kontak penyalahgunaan
- [ ] Komunikasi peluncuran + satu "event konsentrasi"

---

## 9. Roadmap Masa Depan (pasca-peluncuran, prioritas per dampak bisnis)

1. **Office Communities / Team Spaces** *(dampak tertinggi — duluan)* — ruang privat/persisten/ber-brand per perusahaan + undangan tim. Sekaligus **solusi monetisasi & cold-start**; buka pintu B2B. Butuh auth ringan (magic link/SSO) — pertama kalinya akun nyata dibenarkan.
2. **Game Tambahan** *(retensi tertinggi)* — bangun game framework (setelah 1 game sukses) + **Draw Together** + Word Guess.
3. **Gamifikasi** *(pengganda engagement)* — streak, leaderboard ringan, event musiman. Setelah ada game.
4. **Fitur SaaS Premium** *(penangkap revenue — terakhir)* — paket tim: admin/moderasi, room ber-brand, analytics culture, SSO. Monetisasi organisasi, bukan individu.

> Team Spaces memimpin (memperbaiki cold-start + membuka revenue). Game → retensi. Gamifikasi → penguat. Premium → panen.

---

## 10. Rekomendasi Founder (praktis tanpa basa-basi)

**❌ JANGAN dibangun dulu:** akun/auth/profil · "platform game"/engine sebelum 1 game jalan · banyak game/matchmaking/ELO/voice/video/mobile/notifikasi/teman/DM/pembayaran/i18n/moderasi AI · riwayat chat persisten.

**🎭 Pengalih perhatian:** gold-plating desain · microservices/infra realtime sendiri (**Supabase cukup**) · over-modeling DB · kesempurnaan SEO sebelum loop seru · "konsol moderasi impian" alih-alih rate-limit+blocklist+kill-switch.

**☠️ Yang bisa membunuh proyek:**
1. **Ruangan kosong (cold-start).** Pembunuh #1 — rekayasa konsentrasi kehadiran.
2. **Toksisitas kontak pertama.** Rilis rate-limit+report+kill-switch sebelum trafik publik.
3. **Pemblokiran/risiko kultural kantor.** Posisikan sebagai alat break/culture tim; bottoms-up.
4. **Tanpa loop retensi.** Instrumentasi D1/D7 sejak hari pertama.
5. **Over-building sebelum belajar.**

**🚀 Prioritaskan untuk adopsi:**
1. **Momen "hidup" 10 detik** — landing → lihat orang online → langsung dalam percakapan.
2. **Masuk tanpa hambatan** — tanpa daftar akun, selamanya, untuk MVP.
3. **Link room = viral loop-mu.** Buat berbagi & bergabung mudah tanpa usaha.
4. **Kalahkan cold-start dengan ritual terjadwal** — "Recess jam 3 sore" harian; seed sesi awal dengan tim sendiri.
5. **Rebut tim, bukan pengguna.** Satu tim 20 orang yang muncul harian > 2.000 pengunjung sekali datang.

**Satu kalimat untuk menjalankan perusahaan:** *Buat satu tim nyata muncul bersama saat istirahat, merasakan tempatnya hidup, dan kembali besok — lalu bangun keluar dari sana.*
