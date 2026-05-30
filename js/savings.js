// Savings Component
// Mengelola target tabungan dan progress

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
let allSavings = [];

// Render halaman tabungan utama
export async function renderSavingsPage() {
  const container = document.getElementById("page-content");
  if (!container) return;

  // Load semua tabungan
  await loadSavings();

  // Hitung total target dan total terkumpul
  const totalTarget = allSavings.reduce((sum, s) => sum + s.targetAmount, 0);
  const totalSaved = allSavings.reduce((sum, s) => sum + s.currentAmount, 0);
  const overallProgress =
    totalTarget > 0 ? (totalSaved / totalTarget) * 100 : 0;

  // HTML Template
  container.innerHTML = `
        <div class="savings-container">
            <!-- Header -->
            <div class="page-header">
                <h1><i class="fas fa-piggy-bank"></i> Tabungan</h1>
                <button class="btn-primary btn-add-saving" id="add-saving-btn">
                    <i class="fas fa-plus"></i> Target Baru
                </button>
            </div>
            
            <!-- Overall Progress Card -->
            <div class="overall-progress-card card">
                <div class="progress-header">
                    <i class="fas fa-chart-line"></i>
                    <span>Progress Keseluruhan</span>
                </div>
                <div class="progress-stats">
                    <div class="stat">
                        <span class="stat-label">Total Target</span>
                        <span class="stat-value">${formatCurrency(totalTarget)}</span>
                    </div>
                    <div class="stat">
                        <span class="stat-label">Terkumpul</span>
                        <span class="stat-value">${formatCurrency(totalSaved)}</span>
                    </div>
                </div>
                <div class="progress-bar-container">
                    <div class="progress-fill" style="width: ${Math.min(overallProgress, 100)}%"></div>
                </div>
                <div class="progress-percentage">${Math.round(overallProgress)}% tercapai</div>
            </div>
            
            <!-- Savings List -->
            <div class="savings-list" id="savings-list">
                ${renderSavingsList()}
            </div>
        </div>
    `;

  // Setup event listeners
  setupSavingsEventListeners();

  // Add styles
  addSavingsStyles();
}

// Load semua tabungan dari database
async function loadSavings() {
  allSavings = await getAllItems(STORES.SAVINGS);
  // Sort: active first, then by deadline
  allSavings.sort((a, b) => {
    if (a.status === "active" && b.status !== "active") return -1;
    if (a.status !== "active" && b.status === "active") return 1;
    return new Date(a.deadline) - new Date(b.deadline);
  });
}

// Render daftar tabungan
function renderSavingsList() {
  if (allSavings.length === 0) {
    return `
            <div class="empty-state">
                <i class="fas fa-piggy-bank"></i>
                <p>Belum ada target tabungan</p>
                <button class="btn-primary btn-add-saving">Buat Target Tabungan</button>
            </div>
        `;
  }

  return allSavings
    .map((saving) => {
      const progress = (saving.currentAmount / saving.targetAmount) * 100;
      const isCompleted = progress >= 100;
      const daysLeft = getDaysLeft(saving.deadline);

      return `
            <div class="saving-card" data-id="${saving.id}">
                <div class="saving-card-header">
                    <div class="saving-icon">
                        <i class="fas ${saving.icon || "fa-piggy-bank"}"></i>
                    </div>
                    <div class="saving-info">
                        <h3>${escapeHtml(saving.name)}</h3>
                        <p class="saving-description">${escapeHtml(saving.description || "Tidak ada deskripsi")}</p>
                    </div>
                    <div class="saving-actions">
                        <button class="icon-btn add-saving-money" data-id="${saving.id}" title="Tambah Tabungan">
                            <i class="fas fa-plus-circle"></i>
                        </button>
                        <button class="icon-btn withdraw-saving" data-id="${saving.id}" title="Ambil Tabungan">
                            <i class="fas fa-minus-circle"></i>
                        </button>
                        <button class="icon-btn edit-saving" data-id="${saving.id}" title="Edit">
                            <i class="fas fa-edit"></i>
                        </button>
                        <button class="icon-btn delete-saving" data-id="${saving.id}" title="Hapus">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                </div>
                <div class="saving-card-body">
                    <div class="saving-amounts">
                        <div class="amount-item">
                            <span class="amount-label">Target</span>
                            <span class="amount-value">${formatCurrency(saving.targetAmount)}</span>
                        </div>
                        <div class="amount-item">
                            <span class="amount-label">Terkumpul</span>
                            <span class="amount-value ${isCompleted ? "completed" : ""}">${formatCurrency(saving.currentAmount)}</span>
                        </div>
                        <div class="amount-item">
                            <span class="amount-label">Sisa</span>
                            <span class="amount-value">${formatCurrency(saving.targetAmount - saving.currentAmount)}</span>
                        </div>
                    </div>
                    <div class="progress-bar-container">
                        <div class="progress-fill ${isCompleted ? "completed" : ""}" style="width: ${Math.min(progress, 100)}%"></div>
                    </div>
                    <div class="saving-footer">
                        <span class="progress-text">${Math.round(progress)}% tercapai</span>
                        ${
                          saving.deadline
                            ? `
                            <span class="deadline ${daysLeft < 0 ? "expired" : daysLeft < 7 ? "urgent" : ""}">
                                <i class="far fa-calendar-alt"></i>
                                ${daysLeft < 0 ? "Melewati deadline" : `${daysLeft} hari lagi`}
                            </span>
                        `
                            : ""
                        }
                    </div>
                </div>
            </div>
        `;
    })
    .join("");
}

