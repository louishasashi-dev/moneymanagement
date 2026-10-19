// Transaction Component
// Mengelola semua operasi terkait transaksi (CRUD)

import {
  addItem,
  updateItem,
  deleteItem,
  getAllItems,
  getItem,
  initDB,
  STORES,
} from "./db.js";
import { getTemplatesByType } from "./template.js";
import {
  formatCurrency,
  formatDate,
  getCurrentDateTime,
  showToast,
  confirmDialog,
  normalizeString,
  capitalize,
  validateAmount,
  formatMoneyInput,
  parseMoney,
} from "./utils.js";
import { ensureTxSheetStyles } from "./modal-sheet.js";

// State untuk pagination dan filter
let currentPage = 1;
let itemsPerPage = 20;
let currentFilters = {
  search: "",
  type: "all",
  walletId: "all",
  category: "all",
  period: "today", // today | week | month | all | custom
  customDay: "all",
  customMonth: "all",
  customYear: "all",
};
let allTransactions = [];

// Label bulan untuk filter custom
const MONTH_NAMES = [
  "Januari",
  "Februari",
  "Maret",
  "April",
  "Mei",
  "Juni",
  "Juli",
  "Agustus",
  "September",
  "Oktober",
  "November",
  "Desember",
];

// ==================== HELPER KHUSUS MOBILE ====================
const MOBILE_QUERY = "(max-width: 767px)";
let periodDefaultApplied = false;

// Total saldo semua dompet = pembanding untuk persentase di bawah ikon
let walletTotal = 0;
const HIDE_BALANCE_KEY = "dashboard_hide_balance"; // sama dengan dashboard

// Nominal singkat untuk kartu ringkasan: di bawah 1 juta tampil penuh,
// mulai 1 juta disingkat: Rp 1jt, Rp 7,45jt, Rp 1M, Rp 2,5T ...
function formatCurrencyShort(n) {
  const abs = Math.abs(n || 0);
  const sign = n < 0 ? "-" : "";
  const units = [
    [1e12, "T"],
    [1e9, "M"],
    [1e6, "jt"],
  ];
  for (const [size, label] of units) {
    if (abs >= size) {
      const v = Math.floor((abs / size) * 100) / 100;
      return `${sign}Rp ${String(v).replace(".", ",")}${label}`;
    }
  }
  return formatCurrency(n);
}

// Ikon tipe transaksi: pengeluaran = segitiga terbalik merah, pemasukan = segitiga ke atas hijau
function typeTriangle(type) {
  const up = type === "income";
  const color = up ? "#16A34A" : "#DC4C4C";
  const d = up ? "M12 5 L21.5 20 H2.5 Z" : "M12 19 L2.5 4 H21.5 Z";
  return `<svg class="tri ${up ? "up" : "down"}" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="${d}" fill="${color}" stroke="${color}" stroke-width="2" stroke-linejoin="round"/></svg>`;
}

// Persentase nominal terhadap total saldo dompet. Contoh: 2,5% / 12% / <0,1%
// Saldo nol atau minus tidak bisa dijadikan pembanding, jadi tampil "–".
function formatPct(amount, balance) {
  const a = Number(amount) || 0;
  const b = Number(balance) || 0;
  if (b <= 0) return "–";
  const p = (a / b) * 100;
  if (p === 0) return "0%";
  if (p < 0.1) return "<0,1%";
  if (p > 999) return ">999%";
  const text =
    p < 10
      ? p.toFixed(1).replace(/\.0$/, "").replace(".", ",")
      : String(Math.round(p));
  return `${text}%`;
}

// Pastikan viewport mobile normal: lebar = lebar layar, skala awal 1 (muat 1 halaman),
// dan pengguna tetap boleh zoom in/out (tanpa maximum-scale / user-scalable=no)
function ensureMobileViewport() {
  let meta = document.querySelector('meta[name="viewport"]');
  if (!meta) {
    meta = document.createElement("meta");
    meta.name = "viewport";
    document.head.appendChild(meta);
  }
  // minimum-scale rendah = pengguna bebas zoom out (tidak terkunci di skala "fit")
  meta.setAttribute(
    "content",
    "width=device-width, initial-scale=1, minimum-scale=0.25, maximum-scale=5, user-scalable=yes, interactive-widget=resizes-content",
  );
}

// Cegah modal terbuka ganda (tap/klik ganda saat data masih dimuat)
// -> penyebab modal harus ditutup berkali-kali
let txModalOpening = false;

function isMobileView() {
  return window.matchMedia && window.matchMedia(MOBILE_QUERY).matches;
}

// Mobile default ke "bulan ini" (sesuai tampilan "Periode Oktober 2026"), desktop tetap "hari ini"
function getDefaultPeriod() {
  return isMobileView() ? "month" : "today";
}

function monthKey(year, month) {
  return `m:${year}-${String(month).padStart(2, "0")}`;
}

// Format tanggal baris transaksi (bulan disingkat agar muat 1 baris): 10 Okt 2026, 09.59
const SHORT_MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "Mei",
  "Jun",
  "Jul",
  "Agu",
  "Sep",
  "Okt",
  "Nov",
  "Des",
];
function formatMobileDateTime(t) {
  const d = (t.date || "").split("-");
  const monthName = SHORT_MONTHS[parseInt(d[1], 10) - 1];
  const datePart =
    d.length === 3 && monthName
      ? `${parseInt(d[2], 10)} ${monthName} ${d[0]}`
      : t.date || "-";
  const timePart = t.time ? `, ${String(t.time).replace(":", ".")}` : "";
  return datePart + timePart;
}

// Label & nilai <select> periode mobile berdasarkan state filter aktif
function getPeriodSelection() {
  const { period, customDay, customMonth, customYear } = currentFilters;
  const now = new Date();
  if (period === "today") return { value: "today", label: "Hari Ini" };
  if (period === "week") return { value: "week", label: "Minggu Ini" };
  if (period === "all") return { value: "all", label: "Semua Waktu" };
  if (period === "month") {
    return {
      value: monthKey(now.getFullYear(), now.getMonth() + 1),
      label: `${MONTH_NAMES[now.getMonth()]} ${now.getFullYear()}`,
    };
  }
  if (customDay === "all" && customMonth !== "all" && customYear !== "all") {
    return {
      value: monthKey(Number(customYear), Number(customMonth)),
      label: `${MONTH_NAMES[Number(customMonth) - 1]} ${customYear}`,
    };
  }
  const parts = [];
  if (customDay !== "all") parts.push(customDay);
  if (customMonth !== "all") parts.push(MONTH_NAMES[Number(customMonth) - 1]);
  if (customYear !== "all") parts.push(customYear);
  return {
    value: "custom",
    label: parts.length ? parts.join(" ") : "Semua Waktu",
  };
}

function buildMobilePeriodOptions() {
  const select = document.getElementById("m-period-select");
  if (!select) return;
  let earliestYear = 2024;
  allTransactions.forEach((t) => {
    const y = t.date ? parseInt(t.date.split("-")[0], 10) : NaN;
    if (!isNaN(y) && y < earliestYear) earliestYear = y;
  });
  const now = new Date();
  let html = `<option value="today">Hari Ini</option><option value="week">Minggu Ini</option>`;
  for (let y = now.getFullYear(); y >= earliestYear; y--) {
    const last = y === now.getFullYear() ? now.getMonth() : 11;
    for (let m = last; m >= 0; m--) {
      html += `<option value="${monthKey(y, m + 1)}">${MONTH_NAMES[m]} ${y}</option>`;
    }
  }
  html += `<option value="all">Semua Waktu</option><option value="custom" hidden>Kustom</option>`;
  select.innerHTML = html;
}

function updateMobilePeriodUi() {
  const valueEl = document.getElementById("m-period-value");
  const select = document.getElementById("m-period-select");
  if (!valueEl || !select) return;
  const sel = getPeriodSelection();
  valueEl.textContent = sel.label;
  select.value = sel.value;
}

function applyMobilePeriod(value) {
  if (value === "today" || value === "week" || value === "all") {
    currentFilters.period = value;
    currentFilters.customDay = "all";
    currentFilters.customMonth = "all";
    currentFilters.customYear = "all";
  } else if (value.startsWith("m:")) {
    const [year, month] = value.slice(2).split("-");
    currentFilters.period = "custom";
    currentFilters.customDay = "all";
    currentFilters.customMonth = String(parseInt(month, 10));
    currentFilters.customYear = year;
  } else {
    return;
  }
  currentPage = 1;
  syncFilterControls();
  renderFilteredTransactions();
}

// Samakan nilai kontrol filter (modal) dengan state filter aktif
function syncFilterControls() {
  const setValue = (id, v) => {
    const el = document.getElementById(id);
    if (el) el.value = v;
  };
  setValue("search-transaction", currentFilters.search);
  setValue("filter-type", currentFilters.type);
  setValue("filter-wallet", currentFilters.walletId);
  setValue("filter-category", currentFilters.category);
  setValue("filter-period", currentFilters.period);
  setValue("filter-custom-day", currentFilters.customDay);
  setValue("filter-custom-month", currentFilters.customMonth);
  setValue("filter-custom-year", currentFilters.customYear);
  const customGroup = document.getElementById("custom-date-group");
  if (customGroup) {
    customGroup.style.display =
      currentFilters.period === "custom" ? "grid" : "none";
  }
}

// Header ungu menembus padding #page-content di mobile (sama seperti dashboard)
function fitTxFullBleed() {
  const root = document.querySelector(".transactions-container");
  const hero = root && root.querySelector(".tp-hero");
  if (!root || !hero) return;

  // Di tablet/desktop header berupa kartu biasa
  if (window.innerWidth >= 768) {
    root.style.removeProperty("--tp-bleed-l");
    root.style.removeProperty("--tp-bleed-r");
    root.style.removeProperty("--tp-bleed-t");
    return;
  }

  const rect = hero.getBoundingClientRect();
  const vw = document.documentElement.clientWidth;
  let top = 0;
  for (
    let n = root.parentElement;
    n && n !== document.documentElement;
    n = n.parentElement
  ) {
    top += parseFloat(getComputedStyle(n).paddingTop) || 0;
  }
  root.style.setProperty("--tp-bleed-l", `${Math.max(0, rect.left)}px`);
  root.style.setProperty("--tp-bleed-r", `${Math.max(0, vw - rect.right)}px`);
  root.style.setProperty("--tp-bleed-t", `${top}px`);
}

// Kecilkan font total saldo bila terlalu panjang, supaya tetap satu baris
function fitTxBalanceText() {
  const el = document.getElementById("tp-wallet-balance");
  const box = el && el.parentElement;
  if (!el || !box) return;
  const avail = Math.min(
    box.clientWidth,
    document.documentElement.clientWidth - 40,
  );
  el.style.fontSize = "";
  let size = parseFloat(getComputedStyle(el).fontSize);
  while (el.offsetWidth > avail && size > 14) {
    size -= 1;
    el.style.fontSize = size + "px";
  }
}

function refitTxHeader() {
  fitTxFullBleed();
  fitTxBalanceText();
}

// Jalankan ulang setelah layout/font selesai agar ukuran bleed akurat
function scheduleTxFullBleed() {
  refitTxHeader();
  requestAnimationFrame(refitTxHeader);
  setTimeout(refitTxHeader, 150);
  setTimeout(refitTxHeader, 500);
}

if (!window.__txHeaderBound) {
  window.__txHeaderBound = true;
  window.addEventListener("resize", refitTxHeader);
}

// Total saldo di header (bisa disembunyikan, pilihan dibagi dengan dashboard)
function renderBalanceUi() {
  const amount = document.getElementById("tp-wallet-balance");
  if (!amount) return;
  const hidden = localStorage.getItem(HIDE_BALANCE_KEY) === "1";
  amount.textContent = hidden ? "Rp ••••••" : formatCurrency(walletTotal);
  const btn = document.getElementById("toggle-balance");
  const icon = btn && btn.querySelector("i");
  if (icon) icon.className = hidden ? "fas fa-eye-slash" : "fas fa-eye";
  if (btn) {
    btn.setAttribute(
      "aria-label",
      hidden ? "Tampilkan saldo" : "Sembunyikan saldo",
    );
  }
  fitTxBalanceText();
}

// Frasa periode untuk chip header: "hari ini", "bulan ini", "di Agustus 2026", ...
function periodPhrase() {
  const sel = getPeriodSelection();
  const now = new Date();
  if (sel.value === "today") return "hari ini";
  if (sel.value === "week") return "minggu ini";
  if (sel.value === "all" || sel.label === "Semua Waktu") return "semua waktu";
  if (sel.value === monthKey(now.getFullYear(), now.getMonth() + 1)) {
    return "bulan ini";
  }
  return `di ${sel.label}`;
}

