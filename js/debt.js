// Debt Component
// Mengelola piutang (hutang piutang)

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
  showToast,
  confirmDialog,
  getCurrentDateTime,
} from "./utils.js";

// State
let allDebts = [];

// ==================== INTEREST (BUNGA) HELPERS ====================

// Label periode bunga
const INTEREST_PERIOD_LABELS = {
  none: "Tidak ada bunga",
  daily: "Harian",
  weekly: "Mingguan",
  monthly: "Bulanan",
  yearly: "Tahunan",
};

// Cek tahun kabisat
function isLeapYear(year) {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

// Jumlah hari dalam bulan tertentu (month: 1-12)
function getDaysInMonth(year, month) {
  return new Date(year, month, 0).getDate();
}

// Jumlah hari dalam tahun tertentu (365 atau 366 jika kabisat)
function getDaysInYear(year) {
  return isLeapYear(year) ? 366 : 365;
}

// Hitung nominal bunga per hari berdasarkan pokok, persentase, dan periode bunga.
// Rumus:
//  - harian   : pokok * persentase / 100
//  - mingguan : pokok * persentase / 100 / 7 hari
//  - bulanan  : pokok * persentase / 100 / (30, 31, atau 29 hari, tergantung bulan berjalan)
//  - tahunan  : pokok * persentase / 100 / (365 atau 366 hari, tergantung tahun berjalan)
function calculateInterestPerDay(principal, ratePercent, period, refDate = new Date()) {
  const pokok = Number(principal) || 0;
  const rate = Number(ratePercent) || 0;

  if (!pokok || !rate || !period || period === "none") {
    return 0;
  }

  const interestAmount = (pokok * rate) / 100;

  switch (period) {
    case "daily":
      return interestAmount;
    case "weekly":
      return interestAmount / 7;
    case "monthly": {
      const days = getDaysInMonth(refDate.getFullYear(), refDate.getMonth() + 1);
      return interestAmount / days;
    }
    case "yearly": {
      const days = getDaysInYear(refDate.getFullYear());
      return interestAmount / days;
    }
    default:
      return 0;
  }
}

// Hitung estimasi bunga per bulan (untuk ditampilkan sebagai info tambahan)
function calculateInterestPerMonth(principal, ratePercent, period, refDate = new Date()) {
  const perDay = calculateInterestPerDay(principal, ratePercent, period, refDate);
  const days = getDaysInMonth(refDate.getFullYear(), refDate.getMonth() + 1);
  return perDay * days;
}

// Render halaman piutang utama
export async function renderDebtsPage() {
  const container = document.getElementById("page-content");
  if (!container) return;

  // Load semua piutang
  await loadDebts();

  // Hitung statistik
  const stats = calculateStats();

  // HTML Template
  container.innerHTML = `
        <div class="debts-container">
            <!-- Header -->
            <div class="page-header">
                <h1><i class="fas fa-hand-holding-usd"></i> Piutang</h1>
                <button class="btn-primary btn-add-debt" id="add-debt-btn">
                    <i class="fas fa-plus"></i> Tambah
                </button>
            </div>
            
            <!-- Stats Cards -->
            <div class="stats-row">
                <div class="stat-card-mini">
                    <div class="stat-icon owe">
                        <i class="fas fa-arrow-down"></i>
                    </div>
                    <div class="stat-details">
                        <span class="stat-label">Saya Berhutang</span>
                        <span class="stat-value">${formatCurrency(stats.totalOwe)}</span>
                    </div>
                </div>
                <div class="stat-card-mini">
                    <div class="stat-icon debt">
                        <i class="fas fa-arrow-up"></i>
                    </div>
                    <div class="stat-details">
                        <span class="stat-label">Orang Berhutang</span>
                        <span class="stat-value">${formatCurrency(stats.totalDebt)}</span>
                    </div>
                </div>
                <div class="stat-card-mini">
                    <div class="stat-icon balance">
                        <i class="fas fa-balance-scale"></i>
                    </div>
                    <div class="stat-details">
                        <span class="stat-label">Net Balance</span>
                        <span class="stat-value ${stats.netBalance >= 0 ? "positive" : "negative"}">
                            ${formatCurrency(Math.abs(stats.netBalance))}
                            <small>${stats.netBalance >= 0 ? "(dibayarkan)" : "(harus bayar)"}</small>
                        </span>
                    </div>
                </div>
            </div>
            
            <!-- Tabs -->
            <div class="debt-tabs">
                <button class="tab-btn active" data-tab="active">
                    <i class="fas fa-clock"></i> Aktif
                </button>
                <button class="tab-btn" data-tab="completed">
                    <i class="fas fa-check-circle"></i> Lunas
                </button>
                <button class="tab-btn" data-tab="overdue">
                    <i class="fas fa-exclamation-triangle"></i> Overdue
                </button>
            </div>
            
            <!-- Debts List -->
            <div class="debts-list" id="debts-list">
                ${renderDebtsList("active")}
            </div>
        </div>
    `;

  // Setup event listeners
  setupDebtEventListeners();

  // Add styles
  addDebtStyles();
}

// Load semua piutang dari database
async function loadDebts() {
  allDebts = await getAllItems(STORES.DEBTS);
  // Sort by due date (nearest first)
  allDebts.sort((a, b) => {
    if (a.status === "active" && b.status !== "active") return -1;
    if (a.status !== "active" && b.status === "active") return 1;
    if (a.dueDate && b.dueDate) {
      return new Date(a.dueDate) - new Date(b.dueDate);
    }
    return 0;
  });
}

// Hitung statistik
function calculateStats() {
  let totalOwe = 0; // Saya berhutang ke orang
  let totalDebt = 0; // Orang berhutang ke saya

  allDebts.forEach((debt) => {
    if (debt.status !== "cancelled" && debt.status !== "completed") {
      if (debt.type === "owe") {
        totalOwe += debt.remainingAmount || debt.amount;
      } else if (debt.type === "debt") {
        totalDebt += debt.remainingAmount || debt.amount;
      }
    }
  });

  const netBalance = totalDebt - totalOwe;

  return { totalOwe, totalDebt, netBalance };
}

// Render daftar piutang berdasarkan tab
function renderDebtsList(tab) {
  let filtered = [...allDebts];

  switch (tab) {
    case "active":
      filtered = filtered.filter(
        (d) => d.status === "active" || d.status === "partial",
      );
      break;
    case "completed":
      filtered = filtered.filter((d) => d.status === "completed");
      break;
    case "overdue":
      filtered = filtered.filter((d) => {
        if (!d.dueDate) return false;
        const isOverdue =
          new Date(d.dueDate) < new Date() && d.status !== "completed";
        return isOverdue;
      });
      break;
  }

  if (filtered.length === 0) {
    return `
            <div class="empty-state">
                <i class="fas fa-hand-holding-usd"></i>
                <p>Tidak ada data piutang</p>
                <button class="btn-primary btn-add-debt">Tambah Baru</button>
            </div>
        `;
  }

  return filtered.map((debt) => renderDebtCard(debt)).join("");
}

// Render single debt card
function renderDebtCard(debt) {
  const isOverdue =
    debt.dueDate &&
    new Date(debt.dueDate) < new Date() &&
    debt.status !== "completed";
  const progress =
    ((debt.amount - (debt.remainingAmount || debt.amount)) / debt.amount) * 100;
  const isOwe = debt.type === "owe";

  return `
        <div class="debt-card ${isOverdue ? "overdue" : ""}" data-id="${debt.id}">
            <div class="debt-card-header">
                <div class="debt-icon ${debt.type}">
                    <i class="fas ${isOwe ? "fa-arrow-up" : "fa-arrow-down"}"></i>
                </div>
                <div class="debt-info">
                    <div class="debt-party">
                        <h3>${escapeHtml(debt.partyName)}</h3>
                        <span class="debt-badge ${debt.type}">
                            ${isOwe ? "Saya berhutang" : "Berhutang ke saya"}
                        </span>
                    </div>
                    <p class="debt-description">${escapeHtml(debt.description || "Tidak ada deskripsi")}</p>
                </div>
                <div class="debt-actions">
                    <button class="icon-btn add-payment" data-id="${debt.id}" title="Tambah Pembayaran">
                        <i class="fas fa-money-bill-wave"></i>
                    </button>
                    <button class="icon-btn edit-debt" data-id="${debt.id}" title="Edit">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="icon-btn delete-debt" data-id="${debt.id}" title="Hapus">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </div>
            <div class="debt-card-body">
                <div class="debt-amounts">
                    <div class="amount-item">
                        <span class="amount-label">Total</span>
                        <span class="amount-value">${formatCurrency(debt.amount)}</span>
                    </div>
                    <div class="amount-item">
                        <span class="amount-label">Sisa</span>
                        <span class="amount-value ${(debt.remainingAmount || debt.amount) === 0 ? "completed" : ""}">
                            ${formatCurrency(debt.remainingAmount || debt.amount)}
                        </span>
                    </div>
                    ${
                      debt.dueDate
                        ? `
                        <div class="amount-item">
                            <span class="amount-label">Jatuh Tempo</span>
                            <span class="amount-value ${isOverdue ? "overdue-text" : ""}">
                                ${formatDate(debt.dueDate)}
                                ${isOverdue ? " ⚠️" : ""}
                            </span>
                        </div>
                    `
                        : ""
                    }
                </div>
                ${
                  debt.interestPeriod && debt.interestPeriod !== "none" && debt.interestRate > 0
                    ? `
                    <div class="interest-badge">
                        <i class="fas fa-percentage"></i>
                        Bunga ${debt.interestRate}% / ${INTEREST_PERIOD_LABELS[debt.interestPeriod].toLowerCase()}
                        <span class="interest-daily">≈ ${formatCurrency(calculateInterestPerDay(debt.amount, debt.interestRate, debt.interestPeriod))} / hari</span>
                    </div>
                `
                    : ""
                }
                ${
                  progress > 0 && progress < 100
                    ? `
                    <div class="progress-bar-container">
                        <div class="progress-fill" style="width: ${progress}%"></div>
                    </div>
                    <div class="progress-text">${Math.round(progress)}% lunas</div>
                `
                    : ""
                }
                ${
                  debt.status === "completed"
                    ? `
                    <div class="completed-badge">
                        <i class="fas fa-check-circle"></i> Lunas
                    </div>
                `
                    : ""
                }
            </div>
        </div>
    `;
}

// Setup event listeners
function setupDebtEventListeners() {
  // Add debt button
  const addBtn = document.getElementById("add-debt-btn");
  if (addBtn) {
    const newAddBtn = addBtn.cloneNode(true);
    addBtn.parentNode.replaceChild(newAddBtn, addBtn);
    newAddBtn.addEventListener("click", () => showDebtModal());
  }

  // Empty state add button
  const emptyStateBtn = document.querySelector(".empty-state .btn-add-debt");
  if (emptyStateBtn) {
    emptyStateBtn.addEventListener("click", () => showDebtModal());
  }

  // Tab buttons
  document.querySelectorAll(".tab-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      document
        .querySelectorAll(".tab-btn")
        .forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      const tab = btn.dataset.tab;
      const listContainer = document.getElementById("debts-list");
      if (listContainer) {
        listContainer.innerHTML = renderDebtsList(tab);
        // Reattach event listeners for new buttons
        attachCardEventListeners();
      }
    });
  });

  // Attach card event listeners
  attachCardEventListeners();
}

