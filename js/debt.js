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
  formatMoneyInput,
  parseMoney,
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

// Hitung nominal bunga per hari berdasarkan pokok, nilai bunga (persentase ATAU
// nominal tetap tergantung interestType), dan periode bunga.
// interestType: "percent" (default) -> value dianggap persentase dari pokok
//               "fixed"             -> value dianggap nominal Rupiah tetap per periode
// Rumus dasar (interestAmount = nilai bunga per PERIODE penuh):
//  - harian   : interestAmount
//  - mingguan : interestAmount / 7 hari
//  - bulanan  : interestAmount / (30, 31, atau 29 hari, tergantung bulan berjalan)
//  - tahunan  : interestAmount / (365 atau 366 hari, tergantung tahun berjalan)
function calculateInterestPerDay(
  principal,
  rateOrAmount,
  period,
  refDate = new Date(),
  interestType = "percent",
) {
  const pokok = Number(principal) || 0;
  const value = Number(rateOrAmount) || 0;

  if (!pokok || !value || !period || period === "none") {
    return 0;
  }

  const interestAmount =
    interestType === "fixed" ? value : (pokok * value) / 100;

  switch (period) {
    case "daily":
      return interestAmount;
    case "weekly":
      return interestAmount / 7;
    case "monthly": {
      const days = getDaysInMonth(
        refDate.getFullYear(),
        refDate.getMonth() + 1,
      );
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
function calculateInterestPerMonth(
  principal,
  rateOrAmount,
  period,
  refDate = new Date(),
  interestType = "percent",
) {
  const perDay = calculateInterestPerDay(
    principal,
    rateOrAmount,
    period,
    refDate,
    interestType,
  );
  const days = getDaysInMonth(refDate.getFullYear(), refDate.getMonth() + 1);
  return perDay * days;
}

// ==================== INTEREST (BUNGA) AUTO-ACCRUAL ====================
// Karena aplikasi ini berjalan sepenuhnya di browser (tanpa server yang selalu
// menyala), bunga tidak bisa "berjalan sendiri" tepat jam 00:00 saat aplikasi
// tertutup. Solusinya: setiap kali aplikasi/halaman piutang dibuka, sistem
// menghitung berapa hari yang terlewat sejak terakhir kali bunga dihitung
// (lastInterestDate) sampai hari ini, lalu menambahkan bunga untuk setiap
// hari yang terlewat itu ke nominal hutang/piutang. Jadi begitu tanggal
// berganti dan aplikasi dibuka lagi, bunga otomatis "mengejar" ketinggalan.

// Ubah string yyyy-mm-dd menjadi objek Date (jam 00:00 lokal)
function parseISODateOnly(str) {
  if (!str) return null;
  const [y, m, d] = str.split("-").map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}

// Hitung & terapkan bunga berjalan untuk satu data hutang/piutang, dari
// lastInterestDate sampai todayISO. Fungsi ini MENGUBAH langsung objek debt
// yang diberikan (mutasi), dan mengembalikan info perubahan.
function accrueInterestForDebt(debt, todayISO) {
  const hasInterest =
    debt.interestPeriod &&
    debt.interestPeriod !== "none" &&
    Number(debt.interestRate) > 0;

  if (!hasInterest) {
    return { changed: false, accrued: 0 };
  }
  if (debt.status === "completed" || debt.status === "cancelled") {
    return { changed: false, accrued: 0 };
  }
  if (!debt.remainingAmount || debt.remainingAmount <= 0) {
    return { changed: false, accrued: 0 };
  }

  // Kalau belum pernah dihitung sama sekali, mulai dari HARI INI (bukan mundur
  // ke tanggal dibuat), supaya tidak tiba-tiba muncul bunga besar untuk data lama.
  const baseISO = debt.lastInterestDate || todayISO;
  const baseDate = parseISODateOnly(baseISO);
  const target = parseISODateOnly(todayISO);

  if (!baseDate || !target || baseDate >= target) {
    if (debt.lastInterestDate !== todayISO && !debt.lastInterestDate) {
      debt.lastInterestDate = todayISO;
      return { changed: true, accrued: 0 };
    }
    return { changed: false, accrued: 0 };
  }

  let totalAccrued = 0;
  let daysAccrued = 0;
  const cursor = new Date(baseDate);
  let safety = 0;

  // Maju hari demi hari supaya perhitungan bulanan/tahunan (jumlah hari
  // berbeda-beda) tetap akurat, dan bunga baru dihitung dari sisa terbaru
  // (bunga berbunga / compounding harian atas sisa hutang berjalan).
  while (cursor < target && safety < 3650) {
    cursor.setDate(cursor.getDate() + 1);
    safety++;

    const dayInterest = Math.round(
      calculateInterestPerDay(
        debt.remainingAmount,
        debt.interestRate,
        debt.interestPeriod,
        cursor,
        debt.interestType || "percent",
      ),
    );

    if (dayInterest > 0) {
      debt.remainingAmount += dayInterest;
      debt.amount += dayInterest;
      totalAccrued += dayInterest;
      daysAccrued++;
    }
  }

  debt.lastInterestDate = todayISO;

  if (totalAccrued > 0) {
    if (!debt.interestLog) debt.interestLog = [];
    debt.interestLog.push({
      date: todayISO,
      amount: totalAccrued,
      days: daysAccrued,
    });
    debt.updatedAt = getCurrentDateTime().datetime;
    return { changed: true, accrued: totalAccrued };
  }

  return { changed: true, accrued: 0 };
}

// Jalankan pengecekan bunga untuk SEMUA data piutang, simpan yang berubah,
// lalu kembalikan daftar piutang yang sudah up-to-date.
export async function runDebtInterestAccrual() {
  const debts = await getAllItems(STORES.DEBTS);
  const todayISO = getCurrentDateTime().date;

  for (const debt of debts) {
    const result = accrueInterestForDebt(debt, todayISO);
    if (result.changed) {
      await updateItem(STORES.DEBTS, debt);
    }
  }

  return debts;
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
  const netPositive = stats.netBalance >= 0;
  container.innerHTML = `
        <div class="debts-container">
            <!-- Header -->
            <div class="page-header debt-header">
                <div class="debt-header-title">
                    <span class="debt-header-icon"><i class="fas fa-hand-holding-usd"></i></span>
                    <div>
                        <span class="debt-eyebrow">Money Manager</span>
                        <h1>Hutang &amp; Piutang</h1>
                    </div>
                </div>
                <button class="btn-primary btn-add-debt" id="add-debt-btn" aria-label="Tambah" title="Tambah">
                    <i class="fas fa-plus"></i><span class="btn-label">Tambah</span>
                </button>
            </div>

            <!-- Hero: Net Balance + ringkasan -->
            <div class="debt-hero">
                <div class="hero-main">
                    <div class="hero-top">
                        <span class="hero-label"><i class="fas fa-balance-scale"></i> Net Balance</span>
                        <span class="hero-caption">${netPositive ? "Piutang dikurangi hutang" : "Harus bayar"}</span>
                    </div>
                    <span class="hero-amount ${netPositive ? "" : "negative"}">${formatCurrency(Math.abs(stats.netBalance))}</span>
                </div>
                <div class="hero-tiles">
                    <div class="hero-tile">
                        <span class="hero-tile-label owe"><i class="fas fa-caret-down"></i> Hutang</span>
                        <span class="hero-tile-value">${formatCurrency(stats.totalOwe)}</span>
                    </div>
                    <div class="hero-tile">
                        <span class="hero-tile-label debt"><i class="fas fa-caret-up"></i> Piutang</span>
                        <span class="hero-tile-value">${formatCurrency(stats.totalDebt)}</span>
                    </div>
                </div>
            </div>

            <!-- Tabs -->
            <div class="debt-tabs" role="tablist">
                <button class="tab-btn active" data-tab="active" role="tab" aria-selected="true">Aktif</button>
                <button class="tab-btn" data-tab="completed" role="tab" aria-selected="false">Lunas</button>
                <button class="tab-btn" data-tab="overdue" role="tab" aria-selected="false">Overdue</button>
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
  // Jalankan pengecekan & penambahan bunga otomatis dulu sebelum ditampilkan
  allDebts = await runDebtInterestAccrual();
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
  const remaining = debt.remainingAmount || debt.amount;
  const hasInterest =
    debt.interestPeriod &&
    debt.interestPeriod !== "none" &&
    debt.interestRate > 0;

  return `
        <div class="debt-card ${isOverdue ? "overdue" : ""}" data-id="${debt.id}">
            <!-- Area identitas -->
            <div class="dc-head">
                <div class="dc-icon ${debt.type}">
                    <i class="fas ${isOwe ? "fa-caret-down" : "fa-caret-up"}"></i>
                </div>
                <div class="dc-info">
                    <div class="dc-name">${escapeHtml(debt.partyName)}</div>
                    <div class="dc-meta">
                        <span class="dc-badge ${debt.type}">${isOwe ? "Saya berhutang" : "Berhutang ke saya"}</span>
                        <span class="dc-desc">${escapeHtml(debt.description || "Tidak ada deskripsi")}</span>
                    </div>
                </div>
            </div>

            <!-- Area finansial -->
            <div class="debt-card-fin">
                <div class="fin-sisa-block ${debt.type}">
                    <span class="fin-label">Sisa</span>
                    <span class="fin-sisa-value ${remaining === 0 ? "completed" : debt.type}">${formatCurrency(remaining)}</span>
                </div>
                <div class="fin-row">
                    <span class="fin-label">Total</span>
                    <span class="fin-value">${formatCurrency(debt.amount)}</span>
                </div>
                ${
                  debt.dueDate
                    ? `
                    <div class="fin-row">
                        <span class="fin-label"><i class="far fa-calendar"></i> Jatuh tempo</span>
                        <span class="fin-value ${isOverdue ? "overdue-text" : ""}">
                            ${isOverdue ? '<i class="fas fa-exclamation-triangle"></i> ' : ""}${formatDate(debt.dueDate)}
                        </span>
                    </div>
                `
                    : ""
                }
                ${
                  hasInterest
                    ? `
                    <div class="interest-badge">
                        <i class="fas ${debt.interestType === "fixed" ? "fa-money-bill-wave" : "fa-percentage"}"></i>
                        Bunga ${debt.interestType === "fixed" ? formatCurrency(debt.interestRate) : debt.interestRate + "%"} / ${INTEREST_PERIOD_LABELS[debt.interestPeriod].toLowerCase()}
                        <span class="interest-daily">+${formatCurrency(Math.round(calculateInterestPerDay(debt.remainingAmount || debt.amount, debt.interestRate, debt.interestPeriod, new Date(), debt.interestType || "percent")))} / hari</span>
                    </div>
                    ${
                      debt.lastInterestDate
                        ? `<div class="fin-note">
                            <i class="fas fa-sync-alt"></i> Bunga terhitung otomatis s/d ${formatDate(debt.lastInterestDate, "dd/mm/yyyy")}
                           </div>`
                        : ""
                    }
                `
                    : ""
                }
                ${
                  debt.isInstallment === true &&
                  Array.isArray(debt.installments) &&
                  debt.installments.length > 0
                    ? `<details class="debt-installments">
                        <summary><i class="fas fa-calendar-alt"></i> Diangsur: ${debt.installments.length} angsuran, total ${formatCurrency(debt.installments.reduce((s, it) => s + it.amount, 0))}</summary>
                        ${debt.installments
                          .map(
                            (it, i) =>
                              `<div class="inst-item">Angsuran ${i + 1}: ${formatCurrency(it.amount)} • jatuh tempo ${formatDate(it.dueDate, "dd/mm/yyyy")}</div>`,
                          )
                          .join("")}
                       </details>`
                    : ""
                }
                ${
                  progress > 0 && progress < 100
                    ? `
                    <div class="debt-progress">
                        <div class="fin-row">
                            <span class="fin-label">Progres pembayaran</span>
                            <span class="fin-value progress-value">${Math.round(progress)}% lunas</span>
                        </div>
                        <div class="progress-bar-container">
                            <div class="progress-fill" style="width: ${progress}%"></div>
                        </div>
                    </div>
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

            <!-- Aksi -->
            <div class="debt-actions">
                <button class="icon-btn add-payment" data-id="${debt.id}" title="Tambah Pembayaran" aria-label="Tambah Pembayaran">
                    <i class="fas fa-money-bill-wave"></i>
                </button>
                <button class="icon-btn add-debt-amount" data-id="${debt.id}" title="Tambah Nominal Hutang" aria-label="Tambah Nominal Hutang">
                    <i class="fas fa-plus-circle"></i>
                </button>
                <button class="icon-btn view-debt-history" data-id="${debt.id}" title="Rincian" aria-label="Rincian">
                    <i class="fas fa-list-alt"></i>
                </button>
                <button class="icon-btn print-debt-report" data-id="${debt.id}" title="Cetak Laporan" aria-label="Cetak Laporan">
                    <i class="fas fa-print"></i>
                </button>
                <button class="icon-btn edit-debt" data-id="${debt.id}" title="Edit" aria-label="Edit">
                    <i class="fas fa-edit"></i>
                </button>
                <button class="icon-btn delete-debt" data-id="${debt.id}" title="Hapus" aria-label="Hapus">
                    <i class="fas fa-trash"></i>
                </button>
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
      document
        .querySelectorAll(".tab-btn")
        .forEach((b) => b.setAttribute("aria-selected", b === btn));
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

  // Add debt amount buttons (tambah nominal hutang yang sudah ada)
  document.querySelectorAll(".add-debt-amount").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const id = parseInt(btn.dataset.id);
      showAddAmountModal(id);
    });
  });

  // View history / rincian buttons
  document.querySelectorAll(".view-debt-history").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const id = parseInt(btn.dataset.id);
      showDebtHistoryModal(id);
    });
  });

  // Cetak laporan pembayaran (PDF, read-only)
  document.querySelectorAll(".print-debt-report").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      printDebtReport(parseInt(btn.dataset.id));
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

  const hasAdvanced =
    isEdit &&
    ((debt.interestPeriod && debt.interestPeriod !== "none") ||
      (debt.remainingAmount && debt.remainingAmount !== debt.amount));

  const modalContent = `
        <form id="debt-form" class="dm-form">
            <div class="form-group">
                <label>Tipe <span class="required">*</span></label>
                <div class="type-selector">
                    <button type="button" class="type-btn ${!isEdit || debt.type === "debt" ? "active" : ""}" data-type="debt">
                        <span class="type-ico in"><i class="fas fa-caret-up"></i></span>
                        <span class="type-text"><b>Orang berhutang ke saya</b><small>Uang masuk</small></span>
                    </button>
                    <button type="button" class="type-btn ${isEdit && debt.type === "owe" ? "active" : ""}" data-type="owe">
                        <span class="type-ico out"><i class="fas fa-caret-down"></i></span>
                        <span class="type-text"><b>Saya berhutang</b><small>Uang keluar</small></span>
                    </button>
                </div>
                <input type="hidden" id="debt-type" value="${isEdit ? debt.type : "debt"}">
            </div>

            <div class="form-group">
                <label id="debt-party-label">Nama <span class="required">*</span></label>
                <input type="text" id="debt-party" class="form-input"
                       value="${isEdit ? escapeHtml(debt.partyName) : ""}"
                       placeholder="Nama orang/toko/perusahaan" required>
            </div>

            <div class="form-group">
                <label>Nominal <span class="required">*</span></label>
                <div class="money-field">
                    <span class="money-prefix">Rp</span>
                    <input type="text" inputmode="numeric" autocomplete="off" data-money id="debt-amount" class="form-input"
                           value="${isEdit ? formatMoneyInput(debt.amount) : ""}"
                           placeholder="0" min="1" required>
                </div>
            </div>

            <div class="dm-row">
                <div class="form-group">
                    <label>Jatuh Tempo (Opsional)</label>
                    <input type="date" id="debt-duedate" class="form-input"
                           value="${isEdit ? debt.dueDate || "" : ""}">
                </div>
                <div class="form-group">
                    <label>Cara Pembayaran</label>
                    <select id="debt-installment-mode" class="form-input">
                        <option value="once" ${!isEdit || debt.isInstallment !== true ? "selected" : ""}>Sekaligus / bebas</option>
                        <option value="installment" ${isEdit && debt.isInstallment === true ? "selected" : ""}>Diangsur (cicilan)</option>
                    </select>
                </div>
            </div>

            <div id="debt-installment-fields" class="dm-inst" style="display:none;">
                <div class="form-group">
                    <label>Tanggal Awal Peminjaman (Opsional)</label>
                    <input type="date" id="debt-inst-start" class="form-input"
                           value="${isEdit && debt.installmentStartDate ? debt.installmentStartDate : ""}">
                </div>
                <div class="multi-section-title">Daftar Angsuran</div>
                <div id="debt-inst-list"></div>
                <button type="button" class="btn-secondary multi-add-btn" id="debt-inst-add">
                    <i class="fas fa-plus"></i> Tambah Angsuran
                </button>
                <div class="multi-total-row">
                    <span>Total Angsuran</span>
                    <span id="debt-inst-total">${formatCurrency(0)}</span>
                </div>
                <small class="form-help">Nominal tiap angsuran tidak boleh melebihi nominal pinjaman</small>
            </div>

            <div class="form-group">
                <label>Deskripsi (Opsional)</label>
                <textarea id="debt-description" class="form-input" rows="2"
                          placeholder="Catatan tentang hutang/piutang ini...">${isEdit ? escapeHtml(debt.description || "") : ""}</textarea>
            </div>

            <details class="dm-more" ${hasAdvanced ? "open" : ""}>
                <summary>Pengaturan lanjutan <span>Sisa hutang &amp; bunga</span></summary>
                <div class="dm-more-body">
                    <div class="form-group">
                        <label>Sisa Hutang (Opsional)</label>
                        <div class="money-field">
                            <span class="money-prefix">Rp</span>
                            <input type="text" inputmode="numeric" autocomplete="off" data-money id="debt-remaining" class="form-input"
                                   value="${isEdit ? formatMoneyInput(debt.remainingAmount || debt.amount) : ""}"
                                   placeholder="Sama dengan total" min="0">
                        </div>
                        <small class="form-help">Isi jika sudah ada pembayaran sebagian</small>
                    </div>

                    <div class="form-group">
                        <label>Bunga (Opsional)</label>
                        <div class="interest-type-selector">
                            <button type="button" class="interest-type-btn ${!isEdit || (debt.interestType || "percent") === "percent" ? "active" : ""}" data-interest-type="percent">
                                <i class="fas fa-percentage"></i> Persentase (%)
                            </button>
                            <button type="button" class="interest-type-btn ${isEdit && debt.interestType === "fixed" ? "active" : ""}" data-interest-type="fixed">
                                <i class="fas fa-money-bill-wave"></i> Nominal Tetap (Rp)
                            </button>
                        </div>
                        <input type="hidden" id="debt-interest-type" value="${isEdit && debt.interestType === "fixed" ? "fixed" : "percent"}">
                        <div class="interest-row" style="margin-top:8px;">
                            <input type="number" id="debt-interest-rate" class="form-input"
                                   value="${isEdit && debt.interestRate ? debt.interestRate : ""}"
                                   placeholder="${isEdit && debt.interestType === "fixed" ? "Nominal (Rp)" : "Persentase (%)"}" min="0" step="0.01">
                            <select id="debt-interest-period" class="form-input">
                                <option value="none" ${!isEdit || !debt.interestPeriod || debt.interestPeriod === "none" ? "selected" : ""}>Tidak ada bunga</option>
                                <option value="daily" ${isEdit && debt.interestPeriod === "daily" ? "selected" : ""}>Per Hari</option>
                                <option value="weekly" ${isEdit && debt.interestPeriod === "weekly" ? "selected" : ""}>Per Minggu</option>
                                <option value="monthly" ${isEdit && debt.interestPeriod === "monthly" ? "selected" : ""}>Per Bulan</option>
                                <option value="yearly" ${isEdit && debt.interestPeriod === "yearly" ? "selected" : ""}>Per Tahun</option>
                            </select>
                        </div>
                        <small class="form-help" id="debt-interest-help">Bunga bertambah otomatis ke sisa hutang setiap tanggal berganti, dihitung ulang tiap aplikasi dibuka. Mingguan, bulanan, dan tahunan dikonversi ke nilai harian.</small>
                        <div class="interest-preview" id="debt-interest-preview" style="display: none;">
                            <i class="fas fa-calculator"></i>
                            <span id="debt-interest-preview-text"></span>
                        </div>
                    </div>
                </div>
            </details>

            <div class="modal-buttons dm-footer">
                <button type="button" class="btn-secondary modal-close-btn">Batal</button>
                <button type="submit" class="btn-primary">${isEdit ? "Simpan Perubahan" : "Tambah"}</button>
            </div>
        </form>
    `;

  const modal = document.createElement("div");
  modal.className = "modal-overlay";
  modal.innerHTML = `
        <div class="modal-container modal-medium debt-modal">
            <div class="modal-header dm-header">
                <span class="dm-header-icon"><i class="fas ${isEdit ? "fa-pen" : "fa-plus"}"></i></span>
                <div class="dm-header-text">
                    <span class="dm-eyebrow">Money Manager</span>
                    <h3>${isEdit ? "Edit Piutang" : "Tambah Piutang Baru"}</h3>
                </div>
                <button type="button" class="modal-close-btn modal-close-x" aria-label="Tutup">&times;</button>
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
  const interestPreviewText = modal.querySelector(
    "#debt-interest-preview-text",
  );
  const interestTypeInput = modal.querySelector("#debt-interest-type");
  const interestTypeBtns = modal.querySelectorAll(".interest-type-btn");

  const updateInterestPreview = () => {
    const principal = parseMoney(amountInput.value) || 0;
    const rate = parseFloat(interestRateInput.value) || 0;
    const period = interestPeriodSelect.value;
    const interestType = interestTypeInput.value;

    if (!principal || !rate || period === "none") {
      interestPreview.style.display = "none";
      return;
    }

    const perDay = calculateInterestPerDay(
      principal,
      rate,
      period,
      new Date(),
      interestType,
    );
    const perMonth = calculateInterestPerMonth(
      principal,
      rate,
      period,
      new Date(),
      interestType,
    );
    const rateLabel =
      interestType === "fixed" ? formatCurrency(rate) : `${rate}%`;

    interestPreviewText.textContent =
      `Bunga ${rateLabel} / ${INTEREST_PERIOD_LABELS[period].toLowerCase()} → estimasi ${formatCurrency(perDay)} / hari` +
      ` (± ${formatCurrency(perMonth)} / bulan)`;
    interestPreview.style.display = "flex";
  };

  // Toggle Persentase <-> Nominal Tetap
  interestTypeBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      interestTypeBtns.forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      interestTypeInput.value = btn.dataset.interestType;
      interestRateInput.placeholder =
        btn.dataset.interestType === "fixed"
          ? "Nominal (Rp)"
          : "Persentase (%)";
      updateInterestPreview();
    });
  });

  amountInput.addEventListener("input", updateInterestPreview);
  interestRateInput.addEventListener("input", updateInterestPreview);
  interestPeriodSelect.addEventListener("change", updateInterestPreview);
  updateInterestPreview();

  // ===== Hutang/piutang diangsur: daftar angsuran diinput manual per angsuran =====
  const installmentModeSelect = modal.querySelector("#debt-installment-mode");
  const installmentFields = modal.querySelector("#debt-installment-fields");
  const instList = modal.querySelector("#debt-inst-list");
  const instTotalEl = modal.querySelector("#debt-inst-total");
  const partyLabel = modal.querySelector("#debt-party-label");
  const partyInput = modal.querySelector("#debt-party");

  // Bentuk: [{ amount: "100.000", dueDate: "2027-01-01" }]
  let installments =
    isEdit && Array.isArray(debt.installments) && debt.installments.length > 0
      ? debt.installments.map((it) => ({
          amount: String(it.amount ?? ""),
          dueDate: it.dueDate || "",
        }))
      : [{ amount: "", dueDate: "" }];

  const updateInstallmentTotal = () => {
    const total = installments.reduce(
      (s, it) => s + (parseMoney(it.amount) || 0),
      0,
    );
    instTotalEl.textContent = formatCurrency(total);
  };

  const renderInstallmentRows = () => {
    instList.innerHTML = installments
      .map(
        (it, i) => `
        <div class="multi-item" data-index="${i}">
            <div class="multi-item-header">
                <span class="multi-item-title">Angsuran ${i + 1}</span>
                ${
                  installments.length > 1
                    ? `<button type="button" class="icon-btn debt-inst-remove" title="Hapus angsuran" aria-label="Hapus Angsuran ${i + 1}"><i class="fas fa-trash"></i></button>`
                    : ""
                }
            </div>
            <div class="multi-form-row">
                <div class="form-group">
                    <label>Nominal <span class="required">*</span></label>
                    <input type="text" inputmode="numeric" autocomplete="off" data-money class="form-input debt-inst-amount" value="${formatMoneyInput(it.amount)}" placeholder="0">
                </div>
                <div class="form-group">
                    <label>Tanggal Jatuh Tempo</label>
                    <input type="date" class="form-input debt-inst-due" value="${it.dueDate}">
                </div>
            </div>
        </div>`,
      )
      .join("");
    updateInstallmentTotal();
  };

  const onInstallmentInput = (e) => {
    const block = e.target.closest(".multi-item");
    if (!block) return;
    const it = installments[Number(block.dataset.index)];
    if (!it) return;
    if (e.target.classList.contains("debt-inst-amount")) {
      it.amount = e.target.value;
      updateInstallmentTotal();
    } else if (e.target.classList.contains("debt-inst-due")) {
      it.dueDate = e.target.value;
    }
  };
  instList.addEventListener("input", onInstallmentInput);
  instList.addEventListener("change", onInstallmentInput);

  instList.addEventListener("click", (e) => {
    const removeBtn = e.target.closest(".debt-inst-remove");
    if (!removeBtn || installments.length <= 1) return;
    installments.splice(
      Number(removeBtn.closest(".multi-item").dataset.index),
      1,
    );
    renderInstallmentRows();
  });

  modal.querySelector("#debt-inst-add").addEventListener("click", () => {
    installments.push({ amount: "", dueDate: "" });
    renderInstallmentRows();
    const blocks = instList.querySelectorAll(".multi-item");
    const last = blocks[blocks.length - 1];
    if (last) {
      last.scrollIntoView({ block: "nearest" });
      last.querySelector(".debt-inst-amount").focus();
    }
  });

  // Tampilkan daftar angsuran hanya untuk mode "Diangsur"; label nama
  // mengikuti tipe: piutang -> peminjam, hutang -> pihak pemberi pinjaman
  const updateInstallmentUI = () => {
    const on = installmentModeSelect.value === "installment";
    installmentFields.style.display = on ? "" : "none";
    const isOweType = typeInput.value === "owe";
    partyLabel.innerHTML = `${
      !on ? "Nama" : isOweType ? "Nama Pemberi Pinjaman" : "Nama Peminjam"
    } <span class="required">*</span>`;
    partyInput.placeholder = !on
      ? "Nama orang/toko/perusahaan"
      : isOweType
        ? "Nama pihak yang memberi pinjaman"
        : "Nama peminjam";
  };
  installmentModeSelect.addEventListener("change", updateInstallmentUI);
  typeBtns.forEach((btn) => btn.addEventListener("click", updateInstallmentUI));
  renderInstallmentRows();
  updateInstallmentUI();

  // Handle form submission
  const form = modal.querySelector("#debt-form");
  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const partyName = modal.querySelector("#debt-party").value.trim();
    const amount = parseMoney(modal.querySelector("#debt-amount").value);
    let remainingAmount = modal.querySelector("#debt-remaining").value;
    const type = typeInput.value;
    const description = modal.querySelector("#debt-description").value;
    const dueDate = modal.querySelector("#debt-duedate").value;
    const interestRate =
      parseFloat(modal.querySelector("#debt-interest-rate").value) || 0;
    const interestPeriod = modal.querySelector("#debt-interest-period").value;
    const interestType =
      interestTypeInput.value === "fixed" ? "fixed" : "percent";

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

    // Hutang/piutang yang diangsur: tiap angsuran wajib valid, dan tidak boleh
    // melebihi nominal pinjaman (total semua angsuran tidak dibatasi)
    const isInstallment = installmentModeSelect.value === "installment";
    const installmentStartDate = modal.querySelector("#debt-inst-start").value;
    const installmentList = [];
    if (isInstallment) {
      for (let i = 0; i < installments.length; i++) {
        const instAmount = parseMoney(installments[i].amount);
        const instDue = installments[i].dueDate;
        if (!instAmount || instAmount <= 0) {
          showToast(`Nominal angsuran ${i + 1} harus lebih dari 0`, "error");
          return;
        }
        if (instAmount > amount) {
          showToast(
            `Nominal angsuran ${i + 1} tidak boleh melebihi nominal pinjaman`,
            "error",
          );
          return;
        }
        if (!instDue) {
          showToast(
            `Tanggal jatuh tempo angsuran ${i + 1} harus diisi`,
            "error",
          );
          return;
        }
        installmentList.push({ amount: instAmount, dueDate: instDue });
      }
    }

    // Handle remaining amount
    if (remainingAmount === "") {
      remainingAmount = amount;
    } else {
      remainingAmount = parseMoney(remainingAmount);
      if (remainingAmount < 0) remainingAmount = 0;
      if (remainingAmount > amount) remainingAmount = amount;
    }

    const status =
      remainingAmount === 0
        ? "completed"
        : remainingAmount < amount
          ? "partial"
          : "active";

    const willHaveInterest = interestPeriod !== "none" && interestRate > 0;

    if (isEdit) {
      // Cek apakah bunga baru diaktifkan sekarang (sebelumnya tidak ada bunga)
      const wasInterestActive =
        debt.interestPeriod &&
        debt.interestPeriod !== "none" &&
        Number(debt.interestRate) > 0;

      // Update existing
      debt.partyName = partyName;
      debt.amount = amount;
      debt.remainingAmount = remainingAmount;
      // Kalau user mengedit "Sisa Hutang" secara manual, anggap itu koreksi
      // pokok terbaru juga (supaya "sisa hutang tanpa bunga" tetap konsisten)
      debt.principalRemaining = remainingAmount;
      debt.type = type;
      debt.description = description;
      debt.dueDate = dueDate;
      debt.status = status;
      debt.interestRate = interestRate;
      debt.interestPeriod = interestPeriod;
      debt.interestType = interestType;
      debt.isInstallment = isInstallment;
      if (isInstallment) {
        debt.installments = installmentList;
        debt.installmentStartDate = installmentStartDate || "";
      }
      debt.updatedAt = getCurrentDateTime().datetime;

      if (willHaveInterest && !wasInterestActive) {
        // Baru pertama kali mengaktifkan bunga -> mulai hitung MULAI HARI INI,
        // bukan mundur ke tanggal data ini dibuat dulu.
        debt.lastInterestDate = getCurrentDateTime().date;
      } else if (!willHaveInterest) {
        // Bunga dimatikan, hapus penanda supaya tidak dihitung lagi
        debt.lastInterestDate = null;
      }

      await updateItem(STORES.DEBTS, debt);
      showToast("Data berhasil diupdate", "success");
    } else {
      // Create new
      const newDebt = {
        partyName: partyName,
        amount: amount,
        remainingAmount: remainingAmount,
        principalRemaining: remainingAmount,
        type: type,
        description: description,
        dueDate: dueDate,
        status: status,
        interestRate: interestRate,
        interestPeriod: interestPeriod,
        interestType: interestType,
        isInstallment: isInstallment,
        ...(isInstallment
          ? {
              installments: installmentList,
              installmentStartDate: installmentStartDate || "",
            }
          : {}),
        lastInterestDate: willHaveInterest ? getCurrentDateTime().date : null,
        createdAt: getCurrentDateTime().datetime,
        updatedAt: getCurrentDateTime().datetime,
        payments: [],
        additions: [],
        interestLog: [],
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

  // Pastikan bunga sudah dihitung s/d hari ini sebelum mencatat pembayaran
  const todayISO = getCurrentDateTime().date;
  const accrualResult = accrueInterestForDebt(debt, todayISO);
  if (accrualResult.changed) {
    await updateItem(STORES.DEBTS, debt);
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
                <input type="text" inputmode="numeric" autocomplete="off" data-money id="payment-amount" class="form-input" 
                       placeholder="0" min="1" max="${remaining}" required>
                <small class="form-help">Maksimal: ${formatCurrency(remaining)}</small>
            </div>
            
            <div class="form-group">
                <label>Tanggal Pembayaran <span class="required">*</span></label>
                <input type="date" id="payment-date" class="form-input" 
                       value="${todayISO}" max="${todayISO}" required>
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

    const amount = parseMoney(modal.querySelector("#payment-amount").value);
    const note = modal.querySelector("#payment-note").value;
    const paymentDateValue = modal.querySelector("#payment-date").value;

    if (!amount || amount <= 0) {
      showToast("Jumlah harus lebih dari 0", "error");
      return;
    }

    if (amount > remaining) {
      showToast(`Jumlah melebihi sisa (${formatCurrency(remaining)})`, "error");
      return;
    }

    if (!paymentDateValue) {
      showToast("Tanggal pembayaran harus diisi", "error");
      return;
    }

    // Gabungkan tanggal yang dipilih user dengan jam saat ini, format
    // konsisten dengan data lain di aplikasi: dd/mm/yyyy HH:MM
    const [py, pm, pd] = paymentDateValue.split("-");
    const timeNow = getCurrentDateTime().time;
    const paymentDateStr = `${pd}/${pm}/${py} ${timeNow}`;

    // Update remaining amount
    const newRemaining = remaining - amount;
    debt.remainingAmount = newRemaining;
    debt.status = newRemaining === 0 ? "completed" : "partial";
    debt.updatedAt = getCurrentDateTime().datetime;

    // Pembayaran mengurangi sisa pokok (tanpa bunga) juga
    const prevPrincipalRemaining = debt.principalRemaining ?? remaining;
    debt.principalRemaining = Math.max(0, prevPrincipalRemaining - amount);

    // Add payment record
    if (!debt.payments) debt.payments = [];
    debt.payments.push({
      amount: amount,
      note: note,
      date: paymentDateStr,
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

// Show modal untuk tambah nominal hutang yang sudah ada
async function showAddAmountModal(debtId) {
  const debt = await getItem(STORES.DEBTS, debtId);
  if (!debt) {
    showToast("Data tidak ditemukan", "error");
    return;
  }

  // Pastikan bunga sudah dihitung s/d hari ini dulu sebelum menambah nominal
  const todayISO = getCurrentDateTime().date;
  const accrualResult = accrueInterestForDebt(debt, todayISO);
  if (accrualResult.changed) {
    await updateItem(STORES.DEBTS, debt);
  }

  const isOwe = debt.type === "owe";
  const currentRemaining = debt.remainingAmount || debt.amount;

  const modalContent = `
        <form id="add-amount-form">
            <div class="form-group">
                <label>${isOwe ? "Tambah hutang ke" : "Tambah piutang dari"}: ${escapeHtml(debt.partyName)}</label>
                <div class="info-box">
                    <div>Sisa saat ini: ${formatCurrency(currentRemaining)}</div>
                </div>
            </div>
            
            <div class="form-group">
                <label>Nominal Tambahan <span class="required">*</span></label>
                <input type="text" inputmode="numeric" autocomplete="off" data-money id="add-amount-value" class="form-input" 
                       placeholder="0" min="1" required>
            </div>
            
            <div class="form-group">
                <label>Tanggal <span class="required">*</span></label>
                <input type="date" id="add-amount-date" class="form-input" 
                       value="${todayISO}" max="${todayISO}" required>
            </div>
            
            <div class="form-group">
                <label>Catatan (Opsional)</label>
                <textarea id="add-amount-note" class="form-input" rows="2" 
                          placeholder="Contoh: Pinjam tambahan untuk beli bahan..."></textarea>
            </div>
            
            <div class="modal-buttons">
                <button type="button" class="btn-secondary modal-close-btn">Batal</button>
                <button type="submit" class="btn-primary">Tambahkan</button>
            </div>
        </form>
    `;

  const modal = document.createElement("div");
  modal.className = "modal-overlay";
  modal.innerHTML = `
        <div class="modal-container modal-small">
            <div class="modal-header">
                <h3><i class="fas fa-plus-circle"></i> Tambah Nominal Hutang</h3>
                <button class="modal-close-btn modal-close-x">&times;</button>
            </div>
            <div class="modal-body">
                ${modalContent}
            </div>
        </div>
    `;

  document.body.appendChild(modal);

  const form = modal.querySelector("#add-amount-form");
  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const addAmount = parseMoney(
      modal.querySelector("#add-amount-value").value,
    );
    const note = modal.querySelector("#add-amount-note").value;
    const dateValue = modal.querySelector("#add-amount-date").value;

    if (!addAmount || addAmount <= 0) {
      showToast("Nominal harus lebih dari 0", "error");
      return;
    }
    if (!dateValue) {
      showToast("Tanggal harus diisi", "error");
      return;
    }

    // Gabungkan tanggal yang dipilih user dengan jam saat ini
    const [ay, am, ad] = dateValue.split("-");
    const timeNow = getCurrentDateTime().time;
    const dateStr = `${ad}/${am}/${ay} ${timeNow}`;

    // Ambil nilai SEBELUM dimutasi supaya perhitungan akurat
    const remainingBefore = debt.remainingAmount ?? debt.amount;
    const prevPrincipalRemaining = debt.principalRemaining ?? remainingBefore;

    debt.amount = (debt.amount || 0) + addAmount;
    debt.remainingAmount = remainingBefore + addAmount;
    debt.principalRemaining = prevPrincipalRemaining + addAmount;
    debt.status =
      debt.remainingAmount <= 0
        ? "completed"
        : debt.remainingAmount < debt.amount
          ? "partial"
          : "active";
    debt.updatedAt = getCurrentDateTime().datetime;

    // Simpan riwayat penambahan
    if (!debt.additions) debt.additions = [];
    debt.additions.push({
      amount: addAmount,
      note: note,
      date: dateStr,
    });

    await updateItem(STORES.DEBTS, debt);

    showToast(
      `Berhasil menambah ${formatCurrency(addAmount)} ke hutang ${debt.partyName}`,
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

// Show modal rincian: gabungan riwayat pembayaran, penambahan, & bunga
async function showDebtHistoryModal(debtId) {
  const debt = await getItem(STORES.DEBTS, debtId);
  if (!debt) {
    showToast("Data tidak ditemukan", "error");
    return;
  }

  const payments = (debt.payments || []).map((p) => ({
    kind: "payment",
    date: p.date,
    amount: p.amount,
    note: p.note,
  }));
  const additions = (debt.additions || []).map((a) => ({
    kind: "addition",
    date: a.date,
    amount: a.amount,
    note: a.note,
  }));
  const interests = (debt.interestLog || []).map((i) => ({
    kind: "interest",
    date: i.date,
    amount: i.amount,
    days: i.days,
  }));

  // Gabung & urutkan dari yang terbaru
  const entries = [...payments, ...additions, ...interests].sort((a, b) => {
    const da = parseHistoryDate(a.date);
    const db_ = parseHistoryDate(b.date);
    return (db_ ? db_.getTime() : 0) - (da ? da.getTime() : 0);
  });

  const totalDibayar = payments.reduce((sum, p) => sum + p.amount, 0);
  const totalBunga = interests.reduce((sum, i) => sum + i.amount, 0);
  const totalPenambahan = additions.reduce((sum, a) => sum + a.amount, 0);
  const totalHutang = debt.remainingAmount || debt.amount || 0;
  // Sisa pokok tanpa bunga: fallback ke totalHutang untuk data lama yang
  // belum punya field principalRemaining (dibuat sebelum fitur ini ada)
  const sisaPokok = debt.principalRemaining ?? totalHutang;

  const kindMeta = {
    payment: {
      icon: "fa-money-bill-wave",
      color: "#10b981",
      bg: "rgba(16,185,129,.15)",
      label: "Pembayaran",
      sign: "-",
    },
    addition: {
      icon: "fa-plus-circle",
      color: "#8b5cf6",
      bg: "rgba(139,92,246,.15)",
      label: "Penambahan Hutang",
      sign: "+",
    },
    interest: {
      icon: "fa-percentage",
      color: "#f59e0b",
      bg: "rgba(245,158,11,.15)",
      label: "Bunga berjalan",
      sign: "+",
    },
  };

  const rows =
    entries.length === 0
      ? `<div style="text-align:center;padding:30px 0;color:var(--text-secondary);">
           <i class="fas fa-history" style="font-size:2.5rem;display:block;margin-bottom:10px;opacity:0.4;"></i>
           <p>Belum ada riwayat pembayaran, penambahan, atau bunga</p>
         </div>`
      : entries
          .map((entry) => {
            const meta = kindMeta[entry.kind];
            const dateObj = parseHistoryDate(entry.date);
            const dateStr = dateObj
              ? dateObj.toLocaleDateString("id-ID", {
                  day: "2-digit",
                  month: "short",
                  year: "numeric",
                })
              : entry.date || "Tanggal tidak tersedia";
            const timeStr =
              dateObj && entry.date && entry.date.includes(":")
                ? dateObj.toLocaleTimeString("id-ID", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })
                : "";
            const label =
              entry.kind === "interest"
                ? `${meta.label} (${entry.days} hari)`
                : meta.label;

            return `
              <div style="
                display:flex;align-items:center;gap:12px;
                padding:12px 0;
                border-bottom:1px solid var(--border-color);
              ">
                <div style="
                  width:36px;height:36px;border-radius:50%;flex-shrink:0;
                  background:${meta.bg};
                  display:flex;align-items:center;justify-content:center;
                ">
                  <i class="fas ${meta.icon}" style="color:${meta.color};font-size:.85rem;"></i>
                </div>
                <div style="flex:1;min-width:0;">
                  <div style="font-weight:600;font-size:.88rem;">
                    ${label}
                  </div>
                  <div style="font-size:.75rem;color:var(--text-secondary);margin-top:2px;">
                    ${dateStr}${timeStr ? " • " + timeStr : ""}
                    ${entry.kind !== "interest" && entry.note ? `<br><span style="font-style:italic;">${escapeHtml(entry.note)}</span>` : ""}
                  </div>
                </div>
                <div style="text-align:right;flex-shrink:0;">
                  <div style="font-weight:700;color:${meta.color};font-size:.95rem;">
                    ${meta.sign}${formatCurrency(entry.amount)}
                  </div>
                </div>
              </div>`;
          })
          .join("");

  const modal = document.createElement("div");
  modal.className = "modal-overlay";
  modal.innerHTML = `
    <div class="modal-container modal-medium" style="max-height:90vh;display:flex;flex-direction:column;">
      <div class="modal-header">
        <h3><i class="fas fa-list-alt"></i> Rincian — ${escapeHtml(debt.partyName)}</h3>
        <button class="modal-close-x" style="background:none;border:none;font-size:24px;cursor:pointer;color:var(--text-secondary);padding:0 8px;">&times;</button>
      </div>

      ${
        debt.description
          ? `<div style="padding:12px 16px;background:var(--bg-secondary);border-bottom:1px solid var(--border-color);">
               <div style="font-weight:600;margin-bottom:4px;color:var(--text-secondary);font-size:.7rem;text-transform:uppercase;letter-spacing:.03em;">
                 <i class="fas fa-sticky-note"></i> Catatan
               </div>
               <div style="font-size:.85rem;">${escapeHtml(debt.description)}</div>
             </div>`
          : ""
      }

      <div style="padding:16px;border-bottom:1px solid var(--border-color);background:var(--bg-primary);">
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
          <div style="text-align:center;padding:10px 6px;background:var(--bg-secondary);border-radius:10px;">
            <div style="font-size:.66rem;color:var(--text-secondary);margin-bottom:4px;">Total Pembayaran</div>
            <div style="font-weight:700;color:#10b981;font-size:.88rem;">${formatCurrency(totalDibayar)}</div>
          </div>
          <div style="text-align:center;padding:10px 6px;background:var(--bg-secondary);border-radius:10px;">
            <div style="font-size:.66rem;color:var(--text-secondary);margin-bottom:4px;">Total Bunga Masuk</div>
            <div style="font-weight:700;color:#f59e0b;font-size:.88rem;">${formatCurrency(totalBunga)}</div>
          </div>
          <div style="text-align:center;padding:10px 6px;background:var(--bg-secondary);border-radius:10px;">
            <div style="font-size:.66rem;color:var(--text-secondary);margin-bottom:4px;">Penambahan Hutang</div>
            <div style="font-weight:700;color:#8b5cf6;font-size:.88rem;">${formatCurrency(totalPenambahan)}</div>
          </div>
          <div style="text-align:center;padding:10px 6px;background:var(--bg-secondary);border-radius:10px;">
            <div style="font-size:.66rem;color:var(--text-secondary);margin-bottom:4px;">Sisa Hutang (Tanpa Bunga)</div>
            <div style="font-weight:700;font-size:.88rem;">${formatCurrency(sisaPokok)}</div>
          </div>
        </div>
        <div style="
          margin-top:10px;padding:12px 14px;border-radius:10px;
          background:linear-gradient(135deg, var(--info,#6366f1), #8b5cf6);
          color:#fff;display:flex;justify-content:space-between;align-items:center;
        ">
          <span style="font-size:.78rem;">Total Hutang (Pokok + Bunga)</span>
          <span style="font-weight:700;font-size:1.05rem;">${formatCurrency(totalHutang)}</span>
        </div>
      </div>

      <div class="modal-body" style="overflow-y:auto;flex:1;">
        ${rows}
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  modal
    .querySelector(".modal-close-x")
    .addEventListener("click", () => modal.remove());
  modal.addEventListener("click", (e) => {
    if (e.target === modal) modal.remove();
  });
}

// Cetak laporan pembayaran satu data hutang/piutang ke PDF (A4).
// READ-ONLY: hanya membaca record dari IndexedDB, tidak menghitung bunga
// (accrueInterestForDebt tidak dipanggil) dan tidak menulis apa pun.
async function printDebtReport(debtId) {
  const debt = await getItem(STORES.DEBTS, debtId);
  if (!debt) {
    showToast("Data tidak ditemukan", "error");
    return;
  }
  if (!window.jspdf) {
    showToast(
      "Library PDF belum termuat. Pastikan koneksi internet aktif.",
      "error",
    );
    return;
  }

  try {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF("p", "mm", "a4");
    const W = 210;
    const H = 297;
    const ML = 15;
    const CW = W - ML * 2;
    const BOTTOM = H - 15;
    const rp = (n) => formatCurrency(n).replace(/\u00a0/g, " ");
    const fmtDateTime = (str) => {
      const d = parseHistoryDate(str);
      return d ? formatDate(d, "datetime") : str || "-";
    };

    // Nilai diambil dari data tersimpan, dengan definisi yang sama dengan modal Rincian
    const isOwe = debt.type === "owe";
    const payments = debt.payments || [];
    const additions = debt.additions || [];
    const interests = debt.interestLog || [];
    const totalPaid = payments.reduce((s, p) => s + p.amount, 0);
    const totalAdditions = additions.reduce((s, a) => s + a.amount, 0);
    const totalInterest = interests.reduce((s, i) => s + i.amount, 0);
    const total = debt.amount || 0;
    const remaining = debt.remainingAmount ?? debt.amount ?? 0;
    const initial = total - totalAdditions - totalInterest;
    const hasInterest =
      debt.interestPeriod &&
      debt.interestPeriod !== "none" &&
      Number(debt.interestRate) > 0;
    const statusLabel =
      { completed: "Lunas", partial: "Dibayar Sebagian", active: "Aktif" }[
        debt.status
      ] ||
      debt.status ||
      "-";
    const kind = isOwe ? "Hutang" : "Piutang";

    // ── Header ──
    doc.setFillColor(26, 26, 46);
    doc.rect(0, 0, W, 28, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.text(`Laporan Pembayaran ${kind}`, ML, 12);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(180, 190, 210);
    doc.text("Money Manager", ML, 18);
    doc.text(
      `Dicetak: ${getCurrentDateTime().datetime}   |   ID Data: ${debt.id}`,
      ML,
      23,
    );

    let y = 38;
    const ensureSpace = (h, redrawHeader) => {
      if (y + h > BOTTOM) {
        doc.addPage();
        y = 15;
        if (redrawHeader) redrawHeader();
      }
    };

    // ── Ringkasan ──
    doc.setTextColor(30, 30, 30);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.text("Ringkasan", ML, y);
    y += 3;

    const summary = [
      [
        "Jenis",
        isOwe ? "Hutang (Saya berhutang)" : "Piutang (Berhutang ke saya)",
      ],
      ["Pihak", debt.partyName || "-"],
      debt.description ? ["Catatan", debt.description] : null,
      ["Nominal Awal", rp(initial)],
      totalAdditions > 0 ? ["Penambahan Nominal", rp(totalAdditions)] : null,
      hasInterest
        ? [
            "Suku Bunga",
            `${debt.interestType === "fixed" ? rp(debt.interestRate) : debt.interestRate + "%"} / ${(INTEREST_PERIOD_LABELS[debt.interestPeriod] || debt.interestPeriod).toLowerCase()}`,
          ]
        : null,
      totalInterest > 0 ? ["Total Bunga", rp(totalInterest)] : null,
      ["Total (Pokok + Bunga)", rp(total)],
      ["Total Dibayar", rp(totalPaid)],
      ["Sisa", rp(remaining)],
      ["Status", statusLabel],
      ["Tanggal Dibuat", fmtDateTime(debt.createdAt)],
      debt.dueDate ? ["Jatuh Tempo", formatDate(debt.dueDate)] : null,
    ].filter(Boolean);

    doc.setFontSize(9);
    summary.forEach(([label, value]) => {
      const lines = doc.splitTextToSize(String(value), CW - 55);
      const h = Math.max(6.5, lines.length * 4.2 + 2.5);
      ensureSpace(h);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(100, 100, 100);
      doc.text(label, ML, y + 4.5);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(30, 30, 30);
      doc.text(lines, ML + 55, y + 4.5);
      y += h;
      doc.setDrawColor(225, 225, 225);
      doc.line(ML, y, ML + CW, y);
    });

    // ── Riwayat Pembayaran ──
    y += 8;
    ensureSpace(30);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(30, 30, 30);
    doc.text("Riwayat Pembayaran", ML, y);
    y += 3;

    const cols = [
      { t: "No", x: ML + 1, w: 10, a: "left" },
      { t: "Tanggal", x: ML + 12, w: 36, a: "left" },
      { t: "Keterangan", x: ML + 50, w: 56, a: "left" },
      { t: "Dibayar", x: ML + 145, w: 0, a: "right" },
      { t: "Sisa Setelah Bayar", x: ML + CW - 1, w: 0, a: "right" },
    ];
    const drawTableHeader = () => {
      doc.setFillColor(240, 242, 247);
      doc.rect(ML, y, CW, 7, "F");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8);
      doc.setTextColor(60, 60, 60);
      cols.forEach((c) => doc.text(c.t, c.x, y + 4.8, { align: c.a }));
      y += 7;
    };

    if (payments.length === 0) {
      y += 3;
      doc.setFont("helvetica", "italic");
      doc.setFontSize(9);
      doc.setTextColor(120, 120, 120);
      doc.text("Belum ada pembayaran.", ML, y + 4);
      y += 8;
    } else {
      ensureSpace(20);
      drawTableHeader();
      doc.setFontSize(8.5);
      payments.forEach((p, idx) => {
        const noteLines = doc.splitTextToSize(p.note || "-", cols[2].w);
        const h = Math.max(7, noteLines.length * 4 + 3);
        ensureSpace(h, drawTableHeader);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(30, 30, 30);
        doc.text(String(idx + 1), cols[0].x, y + 4.8);
        doc.text(fmtDateTime(p.date), cols[1].x, y + 4.8);
        doc.text(noteLines, cols[2].x, y + 4.8);
        doc.text(rp(p.amount), cols[3].x, y + 4.8, { align: "right" });
        doc.text(
          p.remainingAfter === undefined || p.remainingAfter === null
            ? "-"
            : rp(p.remainingAfter),
          cols[4].x,
          y + 4.8,
          { align: "right" },
        );
        y += h;
        doc.setDrawColor(230, 230, 230);
        doc.line(ML, y, ML + CW, y);
      });

      ensureSpace(9, drawTableHeader);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      doc.text("Total Dibayar", cols[2].x, y + 6);
      doc.text(rp(totalPaid), cols[3].x, y + 6, { align: "right" });
      y += 9;
    }

    // ── Footer semua halaman ──
    const pages = doc.getNumberOfPages();
    for (let i = 1; i <= pages; i++) {
      doc.setPage(i);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7.5);
      doc.setTextColor(140, 140, 140);
      doc.text(`Halaman ${i} / ${pages}`, W - ML, H - 8, { align: "right" });
      doc.text(`${kind} - ${debt.partyName || ""}`, ML, H - 8);
    }

    const slug = String(debt.partyName || "data")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "");
    doc.save(
      `laporan_${kind.toLowerCase()}_${slug || "data"}_${getCurrentDateTime().date}.pdf`,
    );
    showToast("Laporan berhasil dibuat!", "success");
  } catch (error) {
    console.error("Debt report error:", error);
    showToast("Gagal membuat laporan PDF", "error");
  }
}

// Parse tanggal dari format "dd/mm/yyyy HH:MM" atau "yyyy-mm-dd" jadi objek Date
function parseHistoryDate(dateStr) {
  if (!dateStr) return null;
  if (dateStr.includes("/")) {
    const parts = dateStr.split(" ");
    const [d, m, y] = parts[0].split("/");
    const [hr, mn] = (parts[1] || "00:00").split(":");
    const dt = new Date(y, m - 1, d, hr || 0, mn || 0);
    return isNaN(dt.getTime()) ? null : dt;
  }
  const dt = new Date(dateStr);
  return isNaN(dt.getTime()) ? null : dt;
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
            --d-brand: #2B2A4C;
            --d-red: #C0524F;
            --d-green: #1F9D55;
            --d-bar: #2ECC71;
            --d-surface: var(--bg-secondary, #fff);
            --d-soft: var(--bg-primary, #F4F4F7);
            --d-text: var(--text-primary, #242333);
            --d-muted: var(--text-secondary, #6F6F7B);
            --d-line: var(--border-color, #EEEEF3);
            max-width: 1000px;
            margin: 0 auto;
            display: flex;
            flex-direction: column;
            gap: 20px;
        }

        /* ---------- Header ---------- */
        .debts-container .debt-header {
            display: flex !important;
            flex-direction: row !important;
            flex-wrap: nowrap !important;
            align-items: center !important;
            justify-content: space-between !important;
            text-align: left !important;
            gap: 12px;
            margin: 0;
        }
        .debts-container .debt-header-title {
            display: flex;
            flex-direction: row;
            align-items: center;
            justify-content: flex-start;
            text-align: left;
            gap: 12px;
            flex: 1 1 auto;
            min-width: 0;
        }
        .debts-container .debt-header-title > div {
            min-width: 0;
            text-align: left;
        }
        .debt-header-icon {
            width: 44px;
            height: 44px;
            border-radius: 50%;
            background: var(--d-brand);
            color: #fff;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 1.05rem;
            flex: none;
        }
        .debt-eyebrow {
            display: block;
            font-size: 0.75rem;
            color: var(--d-muted);
        }
        .debt-header h1 {
            margin: 0;
            font-size: 1.3rem;
            font-weight: 600;
            letter-spacing: -0.01em;
        }
        .debts-container .debt-header #add-debt-btn {
            display: inline-flex !important;
            align-items: center;
            justify-content: center;
            gap: 6px;
            flex: 0 0 auto;
            width: auto !important;
            min-width: 0 !important;
            height: 44px !important;
            padding: 0 18px !important;
            margin: 0 !important;
            border: 0;
            border-radius: 999px !important;
            background: var(--d-brand);
            color: #fff;
            font-weight: 600;
            font-size: 0.9rem !important;
            line-height: 1;
            white-space: nowrap;
            cursor: pointer;
            box-shadow: 0 6px 16px rgba(43, 42, 76, 0.28);
        }
        .debts-container .debt-header #add-debt-btn i {
            font-size: 0.8rem;
            margin: 0;
        }

        /* ---------- Hero ---------- */
        .debt-hero {
            position: relative;
            overflow: hidden;
            background: var(--d-brand);
            color: #fff;
            border-radius: 24px;
            padding: 16px;
            display: flex;
            flex-direction: column;
            gap: 12px;
            box-shadow: 0 10px 24px rgba(43, 42, 76, 0.25);
        }
        .debt-hero::before {
            content: "";
            position: absolute;
            right: -50px;
            top: -60px;
            width: 150px;
            height: 150px;
            border-radius: 50%;
            background: rgba(255, 255, 255, 0.06);
            pointer-events: none;
        }
        .debt-hero > * { position: relative; }
        .hero-main { display: flex; flex-direction: column; gap: 2px; }
        .hero-top {
            display: flex;
            justify-content: space-between;
            align-items: center;
            gap: 8px;
        }
        .debt-hero .hero-label { font-size: 0.8rem; font-weight: 600; color: #D4D3EA !important; }
        .debt-hero .hero-caption { font-size: 0.7rem; color: #B9B8D6 !important; text-align: right; }
        .debt-hero .hero-amount {
            font-size: 2rem;
            font-weight: 700;
            letter-spacing: -0.03em;
            line-height: 1.15;
            color: #fff !important;
            font-variant-numeric: tabular-nums;
        }
        .debt-hero .hero-amount.negative { color: #FF9C98 !important; }
        .hero-tiles { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
        .hero-tile {
            background: rgba(255, 255, 255, 0.1);
            border-radius: 14px;
            padding: 10px 12px;
            display: flex;
            flex-direction: column;
            gap: 4px;
            min-width: 0;
        }
        .debt-hero .hero-tile-label { font-size: 0.72rem; font-weight: 600; color: #D4D3EA !important; }
        .hero-tile-label.owe i { color: #FF9C98; font-size: 1.1em; }
        .hero-tile-label.debt i { color: #2ECC71; font-size: 1.1em; }
        .debt-hero .hero-tile-value {
            font-size: 1rem;
            font-weight: 700;
            color: #fff !important;
            font-variant-numeric: tabular-nums;
            word-break: break-word;
        }

        /* ---------- Tabs ---------- */
        .debts-container .debt-tabs {
            display: flex;
            gap: 8px;
            background: transparent !important;
            border: 0 !important;
            padding: 0 !important;
            box-shadow: none !important;
        }
        .debts-container .debt-tabs .tab-btn {
            flex: 0 0 auto;
            height: 38px;
            padding: 0 20px;
            border: 0;
            border-radius: 999px;
            background: transparent !important;
            background-image: none !important;
            color: var(--d-muted);
            font-size: 0.88rem;
            font-weight: 600;
            cursor: pointer;
            box-shadow: none;
            transition: background 0.2s ease, color 0.2s ease;
        }
        .debts-container .debt-tabs .tab-btn.active {
            background: var(--d-brand) !important;
            background-image: none !important;
            color: #fff;
            box-shadow: 0 4px 12px rgba(43, 42, 76, 0.22);
        }

        /* ---------- Cards ---------- */
        .debts-list { display: flex; flex-direction: column; gap: 14px; }
        .debt-card {
            background: var(--d-surface);
            border-radius: 22px;
            padding: 16px;
            display: grid;
            grid-template-columns: minmax(0, 1fr);
            grid-template-areas: "head" "fin" "actions";
            gap: 14px;
            box-shadow: 0 1px 2px rgba(36, 35, 51, 0.05), 0 8px 24px rgba(43, 42, 76, 0.06);
        }
        .debt-card.overdue {
            box-shadow: 0 0 0 1.5px rgba(192, 82, 79, 0.4), 0 8px 24px rgba(192, 82, 79, 0.08);
        }
        .dc-head {
            grid-area: head;
            display: flex;
            align-items: center;
            gap: 12px;
            min-width: 0;
        }
        .debts-container .dc-icon {
            width: 44px;
            height: 44px;
            margin: 0;
            border-radius: 50%;
            flex: none;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 1.35rem;
            line-height: 1;
            box-shadow: none !important;
        }
        .debts-container .dc-icon.debt { background: rgba(31, 157, 85, 0.14); color: var(--d-green); }
        .debts-container .dc-icon.owe { background: rgba(192, 82, 79, 0.14); color: var(--d-red); }
        .debts-container .dc-icon i { color: inherit; line-height: 1; }
        .debts-container .dc-info {
            flex: 1;
            min-width: 0;
            display: flex;
            flex-direction: column;
            justify-content: center;
            gap: 4px;
        }
        .debts-container .dc-name {
            margin: 0;
            font-size: 1rem;
            font-weight: 600;
            line-height: 1.3;
            color: var(--d-text);
            overflow-wrap: anywhere;
        }
        .debts-container .dc-meta {
            display: flex;
            flex-wrap: wrap;
            align-items: center;
            gap: 4px 8px;
        }
        .debts-container .dc-badge {
            display: inline-block;
            padding: 3px 10px;
            border-radius: 999px;
            font-size: 0.72rem;
            font-weight: 600;
            white-space: nowrap;
        }
        .debts-container .dc-badge.debt { background: rgba(31, 157, 85, 0.12); color: var(--d-green); }
        .debts-container .dc-badge.owe { background: rgba(192, 82, 79, 0.12); color: var(--d-red); }
        .debts-container .dc-desc { font-size: 0.8rem; color: var(--d-muted); }

        .debt-card-fin {
            grid-area: fin;
            border-top: 1px solid var(--d-line);
            padding-top: 14px;
            display: flex;
            flex-direction: column;
            gap: 10px;
        }
        .fin-sisa-block {
            display: flex;
            justify-content: space-between;
            align-items: center;
            gap: 12px;
            padding: 12px 14px;
            border-radius: 16px;
            background: var(--d-soft);
        }
        .fin-sisa-block.debt { background: rgba(31, 157, 85, 0.1); }
        .fin-sisa-block.owe { background: rgba(192, 82, 79, 0.1); }
        .fin-sisa-block .fin-label { font-weight: 600; color: var(--d-text); }
        .fin-sisa-value {
            font-size: 1.3rem;
            font-weight: 700;
            letter-spacing: -0.01em;
            font-variant-numeric: tabular-nums;
        }
        .fin-sisa-value.debt, .fin-sisa-value.completed { color: var(--d-green); }
        .fin-sisa-value.owe { color: var(--d-red); }
        .fin-row {
            display: flex;
            justify-content: space-between;
            align-items: center;
            gap: 12px;
            font-size: 0.85rem;
        }
        .fin-label { color: var(--d-muted); }
        .fin-label i { margin-right: 4px; }
        .fin-value {
            font-weight: 600;
            font-variant-numeric: tabular-nums;
            text-align: right;
        }
        .fin-value.overdue-text { color: var(--d-red); }
        .fin-value.progress-value { color: var(--d-green); }
        .fin-note {
            font-size: 0.72rem;
            color: var(--d-muted);
            margin-top: -4px;
        }
        .debt-installments {
            font-size: 0.8rem;
            background: var(--d-soft);
            border-radius: 12px;
            padding: 10px 12px;
            color: var(--d-muted);
        }
        .debt-installments summary { cursor: pointer; font-weight: 500; }
        .debt-installments .inst-item { margin-top: 6px; }
        .debt-progress { display: flex; flex-direction: column; gap: 8px; }
        .debts-container .progress-bar-container {
            height: 8px;
            border-radius: 999px;
            background: var(--d-line);
            overflow: hidden;
        }
        .debts-container .progress-fill {
            height: 100%;
            background: var(--d-bar);
            border-radius: 999px;
        }
        .completed-badge {
            align-self: flex-start;
            background: rgba(31, 157, 85, 0.12);
            color: var(--d-green);
            font-size: 0.8rem;
            font-weight: 600;
            padding: 5px 12px;
            border-radius: 999px;
        }

        /* ---------- Aksi ---------- */
        .debt-actions {
            grid-area: actions;
            display: grid;
            grid-template-columns: repeat(6, 1fr);
            gap: 8px;
            justify-items: center;
            border-top: 1px solid var(--d-line);
            padding-top: 14px;
        }
        .debts-container .debt-actions .icon-btn {
            width: 100%;
            max-width: 44px;
            height: auto;
            aspect-ratio: 1 / 1;
            border: 0;
            border-radius: 50%;
            background: rgba(128, 128, 150, 0.16) !important;
            color: var(--d-text) !important;
            opacity: 1 !important;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 0.95rem;
            cursor: pointer;
            padding: 0;
        }
        .debts-container .debt-actions .icon-btn i { color: inherit !important; opacity: 1 !important; }
        .debts-container .debt-actions .icon-btn.delete-debt {
            background: rgba(192, 82, 79, 0.16) !important;
            color: var(--d-red) !important;
        }

        /* ---------- Empty state ---------- */
        .debts-container .empty-state {
            background: var(--d-surface);
            border-radius: 24px;
            padding: 40px 20px;
            text-align: center;
            color: var(--d-muted);
        }

        /* ---------- Modal Tambah/Edit ---------- */
        .modal-container.debt-modal {
            --d-brand: #2B2A4C;
            --d-red: #C0524F;
            --d-green: #1F9D55;
            --d-surface: var(--bg-secondary, #fff);
            --d-soft: var(--bg-primary, #F4F4F7);
            --d-text: var(--text-primary, #242333);
            --d-muted: var(--text-secondary, #6F6F7B);
            --d-line: var(--border-color, #E6E6EC);
            width: 100%;
            max-width: 520px;
            max-height: 92vh;
            padding: 0;
            display: flex;
            flex-direction: column;
            overflow: hidden;
            background: var(--d-surface);
            border-radius: 28px;
            box-shadow: 0 24px 60px rgba(43, 42, 76, 0.28);
        }
        .debt-modal .dm-header {
            display: flex;
            align-items: center;
            gap: 12px;
            padding: 20px 20px 16px;
            border: 0;
            background: transparent;
            flex: none;
        }
        .debt-modal .dm-header-icon {
            width: 44px;
            height: 44px;
            border-radius: 50%;
            background: var(--d-brand);
            color: #fff;
            display: flex;
            align-items: center;
            justify-content: center;
            flex: none;
        }
        .debt-modal .dm-header-text { flex: 1; min-width: 0; }
        .debt-modal .dm-eyebrow { display: block; font-size: 0.72rem; color: var(--d-muted); }
        .debt-modal .dm-header h3 {
            margin: 0;
            font-size: 1.1rem;
            font-weight: 600;
            color: var(--d-text);
        }
        .debt-modal .modal-close-x {
            width: 36px;
            height: 36px;
            padding: 0;
            border: 0;
            border-radius: 50%;
            background: var(--d-soft);
            color: var(--d-muted);
            font-size: 1.3rem;
            line-height: 1;
            cursor: pointer;
        }
        .debt-modal .modal-body {
            overflow-y: auto;
            flex: 1;
            padding: 0 20px;
        }
        .debt-modal .dm-form { display: flex; flex-direction: column; gap: 16px; }
        .debt-modal .form-group { margin: 0; }
        .debt-modal label {
            display: block;
            margin-bottom: 8px;
            font-size: 0.78rem;
            font-weight: 600;
            color: var(--d-muted);
        }
        .debt-modal .required { color: var(--d-red); }
        .debt-modal .form-input {
            width: 100%;
            box-sizing: border-box;
            height: 48px;
            padding: 0 14px;
            border: 1.5px solid transparent;
            border-radius: 14px;
            background: var(--d-soft);
            color: var(--d-text);
            font-size: 0.95rem;
            outline: none;
            transition: border-color 0.15s ease, box-shadow 0.15s ease, background 0.15s ease;
        }
        .debt-modal textarea.form-input { height: auto; padding: 12px 14px; resize: vertical; }
        .debt-modal select.form-input {
            appearance: none;
            -webkit-appearance: none;
            padding-right: 36px;
            background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='%23858590' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E");
            background-repeat: no-repeat;
            background-position: right 14px center;
        }
        .debt-modal .form-input:focus {
            border-color: var(--d-brand);
            background-color: var(--d-surface);
            box-shadow: 0 0 0 4px rgba(43, 42, 76, 0.1);
        }
        .debt-modal .money-field { position: relative; }
        .debt-modal .money-prefix {
            position: absolute;
            left: 16px;
            top: 50%;
            transform: translateY(-50%);
            font-weight: 600;
            color: var(--d-muted);
            pointer-events: none;
        }
        .debt-modal .money-field .form-input {
            padding-left: 44px;
            font-size: 1.15rem;
            font-weight: 700;
            letter-spacing: -0.01em;
            font-variant-numeric: tabular-nums;
        }
        .debt-modal .type-selector { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
        .debt-modal .type-btn {
            display: flex;
            align-items: center;
            gap: 10px;
            padding: 12px;
            border: 1.5px solid var(--d-line);
            border-radius: 18px;
            background: var(--d-surface);
            color: var(--d-text);
            text-align: left;
            cursor: pointer;
            transition: border-color 0.15s ease, background 0.15s ease;
        }
        .debt-modal .type-btn.active {
            border-color: var(--d-brand);
            background: rgba(43, 42, 76, 0.06);
            box-shadow: 0 0 0 3px rgba(43, 42, 76, 0.08);
        }
        .debt-modal .type-ico {
            width: 36px;
            height: 36px;
            border-radius: 50%;
            flex: none;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 1.15rem;
        }
        .debt-modal .type-ico.in { background: rgba(31, 157, 85, 0.12); color: var(--d-green); }
        .debt-modal .type-ico.out { background: rgba(192, 82, 79, 0.12); color: var(--d-red); }
        .debt-modal .type-text b { display: block; font-size: 0.82rem; font-weight: 600; line-height: 1.25; }
        .debt-modal .type-text small { display: block; margin-top: 2px; font-size: 0.7rem; color: var(--d-muted); }
        .debt-modal .dm-row { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
        .debt-modal .dm-inst {
            background: var(--d-soft);
            border-radius: 18px;
            padding: 14px;
        }
        .debt-modal .dm-inst .form-input { background: var(--d-surface); }
        .debt-modal .dm-inst .form-group { margin-bottom: 12px; }
        .debt-modal .multi-section-title { font-size: 0.8rem; font-weight: 600; margin-bottom: 8px; }
        .debt-modal .multi-item {
            background: var(--d-surface);
            border-radius: 14px;
            padding: 12px;
            margin-bottom: 10px;
        }
        .debt-modal .multi-item-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 8px;
        }
        .debt-modal .multi-item-title { font-size: 0.82rem; font-weight: 600; }
        .debt-modal .multi-form-row { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
        .debt-modal .multi-item .form-input { background: var(--d-soft); }
        .debt-modal .multi-item .form-group { margin: 0; }
        .debt-modal .debt-inst-remove {
            width: 32px;
            height: 32px;
            border: 0;
            border-radius: 50%;
            background: rgba(192, 82, 79, 0.12);
            color: var(--d-red);
            cursor: pointer;
            padding: 0;
        }
        .debt-modal .multi-add-btn {
            width: 100%;
            height: 42px;
            border: 1.5px dashed var(--d-brand);
            border-radius: 12px;
            background: transparent;
            color: var(--d-brand);
            font-weight: 600;
            font-size: 0.85rem;
            cursor: pointer;
        }
        .debt-modal .multi-total-row {
            display: flex;
            justify-content: space-between;
            margin-top: 12px;
            font-size: 0.85rem;
            font-weight: 600;
        }
        .debt-modal .form-help {
            display: block;
            margin-top: 6px;
            font-size: 0.72rem;
            color: var(--d-muted);
        }
        .debt-modal details.dm-more {
            border: 1px solid var(--d-line);
            border-radius: 18px;
        }
        .debt-modal details.dm-more > summary {
            list-style: none;
            display: flex;
            justify-content: space-between;
            align-items: center;
            gap: 8px;
            padding: 14px 16px;
            font-size: 0.88rem;
            font-weight: 600;
            cursor: pointer;
        }
        .debt-modal details.dm-more > summary::-webkit-details-marker { display: none; }
        .debt-modal details.dm-more > summary span {
            margin-left: auto;
            font-size: 0.72rem;
            font-weight: 500;
            color: var(--d-muted);
        }
        .debt-modal details.dm-more > summary::after {
            content: "\\25BE";
            color: var(--d-muted);
            transition: transform 0.2s ease;
        }
        .debt-modal details.dm-more[open] > summary::after { transform: rotate(180deg); }
        .debt-modal .dm-more-body {
            padding: 0 16px 16px;
            display: flex;
            flex-direction: column;
            gap: 16px;
        }
        .debt-modal .interest-type-selector { background: var(--d-soft); border-radius: 14px; padding: 4px; }
        .debt-modal .interest-type-btn { border-radius: 10px; color: var(--d-muted); font-weight: 600; }
        .debt-modal .interest-type-btn.active { background: var(--d-brand); color: #fff; }
        .debt-modal .interest-preview { background: rgba(43, 42, 76, 0.07); color: var(--d-brand); border-radius: 12px; }
        .debt-modal .dm-footer {
            position: sticky;
            bottom: 0;
            display: flex;
            gap: 10px;
            margin: 0 -20px;
            padding: 14px 20px 20px;
            background: var(--d-surface);
            border-top: 1px solid var(--d-line);
        }
        .debt-modal .dm-footer button {
            height: 48px;
            border: 0;
            border-radius: 999px;
            font-weight: 600;
            font-size: 0.92rem;
            cursor: pointer;
        }
        .debt-modal .dm-footer .btn-secondary { flex: 1; background: var(--d-soft); color: var(--d-text); }
        .debt-modal .dm-footer .btn-primary {
            flex: 2;
            background: var(--d-brand);
            color: #fff;
            box-shadow: 0 6px 16px rgba(43, 42, 76, 0.28);
        }
        @media (max-width: 600px) {
            .modal-overlay:has(.debt-modal) { align-items: flex-end; padding: 0; }
            .modal-container.debt-modal {
                max-width: none;
                max-height: 94vh;
                border-radius: 28px 28px 0 0;
            }
        }
        @media (max-width: 420px) {
            .debt-modal .dm-row,
            .debt-modal .multi-form-row { grid-template-columns: 1fr; }
            .debt-modal .type-btn { padding: 10px; }
        }

        /* ---------- Modal helpers (tetap) ---------- */
        .info-box {
            background: var(--bg-primary);
            padding: 12px;
            border-radius: 10px;
            margin: 10px 0;
            font-size: 0.85rem;
        }
        .interest-row { display: flex; gap: 8px; }
        .interest-type-selector {
            display: flex;
            gap: 8px;
            background: var(--bg-primary);
            padding: 4px;
            border-radius: 10px;
        }
        .interest-type-btn {
            flex: 1;
            padding: 8px;
            border: none;
            background: none;
            border-radius: 7px;
            cursor: pointer;
            font-size: 0.78rem;
            color: var(--text-secondary);
            transition: all 0.2s ease;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 6px;
        }
        .interest-type-btn.active { background: var(--info); color: white; }
        .interest-row #debt-interest-rate { flex: 1; }
        .interest-row #debt-interest-period { flex: 1.4; }
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
            color: #b7791f;
            padding: 8px 12px;
            border-radius: 12px;
            font-size: 0.75rem;
        }
        .interest-badge .interest-daily {
            margin-left: auto;
            font-weight: 600;
        }

        @media (max-width: 480px) {
            .interest-row { flex-direction: column; }
            .interest-badge .interest-daily { margin-left: 0; width: 100%; }
            .debts-container .debt-header h1 { font-size: 1.15rem; }
            .debts-container .debt-tabs { display: grid; grid-template-columns: repeat(3, 1fr); }
            .debts-container .debt-tabs .tab-btn { padding: 0; }
        }

        /* ---------- Layar sangat sempit: tombol tambah jadi ikon ---------- */
        @media (max-width: 340px) {
            .debts-container .debt-header #add-debt-btn .btn-label { display: none; }
            .debts-container .debt-header #add-debt-btn {
                width: 44px !important;
                padding: 0 !important;
            }
        }

        /* ---------- Tablet / desktop ---------- */
        @media (min-width: 768px) {
            .debt-hero {
                flex-direction: row;
                align-items: center;
                justify-content: space-between;
                gap: 24px;
                padding: 22px 26px;
            }
            .hero-main { flex: 1; }
            .debt-hero .hero-amount { font-size: 2.6rem; }
            .hero-tiles { width: min(420px, 50%); }
            .debt-card {
                grid-template-columns: minmax(0, 1fr) minmax(0, 1.35fr);
                grid-template-areas: "head fin" "actions fin";
                column-gap: 0;
                padding: 0;
                overflow: hidden;
            }
            .dc-head { padding: 22px 24px 0; background: var(--d-soft); }
            .debt-actions {
                display: flex;
                justify-content: flex-start;
                align-items: flex-end;
                gap: 8px;
                padding: 14px 24px 22px;
                background: var(--d-soft);
                border-top: 0;
            }
            .debts-container .debt-actions .icon-btn {
                width: 38px;
                max-width: none;
                height: 38px;
                aspect-ratio: auto;
                background: var(--d-surface) !important;
            }
            .debts-container .debt-actions .icon-btn.delete-debt { background: rgba(192, 82, 79, 0.16) !important; }
            .debt-card-fin { border-top: 0; padding: 22px 26px; justify-content: center; }
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
