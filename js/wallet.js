// Wallet Component
// Mengelola semua operasi terkait dompet/wallet

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
  showToast,
  confirmDialog,
  capitalize,
} from "./utils.js";

// State
let allWallets = [];

// Daftar ID dompet default yang tidak boleh dihapus
const DEFAULT_WALLET_IDS = [
  "wallet_1",
  "wallet_2",
  "wallet_3",
  "wallet_4",
  "wallet_5",
  "wallet_6",
];

// Wallet icons mapping
const walletIcons = {
  cash: ["fa-money-bill-wave", "fa-coins", "fa-hand-holding-usd"],
  ewallet: ["fa-mobile-alt", "fa-qrcode", "fa-credit-card"],
  bank: ["fa-university", "fa-building-columns", "fa-credit-card"],
};

const walletColors = [
  "#10b981",
  "#3b82f6",
  "#ef4444",
  "#f59e0b",
  "#8b5cf6",
  "#ec4899",
  "#06b6d4",
  "#84cc16",
  "#f97316",
  "#6366f1",
];

// Render halaman dompet utama
export async function renderWalletsPage() {
  const container = document.getElementById("page-content");
  if (!container) return;

  // Load semua dompet
  await loadWallets();

  // Hitung total saldo
  const totalBalance = allWallets.reduce((sum, w) => sum + w.balance, 0);

  // HTML Template
  container.innerHTML = `
        <div class="wallets-container">
            <!-- Header -->
            <div class="page-header">
                <h1><i class="fas fa-wallet"></i> Dompet Saya</h1>
                <button class="btn-primary btn-add-wallet" id="add-wallet-btn">
                    <i class="fas fa-plus"></i> Tambah Dompet
                </button>
            </div>
            
            <!-- Total Balance Card -->
            <div class="total-balance-card card">
                <div class="total-balance-header">
                    <i class="fas fa-chart-line"></i>
                    <span>Total Seluruh Saldo</span>
                </div>
                <div class="total-balance-amount">${formatCurrency(totalBalance)}</div>
                <div class="total-balance-footer">
                    <span>📊 ${allWallets.length} Dompet Aktif</span>
                </div>
            </div>
            
            <!-- Wallets Grid -->
            <div class="wallets-grid" id="wallets-grid">
                ${renderWalletsGrid()}
            </div>
        </div>
    `;

  // Setup event listeners
  setupWalletEventListeners();

  // Add styles if not exists
  addWalletStyles();
}

// Load semua dompet dari database
async function loadWallets() {
  allWallets = await getAllItems(STORES.WALLETS);
  // Sort: default wallets first, then custom wallets
  allWallets.sort((a, b) => {
    const aIsDefault = DEFAULT_WALLET_IDS.includes(a.id);
    const bIsDefault = DEFAULT_WALLET_IDS.includes(b.id);
    if (aIsDefault && !bIsDefault) return -1;
    if (!aIsDefault && bIsDefault) return 1;
    return a.name.localeCompare(b.name);
  });
}

// Render grid dompet
function renderWalletsGrid() {
  if (allWallets.length === 0) {
    return `
            <div class="empty-state">
                <i class="fas fa-wallet"></i>
                <p>Belum ada dompet</p>
                <button class="btn-primary btn-add-wallet">Tambah Dompet Sekarang</button>
            </div>
        `;
  }

  // Group wallets by type
  const cashWallets = allWallets.filter((w) => w.type === "cash");
  const ewalletWallets = allWallets.filter((w) => w.type === "ewallet");
  const bankWallets = allWallets.filter((w) => w.type === "bank");

  let html = "";

  // Cash Section
  if (cashWallets.length > 0) {
    html += `
            <div class="wallet-section">
                <div class="section-header">
                    <i class="fas fa-money-bill-wave"></i>
                    <h3>Tunai</h3>
                    <span class="section-count">${cashWallets.length} dompet</span>
                </div>
                <div class="wallet-cards">
                    ${cashWallets.map((w) => renderWalletCard(w)).join("")}
                </div>
            </div>
        `;
  }

  // E-Wallet Section
  if (ewalletWallets.length > 0) {
    html += `
            <div class="wallet-section">
                <div class="section-header">
                    <i class="fas fa-mobile-alt"></i>
                    <h3>E-Wallet</h3>
                    <span class="section-count">${ewalletWallets.length} dompet</span>
                </div>
                <div class="wallet-cards">
                    ${ewalletWallets.map((w) => renderWalletCard(w)).join("")}
                </div>
            </div>
        `;
  }

  // Bank Section
  if (bankWallets.length > 0) {
    html += `
            <div class="wallet-section">
                <div class="section-header">
                    <i class="fas fa-university"></i>
                    <h3>Bank</h3>
                    <span class="section-count">${bankWallets.length} dompet</span>
                </div>
                <div class="wallet-cards">
                    ${bankWallets.map((w) => renderWalletCard(w)).join("")}
                </div>
            </div>
        `;
  }

  return html;
}

