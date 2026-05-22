// Settings Component
// Mengelola pengaturan aplikasi, backup/restore, dark mode, dll

import {
  getAllItems,
  getItem,
  updateItem,
  addItem,
  deleteItem,
  exportAllData,
  importAllData,
  clearAllData,
  STORES,
} from "./db.js";
import {
  formatCurrency,
  showToast,
  confirmDialog,
  getCurrentDateTime,
} from "./utils.js";

// State
let currentSettings = {};

// Render halaman pengaturan
export async function renderSettingsPage() {
  const container = document.getElementById("page-content");
  if (!container) return;

  // Load settings
  await loadSettings();

  // Get theme from localStorage or settings
  const currentTheme =
    localStorage.getItem("theme") || currentSettings.theme || "light";

  // HTML Template
  container.innerHTML = `
        <div class="settings-container">
            <div class="page-header">
                <h1><i class="fas fa-cog"></i> Pengaturan</h1>
            </div>
            
            <!-- Tampilan -->
            <div class="settings-section card">
                <div class="section-header">
                    <i class="fas fa-palette"></i>
                    <h3>Tampilan</h3>
                </div>
                <div class="settings-item">
                    <div class="item-info">
                        <span class="item-title">Mode Gelap</span>
                        <span class="item-desc">Ubah tampilan menjadi mode gelap</span>
                    </div>
                    <label class="switch">
                        <input type="checkbox" id="dark-mode-toggle" ${currentTheme === "dark" ? "checked" : ""}>
                        <span class="slider round"></span>
                    </label>
                </div>
            </div>
            
            <!-- Keamanan -->
            <div class="settings-section card">
                <div class="section-header">
                    <i class="fas fa-shield-alt"></i>
                    <h3>Keamanan</h3>
                </div>
                <div class="settings-item clickable" id="change-pin-item">
                    <div class="item-info">
                        <span class="item-title">Ubah PIN</span>
                        <span class="item-desc">Ganti PIN keamanan aplikasi</span>
                    </div>
                    <i class="fas fa-chevron-right"></i>
                </div>
                <div class="settings-item clickable" id="toggle-pin-item">
                    <div class="item-info">
                        <span class="item-title">Nonaktifkan PIN</span>
                        <span class="item-desc">Hapus PIN keamanan</span>
                    </div>
                    <i class="fas fa-chevron-right"></i>
                </div>
            </div>
            
            <!-- Data -->
            <div class="settings-section card">
                <div class="section-header">
                    <i class="fas fa-database"></i>
                    <h3>Data</h3>
                </div>
                <div class="settings-item clickable" id="backup-data-item">
                    <div class="item-info">
                        <span class="item-title">Backup Data</span>
                        <span class="item-desc">Simpan semua data ke file JSON</span>
                    </div>
                    <i class="fas fa-download"></i>
                </div>
                <div class="settings-item clickable" id="restore-data-item">
                    <div class="item-info">
                        <span class="item-title">Restore Data</span>
                        <span class="item-desc">Pulihkan data dari file backup</span>
                    </div>
                    <i class="fas fa-upload"></i>
                </div>
                <div class="settings-item clickable" id="export-excel-item">
                    <div class="item-info">
                        <span class="item-title">Export ke CSV</span>
                        <span class="item-desc">Export semua transaksi ke CSV</span>
                    </div>
                    <i class="fas fa-file-excel"></i>
                </div>
                <div class="settings-item clickable danger" id="reset-data-item">
                    <div class="item-info">
                        <span class="item-title">Reset Semua Data</span>
                        <span class="item-desc">Hapus semua data dan reset ke awal</span>
                    </div>
                    <i class="fas fa-trash-alt"></i>
                </div>
            </div>
            
            <!-- Informasi -->
            <div class="settings-section card">
                <div class="section-header">
                    <i class="fas fa-info-circle"></i>
                    <h3>Informasi Aplikasi</h3>
                </div>
                <div class="settings-item">
                    <div class="item-info">
                        <span class="item-title">Versi Aplikasi</span>
                        <span class="item-desc">Money Manager v1.0.0</span>
                    </div>
                </div>
                <div class="settings-item">
                    <div class="item-info">
                        <span class="item-title">Jumlah Transaksi</span>
                        <span class="item-desc" id="total-transactions">-</span>
                    </div>
                </div>
                <div class="settings-item">
                    <div class="item-info">
                        <span class="item-title">Jumlah Dompet</span>
                        <span class="item-desc" id="total-wallets">-</span>
                    </div>
                </div>
                <div class="settings-item">
                    <div class="item-info">
                        <span class="item-title">Total Saldo</span>
                        <span class="item-desc" id="total-balance">-</span>
                    </div>
                </div>
            </div>
            
            <!-- Input file untuk restore (hidden) -->
            <input type="file" id="restore-file-input" accept=".json" style="display: none;">
        </div>
    `;

  // Load statistics
  await loadStatistics();

  // Setup event listeners
  setupSettingsEventListeners();

  // Add styles
  addSettingsStyles();
}

