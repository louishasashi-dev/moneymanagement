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
import {
  buildBalanceBefore,
  formatPct,
  hasPct,
  periodPct,
  txPctText,
} from "./balance-pct.js";

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
let walletMap = new Map(); // id dompet -> data dompet (untuk pil dompet di daftar)

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

// Total saldo semua dompet (hanya untuk tampilan saldo di header)
let walletTotal = 0;
// id transaksi -> saldo dompet sebelum transaksi (pembanding persentase)
let balanceBeforeMap = new Map();
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

// Judul grup tanggal: 1 Oktober 2026
function formatLongDate(dateStr) {
  const d = (dateStr || "").split("-");
  const m = MONTH_NAMES[parseInt(d[1], 10) - 1];
  if (d.length !== 3 || !m) return dateStr || "Tanpa tanggal";
  return `${parseInt(d[2], 10)} ${m} ${d[0]}`;
}

// Pil nama dompet, warnanya mengikuti warna dompet
function walletPillHtml(w) {
  if (!w) return "";
  const c = escapeAttr(w.color || "#3b82f6");
  return `<span class="tp-wallet-pill" style="--wc:${c}">${escapeHtml(w.name)}</span>`;
}

// Label & nilai periode mobile berdasarkan state filter aktif
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

function updateMobilePeriodUi() {
  const valueEl = document.getElementById("m-period-value");
  if (valueEl) valueEl.textContent = getPeriodSelection().label;
}

// Isi daftar pilihan periode di modal (dibangun ulang tiap dibuka)
function renderPeriodOptions() {
  const list = document.getElementById("period-options");
  if (!list) return;
  let earliestYear = 2024;
  allTransactions.forEach((t) => {
    const y = t.date ? parseInt(t.date.split("-")[0], 10) : NaN;
    if (!isNaN(y) && y < earliestYear) earliestYear = y;
  });
  const now = new Date();
  const current = getPeriodSelection().value;
  const opt = (value, label) =>
    `<button type="button" class="tp-opt ${value === current ? "active" : ""}" data-value="${value}"><span>${label}</span>${value === current ? '<i class="fas fa-check"></i>' : ""}</button>`;

  let html = opt("today", "Hari Ini") + opt("week", "Minggu Ini");
  for (let y = now.getFullYear(); y >= earliestYear; y--) {
    html += `<div class="tp-opt-group">${y}</div>`;
    const last = y === now.getFullYear() ? now.getMonth() : 11;
    for (let m = last; m >= 0; m--) {
      html += opt(monthKey(y, m + 1), `${MONTH_NAMES[m]} ${y}`);
    }
  }
  html += `<div class="tp-opt-group">Lainnya</div>` + opt("all", "Semua Waktu");
  list.innerHTML = html;
}

function openPeriodModal() {
  const bar = document.getElementById("period-bar");
  if (!bar) return;
  renderPeriodOptions();
  bar.classList.add("open");
  bar.setAttribute("aria-hidden", "false");
  document.body.classList.add("filter-modal-active");
  bar.querySelector(".tp-opt.active")?.scrollIntoView({ block: "center" });
}