// Render single wallet card
function renderWalletCard(wallet) {
  const balanceClass = wallet.balance >= 0 ? "positive" : "negative";
  const isDefault = DEFAULT_WALLET_IDS.includes(wallet.id);

  return `
        <div class="wallet-card" data-id="${wallet.id}">
            <div class="wallet-card-header" style="background: ${wallet.color}15; border-left: 4px solid ${wallet.color}">
                <div class="wallet-card-icon" style="color: ${wallet.color}">
                    <i class="fas ${wallet.icon || "fa-wallet"}"></i>
                </div>
                <div class="wallet-card-info">
                    <div class="wallet-name-row">
                        <h4>${escapeHtml(wallet.name)}</h4>
                        ${isDefault ? '<span class="default-badge">Default</span>' : ""}
                    </div>
                    <span class="wallet-type-badge">${getWalletTypeName(wallet.type)}</span>
                </div>
                <div class="wallet-card-actions">
                    <button class="icon-btn edit-wallet" data-id="${wallet.id}" title="Edit Dompet">
                        <i class="fas fa-edit"></i>
                    </button>
                    ${
                      !isDefault
                        ? `
                        <button class="icon-btn delete-wallet" data-id="${wallet.id}" title="Hapus Dompet">
                            <i class="fas fa-trash"></i>
                        </button>
                    `
                        : ""
                    }
                </div>
            </div>
            <div class="wallet-card-body">
                <div class="wallet-balance">
                <span class="balance-label">Saldo saat ini</span>
                <span class="balance-amount ${balanceClass}">${formatCurrency(wallet.balance)}</span>
                <button class="btn-edit-balance" data-id="${wallet.id}" style="margin-top:8px; padding:6px 12px; border-radius:8px; border:1px solid var(--border-color); background:var(--bg-primary); cursor:pointer; font-size:0.75rem; width:100%;">
                  <i class="fas fa-edit"></i> Edit Saldo
                </button>
            </div>
            </div>
        </div>
    `;
}

// Get wallet type name in Indonesian
function getWalletTypeName(type) {
  const types = {
    cash: "Tunai",
    ewallet: "E-Wallet",
    bank: "Transfer Bank",
  };
  return types[type] || type;
}

// Setup event listeners
function setupWalletEventListeners() {
  // Add wallet button
  const addBtn = document.getElementById("add-wallet-btn");
  if (addBtn) {
    // Remove existing listener to avoid duplicates
    const newAddBtn = addBtn.cloneNode(true);
    addBtn.parentNode.replaceChild(newAddBtn, addBtn);
    newAddBtn.addEventListener("click", () => showWalletModal());
  }

  // Also handle empty state add button
  const emptyStateAddBtn = document.querySelector(
    ".empty-state .btn-add-wallet",
  );
  if (emptyStateAddBtn) {
    emptyStateAddBtn.addEventListener("click", () => showWalletModal());
  }

  // Edit wallet buttons
  document.querySelectorAll(".edit-wallet").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const id = btn.dataset.id;
      editWallet(id);
    });
  });

  // Delete wallet buttons
  document.querySelectorAll(".delete-wallet").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const id = btn.dataset.id;
      deleteWalletById(id);
    });
  });

  // Edit balance buttons
  document.querySelectorAll(".btn-edit-balance").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const id = btn.dataset.id;
      editWalletBalance(id);
    });
  });
}