// Load settings from database
async function loadSettings() {
  const settings = await getAllItems(STORES.SETTINGS);
  const appSettings = settings.find((s) => s.key === "app_settings");
  if (appSettings) {
    currentSettings = appSettings;
  } else {
    currentSettings = {
      key: "app_settings",
      dailyBudget: 100000,
      theme: "light",
      currency: "IDR",
      firstDayOfWeek: "monday",
    };
    await addItem(STORES.SETTINGS, currentSettings);
  }
}

// Load statistics for info section
async function loadStatistics() {
  const transactions = await getAllItems(STORES.TRANSACTIONS);
  const wallets = await getAllItems(STORES.WALLETS);

  const totalBalance = wallets.reduce((sum, w) => sum + w.balance, 0);

  const totalTransactionsEl = document.getElementById("total-transactions");
  const totalWalletsEl = document.getElementById("total-wallets");
  const totalBalanceEl = document.getElementById("total-balance");

  if (totalTransactionsEl)
    totalTransactionsEl.textContent = transactions.length;
  if (totalWalletsEl) totalWalletsEl.textContent = wallets.length;
  if (totalBalanceEl) totalBalanceEl.textContent = formatCurrency(totalBalance);
}

// Setup event listeners
function setupSettingsEventListeners() {
  // Dark mode toggle
  const darkModeToggle = document.getElementById("dark-mode-toggle");
  if (darkModeToggle) {
    darkModeToggle.addEventListener("change", (e) => {
      toggleDarkMode(e.target.checked);
    });
  }

  // Change PIN
  const changePinItem = document.getElementById("change-pin-item");
  if (changePinItem) {
    changePinItem.addEventListener("click", () => showChangePinModal());
  }

  // Toggle PIN (disable)
  const togglePinItem = document.getElementById("toggle-pin-item");
  if (togglePinItem) {
    togglePinItem.addEventListener("click", () => togglePin());
  }

  // Backup data
  const backupItem = document.getElementById("backup-data-item");
  if (backupItem) {
    backupItem.addEventListener("click", () => backupData());
  }

  // Restore data
  const restoreItem = document.getElementById("restore-data-item");
  if (restoreItem) {
    restoreItem.addEventListener("click", () => {
      document.getElementById("restore-file-input").click();
    });
  }

  // Export to CSV
  const exportItem = document.getElementById("export-excel-item");
  if (exportItem) {
    exportItem.addEventListener("click", () => exportToCSV());
  }

  // Reset data
  const resetItem = document.getElementById("reset-data-item");
  if (resetItem) {
    resetItem.addEventListener("click", () => resetAllData());
  }

  // File input for restore
  const fileInput = document.getElementById("restore-file-input");
  if (fileInput) {
    fileInput.addEventListener("change", (e) => {
      if (e.target.files.length > 0) {
        restoreData(e.target.files[0]);
      }
    });
  }
}

// Toggle dark mode
function toggleDarkMode(isDark) {
  if (isDark) {
    document.documentElement.setAttribute("data-theme", "dark");
    localStorage.setItem("theme", "dark");
    currentSettings.theme = "dark";
  } else {
    document.documentElement.setAttribute("data-theme", "light");
    localStorage.setItem("theme", "light");
    currentSettings.theme = "light";
  }
  updateItem(STORES.SETTINGS, currentSettings);
  showToast(isDark ? "Mode gelap aktif" : "Mode terang aktif", "success");
}