// Render halaman transaksi utama
export async function renderTransactionsPage() {
  const container = document.getElementById("page-content");
  if (!container) return;

  // Style harus ada SEBELUM markup dirender
  addTransactionStyles();
  ensureMobileViewport();

  if (!periodDefaultApplied) {
    periodDefaultApplied = true;
    currentFilters.period = getDefaultPeriod();
  }

  // Clear container first
  container.innerHTML = "";

  // Load semua transaksi + total saldo dompet
  await loadTransactions();

  const tile = (type, label, id) => `
                            <div class="tp-tile">
                                <span class="tp-tile-ico ${type}">${type === "saving" ? '<i class="fas fa-piggy-bank"></i>' : typeTriangle(type)}</span>
                                <span class="tp-pct ${type}" id="${id}-pct" title="Dari total saldo dompet">–</span>
                                <span class="tp-tile-label">${label}</span>
                                <span class="tp-tile-value ${type}" id="${id}">Rp 0</span>
                            </div>`;

  // HTML Template (mengikuti desain dashboard)
  container.innerHTML = `
        <div class="transactions-container">
            <!-- Header ungu dengan sudut bawah membulat -->
            <header class="tp-hero">
                <div class="tp-top">
                    <div class="tp-avatar"><i class="fas fa-exchange-alt"></i></div>
                    <div class="tp-greet">
                        <span class="tp-eyebrow">Riwayat keuangan</span>
                        <h1>Transaksi</h1>
                    </div>
                    <button class="tp-refresh" id="refresh-transactions" type="button" aria-label="Perbarui data" title="Perbarui data">
                        <i class="fas fa-sync-alt"></i>
                    </button>
                </div>

                <div class="tp-balance">
                    <span class="tp-label">
                        Total Saldo
                        <button type="button" class="tp-eye" id="toggle-balance" aria-label="Sembunyikan saldo" title="Sembunyikan / tampilkan saldo">
                            <i class="fas fa-eye"></i>
                        </button>
                    </span>
                    <span class="tp-amount" id="tp-wallet-balance">${formatCurrency(walletTotal)}</span>
                    <span class="tp-chip up" id="tp-net-chip"></span>
                </div>

                <div class="tp-actions">
                    <button type="button" class="tp-action primary" id="m-add-transaction-btn" title="Transaksi Baru">
                        <span class="ico"><i class="fas fa-plus"></i></span>Tambah
                    </button>
                    <button type="button" class="tp-action" id="m-add-multi-btn" title="Transaksi Banyak">
                        <span class="ico"><i class="fas fa-cart-shopping"></i></span>Banyak
                    </button>
                    <div class="tp-action tp-period">
                        <span class="ico"><i class="fas fa-calendar-days"></i></span>Periode
                        <select id="m-period-select" class="tp-period-select" aria-label="Pilih periode"></select>
                    </div>
                    <button type="button" class="tp-action" id="m-filter-btn">
                        <span class="ico"><i class="fas fa-filter"></i></span>Filter
                    </button>
                </div>
            </header>

            <div class="tp-grid">
                <div class="tp-col tp-col-side">
                    <!-- Ringkasan periode -->
                    <section>
                        <div class="tp-section-head">
                            <h2>Ringkasan</h2>
                            <span class="tp-muted" id="m-period-value"></span>
                        </div>
                        <div class="tp-card tp-tiles">
                            ${tile("income", "Pemasukan", "total-income-summary")}
                            ${tile("expense", "Pengeluaran", "total-expense-summary")}
                            ${tile("saving", "Tabungan", "total-saving-summary")}
                        </div>
                    </section>
                </div>

                <div class="tp-col">
                    <!-- Daftar transaksi -->
                    <section>
                        <div class="tp-section-head">
                            <h2>Daftar Transaksi</h2>
                            <span class="tp-muted"><span id="total-count">0</span> transaksi</span>
                        </div>
                        <div class="tp-card tp-list-card">
                            <div id="transactions-list" class="tp-list">
                                <div class="tp-empty">
                                    <i class="fas fa-spinner fa-spin"></i>
                                    <p>Memuat transaksi...</p>
                                </div>
                            </div>
                            <div id="pagination" class="pagination"></div>
                        </div>
                    </section>
                </div>
            </div>

            <!-- Filter (sheet di mobile, dialog di desktop) -->
            <div class="tp-filter" id="filter-bar" aria-hidden="true">
                <div class="tp-filter-sheet" role="dialog" aria-label="Filter transaksi">
                    <div class="tp-filter-head">
                        <h3>Filter Transaksi</h3>
                        <button type="button" class="tp-close" id="filter-close-btn" aria-label="Tutup">
                            <i class="fas fa-times"></i>
                        </button>
                    </div>
                    <div class="tp-filter-body">
                        <div class="tp-search">
                            <i class="fas fa-search"></i>
                            <input type="text" id="search-transaction" placeholder="Cari transaksi..." class="tp-input">
                        </div>
                        <select id="filter-type" class="tp-input">
                            <option value="all">Semua Tipe</option>
                            <option value="income">Pemasukan</option>
                            <option value="expense">Pengeluaran</option>
                            <option value="saving">Tabungan</option>
                        </select>
                        <select id="filter-wallet" class="tp-input">
                            <option value="all">Semua Dompet</option>
                        </select>
                        <select id="filter-category" class="tp-input">
                            <option value="all">Semua Kategori</option>
                        </select>
                        <select id="filter-period" class="tp-input">
                            <option value="today">Hari Ini</option>
                            <option value="week">Minggu Ini</option>
                            <option value="month">Bulan Ini</option>
                            <option value="all">Semua Waktu</option>
                            <option value="custom">Pilih Tanggal</option>
                        </select>
                        <div class="tp-custom-date" id="custom-date-group" style="display: none;">
                            <select id="filter-custom-day" class="tp-input">
                                <option value="all">Tanggal</option>
                                ${Array.from({ length: 31 }, (_, i) => i + 1)
                                  .map(
                                    (d) => `<option value="${d}">${d}</option>`,
                                  )
                                  .join("")}
                            </select>
                            <select id="filter-custom-month" class="tp-input">
                                <option value="all">Bulan</option>
                                ${MONTH_NAMES.map(
                                  (m, i) =>
                                    `<option value="${i + 1}">${m}</option>`,
                                ).join("")}
                            </select>
                            <select id="filter-custom-year" class="tp-input">
                                <option value="all">Tahun</option>
                            </select>
                        </div>
                    </div>
                    <div class="tp-filter-foot">
                        <button type="button" id="reset-filters" class="tp-btn">Atur Ulang</button>
                        <button type="button" id="apply-filters" class="tp-btn primary">Terapkan</button>
                    </div>
                </div>
            </div>
        </div>
    `;

  // Load wallets untuk filter
  await loadWalletsForFilter();

  // Load categories untuk filter
  await loadCategoriesForFilter();

  // Load tahun untuk filter tanggal custom
  loadYearsForFilter();

  // Opsi periode + samakan kontrol filter dengan state aktif
  buildMobilePeriodOptions();
  syncFilterControls();

  // Render transactions
  renderFilteredTransactions();

  // Setup event listeners
  setupTransactionEventListeners();
  scheduleTxFullBleed();
}

// Load semua transaksi dari database + total saldo dompet (untuk persentase)
async function loadTransactions() {
  allTransactions = await getAllItems(STORES.TRANSACTIONS);
  // Terbaru di atas: tanggal, lalu jam, lalu waktu dibuat
  allTransactions.sort((a, b) => {
    const byDate = new Date(b.date) - new Date(a.date);
    if (byDate !== 0) return byDate;
    const timeA = a.time || "00:00";
    const timeB = b.time || "00:00";
    if (timeA !== timeB) return timeB.localeCompare(timeA);
    return (b.createdAt || 0) - (a.createdAt || 0);
  });

  const wallets = await getAllItems(STORES.WALLETS);
  walletTotal = wallets.reduce((sum, w) => sum + (w.balance || 0), 0);
}

// Load wallets untuk dropdown filter
async function loadWalletsForFilter() {
  const wallets = await getAllItems(STORES.WALLETS);
  const filterWallet = document.getElementById("filter-wallet");
  if (filterWallet) {
    wallets.forEach((wallet) => {
      const option = document.createElement("option");
      option.value = wallet.id;
      option.textContent = `${wallet.name} (${formatCurrency(wallet.balance)})`;
      filterWallet.appendChild(option);
    });
  }
}

// Load categories untuk dropdown filter
async function loadCategoriesForFilter() {
  const categories = await getAllItems(STORES.CATEGORIES);
  const filterCategory = document.getElementById("filter-category");
  if (filterCategory) {
    categories.forEach((cat) => {
      const option = document.createElement("option");
      option.value = cat.name;
      option.textContent = cat.name;
      filterCategory.appendChild(option);
    });
  }
}

// Isi dropdown tahun untuk filter tanggal custom
// Range tetap: 2024 s/d tahun berjalan (otomatis nambah tiap tahun baru berdasarkan tanggal perangkat)
function loadYearsForFilter() {
  const filterYear = document.getElementById("filter-custom-year");
  if (!filterYear) return;

  // Reset dulu supaya tidak dobel kalau fungsi ini terpanggil lebih dari sekali
  filterYear.innerHTML = '<option value="all">Tahun</option>';

  const BASE_START_YEAR = 2024;
  const currentYear = new Date().getFullYear();

  // Cek kalau ada data transaksi dengan tahun lebih lama dari 2024 (jaga-jaga)
  let earliestYear = BASE_START_YEAR;
  allTransactions.forEach((t) => {
    if (t.date) {
      const year = parseInt(t.date.split("-")[0], 10);
      if (!isNaN(year) && year < earliestYear) earliestYear = year;
    }
  });

  const endYear = Math.max(currentYear, BASE_START_YEAR);

  for (let year = endYear; year >= earliestYear; year--) {
    const option = document.createElement("option");
    option.value = year;
    option.textContent = year;
    filterYear.appendChild(option);
  }
}

// ==================== DATE FILTER HELPERS ====================

// Parse string tanggal "yyyy-mm-dd" menjadi Date object (local midnight, aman dari isu timezone)
function parseDateOnly(dateStr) {
  if (!dateStr) return null;
  const [y, m, d] = dateStr.split("-").map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}

// Dapatkan tanggal awal minggu ini (Senin)
function getStartOfWeek(refDate = new Date()) {
  const date = new Date(refDate);
  const day = date.getDay(); // 0 = Minggu, 1 = Senin, ...
  const diff = (day === 0 ? -6 : 1) - day;
  date.setDate(date.getDate() + diff);
  date.setHours(0, 0, 0, 0);
  return date;
}

// Dapatkan tanggal akhir minggu ini (Minggu)
function getEndOfWeek(refDate = new Date()) {
  const start = getStartOfWeek(refDate);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  end.setHours(23, 59, 59, 999);
  return end;
}

// Cek apakah sebuah transaksi lolos filter periode yang aktif
function matchesPeriodFilter(transaction) {
  const { period, customDay, customMonth, customYear } = currentFilters;

  if (period === "all") return true;

  const tDate = parseDateOnly(transaction.date);
  if (!tDate) return false;

  const now = new Date();

  if (period === "today") {
    const todayStr = getCurrentDateTime().date;
    return transaction.date === todayStr;
  }

  if (period === "week") {
    const start = getStartOfWeek(now);
    const end = getEndOfWeek(now);
    return (
      tDate.getTime() >= start.getTime() && tDate.getTime() <= end.getTime()
    );
  }

  if (period === "month") {
    return (
      tDate.getFullYear() === now.getFullYear() &&
      tDate.getMonth() === now.getMonth()
    );
  }

  if (period === "custom") {
    if (customDay !== "all" && tDate.getDate() !== parseInt(customDay, 10)) {
      return false;
    }
    if (
      customMonth !== "all" &&
      tDate.getMonth() + 1 !== parseInt(customMonth, 10)
    ) {
      return false;
    }
    if (
      customYear !== "all" &&
      tDate.getFullYear() !== parseInt(customYear, 10)
    ) {
      return false;
    }
    return true;
  }

  return true;
}

// Render transaksi yang sudah difilter
function renderFilteredTransactions() {
  updateMobilePeriodUi();

  // Apply filters
  let filtered = [...allTransactions];

  // Filter by period (hari ini / minggu ini / bulan ini / semua / custom)
  filtered = filtered.filter((t) => matchesPeriodFilter(t));

  // Filter by search
  if (currentFilters.search) {
    const searchTerm = normalizeString(currentFilters.search);
    filtered = filtered.filter(
      (t) =>
        normalizeString(t.itemName).includes(searchTerm) ||
        (t.note && normalizeString(t.note).includes(searchTerm)) ||
        (Array.isArray(t.items) &&
          t.items.some(
            (i) =>
              i.itemName && normalizeString(i.itemName).includes(searchTerm),
          )),
    );
  }

  // Filter by type
  if (currentFilters.type !== "all") {
    filtered = filtered.filter((t) => t.type === currentFilters.type);
  }

  // Filter by wallet
  if (currentFilters.walletId !== "all") {
    filtered = filtered.filter((t) => t.walletId === currentFilters.walletId);
  }

  // Filter by category
  if (currentFilters.category !== "all") {
    filtered = filtered.filter(
      (t) =>
        t.category === currentFilters.category ||
        (t.isMultiItem === true &&
          Array.isArray(t.items) &&
          t.items.some((i) => i.category === currentFilters.category)),
    );
  }

  // Update summary
  updateSummary(filtered);

  // Pagination
  const totalPages = Math.ceil(filtered.length / itemsPerPage);
  const start = (currentPage - 1) * itemsPerPage;
  const paginatedItems = filtered.slice(start, start + itemsPerPage);

  // Render list
  renderTransactionsList(paginatedItems);

  // Render pagination
  renderPagination(totalPages);
}

// Update summary statistics
function updateSummary(transactions) {
  const sumOf = (type) =>
    transactions
      .filter((t) => t.type === type)
      .reduce((sum, t) => sum + t.amount, 0);
  const totalIncome = sumOf("income");
  const totalExpense = sumOf("expense");
  const totalSaving = sumOf("saving");

  const countEl = document.getElementById("total-count");
  if (countEl) countEl.textContent = transactions.length;

  [
    ["total-income-summary", totalIncome],
    ["total-expense-summary", totalExpense],
    ["total-saving-summary", totalSaving],
  ].forEach(([id, value]) => {
    const el = document.getElementById(id);
    if (el) {
      el.textContent = formatCurrencyShort(value);
      el.title = formatCurrency(value);
    }
    const pct = document.getElementById(`${id}-pct`);
    if (pct) pct.textContent = formatPct(value, walletTotal);
  });

  // Chip di header: selisih pemasukan - pengeluaran pada periode aktif
  const net = totalIncome - totalExpense;
  const chip = document.getElementById("tp-net-chip");
  if (chip) {
    chip.className = `tp-chip ${net >= 0 ? "up" : "down"}`;
    chip.innerHTML = `<i class="fas ${net >= 0 ? "fa-caret-up" : "fa-caret-down"}"></i> ${net >= 0 ? "+" : ""}${formatCurrency(net)} ${periodPhrase()}`;
  }

  renderBalanceUi();
}