// Attach event listeners to card buttons
function attachCardEventListeners() {
  // Add payment buttons
  document.querySelectorAll(".add-payment").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const id = parseInt(btn.dataset.id);
      showPaymentModal(id);
    });
  });

  // Edit buttons
  document.querySelectorAll(".edit-debt").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const id = parseInt(btn.dataset.id);
      showDebtModal(id);
    });
  });

  // Delete buttons
  document.querySelectorAll(".delete-debt").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const id = parseInt(btn.dataset.id);
      deleteDebtById(id);
    });
  });
}

// Show modal untuk tambah/edit piutang
async function showDebtModal(debtId = null) {
  const isEdit = debtId !== null;
  let debt = null;

  if (isEdit) {
    debt = await getItem(STORES.DEBTS, debtId);
    if (!debt) {
      showToast("Data piutang tidak ditemukan", "error");
      return;
    }
  }

  const modalContent = `
        <form id="debt-form">
            <div class="form-group">
                <label>Tipe <span class="required">*</span></label>
                <div class="type-selector">
                    <button type="button" class="type-btn ${!isEdit || debt.type === "debt" ? "active" : ""}" data-type="debt">
                        <i class="fas fa-arrow-down"></i> Orang berhutang ke saya
                    </button>
                    <button type="button" class="type-btn ${isEdit && debt.type === "owe" ? "active" : ""}" data-type="owe">
                        <i class="fas fa-arrow-up"></i> Saya berhutang
                    </button>
                </div>
                <input type="hidden" id="debt-type" value="${isEdit ? debt.type : "debt"}">
            </div>
            
            <div class="form-group">
                <label>Nama <span class="required">*</span></label>
                <input type="text" id="debt-party" class="form-input" 
                       value="${isEdit ? escapeHtml(debt.partyName) : ""}" 
                       placeholder="Nama orang/toko/perusahaan" required>
            </div>
            
            <div class="form-group">
                <label>Nominal <span class="required">*</span></label>
                <input type="number" id="debt-amount" class="form-input" 
                       value="${isEdit ? debt.amount : ""}" 
                       placeholder="0" min="1" required>
            </div>
            
            <div class="form-group">
                <label>Sisa Hutang (Opsional)</label>
                <input type="number" id="debt-remaining" class="form-input" 
                       value="${isEdit ? debt.remainingAmount || debt.amount : ""}" 
                       placeholder="Kosongkan jika sama dengan total" min="0">
                <small class="form-help">Isi jika sudah ada pembayaran sebagian</small>
            </div>
            
            <div class="form-group">
                <label>Bunga (Opsional)</label>
                <div class="interest-row">
                    <input type="number" id="debt-interest-rate" class="form-input" 
                           value="${isEdit && debt.interestRate ? debt.interestRate : ""}" 
                           placeholder="Persentase (%)" min="0" step="0.01">
                    <select id="debt-interest-period" class="form-input">
                        <option value="none" ${!isEdit || !debt.interestPeriod || debt.interestPeriod === "none" ? "selected" : ""}>Tidak ada bunga</option>
                        <option value="daily" ${isEdit && debt.interestPeriod === "daily" ? "selected" : ""}>Per Hari</option>
                        <option value="weekly" ${isEdit && debt.interestPeriod === "weekly" ? "selected" : ""}>Per Minggu</option>
                        <option value="monthly" ${isEdit && debt.interestPeriod === "monthly" ? "selected" : ""}>Per Bulan</option>
                        <option value="yearly" ${isEdit && debt.interestPeriod === "yearly" ? "selected" : ""}>Per Tahun</option>
                    </select>
                </div>
                <small class="form-help">Bunga dihitung dari nominal pokok. Untuk mingguan/bulanan/tahunan, sistem otomatis mengonversi ke nilai harian (dibagi 7 hari / jumlah hari di bulan berjalan / jumlah hari di tahun berjalan)</small>
                <div class="interest-preview" id="debt-interest-preview" style="display: none;">
                    <i class="fas fa-calculator"></i>
                    <span id="debt-interest-preview-text"></span>
                </div>
            </div>
            
            <div class="form-group">
                <label>Deskripsi (Opsional)</label>
                <textarea id="debt-description" class="form-input" rows="2" 
                          placeholder="Catatan tentang hutang/piutang ini...">${isEdit ? escapeHtml(debt.description || "") : ""}</textarea>
            </div>
            
            <div class="form-group">
                <label>Tanggal Jatuh Tempo (Opsional)</label>
                <input type="date" id="debt-duedate" class="form-input" 
                       value="${isEdit ? debt.dueDate || "" : ""}">
            </div>
            
            <div class="modal-buttons">
                <button type="button" class="btn-secondary modal-close-btn">Batal</button>
                <button type="submit" class="btn-primary">${isEdit ? "Simpan Perubahan" : "Tambah"}</button>
            </div>
        </form>
    `;

  const modal = document.createElement("div");
  modal.className = "modal-overlay";
  modal.innerHTML = `
        <div class="modal-container modal-medium">
            <div class="modal-header">
                <h3><i class="fas ${isEdit ? "fa-edit" : "fa-plus-circle"}"></i> ${isEdit ? "Edit Piutang" : "Tambah Piutang Baru"}</h3>
                <button class="modal-close-btn modal-close-x">&times;</button>
            </div>
            <div class="modal-body">
                ${modalContent}
            </div>
        </div>
    `;

  document.body.appendChild(modal);

  // Setup type selector
  const typeBtns = modal.querySelectorAll(".type-btn");
  const typeInput = modal.querySelector("#debt-type");

  typeBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      typeBtns.forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      typeInput.value = btn.dataset.type;
    });
  });

  // Setup live preview kalkulasi bunga
  const amountInput = modal.querySelector("#debt-amount");
  const interestRateInput = modal.querySelector("#debt-interest-rate");
  const interestPeriodSelect = modal.querySelector("#debt-interest-period");
  const interestPreview = modal.querySelector("#debt-interest-preview");
  const interestPreviewText = modal.querySelector("#debt-interest-preview-text");

  const updateInterestPreview = () => {
    const principal = parseFloat(amountInput.value) || 0;
    const rate = parseFloat(interestRateInput.value) || 0;
    const period = interestPeriodSelect.value;

    if (!principal || !rate || period === "none") {
      interestPreview.style.display = "none";
      return;
    }

    const perDay = calculateInterestPerDay(principal, rate, period);
    const perMonth = calculateInterestPerMonth(principal, rate, period);

    interestPreviewText.textContent =
      `Estimasi bunga: ${formatCurrency(perDay)} / hari` +
      ` (± ${formatCurrency(perMonth)} / bulan)`;
    interestPreview.style.display = "flex";
  };

  amountInput.addEventListener("input", updateInterestPreview);
  interestRateInput.addEventListener("input", updateInterestPreview);
  interestPeriodSelect.addEventListener("change", updateInterestPreview);
  updateInterestPreview();

  // Handle form submission
  const form = modal.querySelector("#debt-form");
  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const partyName = modal.querySelector("#debt-party").value.trim();
    const amount = parseInt(modal.querySelector("#debt-amount").value);
    let remainingAmount = modal.querySelector("#debt-remaining").value;
    const type = typeInput.value;
    const description = modal.querySelector("#debt-description").value;
    const dueDate = modal.querySelector("#debt-duedate").value;
    const interestRate = parseFloat(modal.querySelector("#debt-interest-rate").value) || 0;
    const interestPeriod = modal.querySelector("#debt-interest-period").value;

    if (!partyName) {
      showToast("Nama harus diisi", "error");
      return;
    }

    if (!amount || amount <= 0) {
      showToast("Nominal harus lebih dari 0", "error");
      return;
    }

    if (interestRate < 0) {
      showToast("Persentase bunga tidak boleh negatif", "error");
      return;
    }

    // Handle remaining amount
    if (remainingAmount === "") {
      remainingAmount = amount;
    } else {
      remainingAmount = parseInt(remainingAmount);
      if (remainingAmount < 0) remainingAmount = 0;
      if (remainingAmount > amount) remainingAmount = amount;
    }

    const status =
      remainingAmount === 0
        ? "completed"
        : remainingAmount < amount
          ? "partial"
          : "active";

    if (isEdit) {
      // Update existing
      debt.partyName = partyName;
      debt.amount = amount;
      debt.remainingAmount = remainingAmount;
      debt.type = type;
      debt.description = description;
      debt.dueDate = dueDate;
      debt.status = status;
      debt.interestRate = interestRate;
      debt.interestPeriod = interestPeriod;
      debt.updatedAt = getCurrentDateTime().datetime;

      await updateItem(STORES.DEBTS, debt);
      showToast("Data berhasil diupdate", "success");
    } else {
      // Create new
      const newDebt = {
        partyName: partyName,
        amount: amount,
        remainingAmount: remainingAmount,
        type: type,
        description: description,
        dueDate: dueDate,
        status: status,
        interestRate: interestRate,
        interestPeriod: interestPeriod,
        createdAt: getCurrentDateTime().datetime,
        updatedAt: getCurrentDateTime().datetime,
        payments: [],
      };

      await addItem(STORES.DEBTS, newDebt);
      showToast("Data berhasil ditambahkan", "success");
    }

    modal.remove();
    await renderDebtsPage();
  });

  // Close modal
  const closeModal = () => modal.remove();
  modal.querySelectorAll(".modal-close-btn").forEach((btn) => {
    btn.addEventListener("click", closeModal);
  });
  modal.addEventListener("click", (e) => {
    if (e.target === modal) closeModal();
  });
}

