// Transaction Component
// Mengelola semua operasi terkait transaksi (CRUD)

import {
  addItem,
  updateItem,
  deleteItem,
  getAllItems,
  getItem,
  STORES,
} from "./db.js";
import {
  formatCurrency,
  formatDate,
  getCurrentDateTime,
  showToast,
  confirmDialog,
  normalizeString,
  capitalize,
  validateAmount,
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

// Render halaman transaksi utama
export async function renderTransactionsPage() {
  const container = document.getElementById("page-content");
  if (!container) return;

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
                <button class="btn-primary btn-add-transaction" id="add-transaction-btn">
                    <i class="fas fa-plus"></i> Transaksi Baru
                </button>
            </div>
            
                        <!-- Filter Toggle (mobile only) -->
            <button id="filter-toggle-btn" class="filter-toggle-btn">
                <i class="fas fa-filter"></i> Filter
            </button>

            <!-- Filter Bar -->
            <div class="filter-bar" id="filter-bar">
                <div class="filter-bar-header">
                    <span>Filter Transaksi</span>
                    <button id="filter-close-btn" class="filter-close-btn">
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
                    </select>
                    <select id="filter-wallet" class="filter-select">
                        <option value="all">💳 Semua Dompet</option>
                    </select>
                </div>
                <div class="period-filter-group">
                    <select id="filter-category" class="filter-select">
                      <option value="all">📂 Semua Kategori</option>
                    </select>    
                
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
                  <div class="filter-bar-buttons">
                    <button id="reset-filters" class="btn-secondary">
                        </i> Reset Filter
                    </button>
                    <button id="apply-filters" class="btn-primary" style="width: 100%; margin-top: 10px;">
                        Terapkan
                    </button>
                </div>
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

  // Render transactions
  renderFilteredTransactions();

  // Setup event listeners
  setupTransactionEventListeners();
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
        (t.note && normalizeString(t.note).includes(searchTerm)),
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
    filtered = filtered.filter((t) => t.category === currentFilters.category);
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

  const totalCount = document.getElementById("total-count");
  const totalIncomeEl = document.getElementById("total-income-summary");
  const totalExpenseEl = document.getElementById("total-expense-summary");

  if (totalCount) totalCount.textContent = transactions.length;
  if (totalIncomeEl) totalIncomeEl.textContent = formatCurrency(totalIncome);
  if (totalExpenseEl) totalExpenseEl.textContent = formatCurrency(totalExpense);
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
    .map(
      (t) => `
        <div class="transaction-card" data-id="${t.id}">
            <div class="transaction-card-left">
                <div class="transaction-card-icon ${t.type}">
                    <i class="fas ${t.type === "income" ? "fa-arrow-down" : "fa-arrow-up"}"></i>
                </div>
                <div class="transaction-card-details">
                    <div class="transaction-card-name">${escapeHtml(t.itemName)}</div>
                    <div class="transaction-card-meta">
                        <span class="category-badge">📌 ${t.category || "Umum"}</span>
                        <span class="date-badge">📅 ${formatDate(t.date)}</span>
                        ${t.time ? `<span class="time-badge">⏰ ${t.time}</span>` : ""}
                    </div>
                    ${t.note ? `<div class="transaction-card-note">📝 ${escapeHtml(t.note)}</div>` : ""}
                </div>
            </div>
            <div class="transaction-card-right">
                <div class="transaction-card-amount-wrap">
                    <div class="transaction-card-amount ${t.type}">
                        ${t.type === "income" ? "+" : "-"} ${formatCurrency(t.amount)}
                    </div>
                    <span class="transaction-card-type-label ${t.type}">
                        ${t.type === "income" ? "Pemasukan" : "Pengeluaran"}
                    </span>
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
        </div>
    `,
    )
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
  // Filter toggle (mobile modal behavior)
  const filterToggleBtn = document.getElementById("filter-toggle-btn");
  const filterBar = document.getElementById("filter-bar");
  const filterCloseBtn = document.getElementById("filter-close-btn");

  function openFilterBar() {
    if (filterBar) filterBar.classList.add("filter-bar-open");
    document.body.classList.add("filter-modal-active");
  }

  function closeFilterBar() {
    if (filterBar) filterBar.classList.remove("filter-bar-open");
    document.body.classList.remove("filter-modal-active");
  }

  if (filterToggleBtn) {
    filterToggleBtn.addEventListener("click", openFilterBar);
  }
  if (filterCloseBtn) {
    filterCloseBtn.addEventListener("click", closeFilterBar);
  }

  const applyFiltersBtn = document.getElementById("apply-filters");
  if (applyFiltersBtn) {
    applyFiltersBtn.addEventListener("click", closeFilterBar);
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
        period: "today",
        customDay: "all",
        customMonth: "all",
        customYear: "all",
      };
      if (searchInput) searchInput.value = "";
      if (filterType) filterType.value = "all";
      if (filterWallet) filterWallet.value = "all";
      if (filterCategory) filterCategory.value = "all";
      if (filterPeriod) filterPeriod.value = "today";
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
}

// Show modal untuk tambah/edit transaksi
async function showTransactionModal(transactionId = null) {
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
                </div>
                <input type="hidden" id="transaction-type" value="${isEdit ? transaction.type : "expense"}">
            </div>
            
            <div class="form-group">
                <label>Nama Barang/Transaksi <span class="required">*</span></label>
                <input type="text" id="transaction-name" class="form-input" 
                       value="${isEdit ? escapeHtml(transaction.itemName) : ""}" 
                       placeholder="Contoh: Makan Siang, Belanja Bulanan..." required>
            </div>
            
            <div class="form-group">
                <label>Nominal <span class="required">*</span></label>
                <input type="number" id="transaction-amount" class="form-input" 
                       value="${isEdit ? transaction.amount : ""}" 
                       placeholder="0" min="1" required>
            </div>
            
            <div class="form-group">
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

  function updateCategoryOptions() {
    const currentType = typeInput.value;
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
    });
  });

  updateCategoryOptions();

  // Handle form submission
  const form = modal.querySelector("#transaction-form");
  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const name = modal.querySelector("#transaction-name").value.trim();
    const amountRaw = modal.querySelector("#transaction-amount").value;
    const amount = parseInt(amountRaw, 10);
    const type = typeInput.value;
    let category = modal.querySelector("#transaction-category").value;
    const walletId = modal.querySelector("#transaction-wallet").value;
    const note = modal.querySelector("#transaction-note").value;
    const date = modal.querySelector("#transaction-date").value;
    const time = modal.querySelector("#transaction-time").value;

    // Validasi
    if (!name) {
      showToast("Nama transaksi harus diisi", "error");
      return;
    }

    if (isNaN(amount) || amount <= 0) {
      showToast("Nominal harus lebih dari 0", "error");
      return;
    }

    if (!walletId) {
      showToast("Pilih metode pembayaran", "error");
      return;
    }

    // Set default category if not selected
    if (!category) {
      category = type === "income" ? "Gaji" : "Makanan";
    }

    // Get wallet untuk update balance
    const wallet = await getItem(STORES.WALLETS, walletId);
    if (!wallet) {
      showToast("Dompet tidak ditemukan", "error");
      return;
    }

    // Untuk edit, cek perubahan saldo
    if (isEdit) {
      const oldWallet = await getItem(STORES.WALLETS, transaction.walletId);

      // Kembalikan saldo lama
      if (transaction.type === "income") {
        oldWallet.balance -= transaction.amount;
      } else {
        oldWallet.balance += transaction.amount;
      }
      await updateItem(STORES.WALLETS, oldWallet);

      // Update transaksi
      transaction.itemName = capitalize(name);
      transaction.amount = amount;
      transaction.type = type;
      transaction.category = category;
      transaction.walletId = walletId;
      transaction.note = note;
      transaction.date = date;
      transaction.time = time;

      await updateItem(STORES.TRANSACTIONS, transaction);

      // Update saldo baru
      if (type === "income") {
        wallet.balance += amount;
      } else {
        if (wallet.balance < amount) {
          showToast(`Saldo ${wallet.name} tidak mencukupi!`, "error");
          return;
        }
        wallet.balance -= amount;
      }
      await updateItem(STORES.WALLETS, wallet);

      showToast("Transaksi berhasil diupdate", "success");
    } else {
      // Cek saldo untuk pengeluaran
      if (type === "expense" && wallet.balance < amount) {
        showToast(
          `Saldo ${wallet.name} tidak mencukupi! (Saldo: ${formatCurrency(wallet.balance)})`,
          "error",
        );
        modal.remove();
        style.remove();
        return;
      }

      // Transaksi baru
      const newTransaction = {
        itemName: capitalize(name),
        amount: amount,
        type: type,
        category: category,
        walletId: walletId,
        note: note,
        date: date,
        time: time,
        createdAt: getCurrentDateTime().timestamp,
      };

      await addItem(STORES.TRANSACTIONS, newTransaction);

      // Update wallet balance
      if (type === "income") {
        wallet.balance += amount;
      } else {
        wallet.balance -= amount;
      }
      await updateItem(STORES.WALLETS, wallet);

      showToast("Transaksi berhasil ditambahkan", "success");
    }

    modal.remove();
    style.remove();
    await loadTransactions();
    renderFilteredTransactions();

    // Refresh dashboard if needed
    if (
      window.renderDashboard &&
      window.getCurrentPage &&
      window.getCurrentPage() === "dashboard"
    ) {
      await window.renderDashboard();
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

// Edit transaction
async function editTransaction(id) {
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
            wallet.balance += transaction.amount;
          }
          await updateItem(STORES.WALLETS, wallet);
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
        if (
          window.renderDashboard &&
          window.getCurrentPage &&
          window.getCurrentPage() === "dashboard"
        ) {
          await window.renderDashboard();
        }
      }
    },
  );
}

// Helper functions
function escapeHtml(text) {
  if (!text) return "";
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}