// Render daftar transaksi
function renderTransactionsList(transactions) {
  const container = document.getElementById("transactions-list");
  if (!container) return;

  if (transactions.length === 0) {
    const emptyMessages = {
      today: "Belum ada transaksi hari ini",
      week: "Belum ada transaksi minggu ini",
      month: "Belum ada transaksi bulan ini",
      custom: "Tidak ada transaksi pada tanggal yang dipilih",
      all: "Belum ada transaksi",
    };
    const message =
      emptyMessages[currentFilters.period] || "Belum ada transaksi";

    container.innerHTML = `
            <div class="tp-empty">
                <i class="fas fa-receipt"></i>
                <p>${message}</p>
                <button type="button" class="tp-btn primary btn-add-transaction">
                    <i class="fas fa-plus"></i> Tambah Transaksi
                </button>
            </div>
        `;

    const addBtn = container.querySelector(".btn-add-transaction");
    if (addBtn) {
      addBtn.addEventListener("click", () => showTransactionModal());
    }
    container.onclick = null;
    container.onkeydown = null;
    return;
  }

  container.innerHTML = transactions
    .map((t) => {
      const isMulti = t.isMultiItem === true && Array.isArray(t.items);
      const sign =
        t.type === "income" ? "+ " : t.type === "expense" ? "- " : "";
      const lead =
        t.type === "saving"
          ? '<i class="fas fa-piggy-bank"></i>'
          : typeTriangle(t.type);
      const mainMeta = isMulti
        ? `${t.items.length} barang`
        : t.category || "Umum";
      return `
        <div class="tp-row" data-id="${t.id}" role="button" tabindex="0">
            <div class="tp-lead ${t.type}">
                <span class="tp-lead-ico">${lead}</span>
                <span class="tp-pct ${t.type}" title="Dari total saldo dompet">${formatPct(t.amount, walletTotal)}</span>
            </div>
            <div class="tp-info">
                <div class="tp-name">${escapeHtml(t.itemName)}</div>
                <div class="tp-meta">
                    <span>${escapeHtml(mainMeta)}</span>
                    <span>${formatMobileDateTime(t)}</span>
                </div>
                ${t.note ? `<div class="tp-note">${escapeHtml(t.note)}</div>` : ""}
            </div>
            <div class="tp-amount ${t.type}">${sign}${formatCurrency(t.amount)}</div>
            <div class="tp-row-actions">
                <button type="button" class="tp-icon-btn edit-transaction" data-id="${t.id}" title="Edit" aria-label="Edit transaksi">
                    <i class="fas fa-edit"></i>
                </button>
                <button type="button" class="tp-icon-btn danger delete-transaction" data-id="${t.id}" title="Hapus" aria-label="Hapus transaksi">
                    <i class="fas fa-trash"></i>
                </button>
            </div>
        </div>
    `;
    })
    .join("");

  // Satu handler untuk semua baris (edit / hapus / buka detail)
  const handleRowAction = (target) => {
    const editBtn = target.closest(".edit-transaction");
    if (editBtn) {
      editTransaction(parseInt(editBtn.dataset.id));
      return true;
    }
    const delBtn = target.closest(".delete-transaction");
    if (delBtn) {
      deleteTransactionById(parseInt(delBtn.dataset.id));
      return true;
    }
    return false;
  };
  container.onclick = (e) => {
    if (handleRowAction(e.target)) return;
    const row = e.target.closest(".tp-row");
    if (row) showTransactionDetailModal(parseInt(row.dataset.id));
  };
  container.onkeydown = (e) => {
    if (e.key !== "Enter" && e.key !== " ") return;
    if (e.target.closest("button")) return;
    const row = e.target.closest(".tp-row");
    if (row) {
      e.preventDefault();
      showTransactionDetailModal(parseInt(row.dataset.id));
    }
  };
}

// Modal detail transaksi (read-only) — menampilkan nama, tipe, harga satuan,
// quantity, total, kategori, wallet, catatan, tanggal, dan waktu.
async function showTransactionDetailModal(id) {
  const transaction = await getItem(STORES.TRANSACTIONS, id);
  if (!transaction) {
    showToast("Transaksi tidak ditemukan", "error");
    return;
  }

  const quantity = transaction.quantity || 1;
  const unitPrice = transaction.amount / quantity;

  const wallet = transaction.walletId
    ? await getItem(STORES.WALLETS, transaction.walletId)
    : null;

  if (transaction.isMultiItem === true && Array.isArray(transaction.items)) {
    showMultiTransactionDetailModal(transaction, wallet);
    return;
  }

  const typeLabel =
    transaction.type === "income"
      ? "Pemasukan"
      : transaction.type === "saving"
        ? "Tabungan"
        : "Pengeluaran";

  const modal = document.createElement("div");
  modal.className = "modal-overlay";
  modal.innerHTML = `
        <div class="modal-container">
            <div class="modal-header">
                <h3><i class="fas fa-receipt"></i> Detail Transaksi</h3>
                <button class="modal-close-btn modal-close-x">&times;</button>
            </div>
            <div class="modal-body">
                <div class="transaction-detail-row">
                    <span class="transaction-detail-label">Nama</span>
                    <span class="transaction-detail-value">${escapeHtml(transaction.itemName)}</span>
                </div>
                <div class="transaction-detail-row">
                    <span class="transaction-detail-label">Tipe</span>
                    <span class="transaction-detail-value">${typeLabel}</span>
                </div>
                <div class="transaction-detail-row">
                    <span class="transaction-detail-label">Harga Satuan</span>
                    <span class="transaction-detail-value">${formatCurrency(unitPrice)}</span>
                </div>
                <div class="transaction-detail-row">
                    <span class="transaction-detail-label">Jumlah</span>
                    <span class="transaction-detail-value">${quantity}</span>
                </div>
                <div class="transaction-detail-row">
                    <span class="transaction-detail-label">Total</span>
                    <span class="transaction-detail-value">${formatCurrency(transaction.amount)}</span>
                </div>
                <div class="transaction-detail-row">
                    <span class="transaction-detail-label">Kategori</span>
                    <span class="transaction-detail-value">${escapeHtml(transaction.category || "Umum")}</span>
                </div>
                <div class="transaction-detail-row">
                    <span class="transaction-detail-label">Wallet</span>
                    <span class="transaction-detail-value">${wallet ? escapeHtml(wallet.name) : "-"}</span>
                </div>
                ${
                  transaction.note
                    ? `<div class="transaction-detail-row">
                    <span class="transaction-detail-label">Catatan</span>
                    <span class="transaction-detail-value">${escapeHtml(transaction.note)}</span>
                </div>`
                    : ""
                }
                <div class="transaction-detail-row">
                    <span class="transaction-detail-label">Tanggal</span>
                    <span class="transaction-detail-value">${formatDate(transaction.date)}</span>
                </div>
                <div class="transaction-detail-row">
                    <span class="transaction-detail-label">Waktu</span>
                    <span class="transaction-detail-value">${transaction.time || "-"}</span>
                </div>
            </div>
        </div>
    `;

  document.body.appendChild(modal);

  const closeModal = () => modal.remove();
  modal.querySelectorAll(".modal-close-btn").forEach((btn) => {
    btn.addEventListener("click", closeModal);
  });
  modal.addEventListener("click", (e) => {
    if (e.target === modal) closeModal();
  });
}

// Render pagination
function renderPagination(totalPages) {
  const container = document.getElementById("pagination");
  if (!container) return;

  if (totalPages <= 1) {
    container.innerHTML = "";
    return;
  }

  let buttons = "";
  const startPage = Math.max(1, currentPage - 2);
  const endPage = Math.min(totalPages, currentPage + 2);

  for (let i = startPage; i <= endPage; i++) {
    buttons += `
            <button class="page-btn ${i === currentPage ? "active" : ""}" data-page="${i}">
                ${i}
            </button>
        `;
  }

  container.innerHTML = `
        <button class="page-btn prev-btn" ${currentPage === 1 ? "disabled" : ""}>
            <i class="fas fa-chevron-left"></i>
        </button>
        ${buttons}
        <button class="page-btn next-btn" ${currentPage === totalPages ? "disabled" : ""}>
            <i class="fas fa-chevron-right"></i>
        </button>
    `;

  // Event listeners for pagination
  document.querySelectorAll(".page-btn[data-page]").forEach((btn) => {
    btn.addEventListener("click", () => {
      currentPage = parseInt(btn.dataset.page);
      renderFilteredTransactions();
    });
  });

  const prevBtn = document.querySelector(".prev-btn");
  const nextBtn = document.querySelector(".next-btn");

  if (prevBtn && !prevBtn.disabled) {
    prevBtn.addEventListener("click", () => {
      if (currentPage > 1) {
        currentPage--;
        renderFilteredTransactions();
      }
    });
  }

  if (nextBtn && !nextBtn.disabled) {
    nextBtn.addEventListener("click", () => {
      if (currentPage < totalPages) {
        currentPage++;
        renderFilteredTransactions();
      }
    });
  }
}

// Setup event listeners untuk filter
let filterEscBound = false;

function setupTransactionEventListeners() {
  // ── Filter: sheet di mobile, dialog di desktop ──
  // Semua kontrol filter langsung memperbarui daftar; tombol "Terapkan" hanya menutup.
  const filterBar = document.getElementById("filter-bar");
  const filterCloseBtn = document.getElementById("filter-close-btn");
  const applyFiltersBtn = document.getElementById("apply-filters");

  const openFilterModal = () => {
    filterBar?.classList.add("open");
    filterBar?.setAttribute("aria-hidden", "false");
    document.body.classList.add("filter-modal-active");
  };
  const closeFilterModal = () => {
    filterBar?.classList.remove("open");
    filterBar?.setAttribute("aria-hidden", "true");
    document.body.classList.remove("filter-modal-active");
  };

  document
    .getElementById("m-filter-btn")
    ?.addEventListener("click", openFilterModal);
  document
    .getElementById("m-period-select")
    ?.addEventListener("change", (e) => applyMobilePeriod(e.target.value));
  document
    .getElementById("m-add-transaction-btn")
    ?.addEventListener("click", () => showTransactionModal());
  document
    .getElementById("m-add-multi-btn")
    ?.addEventListener("click", () => showMultiTransactionModal());
  filterCloseBtn?.addEventListener("click", closeFilterModal);
  applyFiltersBtn?.addEventListener("click", closeFilterModal);
  // Klik area gelap di luar sheet menutup filter
  filterBar?.addEventListener("click", (e) => {
    if (e.target === filterBar) closeFilterModal();
  });
  if (!filterEscBound) {
    filterEscBound = true;
    document.addEventListener("keydown", (e) => {
      if (e.key !== "Escape") return;
      const bar = document.getElementById("filter-bar");
      if (bar?.classList.contains("open")) {
        bar.classList.remove("open");
        bar.setAttribute("aria-hidden", "true");
        document.body.classList.remove("filter-modal-active");
      }
    });
  }

  // Tombol mata: sembunyikan / tampilkan total saldo
  document.getElementById("toggle-balance")?.addEventListener("click", () => {
    const hidden = localStorage.getItem(HIDE_BALANCE_KEY) !== "1";
    localStorage.setItem(HIDE_BALANCE_KEY, hidden ? "1" : "0");
    renderBalanceUi();
  });

  // Perbarui data
  document
    .getElementById("refresh-transactions")
    ?.addEventListener("click", async () => {
      showToast("Memperbarui data...", "info");
      await renderTransactionsPage();
      showToast("Data diperbarui", "success");
    });

  // Search input with debounce
  const searchInput = document.getElementById("search-transaction");
  if (searchInput) {
    let timeout;
    searchInput.addEventListener("input", (e) => {
      clearTimeout(timeout);
      timeout = setTimeout(() => {
        currentFilters.search = e.target.value;
        currentPage = 1;
        renderFilteredTransactions();
      }, 300);
    });
  }

  // Filter type
  const filterType = document.getElementById("filter-type");
  if (filterType) {
    filterType.addEventListener("change", (e) => {
      currentFilters.type = e.target.value;
      currentPage = 1;
      renderFilteredTransactions();
    });
  }

  // Filter wallet
  const filterWallet = document.getElementById("filter-wallet");
  if (filterWallet) {
    filterWallet.addEventListener("change", (e) => {
      currentFilters.walletId = e.target.value;
      currentPage = 1;
      renderFilteredTransactions();
    });
  }

  // Filter category
  const filterCategory = document.getElementById("filter-category");
  if (filterCategory) {
    filterCategory.addEventListener("change", (e) => {
      currentFilters.category = e.target.value;
      currentPage = 1;
      renderFilteredTransactions();
    });
  }

  // Filter periode (hari ini / minggu ini / bulan ini / semua / custom)
  const filterPeriod = document.getElementById("filter-period");
  const customDateGroup = document.getElementById("custom-date-group");
  if (filterPeriod) {
    filterPeriod.addEventListener("change", (e) => {
      currentFilters.period = e.target.value;
      currentPage = 1;

      // Tampilkan/sembunyikan filter tanggal custom
      if (customDateGroup) {
        customDateGroup.style.display =
          currentFilters.period === "custom" ? "grid" : "none";
      }

      renderFilteredTransactions();
    });
  }

  // Filter tanggal custom: tanggal
  const filterCustomDay = document.getElementById("filter-custom-day");
  if (filterCustomDay) {
    filterCustomDay.addEventListener("change", (e) => {
      currentFilters.customDay = e.target.value;
      currentPage = 1;
      renderFilteredTransactions();
    });
  }

  // Filter tanggal custom: bulan
  const filterCustomMonth = document.getElementById("filter-custom-month");
  if (filterCustomMonth) {
    filterCustomMonth.addEventListener("change", (e) => {
      currentFilters.customMonth = e.target.value;
      currentPage = 1;
      renderFilteredTransactions();
    });
  }

  // Filter tanggal custom: tahun
  const filterCustomYear = document.getElementById("filter-custom-year");
  if (filterCustomYear) {
    filterCustomYear.addEventListener("change", (e) => {
      currentFilters.customYear = e.target.value;
      currentPage = 1;
      renderFilteredTransactions();
    });
  }

  // Reset filters
  const resetBtn = document.getElementById("reset-filters");
  if (resetBtn) {
    resetBtn.addEventListener("click", () => {
      currentFilters = {
        search: "",
        type: "all",
        walletId: "all",
        category: "all",
        period: getDefaultPeriod(),
        customDay: "all",
        customMonth: "all",
        customYear: "all",
      };
      if (searchInput) searchInput.value = "";
      if (filterType) filterType.value = "all";
      if (filterWallet) filterWallet.value = "all";
      if (filterCategory) filterCategory.value = "all";
      if (filterPeriod) filterPeriod.value = getDefaultPeriod();
      if (filterCustomDay) filterCustomDay.value = "all";
      if (filterCustomMonth) filterCustomMonth.value = "all";
      if (filterCustomYear) filterCustomYear.value = "all";
      if (customDateGroup) customDateGroup.style.display = "none";
      currentPage = 1;
      renderFilteredTransactions();
    });
  }
}