// Show change PIN modal
async function showChangePinModal() {
  const modalContent = `
        <form id="change-pin-form">
            <div class="form-group">
                <label>PIN Lama</label>
                <input type="password" id="old-pin" class="form-input" maxlength="6" pattern="[0-9]*" inputmode="numeric" placeholder="6 digit angka" required>
            </div>
            <div class="form-group">
                <label>PIN Baru</label>
                <input type="password" id="new-pin" class="form-input" maxlength="6" pattern="[0-9]*" inputmode="numeric" placeholder="6 digit angka" required>
            </div>
            <div class="form-group">
                <label>Konfirmasi PIN Baru</label>
                <input type="password" id="confirm-pin" class="form-input" maxlength="6" pattern="[0-9]*" inputmode="numeric" placeholder="6 digit angka" required>
            </div>
            <div class="modal-buttons">
                <button type="button" class="btn-secondary modal-close-btn">Batal</button>
                <button type="submit" class="btn-primary">Ubah PIN</button>
            </div>
        </form>
    `;

  const modal = document.createElement("div");
  modal.className = "modal-overlay";
  modal.innerHTML = `
        <div class="modal-container modal-small">
            <div class="modal-header">
                <h3><i class="fas fa-key"></i> Ubah PIN</h3>
                <button class="modal-close-btn modal-close-x">&times;</button>
            </div>
            <div class="modal-body">
                ${modalContent}
            </div>
        </div>
    `;

  document.body.appendChild(modal);

  const form = modal.querySelector("#change-pin-form");
  form.addEventListener("submit", (e) => {
    e.preventDefault();

    const oldPin = modal.querySelector("#old-pin").value;
    const newPin = modal.querySelector("#new-pin").value;
    const confirmPin = modal.querySelector("#confirm-pin").value;

    const savedPin = localStorage.getItem("app_pin");

    if (!savedPin) {
      showToast("PIN belum diatur", "error");
      modal.remove();
      return;
    }

    if (oldPin !== savedPin) {
      showToast("PIN lama salah", "error");
      return;
    }

    if (newPin.length !== 6 || !/^\d+$/.test(newPin)) {
      showToast("PIN baru harus 6 digit angka", "error");
      return;
    }

    if (newPin !== confirmPin) {
      showToast("Konfirmasi PIN tidak cocok", "error");
      return;
    }

    localStorage.setItem("app_pin", newPin);
    showToast("PIN berhasil diubah", "success");
    modal.remove();
  });

  const closeModal = () => modal.remove();
  modal.querySelectorAll(".modal-close-btn").forEach((btn) => {
    btn.addEventListener("click", closeModal);
  });
  modal.addEventListener("click", (e) => {
    if (e.target === modal) closeModal();
  });
}

// Toggle PIN (disable)
function togglePin() {
  const hasPin = localStorage.getItem("app_pin");

  if (!hasPin) {
    showToast("PIN belum diatur", "error");
    return;
  }

  confirmDialog(
    "Apakah Anda yakin ingin menonaktifkan PIN? Aplikasi akan lebih rentan ke orang lain.",
    async (confirmed) => {
      if (confirmed) {
        localStorage.removeItem("app_pin");
        showToast("PIN berhasil dinonaktifkan", "success");
      }
    },
  );
}

// Backup data to JSON file
async function backupData() {
  showToast("Membackup data...", "info");

  try {
    const data = await exportAllData();
    const jsonStr = JSON.stringify(data, null, 2);
    const blob = new Blob([jsonStr], { type: "application/json" });
    const url = URL.createObjectURL(blob);

    const date = new Date();
    const filename = `money_manager_backup_${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, "0")}${String(date.getDate()).padStart(2, "0")}.json`;

    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    showToast("Backup berhasil!", "success");
  } catch (error) {
    console.error("Backup error:", error);
    showToast("Gagal backup data", "error");
  }
}

// Restore data from JSON file
async function restoreData(file) {
  confirmDialog(
    "Restore akan MENIMPA semua data saat ini. Yakin ingin melanjutkan?",
    async (confirmed) => {
      if (confirmed) {
        showToast("Memulihkan data...", "info");

        try {
          const text = await file.text();
          const data = JSON.parse(text);
          await importAllData(data);

          showToast("Restore berhasil! Aplikasi akan dimuat ulang.", "success");

          setTimeout(() => {
            window.location.reload();
          }, 1500);
        } catch (error) {
          console.error("Restore error:", error);
          showToast("File backup tidak valid", "error");
        }
      }
    },
  );
}

