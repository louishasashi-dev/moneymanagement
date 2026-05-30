# 💰 Money Manager

Aplikasi manajemen keuangan harian berbasis web yang bisa digunakan secara **offline** dan diinstall sebagai aplikasi di Android.

🔗 **Live App:** [louishasashi-dev.github.io/moneymanagement](https://louishasashi-dev.github.io/moneymanagement/)

🔗 **Apk Version:** https://github.com/louishasashi-dev/moneymanagement/releases/tag/v1.0.0

---

## ✨ Fitur

- 📊 **Dashboard** — Ringkasan keuangan harian, pemasukan, pengeluaran, dan saldo
- 💸 **Transaksi** — Catat pemasukan dan pengeluaran dengan kategori
- 👛 **Dompet** — Kelola beberapa dompet (Tunai, OVO, GoPay, Dana, BCA, Mandiri, dll)
- 🐷 **Tabungan** — Tracking target tabungan dan progress
- 🤝 **Piutang** — Catat piutang dan utang
- 📈 **Laporan** — Grafik dan statistik keuangan bulanan
- ⚙️ **Pengaturan** — Dark mode, PIN keamanan, backup & restore data

---

## 📱 Cara Install di Android

1. Buka link **Live App** di atas menggunakan Chrome
2. Tap menu **⋮** di pojok kanan atas
3. Pilih **"Install app"** atau **"Tambahkan ke layar utama"**
4. App akan muncul di home screen seperti aplikasi biasa

> Atau download APK langsung dari [Releases](https://github.com/louishasashi-dev/moneymanagement/releases)

---

## 🛠️ Teknologi

- **HTML, CSS, JavaScript** — Vanilla, tanpa framework
- **IndexedDB** — Penyimpanan data lokal di browser
- **PWA** — Progressive Web App, bisa diinstall dan jalan offline
- **Service Worker** — Cache aset untuk mode offline
- **Web App Manifest** — Konfigurasi instalasi app

---

## 💾 Backup & Restore Data

Data tersimpan secara lokal di perangkat. Untuk mencegah kehilangan data:

1. Buka **Pengaturan → Backup Data**
2. Download file `.json`
3. Simpan file tersebut di tempat aman

Untuk restore, buka **Pengaturan → Restore Data** dan pilih file backup.

---

## 📂 Struktur Project

```
moneymanagement/
├── index.html          # Entry point
├── manifest.json       # PWA manifest
├── css/
│   └── style.css       # Styling utama
├── js/
│   ├── app.js          # Inisialisasi & navigasi
│   ├── db.js           # IndexedDB operations
│   ├── utils.js        # Helper functions
│   ├── dashboard.js    # Halaman beranda
│   ├── transaction.js  # Halaman transaksi
│   ├── wallet.js       # Halaman dompet
│   ├── savings.js      # Halaman tabungan
│   ├── debt.js         # Halaman piutang
│   ├── report.js       # Halaman laporan
│   ├── settings.js     # Halaman pengaturan
│   └── service-worker.js # PWA service worker
└── images/
    ├── logo/           # Logo aplikasi
    └── icons/          # Icon berbagai ukuran
```

---

## 👨‍💻 Developer

**Louis Hasashi Halim**

- 🐙 GitHub: [@louishasashi-dev](https://github.com/louishasashi-dev)
- 📸 Instagram: [@lhshlm9](https://www.instagram.com/lhshlm9/)
- ▶️ YouTube: [An Louis official](https://www.youtube.com/@louisskyzhii7203)

---

## 📄 Lisensi

Project ini bersifat open source dan bebas digunakan untuk keperluan pribadi.