// Show modal untuk tambah/edit transaksi
// Pembungkus anti-ganda: abaikan klik/tap kedua selama modal masih dibuka/dimuat
async function showTransactionModal(transactionId = null) {
  if (txModalOpening || document.querySelector("[data-tx-modal]")) return;
  txModalOpening = true;
  try {
    await showTransactionModalImpl(transactionId);
    const overlays = document.querySelectorAll(".modal-overlay");
    overlays[overlays.length - 1]?.setAttribute("data-tx-modal", "1");
  } finally {
    txModalOpening = false;
  }
}

async function showTransactionModalImpl(transactionId = null) {
  ensureTxSheetStyles();
  const isEdit = transactionId !== null;
  let transaction = null;

  if (isEdit) {
    transaction = await getItem(STORES.TRANSACTIONS, transactionId);
    if (!transaction) {
      showToast("Transaksi tidak ditemukan", "error");
      return;
    }
  }

  // Load wallets dan categories
  const wallets = await getAllItems(STORES.WALLETS);
  const categories = await getAllItems(STORES.CATEGORIES);

  // Separate categories by type
  const expenseCategories = categories.filter((c) => c.type === "expense");
  const incomeCategories = categories.filter((c) => c.type === "income");

  const modalContent = `
        <form id="transaction-form">
            <div class="tx-sheet-scroll">
            <div class="form-group">
                <label>Tipe Transaksi</label>
                <div class="type-selector">
                    <button type="button" class="type-btn ${!isEdit || transaction.type === "expense" ? "active" : ""}" data-type="expense">
                        <span class="type-tri">${typeTriangle("expense")}</span> Pengeluaran
                    </button>
                    <button type="button" class="type-btn ${isEdit && transaction.type === "income" ? "active" : ""}" data-type="income">
                        <span class="type-tri">${typeTriangle("income")}</span> Pemasukan
                    </button>
                    <button type="button" class="type-btn ${isEdit && transaction.type === "saving" ? "active" : ""}" data-type="saving">
                        <i class="fas fa-piggy-bank"></i> Tabungan
                    </button>
                </div>
                <input type="hidden" id="transaction-type" value="${isEdit ? transaction.type : "expense"}">
            </div>
            
            <div class="form-row">
                <div class="form-group half">
                    <label>Nama Transaksi</label>
                    <input type="text" id="transaction-name" class="form-input" 
                           value="${isEdit ? escapeHtml(transaction.itemName) : ""}" 
                           placeholder="Contoh: Makan Siang, Belanja Bulanan..." required>
                </div>
                <div class="form-group half" id="transaction-template-group">
                    <label>Template</label>
                    <select id="transaction-template" class="form-input">
                        <option value="">Tanpa Template</option>
                    </select>
                </div>
            </div>
            
            <div class="form-group">
                <label>Nominal</label>
                <input type="text" inputmode="numeric" autocomplete="off" data-money id="transaction-amount" class="form-input" 
                       value="${isEdit ? formatMoneyInput(transaction.amount / (transaction.quantity || 1)) : ""}" 
                       placeholder="0" min="1" required>
            </div>

            <div class="form-group" id="transaction-quantity-group">
                <label>Jumlah</label>
                <div class="quantity-selector">
                    <button type="button" class="qty-btn" data-qty="1">1</button>
                    <button type="button" class="qty-btn" data-qty="2">2</button>
                    <button type="button" class="qty-btn" data-qty="3">3</button>
                    <button type="button" class="qty-btn" data-qty="4">4</button>
                    <button type="button" class="qty-btn" data-qty="5">5</button>
                    <button type="button" class="qty-btn" data-qty="other">Lainnya</button>
                </div>
                <input type="text" inputmode="numeric" autocomplete="off" id="transaction-quantity-custom" class="form-input"
                       placeholder="Masukkan jumlah" style="display:none;margin-top:8px;">
                <input type="hidden" id="transaction-quantity" value="${isEdit ? transaction.quantity || 1 : 1}">
            </div>
            
            <div class="form-group" id="transaction-category-group">
                <label>Kategori</label>
                <select id="transaction-category" class="form-input">
                    <option value="">Pilih Kategori</option>
                    <optgroup label="Pengeluaran">
                        ${expenseCategories
                          .map(
                            (cat) => `
                            <option value="${cat.name}" ${isEdit && transaction.category === cat.name && transaction.type === "expense" ? "selected" : ""}>
                                ${cat.name}
                            </option>
                        `,
                          )
                          .join("")}
                    </optgroup>
                    <optgroup label="Pemasukan">
                        ${incomeCategories
                          .map(
                            (cat) => `
                            <option value="${cat.name}" ${isEdit && transaction.category === cat.name && transaction.type === "income" ? "selected" : ""}>
                                ${cat.name}
                            </option>
                        `,
                          )
                          .join("")}
                    </optgroup>
                </select>
            </div>
            
            <div class="form-group">
                <label>Metode Pembayaran</label>
                <select id="transaction-wallet" class="form-input" required>
                    <option value="">Pilih Dompet</option>
                    ${wallets
                      .map(
                        (w) => `
                        <option value="${w.id}" ${isEdit && transaction.walletId === w.id ? "selected" : ""}>
                            ${w.name} - ${formatCurrency(w.balance)}
                        </option>
                    `,
                      )
                      .join("")}
                </select>
            </div>
            
            <div class="form-group">
                <label>Catatan (Opsional)</label>
                <textarea id="transaction-note" class="form-input" rows="2" 
                          placeholder="Tambahkan catatan...">${isEdit ? escapeHtml(transaction.note || "") : ""}</textarea>
            </div>
            
            <div class="form-row">
                <div class="form-group half">
                    <label>Tanggal</label>
                    <input type="date" id="transaction-date" class="form-input" 
                           value="${isEdit ? transaction.date : getCurrentDateTime().date}">
                </div>
                <div class="form-group half">
                    <label>Jam</label>
                    <input type="time" id="transaction-time" class="form-input" 
                           value="${isEdit ? transaction.time : getCurrentDateTime().time}">
                </div>
            </div>
            
            ${
              isEdit
                ? ""
                : `<div class="form-group" id="transaction-save-template-group">
                <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-weight:500;">
                    <input type="checkbox" id="transaction-save-template" style="width:auto;margin:0;">
                    Jadikan transaksi ini template
                </label>
            </div>`
            }
            </div>

            <div class="modal-buttons tx-sheet-footer">
                <button type="button" class="btn-secondary modal-close-btn">Batal</button>
                <button type="submit" class="btn-primary">${isEdit ? "Simpan Perubahan" : "Tambah Transaksi"}</button>
            </div>
        </form>
    `;

  // Create modal
  const modal = document.createElement("div");
  modal.className = "modal-overlay tx-sheet-overlay";
  modal.innerHTML = `
        <div class="modal-container modal-large tx-sheet">
            <div class="modal-header">
                <h3><i class="fas ${isEdit ? "fa-edit" : "fa-plus-circle"}"></i> ${isEdit ? "Edit Transaksi" : "Tambah Transaksi Baru"}</h3>
                <button class="modal-close-btn modal-close-x">&times;</button>
            </div>
            <div class="modal-body">
                ${modalContent}
            </div>
        </div>
    `;

  document.body.appendChild(modal);

  // Add inline styles for form-row
  const style = document.createElement("style");
  style.textContent = `
        .form-row {
            display: flex;
            gap: 12px;
        }
        .form-group.half {
            flex: 1;
        }
        @media (max-width: 768px) {
            .form-row {
                flex-direction: column;
                gap: 0;
            }
        }
        .modal-close-x {
            background: none;
            border: none;
            font-size: 24px;
            cursor: pointer;
            color: var(--text-secondary);
            padding: 0 8px;
        }
        .modal-close-x:hover {
            color: var(--text-primary);
        }
    `;
  document.head.appendChild(style);

  // Setup type selector
  const typeBtns = modal.querySelectorAll(".type-btn");
  const typeInput = modal.querySelector("#transaction-type");
  const categorySelect = modal.querySelector("#transaction-category");
  const categoryGroup = modal.querySelector("#transaction-category-group");
  const templateSelect = modal.querySelector("#transaction-template");
  const templateGroup = modal.querySelector("#transaction-template-group");
  const quantityGroup = modal.querySelector("#transaction-quantity-group");
  const quantityInput = modal.querySelector("#transaction-quantity");
  const quantityCustomInput = modal.querySelector(
    "#transaction-quantity-custom",
  );
  const qtyBtns = modal.querySelectorAll(".qty-btn");

  // Quantity hanya berlaku untuk Pengeluaran/Pemasukan (bukan Tabungan)
  function updateQuantityVisibility() {
    quantityGroup.style.display = typeInput.value === "saving" ? "none" : "";
  }

  function setQuantitySelection(qty) {
    const isPreset = ["1", "2", "3", "4", "5"].includes(String(qty));
    qtyBtns.forEach((b) => {
      b.classList.toggle(
        "active",
        isPreset ? b.dataset.qty === String(qty) : b.dataset.qty === "other",
      );
    });
    quantityCustomInput.style.display = isPreset ? "none" : "";
    // Tampilan diformat ribuan ("1.000"); nilai hidden tetap angka murni
    if (!isPreset)
      quantityCustomInput.value = qty > 0 ? formatMoneyInput(qty) : "";
    quantityInput.value = qty;
  }

  qtyBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      if (btn.dataset.qty === "other") {
        qtyBtns.forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        quantityCustomInput.style.display = "";
        quantityCustomInput.focus();
        quantityInput.value = quantityCustomInput.value.replace(/\D/g, "");
      } else {
        setQuantitySelection(btn.dataset.qty);
      }
    });
  });

  quantityCustomInput.addEventListener("input", () => {
    const digits = quantityCustomInput.value.replace(/\D/g, "");
    quantityCustomInput.value = formatMoneyInput(digits); // "1000" -> "1.000"
    quantityInput.value = digits; // nilai yang dipakai/disimpan: "1000"
  });

  // Set state awal quantity (existing transaction atau default 1)
  setQuantitySelection(isEdit ? transaction.quantity || 1 : 1);
  updateQuantityVisibility();

  // Template hanya berlaku untuk Pengeluaran/Pemasukan (bukan Tabungan)
  async function updateTemplateOptions() {
    const currentType = typeInput.value;

    const saveTplGroup = modal.querySelector(
      "#transaction-save-template-group",
    );
    if (saveTplGroup) {
      const canTemplate = currentType === "income" || currentType === "expense";
      saveTplGroup.style.display = canTemplate ? "" : "none";
      if (!canTemplate) {
        modal.querySelector("#transaction-save-template").checked = false;
      }
    }

    if (currentType !== "income" && currentType !== "expense") {
      templateGroup.style.display = "none";
      templateSelect.value = "";
      return;
    }
    templateGroup.style.display = "";

    let templates = [];
    try {
      templates = await getTemplatesByType(currentType);
    } catch (err) {
      console.error("Gagal memuat template:", err);
    }

    templateSelect.innerHTML =
      `<option value="">Tanpa Template</option>` +
      templates
        .map((t) => `<option value="${t.id}">${escapeHtml(t.name)}</option>`)
        .join("");
  }

  // Pilih template = autofill form saja, TIDAK membuat transaksi
  templateSelect.addEventListener("change", async () => {
    const templateId = Number(templateSelect.value);
    if (!templateId) return;

    const currentType = typeInput.value;
    let templates = [];
    try {
      templates = await getTemplatesByType(currentType);
    } catch (err) {
      console.error("Gagal memuat template:", err);
      return;
    }
    const tpl = templates.find((t) => t.id === templateId);
    if (!tpl) return;

    modal.querySelector("#transaction-name").value = tpl.name;
    modal.querySelector("#transaction-amount").value = formatMoneyInput(
      tpl.amount,
    );
    // Template lama belum punya quantity -> default 1; jika template punya
    // quantity (future-safe), gunakan nilai tersebut.
    setQuantitySelection(tpl.quantity || 1);

    // Kategori: hanya isi kalau kategori template masih tersedia untuk tipe ini
    if (tpl.category) {
      const optionExists = Array.from(categorySelect.options).some(
        (opt) => opt.value === tpl.category,
      );
      if (optionExists) categorySelect.value = tpl.category;
    }

    // Wallet: hanya isi kalau dompet template masih ada (belum dihapus)
    if (tpl.walletId) {
      const walletSelect = modal.querySelector("#transaction-wallet");
      const walletExists = Array.from(walletSelect.options).some(
        (opt) => opt.value === tpl.walletId,
      );
      if (walletExists) walletSelect.value = tpl.walletId;
    }

    if (tpl.note) {
      modal.querySelector("#transaction-note").value = tpl.note;
    }
  });

  function updateCategoryOptions() {
    const currentType = typeInput.value;

    // Tipe "Tabungan" tidak butuh kategori (otomatis "Tabungan")
    if (currentType === "saving") {
      categoryGroup.style.display = "none";
      return;
    }
    categoryGroup.style.display = "";

    const filtered =
      currentType === "expense" ? expenseCategories : incomeCategories;
    categorySelect.innerHTML =
      `<option value="">Pilih Kategori</option>` +
      filtered
        .map(
          (cat) => `
        <option value="${cat.name}" ${isEdit && transaction?.category === cat.name ? "selected" : ""}>
          ${cat.name}
        </option>
      `,
        )
        .join("");
  }

  typeBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      typeBtns.forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      typeInput.value = btn.dataset.type;
      updateCategoryOptions();
      updateTemplateOptions();
      updateQuantityVisibility();
    });
  });

  updateCategoryOptions();
  updateTemplateOptions();

  // Handle form submission
  const form = modal.querySelector("#transaction-form");
  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const name = modal.querySelector("#transaction-name").value.trim();
    const amountRaw = modal.querySelector("#transaction-amount").value;
    const unitPrice = parseMoney(amountRaw);
    const type = typeInput.value;

    // Quantity hanya berlaku untuk expense/income; tipe saving selalu 1
    let quantity = 1;
    if (type !== "saving") {
      quantity = parseInt(quantityInput.value, 10);
    }
    let category = modal.querySelector("#transaction-category").value;
    const walletId = modal.querySelector("#transaction-wallet").value;
    const note = modal.querySelector("#transaction-note").value;
    const date = modal.querySelector("#transaction-date").value;
    const time = modal.querySelector("#transaction-time").value;
    const saveAsTemplate =
      !isEdit &&
      (type === "income" || type === "expense") &&
      !!modal.querySelector("#transaction-save-template")?.checked;

    // Validasi
    if (!name) {
      showToast("Nama transaksi harus diisi", "error");
      return;
    }

    if (isNaN(unitPrice) || unitPrice <= 0) {
      showToast("Nominal harus lebih dari 0", "error");
      return;
    }

    if (isNaN(quantity) || !Number.isInteger(quantity) || quantity <= 0) {
      showToast("Jumlah harus berupa angka positif", "error");
      return;
    }

    const amount = unitPrice * quantity;

    if (!walletId) {
      showToast("Pilih metode pembayaran", "error");
      return;
    }

    // Tipe "Tabungan" otomatis pakai kategori "Tabungan", tidak perlu dipilih user
    if (type === "saving") {
      category = "Tabungan";
    } else if (!category) {
      category = type === "income" ? "Gaji" : "Makanan";
    }

    // ─────────────────────────────────────────────────────────
    // commitTransaction(): benar-benar menulis ke database.
    // Dipanggil langsung untuk tipe pengeluaran/pemasukan, atau
    // setelah user memilih tabungan tujuan untuk tipe "saving".
    //
    // Strategi: SELALU balikin dulu efek transaksi versi LAMA
    // (kalau sedang edit), baru terapkan efek versi BARU. Ini
    // berlaku seragam untuk semua kombinasi perubahan tipe,
    // termasuk saat pindah dari/ke tipe "saving".
    // ─────────────────────────────────────────────────────────
    const commitTransaction = async (savingId = null) => {
      // 1. EDIT: balikin efek transaksi lama dulu
      if (isEdit) {
        const oldWallet = await getItem(STORES.WALLETS, transaction.walletId);
        if (oldWallet) {
          if (transaction.type === "income") {
            oldWallet.balance -= transaction.amount;
          } else {
            // expense DAN saving sama-sama mengurangi saldo dompet,
            // jadi cara membalikkannya pun sama: ditambah lagi
            oldWallet.balance += transaction.amount;
          }
          await updateItem(STORES.WALLETS, oldWallet);
        }

        // Kalau transaksi lama bertipe tabungan, balikin juga efeknya
        // ke target tabungan yang lama
        if (transaction.type === "saving" && transaction.savingId) {
          const oldSaving = await getItem(STORES.SAVINGS, transaction.savingId);
          if (oldSaving) {
            oldSaving.currentAmount = Math.max(
              0,
              oldSaving.currentAmount - transaction.amount,
            );
            oldSaving.status =
              oldSaving.currentAmount >= oldSaving.targetAmount
                ? "completed"
                : "active";
            oldSaving.updatedAt = getCurrentDateTime().datetime;
            if (Array.isArray(oldSaving.history)) {
              oldSaving.history = oldSaving.history.filter(
                (h) => h.transactionId !== transaction.id,
              );
            }
            await updateItem(STORES.SAVINGS, oldSaving);
          }
        }
      }

      // 2. Ambil dompet TUJUAN secara fresh (setelah efek lama dibalikin)
      const wallet = await getItem(STORES.WALLETS, walletId);
      if (!wallet) {
        showToast("Dompet tidak ditemukan", "error");
        return;
      }

      // 3. Cek saldo cukup — expense DAN saving sama-sama ambil dari saldo dompet
      if (
        (type === "expense" || type === "saving") &&
        wallet.balance < amount
      ) {
        showToast(
          `Saldo ${wallet.name} tidak mencukupi! (Saldo: ${formatCurrency(wallet.balance)})`,
          "error",
        );
        return;
      }

      // 4. Simpan / update data transaksi
      const payload = {
        itemName: capitalize(name),
        amount,
        quantity,
        type,
        category,
        walletId,
        note,
        date,
        time,
        savingId: type === "saving" ? savingId : null,
      };

      let txId;
      if (isEdit) {
        Object.assign(transaction, payload);
        transaction.updatedAt = getCurrentDateTime().datetime;
        await updateItem(STORES.TRANSACTIONS, transaction);
        txId = transaction.id;
      } else {
        payload.createdAt = getCurrentDateTime().timestamp;
        txId = await addItem(STORES.TRANSACTIONS, payload);
      }

      // 5. Terapkan efek baru ke saldo dompet
      if (type === "income") {
        wallet.balance += amount;
      } else {
        wallet.balance -= amount;
      }
      await updateItem(STORES.WALLETS, wallet);

      // 6. Tipe "Tabungan": tambahkan ke tabungan tujuan + catat riwayatnya
      if (type === "saving" && savingId) {
        const saving = await getItem(STORES.SAVINGS, savingId);
        if (saving) {
          saving.currentAmount += amount;
          saving.status =
            saving.currentAmount >= saving.targetAmount
              ? "completed"
              : "active";
          saving.updatedAt = getCurrentDateTime().datetime;
          if (!Array.isArray(saving.history)) saving.history = [];
          saving.history.push({
            type: "deposit",
            amount,
            note: note || `Dari transaksi: ${capitalize(name)}`,
            date: new Date().toISOString(),
            previousAmount: saving.currentAmount - amount,
            newAmount: saving.currentAmount,
            source: "transaction",
            transactionId: txId,
          });
          await updateItem(STORES.SAVINGS, saving);
        }
      }

      // Opsional: jadikan transaksi ini template (tanpa duplikat)
      let templateSaved = false;
      if (saveAsTemplate) {
        try {
          const tplName = capitalize(name);
          const existing = await getTemplatesByType(type);
          const isDuplicate = existing.some(
            (t) =>
              (t.name || "").toLowerCase() === tplName.toLowerCase() &&
              t.amount === unitPrice &&
              t.category === category &&
              t.walletId === walletId,
          );
          if (!isDuplicate) {
            const nowIso = new Date().toISOString();
            await addItem(STORES.TEMPLATES, {
              name: tplName,
              amount: unitPrice,
              quantity,
              type,
              category,
              walletId,
              note,
              createdAt: nowIso,
              updatedAt: nowIso,
            });
            templateSaved = true;
          }
        } catch (err) {
          console.error("Gagal menyimpan template:", err);
        }
      }

      showToast(
        isEdit
          ? "Transaksi berhasil diupdate"
          : templateSaved
            ? "Transaksi ditambahkan & disimpan sebagai template"
            : "Transaksi berhasil ditambahkan",
        "success",
      );

      modal.remove();
      style.remove();
      await loadTransactions();
      renderFilteredTransactions();

      // Refresh dashboard if needed
      if (window.renderDashboard) {
        await window.renderDashboard();
      }
    };

    // Tipe "Tabungan": minta user pilih tabungan tujuan dulu sebelum disimpan
    if (type === "saving") {
      await showSelectSavingGoalModal(
        amount,
        capitalize(name),
        isEdit ? transaction.savingId : null,
        async (savingId) => {
          await commitTransaction(savingId);
        },
        undefined,
        {
          previousAmount:
            isEdit && transaction.type === "saving" ? transaction.amount : 0,
        },
      );
    } else {
      await commitTransaction(null);
    }
  });

  // Close modal functions
  const closeModal = () => {
    modal.remove();
    style.remove();
  };

  modal.querySelectorAll(".modal-close-btn").forEach((btn) => {
    btn.addEventListener("click", closeModal);
  });
  // Modal hanya bisa ditutup lewat tombol Batal atau tombol silang (X);
  // klik area di luar modal sengaja tidak menutup agar input tidak hilang.
}