// Helper: Get days left until deadline
function getDaysLeft(deadline) {
  if (!deadline) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const deadlineDate = new Date(deadline);
  deadlineDate.setHours(0, 0, 0, 0);
  const diffTime = deadlineDate - today;
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return diffDays;
}

// Setup event listeners
function setupSavingsEventListeners() {
  // Add saving button
  const addBtn = document.getElementById("add-saving-btn");
  if (addBtn) {
    const newAddBtn = addBtn.cloneNode(true);
    addBtn.parentNode.replaceChild(newAddBtn, addBtn);
    newAddBtn.addEventListener("click", () => showSavingModal());
  }

  // Empty state add button
  const emptyStateBtn = document.querySelector(".empty-state .btn-add-saving");
  if (emptyStateBtn) {
    emptyStateBtn.addEventListener("click", () => showSavingModal());
  }

  // Add money buttons
  document.querySelectorAll(".add-saving-money").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const id = parseInt(btn.dataset.id);
      showAddMoneyModal(id);
    });
  });

  // Withdraw buttons
  document.querySelectorAll(".withdraw-saving").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const id = parseInt(btn.dataset.id);
      showWithdrawModal(id);
    });
  });

  // Edit buttons
  document.querySelectorAll(".edit-saving").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const id = parseInt(btn.dataset.id);
      showSavingModal(id);
    });
  });

  // Delete buttons
  document.querySelectorAll(".delete-saving").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const id = parseInt(btn.dataset.id);
      deleteSavingById(id);
    });
  });
}

