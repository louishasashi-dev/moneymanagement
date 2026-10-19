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
  formatDate,
  getCurrentDateTime,
  showToast,
  confirmDialog,
  capitalize,
  formatMoneyInput,
  parseMoney,
} from "./utils.js";
import { ensureTxSheetStyles } from "./modal-sheet.js";

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

// Refresh dashboard HANYA jika dashboard sedang menjadi halaman aktif.
async function refreshDashboardIfActive() {
  if (
    window.renderDashboard &&
    window.getCurrentPage &&
    window.getCurrentPage() === "dashboard"
  ) {
    await window.renderDashboard();
  }
}

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
          <div class="wallet-desktop">
            <!-- Header -->
            <div class="page-header">
                <h1><i class="fas fa-wallet"></i> Dompet Saya</h1>
                <div class="wallet-header-actions">
                    <button class="btn-secondary" id="transfer-history-btn" title="Riwayat Transfer">
                        <i class="fas fa-clock-rotate-left"></i> Riwayat
                    </button>
                    <button class="btn-secondary" id="transfer-wallet-btn" title="Transfer Saldo">
                        <i class="fas fa-right-left"></i> Transfer
                    </button>
                    <button class="btn-primary btn-add-wallet" id="add-wallet-btn">
                        <i class="fas fa-plus"></i> Tambah
                    </button>
                </div>
            </div>
            
            <!-- Total Balance Card -->
            <div class="total-balance-card card">
                <div class="total-balance-header">
                    <span>Total Seluruh Saldo</span>
                </div>
                <div class="total-balance-amount">${formatCurrency(totalBalance)}</div>
                <div class="total-balance-footer">
                    <span>${allWallets.length} Dompet Aktif</span>
                </div>
            </div>
            
            <!-- Wallets Grid -->
            <div class="wallets-grid" id="wallets-grid">
                ${renderWalletsGrid()}
            </div>
          </div>

          <!-- Tampilan khusus mobile (<= 768px) -->
          ${renderMobileWallets(totalBalance)}
        </div>
    `;

  // Setup event listeners
  setupWalletEventListeners();

  // Add styles if not exists
  addWalletStyles();
  addWalletMobileStyles();
  scheduleWalletFullBleed();
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

// Urutan tampilan: dompet Tunai paling atas, sisanya dari saldo terbesar ke terkecil
function getSortedWalletsForDisplay() {
  return [...allWallets].sort((a, b) => {
    const aCash = a.type === "cash";
    const bCash = b.type === "cash";
    if (aCash !== bCash) return aCash ? -1 : 1;
    const diff = (b.balance || 0) - (a.balance || 0);
    return diff !== 0 ? diff : a.name.localeCompare(b.name);
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
  const sortedWallets = getSortedWalletsForDisplay();
  const cashWallets = sortedWallets.filter((w) => w.type === "cash");
  const ewalletWallets = sortedWallets.filter((w) => w.type === "ewallet");
  const bankWallets = sortedWallets.filter((w) => w.type === "bank");

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

// Render single wallet card (desktop)
function renderWalletCard(wallet) {
  const balanceClass = wallet.balance >= 0 ? "positive" : "negative";
  const isDefault = DEFAULT_WALLET_IDS.includes(wallet.id);
  const color = wallet.color || "#3b82f6";

  return `
        <div class="wallet-card" data-id="${wallet.id}" style="--wm-color: ${color}">
            <div class="wallet-card-header">
                <div class="wallet-card-icon ${wallet.photo ? "has-photo" : ""}">
                    ${
                      wallet.photo
                        ? `<img src="${wallet.photo}" alt="${escapeHtml(wallet.name)}">`
                        : `<i class="fas ${wallet.icon || "fa-wallet"}"></i>`
                    }
                </div>
                <div class="wallet-card-info">
                    <div class="wallet-name-row">
                        <h4>${escapeHtml(wallet.name)}</h4>
                        ${isDefault ? '<span class="default-badge">Default</span>' : ""}
                    </div>
                    <span class="wallet-type-badge">${escapeHtml(getWalletTypeName(wallet.type))}</span>
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
                    <button class="btn-edit-balance" data-id="${wallet.id}" type="button">
                        <i class="fas fa-edit"></i> Edit Saldo
                    </button>
                </div>
            </div>
        </div>
    `;
}

// ===== TAMPILAN MOBILE =====

// Singkat nominal besar: 894.849.000 -> "Rp 894,8 jt", 1,2 M (miliar), 1 T (triliun)
function formatCompactCurrency(value) {
  const n = Number(value) || 0;
  const abs = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  const units = [
    [1e12, "T"],
    [1e9, "M"],
    [1e6, "jt"],
  ];
  for (const [size, label] of units) {
    if (abs >= size) {
      const v = Math.floor((abs / size) * 10) / 10;
      const text = v.toFixed(1).replace(".", ",").replace(/,0$/, "");
      return `${sign}Rp ${text} ${label}`;
    }
  }
  return formatCurrency(n);
}

// Saldo di baris daftar mobile: tampil penuh; mulai 1 miliar disingkat agar nama tetap terbaca
function formatWalletAmount(value) {
  return Math.abs(Number(value) || 0) >= 1e9
    ? formatCompactCurrency(value)
    : formatCurrency(value);
}

// Buat header mobile benar-benar full (menembus padding #page-content)
function fitWalletMobileFullBleed() {
  const el = document.querySelector(".wallet-mobile");
  if (!el || getComputedStyle(el).display === "none") return;
  const hero = el.querySelector(".wm-hero");
  if (!hero) return;

  // Jarak hero ke tepi kiri/kanan layar
  const rect = hero.getBoundingClientRect();
  const vw = document.documentElement.clientWidth;

  // Total padding atas semua parent (agar background naik sampai tepi atas)
  let top = 0;
  for (
    let n = el.parentElement;
    n && n !== document.documentElement;
    n = n.parentElement
  ) {
    top += parseFloat(getComputedStyle(n).paddingTop) || 0;
  }

  el.style.setProperty("--wm-bleed-l", `${Math.max(0, rect.left)}px`);
  el.style.setProperty("--wm-bleed-r", `${Math.max(0, vw - rect.right)}px`);
  el.style.setProperty("--wm-bleed-t", `${top}px`);
}

// Jalankan ulang setelah layout/font selesai agar ukuran bleed akurat
function scheduleWalletFullBleed() {
  fitWalletMobileFullBleed();
  requestAnimationFrame(fitWalletMobileFullBleed);
  setTimeout(fitWalletMobileFullBleed, 150);
  setTimeout(fitWalletMobileFullBleed, 500);
}

if (!window.__walletFullBleedBound) {
  window.__walletFullBleedBound = true;
  window.addEventListener("resize", fitWalletMobileFullBleed);
}

// Pengelompokan daftar dompet mobile (sama dengan tampilan desktop)
const MOBILE_WALLET_GROUPS = [
  { type: "cash", title: "Tunai" },
  { type: "ewallet", title: "E-Wallet" },
  { type: "bank", title: "Bank" },
];

function renderMobileWalletSections() {
  const sorted = getSortedWalletsForDisplay();
  const knownTypes = MOBILE_WALLET_GROUPS.map((g) => g.type);
  const groups = MOBILE_WALLET_GROUPS.map((g) => ({
    title: g.title,
    wallets: sorted.filter((w) => w.type === g.type),
  }));
  const others = sorted.filter((w) => !knownTypes.includes(w.type));
  if (others.length > 0) groups.push({ title: "Lainnya", wallets: others });

  return groups
    .filter((g) => g.wallets.length > 0)
    .map(
      (g) => `
            <section class="wm-section">
                <div class="wm-section-head">
                    <h3>${g.title}</h3>
                    <span class="wm-section-count">${g.wallets.length} dompet</span>
                </div>
                <div class="wm-list-card">
                    ${g.wallets.map((w) => renderMobileWalletCard(w)).join("")}
                </div>
            </section>`,
    )
    .join("");
}

function renderMobileWallets(totalBalance) {
  const totalText = formatCurrency(totalBalance);
  return `
        <div class="wallet-mobile">
            <div class="wm-hero">
                <div class="wm-top">
                    <span class="wm-avatar"><i class="fas fa-wallet"></i></span>
                    <div class="wm-top-text">
                        <span class="wm-greet">Kelola saldo</span>
                        <h1 class="wm-title">Dompet Saya</h1>
                    </div>
                </div>

                <div class="wm-total">
                    <span class="wm-total-label">Total Seluruh Saldo</span>
                    <div class="wm-total-amount" style="--wm-chars: ${totalText.length}">${totalText}</div>
                    <span class="wm-count-chip">
                        <i class="fas fa-wallet"></i>
                        <span>${allWallets.length} Dompet Aktif</span>
                    </span>
                </div>

                <div class="wm-actions">
                    <button class="wm-action wm-action-primary" id="wm-add-btn" type="button">
                        <span class="wm-action-icon"><i class="fas fa-plus"></i></span>
                        <span class="wm-action-label">Tambah</span>
                    </button>
                    <button class="wm-action" id="wm-transfer-btn" type="button">
                        <span class="wm-action-icon"><i class="fas fa-right-left"></i></span>
                        <span class="wm-action-label">Transfer</span>
                    </button>
                    <button class="wm-action" id="wm-history-btn" type="button">
                        <span class="wm-action-icon"><i class="fas fa-clock-rotate-left"></i></span>
                        <span class="wm-action-label">Riwayat</span>
                    </button>
                </div>
            </div>

            <div class="wm-body">
            ${
              allWallets.length === 0
                ? `<div class="wm-empty">
                        <i class="fas fa-wallet"></i>
                        <p>Belum ada dompet</p>
                        <button class="wm-empty-btn" id="wm-empty-add-btn" type="button">Tambah Dompet Sekarang</button>
                   </div>`
                : renderMobileWalletSections()
            }
            </div>
        </div>
    `;
}

function renderMobileWalletCard(wallet) {
  const isDefault = DEFAULT_WALLET_IDS.includes(wallet.id);
  const color = wallet.color || "#3b82f6";
  const negative = wallet.balance < 0;

  return `
        <div class="wm-item" data-id="${wallet.id}" style="--wm-color: ${color}">
            <div class="wm-item-main">
                <div class="wm-item-icon ${wallet.photo ? "has-photo" : ""}">
                    ${
                      wallet.photo
                        ? `<img src="${wallet.photo}" alt="${escapeHtml(wallet.name)}">`
                        : `<i class="fas ${wallet.icon || "fa-wallet"}"></i>`
                    }
                </div>
                <div class="wm-item-info">
                    <div class="wm-item-name-row">
                        <span class="wm-item-name">${escapeHtml(wallet.name)}</span>
                        ${isDefault ? '<span class="wm-chip">Default</span>' : ""}
                    </div>
                    <span class="wm-item-sub">${escapeHtml(getWalletTypeName(wallet.type))}</span>
                </div>
                <span class="wm-item-balance ${negative ? "negative" : ""}" title="${formatCurrency(wallet.balance)}">${formatWalletAmount(wallet.balance)}</span>
            </div>
            <div class="wm-item-actions">
                <button class="wm-balance-btn btn-edit-balance" data-id="${wallet.id}" type="button">
                    <i class="fas fa-coins"></i> Edit Saldo
                </button>
                <div class="wm-item-tools">
                    <button class="wm-tool-btn edit-wallet" data-id="${wallet.id}" type="button" title="Edit Dompet" aria-label="Edit Dompet">
                        <i class="fas fa-pen-to-square"></i>
                    </button>
                    ${
                      !isDefault
                        ? `<button class="wm-tool-btn wm-tool-danger delete-wallet" data-id="${wallet.id}" type="button" title="Hapus Dompet" aria-label="Hapus Dompet">
                                <i class="fas fa-trash"></i>
                           </button>`
                        : ""
                    }
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
  // Transfer saldo button
  const transferBtn = document.getElementById("transfer-wallet-btn");
  if (transferBtn) {
    const newTransferBtn = transferBtn.cloneNode(true);
    transferBtn.parentNode.replaceChild(newTransferBtn, transferBtn);
    newTransferBtn.addEventListener("click", () => showTransferModal());
  }

  // Riwayat transfer button
  const historyBtn = document.getElementById("transfer-history-btn");
  if (historyBtn) {
    const newHistoryBtn = historyBtn.cloneNode(true);
    historyBtn.parentNode.replaceChild(newHistoryBtn, historyBtn);
    newHistoryBtn.addEventListener("click", () => showTransferHistoryModal());
  }

  // Tombol-tombol tampilan mobile
  const wmHistory = document.getElementById("wm-history-btn");
  if (wmHistory)
    wmHistory.addEventListener("click", () => showTransferHistoryModal());
  const wmTransfer = document.getElementById("wm-transfer-btn");
  if (wmTransfer)
    wmTransfer.addEventListener("click", () => showTransferModal());
  const wmAdd = document.getElementById("wm-add-btn");
  if (wmAdd) wmAdd.addEventListener("click", () => showWalletModal());
  const wmEmptyAdd = document.getElementById("wm-empty-add-btn");
  if (wmEmptyAdd) wmEmptyAdd.addEventListener("click", () => showWalletModal());

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
            <div class="tx-sheet-scroll">
            <div class="form-group">
                <label>Nama Dompet</label>
                <input type="text" id="wallet-name" class="form-input" 
                       value="${isEdit ? escapeHtml(wallet.name) : ""}" 
                       placeholder="Contoh: Tunai, OVO, BCA..." required>
            </div>
            
            <div class="form-group">
                <label>Tipe Dompet</label>
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
                <label>Foto Dompet <span class="form-optional">(opsional)</span></label>
                <div class="photo-upload">
                    <div class="photo-preview" id="wallet-photo-preview"></div>
                    <div class="photo-actions">
                        <button type="button" class="btn-secondary" id="wallet-photo-pick">
                            <i class="fas fa-image"></i> Pilih Foto
                        </button>
                        <button type="button" class="btn-secondary" id="wallet-photo-remove" hidden>
                            <i class="fas fa-trash"></i> Hapus Foto
                        </button>
                    </div>
                    <input type="file" id="wallet-photo-input" accept="image/*" hidden>
                </div>
                <small class="form-help">Foto otomatis diubah ke WebP dan menggantikan icon di card dompet.</small>
            </div>

            <div class="form-group">
                <label>Warna</label>
                <div class="color-selector" id="color-selector">
                    ${generateColorOptions(isEdit ? wallet.color : "#3b82f6")}
                </div>
                <input type="hidden" id="wallet-color" value="${isEdit ? wallet.color : "#3b82f6"}">
            </div>
            
            ${
              isEdit
                ? ""
                : `<div class="form-group">
                <label>Saldo Awal</label>
                <input type="text" inputmode="numeric" autocomplete="off" data-money id="wallet-balance" class="form-input" 
                       value="0" 
                       placeholder="0" min="0" step="1000">
                <small class="form-help">Saldo awal hanya diisi saat membuat dompet baru. Untuk mengubah saldo nanti, gunakan tombol Edit Saldo.</small>
            </div>`
            }
            </div>

            <div class="modal-buttons tx-sheet-footer">
                <button type="button" class="btn-secondary modal-close-btn">Batal</button>
                <button type="submit" class="btn-primary">${isEdit ? "Simpan Perubahan" : "Tambah Dompet"}</button>
            </div>
        </form>
    `;

  // Create modal
  ensureTxSheetStyles();
  ensureWalletSheetStyles();
  const modal = document.createElement("div");
  modal.className = "modal-overlay tx-sheet-overlay";
  modal.innerHTML = `
        <div class="modal-container modal-medium tx-sheet wallet-modal">
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

  // Setup foto dompet
  let photoData = isEdit && wallet.photo ? wallet.photo : "";
  const photoPreview = modal.querySelector("#wallet-photo-preview");
  const photoInput = modal.querySelector("#wallet-photo-input");
  const photoPickBtn = modal.querySelector("#wallet-photo-pick");
  const photoRemoveBtn = modal.querySelector("#wallet-photo-remove");

  const renderPhotoPreview = () => {
    photoPreview.innerHTML = photoData
      ? `<img src="${photoData}" alt="Foto dompet">`
      : `<i class="fas fa-image"></i>`;
    photoRemoveBtn.hidden = !photoData;
    photoPickBtn.innerHTML = `<i class="fas fa-image"></i> ${photoData ? "Ganti Foto" : "Pilih Foto"}`;
  };
  renderPhotoPreview();

  photoPickBtn.addEventListener("click", () => photoInput.click());
  photoRemoveBtn.addEventListener("click", () => {
    photoData = "";
    photoInput.value = "";
    renderPhotoPreview();
  });
  photoInput.addEventListener("change", async () => {
    const file = photoInput.files && photoInput.files[0];
    if (!file) return;
    photoPickBtn.disabled = true;
    try {
      photoData = await convertImageToWebp(file);
      renderPhotoPreview();
    } catch (err) {
      showToast(err.message || "Gagal memproses foto", "error");
    } finally {
      photoPickBtn.disabled = false;
      photoInput.value = "";
    }
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
    // Kolom saldo hanya ada saat membuat dompet baru
    const balanceInput = modal.querySelector("#wallet-balance");
    const balance = balanceInput ? parseMoney(balanceInput.value) || 0 : 0;

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
      if (photoData) wallet.photo = photoData;
      else delete wallet.photo;
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
        ...(photoData ? { photo: photoData } : {}),
      };

      await addItem(STORES.WALLETS, newWallet);
      showToast("Dompet berhasil ditambahkan", "success");
    }

    modal.remove();
    await renderWalletsPage();

    await refreshDashboardIfActive();
  });

  // Close modal
  const closeModal = () => modal.remove();
  modal.querySelectorAll(".modal-close-btn").forEach((btn) => {
    btn.addEventListener("click", closeModal);
  });
  // Modal hanya bisa ditutup lewat tombol Batal atau tombol silang (X);
  // klik area di luar modal sengaja tidak menutup agar input tidak hilang.
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

  ensureTxSheetStyles();
  ensureWalletSheetStyles();
  const modal = document.createElement("div");
  modal.className = "modal-overlay tx-sheet-overlay";
  modal.innerHTML = `
    <div class="modal-container tx-sheet wallet-modal wallet-balance-modal">
      <div class="modal-header">
        <h3><i class="fas fa-edit"></i> Edit Saldo — ${escapeHtml(wallet.name)}</h3>
        <button type="button" class="modal-close-x">&times;</button>
      </div>
      <div class="modal-body">
        <div class="tx-sheet-scroll">
          <p class="wb-note">Mengubah saldo secara langsung. Riwayat transaksi tidak terpengaruh.</p>
          <div class="form-group">
            <label>Saldo Baru (Rp)</label>
            <input type="text" inputmode="numeric" autocomplete="off" data-money id="new-balance-input" class="form-input wb-input"
              value="${formatMoneyInput(wallet.balance)}" min="0">
          </div>
        </div>
        <div class="modal-buttons tx-sheet-footer wb-actions">
          <button type="button" class="btn-secondary modal-cancel">Batal</button>
          <button type="button" id="save-balance-btn" class="btn-primary">Simpan</button>
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  const closeModal = () => modal.remove();
  modal.querySelector(".modal-close-x").addEventListener("click", closeModal);
  modal.querySelector(".modal-cancel").addEventListener("click", closeModal);
  // Modal hanya bisa ditutup lewat tombol Batal atau tombol silang (X);
  // klik area di luar modal sengaja tidak menutup agar input tidak hilang.

  modal
    .querySelector("#save-balance-btn")
    .addEventListener("click", async () => {
      const input = modal.querySelector("#new-balance-input");
      const newBalance = parseMoney(input.value);
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
          await refreshDashboardIfActive();
        } catch (error) {
          console.error("Delete error:", error);
          showToast("Gagal menghapus dompet", "error");
        }
      }
    },
  );
}

// ==================== FITUR TRANSFER SALDO ANTAR DOMPET ====================

// Show modal untuk transfer saldo antar dompet
async function showTransferModal() {
  await loadWallets();

  if (allWallets.length < 2) {
    showToast("Minimal harus ada 2 dompet untuk melakukan transfer", "error");
    return;
  }

  const today = getCurrentDateTime().date;

  ensureTxSheetStyles();
  ensureWalletSheetStyles();
  const modal = document.createElement("div");
  modal.className = "modal-overlay tx-sheet-overlay";
  modal.innerHTML = `
        <div class="modal-container modal-medium tx-sheet wallet-modal">
            <div class="modal-header">
                <h3><i class="fas fa-right-left"></i> Transfer Saldo</h3>
                <button class="modal-close-btn modal-close-x">&times;</button>
            </div>
            <div class="modal-body">
                <form id="transfer-form">
                    <div class="tx-sheet-scroll">
                        <div class="form-group">
                            <label>Dari Dompet</label>
                            <select id="transfer-from" class="form-input" required>
                                ${allWallets
                                  .map(
                                    (w) =>
                                      `<option value="${w.id}">${escapeHtml(w.name)} (${formatCurrency(w.balance)})</option>`,
                                  )
                                  .join("")}
                            </select>
                            <small class="form-help" id="transfer-balance-hint"></small>
                        </div>

                        <div class="transfer-arrow">
                            <i class="fas fa-arrow-down"></i>
                        </div>

                        <div class="form-group">
                            <label>Ke Dompet</label>
                            <select id="transfer-to" class="form-input" required></select>
                        </div>

                        <div class="form-group">
                            <label>Nominal Transfer</label>
                            <input type="text" inputmode="numeric" autocomplete="off" data-money id="transfer-amount" class="form-input"
                                   placeholder="0" min="1" step="1" required>
                        </div>

                        <div class="form-group">
                            <label>Catatan (opsional)</label>
                            <input type="text" id="transfer-note" class="form-input"
                                   placeholder="Contoh: Top up GoPay dari Tunai">
                        </div>

                        <div class="form-group">
                            <label>Tanggal</label>
                            <input type="date" id="transfer-date" class="form-input" value="${today}">
                        </div>
                    </div>

                    <div class="modal-buttons tx-sheet-footer">
                        <button type="button" class="btn-secondary modal-close-btn">Batal</button>
                        <button type="submit" class="btn-primary">Transfer Sekarang</button>
                    </div>
                </form>
            </div>
        </div>
    `;

  document.body.appendChild(modal);
  addWalletModalStyles();
  addTransferStyles();

  const fromSelect = modal.querySelector("#transfer-from");
  const toSelect = modal.querySelector("#transfer-to");
  const balanceHint = modal.querySelector("#transfer-balance-hint");

  // Isi ulang opsi "Ke Dompet" agar tidak sama dengan "Dari Dompet"
  function refreshToOptions() {
    const fromId = fromSelect.value;
    const options = allWallets.filter((w) => w.id !== fromId);
    toSelect.innerHTML = options
      .map(
        (w) =>
          `<option value="${w.id}">${escapeHtml(w.name)} (${formatCurrency(w.balance)})</option>`,
      )
      .join("");
  }

  // Update hint saldo dompet asal
  function updateBalanceHint() {
    const wallet = allWallets.find((w) => w.id === fromSelect.value);
    balanceHint.textContent = wallet
      ? `Saldo tersedia: ${formatCurrency(wallet.balance)}`
      : "";
  }

  refreshToOptions();
  updateBalanceHint();

  fromSelect.addEventListener("change", () => {
    refreshToOptions();
    updateBalanceHint();
  });

  // Handle submit
  const form = modal.querySelector("#transfer-form");
  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const fromId = fromSelect.value;
    const toId = toSelect.value;
    const amount =
      parseMoney(modal.querySelector("#transfer-amount").value) || 0;
    const note = modal.querySelector("#transfer-note").value.trim();
    const date = modal.querySelector("#transfer-date").value || today;

    if (!fromId || !toId) {
      showToast("Pilih dompet asal dan tujuan", "error");
      return;
    }

    if (fromId === toId) {
      showToast("Dompet asal dan tujuan tidak boleh sama", "error");
      return;
    }

    if (!amount || amount <= 0) {
      showToast("Nominal transfer harus lebih dari 0", "error");
      return;
    }

    // Ambil data dompet terbaru dari database (menghindari data basi)
    const fromWallet = await getItem(STORES.WALLETS, fromId);
    const toWallet = await getItem(STORES.WALLETS, toId);

    if (!fromWallet || !toWallet) {
      showToast("Dompet tidak ditemukan", "error");
      return;
    }

    if (fromWallet.balance < amount) {
      showToast(
        `Saldo ${fromWallet.name} tidak mencukupi! (Saldo: ${formatCurrency(fromWallet.balance)})`,
        "error",
      );
      return;
    }

    // Update saldo kedua dompet
    fromWallet.balance -= amount;
    toWallet.balance += amount;
    await updateItem(STORES.WALLETS, fromWallet);
    await updateItem(STORES.WALLETS, toWallet);

    // Simpan riwayat transfer
    const { time, timestamp } = getCurrentDateTime();
    const transferRecord = {
      fromWalletId: fromWallet.id,
      fromWalletName: fromWallet.name,
      toWalletId: toWallet.id,
      toWalletName: toWallet.name,
      amount: amount,
      note: note,
      date: date,
      time: time,
      createdAt: timestamp,
    };
    await addItem(STORES.TRANSFERS, transferRecord);

    showToast(
      `Berhasil transfer ${formatCurrency(amount)} dari ${fromWallet.name} ke ${toWallet.name}`,
      "success",
    );

    modal.remove();
    await renderWalletsPage();

    // Sinkronkan saldo di halaman lain (dashboard, total aset, dll)
    await refreshDashboardIfActive();
  });

  // Close modal
  const closeModal = () => modal.remove();
  modal.querySelectorAll(".modal-close-btn").forEach((btn) => {
    btn.addEventListener("click", closeModal);
  });
  // Modal hanya bisa ditutup lewat tombol Batal atau tombol silang (X);
  // klik area di luar modal sengaja tidak menutup agar input tidak hilang.
}

// Tampilkan riwayat transfer
async function showTransferHistoryModal() {
  const transfers = await getAllItems(STORES.TRANSFERS);
  transfers.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

  ensureTxSheetStyles();
  ensureWalletSheetStyles();
  const modal = document.createElement("div");
  modal.className = "modal-overlay tx-sheet-overlay";
  modal.innerHTML = `
        <div class="modal-container modal-medium tx-sheet wallet-modal">
            <div class="modal-header">
                <h3><i class="fas fa-clock-rotate-left"></i> Riwayat Transfer</h3>
                <button class="modal-close-btn modal-close-x">&times;</button>
            </div>
            <div class="modal-body">
                <div class="tx-sheet-scroll">
                    ${
                      transfers.length === 0
                        ? `<p class="empty-note">Belum ada riwayat transfer</p>`
                        : transfers
                            .map((t) => renderTransferHistoryItem(t))
                            .join("")
                    }
                </div>
                <div class="modal-buttons tx-sheet-footer">
                    <button type="button" class="btn-secondary modal-close-btn">Tutup</button>
                </div>
            </div>
        </div>
    `;

  document.body.appendChild(modal);
  addWalletModalStyles();
  addTransferStyles();

  const closeModal = () => modal.remove();
  modal.querySelectorAll(".modal-close-btn").forEach((btn) => {
    btn.addEventListener("click", closeModal);
  });
  // Modal hanya bisa ditutup lewat tombol Tutup atau tombol silang (X);
  // klik area di luar modal sengaja tidak menutup.

  modal.querySelectorAll(".delete-transfer-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = parseInt(btn.dataset.id, 10);
      deleteTransferById(id, modal);
    });
  });
}

// Render satu item riwayat transfer
function renderTransferHistoryItem(t) {
  return `
        <div class="transfer-history-item" data-id="${t.id}">
            <div class="transfer-history-top">
                <div class="transfer-history-route">
                    <span>${escapeHtml(t.fromWalletName)}</span>
                    <i class="fas fa-arrow-right-long"></i>
                    <span>${escapeHtml(t.toWalletName)}</span>
                </div>
                <button class="icon-btn delete-transfer-btn" data-id="${t.id}" title="Hapus dan Kembalikan Saldo">
                    <i class="fas fa-trash"></i>
                </button>
            </div>
            <div class="transfer-history-amount">${formatCurrency(t.amount)}</div>
            <div class="transfer-history-meta">
                <span><i class="far fa-calendar"></i> ${formatDate(t.date, "dd/mm/yyyy")}${t.time ? ` • ${t.time}` : ""}</span>
                ${t.note ? `<span class="transfer-history-note">"${escapeHtml(t.note)}"</span>` : ""}
            </div>
        </div>
    `;
}

// Hapus riwayat transfer sekaligus kembalikan saldo kedua dompet (undo)
async function deleteTransferById(id, modal) {
  confirmDialog(
    "Menghapus riwayat ini akan mengembalikan saldo kedua dompet seperti sebelum transfer dilakukan. Lanjutkan?",
    async (confirmed) => {
      if (!confirmed) return;

      const transfer = await getItem(STORES.TRANSFERS, id);
      if (!transfer) {
        showToast("Riwayat transfer tidak ditemukan", "error");
        return;
      }

      // Kembalikan saldo dompet asal & tujuan
      const fromWallet = await getItem(STORES.WALLETS, transfer.fromWalletId);
      const toWallet = await getItem(STORES.WALLETS, transfer.toWalletId);

      if (fromWallet) {
        fromWallet.balance += transfer.amount;
        await updateItem(STORES.WALLETS, fromWallet);
      }
      if (toWallet) {
        toWallet.balance -= transfer.amount;
        await updateItem(STORES.WALLETS, toWallet);
      }

      await deleteItem(STORES.TRANSFERS, id);
      showToast("Transfer dibatalkan, saldo telah dikembalikan", "success");

      modal.remove();
      await showTransferHistoryModal();
      await renderWalletsPage();

      await refreshDashboardIfActive();
    },
  );
}

// Styles untuk fitur transfer & riwayat
function addTransferStyles() {
  if (document.getElementById("transfer-styles")) return;

  const style = document.createElement("style");
  style.id = "transfer-styles";
  style.textContent = `
        .wallet-header-actions {
            display: flex;
            gap: 10px;
            flex-wrap: wrap;
        }

        .transfer-arrow {
            text-align: center;
            margin: 4px 0 12px;
            color: #16A34A;
            font-size: 1.1rem;
        }

        .empty-note {
            text-align: center;
            padding: 24px 0;
            color: var(--text-secondary);
        }

        .transfer-history-item {
            background: var(--bg-secondary);
            border: 1px solid var(--border-color);
            border-radius: 16px;
            padding: 14px;
            margin-bottom: 12px;
        }

        .transfer-history-top {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 8px;
        }

        .transfer-history-route {
            display: flex;
            align-items: center;
            gap: 8px;
            font-weight: 600;
            font-size: 0.9rem;
        }

        .transfer-history-route i {
            color: #16A34A;
            font-size: 0.8rem;
        }

        .transfer-history-amount {
            font-size: 1.15rem;
            font-weight: 700;
            color: #16A34A;
            margin: 6px 0;
        }

        .transfer-history-meta {
            display: flex;
            flex-direction: column;
            gap: 4px;
            font-size: 0.75rem;
            color: var(--text-secondary);
        }

        .transfer-history-note {
            font-style: italic;
        }

        .transfer-history-item .delete-transfer-btn:hover {
            background: #FDEBEA;
            color: #DC4C4C;
        }

        @media (max-width: 768px) {
            .wallet-header-actions {
                width: 100%;
            }
            .wallet-header-actions button {
                flex: 1;
                font-size: 0.8rem;
                padding: 10px 8px;
            }
        }
    `;

  document.head.appendChild(style);
}

// Add main wallet page styles
// Palet halaman dompet (desktop + mobile): hijau tua, hijau aksi, lime, merah, tint pastel
function addWalletStyles() {
  if (document.getElementById("wallet-main-styles")) return;

  const style = document.createElement("style");
  style.id = "wallet-main-styles";
  style.textContent = `
        .wallets-container {
            --wm-forest: #0B3D2A;
            --wm-forest-2: #0F5A3A;
            --wm-green: #16A34A;
            --wm-lime: #C6F432;
            --wm-red: #DC4C4C;
            --wm-green-tint: #E6F6EC;
            --wm-red-tint: #FDEBEA;
            max-width: 1200px;
            margin: 0 auto;
        }

        /* Foto custom pengganti icon dompet */
        .wallets-container .has-photo {
            overflow: hidden;
            padding: 0;
        }
        .wallets-container .has-photo img {
            width: 100%;
            height: 100%;
            object-fit: contain;   /* foto tampil utuh, tidak ter-crop */
            display: block;
        }

        .wallets-container .btn-primary {
            background: var(--wm-green);
            color: #fff;
        }

        /* Total saldo: hijau tua yang sama dengan header dashboard */
        .wallets-container .total-balance-card.card {
            color: #fff;
            text-align: center;
            margin-bottom: 24px;
            padding: 28px 20px;
            border: 0;
            border-radius: 24px;
            background:
                radial-gradient(circle at 92% 0%, rgba(198, 244, 50, 0.16) 0%, rgba(198, 244, 50, 0) 45%),
                linear-gradient(160deg, #0F5A3A 0%, #0B3D2A 70%),
                #0B3D2A;
            box-shadow: 0 14px 30px rgba(11, 61, 42, 0.28);
        }

        .wallets-container .total-balance-header {
            font-size: 0.875rem;
            color: rgba(255, 255, 255, 0.75);
            margin-bottom: 8px;
        }

        .wallets-container .total-balance-amount {
            font-size: 2.4rem;
            font-weight: 800;
            line-height: 1.15;
            margin-bottom: 14px;
            white-space: nowrap;
            font-variant-numeric: tabular-nums;
        }

        .wallets-container .total-balance-footer {
            display: inline-flex;
            align-items: center;
            padding: 6px 14px;
            border-radius: 999px;
            background: var(--wm-lime);
            color: var(--wm-forest);
            font-size: 0.78rem;
            font-weight: 700;
        }

        .wallets-container .wallet-section {
            margin-bottom: 28px;
        }

        .wallets-container .section-header {
            display: flex;
            align-items: center;
            gap: 10px;
            margin-bottom: 16px;
            padding-bottom: 8px;
            border-bottom: 2px solid var(--border-color);
        }

        .wallets-container .section-header i {
            font-size: 1.2rem;
            color: var(--wm-green);
        }

        .wallets-container .section-header h3 {
            font-size: 1.05rem;
            font-weight: 800;
            margin: 0;
        }

        .wallets-container .section-count {
            font-size: 0.7rem;
            color: var(--text-secondary);
            background: var(--border-color);
            padding: 2px 8px;
            border-radius: 20px;
        }

        .wallets-container .wallet-cards {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
            gap: 16px;
        }

        .wallets-container .wallet-card {
            background: var(--bg-secondary);
            border: 1px solid var(--border-color);
            border-radius: 20px;
            overflow: hidden;
            box-shadow: 0 2px 12px rgba(11, 61, 42, 0.06);
            transition: transform 0.2s ease, box-shadow 0.2s ease;
        }

        .wallets-container .wallet-card:hover {
            transform: translateY(-3px);
            box-shadow: 0 10px 24px rgba(11, 61, 42, 0.12);
        }

        .wallets-container .wallet-card-header {
            display: flex;
            align-items: center;
            gap: 12px;
            padding: 16px;
        }

        .wallets-container .wallet-card-icon {
            width: 46px;
            height: 46px;
            flex-shrink: 0;
            border-radius: 14px;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 1.25rem;
            background: var(--bg-primary);
            background: color-mix(in srgb, var(--wm-color) 12%, transparent);
            color: var(--wm-color);
        }

        .wallets-container .wallet-card-info {
            flex: 1;
            min-width: 0;
        }

        .wallets-container .wallet-name-row {
            display: flex;
            align-items: center;
            gap: 8px;
            flex-wrap: wrap;
            margin-bottom: 4px;
        }

        .wallets-container .wallet-name-row h4 {
            font-size: 1rem;
            font-weight: 700;
            margin: 0;
            color: var(--text-primary);
        }

        .wallets-container .default-badge {
            font-size: 0.65rem;
            font-weight: 700;
            padding: 2px 8px;
            border-radius: 20px;
            background: var(--wm-green-tint);
            color: var(--wm-green);
        }

        .wallets-container .wallet-type-badge {
            font-size: 0.72rem;
            padding: 2px 8px;
            border-radius: 20px;
            background: var(--bg-primary);
            color: var(--text-secondary);
            display: inline-block;
        }

        .wallets-container .wallet-card-actions {
            display: flex;
            gap: 4px;
        }

        .wallets-container .wallet-card-actions .delete-wallet:hover {
            background: var(--wm-red-tint);
            color: var(--wm-red);
        }

        .wallets-container .wallet-card-body {
            padding: 16px;
            border-top: 1px solid var(--border-color);
        }

        .wallets-container .wallet-balance {
            text-align: center;
        }

        .wallets-container .balance-label {
            display: block;
            font-size: 0.72rem;
            color: var(--text-secondary);
            margin-bottom: 6px;
        }

        .wallets-container .balance-amount {
            font-size: 1.5rem;
            font-weight: 800;
            white-space: nowrap;
            font-variant-numeric: tabular-nums;
        }

        .wallets-container .balance-amount.positive {
            color: var(--wm-green);
        }

        .wallets-container .balance-amount.negative {
            color: var(--wm-red);
        }

        .wallets-container .btn-edit-balance {
            display: block;
            width: 100%;
            margin-top: 10px;
            padding: 8px 12px;
            border: 0;
            border-radius: 12px;
            background: var(--wm-green-tint);
            color: var(--wm-green);
            font-size: 0.8rem;
            font-weight: 600;
            cursor: pointer;
            transition: opacity 0.2s ease;
        }

        .wallets-container .btn-edit-balance:hover {
            opacity: 0.85;
        }

        .form-help {
            display: block;
            font-size: 0.7rem;
            color: var(--text-secondary);
            margin-top: 4px;
        }

        .form-optional {
            font-weight: 400;
        }
    `;

  document.head.appendChild(style);
}

// Styles khusus tampilan mobile halaman dompet (header hijau + daftar per jenis)
function addWalletMobileStyles() {
  if (document.getElementById("wallet-mobile-styles")) return;

  const style = document.createElement("style");
  style.id = "wallet-mobile-styles";
  style.textContent = `
        /* Desktop: sembunyikan tampilan mobile */
        .wallet-mobile { display: none; }

        @media (max-width: 768px) {
            .wallet-desktop { display: none !important; }

            /* Hilangkan padding halaman agar header bisa full ke tepi */
            #page-content:has(.wallet-mobile),
            body *:has(.wallet-mobile) {
                padding-left: 0 !important;
                padding-right: 0 !important;
                padding-top: 0 !important;
                border-top-left-radius: 0 !important;
                border-top-right-radius: 0 !important;
            }
            html:has(.wallet-mobile),
            body:has(.wallet-mobile) { overflow-x: hidden; }

            .wallets-container .wallet-mobile {
                display: block;
                /* margin full-bleed diatur otomatis oleh fitWalletMobileFullBleed() */
                padding-bottom: 110px; /* ruang untuk bottom navigation */
            }

            /* ===== Header (hero) hijau tua ===== */
            .wallets-container .wm-hero {
                position: relative;
                z-index: 0;
                padding: 24px 16px 28px;
                color: #fff;
            }

            .wallets-container .wm-hero::before {
                content: "";
                position: absolute;
                z-index: -1;
                /* overshoot 2px agar tidak ada celah putih (sub-pixel) di tepi */
                top: calc(var(--wm-bleed-t, 0px) * -1 - 2px);
                left: calc(var(--wm-bleed-l, 0px) * -1 - 2px);
                right: calc(var(--wm-bleed-r, 0px) * -1 - 2px);
                bottom: 0;
                background:
                    radial-gradient(circle at 92% 0%, rgba(198, 244, 50, 0.16) 0%, rgba(198, 244, 50, 0) 45%),
                    linear-gradient(160deg, #0F5A3A 0%, #0B3D2A 70%),
                    #0B3D2A;
                border-radius: 0 0 32px 32px;
                box-shadow: 0 14px 30px rgba(11, 61, 42, 0.28);
            }

            .wallets-container .wm-top {
                display: flex;
                align-items: center;
                gap: 12px;
            }

            .wallets-container .wm-avatar {
                width: 48px;
                height: 48px;
                flex-shrink: 0;
                border-radius: 50%;
                display: flex;
                align-items: center;
                justify-content: center;
                background: rgba(255, 255, 255, 0.12);
                border: 2px solid rgba(198, 244, 50, 0.45);
                color: var(--wm-lime);
                font-size: 1.1rem;
            }

            .wallets-container .wm-greet {
                display: block;
                font-size: 0.8rem;
                color: rgba(255, 255, 255, 0.72);
            }

            .wallets-container .wm-title {
                margin: 2px 0 0;
                font-size: 1.35rem;
                font-weight: 800;
                line-height: 1.2;
                color: #fff;
            }

            .wallets-container .wm-total {
                margin-top: 24px;
                text-align: center;
            }

            .wallets-container .wm-total-label {
                display: block;
                font-size: 0.85rem;
                color: rgba(255, 255, 255, 0.75);
            }

            .wallets-container .wm-total-amount {
                margin: 8px 0 14px;
                /* otomatis mengecil sesuai jumlah karakter agar selalu 1 baris */
                font-size: min(2.6rem, calc((100vw - 40px) / (var(--wm-chars, 12) * 0.62)));
                font-weight: 800;
                line-height: 1.15;
                color: #fff;
                white-space: nowrap;
                font-variant-numeric: tabular-nums;
            }

            .wallets-container .wm-count-chip {
                display: inline-flex;
                align-items: center;
                gap: 6px;
                padding: 6px 14px;
                border-radius: 999px;
                background: var(--wm-lime);
                color: var(--wm-forest);
                font-size: 0.78rem;
                font-weight: 700;
            }

            /* ===== Aksi utama (bulat + label) ===== */
            .wallets-container .wm-actions {
                display: grid;
                grid-template-columns: repeat(3, minmax(0, 1fr));
                gap: 8px;
                margin-top: 24px;
            }

            .wallets-container .wm-action {
                display: flex;
                flex-direction: column;
                align-items: center;
                gap: 8px;
                padding: 0;
                background: none;
                border: 0;
                color: #fff;
                font-family: inherit;
                cursor: pointer;
                -webkit-tap-highlight-color: transparent;
            }

            .wallets-container .wm-action-icon {
                width: 56px;
                height: 56px;
                border-radius: 50%;
                display: flex;
                align-items: center;
                justify-content: center;
                background: rgba(255, 255, 255, 0.12);
                border: 1px solid rgba(255, 255, 255, 0.14);
                color: #fff;
                font-size: 1.15rem;
                transition: transform 0.15s ease;
            }

            .wallets-container .wm-action-primary .wm-action-icon {
                background: var(--wm-lime);
                border-color: var(--wm-lime);
                color: var(--wm-forest);
            }

            .wallets-container .wm-action:active .wm-action-icon { transform: scale(0.92); }

            .wallets-container .wm-action-label {
                font-size: 0.75rem;
                font-weight: 600;
                line-height: 1.2;
                color: #fff;
            }

            /* ===== Konten di bawah header ===== */
            .wallets-container .wm-body {
                display: flex;
                flex-direction: column;
                gap: 20px;
                padding: 24px 16px 0;
            }

            .wallets-container .wm-section-head {
                display: flex;
                align-items: baseline;
                justify-content: space-between;
                gap: 12px;
                margin-bottom: 12px;
            }

            .wallets-container .wm-section-head h3 {
                margin: 0;
                font-size: 1.1rem;
                font-weight: 800;
                color: var(--text-primary);
            }

            .wallets-container .wm-section-count {
                font-size: 0.8rem;
                color: var(--text-secondary);
            }

            .wallets-container .wm-list-card {
                padding: 4px 16px;
                background: var(--bg-secondary);
                border-radius: 22px;
                box-shadow: 0 2px 12px rgba(11, 61, 42, 0.06);
            }

            .wallets-container .wm-item { padding: 14px 0; }
            .wallets-container .wm-item + .wm-item { border-top: 1px solid var(--border-color); }

            .wallets-container .wm-item-main {
                display: flex;
                align-items: center;
                gap: 12px;
                min-width: 0;
            }

            .wallets-container .wm-item-icon {
                width: 42px;
                height: 42px;
                flex-shrink: 0;
                border-radius: 12px;
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 1.05rem;
                background: var(--bg-primary);
                background: color-mix(in srgb, var(--wm-color) 12%, transparent);
                color: var(--wm-color);
            }

            .wallets-container .wm-item-info {
                flex: 1;
                min-width: 0;
            }

            .wallets-container .wm-item-name-row {
                display: flex;
                align-items: center;
                gap: 6px;
                min-width: 0;
            }

            .wallets-container .wm-item-name {
                min-width: 0;
                font-size: 0.95rem;
                font-weight: 700;
                color: var(--text-primary);
                white-space: nowrap;
                overflow: hidden;
                text-overflow: ellipsis;
            }

            .wallets-container .wm-chip {
                flex-shrink: 0;
                padding: 2px 8px;
                border-radius: 999px;
                background: var(--wm-green-tint);
                color: var(--wm-green);
                font-size: 0.65rem;
                font-weight: 700;
            }

            .wallets-container .wm-item-sub {
                display: block;
                margin-top: 2px;
                font-size: 0.78rem;
                color: var(--text-secondary);
            }

            .wallets-container .wm-item-balance {
                flex-shrink: 0;
                font-size: 0.95rem;
                font-weight: 800;
                color: var(--text-primary);
                white-space: nowrap;
                font-variant-numeric: tabular-nums;
            }

            .wallets-container .wm-item-balance.negative { color: var(--wm-red); }

            .wallets-container .wm-item-actions {
                display: flex;
                align-items: center;
                justify-content: space-between;
                gap: 8px;
                margin-top: 12px;
                padding-left: 54px;
            }

            .wallets-container .wm-balance-btn {
                display: inline-flex;
                align-items: center;
                gap: 6px;
                padding: 7px 14px;
                border: 0;
                border-radius: 999px;
                background: var(--wm-green-tint);
                color: var(--wm-green);
                font-family: inherit;
                font-size: 0.75rem;
                font-weight: 600;
                cursor: pointer;
            }

            .wallets-container .wm-item-tools {
                display: flex;
                gap: 8px;
            }

            .wallets-container .wm-tool-btn {
                width: 32px;
                height: 32px;
                padding: 0;
                display: flex;
                align-items: center;
                justify-content: center;
                border: 0;
                border-radius: 10px;
                background: var(--bg-primary);
                color: var(--text-secondary);
                font-size: 0.85rem;
                cursor: pointer;
            }

            .wallets-container .wm-tool-btn.wm-tool-danger {
                background: var(--wm-red-tint);
                color: var(--wm-red);
            }

            /* ===== Empty state ===== */
            .wallets-container .wm-empty {
                padding: 32px 16px;
                text-align: center;
                border-radius: 22px;
                background: var(--bg-secondary);
                box-shadow: 0 2px 12px rgba(11, 61, 42, 0.06);
                color: var(--text-secondary);
            }

            .wallets-container .wm-empty i {
                margin-bottom: 8px;
                font-size: 2.2rem;
                color: var(--wm-green);
                opacity: 0.6;
            }

            .wallets-container .wm-empty-btn {
                margin-top: 8px;
                padding: 10px 18px;
                border: 0;
                border-radius: 999px;
                background: var(--wm-green);
                color: #fff;
                font-weight: 700;
                cursor: pointer;
            }
        }
    `;

  document.head.appendChild(style);
}

// Gaya tambahan modal dompet untuk Bottom Sheet (melengkapi modal-sheet.js)
function ensureWalletSheetStyles() {
  if (document.getElementById("wallet-sheet-styles")) return;
  const style = document.createElement("style");
  style.id = "wallet-sheet-styles";
  style.textContent = `
    /* Modal Edit Saldo: tampilan desktop */
    .wallet-balance-modal { max-width: 360px; width: 95%; }
    .wallet-balance-modal .modal-close-x {
      background: none;
      border: none;
      font-size: 24px;
      cursor: pointer;
    }
    .wallet-balance-modal .wb-note {
      font-size: 0.8rem;
      color: var(--text-secondary);
      margin-bottom: 16px;
    }
    .wallet-balance-modal .wb-input {
      width: 100%;
      padding: 10px;
      border: 1px solid var(--border-color);
      border-radius: 8px;
      background: var(--bg-primary);
      color: var(--text-primary);
    }
    .wallet-balance-modal .wb-actions {
      display: flex;
      gap: 12px;
      margin-top: 20px;
    }
    .wallet-balance-modal .wb-actions button {
      flex: 1;
      padding: 10px;
      border-radius: 8px;
      cursor: pointer;
      border: none;
    }

    /* Desktop: aksen hijau pada modal dompet */
    @media (min-width: 769px) {
      .wallet-modal .btn-primary {
        background: #16A34A;
        color: #fff;
      }
      .wallet-modal .type-btn.active,
      .wallet-modal .icon-option.selected {
        background: #16A34A;
        border-color: #16A34A;
        color: #fff;
      }
      .wallet-modal .color-option.selected {
        box-shadow: 0 0 0 2px #16A34A;
      }
    }

    /* Aurora Glass - Bottom Sheet mobile */
    @media (max-width: 768px) {
      .modal-container.tx-sheet .wb-note {
        color: #A6B0C2;
        font-size: 0.875rem;
        margin: 0 0 16px;
      }
      .modal-container.tx-sheet .wb-input {
        padding: 12px 16px;
      }
      .modal-container.tx-sheet .form-optional {
        color: #A6B0C2;
      }
      .modal-container.tx-sheet .icon-option {
        background: rgba(255, 255, 255, 0.04);
        color: #F4F7FB;
        border: 1px solid rgba(255, 255, 255, 0.18);
        border-radius: 9999px;
      }
      .modal-container.tx-sheet .icon-option.selected {
        background: rgba(125, 249, 214, 0.18);
        color: #7DF9D6;
        border-color: rgba(125, 249, 214, 0.45);
      }
      .modal-container.tx-sheet .color-option {
        border: 2px solid rgba(255, 255, 255, 0.22);
      }
      .modal-container.tx-sheet .color-option.selected {
        border-color: #F4F7FB;
        box-shadow: 0 0 0 3px rgba(125, 249, 214, 0.65);
      }
      .modal-container.tx-sheet .photo-preview {
        background: rgba(255, 255, 255, 0.06);
        border: 1px dashed rgba(255, 255, 255, 0.22);
        border-radius: 18px;
        color: #A6B0C2;
      }
      .modal-container.tx-sheet .photo-actions button {
        background: rgba(255, 255, 255, 0.10);
        color: #F4F7FB;
        border: 1px solid rgba(255, 255, 255, 0.22);
        border-radius: 9999px;
        font-weight: 600;
      }
      .modal-container.tx-sheet .icon-option:focus-visible,
      .modal-container.tx-sheet .color-option:focus-visible,
      .modal-container.tx-sheet .photo-actions button:focus-visible {
        outline: 2px solid rgba(125, 249, 214, 0.5);
        outline-offset: 3px;
      }

      /* Transfer saldo */
      .modal-container.tx-sheet .transfer-arrow {
        margin: 0 0 20px;
        color: #7DF9D6;
      }

      /* Riwayat transfer */
      .modal-container.tx-sheet .empty-note {
        color: #A6B0C2;
      }
      .modal-container.tx-sheet .transfer-history-item {
        background: rgba(255, 255, 255, 0.06);
        border: 1px solid rgba(255, 255, 255, 0.10);
        border-radius: 18px;
        box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.18);
        color: #F4F7FB;
      }
      .modal-container.tx-sheet .transfer-history-route i,
      .modal-container.tx-sheet .transfer-history-amount {
        color: #7DF9D6;
      }
      .modal-container.tx-sheet .transfer-history-meta {
        color: #A6B0C2;
      }
      .modal-container.tx-sheet .transfer-history-item .delete-transfer-btn:hover,
      .modal-container.tx-sheet .transfer-history-item .delete-transfer-btn:active {
        background: transparent;
        color: #F87171;
      }
    }
  `;
  document.head.appendChild(style);
}

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
        
        .photo-upload {
            display: flex;
            align-items: center;
            gap: 14px;
            margin-top: 8px;
        }

        .photo-preview {
            width: 64px;
            height: 64px;
            flex-shrink: 0;
            border-radius: 14px;
            overflow: hidden;
            display: flex;
            align-items: center;
            justify-content: center;
            border: 2px dashed var(--border-color);
            background: var(--bg-primary);
            color: var(--text-secondary);
            font-size: 1.4rem;
        }

        .photo-preview img {
            width: 100%;
            height: 100%;
            object-fit: contain;
        }

        .photo-actions {
            display: flex;
            flex-wrap: wrap;
            gap: 8px;
        }

        .photo-actions button {
            padding: 8px 12px;
            border-radius: 10px;
            cursor: pointer;
            font-size: 0.8rem;
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

// Ubah gambar apapun (jpg/png/gif/heic yang didukung browser, dll) menjadi WebP.
// Rasio asli dipertahankan (tidak di-crop), hanya diperkecil jika terlalu besar.
// Hasil berupa data URL agar bisa disimpan langsung di database bersama data dompet.
async function convertImageToWebp(file, maxSize = 320, quality = 0.85) {
  if (!file || !file.type.startsWith("image/")) {
    throw new Error("File yang dipilih bukan gambar");
  }

  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((resolve, reject) => {
      const im = new Image();
      im.onload = () => resolve(im);
      im.onerror = () => reject(new Error("Gambar tidak dapat dibaca"));
      im.src = url;
    });

    // Perkecil proporsional (tanpa crop), jangan diperbesar
    const scale = Math.min(
      1,
      maxSize / Math.max(img.naturalWidth, img.naturalHeight),
    );
    const w = Math.max(1, Math.round(img.naturalWidth * scale));
    const h = Math.max(1, Math.round(img.naturalHeight * scale));

    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(img, 0, 0, w, h);

    const dataUrl = canvas.toDataURL("image/webp", quality);
    if (!dataUrl.startsWith("data:image/webp")) {
      throw new Error("Browser ini tidak mendukung konversi ke WebP");
    }
    return dataUrl;
  } finally {
    URL.revokeObjectURL(url);
  }
}

// Helper function
function escapeHtml(text) {
  if (!text) return "";
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}