// Style modal "Pilih Tabungan Tujuan" (tambahan di atas gaya sheet transaksi)
function ensureSavingGoalStyles() {
  if (document.getElementById("saving-goal-styles")) return;
  const style = document.createElement("style");
  style.id = "saving-goal-styles";
  style.textContent = `
    .sg-summary {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 12px;
      margin-bottom: 16px;
      padding: 14px 16px;
      border-radius: 16px;
      background: rgba(139, 92, 246, 0.1);
    }
    .sg-summary-name {
      min-width: 0;
      font-size: 0.88rem;
      color: var(--text-secondary, #6F6F7B);
      overflow-wrap: anywhere;
    }
    .sg-summary-amount {
      flex: none;
      font-size: 1.05rem;
      font-weight: 700;
      color: #8b5cf6;
      white-space: nowrap;
    }
    .sg-preview {
      margin-top: 4px;
      padding: 12px 14px;
      border-radius: 14px;
      background: var(--bg-primary, #F4F4F7);
      font-size: 0.82rem;
      color: var(--text-primary, #242333);
    }
    .sg-preview[hidden] { display: none; }
    .sg-preview-top {
      display: flex;
      justify-content: space-between;
      gap: 8px;
      margin-bottom: 8px;
    }
    .sg-preview-top span { color: var(--text-secondary, #6F6F7B); }
    .sg-preview-top strong { font-variant-numeric: tabular-nums; }
    .sg-bar {
      height: 8px;
      border-radius: 999px;
      background: var(--border-color, #E4E4EA);
      overflow: hidden;
    }
    .sg-bar > span {
      display: block;
      height: 100%;
      border-radius: 999px;
      background: #8b5cf6;
      transition: width 0.25s ease;
    }
    .sg-bar.done > span { background: #16A34A; }
  `;
  document.head.appendChild(style);
}

// Naikkan overlay di atas semua modal yang sedang terbuka (mis. modal transaksi),
// supaya modal pilih tabungan tidak tertimpa modal di bawahnya
function raiseAboveOverlays(modal) {
  let top = 0;
  document.querySelectorAll(".modal-overlay").forEach((el) => {
    if (el === modal) return;
    const z = parseInt(getComputedStyle(el).zIndex, 10);
    if (!isNaN(z) && z > top) top = z;
  });
  if (top > 0)
    modal.style.setProperty("z-index", String(top + 10), "important");
}

// Modal untuk memilih tabungan tujuan (dipakai saat transaksi bertipe "saving").
// Tampil di atas modal transaksi dengan desain sheet yang sama.
// options.previousAmount: nominal transaksi lama saat edit (agar pratinjau tidak dobel hitung)
export async function showSelectSavingGoalModal(
  amount,
  itemName,
  preselectedId,
  onConfirm,
  helpText = "Nominal transaksi ini akan langsung ditambahkan ke tabungan yang dipilih.",
  options = {},
) {
  ensureTxSheetStyles();
  const savings = await getAllItems(STORES.SAVINGS);

  if (savings.length === 0) {
    showToast(
      "Belum ada target tabungan. Buat dulu target tabungan di halaman Tabungan.",
      "error",
    );
    return;
  }

  ensureSavingGoalStyles();
  // Cegah modal ganda kalau tombol ditekan berulang
  document.getElementById("saving-goal-modal")?.remove();

  const previousAmount = Number(options.previousAmount) || 0;
  const baseOf = (s) =>
    s.id === preselectedId
      ? Math.max(0, (s.currentAmount || 0) - previousAmount)
      : s.currentAmount || 0;

  const modal = document.createElement("div");
  modal.id = "saving-goal-modal";
  modal.className = "modal-overlay tx-sheet-overlay";
  modal.innerHTML = `
    <div class="modal-container modal-large tx-sheet">
      <div class="modal-header">
        <h3><i class="fas fa-piggy-bank"></i> Pilih Tabungan Tujuan</h3>
        <button type="button" class="modal-close-btn modal-close-x" aria-label="Tutup">&times;</button>
      </div>
      <div class="modal-body">
        <form id="saving-goal-form">
          <div class="tx-sheet-scroll">
            <div class="sg-summary">
              <span class="sg-summary-name">${escapeHtml(itemName)}</span>
              <strong class="sg-summary-amount">${formatCurrency(amount)}</strong>
            </div>
            <div class="form-group">
              <label for="select-saving-goal">Masukkan ke tabungan mana?</label>
              <select id="select-saving-goal" class="form-input" required>
                <option value="">Pilih Tabungan</option>
                ${savings
                  .map(
                    (s) => `
                  <option value="${s.id}" ${preselectedId === s.id ? "selected" : ""}>
                    ${escapeHtml(s.name)} (${formatCurrency(s.currentAmount)} / ${formatCurrency(s.targetAmount)})
                  </option>`,
                  )
                  .join("")}
              </select>
              <small class="form-help">${helpText}</small>
            </div>
            <div class="sg-preview" id="sg-preview" hidden>
              <div class="sg-preview-top">
                <span>Setelah ditabung</span>
                <strong id="sg-preview-text"></strong>
              </div>
              <div class="sg-bar" id="sg-bar"><span id="sg-bar-fill" style="width:0%"></span></div>
            </div>
          </div>
          <div class="modal-buttons tx-sheet-footer">
            <button type="button" class="btn-secondary modal-close-btn">Batal</button>
            <button type="submit" class="btn-primary" id="confirm-select-saving">Konfirmasi</button>
          </div>
        </form>
      </div>
    </div>
  `;

  document.body.appendChild(modal);
  raiseAboveOverlays(modal);

  const closeModal = () => modal.remove();
  modal.querySelectorAll(".modal-close-btn").forEach((btn) => {
    btn.addEventListener("click", closeModal);
  });
  // Modal hanya bisa ditutup lewat tombol Batal atau tombol silang (X);
  // klik area di luar modal sengaja tidak menutup agar input tidak hilang.

  const select = modal.querySelector("#select-saving-goal");
  const preview = modal.querySelector("#sg-preview");
  const updatePreview = () => {
    const saving = savings.find((s) => String(s.id) === select.value);
    if (!saving) {
      preview.hidden = true;
      return;
    }
    const after = baseOf(saving) + amount;
    const target = saving.targetAmount || 0;
    const pct =
      target > 0 ? Math.min(100, Math.round((after / target) * 100)) : 0;
    modal.querySelector("#sg-preview-text").textContent =
      `${formatCurrency(after)} / ${formatCurrency(target)} (${pct}%)`;
    modal.querySelector("#sg-bar-fill").style.width = `${pct}%`;
    modal
      .querySelector("#sg-bar")
      .classList.toggle("done", target > 0 && after >= target);
    preview.hidden = false;
  };
  select.addEventListener("change", updatePreview);
  updatePreview();
  select.focus();

  modal
    .querySelector("#saving-goal-form")
    .addEventListener("submit", async (e) => {
      e.preventDefault();
      const savingIdRaw = select.value;
      if (!savingIdRaw) {
        showToast("Pilih tabungan tujuan dulu", "error");
        return;
      }
      // STORES.SAVINGS pakai autoIncrement (id berupa number), sedangkan
      // <select>.value selalu string - wajib dikonversi supaya getItem() nanti
      // tidak gagal karena mismatch tipe data (IndexedDB key matching strict)
      const savingId = parseInt(savingIdRaw, 10);
      closeModal();
      await onConfirm(savingId);
    });
}