function closePeriodModal() {
  const bar = document.getElementById("period-bar");
  if (!bar) return;
  bar.classList.remove("open");
  bar.setAttribute("aria-hidden", "true");
  document.body.classList.remove("filter-modal-active");
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

  // Pemasukan: tanpa persentase. Pengeluaran & Tabungan: persentase + bar
  const incomeRow = `
                            <div class="tp-sum-income">
                                <span class="tp-tile-ico income">${typeTriangle("income")}</span>
                                <span class="tp-sum-income-text">
                                    <span class="tp-tile-label">Pemasukan</span>
                                    <span class="tp-tile-value income" id="total-income-summary">Rp 0</span>
                                </span>
                            </div>`;
  const pctCard = (type, label, id) => `
                            <div class="tp-pcard ${type}">
                                <div class="tp-pcard-top">
                                    <span class="tp-tile-ico ${type}">${type === "saving" ? '<i class="fas fa-piggy-bank"></i>' : typeTriangle(type)}</span>
                                    <span class="tp-pct-pill ${type}" id="${id}-pct" title="Dari saldo dompet yang dipakai">–</span>
                                </div>
                                <span class="tp-tile-label">${label}</span>
                                <span class="tp-tile-value ${type}" id="${id}">Rp 0</span>
                                <span class="tp-pbar" aria-hidden="true"><span class="tp-pbar-fill ${type}" id="${id}-bar"></span></span>
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
                    <button type="button" class="tp-action" id="m-period-btn" aria-label="Pilih periode">
                        <span class="ico"><i class="fas fa-calendar-days"></i></span>Periode
                    </button>
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
                        <div class="tp-card tp-sum">
                            ${incomeRow}
                            <div class="tp-sum-pair">
                                ${pctCard("expense", "Pengeluaran", "total-expense-summary")}
                                ${pctCard("saving", "Tabungan", "total-saving-summary")}
                            </div>
                            <p class="tp-sum-note">Persentase = dari saldo dompet yang dipakai</p>
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
                        <div class="tp-list-card">
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

            <!-- Pilih periode (sheet di mobile, dialog di desktop) -->
            <div class="tp-filter" id="period-bar" aria-hidden="true">
                <div class="tp-filter-sheet" role="dialog" aria-label="Pilih periode">
                    <div class="tp-filter-head">
                        <h3>Pilih Periode</h3>
                        <button type="button" class="tp-close" id="period-close-btn" aria-label="Tutup">
                            <i class="fas fa-times"></i>
                        </button>
                    </div>
                    <div class="tp-filter-body tp-opt-list" id="period-options"></div>
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
  walletMap = new Map(wallets.map((w) => [w.id, w]));
  balanceBeforeMap = buildBalanceBefore(allTransactions, wallets);
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
        (t.location && normalizeString(t.location).includes(searchTerm)) ||
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
  });

  // Persentase hanya untuk pengeluaran & tabungan (dari saldo dompet yang dipakai)
  [
    ["total-expense-summary", "expense"],
    ["total-saving-summary", "saving"],
  ].forEach(([id, type]) => {
    const { spent, funds } = periodPct(transactions, balanceBeforeMap, type);
    const pct = document.getElementById(`${id}-pct`);
    if (pct) pct.textContent = formatPct(spent, funds);
    const bar = document.getElementById(`${id}-bar`);
    if (bar) {
      const ratio = funds > 0 ? Math.min(100, (spent / funds) * 100) : 0;
      bar.style.width = `${spent > 0 ? Math.max(ratio, 2) : 0}%`;
    }
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

  const rowHtml = (t) => {
    const isMulti = t.isMultiItem === true && Array.isArray(t.items);
    const sign = t.type === "income" ? "+ " : t.type === "expense" ? "- " : "";
    const lead =
      t.type === "saving"
        ? '<i class="fas fa-piggy-bank"></i>'
        : typeTriangle(t.type);
    const mainMeta = isMulti
      ? `${t.items.length} barang`
      : t.category || "Umum";
    const timeText = t.time ? String(t.time).replace(":", ".") : "";
    const pill = walletPillHtml(walletMap.get(t.walletId));
    const loc = t.location
      ? `<span class="tp-loc"><i class="fas fa-location-dot"></i>${escapeHtml(t.location)}</span>`
      : "";
    return `
        <div class="tp-row" data-id="${t.id}" role="button" tabindex="0">
            <div class="tp-lead ${t.type}">
                <span class="tp-lead-ico">${lead}</span>
                ${hasPct(t.type) ? `<span class="tp-pct ${t.type}" title="Dari saldo dompet yang dipakai">${txPctText(t, balanceBeforeMap)}</span>` : ""}
            </div>
            <div class="tp-info">
                <div class="tp-name">${escapeHtml(t.itemName)}</div>
                <div class="tp-meta">
                    <span>${escapeHtml(mainMeta)}</span>
                    ${timeText ? `<span>${timeText}</span>` : ""}
                </div>
                ${pill || loc ? `<div class="tp-tags">${pill}${loc}</div>` : ""}
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
        </div>`;
  };

  // Kelompokkan per tanggal (data sudah terurut terbaru di atas)
  const groups = [];
  transactions.forEach((t) => {
    const last = groups[groups.length - 1];
    if (last && last.date === t.date) last.items.push(t);
    else groups.push({ date: t.date, items: [t] });
  });

  container.innerHTML = groups
    .map(
      (g) => `
        <section class="tp-day">
            <div class="tp-day-head">${formatLongDate(g.date)}</div>
            ${g.items.map(rowHtml).join("")}
        </section>`,
    )
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

// Modal detail transaksi (read-only), gaya sama dengan modal tambah transaksi
// tetapi mengambang di tengah halaman.
async function showTransactionDetailModal(id) {
  const transaction = await getItem(STORES.TRANSACTIONS, id);
  if (!transaction) {
    showToast("Transaksi tidak ditemukan", "error");
    return;
  }

  const wallet = transaction.walletId
    ? await getItem(STORES.WALLETS, transaction.walletId)
    : null;

  if (transaction.isMultiItem === true && Array.isArray(transaction.items)) {
    showMultiTransactionDetailModal(transaction, wallet);
    return;
  }

  openDetailModal({ transaction, wallet });
}

const DETAIL_META = {
  expense: { label: "Pengeluaran", sign: "- ", icon: "fa-receipt" },
  income: { label: "Pemasukan", sign: "+ ", icon: "fa-receipt" },
  saving: { label: "Tabungan", sign: "", icon: "fa-piggy-bank" },
};

// Baris "Dari saldo dompet": hanya untuk pengeluaran & tabungan
function walletPctRow(transaction) {
  if (!hasPct(transaction.type)) return null;
  const before = balanceBeforeMap.get(transaction.id);
  if (!Number.isFinite(before) || before <= 0) return null;
  return [
    "Dari saldo dompet",
    `${txPctText(transaction, balanceBeforeMap)} <small style="font-weight:500;opacity:.7">dari ${formatCurrency(before)}</small>`,
  ];
}

function mxRowsHtml(rows) {
  return rows
    .filter(Boolean)
    .map(
      ([l, v]) =>
        `<div class="mx-row"><span>${l}</span><span>${v}</span></div>`,
    )
    .join("");
}

// Detail transaksi biasa (read-only), desain sama dengan detail transaksi banyak
function openDetailModal({ transaction, wallet }) {
  ensureMultiSheetStyles();
  document.querySelector(".mx-overlay")?.remove();

  const meta = DETAIL_META[transaction.type] || DETAIL_META.expense;
  const isSaving = transaction.type === "saving";
  const quantity = transaction.quantity || 1;
  const unitPrice = transaction.amount / quantity;

  const rows = mxRowsHtml([
    isSaving ? null : ["Harga satuan", formatCurrency(unitPrice)],
    isSaving ? null : ["Jumlah", formatMoneyInput(quantity)],
    [
      "Kategori",
      escapeHtml(isSaving ? "Tabungan" : transaction.category || "Umum"),
    ],
    ["Dompet", walletPillHtml(wallet) || "-"],
    walletPctRow(transaction),
    transaction.location ? ["Lokasi", escapeHtml(transaction.location)] : null,
    transaction.note ? ["Catatan", escapeHtml(transaction.note)] : null,
  ]);

  const overlay = document.createElement("div");
  overlay.className = "mx-overlay mx-detail";
  overlay.innerHTML = `
    <div class="mx-sheet" role="dialog" aria-modal="true" aria-labelledby="mx-title">
      <header class="mx-head">
        <span class="mx-grab" aria-hidden="true"></span>
        <div class="mx-head-row">
          <span class="mx-head-ico"><i class="fas ${meta.icon}"></i></span>
          <div class="mx-head-text"><h3 id="mx-title">Detail transaksi</h3></div>
          <button type="button" class="mx-x mx-close" aria-label="Tutup"><i class="fas fa-xmark"></i></button>
        </div>
      </header>
      <div class="mx-body">
        <div class="mx-hero ${transaction.type}">
          <span class="mx-hero-label">${meta.label}</span>
          <span class="mx-hero-amt">${meta.sign}${formatCurrency(transaction.amount)}</span>
          <span class="mx-hero-name">${escapeHtml(transaction.itemName)}</span>
          <span class="mx-hero-date">${formatDate(transaction.date)}${transaction.time ? `, ${escapeHtml(transaction.time)}` : ""}</span>
        </div>
        <div class="mx-rows">${rows}</div>
      </div>
      <footer class="mx-foot">
        <div class="mx-btns">
          <button type="button" class="mx-btn ghost mx-close">Tutup</button>
          <button type="button" class="mx-btn primary" id="mx-edit">Edit</button>
        </div>
      </footer>
    </div>`;
  document.body.appendChild(overlay);

  const prevOverflow = document.body.style.overflow;
  document.body.style.overflow = "hidden";
  const close = () => {
    overlay.remove();
    document.body.style.overflow = prevOverflow;
  };
  overlay
    .querySelectorAll(".mx-close")
    .forEach((b) => b.addEventListener("click", close));
  overlay.querySelector("#mx-edit").addEventListener("click", () => {
    close();
    editTransaction(transaction.id);
  });
  // Detail hanya baca, jadi aman ditutup dengan klik area gelap
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) close();
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
  const periodBar = document.getElementById("period-bar");
  document
    .getElementById("m-period-btn")
    ?.addEventListener("click", openPeriodModal);
  document
    .getElementById("period-close-btn")
    ?.addEventListener("click", closePeriodModal);
  periodBar?.addEventListener("click", (e) => {
    if (e.target === periodBar) return closePeriodModal();
    const opt = e.target.closest(".tp-opt");
    if (opt) {
      applyMobilePeriod(opt.dataset.value);
      closePeriodModal();
    }
  });
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
      closePeriodModal();
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
  if (txModalOpening || document.querySelector("[data-tx-modal], .mx-overlay"))
    return;
  txModalOpening = true;
  try {
    await showTransactionModalImpl(transactionId);
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

  ensureMultiSheetStyles();
  document.querySelector(".mx-overlay")?.remove();

  const initialType = isEdit ? transaction.type : "expense";
  const now = getCurrentDateTime();

  const modal = document.createElement("div");
  modal.className = "mx-overlay";
  modal.innerHTML = `
    <form class="mx-sheet" id="transaction-form" role="dialog" aria-modal="true" aria-labelledby="mx-title" novalidate>
      <header class="mx-head">
        <span class="mx-grab" aria-hidden="true"></span>
        <div class="mx-head-row">
          <span class="mx-head-ico"><i class="fas ${isEdit ? "fa-pen" : "fa-plus"}"></i></span>
          <div class="mx-head-text">
            <h3 id="mx-title">${isEdit ? "Edit transaksi" : "Tambah transaksi"}</h3>
            <p>Catat pemasukan, pengeluaran, atau tabungan</p>
          </div>
          <button type="button" class="mx-x mx-close" aria-label="Tutup"><i class="fas fa-xmark"></i></button>
        </div>
      </header>

      <div class="mx-body">
        <section class="mx-fields">
          <div class="mx-field">
            <span class="mx-lbl">Tipe transaksi</span>
            <div class="mx-seg" role="group" aria-label="Tipe transaksi">
              <button type="button" class="mx-seg-btn ${initialType === "expense" ? "active" : ""}" data-type="expense">
                ${typeTriangle("expense")} Pengeluaran
              </button>
              <button type="button" class="mx-seg-btn ${initialType === "income" ? "active" : ""}" data-type="income">
                ${typeTriangle("income")} Pemasukan
              </button>
              <button type="button" class="mx-seg-btn ${initialType === "saving" ? "active" : ""}" data-type="saving">
                <i class="fas fa-piggy-bank"></i> Tabungan
              </button>
            </div>
            <input type="hidden" id="transaction-type" value="${initialType}">
          </div>

          <label class="mx-field" id="transaction-template-group">
            <span class="mx-lbl">Template</span>
            <select id="transaction-template" class="mx-input">
              <option value="">Tanpa template</option>
            </select>
          </label>

          <label class="mx-field">
            <span class="mx-lbl">Nama transaksi</span>
            <input type="text" id="transaction-name" class="mx-input" autocomplete="off"
                   value="${isEdit ? escapeAttr(transaction.itemName) : ""}"
                   placeholder="Contoh: Makan siang, Belanja bulanan">
          </label>

          <div class="mx-grid2" id="transaction-amount-row">
            <label class="mx-field">
              <span class="mx-lbl">Nominal</span>
              <span class="mx-money"><b>Rp</b><input type="text" inputmode="numeric" autocomplete="off" data-money id="transaction-amount"
                     value="${isEdit ? escapeAttr(formatMoneyInput(transaction.amount / (transaction.quantity || 1))) : ""}"
                     placeholder="0"></span>
            </label>
            <div class="mx-field" id="transaction-quantity-group">
              <span class="mx-lbl">Jumlah</span>
              <div class="mx-stepper" role="group" aria-label="Jumlah">
                <button type="button" class="mx-step" data-step="-1" aria-label="Kurangi jumlah"><i class="fas fa-minus"></i></button>
                <input type="text" inputmode="numeric" autocomplete="off" class="mx-i-qty" id="transaction-quantity"
                       value="${isEdit ? transaction.quantity || 1 : 1}" aria-label="Jumlah">
                <button type="button" class="mx-step" data-step="1" aria-label="Tambah jumlah"><i class="fas fa-plus"></i></button>
              </div>
            </div>
          </div>

          <label class="mx-field" id="transaction-category-group">
            <span class="mx-lbl">Kategori</span>
            <select id="transaction-category" class="mx-input">
              <option value="">Pilih kategori</option>
            </select>
          </label>

          <label class="mx-field">
            <span class="mx-lbl">Dompet</span>
            <select id="transaction-wallet" class="mx-input">
              <option value="">Pilih dompet</option>
              ${wallets
                .map(
                  (w) =>
                    `<option value="${escapeAttr(w.id)}" ${isEdit && transaction.walletId === w.id ? "selected" : ""}>${escapeHtml(w.name)} - ${formatCurrency(w.balance)}</option>`,
                )
                .join("")}
            </select>
          </label>

          <div class="mx-grid2">
            <label class="mx-field"><span class="mx-lbl">Tanggal</span>
              <input type="date" id="transaction-date" class="mx-input" value="${escapeAttr(isEdit ? transaction.date : now.date)}"></label>
            <label class="mx-field"><span class="mx-lbl">Jam</span>
              <input type="time" id="transaction-time" class="mx-input" value="${escapeAttr(isEdit ? transaction.time || "" : now.time)}"></label>
          </div>

          <details class="mx-more"${isEdit && (transaction.location || transaction.note) ? " open" : ""}>
            <summary>Lokasi dan catatan</summary>
            <div class="mx-more-body">
              <label class="mx-field"><span class="mx-lbl">Lokasi</span>
                <input type="text" id="transaction-location" class="mx-input" autocomplete="off"
                       value="${isEdit ? escapeAttr(transaction.location || "") : ""}"
                       placeholder="Contoh: Indomaret, Warung Bu Siti"></label>
              <label class="mx-field"><span class="mx-lbl">Catatan</span>
                <textarea id="transaction-note" class="mx-input" rows="2" placeholder="Tambahkan catatan...">${isEdit ? escapeHtml(transaction.note || "") : ""}</textarea></label>
            </div>
          </details>

          ${
            isEdit
              ? ""
              : `<label class="mx-check" id="transaction-save-template-group">
                  <input type="checkbox" id="transaction-save-template">
                  Jadikan transaksi ini template
                </label>`
          }
        </section>
      </div>

      <footer class="mx-foot">
        <div class="mx-total">
          <span class="mx-total-label">Total</span>
          <strong class="mx-total-amt" id="transaction-total">${formatCurrency(0)}</strong>
        </div>
        <div class="mx-btns">
          <button type="button" class="mx-btn ghost mx-close">Batal</button>
          <button type="submit" class="mx-btn primary">${isEdit ? "Simpan perubahan" : "Tambah transaksi"}</button>
        </div>
      </footer>
    </form>`;
  document.body.appendChild(modal);

  const prevOverflow = document.body.style.overflow;
  document.body.style.overflow = "hidden";
  const closeForm = () => {
    modal.remove();
    document.body.style.overflow = prevOverflow;
  };
  // Form hanya ditutup lewat Batal atau tombol silang; klik area gelap sengaja
  // tidak menutup agar input tidak hilang.
  modal.querySelectorAll(".mx-close").forEach((btn) => {
    btn.addEventListener("click", closeForm);
  });

  const typeBtns = modal.querySelectorAll(".mx-seg-btn");
  const typeInput = modal.querySelector("#transaction-type");
  const categorySelect = modal.querySelector("#transaction-category");
  const categoryGroup = modal.querySelector("#transaction-category-group");
  const templateSelect = modal.querySelector("#transaction-template");
  const templateGroup = modal.querySelector("#transaction-template-group");
  const quantityGroup = modal.querySelector("#transaction-quantity-group");
  const quantityInput = modal.querySelector("#transaction-quantity");
  const amountInput = modal.querySelector("#transaction-amount");
  const totalEl = modal.querySelector("#transaction-total");

  const parseQty = () =>
    /^\d+$/.test(quantityInput.value) ? parseInt(quantityInput.value, 10) : 0;

  // Total = nominal x jumlah (tabungan selalu x1)
  function updateTotal() {
    const unit = parseMoney(amountInput.value);
    const qty = typeInput.value === "saving" ? 1 : parseQty();
    totalEl.textContent = formatCurrency(
      Number.isFinite(unit) && unit > 0 && qty > 0 ? unit * qty : 0,
    );
  }

  // Quantity hanya berlaku untuk Pengeluaran/Pemasukan (bukan Tabungan)
  function updateQuantityVisibility() {
    quantityGroup.style.display = typeInput.value === "saving" ? "none" : "";
    updateTotal();
  }

  function setQuantitySelection(qty) {
    quantityInput.value = String(qty);
    updateTotal();
  }

  amountInput.addEventListener("input", updateTotal);
  quantityInput.addEventListener("input", () => {
    quantityInput.value = quantityInput.value.replace(/\D/g, "").slice(0, 6);
    updateTotal();
  });
  // Jumlah kosong/0 tidak valid: kembalikan ke 1 saat fokus pergi
  quantityInput.addEventListener("blur", () => {
    if (!/^[1-9]\d*$/.test(quantityInput.value)) setQuantitySelection(1);
  });
  modal.querySelectorAll(".mx-step").forEach((btn) => {
    btn.addEventListener("click", () => {
      const next = Math.min(
        999999,
        Math.max(1, parseQty() + Number(btn.dataset.step)),
      );
      setQuantitySelection(next);
    });
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
      `<option value="">Tanpa template</option>` +
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
    // Kategori yang tidak ada di daftar (mis. "Pembayaran Hutang" dari halaman
    // Hutang & Piutang, atau kategori yang sudah dihapus) tetap dipertahankan
    // saat edit supaya tidak diam-diam berganti kategori.
    const orphan =
      isEdit &&
      transaction?.type === currentType &&
      transaction.category &&
      !filtered.some((c) => c.name === transaction.category)
        ? `<option value="${escapeAttr(transaction.category)}" selected>${escapeHtml(transaction.category)}</option>`
        : "";
    categorySelect.innerHTML =
      `<option value="">Pilih kategori</option>` +
      orphan +
      filtered
        .map(
          (cat) => `
        <option value="${escapeAttr(cat.name)}" ${isEdit && transaction?.category === cat.name ? "selected" : ""}>
          ${escapeHtml(cat.name)}
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
    const location = modal.querySelector("#transaction-location").value.trim();
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
        location,
        date,
        time,
        savingId: type === "saving" ? savingId : null,
      };

      // Snapshot saldo dompet SEBELUM transaksi ini = pembanding persentase.
      // Transaksi baru: saldo dompet sekarang. Edit di dompet yang sama: snapshot
      // lama dipertahankan. Edit pindah dompet: snapshot lama tidak berlaku lagi.
      if (!isEdit) {
        payload.balanceBefore = wallet.balance;
      } else if (transaction.walletId !== walletId) {
        payload.balanceBefore = null;
      }

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

      closeForm();
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

  modal.querySelector("#transaction-name").focus({ preventScroll: true });
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
  document.querySelectorAll(".modal-overlay, .mx-overlay").forEach((el) => {
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
export const MULTI_DEFAULT_NAME = "Transaksi Banyak";
const MULTI_MIN_ITEMS = 2;

function newBlankMultiItem() {
  return { name: "", price: "", qty: "1", category: "" };
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
export function saveMultiTransactionAtomic(record, oldRecord) {
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

            // Snapshot saldo dompet sebelum transaksi (pembanding persentase)
            if (!oldRecord) record.balanceBefore = newWallet.balance;
            else if (oldRecord.walletId !== record.walletId)
              record.balanceBefore = null;

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

// ==================== FORM TRANSAKSI BANYAK (dipakai Transaksi & Rencana) ====================
// Satu komponen form untuk dua tempat. Yang berbeda hanya konfigurasi:
// judul, warna, tampil/tidaknya tanggal-jam, dan apa yang dilakukan saat disimpan.
//
// config: {
//   title, subtitle, submitLabel, accent, highlight, showDateTime,
//   wallets, expenseCategories,
//   initial: { name, walletId, date, time, location, note, items: [{itemName, amount, quantity, category}] },
//   onSubmit: async (payload) => ({ ok, message?, successMessage? }),
//   afterSave: async () => {}
// }
// payload: { name, walletId, date, time, location, note, amount, items }
export function openMultiItemForm(config) {
  ensureMultiSheetStyles();
  document.querySelector(".mx-overlay")?.remove();

  const {
    title,
    subtitle = "",
    submitLabel = "Simpan",
    accent = "#0B3D2A",
    highlight = "#C6F432",
    showDateTime = true,
    wallets = [],
    expenseCategories = [],
    initial = {},
  } = config;

  const isEdit = Array.isArray(initial.items) && initial.items.length > 0;
  const now = getCurrentDateTime();

  // State barang = sumber kebenaran; DOM hanyalah cerminannya
  const items = (initial.items || []).map((i) => ({
    name: i.itemName || "",
    price: formatMoneyInput(i.amount),
    qty: String(i.quantity || 1),
    category: i.category || "",
  }));
  while (items.length < MULTI_MIN_ITEMS) items.push(newBlankMultiItem());
  // Tambah baru: barang pertama langsung terbuka. Edit: semua terlipat agar mudah dipindai.
  let openIndex = isEdit ? -1 : 0;

  const categoryOptionsHtml = (selected) => {
    // Kategori lama yang sudah dihapus tetap tampil agar data tidak hilang diam-diam
    const extra =
      selected && !expenseCategories.some((c) => c.name === selected)
        ? `<option value="${escapeAttr(selected)}" selected>${escapeHtml(selected)}</option>`
        : "";
    return (
      `<option value="">Pilih kategori</option>` +
      extra +
      expenseCategories
        .map(
          (c) =>
            `<option value="${escapeAttr(c.name)}" ${c.name === selected ? "selected" : ""}>${escapeHtml(c.name)}</option>`,
        )
        .join("")
    );
  };

  const parseQty = (it) => (/^\d+$/.test(it.qty) ? parseInt(it.qty, 10) : 0);
  const isComplete = (it) =>
    it.name.trim() && calcMultiItemTotal(it) > 0 && it.category;

  // Isi baris ringkas (yang selalu terlihat, bahkan saat item terlipat)
  const barInner = (it, i) => {
    const total = calcMultiItemTotal(it);
    const name = it.name.trim();
    const sub = isComplete(it)
      ? `<span>${formatMoneyInput(parseQty(it))} × ${formatCurrency(parseMoney(it.price))}</span><span>${escapeHtml(it.category)}</span>`
      : `<span class="mx-warn">Belum lengkap</span>`;
    return `
      <span class="mx-item-main">
        <span class="mx-item-title${name ? "" : " is-empty"}">${name ? escapeHtml(name) : `Barang ${i + 1}`}</span>
        <span class="mx-item-sub">${sub}</span>
      </span>
      <span class="mx-item-total">${total > 0 ? formatCurrency(total) : ""}</span>
      <i class="fas fa-chevron-down mx-chev" aria-hidden="true"></i>`;
  };

  const itemHtml = (it, i) => {
    const open = i === openIndex;
    const canRemove = items.length > MULTI_MIN_ITEMS;
    return `
      <div class="mx-item${open ? " is-open" : ""}" data-index="${i}">
        <button type="button" class="mx-item-bar" aria-expanded="${open}">${barInner(it, i)}</button>
        <div class="mx-item-body"${open ? "" : " hidden"}>
          <label class="mx-field">
            <span class="mx-lbl">Nama barang</span>
            <input type="text" class="mx-input mx-i-name" value="${escapeAttr(it.name)}" placeholder="Contoh: Indomie goreng" autocomplete="off">
          </label>
          <div class="mx-grid2">
            <label class="mx-field mx-f-price">
              <span class="mx-lbl">Harga satuan</span>
              <span class="mx-money"><b>Rp</b><input type="text" inputmode="numeric" autocomplete="off" data-money class="mx-i-price" value="${escapeAttr(formatMoneyInput(it.price))}" placeholder="0"></span>
            </label>
            <div class="mx-field mx-f-qty">
              <span class="mx-lbl">Jumlah</span>
              <div class="mx-stepper" role="group" aria-label="Jumlah">
                <button type="button" class="mx-step" data-step="-1" aria-label="Kurangi jumlah"><i class="fas fa-minus"></i></button>
                <input type="text" inputmode="numeric" autocomplete="off" class="mx-i-qty" value="${escapeAttr(it.qty)}" aria-label="Jumlah barang">
                <button type="button" class="mx-step" data-step="1" aria-label="Tambah jumlah"><i class="fas fa-plus"></i></button>
              </div>
            </div>
          </div>
          <label class="mx-field mx-f-cat">
            <span class="mx-lbl">Kategori</span>
            <select class="mx-input mx-i-cat">${categoryOptionsHtml(it.category)}</select>
          </label>
          <div class="mx-item-foot">
            ${canRemove ? `<button type="button" class="mx-link danger mx-i-remove"><i class="fas fa-trash"></i> Hapus barang</button>` : "<span></span>"}
            <span>Subtotal<strong class="mx-i-subtotal">${formatCurrency(calcMultiItemTotal(it))}</strong></span>
          </div>
        </div>
      </div>`;
  };

  const hasExtra = Boolean(initial.location || initial.note);
  const overlay = document.createElement("div");
  overlay.className = "mx-overlay";
  overlay.style.setProperty("--mx-accent", accent);
  overlay.style.setProperty("--mx-hi", highlight);
  overlay.innerHTML = `
    <form class="mx-sheet" role="dialog" aria-modal="true" aria-labelledby="mx-title" novalidate>
      <header class="mx-head">
        <span class="mx-grab" aria-hidden="true"></span>
        <div class="mx-head-row">
          <span class="mx-head-ico"><i class="fas fa-cart-shopping"></i></span>
          <div class="mx-head-text">
            <h3 id="mx-title">${escapeHtml(title)}</h3>
            ${subtitle ? `<p>${escapeHtml(subtitle)}</p>` : ""}
          </div>
          <button type="button" class="mx-x mx-close" aria-label="Tutup"><i class="fas fa-xmark"></i></button>
        </div>
      </header>

      <div class="mx-body">
        <section class="mx-fields">
          <label class="mx-field">
            <span class="mx-lbl">Nama transaksi</span>
            <input type="text" id="mx-name" class="mx-input" autocomplete="off" value="${escapeAttr(initial.name || "")}" placeholder="${MULTI_DEFAULT_NAME}, contoh: Belanja Indomaret">
          </label>
          <label class="mx-field" id="mx-wallet-field">
            <span class="mx-lbl">Dompet</span>
            <select id="mx-wallet" class="mx-input">
              <option value="">Pilih dompet</option>
              ${wallets
                .map(
                  (w) =>
                    `<option value="${escapeAttr(w.id)}" ${initial.walletId === w.id ? "selected" : ""}>${escapeHtml(w.name)} - ${formatCurrency(w.balance)}</option>`,
                )
                .join("")}
            </select>
          </label>
          ${
            showDateTime
              ? `<div class="mx-grid2">
                  <label class="mx-field"><span class="mx-lbl">Tanggal</span>
                    <input type="date" id="mx-date" class="mx-input" value="${escapeAttr(initial.date || now.date)}"></label>
                  <label class="mx-field"><span class="mx-lbl">Jam</span>
                    <input type="time" id="mx-time" class="mx-input" value="${escapeAttr(isEdit ? initial.time || "" : now.time)}"></label>
                </div>`
              : ""
          }
          <details class="mx-more"${hasExtra ? " open" : ""}>
            <summary>Lokasi dan catatan</summary>
            <div class="mx-more-body">
              <label class="mx-field"><span class="mx-lbl">Lokasi</span>
                <input type="text" id="mx-location" class="mx-input" autocomplete="off" value="${escapeAttr(initial.location || "")}" placeholder="Contoh: Indomaret, Warung Bu Siti"></label>
              <label class="mx-field"><span class="mx-lbl">Catatan</span>
                <textarea id="mx-note" class="mx-input" rows="2" placeholder="Tambahkan catatan...">${escapeHtml(initial.note || "")}</textarea></label>
            </div>
          </details>
        </section>

        <section>
          <div class="mx-sec-head"><h4>Barang</h4><span class="mx-count" id="mx-count"></span></div>
          <div class="mx-items" id="mx-items"></div>
          <button type="button" class="mx-add" id="mx-add"><i class="fas fa-plus"></i> Tambah barang</button>
        </section>
      </div>

      <footer class="mx-foot">
        <div class="mx-total">
          <span class="mx-total-label">Total</span>
          <strong class="mx-total-amt" id="mx-total">${formatCurrency(0)}</strong>
        </div>
        <div class="mx-btns">
          <button type="button" class="mx-btn ghost mx-close">Batal</button>
          <button type="submit" class="mx-btn primary" id="mx-submit">${escapeHtml(submitLabel)}</button>
        </div>
      </footer>
    </form>`;
  document.body.appendChild(overlay);

  const prevOverflow = document.body.style.overflow;
  document.body.style.overflow = "hidden";
  const close = () => {
    overlay.remove();
    document.body.style.overflow = prevOverflow;
  };

  const $ = (sel) => overlay.querySelector(sel);
  const form = $(".mx-sheet");
  const itemsEl = $("#mx-items");
  const totalEl = $("#mx-total");
  const countEl = $("#mx-count");
  const submitBtn = $("#mx-submit");

  const updateTotals = () => {
    totalEl.textContent = formatCurrency(
      items.reduce((sum, it) => sum + calcMultiItemTotal(it), 0),
    );
    countEl.textContent = `${items.length} barang`;
  };

  const renderItems = () => {
    itemsEl.innerHTML = items.map(itemHtml).join("");
    updateTotals();
  };

  const blockOf = (el) => el.closest(".mx-item");
  const indexOf = (el) => {
    const b = blockOf(el);
    return b ? Number(b.dataset.index) : -1;
  };

  // Perbarui baris ringkas + subtotal tanpa merender ulang (fokus input tidak hilang)
  const syncItem = (block, i) => {
    const it = items[i];
    block.querySelector(".mx-item-bar").innerHTML = barInner(it, i);
    block.querySelector(".mx-i-subtotal").textContent = formatCurrency(
      calcMultiItemTotal(it),
    );
    block.classList.remove("has-error");
    block
      .querySelectorAll(".is-invalid")
      .forEach((el) => el.classList.remove("is-invalid"));
    updateTotals();
  };

  const focusItem = (i, selector) => {
    const block = itemsEl.querySelector(`.mx-item[data-index="${i}"]`);
    if (!block) return null;
    block.scrollIntoView({ block: "nearest" });
    block.querySelector(selector)?.focus({ preventScroll: true });
    return block;
  };

  itemsEl.addEventListener("input", (e) => {
    const i = indexOf(e.target);
    if (i < 0) return;
    const it = items[i];
    if (e.target.classList.contains("mx-i-name")) {
      it.name = e.target.value;
    } else if (e.target.classList.contains("mx-i-price")) {
      it.price = e.target.value;
    } else if (e.target.classList.contains("mx-i-qty")) {
      const digits = e.target.value.replace(/\D/g, "").slice(0, 6);
      e.target.value = digits;
      it.qty = digits;
    } else {
      return;
    }
    syncItem(blockOf(e.target), i);
  });

  itemsEl.addEventListener("change", (e) => {
    if (!e.target.classList.contains("mx-i-cat")) return;
    const i = indexOf(e.target);
    if (i < 0) return;
    items[i].category = e.target.value;
    syncItem(blockOf(e.target), i);
  });

  // Jumlah kosong/0 tidak valid: kembalikan ke 1 saat fokus pergi
  itemsEl.addEventListener("focusout", (e) => {
    if (!e.target.classList.contains("mx-i-qty")) return;
    const i = indexOf(e.target);
    if (i < 0 || /^[1-9]\d*$/.test(items[i].qty)) return;
    items[i].qty = "1";
    e.target.value = "1";
    syncItem(blockOf(e.target), i);
  });

  itemsEl.addEventListener("click", (e) => {
    const removeBtn = e.target.closest(".mx-i-remove");
    if (removeBtn) {
      const i = indexOf(removeBtn);
      if (i >= 0 && items.length > MULTI_MIN_ITEMS) {
        items.splice(i, 1);
        if (i < openIndex) openIndex -= 1;
        else if (i === openIndex) openIndex = -1;
        renderItems();
      }
      return;
    }

    const stepBtn = e.target.closest(".mx-step");
    if (stepBtn) {
      const i = indexOf(stepBtn);
      if (i < 0) return;
      const next = Math.min(
        999999,
        Math.max(1, parseQty(items[i]) + Number(stepBtn.dataset.step)),
      );
      items[i].qty = String(next);
      const block = blockOf(stepBtn);
      block.querySelector(".mx-i-qty").value = items[i].qty;
      syncItem(block, i);
      return;
    }

    const bar = e.target.closest(".mx-item-bar");
    if (bar) {
      const i = indexOf(bar);
      openIndex = openIndex === i ? -1 : i;
      renderItems();
      if (openIndex === i) {
        focusItem(i, items[i].name ? ".mx-i-price" : ".mx-i-name");
      }
    }
  });

  $("#mx-add").addEventListener("click", () => {
    items.push(newBlankMultiItem());
    openIndex = items.length - 1;
    renderItems();
    focusItem(openIndex, ".mx-i-name");
  });

  overlay.querySelectorAll(".mx-close").forEach((btn) => {
    btn.addEventListener("click", close);
  });
  // Sama seperti sebelumnya: klik area gelap sengaja tidak menutup form
  // agar input tidak hilang. Tutup lewat Batal atau tombol silang.

  renderItems();
  $("#mx-name").focus({ preventScroll: true });

  // Tandai satu barang bermasalah: buka, beri bingkai merah, fokus ke kolomnya
  const failItem = (i, selector, fieldClass, message) => {
    openIndex = i;
    renderItems();
    const block = focusItem(i, selector);
    block?.classList.add("has-error");
    block?.querySelector(fieldClass)?.classList.add("is-invalid");
    showToast(message, "error");
  };

  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const name = $("#mx-name").value.trim() || MULTI_DEFAULT_NAME;
    const walletId = $("#mx-wallet").value;
    const date = showDateTime ? $("#mx-date").value : "";
    const time = showDateTime ? $("#mx-time").value : "";
    const note = $("#mx-note").value;
    const location = $("#mx-location").value.trim();

    if (!walletId) {
      $("#mx-wallet-field").classList.add("is-invalid");
      $("#mx-wallet").focus();
      showToast("Pilih dompet", "error");
      return;
    }
    $("#mx-wallet-field").classList.remove("is-invalid");
    if (showDateTime && !date) {
      showToast("Tanggal harus diisi", "error");
      return;
    }
    if (items.length < MULTI_MIN_ITEMS) {
      showToast(`Minimal ${MULTI_MIN_ITEMS} barang`, "error");
      return;
    }

    // Validasi SEMUA barang dulu; satu saja tidak valid = tidak ada yang disimpan
    const cleanItems = [];
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      const label = `Barang ${i + 1}`;
      const itemName = it.name.trim();
      const price = parseMoney(it.price);
      const qty = /^\d+$/.test(it.qty) ? parseInt(it.qty, 10) : NaN;

      if (!itemName) {
        return failItem(
          i,
          ".mx-i-name",
          ".mx-input.mx-i-name",
          `${label}: nama barang harus diisi`,
        );
      }
      if (!Number.isSafeInteger(price) || price <= 0) {
        return failItem(
          i,
          ".mx-i-price",
          ".mx-f-price",
          `${label}: harga harus lebih dari 0`,
        );
      }
      if (!Number.isSafeInteger(qty) || qty <= 0) {
        return failItem(
          i,
          ".mx-i-qty",
          ".mx-f-qty",
          `${label}: jumlah harus berupa angka positif`,
        );
      }
      if (!it.category) {
        return failItem(
          i,
          ".mx-i-cat",
          ".mx-f-cat",
          `${label}: pilih kategori`,
        );
      }
      cleanItems.push({
        itemName,
        amount: price, // harga satuan
        quantity: qty,
        category: it.category,
      });
    }

    const amount = cleanItems.reduce((s, it) => s + it.amount * it.quantity, 0);
    if (!Number.isSafeInteger(amount) || amount <= 0) {
      showToast("Total transaksi tidak valid", "error");
      return;
    }

    submitBtn.disabled = true;
    let result;
    try {
      result = await config.onSubmit({
        name,
        walletId,
        date,
        time,
        location,
        note,
        amount,
        items: cleanItems,
      });
    } catch (err) {
      console.error("Gagal menyimpan transaksi banyak:", err);
      result = {
        ok: false,
        message: "Gagal menyimpan. Tidak ada data yang diubah.",
      };
    }
    submitBtn.disabled = false;

    if (!result || !result.ok) {
      // Form tetap terbuka, input tidak hilang
      showToast(
        result?.message || "Gagal menyimpan. Tidak ada data yang diubah.",
        "error",
      );
      return;
    }
    showToast(result.successMessage || "Tersimpan", "success");
    close();
    if (config.afterSave) await config.afterSave();
  });

  return overlay;
}

// Form tambah/edit Transaksi Banyak (halaman Transaksi)
async function showMultiTransactionModal(transactionId = null) {
  if (txModalOpening || document.querySelector("[data-tx-modal], .mx-overlay"))
    return;
  txModalOpening = true;
  try {
    await showMultiTransactionModalImpl(transactionId);
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

  openMultiItemForm({
    title: isEdit ? "Edit transaksi banyak" : "Transaksi banyak",
    subtitle: "Satu belanja, beberapa barang, saldo dipotong sekali",
    submitLabel: isEdit ? "Simpan perubahan" : "Simpan transaksi",
    accent: "#0B3D2A",
    highlight: "#C6F432",
    showDateTime: true,
    wallets,
    expenseCategories,
    initial: isEdit
      ? {
          name: transaction.itemName,
          walletId: transaction.walletId,
          date: transaction.date,
          time: transaction.time || "",
          location: transaction.location || "",
          note: transaction.note || "",
          items: transaction.items,
        }
      : {},
    onSubmit: async (p) => {
      const payload = {
        itemName: p.name,
        amount: p.amount, // TOTAL seluruh barang (bukan harga satuan)
        quantity: 1,
        type: "expense",
        category: MULTI_DEFAULT_NAME,
        walletId: p.walletId,
        note: p.note,
        location: p.location,
        date: p.date,
        time: p.time,
        savingId: null,
        isMultiItem: true,
        items: p.items,
      };

      let record;
      if (isEdit) {
        record = { ...transaction, ...payload };
        record.updatedAt = getCurrentDateTime().datetime;
      } else {
        record = { ...payload, createdAt: getCurrentDateTime().timestamp };
      }

      const result = await saveMultiTransactionAtomic(
        record,
        isEdit ? transaction : null,
      );
      if (!result.ok) {
        if (result.error === "wallet-missing") {
          return { ok: false, message: "Dompet tidak ditemukan" };
        }
        if (result.error === "insufficient") {
          return {
            ok: false,
            message: `Saldo ${result.wallet.name} tidak mencukupi! (Saldo: ${formatCurrency(result.wallet.balance)})`,
          };
        }
        return {
          ok: false,
          message: "Gagal menyimpan transaksi. Tidak ada data yang diubah.",
        };
      }
      return {
        ok: true,
        successMessage: isEdit
          ? "Transaksi berhasil diupdate"
          : "Transaksi berhasil ditambahkan",
      };
    },
    afterSave: async () => {
      await loadTransactions();
      renderFilteredTransactions();
      // Refresh dashboard hanya jika dashboard yang sedang aktif, agar user
      // tidak berpindah dari halaman Transaksi setelah menyimpan
      if (
        window.renderDashboard &&
        window.getCurrentPage &&
        window.getCurrentPage() === "dashboard"
      ) {
        await window.renderDashboard();
      }
    },
  });
}

// Detail (read-only) Transaksi Banyak: ringkasan + daftar barang
function showMultiTransactionDetailModal(transaction, wallet) {
  ensureMultiSheetStyles();
  document.querySelector(".mx-overlay")?.remove();

  const linesHtml = transaction.items
    .map((it) => {
      const qty = it.quantity || 1;
      return `
        <li class="mx-line">
          <div>
            <div class="mx-line-name">${escapeHtml(it.itemName)}</div>
            <div class="mx-line-sub"><span>${formatMoneyInput(qty)} × ${formatCurrency(it.amount)}</span><span>${escapeHtml(it.category || "Umum")}</span></div>
          </div>
          <strong>${formatCurrency(it.amount * qty)}</strong>
        </li>`;
    })
    .join("");

  const rows = [
    ["Dompet", walletPillHtml(wallet) || "-"],
    walletPctRow(transaction),
    transaction.location ? ["Lokasi", escapeHtml(transaction.location)] : null,
    transaction.note ? ["Catatan", escapeHtml(transaction.note)] : null,
  ]
    .filter(Boolean)
    .map(
      ([l, v]) =>
        `<div class="mx-row"><span>${l}</span><span>${v}</span></div>`,
    )
    .join("");

  const overlay = document.createElement("div");
  overlay.className = "mx-overlay mx-detail";
  overlay.innerHTML = `
    <div class="mx-sheet" role="dialog" aria-modal="true" aria-labelledby="mx-title">
      <header class="mx-head">
        <span class="mx-grab" aria-hidden="true"></span>
        <div class="mx-head-row">
          <span class="mx-head-ico"><i class="fas fa-cart-shopping"></i></span>
          <div class="mx-head-text"><h3 id="mx-title">Detail transaksi</h3></div>
          <button type="button" class="mx-x mx-close" aria-label="Tutup"><i class="fas fa-xmark"></i></button>
        </div>
      </header>
      <div class="mx-body">
        <div class="mx-hero">
          <span class="mx-hero-label">Pengeluaran, ${transaction.items.length} barang</span>
          <span class="mx-hero-amt">- ${formatCurrency(transaction.amount)}</span>
          <span class="mx-hero-name">${escapeHtml(transaction.itemName)}</span>
          <span class="mx-hero-date">${formatDate(transaction.date)}${transaction.time ? `, ${escapeHtml(transaction.time)}` : ""}</span>
        </div>
        <div class="mx-rows">${rows}</div>
        <section>
          <div class="mx-sec-head"><h4>Barang yang dibeli</h4></div>
          <ul class="mx-lines">${linesHtml}</ul>
        </section>
      </div>
      <footer class="mx-foot">
        <div class="mx-btns">
          <button type="button" class="mx-btn ghost mx-close">Tutup</button>
          <button type="button" class="mx-btn primary" id="mx-edit">Edit</button>
        </div>
      </footer>
    </div>`;
  document.body.appendChild(overlay);

  const prevOverflow = document.body.style.overflow;
  document.body.style.overflow = "hidden";
  const close = () => {
    overlay.remove();
    document.body.style.overflow = prevOverflow;
  };
  overlay
    .querySelectorAll(".mx-close")
    .forEach((b) => b.addEventListener("click", close));
  overlay.querySelector("#mx-edit").addEventListener("click", () => {
    close();
    editTransaction(transaction.id);
  });
  // Detail hanya baca, jadi aman ditutup dengan klik area gelap
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) close();
  });
}