// Show modal untuk tambah pembayaran
async function showPaymentModal(debtId) {
  const debt = await getItem(STORES.DEBTS, debtId);
  if (!debt) {
    showToast("Data tidak ditemukan", "error");
    return;
  }

  const remaining = debt.remainingAmount || debt.amount;
  if (remaining <= 0) {
    showToast("Sudah lunas!", "info");
    return;
  }

  const isOwe = debt.type === "owe";

  const modalContent = `
        <form id="payment-form">
            <div class="form-group">
                <label>${isOwe ? "Pembayaran ke" : "Pembayaran dari"}: ${escapeHtml(debt.partyName)}</label>
                <div class="info-box">
                    <div>Total: ${formatCurrency(debt.amount)}</div>
                    <div>Sisa: ${formatCurrency(remaining)}</div>
                </div>
            </div>
            
            <div class="form-group">
                <label>Jumlah Dibayar <span class="required">*</span></label>
                <input type="number" id="payment-amount" class="form-input" 
                       placeholder="0" min="1" max="${remaining}" required>
                <small class="form-help">Maksimal: ${formatCurrency(remaining)}</small>
            </div>
            
            <div class="form-group">
                <label>Catatan (Opsional)</label>
                <textarea id="payment-note" class="form-input" rows="2" 
                          placeholder="Catatan pembayaran..."></textarea>
            </div>
            
            <div class="modal-buttons">
                <button type="button" class="btn-secondary modal-close-btn">Batal</button>
                <button type="submit" class="btn-primary">Catat Pembayaran</button>
            </div>
        </form>
    `;

  const modal = document.createElement("div");
  modal.className = "modal-overlay";
  modal.innerHTML = `
        <div class="modal-container modal-small">
            <div class="modal-header">
                <h3><i class="fas fa-money-bill-wave"></i> Catat Pembayaran</h3>
                <button class="modal-close-btn modal-close-x">&times;</button>
            </div>
            <div class="modal-body">
                ${modalContent}
            </div>
        </div>
    `;

  document.body.appendChild(modal);

  const form = modal.querySelector("#payment-form");
  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const amount = parseInt(modal.querySelector("#payment-amount").value);
    const note = modal.querySelector("#payment-note").value;

    if (!amount || amount <= 0) {
      showToast("Jumlah harus lebih dari 0", "error");
      return;
    }

    if (amount > remaining) {
      showToast(`Jumlah melebihi sisa (${formatCurrency(remaining)})`, "error");
      return;
    }

    // Update remaining amount
    const newRemaining = remaining - amount;
    debt.remainingAmount = newRemaining;
    debt.status = newRemaining === 0 ? "completed" : "partial";
    debt.updatedAt = getCurrentDateTime().datetime;

    // Add payment record
    if (!debt.payments) debt.payments = [];
    debt.payments.push({
      amount: amount,
      note: note,
      date: getCurrentDateTime().datetime,
      remainingAfter: newRemaining,
    });

    await updateItem(STORES.DEBTS, debt);

    showToast(
      `Berhasil mencatat pembayaran ${formatCurrency(amount)}`,
      "success",
    );
    modal.remove();
    await renderDebtsPage();
  });

  const closeModal = () => modal.remove();
  modal.querySelectorAll(".modal-close-btn").forEach((btn) => {
    btn.addEventListener("click", closeModal);
  });
  modal.addEventListener("click", (e) => {
    if (e.target === modal) closeModal();
  });
}