// ==================== TRANSAKSI BANYAK ====================
// Satu belanja dengan banyak barang = SATU record di store "transactions".
// Record parent: amount = total semua barang, type = "expense", isMultiItem = true,
// items = [{ itemName, amount (harga satuan), quantity, category }].
// Tidak ada record per barang, sehingga saldo/report/summary otomatis hanya
// melihat parent.amount satu kali.
const MULTI_DEFAULT_NAME = "Transaksi Banyak";
const MULTI_MIN_ITEMS = 2;

function newBlankMultiItem() {
  return { name: "", price: "", qty: "1", qtyOther: false, category: "" };
}

// Escape untuk dipakai di dalam atribut HTML (kutip ikut di-escape)
function escapeAttr(text) {
  return escapeHtml(String(text ?? "")).replace(/"/g, "&quot;");
}

// Total satu barang = harga satuan × jumlah. 0 jika input belum valid.
function calcMultiItemTotal(item) {
  const price = parseMoney(item.price);
  const qty = /^\d+$/.test(item.qty) ? parseInt(item.qty, 10) : NaN;
  if (!Number.isFinite(price) || price <= 0) return 0;
  if (!Number.isInteger(qty) || qty <= 0) return 0;
  return price * qty;
}

function idbRequest(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

// Simpan transaksi banyak + update saldo dompet dalam SATU transaksi IndexedDB.
// Jika ada langkah yang gagal, seluruhnya dibatalkan (tidak ada data setengah jadi).
// oldRecord != null berarti edit: efek lama dibalikkan, efek baru diterapkan,
// semuanya di transaksi yang sama.
function saveMultiTransactionAtomic(record, oldRecord) {
  return initDB().then(
    (db) =>
      new Promise((resolve) => {
        const tx = db.transaction(
          [STORES.TRANSACTIONS, STORES.WALLETS],
          "readwrite",
        );
        const txStore = tx.objectStore(STORES.TRANSACTIONS);
        const walletStore = tx.objectStore(STORES.WALLETS);
        let outcome = { ok: false, error: "aborted" };

        tx.oncomplete = () => resolve({ ok: true });
        tx.onabort = () => resolve(outcome);

        (async () => {
          try {
            const newWallet = await idbRequest(
              walletStore.get(record.walletId),
            );
            if (!newWallet) {
              outcome = { ok: false, error: "wallet-missing" };
              tx.abort();
              return;
            }

            // Edit: kembalikan dulu efek transaksi lama (selalu expense)
            let oldWallet = null;
            if (oldRecord) {
              oldWallet =
                oldRecord.walletId === record.walletId
                  ? newWallet
                  : await idbRequest(walletStore.get(oldRecord.walletId));
              if (oldWallet) oldWallet.balance += oldRecord.amount;
            }

            // Cek saldo SEBELUM menulis apa pun
            if (newWallet.balance < record.amount) {
              outcome = { ok: false, error: "insufficient", wallet: newWallet };
              tx.abort();
              return;
            }

            // Terapkan efek baru: kurangi saldo sebesar total, satu kali
            newWallet.balance -= record.amount;
            if (oldWallet && oldWallet !== newWallet) {
              walletStore.put(oldWallet);
            }
            walletStore.put(newWallet);

            if (oldRecord) txStore.put(record);
            else txStore.add(record);
          } catch (err) {
            console.error("Gagal menyimpan transaksi banyak:", err);
            outcome = { ok: false, error: "exception" };
            try {
              tx.abort();
            } catch (_) {
              /* transaksi sudah selesai/abort */
            }
          }
        })();
      }),
  );
}

// Form tambah/edit Transaksi Banyak
async function showMultiTransactionModal(transactionId = null) {
  if (txModalOpening || document.querySelector("[data-tx-modal]")) return;
  txModalOpening = true;
  try {
    await showMultiTransactionModalImpl(transactionId);
    const overlays = document.querySelectorAll(".modal-overlay");
    overlays[overlays.length - 1]?.setAttribute("data-tx-modal", "1");
  } finally {
    txModalOpening = false;
  }
}

async function showMultiTransactionModalImpl(transactionId = null) {
  ensureTxSheetStyles();
  const isEdit = transactionId !== null;
  let transaction = null;

  if (isEdit) {
    transaction = await getItem(STORES.TRANSACTIONS, transactionId);
    if (!transaction || transaction.isMultiItem !== true) {
      showToast("Transaksi tidak ditemukan", "error");
      return;
    }
  }

  const wallets = await getAllItems(STORES.WALLETS);
  const categories = await getAllItems(STORES.CATEGORIES);
  const expenseCategories = categories.filter((c) => c.type === "expense");

  // State barang (sumber kebenaran form; DOM hanya cerminannya)
  const items =
    isEdit && Array.isArray(transaction.items)
      ? transaction.items.map((i) => {
          const qty = String(i.quantity || 1);
          return {
            name: i.itemName || "",
            price: formatMoneyInput(i.amount),
            qty,
            qtyOther: !["1", "2", "3", "4", "5"].includes(qty),
            category: i.category || "",
          };
        })
      : [];
  while (items.length < MULTI_MIN_ITEMS) items.push(newBlankMultiItem());

  function categoryOptionsHtml(selected) {
    // Kategori lama yang sudah dihapus tetap ditampilkan agar data tidak hilang diam-diam
    const extra =
      selected && !expenseCategories.some((c) => c.name === selected)
        ? `<option value="${escapeAttr(selected)}" selected>${escapeHtml(selected)}</option>`
        : "";
    return (
      `<option value="">Pilih Kategori</option>` +
      extra +
      expenseCategories
        .map(
          (c) =>
            `<option value="${escapeAttr(c.name)}" ${c.name === selected ? "selected" : ""}>${escapeHtml(c.name)}</option>`,
        )
        .join("")
    );
  }

  function itemsHtml() {
    return items
      .map((it, i) => {
        const qtyBtns = ["1", "2", "3", "4", "5"]
          .map(
            (q) =>
              `<button type="button" class="qty-btn ${!it.qtyOther && it.qty === q ? "active" : ""}" data-qty="${q}">${q}</button>`,
          )
          .join("");
        return `
        <div class="multi-item" data-index="${i}">
            <div class="multi-item-header">
                <span class="multi-item-title">Barang ${i + 1}</span>
                ${
                  items.length > MULTI_MIN_ITEMS
                    ? `<button type="button" class="icon-btn multi-item-remove" title="Hapus barang" aria-label="Hapus Barang ${i + 1}"><i class="fas fa-trash"></i></button>`
                    : ""
                }
            </div>
            <div class="form-group">
                <label>Nama Barang</label>
                <input type="text" class="form-input multi-item-name" value="${escapeAttr(it.name)}" placeholder="Contoh: Indomie Goreng" autocomplete="off">
            </div>
            <div class="multi-form-row">
                <div class="form-group">
                    <label>Harga Satuan</label>
                    <input type="text" inputmode="numeric" autocomplete="off" data-money class="form-input multi-item-price" value="${escapeAttr(formatMoneyInput(it.price))}" placeholder="0">
                </div>
                <div class="form-group">
                    <label>Total Barang</label>
                    <div class="multi-item-total">${formatCurrency(calcMultiItemTotal(it))}</div>
                </div>
            </div>
            <div class="form-group">
                <label>Jumlah</label>
                <div class="quantity-selector">
                    ${qtyBtns}
                    <button type="button" class="qty-btn ${it.qtyOther ? "active" : ""}" data-qty="other">Lainnya</button>
                </div>
                <input type="text" inputmode="numeric" autocomplete="off" class="form-input multi-item-qty-custom" value="${it.qtyOther ? escapeAttr(formatMoneyInput(it.qty)) : ""}" placeholder="Masukkan jumlah" ${it.qtyOther ? "" : "hidden"}>
            </div>
            <div class="form-group">
                <label>Kategori</label>
                <select class="form-input multi-item-category">${categoryOptionsHtml(it.category)}</select>
            </div>
        </div>`;
      })
      .join("");
  }

  const modal = document.createElement("div");
  modal.className = "modal-overlay tx-sheet-overlay";
  modal.innerHTML = `
        <div class="modal-container modal-large tx-sheet">
            <div class="modal-header">
                <h3><i class="fas fa-shopping-basket"></i> ${isEdit ? "Edit Transaksi Banyak" : "Transaksi Banyak"}</h3>
                <button class="modal-close-btn modal-close-x">&times;</button>
            </div>
            <div class="modal-body">
                <form id="multi-transaction-form" novalidate>
                    <div class="tx-sheet-scroll">
                    <div class="form-group">
                        <label>Nama Transaksi</label>
                        <input type="text" id="multi-name" class="form-input" value="${isEdit ? escapeAttr(transaction.itemName) : ""}" placeholder="${MULTI_DEFAULT_NAME} (contoh: Belanja Indomaret)">
                    </div>
                    <div class="form-group">
                        <label>Dompet</label>
                        <select id="multi-wallet" class="form-input">
                            <option value="">Pilih Dompet</option>
                            ${wallets
                              .map(
                                (w) =>
                                  `<option value="${escapeAttr(w.id)}" ${isEdit && transaction.walletId === w.id ? "selected" : ""}>${escapeHtml(w.name)} - ${formatCurrency(w.balance)}</option>`,
                              )
                              .join("")}
                        </select>
                    </div>
                    <div class="multi-form-row">
                        <div class="form-group">
                            <label>Tanggal</label>
                            <input type="date" id="multi-date" class="form-input" value="${isEdit ? transaction.date : getCurrentDateTime().date}">
                        </div>
                        <div class="form-group">
                            <label>Jam</label>
                            <input type="time" id="multi-time" class="form-input" value="${isEdit ? transaction.time || "" : getCurrentDateTime().time}">
                        </div>
                    </div>
                    <div class="form-group">
                        <label>Catatan (Opsional)</label>
                        <textarea id="multi-note" class="form-input" rows="2" placeholder="Tambahkan catatan...">${isEdit ? escapeHtml(transaction.note || "") : ""}</textarea>
                    </div>

                    <div class="multi-section-title">Barang yang Dibeli</div>
                    <div id="multi-items">${itemsHtml()}</div>
                    <button type="button" class="btn-secondary multi-add-btn" id="multi-add-item">
                        <i class="fas fa-plus"></i> Tambah Barang
                    </button>
                    </div>

                    <div class="multi-footer tx-sheet-footer">
                        <div class="multi-total-row">
                            <span>Total Transaksi</span>
                            <span id="multi-total">${formatCurrency(0)}</span>
                        </div>
                        <div class="modal-buttons">
                            <button type="button" class="btn-secondary modal-close-btn">Batal</button>
                            <button type="submit" class="btn-primary" id="multi-submit">${isEdit ? "Simpan Perubahan" : "Simpan Transaksi"}</button>
                        </div>
                    </div>
                </form>
            </div>
        </div>
    `;
  document.body.appendChild(modal);

  const itemsContainer = modal.querySelector("#multi-items");
  const totalEl = modal.querySelector("#multi-total");

  function updateTotals() {
    const grand = items.reduce((sum, it) => sum + calcMultiItemTotal(it), 0);
    totalEl.textContent = formatCurrency(grand);
  }

  function rerenderItems() {
    itemsContainer.innerHTML = itemsHtml();
    updateTotals();
  }

  function itemIndexOf(el) {
    const block = el.closest(".multi-item");
    return block ? Number(block.dataset.index) : -1;
  }

  // Sinkronkan tampilan Jumlah satu barang tanpa merender ulang seluruh daftar
  function syncQtyUi(block, it) {
    block.querySelectorAll(".qty-btn").forEach((b) => {
      b.classList.toggle(
        "active",
        it.qtyOther ? b.dataset.qty === "other" : b.dataset.qty === it.qty,
      );
    });
    const custom = block.querySelector(".multi-item-qty-custom");
    custom.hidden = !it.qtyOther;
    if (it.qtyOther) custom.value = formatMoneyInput(it.qty);
  }

  itemsContainer.addEventListener("input", (e) => {
    const i = itemIndexOf(e.target);
    if (i < 0) return;
    const it = items[i];
    const block = e.target.closest(".multi-item");

    if (e.target.classList.contains("multi-item-name")) {
      it.name = e.target.value;
    } else if (e.target.classList.contains("multi-item-price")) {
      it.price = e.target.value;
      block.querySelector(".multi-item-total").textContent = formatCurrency(
        calcMultiItemTotal(it),
      );
    } else if (e.target.classList.contains("multi-item-qty-custom")) {
      // Tampilan "1.000", nilai state tetap digit murni "1000"
      const digits = e.target.value.replace(/\D/g, "");
      e.target.value = formatMoneyInput(digits);
      it.qty = digits;
      block.querySelector(".multi-item-total").textContent = formatCurrency(
        calcMultiItemTotal(it),
      );
    } else {
      return;
    }
    updateTotals();
  });

  itemsContainer.addEventListener("change", (e) => {
    if (!e.target.classList.contains("multi-item-category")) return;
    const i = itemIndexOf(e.target);
    if (i >= 0) items[i].category = e.target.value;
  });

  itemsContainer.addEventListener("click", (e) => {
    const removeBtn = e.target.closest(".multi-item-remove");
    if (removeBtn) {
      const i = itemIndexOf(removeBtn);
      if (i >= 0 && items.length > MULTI_MIN_ITEMS) {
        items.splice(i, 1);
        rerenderItems();
      }
      return;
    }

    const qtyBtn = e.target.closest(".qty-btn");
    if (qtyBtn) {
      const i = itemIndexOf(qtyBtn);
      if (i < 0) return;
      const it = items[i];
      const block = qtyBtn.closest(".multi-item");
      if (qtyBtn.dataset.qty === "other") {
        // Sama seperti form transaksi biasa: pindah dari preset ke "Lainnya"
        // mengosongkan input custom; jika sudah mode "Lainnya", angka dipertahankan
        if (!it.qtyOther) it.qty = "";
        it.qtyOther = true;
        syncQtyUi(block, it);
        block.querySelector(".multi-item-qty-custom").focus();
      } else {
        it.qtyOther = false;
        it.qty = qtyBtn.dataset.qty;
        syncQtyUi(block, it);
      }
      block.querySelector(".multi-item-total").textContent = formatCurrency(
        calcMultiItemTotal(it),
      );
      updateTotals();
    }
  });

  modal.querySelector("#multi-add-item").addEventListener("click", () => {
    items.push(newBlankMultiItem());
    rerenderItems();
    const blocks = itemsContainer.querySelectorAll(".multi-item");
    const last = blocks[blocks.length - 1];
    if (last) {
      last.scrollIntoView({ block: "nearest" });
      last.querySelector(".multi-item-name").focus();
    }
  });

  updateTotals();

  const form = modal.querySelector("#multi-transaction-form");
  const submitBtn = modal.querySelector("#multi-submit");

  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const name =
      modal.querySelector("#multi-name").value.trim() || MULTI_DEFAULT_NAME;
    const walletId = modal.querySelector("#multi-wallet").value;
    const date = modal.querySelector("#multi-date").value;
    const time = modal.querySelector("#multi-time").value;
    const note = modal.querySelector("#multi-note").value;

    if (!walletId) {
      showToast("Pilih dompet", "error");
      return;
    }
    if (!date) {
      showToast("Tanggal harus diisi", "error");
      return;
    }
    if (items.length < MULTI_MIN_ITEMS) {
      showToast(`Minimal ${MULTI_MIN_ITEMS} barang`, "error");
      return;
    }

    // Validasi SEMUA barang dulu; satu saja invalid = tidak ada yang disimpan
    const cleanItems = [];
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      const label = `Barang ${i + 1}`;
      const itemName = it.name.trim();
      const price = parseMoney(it.price);
      const qty = /^\d+$/.test(it.qty) ? parseInt(it.qty, 10) : NaN;

      if (!itemName) {
        showToast(`${label}: nama barang harus diisi`, "error");
        return;
      }
      if (!Number.isSafeInteger(price) || price <= 0) {
        showToast(`${label}: harga harus lebih dari 0`, "error");
        return;
      }
      if (!Number.isSafeInteger(qty) || qty <= 0) {
        showToast(`${label}: jumlah harus berupa angka positif`, "error");
        return;
      }
      if (!it.category) {
        showToast(`${label}: pilih kategori`, "error");
        return;
      }
      cleanItems.push({
        itemName,
        amount: price, // harga satuan
        quantity: qty,
        category: it.category,
      });
    }

    const totalAmount = cleanItems.reduce(
      (sum, it) => sum + it.amount * it.quantity,
      0,
    );
    if (!Number.isSafeInteger(totalAmount) || totalAmount <= 0) {
      showToast("Total transaksi tidak valid", "error");
      return;
    }

    const payload = {
      itemName: name,
      amount: totalAmount, // TOTAL seluruh barang (bukan harga satuan)
      quantity: 1,
      type: "expense",
      category: MULTI_DEFAULT_NAME,
      walletId,
      note,
      date,
      time,
      savingId: null,
      isMultiItem: true,
      items: cleanItems,
    };

    let record;
    if (isEdit) {
      record = { ...transaction, ...payload };
      record.updatedAt = getCurrentDateTime().datetime;
    } else {
      record = { ...payload, createdAt: getCurrentDateTime().timestamp };
    }

    submitBtn.disabled = true;
    let result;
    try {
      result = await saveMultiTransactionAtomic(
        record,
        isEdit ? transaction : null,
      );
    } catch (err) {
      console.error("Gagal menyimpan transaksi banyak:", err);
      result = { ok: false, error: "exception" };
    }
    submitBtn.disabled = false;

    if (!result.ok) {
      if (result.error === "wallet-missing") {
        showToast("Dompet tidak ditemukan", "error");
      } else if (result.error === "insufficient") {
        showToast(
          `Saldo ${result.wallet.name} tidak mencukupi! (Saldo: ${formatCurrency(result.wallet.balance)})`,
          "error",
        );
      } else {
        showToast(
          "Gagal menyimpan transaksi. Tidak ada data yang diubah.",
          "error",
        );
      }
      return; // modal tetap terbuka, input user tidak hilang
    }

    showToast(
      isEdit ? "Transaksi berhasil diupdate" : "Transaksi berhasil ditambahkan",
      "success",
    );

    modal.remove();
    await loadTransactions();
    renderFilteredTransactions();

    // Refresh dashboard hanya jika dashboard yang sedang aktif (pola dari wallet.js),
    // agar user tidak berpindah dari halaman Transaksi setelah menyimpan
    if (
      window.renderDashboard &&
      window.getCurrentPage &&
      window.getCurrentPage() === "dashboard"
    ) {
      await window.renderDashboard();
    }
  });

  const closeModal = () => modal.remove();
  modal.querySelectorAll(".modal-close-btn").forEach((btn) => {
    btn.addEventListener("click", closeModal);
  });
  // Modal hanya bisa ditutup lewat tombol Batal atau tombol silang (X);
  // klik area di luar modal sengaja tidak menutup agar input tidak hilang.
}