// Show modal untuk tambah/edit tabungan
async function showSavingModal(savingId = null) {
  const isEdit = savingId !== null;
  let saving = null;

  if (isEdit) {
    saving = await getItem(STORES.SAVINGS, savingId);
    if (!saving) {
      showToast("Target tabungan tidak ditemukan", "error");
      return;
    }
  }

  const modalContent = `
        <form id="saving-form">
            <div class="form-group">
                <label>Nama Target <span class="required">*</span></label>
                <input type="text" id="saving-name" class="form-input" 
                       value="${isEdit ? escapeHtml(saving.name) : ""}" 
                       placeholder="Contoh: Liburan ke Bali, Beli HP Baru..." required>
            </div>
            
            <div class="form-group">
                <label>Target Nominal <span class="required">*</span></label>
                <input type="number" id="saving-target" class="form-input" 
                       value="${isEdit ? saving.targetAmount : ""}" 
                       placeholder="0" min="1" required>
            </div>
            
            <div class="form-group">
                <label>Jumlah Saat Ini</label>
                <input type="number" id="saving-current" class="form-input" 
                       value="${isEdit ? saving.currentAmount : 0}" 
                       placeholder="0" min="0">
                <small class="form-help">Jumlah yang sudah terkumpul saat ini</small>
            </div>
            
            <div class="form-group">
                <label>Deskripsi (Opsional)</label>
                <textarea id="saving-description" class="form-input" rows="2" 
                          placeholder="Tambahkan catatan untuk target ini...">${isEdit ? escapeHtml(saving.description || "") : ""}</textarea>
            </div>
            
            <div class="form-group">
                <label>Target Tanggal (Opsional)</label>
                <input type="date" id="saving-deadline" class="form-input" 
                       value="${isEdit ? saving.deadline || "" : ""}">
                <small class="form-help">Kapan target ini ingin dicapai?</small>
            </div>
            
            <div class="modal-buttons">
                <button type="button" class="btn-secondary modal-close-btn">Batal</button>
                <button type="submit" class="btn-primary">${isEdit ? "Simpan Perubahan" : "Buat Target"}</button>
            </div>
        </form>
    `;

  // Create modal
  const modal = document.createElement("div");
  modal.className = "modal-overlay";
  modal.innerHTML = `
        <div class="modal-container modal-medium">
            <div class="modal-header">
                <h3><i class="fas ${isEdit ? "fa-edit" : "fa-plus-circle"}"></i> ${isEdit ? "Edit Target Tabungan" : "Target Tabungan Baru"}</h3>
                <button class="modal-close-btn modal-close-x">&times;</button>
            </div>
            <div class="modal-body">
                ${modalContent}
            </div>
        </div>
    `;

  document.body.appendChild(modal);

  // Handle form submission
  const form = modal.querySelector("#saving-form");
  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const name = modal.querySelector("#saving-name").value.trim();
    const targetAmount = parseInt(modal.querySelector("#saving-target").value);
    let currentAmount =
      parseInt(modal.querySelector("#saving-current").value) || 0;
    const description = modal.querySelector("#saving-description").value;
    const deadline = modal.querySelector("#saving-deadline").value;

    if (!name) {
      showToast("Nama target harus diisi", "error");
      return;
    }

    if (!targetAmount || targetAmount <= 0) {
      showToast("Target nominal harus lebih dari 0", "error");
      return;
    }

    if (currentAmount > targetAmount) {
      currentAmount = targetAmount;
    }

    if (isEdit) {
      // Update existing saving
      saving.name = name;
      saving.targetAmount = targetAmount;
      saving.currentAmount = currentAmount;
      saving.description = description;
      saving.deadline = deadline;
      saving.updatedAt = getCurrentDateTime().datetime;

      await updateItem(STORES.SAVINGS, saving);
      showToast("Target tabungan berhasil diupdate", "success");
    } else {
      // Create new saving
      const newSaving = {
        name: name,
        targetAmount: targetAmount,
        currentAmount: currentAmount,
        description: description,
        deadline: deadline,
        status: currentAmount >= targetAmount ? "completed" : "active",
        icon: "fa-piggy-bank",
        createdAt: getCurrentDateTime().datetime,
        updatedAt: getCurrentDateTime().datetime,
      };

      await addItem(STORES.SAVINGS, newSaving);
      showToast("Target tabungan berhasil dibuat", "success");
    }

    modal.remove();
    await renderSavingsPage();
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

// Show modal untuk tambah uang ke tabungan
async function showAddMoneyModal(savingId) {
  const saving = await getItem(STORES.SAVINGS, savingId);
  if (!saving) {
    showToast("Target tabungan tidak ditemukan", "error");
    return;
  }

  const remaining = saving.targetAmount - saving.currentAmount;
  if (remaining <= 0) {
    showToast("Target sudah tercapai!", "info");
    return;
  }

  const modalContent = `
        <form id="add-money-form">
            <div class="form-group">
                <label>Target: ${escapeHtml(saving.name)}</label>
                <div class="info-box">
                    <div>Target: ${formatCurrency(saving.targetAmount)}</div>
                    <div>Terkumpul: ${formatCurrency(saving.currentAmount)}</div>
                    <div>Sisa: ${formatCurrency(remaining)}</div>
                </div>
            </div>
            
            <div class="form-group">
                <label>Jumlah yang Ditambahkan <span class="required">*</span></label>
                <input type="number" id="add-amount" class="form-input" 
                       placeholder="0" min="1" max="${remaining}" required>
                <small class="form-help">Maksimal: ${formatCurrency(remaining)}</small>
            </div>
            
            <div class="form-group">
                <label>Catatan (Opsional)</label>
                <textarea id="add-note" class="form-input" rows="2" 
                          placeholder="Catatan untuk penambahan ini..."></textarea>
            </div>
            
            <div class="modal-buttons">
                <button type="button" class="btn-secondary modal-close-btn">Batal</button>
                <button type="submit" class="btn-primary">Tambah Tabungan</button>
            </div>
        </form>
    `;

  const modal = document.createElement("div");
  modal.className = "modal-overlay";
  modal.innerHTML = `
        <div class="modal-container modal-small">
            <div class="modal-header">
                <h3><i class="fas fa-plus-circle"></i> Tambah Tabungan</h3>
                <button class="modal-close-btn modal-close-x">&times;</button>
            </div>
            <div class="modal-body">
                ${modalContent}
            </div>
        </div>
    `;

  document.body.appendChild(modal);

  const form = modal.querySelector("#add-money-form");
  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const amount = parseInt(modal.querySelector("#add-amount").value);
    const note = modal.querySelector("#add-note").value;

    if (!amount || amount <= 0) {
      showToast("Jumlah harus lebih dari 0", "error");
      return;
    }

    if (amount > remaining) {
      showToast(
        `Jumlah melebihi sisa target (${formatCurrency(remaining)})`,
        "error",
      );
      return;
    }

    // Update saving
    saving.currentAmount += amount;
    saving.status =
      saving.currentAmount >= saving.targetAmount ? "completed" : "active";
    saving.updatedAt = getCurrentDateTime().datetime;

    // Record transaction history (optional, store in savings_history)
    if (!saving.history) saving.history = [];
    saving.history.push({
      type: "deposit",
      amount: amount,
      note: note,
      date: getCurrentDateTime().datetime,
      previousAmount: saving.currentAmount - amount,
      newAmount: saving.currentAmount,
    });

    await updateItem(STORES.SAVINGS, saving);

    showToast(
      `Berhasil menambahkan ${formatCurrency(amount)} ke tabungan`,
      "success",
    );
    modal.remove();
    await renderSavingsPage();
  });

  const closeModal = () => modal.remove();
  modal.querySelectorAll(".modal-close-btn").forEach((btn) => {
    btn.addEventListener("click", closeModal);
  });
  modal.addEventListener("click", (e) => {
    if (e.target === modal) closeModal();
  });
}

