# 💰 Money Manager

Aplikasi manajemen keuangan harian berbasis web yang bisa digunakan secara **offline** dan diinstall sebagai aplikasi di Android.

🔗 **Live App:** [louishasashi-dev.github.io/moneymanagement](https://louishasashi-dev.github.io/moneymanagement/)

🔗 **Apk Version:** https://github.com/louishasashi-dev/moneymanagement/releases/tag/v1.0.0

---

## ✨ Fitur

- 📊 **Dashboard** — Ringkasan keuangan harian, pemasukan, pengeluaran, dan saldo
- 💸 **Transaksi** — Catat pemasukan dan pengeluaran dengan kategori
- 👛 **Dompet** — Kelola beberapa dompet (Tunai, OVO, GoPay, Dana, BCA, Mandiri, dll)
- 🔄 **Transfer Saldo** — Pindahkan saldo antar dompet lengkap dengan riwayat transfer, saldo tersinkron otomatis di Dashboard & Total Aset
- 🐷 **Tabungan** — Tracking target tabungan dan progress
- 🤝 **Piutang & Hutang** — Catat piutang dan utang, dengan sistem **bunga berjalan otomatis** (harian, mingguan, bulanan, tahunan)
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

## 🆕 Update Terbaru (Changelog)

> Catatan perubahan & fitur baru. Tambahkan entri baru paling atas setiap kali ada update.

### v1.1.0
- 🔄 **Transfer Saldo Antar Dompet** — Pindahkan saldo dari satu dompet ke dompet lain langsung dari halaman Dompet, lengkap dengan validasi saldo mencukupi dan pengecekan dompet asal ≠ tujuan.
- 📜 **Riwayat Transfer** — Semua transfer tercatat dan bisa dilihat kembali; menghapus riwayat akan otomatis mengembalikan saldo kedua dompet seperti sebelum transfer (undo).
- 🔗 **Sinkronisasi Saldo** — Saldo dompet otomatis konsisten di semua halaman yang menampilkannya (Dashboard, Dompet, dan Total Aset) setelah transfer, tambah/edit/hapus dompet, maupun transaksi.
- 💹 **Bunga Berjalan pada Piutang & Hutang** — Tambah opsi bunga dengan periode Harian, Mingguan, Bulanan, atau Tahunan pada setiap data piutang/hutang. Bunga dihitung otomatis (compounding) setiap kali aplikasi dibuka, mengejar hari-hari yang terlewat sejak terakhir dihitung, sehingga nominal piutang/hutang selalu akurat sesuai tanggal berjalan.

### v1.0.0
- 🎉 Rilis pertama: Dashboard, Transaksi, Dompet, Tabungan, Piutang, Laporan, dan Pengaturan.

---

## 👨‍💻 Developer

**Louis Hasashi Halim**

- 🐙 GitHub: [@louishasashi-dev](https://github.com/louishasashi-dev)
- 📸 Instagram: [@lhshlm9](https://www.instagram.com/lhshlm9/)
- ▶️ YouTube: [An Louis official](https://www.youtube.com/@louisskyzhii7203)

---

## 📄 Lisensi

Project ini bersifat open source dan bebas digunakan untuk keperluan pribadi.