// Detail (read-only) Transaksi Banyak: info parent + daftar barang + total
function showMultiTransactionDetailModal(transaction, wallet) {
  const row = (label, value) => `
                <div class="transaction-detail-row">
                    <span class="transaction-detail-label">${label}</span>
                    <span class="transaction-detail-value">${value}</span>
                </div>`;

  const itemsHtml = transaction.items
    .map((it) => {
      const qty = it.quantity || 1;
      return `
                <div class="multi-detail-item">
                    <div class="multi-detail-item-name">${escapeHtml(it.itemName)}</div>
                    ${row("Harga Satuan", formatCurrency(it.amount))}
                    ${row("Jumlah", qty)}
                    ${row("Total", formatCurrency(it.amount * qty))}
                    ${row("Kategori", escapeHtml(it.category || "Umum"))}
                </div>`;
    })
    .join("");

  const modal = document.createElement("div");
  modal.className = "modal-overlay";
  modal.innerHTML = `
        <div class="modal-container">
            <div class="modal-header">
                <h3><i class="fas fa-shopping-basket"></i> Detail Transaksi</h3>
                <button class="modal-close-btn modal-close-x">&times;</button>
            </div>
            <div class="modal-body">
                ${row("Nama", escapeHtml(transaction.itemName))}
                ${row("Tipe", "Pengeluaran")}
                ${row("Dompet", wallet ? escapeHtml(wallet.name) : "-")}
                ${transaction.note ? row("Catatan", escapeHtml(transaction.note)) : ""}
                ${row("Tanggal", formatDate(transaction.date))}
                ${row("Waktu", transaction.time || "-")}

                <div class="multi-section-title">Barang yang Dibeli</div>
                ${itemsHtml}

                <div class="multi-total-row multi-detail-total">
                    <span>Total Transaksi</span>
                    <span>${formatCurrency(transaction.amount)}</span>
                </div>
            </div>
        </div>
    `;
  document.body.appendChild(modal);

  const closeModal = () => modal.remove();
  modal.querySelectorAll(".modal-close-btn").forEach((btn) => {
    btn.addEventListener("click", closeModal);
  });
  modal.addEventListener("click", (e) => {
    if (e.target === modal) closeModal();
  });
}

// Edit transaction
async function editTransaction(id) {
  const existing = await getItem(STORES.TRANSACTIONS, id);
  if (existing && existing.isMultiItem === true) {
    await showMultiTransactionModal(id);
    return;
  }
  await showTransactionModal(id);
}

// Delete transaction
async function deleteTransactionById(id) {
  confirmDialog(
    "Apakah Anda yakin ingin menghapus transaksi ini? Data akan dipindahkan ke Trash.",
    async (confirmed) => {
      if (confirmed) {
        const transaction = await getItem(STORES.TRANSACTIONS, id);
        if (!transaction) {
          showToast("Transaksi tidak ditemukan", "error");
          return;
        }

        // Kembalikan saldo dompet
        const wallet = await getItem(STORES.WALLETS, transaction.walletId);
        if (wallet) {
          if (transaction.type === "income") {
            wallet.balance -= transaction.amount;
          } else {
            // expense DAN saving sama-sama mengurangi saldo, jadi dibalikin dgn nambah lagi
            wallet.balance += transaction.amount;
          }
          await updateItem(STORES.WALLETS, wallet);
        }

        // Kalau transaksi bertipe tabungan, kembalikan juga efeknya ke tabungan terkait
        if (transaction.type === "saving" && transaction.savingId) {
          const saving = await getItem(STORES.SAVINGS, transaction.savingId);
          if (saving) {
            saving.currentAmount = Math.max(
              0,
              saving.currentAmount - transaction.amount,
            );
            saving.status =
              saving.currentAmount >= saving.targetAmount
                ? "completed"
                : "active";
            saving.updatedAt = getCurrentDateTime().datetime;
            if (Array.isArray(saving.history)) {
              saving.history = saving.history.filter(
                (h) => h.transactionId !== transaction.id,
              );
            }
            await updateItem(STORES.SAVINGS, saving);
          }
        }

        // Pindahkan ke trash
        const deletedItem = {
          ...transaction,
          deletedAt: getCurrentDateTime().datetime,
          originalStore: STORES.TRANSACTIONS,
        };
        await addItem(STORES.TRASH, deletedItem);

        // Hapus dari transaksi
        await deleteItem(STORES.TRANSACTIONS, id);

        showToast("Transaksi dihapus", "success");
        await loadTransactions();
        renderFilteredTransactions();

        // Refresh dashboard
        if (window.renderDashboard) {
          await window.renderDashboard();
        }
      }
    },
  );
}