// Export to CSV
async function exportToCSV() {
  showToast("Mengekspor data...", "info");

  try {
    const transactions = await getAllItems(STORES.TRANSACTIONS);
    const wallets = await getAllItems(STORES.WALLETS);

    // Header
    const headers = [
      "ID",
      "Tanggal",
      "Waktu",
      "Tipe",
      "Kategori",
      "Deskripsi",
      "Nominal",
      "Catatan",
      "Dompet",
    ];
    const rows = [headers];

    // Data rows
    for (const t of transactions) {
      const wallet = wallets.find((w) => w.id === t.walletId);
      rows.push([
        t.id,
        t.date,
        t.time || "",
        t.type === "income" ? "Pemasukan" : "Pengeluaran",
        t.category || "",
        t.itemName,
        t.amount,
        t.note || "",
        wallet ? wallet.name : "",
      ]);
    }

    // Convert to CSV
    const csvContent = rows
      .map((row) =>
        row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","),
      )
      .join("\n");

    const blob = new Blob(["\uFEFF" + csvContent], {
      type: "text/csv;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);

    const date = new Date();
    const filename = `money_manager_transactions_${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, "0")}${String(date.getDate()).padStart(2, "0")}.csv`;

    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    showToast(`Export ${transactions.length} transaksi berhasil!`, "success");
  } catch (error) {
    console.error("Export error:", error);
    showToast("Gagal export data", "error");
  }
}

// Reset all data
async function resetAllData() {
  confirmDialog(
    "PERINGATAN! Reset akan menghapus SEMUA data Anda (transaksi, dompet, tabungan, piutang). Tindakan ini tidak bisa dibatalkan. Yakin?",
    async () => {
      try {
        showToast("Menghapus semua data...", "info");
        await clearAllData();
        localStorage.removeItem("app_pin");
        localStorage.removeItem("theme");
        showToast(
          "Semua data telah dihapus! Aplikasi akan dimuat ulang.",
          "success",
        );
        setTimeout(() => {
          window.location.reload();
        }, 1500);
      } catch (error) {
        console.error("Reset error:", error);
        showToast("Gagal menghapus data", "error");
      }
    },
  );
}

// Add styles
function addSettingsStyles() {
  if (document.getElementById("settings-styles")) return;

  const style = document.createElement("style");
  style.id = "settings-styles";
  style.textContent = `
        .settings-container {
            max-width: 700px;
            margin: 0 auto;
        }
        
        .settings-section {
            margin-bottom: 24px;
            padding: 0;
            overflow: hidden;
        }
        
        .section-header {
            display: flex;
            align-items: center;
            gap: 10px;
            padding: 16px 20px;
            background: var(--bg-primary);
            border-bottom: 1px solid var(--border-color);
        }
        
        .section-header i {
            font-size: 1.2rem;
            color: var(--info);
        }
        
        .section-header h3 {
            font-size: 1rem;
            margin: 0;
        }
        
        .settings-item {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 16px 20px;
            border-bottom: 1px solid var(--border-color);
        }
        
        .settings-item:last-child {
            border-bottom: none;
        }
        
        .settings-item.clickable {
            cursor: pointer;
            transition: background 0.2s ease;
        }
        
        .settings-item.clickable:hover {
            background: var(--bg-primary);
        }
        
        .settings-item.danger {
            color: #ef4444;
        }
        
        .settings-item.danger .item-title {
            color: #ef4444;
        }
        
        .item-info {
            flex: 1;
        }
        
        .item-title {
            display: block;
            font-weight: 500;
            margin-bottom: 4px;
        }
        
        .item-desc {
            font-size: 0.7rem;
            color: var(--text-secondary);
        }
        
        /* Switch Toggle */
        .switch {
            position: relative;
            display: inline-block;
            width: 50px;
            height: 24px;
        }
        
        .switch input {
            opacity: 0;
            width: 0;
            height: 0;
        }
        
        .slider {
            position: absolute;
            cursor: pointer;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background-color: #ccc;
            transition: 0.3s;
            border-radius: 24px;
        }
        
        .slider:before {
            position: absolute;
            content: "";
            height: 18px;
            width: 18px;
            left: 3px;
            bottom: 3px;
            background-color: white;
            transition: 0.3s;
            border-radius: 50%;
        }
        
        input:checked + .slider {
            background-color: var(--info);
        }
        
        input:checked + .slider:before {
            transform: translateX(26px);
        }
        
        .modal-small {
            max-width: 380px;
            width: 95%;
        }
        
        .form-group {
            margin-bottom: 16px;
        }
        
        .form-group label {
            display: block;
            margin-bottom: 6px;
            font-size: 0.85rem;
            font-weight: 500;
        }
        
        .form-input {
            width: 100%;
            padding: 10px 12px;
            border: 1px solid var(--border-color);
            border-radius: 8px;
            background: var(--bg-primary);
            color: var(--text-primary);
            font-size: 0.9rem;
        }
        
        .modal-buttons {
            display: flex;
            gap: 12px;
            margin-top: 20px;
        }
        
        .modal-buttons button {
            flex: 1;
            padding: 10px;
            border-radius: 8px;
            cursor: pointer;
            font-size: 0.85rem;
        }
        
        @media (max-width: 768px) {
            .settings-item {
                padding: 14px 16px;
            }
            
            .item-title {
                font-size: 0.9rem;
            }
        }
    `;

  document.head.appendChild(style);
}

// Helper
function escapeHtml(text) {
  if (!text) return "";
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}