// Gaya modal transaksi banyak: sheet dari bawah di mobile, dialog di tengah di desktop
function ensureMultiSheetStyles() {
  if (document.getElementById("mx-sheet-styles")) return;
  const style = document.createElement("style");
  style.id = "mx-sheet-styles";
  style.textContent = `
    .mx-overlay {
      --mx-accent: #0B3D2A;
      --mx-hi: #C6F432;
      --mx-surface: var(--bg-secondary, #fff);
      --mx-soft: var(--bg-primary, #F4F4F7);
      --mx-text: var(--text-primary, #242333);
      --mx-muted: var(--text-secondary, #6F6F7B);
      --mx-line: var(--border-color, #E6E6EC);
      --mx-danger: #DC4C4C;
      --mx-warn: #B45309;
      --mx-focus: color-mix(in srgb, var(--mx-accent) 60%, var(--mx-text));
      position: fixed;
      inset: 0;
      z-index: 3000;
      display: flex;
      align-items: flex-end;
      justify-content: center;
      background: rgba(10, 18, 14, 0.52);
      animation: mx-fade 0.18s ease-out;
    }
    .mx-overlay *, .mx-overlay *::before, .mx-overlay *::after { box-sizing: border-box; }
    .mx-sheet {
      width: 100%;
      max-width: 560px;
      max-height: 94vh;
      max-height: 94dvh;
      margin: 0;
      display: flex;
      flex-direction: column;
      overflow: hidden;
      background: var(--mx-surface);
      color: var(--mx-text);
      font-family: inherit;
      border-radius: 28px 28px 0 0;
      box-shadow: 0 -14px 50px rgba(0, 0, 0, 0.25);
      animation: mx-rise 0.3s cubic-bezier(0.2, 0.8, 0.2, 1);
    }
    @keyframes mx-fade { from { opacity: 0; } to { opacity: 1; } }
    @keyframes mx-rise { from { transform: translateY(40px); opacity: 0; } to { transform: none; opacity: 1; } }

    .mx-head { flex: none; padding: 10px 20px 14px; }
    .mx-grab { display: block; width: 40px; height: 4px; margin: 0 auto 12px; border-radius: 99px; background: var(--mx-line); }
    .mx-head-row { display: flex; align-items: center; gap: 12px; }
    .mx-head-ico {
      width: 44px; height: 44px; flex: none; border-radius: 14px;
      display: flex; align-items: center; justify-content: center;
      background: var(--mx-accent); color: var(--mx-hi); font-size: 1.05rem;
    }
    .mx-head-text { flex: 1; min-width: 0; }
    .mx-head-text h3 { margin: 0; font-size: 1.08rem; font-weight: 700; letter-spacing: -0.01em; color: var(--mx-text); }
    .mx-head-text p { margin: 2px 0 0; font-size: 0.78rem; line-height: 1.4; color: var(--mx-muted); }
    .mx-x {
      width: 38px; height: 38px; flex: none; padding: 0; border: 0; border-radius: 50%;
      background: var(--mx-soft); color: var(--mx-muted); font-size: 0.95rem; cursor: pointer;
    }

    .mx-body {
      flex: 1; min-height: 0; overflow-y: auto; overscroll-behavior: contain;
      display: grid; grid-template-columns: minmax(0, 1fr); align-content: start; gap: 22px; padding: 6px 20px 22px; overflow-x: hidden;
    }
    .mx-fields { display: grid; grid-template-columns: minmax(0, 1fr); gap: 12px; }
    .mx-grid2 { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
    .mx-field { display: grid; grid-template-columns: minmax(0, 1fr); gap: 6px; min-width: 0; margin: 0; }
    .mx-grid2 > * { min-width: 0; }
    .mx-lbl { font-size: 0.78rem; font-weight: 600; color: var(--mx-muted); }

    .mx-input {
      width: 100%; min-width: 0; max-width: 100%; height: 46px; padding: 0 14px; margin: 0;
      border: 1.5px solid transparent; border-radius: 12px;
      background: var(--mx-soft); color: var(--mx-text);
      font: inherit; font-size: 16px; outline: none;
      transition: border-color 0.15s, box-shadow 0.15s;
    }
    textarea.mx-input { height: auto; min-height: 72px; padding: 12px 14px; line-height: 1.4; resize: vertical; }
    select.mx-input {
      appearance: none; -webkit-appearance: none; padding-right: 38px;
      background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8' viewBox='0 0 12 8' fill='none' stroke='%238a8a96' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M1 1.5l5 5 5-5'/%3E%3C/svg%3E");
      background-repeat: no-repeat; background-position: right 14px center; background-size: 12px;
    }
    .mx-money, .mx-stepper {
      border: 1.5px solid transparent; border-radius: 12px; background: var(--mx-soft);
      transition: border-color 0.15s, box-shadow 0.15s;
    }
    .mx-money { display: flex; align-items: center; width: 100%; min-width: 0; max-width: 100%; height: 46px; padding-left: 12px; overflow: hidden; }
    .mx-money b { margin-right: 6px; font-size: 0.85rem; font-weight: 600; color: var(--mx-muted); }
    /* !important: CSS global aplikasi (input { width:100%; padding:... }) tidak boleh melebarkan kolom ini */
    .mx-overlay .mx-money input {
      flex: 1 1 0 !important; width: 0 !important; min-width: 0 !important; max-width: 100% !important;
      height: 100% !important; margin: 0 !important; padding: 0 12px 0 0 !important;
      border: 0 !important; border-radius: 0 !important; outline: none !important; box-shadow: none !important;
      background: none !important; color: var(--mx-text); font: inherit; font-size: 16px; font-variant-numeric: tabular-nums;
    }
    .mx-stepper { display: grid; grid-template-columns: 42px minmax(0, 1fr) 42px; align-items: center; width: 100%; min-width: 0; height: 46px; overflow: hidden; }
    .mx-step { height: 100%; padding: 0; border: 0; border-radius: 10px; background: none; color: var(--mx-text); font-size: 0.8rem; cursor: pointer; }
    .mx-step:active { background: var(--mx-line); }
    .mx-overlay .mx-i-qty {
      width: 100% !important; min-width: 0 !important; height: 100% !important; margin: 0 !important; padding: 0 !important;
      border: 0 !important; box-shadow: none !important; outline: none !important; background: none !important;
      color: var(--mx-text); font: inherit; font-size: 16px; font-weight: 700; text-align: center; font-variant-numeric: tabular-nums;
    }
    .mx-input:focus, .mx-money:focus-within, .mx-stepper:focus-within {
      border-color: var(--mx-focus);
      box-shadow: 0 0 0 4px color-mix(in srgb, var(--mx-accent) 16%, transparent);
    }
    .mx-field.is-invalid .mx-input, .mx-field.is-invalid .mx-money, .mx-field.is-invalid .mx-stepper { border-color: var(--mx-danger); }

    .mx-more summary {
      list-style: none; cursor: pointer; display: flex; align-items: center; justify-content: space-between;
      padding: 4px 2px; font-size: 0.84rem; font-weight: 600; color: var(--mx-muted);
    }
    .mx-more summary::-webkit-details-marker { display: none; }
    .mx-more summary::after {
      content: ""; width: 8px; height: 8px; margin-right: 4px;
      border-right: 2px solid currentColor; border-bottom: 2px solid currentColor;
      transform: rotate(45deg); transition: transform 0.2s;
    }
    .mx-more[open] summary::after { transform: rotate(-135deg); }
    .mx-more-body { display: grid; gap: 12px; padding-top: 10px; }

    .mx-sec-head { display: flex; align-items: baseline; justify-content: space-between; margin-bottom: 10px; }
    .mx-sec-head h4 { margin: 0; font-size: 1rem; font-weight: 700; color: var(--mx-text); }
    .mx-count { font-size: 0.8rem; color: var(--mx-muted); }
    .mx-items { display: grid; grid-template-columns: minmax(0, 1fr); gap: 10px; margin-bottom: 12px; }

    .mx-item { border: 1px solid var(--mx-line); border-radius: 16px; background: var(--mx-surface); overflow: hidden; }
    .mx-item.is-open { border-color: color-mix(in srgb, var(--mx-accent) 45%, var(--mx-line)); box-shadow: 0 6px 20px rgba(0, 0, 0, 0.06); }
    .mx-item.has-error { border-color: var(--mx-danger); }
    .mx-item-bar {
      width: 100%; display: flex; align-items: center; gap: 12px; padding: 13px 14px;
      border: 0; background: none; color: inherit; font: inherit; text-align: left; cursor: pointer;
    }
    .mx-item-main { flex: 1; min-width: 0; display: grid; gap: 2px; }
    .mx-item-title { font-size: 0.92rem; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .mx-item-title.is-empty { font-weight: 500; color: var(--mx-muted); }
    .mx-item-sub { display: flex; flex-wrap: wrap; gap: 0 10px; font-size: 0.74rem; color: var(--mx-muted); }
    .mx-warn { color: var(--mx-warn); }
    .mx-item-total { flex: none; font-size: 0.9rem; font-weight: 700; font-variant-numeric: tabular-nums; }
    .mx-chev { flex: none; font-size: 0.7rem; color: var(--mx-muted); transition: transform 0.2s; }
    .mx-item.is-open .mx-chev { transform: rotate(180deg); }
    .mx-item-body { display: grid; gap: 12px; padding: 14px; border-top: 1px solid var(--mx-line); }
    .mx-item-body[hidden] { display: none; }
    .mx-item-foot { display: flex; align-items: center; justify-content: space-between; gap: 10px; font-size: 0.8rem; color: var(--mx-muted); }
    .mx-item-foot strong { margin-left: 6px; font-size: 0.92rem; color: var(--mx-text); font-variant-numeric: tabular-nums; }
    .mx-link {
      display: inline-flex; align-items: center; gap: 6px; padding: 6px 0; border: 0; background: none;
      font: inherit; font-size: 0.8rem; font-weight: 600; cursor: pointer;
    }
    .mx-link.danger { color: var(--mx-danger); }

    .mx-add {
      width: 100%; height: 50px; display: flex; align-items: center; justify-content: center; gap: 8px;
      border: 1.5px dashed color-mix(in srgb, var(--mx-accent) 45%, var(--mx-line)); border-radius: 16px;
      background: none; color: var(--mx-focus); font: inherit; font-size: 0.9rem; font-weight: 600; cursor: pointer;
    }

    .mx-foot {
      flex: none; padding: 14px 20px calc(16px + env(safe-area-inset-bottom, 0px));
      border-top: 1px solid var(--mx-line); background: var(--mx-surface);
    }
    .mx-total { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; margin-bottom: 12px; }
    .mx-total-label { font-size: 0.84rem; color: var(--mx-muted); }
    .mx-total-amt { font-size: 1.4rem; font-weight: 800; letter-spacing: -0.02em; font-variant-numeric: tabular-nums; overflow-wrap: anywhere; text-align: right; }
    .mx-btns { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1.6fr); gap: 10px; }
    .mx-btn { height: 50px; padding: 0 12px; border: 0; border-radius: 14px; font: inherit; font-size: 0.95rem; font-weight: 700; cursor: pointer; }
    .mx-btn.ghost { background: var(--mx-soft); color: var(--mx-text); }
    .mx-btn.primary { background: var(--mx-accent); color: #fff; }
    .mx-btn:disabled { opacity: 0.6; cursor: default; }
    .mx-btn:focus-visible, .mx-x:focus-visible, .mx-item-bar:focus-visible, .mx-add:focus-visible, .mx-step:focus-visible, .mx-link:focus-visible {
      outline: 2px solid var(--mx-focus); outline-offset: 2px;
    }

    /* Detail */
    .mx-hero {
      --hc: var(--mx-danger); display: grid; gap: 4px; padding: 18px; border-radius: 20px;
      background: color-mix(in srgb, var(--hc) 10%, transparent);
    }
    .mx-hero-label { font-size: 0.78rem; font-weight: 600; color: var(--hc); }
    .mx-hero-amt { font-size: 1.75rem; font-weight: 800; letter-spacing: -0.02em; color: var(--hc); font-variant-numeric: tabular-nums; overflow-wrap: anywhere; }
    .mx-hero-name { font-size: 0.92rem; font-weight: 600; overflow-wrap: anywhere; }
    .mx-hero-date { font-size: 0.78rem; color: var(--mx-muted); }
    .mx-row { display: flex; justify-content: space-between; gap: 16px; padding: 12px 2px; border-bottom: 1px solid var(--mx-line); font-size: 0.86rem; }
    .mx-row:last-child { border-bottom: 0; }
    .mx-row > span:first-child { flex: none; color: var(--mx-muted); }
    .mx-row > span:last-child { min-width: 0; font-weight: 600; text-align: right; overflow-wrap: anywhere; }
    .mx-lines { margin: 0; padding: 0; list-style: none; }
    .mx-line { display: flex; align-items: flex-start; justify-content: space-between; gap: 14px; padding: 12px 0; border-bottom: 1px solid var(--mx-line); }
    .mx-line:last-child { border-bottom: 0; }
    .mx-line-name { font-size: 0.9rem; font-weight: 600; overflow-wrap: anywhere; }
    .mx-line-sub { display: flex; flex-wrap: wrap; gap: 0 10px; margin-top: 2px; font-size: 0.76rem; color: var(--mx-muted); }
    .mx-line strong { flex: none; font-size: 0.9rem; font-variant-numeric: tabular-nums; }

    .mx-hero.income { --hc: #16A34A; }
    .mx-hero.saving { --hc: #8b5cf6; }

    /* Form transaksi biasa */
    .mx-seg { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 4px; padding: 4px; border-radius: 14px; background: var(--mx-soft); }
    .mx-seg-btn {
      display: flex; align-items: center; justify-content: center; gap: 6px; min-width: 0; height: 42px; padding: 0 6px;
      border: 0; border-radius: 10px; background: none; color: var(--mx-muted);
      font: inherit; font-size: 0.82rem; font-weight: 600; white-space: nowrap; cursor: pointer;
      transition: background 0.15s, color 0.15s, box-shadow 0.15s;
    }
    .mx-seg-btn svg { width: 14px; height: 14px; display: block; }
    .mx-seg-btn.active { background: var(--mx-surface); color: var(--mx-text); box-shadow: 0 1px 4px rgba(0, 0, 0, 0.14); }
    .mx-seg-btn:focus-visible { outline: 2px solid var(--mx-focus); outline-offset: 2px; }
    .mx-check { display: flex; align-items: center; gap: 10px; font-size: 0.88rem; font-weight: 500; cursor: pointer; }
    .mx-overlay .mx-check input { flex: none; width: 18px !important; height: 18px !important; margin: 0 !important; padding: 0 !important; accent-color: var(--mx-accent); }

    @media (min-width: 768px) {
      .mx-overlay { align-items: center; padding: 24px; }
      .mx-sheet { max-height: min(88vh, 860px); border-radius: 24px; }
      .mx-grab { display: none; }
      .mx-head { padding-top: 20px; }
    }
    @media (prefers-reduced-motion: reduce) {
      .mx-overlay, .mx-sheet { animation: none; }
      .mx-chev, .mx-more summary::after { transition: none; }
    }
  `;
  document.head.appendChild(style);
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

    /* ---------- Ringkasan: pemasukan (tanpa %) + pengeluaran & tabungan (dengan %) ---------- */
    .tp-sum { display: grid; gap: 14px; }
    .tp-sum-income { display: flex; align-items: center; gap: 12px; min-width: 0; }
    .tp-sum-income-text { display: grid; gap: 2px; min-width: 0; }
    .tp-sum-pair { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
    .tp-pcard {
      --pc: var(--d-red);
      display: flex; flex-direction: column; gap: 4px; min-width: 0;
      padding: 12px; border-radius: 18px;
      background: color-mix(in srgb, var(--pc) 7%, transparent);
      border: 1px solid color-mix(in srgb, var(--pc) 16%, transparent);
    }
    .tp-pcard.saving { --pc: var(--d-purple); }
    .tp-pcard-top { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 4px; }
    .tp-pct-pill {
      padding: 3px 9px; border-radius: 999px; font-size: 0.74rem; font-weight: 700; line-height: 1.2;
      font-variant-numeric: tabular-nums; white-space: nowrap;
      color: var(--pc); background: color-mix(in srgb, var(--pc) 14%, transparent);
    }
    .tp-pbar { display: block; height: 6px; margin-top: 6px; border-radius: 999px; overflow: hidden; background: color-mix(in srgb, var(--pc) 16%, transparent); }
    .tp-pbar-fill { display: block; height: 100%; width: 0; border-radius: 999px; background: var(--pc); transition: width 0.3s ease; }
    .tp-sum-note { margin: 0; font-size: 0.7rem; color: var(--d-muted); text-align: center; }
    .tp-tile-ico {
      flex: none; width: 44px; height: 44px; border-radius: 14px;
      display: flex; align-items: center; justify-content: center; font-size: 1.05rem;
    }
    .tp-tile-ico svg { width: 20px; height: 20px; display: block; }
    .tp-tile-ico.income { background: #E6F6EC; color: var(--d-green); }
    .tp-tile-ico.expense { background: #FDEBEA; color: var(--d-red); }
    .tp-tile-ico.saving { background: #F0EAFE; color: var(--d-purple); }
    .tp-tile-label { font-size: 0.74rem; font-weight: 500; color: var(--d-muted); }
    .tp-tile-value {
      font-size: 1rem; font-weight: 700; color: var(--d-text);
      font-variant-numeric: tabular-nums; word-break: break-word;
    }
    .tp-tile-value.income { color: var(--d-green); }
    .tp-tile-value.expense { color: var(--d-red); }
    .tp-tile-value.saving { color: var(--d-purple); }

    /* Persentase per transaksi terhadap saldo dompet yang dipakai */
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
    .tp-list-card { padding: 0; background: none; border: 0; box-shadow: none; border-radius: 0; }
    .tp-day { margin-bottom: 18px; }
    .tp-day:last-child { margin-bottom: 0; }
    .tp-day-head {
      margin: 0 2px 2px;
      font-size: 0.82rem;
      font-weight: 700;
      color: var(--d-muted);
    }
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
    .tp-tags {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 4px 8px;
      margin-top: 6px;
    }
    .tp-wallet-pill {
      display: inline-block;
      max-width: 100%;
      padding: 2px 10px;
      border-radius: 999px;
      font-size: 0.7rem;
      font-weight: 600;
      line-height: 1.5;
      color: var(--wc);
      background: color-mix(in srgb, var(--wc) 14%, transparent);
      border: 1px solid color-mix(in srgb, var(--wc) 35%, transparent);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .tp-loc {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      min-width: 0;
      font-size: 0.72rem;
      color: var(--d-muted);
    }
    .tp-loc i { font-size: 0.68rem; flex: none; }
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
    /* ---------- Modal pilih periode ---------- */
    .tp-opt-list { gap: 6px; padding-bottom: 20px; }
    .tp-opt {
      width: 100%;
      min-height: 46px;
      padding: 0 16px;
      border: 0;
      border-radius: 14px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      background: var(--d-soft);
      color: var(--d-text);
      font-family: inherit;
      font-size: 0.92rem;
      font-weight: 500;
      text-align: left;
      cursor: pointer;
    }
    .tp-opt.active { background: var(--d-brand); color: #fff; font-weight: 600; }
    .tp-opt-group {
      margin: 8px 4px 0;
      font-size: 0.74rem;
      font-weight: 700;
      letter-spacing: 0.04em;
      color: var(--d-muted);
    }
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

    /* ---------- Modal detail transaksi (mengambang di tengah) ---------- */
    .modal-overlay.tx-detail-overlay {
      align-items: center !important;
      justify-content: center !important;
      padding: 16px !important;
    }
    .tx-detail-overlay .modal-container.tx-detail {
      width: 100%;
      max-width: 440px;
      margin: 0 !important;
      max-height: 86vh;
      border-radius: 24px !important;
    }
    .td-hero {
      --hc: #DC4C4C;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 4px;
      margin-bottom: 8px;
      padding: 18px 16px;
      border-radius: 18px;
      text-align: center;
      background: color-mix(in srgb, var(--hc) 10%, transparent);
    }
    .td-hero.income { --hc: #16A34A; }
    .td-hero.saving { --hc: #8b5cf6; }
    .td-hero-type { font-size: 0.75rem; font-weight: 600; color: var(--hc); }
    .td-hero-amount {
      font-size: 1.5rem;
      font-weight: 700;
      color: var(--hc);
      font-variant-numeric: tabular-nums;
      overflow-wrap: anywhere;
    }
    .td-hero-name {
      font-size: 0.88rem;
      color: var(--text-primary, #242333);
      overflow-wrap: anywhere;
    }
    .td-row {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 16px;
      padding: 12px 2px;
      border-bottom: 1px solid var(--border-color, #EEEEF3);
    }
    .td-row:last-child { border-bottom: 0; }
    .td-label { flex: none; font-size: 0.82rem; color: var(--text-secondary, #6F6F7B); }
    .td-value {
      min-width: 0;
      font-size: 0.88rem;
      font-weight: 600;
      text-align: right;
      color: var(--text-primary, #242333);
      overflow-wrap: anywhere;
    }
    .td-section {
      margin: 16px 2px 0;
      font-size: 0.74rem;
      font-weight: 700;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      color: var(--text-secondary, #6F6F7B);
    }
    .td-item {
      margin-top: 8px;
      padding: 2px 14px;
      border-radius: 14px;
      background: var(--bg-primary, #F4F4F7);
    }
    .td-item-name { padding-top: 10px; font-size: 0.9rem; font-weight: 700; color: var(--text-primary, #242333); }

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