// Show modal untuk ambil uang dari tabungan
async function showWithdrawModal(savingId) {
  const saving = await getItem(STORES.SAVINGS, savingId);
  if (!saving) {
    showToast("Target tabungan tidak ditemukan", "error");
    return;
  }

  if (saving.currentAmount <= 0) {
    showToast("Tidak ada saldo untuk diambil", "info");
    return;
  }

  const modalContent = `
        <form id="withdraw-form">
            <div class="form-group">
                <label>Target: ${escapeHtml(saving.name)}</label>
                <div class="info-box">
                    <div>Target: ${formatCurrency(saving.targetAmount)}</div>
                    <div>Terkumpul: ${formatCurrency(saving.currentAmount)}</div>
                </div>
            </div>
            
            <div class="form-group">
                <label>Jumlah yang Diambil <span class="required">*</span></label>
                <input type="number" id="withdraw-amount" class="form-input" 
                       placeholder="0" min="1" max="${saving.currentAmount}" required>
                <small class="form-help">Maksimal: ${formatCurrency(saving.currentAmount)}</small>
            </div>
            
            <div class="form-group">
                <label>Catatan (Opsional)</label>
                <textarea id="withdraw-note" class="form-input" rows="2" 
                          placeholder="Catatan untuk pengambilan ini..."></textarea>
            </div>
            
            <div class="modal-buttons">
                <button type="button" class="btn-secondary modal-close-btn">Batal</button>
                <button type="submit" class="btn-primary">Ambil Tabungan</button>
            </div>
        </form>
    `;

  const modal = document.createElement("div");
  modal.className = "modal-overlay";
  modal.innerHTML = `
        <div class="modal-container modal-small">
            <div class="modal-header">
                <h3><i class="fas fa-minus-circle"></i> Ambil Tabungan</h3>
                <button class="modal-close-btn modal-close-x">&times;</button>
            </div>
            <div class="modal-body">
                ${modalContent}
            </div>
        </div>
    `;

  document.body.appendChild(modal);

  const form = modal.querySelector("#withdraw-form");
  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const amount = parseInt(modal.querySelector("#withdraw-amount").value);
    const note = modal.querySelector("#withdraw-note").value;

    if (!amount || amount <= 0) {
      showToast("Jumlah harus lebih dari 0", "error");
      return;
    }

    if (amount > saving.currentAmount) {
      showToast(
        `Jumlah melebihi saldo (${formatCurrency(saving.currentAmount)})`,
        "error",
      );
      return;
    }

    // Update saving
    saving.currentAmount -= amount;
    saving.status =
      saving.currentAmount >= saving.targetAmount ? "completed" : "active";
    saving.updatedAt = getCurrentDateTime().datetime;

    // Record transaction history
    if (!saving.history) saving.history = [];
    saving.history.push({
      type: "withdraw",
      amount: amount,
      note: note,
      date: getCurrentDateTime().datetime,
      previousAmount: saving.currentAmount + amount,
      newAmount: saving.currentAmount,
    });

    await updateItem(STORES.SAVINGS, saving);

    showToast(
      `Berhasil mengambil ${formatCurrency(amount)} dari tabungan`,
      "success",
    );
    modal.remove();
    await renderSavingsPage();
  });

  const closeModal = () => modal.remove();
  modal.querySelectorAll(".modal-close-btn").forEach((btn) => {
    btn.addEventListener("click", closeModal);
  });
  modal.addEventListener("click", (e) => {
    if (e.target === modal) closeModal();
  });
}