// Show modal untuk tambah/edit dompet
async function showWalletModal(walletId = null) {
  const isEdit = walletId !== null;
  let wallet = null;

  if (isEdit) {
    wallet = await getItem(STORES.WALLETS, walletId);
    if (!wallet) {
      showToast("Dompet tidak ditemukan", "error");
      return;
    }
  }

  const modalContent = `
        <form id="wallet-form">
            <div class="form-group">
                <label>Nama Dompet <span class="required">*</span></label>
                <input type="text" id="wallet-name" class="form-input" 
                       value="${isEdit ? escapeHtml(wallet.name) : ""}" 
                       placeholder="Contoh: Tunai, OVO, BCA..." required>
            </div>
            
            <div class="form-group">
                <label>Tipe Dompet <span class="required">*</span></label>
                <div class="type-selector">
                    <button type="button" class="type-btn ${!isEdit || wallet.type === "cash" ? "active" : ""}" data-type="cash">
                        <i class="fas fa-money-bill-wave"></i> Tunai
                    </button>
                    <button type="button" class="type-btn ${isEdit && wallet.type === "ewallet" ? "active" : ""}" data-type="ewallet">
                        <i class="fas fa-mobile-alt"></i> E-Wallet
                    </button>
                    <button type="button" class="type-btn ${isEdit && wallet.type === "bank" ? "active" : ""}" data-type="bank">
                        <i class="fas fa-university"></i> Bank
                    </button>
                </div>
                <input type="hidden" id="wallet-type" value="${isEdit ? wallet.type : "cash"}">
            </div>
            
            <div class="form-group">
                <label>Icon</label>
                <div class="icon-selector" id="icon-selector">
                    ${generateIconOptions(isEdit ? wallet.icon : "fa-wallet")}
                </div>
                <input type="hidden" id="wallet-icon" value="${isEdit ? wallet.icon || "fa-wallet" : "fa-wallet"}">
            </div>
            
            <div class="form-group">
                <label>Warna</label>
                <div class="color-selector" id="color-selector">
                    ${generateColorOptions(isEdit ? wallet.color : "#3b82f6")}
                </div>
                <input type="hidden" id="wallet-color" value="${isEdit ? wallet.color : "#3b82f6"}">
            </div>
            
            <div class="form-group">
                <label>Saldo Awal</label>
                <input type="number" id="wallet-balance" class="form-input" 
                       value="${isEdit ? wallet.balance : 0}" 
                       placeholder="0" min="0" step="1000">
                <small class="form-help">Saldo awal hanya untuk dompet baru. Untuk dompet yang sudah ada, edit saldo melalui transaksi.</small>
            </div>
            
            <div class="modal-buttons">
                <button type="button" class="btn-secondary modal-close-btn">Batal</button>
                <button type="submit" class="btn-primary">${isEdit ? "Simpan Perubahan" : "Tambah Dompet"}</button>
            </div>
        </form>
    `;

  // Create modal
  const modal = document.createElement("div");
  modal.className = "modal-overlay";
  modal.innerHTML = `
        <div class="modal-container modal-medium">
            <div class="modal-header">
                <h3><i class="fas ${isEdit ? "fa-edit" : "fa-plus-circle"}"></i> ${isEdit ? "Edit Dompet" : "Tambah Dompet Baru"}</h3>
                <button class="modal-close-btn modal-close-x">&times;</button>
            </div>
            <div class="modal-body">
                ${modalContent}
            </div>
        </div>
    `;

  document.body.appendChild(modal);

  // Add styles for modal
  addWalletModalStyles();

  // Setup type selector
  const typeBtns = modal.querySelectorAll(".type-btn");
  const typeInput = modal.querySelector("#wallet-type");

  typeBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      typeBtns.forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      typeInput.value = btn.dataset.type;
    });
  });

  // Setup icon selector
  const iconBtns = modal.querySelectorAll(".icon-option");
  const iconInput = modal.querySelector("#wallet-icon");

  iconBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      iconBtns.forEach((b) => b.classList.remove("selected"));
      btn.classList.add("selected");
      iconInput.value = btn.dataset.icon;
    });
  });

  // Setup color selector
  const colorBtns = modal.querySelectorAll(".color-option");
  const colorInput = modal.querySelector("#wallet-color");

  colorBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      colorBtns.forEach((b) => b.classList.remove("selected"));
      btn.classList.add("selected");
      colorInput.value = btn.dataset.color;
    });
  });

  // Handle form submission
  const form = modal.querySelector("#wallet-form");
  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const name = modal.querySelector("#wallet-name").value.trim();
    const type = typeInput.value;
    const icon = iconInput.value;
    const color = colorInput.value;
    const balance = parseInt(modal.querySelector("#wallet-balance").value) || 0;

    if (!name) {
      showToast("Nama dompet harus diisi", "error");
      return;
    }

    if (isEdit) {
      // Update existing wallet (only name, icon, color - not balance and type for existing)
      const oldWallet = wallet;

      // Check if name already exists (excluding current wallet)
      const existingWallet = allWallets.find(
        (w) =>
          w.id !== wallet.id && w.name.toLowerCase() === name.toLowerCase(),
      );
      if (existingWallet) {
        showToast("Nama dompet sudah ada!", "error");
        return;
      }

      wallet.name = capitalize(name);
      wallet.icon = icon;
      wallet.color = color;
      // Don't update type and balance for existing wallets to maintain data integrity

      await updateItem(STORES.WALLETS, wallet);
      showToast("Dompet berhasil diupdate", "success");
    } else {
      // Check if wallet with same name exists
      const existingWallet = allWallets.find(
        (w) => w.name.toLowerCase() === name.toLowerCase(),
      );
      if (existingWallet) {
        showToast("Nama dompet sudah ada!", "error");
        return;
      }

      // Create new wallet
      const newWallet = {
        id: `wallet_custom_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
        name: capitalize(name),
        type: type,
        icon: icon,
        color: color,
        balance: balance,
      };

      await addItem(STORES.WALLETS, newWallet);
      showToast("Dompet berhasil ditambahkan", "success");
    }

    modal.remove();
    await renderWalletsPage();

    // Refresh dashboard if needed
    if (window.renderDashboard) {
      await window.renderDashboard();
    }
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

// Generate icon options for selector
function generateIconOptions(selectedIcon) {
  const allIcons = [
    "fa-wallet",
    "fa-money-bill-wave",
    "fa-coins",
    "fa-hand-holding-usd",
    "fa-mobile-alt",
    "fa-qrcode",
    "fa-credit-card",
    "fa-university",
    "fa-building-columns",
    "fa-piggy-bank",
    "fa-sack-dollar",
    "fa-chart-line",
  ];

  return allIcons
    .map(
      (icon) => `
        <button type="button" class="icon-option ${icon === selectedIcon ? "selected" : ""}" data-icon="${icon}">
            <i class="fas ${icon}"></i>
        </button>
    `,
    )
    .join("");
}

// Generate color options for selector
function generateColorOptions(selectedColor) {
  return walletColors
    .map(
      (color) => `
        <button type="button" class="color-option ${color === selectedColor ? "selected" : ""}" 
                data-color="${color}" style="background: ${color}">
        </button>
    `,
    )
    .join("");
}

// Edit wallet
async function editWallet(id) {
  await showWalletModal(id);
}

// Edit wallet balance langsung
async function editWalletBalance(id) {
  const wallet = await getItem(STORES.WALLETS, id);
  if (!wallet) {
    showToast("Dompet tidak ditemukan", "error");
    return;
  }

  const modal = document.createElement("div");
  modal.className = "modal-overlay";
  modal.innerHTML = `
    <div class="modal-container" style="max-width:360px;width:95%;">
      <div class="modal-header">
        <h3><i class="fas fa-edit"></i> Edit Saldo — ${escapeHtml(wallet.name)}</h3>
        <button class="modal-close-x" style="background:none;border:none;font-size:24px;cursor:pointer;">&times;</button>
      </div>
      <div class="modal-body">
        <p style="font-size:0.8rem;color:var(--text-secondary);margin-bottom:16px;">
          ⚠️ Mengubah saldo secara langsung. Riwayat transaksi tidak terpengaruh.
        </p>
        <div class="form-group">
          <label>Saldo Baru (Rp)</label>
          <input type="number" id="new-balance-input" class="form-input"
            value="${wallet.balance}" min="0" style="width:100%;padding:10px;border:1px solid var(--border-color);border-radius:8px;background:var(--bg-primary);color:var(--text-primary);">
        </div>
        <div style="display:flex;gap:12px;margin-top:20px;">
          <button class="btn-secondary modal-cancel" style="flex:1;padding:10px;border-radius:8px;cursor:pointer;border:none;">Batal</button>
          <button id="save-balance-btn" class="btn-primary" style="flex:1;padding:10px;border-radius:8px;cursor:pointer;border:none;background:var(--info);color:white;">Simpan</button>
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  const closeModal = () => modal.remove();
  modal.querySelector(".modal-close-x").addEventListener("click", closeModal);
  modal.querySelector(".modal-cancel").addEventListener("click", closeModal);
  modal.addEventListener("click", (e) => {
    if (e.target === modal) closeModal();
  });

  modal
    .querySelector("#save-balance-btn")
    .addEventListener("click", async () => {
      const input = modal.querySelector("#new-balance-input");
      const newBalance = parseInt(input.value);
      if (isNaN(newBalance) || newBalance < 0) {
        showToast("Saldo tidak valid", "error");
        return;
      }
      wallet.balance = newBalance;
      await updateItem(STORES.WALLETS, wallet);
      showToast(`Saldo ${wallet.name} diperbarui`, "success");
      closeModal();
      await renderWalletsPage();
      if (window.renderDashboard) await window.renderDashboard();
    });
}

// Delete wallet
async function deleteWalletById(id) {
  // Cek apakah dompet default
  if (DEFAULT_WALLET_IDS.includes(id)) {
    showToast("Dompet default tidak dapat dihapus!", "error");
    return;
  }

  // Cek apakah dompet memiliki transaksi
  const transactions = await getAllItems(STORES.TRANSACTIONS);
  const hasTransactions = transactions.some((t) => t.walletId === id);

  if (hasTransactions) {
    showToast("Tidak dapat menghapus dompet yang memiliki transaksi!", "error");
    return;
  }

  confirmDialog(
    "Apakah Anda yakin ingin menghapus dompet ini?",
    async (confirmed) => {
      if (confirmed) {
        try {
          await deleteItem(STORES.WALLETS, id);
          showToast("Dompet berhasil dihapus", "success");
          await renderWalletsPage();

          // Refresh dashboard
          if (window.renderDashboard) {
            await window.renderDashboard();
          }
        } catch (error) {
          console.error("Delete error:", error);
          showToast("Gagal menghapus dompet", "error");
        }
      }
    },
  );
}

// Add main wallet page styles
function addWalletStyles() {
  if (document.getElementById("wallet-main-styles")) return;

  const style = document.createElement("style");
  style.id = "wallet-main-styles";
  style.textContent = `
        .wallets-container {
            max-width: 1200px;
            margin: 0 auto;
        }
        
        .total-balance-card {
            background: linear-gradient(135deg, var(--info) 0%, var(--purple) 100%);
            color: white;
            text-align: center;
            margin-bottom: 24px;
        }
        
        .total-balance-header {
            font-size: 0.875rem;
            opacity: 0.9;
            margin-bottom: 8px;
        }
        
        .total-balance-amount {
            font-size: 2rem;
            font-weight: 700;
            margin-bottom: 8px;
        }
        
        .total-balance-footer {
            font-size: 0.75rem;
            opacity: 0.8;
        }
        
        .wallet-section {
            margin-bottom: 28px;
        }
        
        .section-header {
            display: flex;
            align-items: center;
            gap: 10px;
            margin-bottom: 16px;
            padding: 0 8px 0 0;
            border-bottom: 2px solid var(--border-color);
            padding-bottom: 8px;
        }
        
        .section-header i {
            font-size: 1.2rem;
            color: var(--info);
        }
        
        .section-header h3 {
            font-size: 1rem;
            font-weight: 600;
            margin: 0;
        }
        
        .section-count {
            font-size: 0.7rem;
            color: var(--text-secondary);
            background: var(--border-color);
            padding: 2px 8px;
            border-radius: 20px;
        }
        
        .wallet-cards {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
            gap: 16px;
        }
        
        .wallet-card {
            background: var(--bg-secondary);
            border-radius: 16px;
            overflow: hidden;
            box-shadow: var(--card-shadow);
            transition: transform 0.2s ease, box-shadow 0.2s ease;
        }
        
        .wallet-card:hover {
            transform: translateY(-3px);
            box-shadow: 0 8px 24px rgba(0,0,0,0.12);
        }
        
        .wallet-card-header {
            display: flex;
            align-items: center;
            gap: 12px;
            padding: 16px;
        }
        
        .wallet-card-icon {
            width: 50px;
            height: 50px;
            border-radius: 14px;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 1.4rem;
            background: rgba(0,0,0,0.05);
        }
        
        .wallet-card-info {
            flex: 1;
        }
        
        .wallet-name-row {
            display: flex;
            align-items: center;
            gap: 8px;
            flex-wrap: wrap;
            margin-bottom: 4px;
        }
        
        .wallet-name-row h4 {
            font-size: 1rem;
            margin: 0;
        }
        
        .default-badge {
            font-size: 0.6rem;
            padding: 2px 6px;
            border-radius: 20px;
            background: var(--info);
            color: white;
        }
        
        .wallet-type-badge {
            font-size: 0.7rem;
            padding: 2px 8px;
            border-radius: 20px;
            background: var(--border-color);
            display: inline-block;
        }
        
        .wallet-card-actions {
            display: flex;
            gap: 4px;
        }
        
        .wallet-card-body {
            padding: 16px;
            border-top: 1px solid var(--border-color);
        }
        
        .wallet-balance {
            text-align: center;
        }
        
        .balance-label {
            display: block;
            font-size: 0.7rem;
            color: var(--text-secondary);
            margin-bottom: 6px;
        }
        
        .balance-amount {
            font-size: 1.5rem;
            font-weight: 700;
        }
        
        .balance-amount.positive {
            color: #10b981;
        }
        
        .balance-amount.negative {
            color: #ef4444;
        }
        
        .form-help {
            display: block;
            font-size: 0.7rem;
            color: var(--text-secondary);
            margin-top: 4px;
        }
        
        @media (max-width: 768px) {
            .wallet-cards {
                grid-template-columns: 1fr;
            }
            
            .balance-amount {
                font-size: 1.2rem;
            }
            
            .wallet-card-icon {
                width: 40px;
                height: 40px;
                font-size: 1.1rem;
            }
            
            .section-header {
                margin-bottom: 12px;
            }
        }
    `;

  document.head.appendChild(style);
}

// Add modal styles
function addWalletModalStyles() {
  if (document.getElementById("wallet-modal-styles")) return;

  const style = document.createElement("style");
  style.id = "wallet-modal-styles";
  style.textContent = `
        .modal-medium {
            max-width: 480px;
            width: 95%;
        }
        
        .icon-selector {
            display: flex;
            flex-wrap: wrap;
            gap: 10px;
            margin-top: 8px;
        }
        
        .icon-option {
            width: 48px;
            height: 48px;
            border-radius: 12px;
            border: 2px solid var(--border-color);
            background: var(--bg-primary);
            cursor: pointer;
            font-size: 1.3rem;
            transition: all 0.2s ease;
            display: flex;
            align-items: center;
            justify-content: center;
        }
        
        .icon-option:hover {
            transform: scale(1.05);
        }
        
        .icon-option.selected {
            border-color: var(--info);
            background: var(--info);
            color: white;
        }
        
        .color-selector {
            display: flex;
            flex-wrap: wrap;
            gap: 12px;
            margin-top: 8px;
        }
        
        .color-option {
            width: 42px;
            height: 42px;
            border-radius: 50%;
            border: 3px solid var(--border-color);
            cursor: pointer;
            transition: all 0.2s ease;
        }
        
        .color-option:hover {
            transform: scale(1.1);
        }
        
        .color-option.selected {
            border-color: white;
            box-shadow: 0 0 0 2px var(--info);
            transform: scale(1.1);
        }
        
        .type-selector {
            display: flex;
            gap: 10px;
            margin-bottom: 10px;
        }
        
        .type-btn {
            flex: 1;
            padding: 10px;
            border: 1px solid var(--border-color);
            background: var(--bg-primary);
            border-radius: 10px;
            cursor: pointer;
            transition: all 0.3s ease;
            font-size: 0.85rem;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 6px;
        }
        
        .type-btn.active {
            background: var(--info);
            color: white;
            border-color: var(--info);
        }
        
        .modal-buttons {
            display: flex;
            gap: 12px;
            margin-top: 24px;
        }
        
        .modal-buttons button {
            flex: 1;
            padding: 12px;
            border-radius: 10px;
            cursor: pointer;
            font-size: 0.9rem;
            font-weight: 500;
        }
    `;

  document.head.appendChild(style);
}

// Helper function
function escapeHtml(text) {
  if (!text) return "";
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}