// Helper functions
// Style halaman transaksi: mengikuti desain dashboard (header hijau, kartu, tile, daftar bergaris tipis)
function addTransactionStyles() {
  if (document.getElementById("transaction-styles")) return;

  const style = document.createElement("style");
  style.id = "transaction-styles";
  style.textContent = `
    .transactions-container {
      --d-brand: #0B3D2A;
      --d-brand-2: #0F5A3A;
      --d-lime: #C6F432;
      --d-accent: #16A34A;
      --d-red: #DC4C4C;
      --d-green: #16A34A;
      --d-purple: #8b5cf6;
      --d-surface: var(--bg-secondary, #fff);
      --d-soft: var(--bg-primary, #F4F4F7);
      --d-text: var(--text-primary, #242333);
      --d-muted: var(--text-secondary, #6F6F7B);
      --d-line: var(--border-color, #EEEEF3);
      --tp-pad: 16px;
      width: 100%;
      min-width: 0;
      box-sizing: border-box;
      max-width: 1100px;
      margin: 0 auto;
      display: flex;
      flex-direction: column;
      gap: 20px;
    }

    /* ---------- Header ---------- */
    .tp-hero {
      position: relative;
      z-index: 0;
      color: #fff;
      margin: 0;
      padding: 28px 20px 22px;
      display: flex;
      flex-direction: column;
      gap: 18px;
    }
    /* Latar header: melebar sampai tepi layar (diatur oleh fitTxFullBleed) */
    .tp-hero::before {
      content: "";
      position: absolute;
      z-index: -1;
      top: calc(var(--tp-bleed-t, 0px) * -1 - 2px);
      left: calc(var(--tp-bleed-l, 0px) * -1 - 2px);
      right: calc(var(--tp-bleed-r, 0px) * -1 - 2px);
      bottom: 0;
      background:
        radial-gradient(circle at 92% 0%, rgba(198, 244, 50, 0.16) 0%, rgba(198, 244, 50, 0) 45%),
        linear-gradient(160deg, var(--d-brand-2) 0%, var(--d-brand) 70%);
      border-radius: 0 0 32px 32px;
      box-shadow: 0 14px 30px rgba(11, 61, 42, 0.28);
      pointer-events: none;
    }
    .tp-hero > * { position: relative; }
    .tp-top { display: flex; align-items: center; gap: 12px; }
    .tp-avatar {
      width: 44px;
      height: 44px;
      border-radius: 50%;
      flex: none;
      display: flex;
      align-items: center;
      justify-content: center;
      background: rgba(255, 255, 255, 0.12);
      border: 2px solid rgba(255, 255, 255, 0.35);
      color: #fff;
    }
    .tp-greet { flex: 1; min-width: 0; }
    .tp-hero .tp-eyebrow { display: block; font-size: 0.72rem; color: #B7D9C6 !important; }
    .tp-hero .tp-greet h1 {
      margin: 0;
      font-size: 1.15rem;
      font-weight: 600;
      color: #fff !important;
      letter-spacing: -0.01em;
    }
    .tp-hero .tp-refresh {
      width: 40px;
      height: 40px;
      flex: none;
      border: 0;
      border-radius: 50%;
      background: rgba(255, 255, 255, 0.12);
      color: #fff;
      cursor: pointer;
      transition: transform 0.3s ease;
    }
    .tp-hero .tp-refresh:hover { transform: rotate(180deg); }
    .tp-balance {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 6px;
      text-align: center;
      min-width: 0;
      max-width: 100%;
      contain: inline-size; /* lebar alami nominal tidak ikut melebarkan header */
    }
    .tp-hero .tp-label {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      font-size: 0.8rem;
      font-weight: 500;
      color: #B7D9C6 !important;
    }
    .tp-eye {
      padding: 2px;
      border: 0;
      background: none;
      color: #B7D9C6;
      font-size: 0.85rem;
      line-height: 1;
      cursor: pointer;
    }
    .tp-eye:hover { color: #fff; }
    .tp-hero .tp-amount {
      font-size: clamp(1.3rem, 7vw, 2.2rem);
      font-weight: 700;
      line-height: 1.15;
      letter-spacing: -0.03em;
      color: #fff !important;
      font-variant-numeric: tabular-nums;
      white-space: nowrap;
    }
    .tp-hero .tp-chip {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 6px 12px;
      border-radius: 999px;
      font-size: 0.78rem;
      font-weight: 600;
    }
    .tp-hero .tp-chip.up { background: var(--d-lime); color: var(--d-brand) !important; }
    .tp-hero .tp-chip.down { background: rgba(255, 156, 152, 0.22); color: #FFB8B5 !important; }
    .tp-actions { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 8px; }
    .tp-hero .tp-action {
      position: relative;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 6px;
      padding: 0;
      border: 0;
      background: none;
      color: #fff !important;
      font-family: inherit;
      font-size: 0.72rem !important;
      font-weight: 500 !important;
      line-height: 1.2;
      text-align: center;
      text-decoration: none;
      cursor: pointer;
      -webkit-tap-highlight-color: transparent;
    }
    .tp-hero .tp-action .ico {
      width: 48px;
      height: 48px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      background: rgba(255, 255, 255, 0.1);
      border: 1px solid rgba(255, 255, 255, 0.12);
      color: #fff;
      font-size: 1.05rem;
    }
    .tp-hero .tp-action.primary .ico {
      background: var(--d-lime);
      border-color: var(--d-lime);
      color: var(--d-brand);
    }
    /* Pilihan periode: <select> transparan menutupi tombol */
    .tp-period-select {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      opacity: 0;
      cursor: pointer;
      font-size: 16px;
      -webkit-appearance: none;
      appearance: none;
    }

    /* ---------- Layout & section ---------- */
    .tp-grid { display: flex; flex-direction: column; gap: 20px; }
    .tp-col { display: flex; flex-direction: column; gap: 20px; min-width: 0; }
    .tp-section-head {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin: 0 2px 10px;
    }
    .tp-section-head h2 {
      margin: 0;
      font-size: 1.02rem;
      font-weight: 700;
      color: var(--d-text);
    }
    .tp-muted { font-size: 0.8rem; color: var(--d-muted); }
    .tp-card {
      background: var(--d-surface);
      border-radius: 22px;
      padding: 16px;
      border: 1px solid var(--d-line);
      box-shadow: 0 1px 2px rgba(15, 40, 28, 0.04), 0 8px 24px rgba(15, 40, 28, 0.05);
    }

    /* ---------- Tile ringkasan ---------- */
    .tp-tiles { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; }
    .tp-tile {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 6px;
      text-align: center;
      min-width: 0;
    }
    .tp-tile-ico {
      width: 52px;
      height: 52px;
      border-radius: 16px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 1.1rem;
    }
    .tp-tile-ico svg { width: 22px; height: 22px; display: block; }
    .tp-tile-ico.income { background: #E6F6EC; color: var(--d-green); }
    .tp-tile-ico.expense { background: #FDEBEA; color: var(--d-red); }
    .tp-tile-ico.saving { background: #F0EAFE; color: var(--d-purple); }
    .tp-tile .tp-pct { margin-top: -2px; font-size: 0.72rem; }
    .tp-tile-label { font-size: 0.72rem; font-weight: 500; color: var(--d-muted); }
    .tp-tile-value {
      font-size: 0.85rem;
      font-weight: 700;
      color: var(--d-text);
      font-variant-numeric: tabular-nums;
      word-break: break-word;
    }
    .tp-tile-value.income { color: var(--d-green); }
    .tp-tile-value.saving { color: var(--d-purple); }

    /* Persentase terhadap total saldo */
    .tp-pct {
      font-size: 0.68rem;
      font-weight: 700;
      line-height: 1.2;
      font-variant-numeric: tabular-nums;
      white-space: nowrap;
    }
    .tp-pct.income { color: var(--d-green); }
    .tp-pct.expense { color: var(--d-red); }
    .tp-pct.saving { color: var(--d-purple); }

    /* ---------- Daftar transaksi: tanpa kotak, dipisah garis tipis ---------- */
    .tp-list-card { padding: 6px 16px; }
    .tp-list { display: flex; flex-direction: column; }
    .tp-row {
      display: grid;
      grid-template-columns: 48px minmax(0, 1fr) auto;
      grid-template-areas:
        "lead info amount"
        "lead info actions";
      column-gap: 12px;
      row-gap: 4px;
      align-items: start;
      padding: 14px 0;
      border-bottom: 1px solid var(--d-line);
      background: none;
      cursor: pointer;
      -webkit-tap-highlight-color: transparent;
    }
    .tp-row:last-child { border-bottom: 0; }
    .tp-row:focus-visible { outline: 2px solid var(--d-accent); outline-offset: 2px; border-radius: 8px; }
    .tp-lead {
      grid-area: lead;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 4px;
      padding-top: 2px;
    }
    .tp-lead-ico {
      height: 20px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 1.05rem;
    }
    .tp-lead-ico svg { width: 18px; height: 18px; display: block; }
    .tp-lead.saving .tp-lead-ico { color: var(--d-purple); }
    .tp-info { grid-area: info; min-width: 0; }
    .tp-name {
      font-weight: 600;
      font-size: 0.92rem;
      color: var(--d-text);
      overflow-wrap: anywhere;
    }
    .tp-meta {
      display: flex;
      flex-wrap: wrap;
      gap: 2px 10px;
      margin-top: 2px;
      font-size: 0.75rem;
      color: var(--d-muted);
    }
    .tp-meta span { white-space: nowrap; }
    .tp-note {
      margin-top: 4px;
      font-size: 0.75rem;
      color: var(--d-muted);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .tp-amount {
      grid-area: amount;
      justify-self: end;
      font-weight: 700;
      font-size: 0.9rem;
      white-space: nowrap;
      font-variant-numeric: tabular-nums;
    }
    .tp-amount.income { color: var(--d-green); }
    .tp-amount.expense { color: var(--d-text); }
    .tp-amount.saving { color: var(--d-purple); }
    .tp-row-actions {
      grid-area: actions;
      justify-self: end;
      align-self: end;
      display: flex;
      gap: 6px;
    }
    .tp-icon-btn {
      width: 30px;
      height: 30px;
      padding: 0;
      border: 0;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      background: var(--d-soft);
      color: var(--d-muted);
      font-size: 0.75rem;
      cursor: pointer;
    }
    .tp-icon-btn:hover { color: var(--d-text); }
    .tp-icon-btn.danger:hover { background: rgba(220, 76, 76, 0.12); color: var(--d-red); }
    .tp-empty {
      text-align: center;
      padding: 28px 0;
      color: var(--d-muted);
      font-size: 0.88rem;
    }
    .tp-empty i { display: block; margin-bottom: 8px; font-size: 1.8rem; opacity: 0.35; }
    .tp-empty p { margin: 0; }
    .tp-empty .tp-btn { margin-top: 14px; }

    /* ---------- Tombol & pagination ---------- */
    .tp-btn {
      min-height: 46px;
      padding: 0 18px;
      border: 0;
      border-radius: 14px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      background: var(--d-soft);
      color: var(--d-text);
      font-family: inherit;
      font-size: 0.9rem;
      font-weight: 600;
      cursor: pointer;
    }
    .tp-btn.primary { background: var(--d-brand); color: #fff; }
    .transactions-container .pagination {
      display: flex;
      justify-content: center;
      flex-wrap: wrap;
      gap: 6px;
      padding: 4px 0 10px;
    }
    .transactions-container .pagination:empty { display: none; }
    .transactions-container .pagination .page-btn {
      min-width: 36px;
      height: 36px;
      padding: 0 8px;
      border: 0;
      border-radius: 50%;
      background: var(--d-soft);
      color: var(--d-text);
      font-family: inherit;
      font-size: 0.82rem;
      font-weight: 600;
      cursor: pointer;
    }
    .transactions-container .pagination .page-btn.active { background: var(--d-brand); color: #fff; }
    .transactions-container .pagination .page-btn:disabled { opacity: 0.4; cursor: default; }

    /* ---------- Filter ---------- */
    .tp-filter {
      position: fixed;
      inset: 0;
      z-index: 2000;
      display: none;
      align-items: flex-end;
      justify-content: center;
      background: rgba(15, 28, 22, 0.45);
    }
    .tp-filter.open { display: flex; }
    .tp-filter-sheet {
      width: 100%;
      max-width: 480px;
      max-height: 88vh;
      display: flex;
      flex-direction: column;
      background: var(--d-surface);
      color: var(--d-text);
      border-radius: 28px 28px 0 0;
      box-shadow: 0 -10px 40px rgba(15, 40, 28, 0.2);
    }
    .tp-filter-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 18px 20px 8px;
    }
    .tp-filter-head h3 { margin: 0; font-size: 1.1rem; font-weight: 600; color: var(--d-text); }
    .tp-close {
      width: 36px;
      height: 36px;
      padding: 0;
      border: 0;
      border-radius: 50%;
      background: var(--d-soft);
      color: var(--d-muted);
      cursor: pointer;
    }
    .tp-filter-body {
      display: grid;
      gap: 10px;
      padding: 8px 20px;
      overflow-y: auto;
    }
    .tp-input {
      width: 100%;
      box-sizing: border-box;
      height: 46px;
      padding: 0 14px;
      border: 1.5px solid transparent;
      border-radius: 14px;
      background: var(--d-soft);
      color: var(--d-text);
      font-family: inherit;
      font-size: 16px;
      outline: none;
    }
    .tp-input:focus {
      border-color: var(--d-brand);
      box-shadow: 0 0 0 4px rgba(11, 61, 42, 0.12);
    }
    .tp-search { position: relative; }
    .tp-search i {
      position: absolute;
      left: 14px;
      top: 50%;
      transform: translateY(-50%);
      color: var(--d-muted);
      pointer-events: none;
    }
    .tp-search .tp-input { padding-left: 40px; }
    .tp-custom-date { grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; }
    .tp-filter-foot { display: flex; gap: 10px; padding: 12px 20px 20px; }
    .tp-filter-foot .tp-btn { flex: 1; }

    /* ---------- Ikon tipe di pemilih tipe modal transaksi ---------- */
    .type-selector .type-btn .type-tri {
      width: 16px;
      height: 16px;
      margin-right: 2px;
      flex: none;
      border-radius: 50%;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      vertical-align: middle;
      background: #fff;
    }
    .type-selector .type-btn .type-tri svg { width: 10px; height: 10px; display: block; }

    /* ---------- Mobile ---------- */
    @media (max-width: 767px) {
      /* Hilangkan padding halaman agar header bisa full ke tepi */
      #page-content:has(.transactions-container),
      body *:has(.transactions-container) {
        padding-left: 0 !important;
        padding-right: 0 !important;
        padding-top: 0 !important;
        border-top-left-radius: 0 !important;
        border-top-right-radius: 0 !important;
      }
      /* Potong kelebihan latar header tanpa mengunci scroll/zoom halaman */
      #page-content:has(.transactions-container) { overflow-x: clip; }

      .transactions-container { padding-bottom: 110px; } /* ruang untuk bottom navigation */
      .tp-grid { padding: 0 var(--tp-pad); }
    }

    /* ---------- Tablet / desktop ---------- */
    @media (min-width: 768px) {
      .tp-hero {
        padding: 26px 28px;
        display: grid;
        grid-template-columns: 1fr auto;
        grid-template-areas: "top top" "balance actions";
        align-items: center;
        gap: 22px 24px;
      }
      .tp-hero::before {
        top: 0;
        left: 0;
        right: 0;
        border-radius: 28px;
      }
      .tp-top { grid-area: top; }
      .tp-balance { grid-area: balance; align-items: flex-start; text-align: left; }
      .tp-actions { grid-area: actions; width: 340px; }
      .tp-hero .tp-amount { font-size: 2.8rem; }
      .tp-grid {
        display: grid;
        grid-template-columns: minmax(0, 0.85fr) minmax(0, 1.4fr);
        gap: 20px;
        align-items: start;
      }
      .tp-col-side { position: sticky; top: 16px; }
      .tp-filter { align-items: center; }
      .tp-filter-sheet { border-radius: 28px; }
    }
  `;
  document.head.appendChild(style);
}

function escapeHtml(text) {
  if (!text) return "";
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}
