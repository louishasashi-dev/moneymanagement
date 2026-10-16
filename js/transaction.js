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
const MOBILE_QUERY = "(max-width: 768px)";
let periodDefaultApplied = false;

// Singkat nominal untuk ringkasan mobile: 1.000.000 -> "Rp 1jt", 7.450.000 -> "Rp 7,45jt",
// 40.897.666.666 -> "Rp 40,9M" (rb = ribu, jt = juta, M = miliar, T = triliun)
function formatCompactCurrency(value) {
  const num = Number(value) || 0;
  const sign = num < 0 ? "-" : "";
  const abs = Math.abs(num);
  if (abs < 1000) return `${sign}Rp ${Math.round(abs)}`;

  const units = [
    { size: 1e3, label: "rb" },
    { size: 1e6, label: "jt" },
    { size: 1e9, label: "M" },
    { size: 1e12, label: "T" },
  ];
  let idx = 0;
  for (let i = units.length - 1; i >= 0; i--) {
    if (abs >= units[i].size) {
      idx = i;
      break;
    }
  }
  let scaled = Math.round((abs / units[idx].size) * 100) / 100;
  // Contoh 999.999 -> 1000rb harus naik jadi 1jt
  if (scaled >= 1000 && idx < units.length - 1) {
    idx++;
    scaled = Math.round((abs / units[idx].size) * 100) / 100;
  }
  const text = String(scaled).replace(".", ","); // desimal Indonesia
  return `${sign}Rp ${text}${units[idx].label}`;
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
    "width=device-width, initial-scale=1, minimum-scale=0.25, maximum-scale=5, user-scalable=yes",
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

// Format tanggal kartu mobile: 10 Oktober 2026 - 09.59
function formatMobileDateTime(t) {
  const d = (t.date || "").split("-");
  const monthName = MONTH_NAMES[parseInt(d[1], 10) - 1];
  const datePart =
    d.length === 3 && monthName
      ? `${parseInt(d[2], 10)} ${monthName} ${d[0]}`
      : t.date || "-";
  const timePart = t.time ? ` - ${String(t.time).replace(":", ".")}` : "";
  return datePart + timePart;
}

const ICON_CALENDAR = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4.5" width="18" height="16.5" rx="3"/><path d="M8 2.5v4M16 2.5v4M3 10h18"/><rect x="7.5" y="13.5" width="3.5" height="3.5" rx=".8" fill="currentColor" stroke="none"/></svg>`;

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

// Hero mobile menembus padding #page-content (sama seperti halaman Dompet)
function fitTxMobileFullBleed() {
  const el = document.querySelector(".tx-mobile");
  if (!el || getComputedStyle(el).display === "none") return;
  const hero = el.querySelector(".tx-hero");
  if (!hero) return;
  const rect = hero.getBoundingClientRect();
  const vw = document.documentElement.clientWidth;
  let top = 0;
  for (
    let n = el.parentElement;
    n && n !== document.documentElement;
    n = n.parentElement
  ) {
    top += parseFloat(getComputedStyle(n).paddingTop) || 0;
  }
  el.style.setProperty("--tx-bleed-l", `${Math.max(0, rect.left)}px`);
  el.style.setProperty("--tx-bleed-r", `${Math.max(0, vw - rect.right)}px`);
  el.style.setProperty("--tx-bleed-t", `${top}px`);
}

function scheduleTxFullBleed() {
  fitTxMobileFullBleed();
  requestAnimationFrame(fitTxMobileFullBleed);
  setTimeout(fitTxMobileFullBleed, 150);
  setTimeout(fitTxMobileFullBleed, 500);
}

if (!window.__txFullBleedBound) {
  window.__txFullBleedBound = true;
  window.addEventListener("resize", fitTxMobileFullBleed);
}

// Isi angka ringkasan mobile + set --chars agar ukuran font mengecil otomatis untuk angka besar
// Angka disingkat tampil 2 baris di dalam circle bar ("Rp" / "7,45jt") dengan ukuran font sama;
// `share` (0..1) = porsi arc terisi
function setMobileStat(id, value, share = 0) {
  const el = document.getElementById(id);
  if (!el) return;
  const text = formatCompactCurrency(value);
  const idx = text.indexOf(" ");
  el.innerHTML = `<span>${text.slice(0, idx)}</span><span>${text.slice(idx + 1)}</span>`;
  const ring = document.getElementById(`${id}-ring`);
  if (ring) {
    const pct = Math.max(0, Math.min(1, share)) * 100;
    ring.setAttribute("stroke-dashoffset", String(100 - pct));
    // Nol = tidak ada busur (hindari titik kecil akibat ujung bulat)
    ring.style.opacity = pct > 0 ? "1" : "0";
  }
}

// Render halaman transaksi utama
export async function renderTransactionsPage() {
  const container = document.getElementById("page-content");
  if (!container) return;

  // Style harus ada SEBELUM markup dirender (elemen khusus mobile disembunyikan lewat CSS)
  addTransactionStyles();
  ensureMobileViewport();

  if (!periodDefaultApplied) {
    periodDefaultApplied = true;
    currentFilters.period = getDefaultPeriod();
  }

  // Clear container first
  container.innerHTML = "";

  // Load semua transaksi
  await loadTransactions();

  // HTML Template - cleaner structure
  container.innerHTML = `
        <div class="transactions-container">
            <!-- Header -->
            <div class="page-header">
                <h1><i class="fas fa-exchange-alt"></i> Transaksi</h1>
                <div class="page-header-actions">
                    <button class="btn-primary btn-add-transaction" id="add-transaction-btn">
                        <i class="fas fa-plus"></i> Transaksi Baru
                    </button>
                    <button class="btn-secondary" id="add-multi-transaction-btn">
                        <i class="fas fa-shopping-basket"></i> Transaksi Banyak
                    </button>
                </div>
            </div>
            
            <!-- ===== Khusus mobile: hero ringkasan + kotak 4 menu (gaya halaman Dompet) ===== -->
            <div class="m-only tx-mobile">
                <div class="tx-hero">
                    <span class="tx-hero-label"><i class="fas fa-exchange-alt"></i> Transaksi</span>
                    <div class="tx-stats">
                        ${[
                          ["Pengeluaran", "expense", "m-total-expense"],
                          ["Pemasukan", "income", "m-total-income"],
                          ["Tabungan", "saving", "m-total-saving"],
                        ]
                          .map(
                            ([label, cls, id]) => `
                        <div class="tx-stat">
                            <span class="tx-stat-label">${label}</span>
                            <div class="tx-ring">
                                <svg viewBox="0 0 100 100" aria-hidden="true">
                                    <circle class="tx-ring-track" cx="50" cy="50" r="40"/>
                                    <circle class="tx-ring-bar ${cls}" id="${id}-ring" cx="50" cy="50" r="40" pathLength="100" stroke-dasharray="100" stroke-dashoffset="100" transform="rotate(-90 50 50)"/>
                                </svg>
                                <span class="tx-stat-value ${cls}" id="${id}"><span>Rp</span><span>0</span></span>
                            </div>
                        </div>`,
                          )
                          .join("")}
                    </div>
                </div>

                <div class="tx-actions">
                    <div class="tx-action tx-period">
                        <span class="tx-action-icon"><i class="fas fa-calendar-days"></i></span>
                        <span class="tx-action-label">Periode</span>
                        <span class="tx-action-sub" id="m-period-value"></span>
                        <select id="m-period-select" class="tx-period-select" aria-label="Pilih periode"></select>
                    </div>
                    <button class="tx-action" id="m-filter-btn" type="button">
                        <span class="tx-action-icon"><i class="fas fa-filter"></i></span>
                        <span class="tx-action-label">Filter</span>
                    </button>
                    <button class="tx-action" id="m-add-transaction-btn" type="button" title="Transaksi Baru">
                        <span class="tx-action-icon"><i class="fas fa-plus"></i></span>
                        <span class="tx-action-label">Tambah</span>
                    </button>
                    <button class="tx-action" id="m-add-multi-btn" type="button" title="Transaksi Banyak">
                        <span class="tx-action-icon"><i class="fas fa-cart-shopping"></i></span>
                        <span class="tx-action-label">Banyak</span>
                    </button>
                </div>

                <div class="tx-section-title">Transaksi</div>
            </div>

            <!-- Tombol Filter (khusus tampil di mobile, buka filter sebagai modal) -->
            <button class="filter-toggle-btn" id="filter-toggle-btn">
                <i class="fas fa-filter"></i> Filter & Cari
            </button>

            <!-- Filter Bar (jadi modal fullscreen di mobile) -->
            <div class="filter-bar" id="filter-bar">
                <div class="filter-bar-header">
                    <span>Filter Transaksi</span>
                    <button type="button" class="filter-close-btn" id="filter-close-btn">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                <div class="search-box">
                    <i class="fas fa-search"></i>
                    <input type="text" id="search-transaction" placeholder="Cari transaksi..." class="search-input">
                </div>
                <div class="filter-group">
                    <select id="filter-type" class="filter-select">
                        <option value="all">Semua Tipe</option>
                        <option value="income">📥 Pemasukan</option>
                        <option value="expense">📤 Pengeluaran</option>
                        <option value="saving">🐷 Tabungan</option>
                    </select>
                    <select id="filter-wallet" class="filter-select">
                        <option value="all">💳 Semua Dompet</option>
                    </select>
                    <select id="filter-category" class="filter-select">
                        <option value="all">📂 Semua Kategori</option>
                    </select>
                </div>
                <div class="period-filter-group">
                    <select id="filter-period" class="filter-select">
                        <option value="today">📅 Hari Ini</option>
                        <option value="week">🗓️ Minggu Ini</option>
                        <option value="month">🗓️ Bulan Ini</option>
                        <option value="all">⏳ Semua Waktu</option>
                        <option value="custom">🎯 Pilih Tanggal</option>
                    </select>
                </div>
                <div class="custom-date-group" id="custom-date-group" style="display: none;">
                    <select id="filter-custom-day" class="filter-select">
                        <option value="all">Tanggal</option>
                        ${Array.from({ length: 31 }, (_, i) => i + 1)
                          .map((d) => `<option value="${d}">${d}</option>`)
                          .join("")}
                    </select>
                    <select id="filter-custom-month" class="filter-select">
                        <option value="all">Bulan</option>
                        ${MONTH_NAMES.map(
                          (m, i) => `<option value="${i + 1}">${m}</option>`,
                        ).join("")}
                    </select>
                    <select id="filter-custom-year" class="filter-select">
                        <option value="all">Tahun</option>
                    </select>
                </div>
                <button id="reset-filters" class="btn-secondary" style="width: 100%; margin-top: 10px;">
                    <i class="fas fa-undo"></i> Reset Filter
                </button>
                <button type="button" id="apply-filters" class="btn-primary" style="width: 100%; margin-top: 10px;">
                    <i class="fas fa-check"></i> Terapkan Filter
                </button>
            </div>
            
            <!-- Summary -->
            <div class="transactions-summary card">
                <div class="summary-item">
                    <span>📊 Total Transaksi:</span>
                    <strong id="total-count">0</strong>
                </div>
                <div class="summary-item">
                    <span>💰 Total Pemasukan:</span>
                    <strong class="income-text" id="total-income-summary">Rp 0</strong>
                </div>
                <div class="summary-item">
                    <span>💸 Total Pengeluaran:</span>
                    <strong class="expense-text" id="total-expense-summary">Rp 0</strong>
                </div>
                <div class="summary-item">
                    <span>🐷 Total Ditabung:</span>
                    <strong class="saving-text" id="total-saving-summary">Rp 0</strong>
                </div>
            </div>
            
            <!-- Transactions List -->
            <div class="transactions-list-container card">
                <div id="transactions-list" class="transactions-list">
                    <div class="empty-state">
                        <i class="fas fa-spinner fa-spin"></i>
                        <p>Memuat transaksi...</p>
                    </div>
                </div>
                
                <!-- Pagination -->
                <div id="pagination" class="pagination"></div>
            </div>
        </div>
    `;

  // Load wallets untuk filter
  await loadWalletsForFilter();

  // Load categories untuk filter
  await loadCategoriesForFilter();

  // Load tahun untuk filter tanggal custom
  loadYearsForFilter();

  // Opsi periode mobile + samakan kontrol filter dengan state aktif
  buildMobilePeriodOptions();
  syncFilterControls();

  // Render transactions
  renderFilteredTransactions();

  // Setup event listeners
  setupTransactionEventListeners();
  scheduleTxFullBleed();
}

// Load semua transaksi dari database
async function loadTransactions() {
  allTransactions = await getAllItems(STORES.TRANSACTIONS);
  // Sort by date descending (terbaru di atas)
  allTransactions.sort((a, b) => new Date(b.date) - new Date(a.date));
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
  const totalIncome = transactions
    .filter((t) => t.type === "income")
    .reduce((sum, t) => sum + t.amount, 0);
  const totalExpense = transactions
    .filter((t) => t.type === "expense")
    .reduce((sum, t) => sum + t.amount, 0);
  const totalSaving = transactions
    .filter((t) => t.type === "saving")
    .reduce((sum, t) => sum + t.amount, 0);

  const totalCount = document.getElementById("total-count");
  const totalIncomeEl = document.getElementById("total-income-summary");
  const totalExpenseEl = document.getElementById("total-expense-summary");
  const totalSavingEl = document.getElementById("total-saving-summary");

  if (totalCount) totalCount.textContent = transactions.length;
  if (totalIncomeEl) totalIncomeEl.textContent = formatCurrency(totalIncome);
  if (totalExpenseEl) totalExpenseEl.textContent = formatCurrency(totalExpense);
  if (totalSavingEl) totalSavingEl.textContent = formatCurrency(totalSaving);

  // Ringkasan versi mobile
  const mExpense = document.getElementById("m-total-expense");
  const mIncome = document.getElementById("m-total-income");
  const mSaving = document.getElementById("m-total-saving");
  // Porsi tiap circle bar = bagian dari total ketiganya
  const grand = totalExpense + totalIncome + totalSaving;
  const shareOf = (v) => (grand > 0 ? v / grand : 0);
  if (mExpense)
    setMobileStat("m-total-expense", totalExpense, shareOf(totalExpense));
  if (mIncome)
    setMobileStat("m-total-income", totalIncome, shareOf(totalIncome));
  if (mSaving)
    setMobileStat("m-total-saving", totalSaving, shareOf(totalSaving));
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
            <div class="empty-state">
                <i class="fas fa-receipt"></i>
                <p>${message}</p>
                <button class="btn-primary btn-add-transaction" style="margin-top: 12px;">
                    <i class="fas fa-plus"></i> Tambah Transaksi
                </button>
            </div>
        `;

    // Re-attach add button event
    const addBtn = container.querySelector(".btn-add-transaction");
    if (addBtn) {
      addBtn.addEventListener("click", () => showTransactionModal());
    }
    return;
  }

  container.innerHTML = transactions
    .map((t) => {
      const triPath = t.type === "income" ? "M12 3L21 18H3Z" : "M3 3H21L12 18Z";
      const fullAmount = formatCurrency(t.amount);
      const mobileAmount =
        t.type === "income"
          ? `+ ${fullAmount.replace(/^Rp\s*/, "")}`
          : t.type === "saving"
            ? `🐷 ${fullAmount}`
            : `- ${fullAmount}`;
      return `
        <div class="transaction-card" data-id="${t.id}">
            <div class="transaction-card-icon ${t.type}">
                <svg class="tx-tri" viewBox="0 0 24 21" aria-hidden="true"><path d="${triPath}" fill="currentColor" stroke="currentColor" stroke-width="3" stroke-linejoin="round"/></svg>
                <i class="fas ${t.isMultiItem === true ? "fa-shopping-basket" : t.type === "income" ? "fa-arrow-down" : t.type === "saving" ? "fa-piggy-bank" : "fa-arrow-up"}"></i>
            </div>
            <div class="transaction-card-details">
                <div class="transaction-card-name">${escapeHtml(t.itemName)}</div>
                <div class="transaction-card-meta">
                    ${
                      t.isMultiItem === true && Array.isArray(t.items)
                        ? `<span class="category-badge d-only">🧺 ${t.items.length} barang</span>`
                        : `<span class="category-badge d-only">📌 ${t.category || "Umum"}</span>`
                    }
                    <span class="date-badge d-only">📅 ${formatDate(t.date)}</span>
                    ${t.time ? `<span class="time-badge d-only">⏰ ${t.time}</span>` : ""}
                    <span class="m-only m-date">${ICON_CALENDAR}<span class="m-date-text">${formatMobileDateTime(t)}</span></span>
                </div>
                ${t.note ? `<div class="transaction-card-note">📝 ${escapeHtml(t.note)}</div>` : ""}
            </div>
            <div class="transaction-card-amount ${t.type}">
                <span class="d-only">${t.type === "income" ? "+" : t.type === "saving" ? "🐷" : "-"} ${fullAmount}</span>
                <span class="m-only m-amount">${mobileAmount}</span>
            </div>
            <div class="transaction-card-actions">
                <button class="icon-btn edit-transaction" data-id="${t.id}" title="Edit">
                    <i class="fas fa-edit"></i>
                </button>
                <button class="icon-btn delete-transaction" data-id="${t.id}" title="Hapus">
                    <i class="fas fa-trash"></i>
                </button>
            </div>
        </div>
    `;
    })
    .join("");

  // Attach event listeners to edit/delete buttons
  document.querySelectorAll(".edit-transaction").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const id = parseInt(btn.dataset.id);
      editTransaction(id);
    });
  });

  document.querySelectorAll(".delete-transaction").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const id = parseInt(btn.dataset.id);
      deleteTransactionById(id);
    });
  });

  // Klik card (selain tombol edit/hapus) membuka detail transaksi
  document.querySelectorAll(".transaction-card").forEach((card) => {
    card.addEventListener("click", () => {
      const id = parseInt(card.dataset.id);
      showTransactionDetailModal(id);
    });
  });
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
function setupTransactionEventListeners() {
  // ── Modal filter khusus mobile ──
  // Di desktop, .filter-bar selalu tampil normal (CSS tidak menyembunyikannya).
  // Di mobile (<=768px), .filter-bar disembunyikan (display:none) dan cuma
  // muncul sebagai overlay fullscreen kalau class "filter-bar-open" aktif.
  const filterToggleBtn = document.getElementById("filter-toggle-btn");
  const filterBar = document.getElementById("filter-bar");
  const filterCloseBtn = document.getElementById("filter-close-btn");
  const applyFiltersBtn = document.getElementById("apply-filters");

  const openFilterModal = () => {
    filterBar?.classList.add("filter-bar-open");
    document.body.classList.add("filter-modal-active");
  };
  const closeFilterModal = () => {
    filterBar?.classList.remove("filter-bar-open");
    document.body.classList.remove("filter-modal-active");
  };

  if (filterToggleBtn) {
    filterToggleBtn.addEventListener("click", openFilterModal);
  }
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
  if (filterCloseBtn) {
    filterCloseBtn.addEventListener("click", closeFilterModal);
  }
  if (applyFiltersBtn) {
    // Filter lain sudah live-update (langsung re-render tiap select berubah),
    // tombol ini cuma menutup modalnya di mobile setelah user selesai memilih
    applyFiltersBtn.addEventListener("click", closeFilterModal);
  }
  // Tutup modal kalau klik area backdrop di luar konten filter (mobile)
  if (filterBar) {
    filterBar.addEventListener("click", (e) => {
      if (e.target === filterBar) closeFilterModal();
    });
  }

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

  // Add transaction button
  const addBtn = document.getElementById("add-transaction-btn");
  if (addBtn) {
    addBtn.addEventListener("click", () => {
      showTransactionModal();
    });
  }

  // Add multi-item transaction button
  const addMultiBtn = document.getElementById("add-multi-transaction-btn");
  if (addMultiBtn) {
    addMultiBtn.addEventListener("click", () => {
      showMultiTransactionModal();
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
            <div class="form-group">
                <label>Tipe Transaksi <span class="required">*</span></label>
                <div class="type-selector">
                    <button type="button" class="type-btn ${!isEdit || transaction.type === "expense" ? "active" : ""}" data-type="expense">
                        <i class="fas fa-arrow-up"></i> Pengeluaran
                    </button>
                    <button type="button" class="type-btn ${isEdit && transaction.type === "income" ? "active" : ""}" data-type="income">
                        <i class="fas fa-arrow-down"></i> Pemasukan
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
                <label>Nominal <span class="required">*</span></label>
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
                    <optgroup label="📤 Pengeluaran">
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
                    <optgroup label="📥 Pemasukan">
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
                <label>Metode Pembayaran <span class="required">*</span></label>
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
                    <label>📅 Tanggal</label>
                    <input type="date" id="transaction-date" class="form-input" 
                           value="${isEdit ? transaction.date : getCurrentDateTime().date}">
                </div>
                <div class="form-group half">
                    <label>⏰ Jam</label>
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

            <div class="modal-buttons">
                <button type="button" class="btn-secondary modal-close-btn">Batal</button>
                <button type="submit" class="btn-primary">${isEdit ? "Simpan Perubahan" : "Tambah Transaksi"}</button>
            </div>
        </form>
    `;

  // Create modal
  const modal = document.createElement("div");
  modal.className = "modal-overlay";
  modal.innerHTML = `
        <div class="modal-container modal-large">
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
  modal.addEventListener("click", (e) => {
    if (e.target === modal) closeModal();
  });
}

// Modal untuk memilih tabungan tujuan (dipakai saat transaksi bertipe "saving")
export async function showSelectSavingGoalModal(
  amount,
  itemName,
  preselectedId,
  onConfirm,
  helpText = "Nominal transaksi ini akan langsung ditambahkan ke tabungan yang dipilih.",
) {
  const savings = await getAllItems(STORES.SAVINGS);

  if (savings.length === 0) {
    showToast(
      "Belum ada target tabungan. Buat dulu target tabungan di halaman Tabungan.",
      "error",
    );
    return;
  }

  const modal = document.createElement("div");
  modal.className = "modal-overlay";
  modal.innerHTML = `
    <div class="modal-container modal-small">
      <div class="modal-header">
        <h3><i class="fas fa-piggy-bank"></i> Pilih Tabungan Tujuan</h3>
        <button class="modal-close-btn modal-close-x">&times;</button>
      </div>
      <div class="modal-body">
        <div class="info-box">
          <div>${escapeHtml(itemName)}</div>
          <div style="font-weight:700;font-size:1.05rem;">${formatCurrency(amount)}</div>
        </div>
        <div class="form-group">
          <label>Masukkan ke tabungan mana? <span class="required">*</span></label>
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
        <div class="modal-buttons">
          <button type="button" class="btn-secondary modal-close-btn">Batal</button>
          <button type="button" class="btn-primary" id="confirm-select-saving">Konfirmasi</button>
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

  modal
    .querySelector("#confirm-select-saving")
    .addEventListener("click", async () => {
      const savingIdRaw = modal.querySelector("#select-saving-goal").value;
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
                <label>Nama Barang <span class="required">*</span></label>
                <input type="text" class="form-input multi-item-name" value="${escapeAttr(it.name)}" placeholder="Contoh: Indomie Goreng" autocomplete="off">
            </div>
            <div class="multi-form-row">
                <div class="form-group">
                    <label>Harga Satuan <span class="required">*</span></label>
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
                <label>Kategori <span class="required">*</span></label>
                <select class="form-input multi-item-category">${categoryOptionsHtml(it.category)}</select>
            </div>
        </div>`;
      })
      .join("");
  }

  const modal = document.createElement("div");
  modal.className = "modal-overlay";
  modal.innerHTML = `
        <div class="modal-container modal-large">
            <div class="modal-header">
                <h3><i class="fas fa-shopping-basket"></i> ${isEdit ? "Edit Transaksi Banyak" : "Transaksi Banyak"}</h3>
                <button class="modal-close-btn modal-close-x">&times;</button>
            </div>
            <div class="modal-body">
                <form id="multi-transaction-form" novalidate>
                    <div class="form-group">
                        <label>Nama Transaksi</label>
                        <input type="text" id="multi-name" class="form-input" value="${isEdit ? escapeAttr(transaction.itemName) : ""}" placeholder="${MULTI_DEFAULT_NAME} (contoh: Belanja Indomaret)">
                    </div>
                    <div class="form-group">
                        <label>Dompet <span class="required">*</span></label>
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
                            <label>📅 Tanggal</label>
                            <input type="date" id="multi-date" class="form-input" value="${isEdit ? transaction.date : getCurrentDateTime().date}">
                        </div>
                        <div class="form-group">
                            <label>⏰ Jam</label>
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

                    <div class="multi-footer">
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
  modal.addEventListener("click", (e) => {
    if (e.target === modal) closeModal();
  });
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
// Style untuk halaman transaksi: warna ikon & nominal per tipe
// (income/expense/saving) - sebelumnya class ini belum ada CSS-nya sama sekali
function addTransactionStyles() {
  if (document.getElementById("transaction-styles")) return;

  const style = document.createElement("style");
  style.id = "transaction-styles";
  style.textContent = `
    .transaction-card-icon {
      width: 42px;
      height: 42px;
      border-radius: 12px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 1.05rem;
      flex-shrink: 0;
    }

    .transaction-card-icon.income {
      background: rgba(16, 185, 129, 0.12);
      color: #10b981;
    }

    .transaction-card-icon.expense {
      background: rgba(239, 68, 68, 0.12);
      color: #ef4444;
    }

    .transaction-card-icon.saving {
      background: rgba(139, 92, 246, 0.12);
      color: #8b5cf6;
    }

    .transaction-card-amount {
      font-weight: 700;
      font-size: 0.95rem;
      white-space: nowrap;
    }

    .transaction-card-amount.income {
      color: #10b981;
    }

    .transaction-card-amount.expense {
      color: #ef4444;
    }

    .transaction-card-amount.saving {
      color: #8b5cf6;
    }

    .saving-text {
      color: #8b5cf6;
    }

    /* ===== Elemen khusus mobile: disembunyikan di desktop ===== */
    .transactions-container .m-only { display: none; }
    .transactions-container .tx-tri { display: none; }

    /* ===== TAMPILAN MOBILE (<= 768px) ===== */
    @media (max-width: 768px) {
      .transactions-container {
        --m-blue: #0d58cc;
        --m-blue-bright: #1a62de;
        --m-ink: #0f1b3d;
        --m-muted: #6b7490;
        --m-red: #f0384a;
        --m-green: #2fbf71;
        --m-purple: #8b5cf6;
        --m-red-on-blue: #ff3b4e;
        --m-green-on-blue: #3dd16f;
        --m-purple-on-blue: #a074ff;
      }

      .transactions-container .d-only,
      .transactions-container .page-header-actions,
      .transactions-container .filter-toggle-btn,
      .transactions-container .transactions-summary { display: none !important; }

      /* Hapus padding halaman agar hero bisa full ke tepi (sama seperti Dompet) */
      #page-content:has(.tx-mobile),
      body *:has(.tx-mobile) {
        padding-left: 0 !important;
        padding-right: 0 !important;
        padding-top: 0 !important;
        border-top-left-radius: 0 !important;
        border-top-right-radius: 0 !important;
      }
      html:has(.tx-mobile),
      body:has(.tx-mobile) { overflow-x: clip; max-width: 100%; }
      .transactions-container,
      .transactions-container .tx-mobile { max-width: 100%; overflow-x: clip; }

      .transactions-container .page-header { display: none !important; }

      .transactions-container .tx-mobile {
        display: block;
        --tx-navy: #0b1b4d;
      }

      /* ===== Hero ===== */
      .transactions-container .tx-hero {
        position: relative;
        z-index: 0;
        text-align: center;
        padding: 32px 16px 78px;
      }
      .transactions-container .tx-hero::before {
        content: "";
        position: absolute;
        z-index: -1;
        top: calc(var(--tx-bleed-t, 0px) * -1 - 2px);
        left: calc(var(--tx-bleed-l, 0px) * -1 - 2px);
        right: calc(var(--tx-bleed-r, 0px) * -1 - 2px);
        bottom: 0;
        background:
          linear-gradient(180deg, rgba(10,5,35,0.25) 0%, rgba(10,5,35,0.55) 100%),
          url("assets/background/violet.jpg") center / cover no-repeat,
          #5b21b6;
        border-radius: 0;
      }
      .transactions-container .tx-hero-label {
        display: inline-block;
        padding: 8px 22px;
        border-radius: 999px;
        background: rgba(10, 5, 35, 0.55);
        border: 1px solid rgba(255,255,255,0.35);
        color: #fff;
        text-shadow: 0 1px 3px rgba(0,0,0,0.5);
        font-size: 0.8rem;
        font-weight: 600;
        letter-spacing: 0.12em;
        text-transform: uppercase;
      }
      .transactions-container .tx-stats {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        margin-top: 16px;
        padding: 12px 4px;
        border-radius: 18px;
        background: linear-gradient(135deg, rgba(255,255,255,0.28), rgba(255,255,255,0.08));
        -webkit-backdrop-filter: blur(14px) saturate(160%);
        backdrop-filter: blur(14px) saturate(160%);
        border: 1px solid rgba(255,255,255,0.45);
        box-shadow: 0 8px 24px rgba(10, 5, 35, 0.25), inset 0 1px 0 rgba(255,255,255,0.5);
      }
      .transactions-container .tx-stat {
        min-width: 0;
        padding: 0 4px;
      }
      .transactions-container .tx-stat + .tx-stat { border-left: 1px solid rgba(255,255,255,0.3); }
      .transactions-container .tx-stat-label {
        display: block;
        font-size: 0.72rem;
        font-weight: 600;
        color: #fff;
        text-shadow: 0 1px 3px rgba(0,0,0,0.5);
      }
      .transactions-container .tx-stat-value {
        display: block;
        margin-top: 4px;
        /* mengecil otomatis sesuai jumlah karakter agar selalu 1 baris */
        font-size: clamp(9px, calc((100vw - 64px) / 3 / (var(--chars, 12) * 0.62)), 16px);
        font-weight: 800;
        line-height: 1.3;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        text-shadow: 0 1px 4px rgba(0,0,0,0.65);
      }
      .transactions-container .tx-stat-value.expense { color: #ff7a88; }
      .transactions-container .tx-stat-value.income { color: #5eea9a; }
      .transactions-container .tx-stat-value.saving { color: #c4b5fd; }

      /* ===== Circle bar ringkasan (glass tetap dari .tx-stats) ===== */
      .transactions-container .tx-stats { padding: 14px 4px 16px; }
      .transactions-container .tx-ring {
        position: relative;
        width: 74px;
        max-width: 100%;
        aspect-ratio: 1 / 1;
        margin: 10px auto 0;
      }
      .transactions-container .tx-stat { overflow: hidden; }
      .transactions-container .tx-ring svg {
        position: absolute !important;
        inset: 0;
        width: 100% !important;
        height: 100% !important;
        max-width: 100% !important;
        display: block;
        overflow: hidden;
      }
      .transactions-container .tx-ring circle {
        fill: rgba(10, 5, 35, 0.25);
        stroke-width: 8;
      }
      .transactions-container .tx-ring .tx-ring-track {
        stroke: rgba(255, 255, 255, 0.28);
      }
      .transactions-container .tx-ring .tx-ring-bar {
        fill: none;
        stroke-linecap: round;
        transition: stroke-dashoffset 0.5s ease;
      }
      .transactions-container .tx-ring .tx-ring-bar.expense { stroke: #ff7a88; }
      .transactions-container .tx-ring .tx-ring-bar.income { stroke: #5eea9a; }
      .transactions-container .tx-ring .tx-ring-bar.saving { stroke: #c4b5fd; }
      .transactions-container .tx-ring .tx-stat-value {
        position: absolute;
        inset: 0;
        margin: 0;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        font-size: 10px; /* sama untuk ketiganya */
        line-height: 1.3;
        padding: 0 12px;
        box-sizing: border-box;
        overflow: visible;
        text-overflow: clip;
      }

      /* ===== Kotak 4 menu ===== */
      .transactions-container .tx-actions {
        position: relative;
        display: grid;
        grid-template-columns: repeat(4, minmax(0, 1fr));
        margin: -52px 16px 0;
        padding: 16px 2px 14px;
        background: #fff;
        border-radius: 22px;
        box-shadow: 0 10px 30px rgba(11, 27, 77, 0.12);
      }
      .transactions-container .tx-action {
        position: relative;
        min-width: 0;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 8px;
        margin: 0;
        padding: 0 4px;
        background: none;
        border: none;
        cursor: pointer;
        font-family: inherit;
        -webkit-tap-highlight-color: transparent;
      }
      .transactions-container .tx-action + .tx-action { border-left: 1px solid #e6ecf3; }
      .transactions-container .tx-action-icon {
        width: 48px;
        height: 48px;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        background: #3eeed4;
        color: #0b4a4a;
        font-size: 1.15rem;
        transition: transform 0.15s ease;
      }
      .transactions-container .tx-action:active .tx-action-icon { transform: scale(0.92); }
      .transactions-container .tx-action-label {
        max-width: 100%;
        font-size: 0.74rem;
        font-weight: 700;
        line-height: 1.2;
        color: var(--tx-navy);
        text-align: center;
      }
      .transactions-container .tx-action-sub {
        max-width: 100%;
        margin-top: -6px;
        font-size: 0.64rem;
        font-weight: 600;
        line-height: 1.2;
        color: #51698f;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .transactions-container .tx-period-select {
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

      .transactions-container .tx-section-title {
        margin: 24px 16px 14px;
        font-size: 1.15rem;
        font-weight: 800;
        color: var(--tx-navy);
      }

      /* Daftar transaksi */
      .transactions-container .transactions-list-container.card {
        background: transparent !important;
        box-shadow: none !important;
        border: 0 !important;
        border-radius: 0 !important;
        padding: 0 !important;
        margin: 0 16px 110px !important; /* sisi kiri-kanan + ruang bottom nav */
      }
      .transactions-container .transactions-list {
        display: flex !important;
        flex-direction: column;
        gap: 14px;
        margin: 0 !important;
        padding: 0 !important;
      }
      .transactions-container .transaction-card {
        display: grid !important;
        grid-template-columns: 44px minmax(0, 1fr) auto auto;
        align-items: start;
        margin: 0 !important;
        padding: 8px 8px 8px 12px !important;
        background: #fff !important;
        border: 1px solid rgba(15, 27, 61, 0.04) !important;
        border-radius: 14px !important;
        box-shadow: 0 2px 10px rgba(40, 70, 140, 0.08) !important;
      }
      .transactions-container .transaction-card-icon {
        grid-column: 1;
        grid-row: 1 / span 3;
        width: 44px !important;
        height: 14px !important;
        margin: 14px 0 0 !important;
        padding: 0 !important;
        display: flex;
        align-items: center;
        justify-content: center;
        background: none !important;
        border-radius: 0 !important;
      }
      .transactions-container .transaction-card-icon i { display: none !important; }
      .transactions-container .transaction-card-icon .tx-tri {
        display: block;
        width: 16px;
        height: 14px;
      }
      .transactions-container .transaction-card-icon.expense { color: var(--m-red) !important; }
      .transactions-container .transaction-card-icon.income { color: var(--m-green) !important; }
      .transactions-container .transaction-card-icon.saving { color: var(--m-purple) !important; }

      .transactions-container .transaction-card-details { display: contents !important; }
      .transactions-container .transaction-card-name {
        grid-column: 2;
        grid-row: 1;
        margin: 0 !important;
        padding-right: 8px;
        font-size: 16px;
        font-weight: 700;
        line-height: 22px;
        color: var(--m-ink);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .transactions-container .transaction-card-meta {
        grid-column: 2;
        grid-row: 2;
        display: flex !important;
        flex-direction: column;
        align-items: flex-start;
        gap: 4px;
        margin: 2px 0 0 !important;
        min-width: 0;
        max-width: 100%;
      }
      .transactions-container .m-date { max-width: 100%; min-width: 0; }
      .transactions-container .m-date {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        font-size: 13px;
        line-height: 18px;
        color: var(--m-muted);
      }
      .transactions-container .m-date svg { width: 13px; height: 13px; flex-shrink: 0; }
      .transactions-container .transaction-card-note {
        grid-column: 2;
        grid-row: 3;
        margin-top: 4px;
        font-size: 12px;
        color: var(--m-muted);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .transactions-container .transaction-card-amount {
        grid-column: 3;
        grid-row: 1;
        margin: 0 12px 0 0;
        text-align: right;
        font-size: 15px;
        font-weight: 800;
        line-height: 22px;
        white-space: nowrap;
      }
      .transactions-container .transaction-card-amount.expense { color: var(--m-red); }
      .transactions-container .transaction-card-amount.income { color: var(--m-green); }
      .transactions-container .transaction-card-amount.saving { color: var(--m-purple); }
      .transactions-container .m-amount { display: inline; }

      .transactions-container .transaction-card-actions {
        grid-column: 4;
        grid-row: 1 / span 2;
        display: flex !important;
        align-items: flex-start !important;
        gap: 5px;
        margin: 12px 0 0 !important;
        padding: 0 !important;
      }
      .transactions-container .transaction-card-actions .icon-btn {
        width: 22px !important;
        height: 22px !important;
        min-width: 0 !important;
        min-height: 0 !important;
        max-height: 22px !important;
        flex: 0 0 22px !important;
        box-sizing: border-box !important;
        align-self: flex-start !important;
        margin: 0 !important;
        padding: 0 !important;
        display: flex !important;
        align-items: center;
        justify-content: center;
        background: #e5e9f2 !important;
        color: #5d6788 !important;
        border: 0 !important;
        border-radius: 6px !important;
        box-shadow: none !important;
        font-size: 12px !important;
      }
    }

    /* ===== Layar sempit (< 380px): nama dapat lebar penuh, nominal turun ke bawah nama ===== */
    @media (max-width: 379px) {
      .transactions-container .tx-action-icon { width: 42px; height: 42px; font-size: 1rem; }
      .transactions-container .tx-action-label { font-size: 0.68rem; }
      .transactions-container .tx-action-sub { font-size: 0.58rem; }
      .transactions-container .tx-stat-label { font-size: 0.66rem; }

      .transactions-container .transaction-card {
        grid-template-columns: 32px minmax(0, 1fr) auto;
        padding: 10px 8px 10px 6px !important;
      }
      .transactions-container .transaction-card-icon {
        grid-row: 1 / span 4;
        width: 32px !important;
        margin-top: 26px !important;
      }
      .transactions-container .transaction-card-name {
        grid-column: 2;
        grid-row: 1;
        font-size: 15px;
      }
      .transactions-container .transaction-card-amount {
        grid-column: 2;
        grid-row: 2;
        margin: 0;
        text-align: left;
        font-size: 14px;
      }
      .transactions-container .transaction-card-meta {
        grid-column: 2;
        grid-row: 3;
        margin-top: 4px !important;
      }
      .transactions-container .transaction-card-note { grid-row: 4; }
      .transactions-container .transaction-card-actions {
        grid-column: 3;
        grid-row: 1 / span 2;
        margin-top: 0 !important;
      }
      .transactions-container .m-date { font-size: 12px; }
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