// Delete saving
async function deleteSavingById(id) {
  confirmDialog(
    "Apakah Anda yakin ingin menghapus target tabungan ini?",
    async (confirmed) => {
      if (confirmed) {
        await deleteItem(STORES.SAVINGS, id);
        showToast("Target tabungan berhasil dihapus", "success");
        await renderSavingsPage();
      }
    },
  );
}

// Add styles for savings page
function addSavingsStyles() {
  if (document.getElementById("savings-styles")) return;

  const style = document.createElement("style");
  style.id = "savings-styles";
  style.textContent = `
        .savings-container {
            max-width: 1000px;
            margin: 0 auto;
        }
        
        .overall-progress-card {
            background: linear-gradient(135deg, #8b5cf6 0%, #6366f1 100%);
            color: white;
            margin-bottom: 24px;
            text-align: center;
        }
        
        .progress-header {
            font-size: 0.875rem;
            opacity: 0.9;
            margin-bottom: 16px;
        }
        
        .progress-stats {
            display: flex;
            justify-content: center;
            gap: 32px;
            margin-bottom: 16px;
        }
        
        .progress-stats .stat {
            text-align: center;
        }
        
        .progress-stats .stat-label {
            display: block;
            font-size: 0.7rem;
            opacity: 0.8;
            margin-bottom: 4px;
        }
        
        .progress-stats .stat-value {
            font-size: 1.1rem;
            font-weight: 600;
        }
        
        .progress-bar-container {
            background: rgba(255,255,255,0.3);
            border-radius: 20px;
            height: 10px;
            overflow: hidden;
            margin: 16px 0;
        }
        
        .progress-fill {
            background: white;
            height: 100%;
            border-radius: 20px;
            transition: width 0.3s ease;
        }
        
        .progress-fill.completed {
            background: #10b981;
        }
        
        .progress-percentage {
            font-size: 0.8rem;
            font-weight: 500;
        }
        
        .saving-card {
            background: var(--bg-secondary);
            border-radius: 16px;
            margin-bottom: 16px;
            overflow: hidden;
            box-shadow: var(--card-shadow);
        }
        
        .saving-card-header {
            display: flex;
            align-items: center;
            gap: 15px;
            padding: 16px;
            background: var(--bg-primary);
            border-bottom: 1px solid var(--border-color);
            flex-wrap: wrap;
        }
        
        .saving-icon {
            width: 50px;
            height: 50px;
            border-radius: 14px;
            background: rgba(139, 92, 246, 0.1);
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 1.5rem;
            color: #8b5cf6;
        }
        
        .saving-info {
            flex: 1;
            min-width: 150px;
        }
        
        .saving-info h3 {
            font-size: 1rem;
            margin-bottom: 4px;
        }
        
        .saving-description {
            font-size: 0.75rem;
            color: var(--text-secondary);
        }
        
        .saving-actions {
            display: flex;
            gap: 5px;
        }
        
        .saving-card-body {
            padding: 16px;
        }
        
        .saving-amounts {
            display: flex;
            justify-content: space-between;
            margin-bottom: 16px;
            flex-wrap: wrap;
            gap: 12px;
        }
        
        .amount-item {
            text-align: center;
            flex: 1;
        }
        
        .amount-label {
            display: block;
            font-size: 0.7rem;
            color: var(--text-secondary);
            margin-bottom: 4px;
        }
        
        .amount-value {
            font-size: 1rem;
            font-weight: 600;
        }
        
        .amount-value.completed {
            color: #10b981;
        }
        
        .saving-footer {
            display: flex;
            justify-content: space-between;
            margin-top: 12px;
            font-size: 0.7rem;
            flex-wrap: wrap;
            gap: 8px;
        }
        
        .progress-text {
            color: var(--info);
        }
        
        .deadline {
            color: var(--text-secondary);
        }
        
        .deadline.urgent {
            color: #f59e0b;
        }
        
        .deadline.expired {
            color: #ef4444;
        }
        
        .info-box {
            background: var(--bg-primary);
            padding: 12px;
            border-radius: 10px;
            margin: 10px 0;
            font-size: 0.85rem;
        }
        
        .modal-small {
            max-width: 400px;
            width: 95%;
        }
        
        .btn-add-saving {
            background: #8b5cf6;
        }
        
        @media (max-width: 768px) {
            .saving-card-header {
                flex-direction: column;
                text-align: center;
            }
            
            .saving-actions {
                justify-content: center;
            }
            
            .saving-amounts {
                flex-direction: column;
                gap: 8px;
            }
            
            .progress-stats {
                gap: 16px;
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