// Delete debt
async function deleteDebtById(id) {
  confirmDialog(
    "Apakah Anda yakin ingin menghapus data ini?",
    async (confirmed) => {
      if (confirmed) {
        await deleteItem(STORES.DEBTS, id);
        showToast("Data berhasil dihapus", "success");
        await renderDebtsPage();
      }
    },
  );
}

// Add styles for debts page
function addDebtStyles() {
  if (document.getElementById("debt-styles")) return;

  const style = document.createElement("style");
  style.id = "debt-styles";
  style.textContent = `
        .debts-container {
            max-width: 1000px;
            margin: 0 auto;
        }
        
        .stats-row {
            display: grid;
            grid-template-columns: repeat(3, 1fr);
            gap: 16px;
            margin-bottom: 24px;
        }
        
        .stat-card-mini {
            background: var(--bg-secondary);
            border-radius: 16px;
            padding: 16px;
            display: flex;
            align-items: center;
            gap: 12px;
            box-shadow: var(--card-shadow);
        }
        
        .stat-icon {
            width: 50px;
            height: 50px;
            border-radius: 12px;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 1.3rem;
        }
        
        .stat-icon.owe {
            background: rgba(239, 68, 68, 0.1);
            color: #ef4444;
        }
        
        .stat-icon.debt {
            background: rgba(16, 185, 129, 0.1);
            color: #10b981;
        }
        
        .stat-icon.balance {
            background: rgba(59, 130, 246, 0.1);
            color: #3b82f6;
        }
        
        .stat-details {
            flex: 1;
        }
        
        .stat-label {
            display: block;
            font-size: 0.7rem;
            color: var(--text-secondary);
            margin-bottom: 4px;
        }
        
        .stat-value {
            font-size: 1.1rem;
            font-weight: 600;
        }
        
        .stat-value small {
            font-size: 0.6rem;
            font-weight: normal;
            display: block;
        }
        
        .stat-value.positive {
            color: #10b981;
        }
        
        .stat-value.negative {
            color: #ef4444;
        }
        
        .debt-tabs {
            display: flex;
            gap: 8px;
            margin-bottom: 20px;
            background: var(--bg-secondary);
            padding: 8px;
            border-radius: 12px;
        }
        
        .tab-btn {
            flex: 1;
            padding: 10px;
            border: none;
            background: none;
            border-radius: 8px;
            cursor: pointer;
            font-size: 0.85rem;
            transition: all 0.3s ease;
            color: var(--text-secondary);
        }
        
        .tab-btn.active {
            background: var(--info);
            color: white;
        }
        
        .debt-card {
            background: var(--bg-secondary);
            border-radius: 16px;
            margin-bottom: 16px;
            overflow: hidden;
            box-shadow: var(--card-shadow);
        }
        
        .debt-card.overdue {
            border-left: 4px solid #ef4444;
        }
        
        .debt-card-header {
            display: flex;
            align-items: center;
            gap: 15px;
            padding: 16px;
            background: var(--bg-primary);
            border-bottom: 1px solid var(--border-color);
            flex-wrap: wrap;
        }
        
        .debt-icon {
            width: 50px;
            height: 50px;
            border-radius: 14px;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 1.3rem;
        }
        
        .debt-icon.debt {
            background: rgba(16, 185, 129, 0.1);
            color: #10b981;
        }
        
        .debt-icon.owe {
            background: rgba(239, 68, 68, 0.1);
            color: #ef4444;
        }
        
        .debt-info {
            flex: 1;
            min-width: 150px;
        }
        
        .debt-party {
            display: flex;
            align-items: center;
            gap: 8px;
            flex-wrap: wrap;
            margin-bottom: 4px;
        }
        
        .debt-party h3 {
            font-size: 1rem;
            margin: 0;
        }
        
        .debt-badge {
            font-size: 0.65rem;
            padding: 2px 8px;
            border-radius: 20px;
        }
        
        .debt-badge.debt {
            background: rgba(16, 185, 129, 0.15);
            color: #10b981;
        }
        
        .debt-badge.owe {
            background: rgba(239, 68, 68, 0.15);
            color: #ef4444;
        }
        
        .debt-description {
            font-size: 0.75rem;
            color: var(--text-secondary);
        }
        
        .debt-actions {
            display: flex;
            gap: 5px;
        }
        
        .debt-card-body {
            padding: 16px;
        }
        
        .debt-amounts {
            display: flex;
            justify-content: space-between;
            margin-bottom: 12px;
            flex-wrap: wrap;
            gap: 12px;
        }
        
        .amount-item {
            text-align: center;
            flex: 1;
        }
        
        .amount-value.completed {
            color: #10b981;
        }
        
        .amount-value.overdue-text {
            color: #ef4444;
        }
        
        .completed-badge {
            text-align: center;
            color: #10b981;
            font-size: 0.8rem;
            margin-top: 8px;
        }
        
        .progress-text {
            font-size: 0.7rem;
            text-align: center;
            margin-top: 8px;
            color: var(--text-secondary);
        }
        
        .info-box {
            background: var(--bg-primary);
            padding: 12px;
            border-radius: 10px;
            margin: 10px 0;
            font-size: 0.85rem;
        }
        
        .interest-row {
            display: flex;
            gap: 8px;
        }
        
        .interest-row #debt-interest-rate {
            flex: 1;
        }
        
        .interest-row #debt-interest-period {
            flex: 1.4;
        }
        
        .interest-preview {
            display: flex;
            align-items: center;
            gap: 8px;
            background: rgba(59, 130, 246, 0.1);
            color: #3b82f6;
            padding: 10px 12px;
            border-radius: 10px;
            font-size: 0.8rem;
            margin-top: 8px;
        }
        
        .interest-badge {
            display: flex;
            align-items: center;
            gap: 6px;
            flex-wrap: wrap;
            background: rgba(245, 158, 11, 0.1);
            color: #f59e0b;
            padding: 8px 12px;
            border-radius: 10px;
            font-size: 0.75rem;
            margin-bottom: 12px;
        }
        
        .interest-badge .interest-daily {
            margin-left: auto;
            font-weight: 600;
            opacity: 0.9;
        }
        
        @media (max-width: 480px) {
            .interest-row {
                flex-direction: column;
            }
            
            .interest-badge .interest-daily {
                margin-left: 0;
                width: 100%;
            }
        }
        
        @media (max-width: 768px) {
            .stats-row {
                grid-template-columns: 1fr;
                gap: 10px;
            }
            
            .debt-card-header {
                flex-direction: column;
                text-align: center;
            }
            
            .debt-actions {
                justify-content: center;
            }
            
            .debt-amounts {
                flex-direction: column;
                gap: 8px;
            }
            
            .debt-tabs {
                flex-direction: column;
            }
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