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
                <div class="settings-item">
                    <div class="item-info">
                        <span class="item-title">Tema Warna</span>
                        <span class="item-desc">Pilih tema tampilan aplikasi</span>
                    </div>
                    <select id="theme-selector" class="form-input" style="width:auto;padding:6px 10px;font-size:.85rem;">
                        <option value="light"    ${currentTheme === "light" ? "selected" : ""}>☀️ Default</option>
                        <option value="dark"     ${currentTheme === "dark" ? "selected" : ""}>🌙 Gelap</option>
                        <option value="vintage"  ${currentTheme === "vintage" ? "selected" : ""}>🎨 Vintage</option>
                        <option value="nature"   ${currentTheme === "nature" ? "selected" : ""}>🌿 Nature</option>
                    </select>
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
                        <span class="item-title">Kelola PIN</span>
<span class="item-desc">Aktifkan, nonaktifkan, atau ubah PIN</span>
                    </div>
                    <i class="fas fa-chevron-right"></i>
                </div>
                <div class="settings-item clickable" id="reset-pin-item">
                    <div class="item-info">
                        <span class="item-title">Reset PIN</span>
                        <span class="item-desc">Lupa PIN? Hapus PIN lama dan buat PIN baru (data Anda aman)</span>
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
                <div class="settings-item clickable" id="backup-folder-item">
                    <div class="item-info">
                        <span class="item-title">Folder Backup</span>
                        <span class="item-desc" id="backup-folder-desc">Atur lokasi penyimpanan backup</span>
                    </div>
                    <i class="fas fa-folder-open"></i>
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
                <div class="settings-item clickable" id="manage-categories-item">
                    <div class="item-info">
                        <span class="item-title">Kelola Kategori</span>
                        <span class="item-desc">Tambah atau hapus kategori transaksi</span>
                    </div>
                    <i class="fas fa-tags"></i>
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
            
 <!-- Developer Section -->
            <div class="settings-section card">
                <div class="section-header">
                    <i class="fas fa-code"></i>
                    <h3>Developer</h3>
                </div>
                <div class="settings-item">
                    <div class="item-info">
                        <span class="item-title">Dibuat oleh</span>
                        <span class="item-desc">Louis Hasashi Halim</span>
                    </div>
                </div>
                <a href="https://github.com/louishasashi-dev" target="_blank" class="settings-item clickable" style="text-decoration:none;">
                    <div class="item-info">
                        <span class="item-title"><i class="fab fa-github" style="margin-right:8px;"></i>GitHub</span>
                    </div>
                    <i class="fas fa-external-link-alt" style="color:var(--text-secondary);font-size:.8rem;"></i>
                </a>
                <a href="https://www.instagram.com/lhshlm9/" target="_blank" class="settings-item clickable" style="text-decoration:none;">
                    <div class="item-info">
                        <span class="item-title"><i class="fab fa-instagram" style="margin-right:8px;color:#e1306c;"></i>Instagram</span>
                    </div>
                    <i class="fas fa-external-link-alt" style="color:var(--text-secondary);font-size:.8rem;"></i>
                </a>
                <a href="https://www.youtube.com/@louisskyzhii7203" target="_blank" class="settings-item clickable" style="text-decoration:none;">
                    <div class="item-info">
                        <span class="item-title"><i class="fab fa-youtube" style="margin-right:8px;color:#ff0000;"></i>YouTube</span>
                    </div>
                    <i class="fas fa-external-link-alt" style="color:var(--text-secondary);font-size:.8rem;"></i>
                </a>
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

  // Theme selector
  const themeSelector = document.getElementById("theme-selector");
  if (themeSelector) {
    themeSelector.addEventListener("change", (e) => {
      applyTheme(e.target.value);
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

  // Reset PIN (lupa PIN)
  const resetPinItem = document.getElementById("reset-pin-item");
  if (resetPinItem) {
    resetPinItem.addEventListener("click", () => resetPin());
  }

  // Backup data
  const backupItem = document.getElementById("backup-data-item");
  if (backupItem) {
    backupItem.addEventListener("click", () => backupData());
  }

  // Backup folder setting
  const backupFolderItem = document.getElementById("backup-folder-item");
  if (backupFolderItem) {
    backupFolderItem.addEventListener("click", () => showBackupFolderModal());
  }

  // Update tampilan folder desc saat load
  updateBackupFolderDesc();

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

  // Manage categories
  const manageCatItem = document.getElementById("manage-categories-item");
  if (manageCatItem) {
    manageCatItem.addEventListener("click", () => showManageCategoriesModal());
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

// Reset PIN (lupa PIN) - menghapus PIN lama tanpa menyentuh data lain
function resetPin() {
  const hasAnyPin =
    localStorage.getItem("app_pin") || localStorage.getItem("app_pin_value");

  if (!hasAnyPin) {
    showToast("Belum ada PIN yang diatur", "error");
    return;
  }

  confirmDialog(
    "Reset PIN? PIN lama akan dihapus dan Anda akan membuat PIN baru. Data transaksi dan dompet Anda TIDAK akan terhapus.",
    async (confirmed) => {
      if (confirmed) {
        localStorage.removeItem("app_pin");
        localStorage.removeItem("app_pin_value");
        localStorage.removeItem("app_pin_disabled");
        showToast("PIN lama dihapus. Silakan buat PIN baru.", "success");
        showSetNewPinModal();
      }
    },
  );
}

// Apply tema
function applyTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme);
  localStorage.setItem("theme", theme);
  currentSettings.theme = theme;
  updateItem(STORES.SETTINGS, currentSettings);

  // Sync dark mode toggle
  const darkToggle = document.getElementById("dark-mode-toggle");
  if (darkToggle) darkToggle.checked = theme === "dark";

  const names = {
    light: "Default",
    dark: "Gelap",
    vintage: "Vintage",
    nature: "Nature",
  };
  showToast(`Tema ${names[theme] || theme} aktif`, "success");
}

// Toggle dark mode
function toggleDarkMode(isDark) {
  const theme = isDark ? "dark" : "light";
  applyTheme(theme);

  const selector = document.getElementById("theme-selector");
  if (selector) selector.value = theme;
}

// Toggle PIN (disable/enable)
function togglePin() {
  const pinDisabled = localStorage.getItem("app_pin_disabled") === "true";
  const activePin = localStorage.getItem("app_pin");
  const savedValue = localStorage.getItem("app_pin_value");
  const hasAnyPin = activePin || savedValue;

  if (!hasAnyPin) {
    showSetNewPinModal();
    return;
  }

  if (pinDisabled) {
    confirmDialog("Aktifkan PIN kembali?", async (confirmed) => {
      if (confirmed) {
        const pinToRestore = savedValue || activePin;
        localStorage.setItem("app_pin", pinToRestore);
        localStorage.setItem("app_pin_value", pinToRestore);
        localStorage.removeItem("app_pin_disabled");
        showToast("PIN berhasil diaktifkan", "success");
      }
    });
  } else {
    confirmDialog(
      "Apakah Anda yakin ingin menonaktifkan PIN? Aplikasi akan lebih rentan ke orang lain.",
      async (confirmed) => {
        if (confirmed) {
          const pinToSave = activePin || savedValue;
          localStorage.setItem("app_pin_value", pinToSave);
          localStorage.removeItem("app_pin");
          localStorage.setItem("app_pin_disabled", "true");
          showToast("PIN berhasil dinonaktifkan", "success");
        }
      },
    );
  }
}

// Modal buat PIN baru (saat belum ada PIN sama sekali)
function showSetNewPinModal() {
  const modal = document.createElement("div");
  modal.className = "modal-overlay";
  modal.innerHTML = `
    <div class="modal-container modal-small">
      <div class="modal-header">
        <h3><i class="fas fa-key"></i> Buat PIN Baru</h3>
        <button class="modal-close-btn modal-close-x">&times;</button>
      </div>
      <div class="modal-body">
        <form id="new-pin-form">
          <div class="form-group">
            <label>PIN Baru</label>
            <input type="password" id="set-new-pin" class="form-input" maxlength="6" pattern="[0-9]*" inputmode="numeric" placeholder="6 digit angka" required>
          </div>
          <div class="form-group">
            <label>Konfirmasi PIN</label>
            <input type="password" id="set-confirm-pin" class="form-input" maxlength="6" pattern="[0-9]*" inputmode="numeric" placeholder="6 digit angka" required>
          </div>
          <div class="modal-buttons">
            <button type="button" class="btn-secondary modal-close-btn">Batal</button>
            <button type="submit" class="btn-primary">Simpan PIN</button>
          </div>
        </form>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  modal.querySelector("#new-pin-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const newPin = modal.querySelector("#set-new-pin").value;
    const confirmPin = modal.querySelector("#set-confirm-pin").value;

    if (newPin.length !== 6 || !/^\d+$/.test(newPin)) {
      showToast("PIN harus 6 digit angka", "error");
      return;
    }
    if (newPin !== confirmPin) {
      showToast("Konfirmasi PIN tidak cocok", "error");
      return;
    }

    localStorage.setItem("app_pin", newPin);
    localStorage.setItem("app_pin_value", newPin);
    localStorage.removeItem("app_pin_disabled");
    showToast("PIN berhasil dibuat dan diaktifkan", "success");
    modal.remove();
  });

  const closeModal = () => modal.remove();
  modal
    .querySelectorAll(".modal-close-btn")
    .forEach((btn) => btn.addEventListener("click", closeModal));
  modal.addEventListener("click", (e) => {
    if (e.target === modal) closeModal();
  });
}

// Show change PIN modal
async function showChangePinModal() {
  const currentPin =
    localStorage.getItem("app_pin") || localStorage.getItem("app_pin_value");
  const pinDisabled = localStorage.getItem("app_pin_disabled") === "true";

  if (!currentPin) {
    showToast(
      "PIN belum diatur. Gunakan Kelola PIN untuk mengatur PIN baru.",
      "error",
    );
    return;
  }

  const modal = document.createElement("div");
  modal.className = "modal-overlay";
  modal.innerHTML = `
    <div class="modal-container modal-small">
      <div class="modal-header">
        <h3><i class="fas fa-key"></i> Ubah PIN</h3>
        <button class="modal-close-btn modal-close-x">&times;</button>
      </div>
      <div class="modal-body">
        <form id="change-pin-form">
          ${pinDisabled ? `<div class="form-group"><p style="color:orange;font-size:0.85em;margin:0 0 8px;"><i class="fas fa-info-circle"></i> PIN sedang nonaktif. PIN baru akan tersimpan tapi tetap nonaktif.</p></div>` : ""}
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
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  modal.querySelector("#change-pin-form").addEventListener("submit", (e) => {
    e.preventDefault();

    const oldPin = modal.querySelector("#old-pin").value;
    const newPin = modal.querySelector("#new-pin").value;
    const confirmPin = modal.querySelector("#confirm-pin").value;

    const storedPin =
      localStorage.getItem("app_pin") || localStorage.getItem("app_pin_value");

    if (oldPin !== storedPin) {
      showToast("PIN lama salah", "error");
      modal.querySelector("#old-pin").value = "";
      modal.querySelector("#old-pin").focus();
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

    const isPinDisabled = localStorage.getItem("app_pin_disabled") === "true";
    localStorage.setItem("app_pin_value", newPin);

    if (isPinDisabled) {
      showToast("PIN berhasil diubah (PIN masih nonaktif)", "success");
    } else {
      localStorage.setItem("app_pin", newPin);
      showToast("PIN berhasil diubah", "success");
    }

    modal.remove();
  });

  const closeModal = () => modal.remove();
  modal
    .querySelectorAll(".modal-close-btn")
    .forEach((btn) => btn.addEventListener("click", closeModal));
  modal.addEventListener("click", (e) => {
    if (e.target === modal) closeModal();
  });
}

// ─── Backup folder helpers ────────────────────────────────────────────────────

function getBackupFolderName() {
  return localStorage.getItem("backup_folder_name") || "";
}

function setBackupFolderName(name) {
  localStorage.setItem("backup_folder_name", name.trim());
}

function getBackupFilename() {
  // Nama file selalu tetap agar file lama tertimpa saat download ke folder yg sama
  return "money_manager_backup.json";
}

function updateBackupFolderDesc() {
  const el = document.getElementById("backup-folder-desc");
  if (!el) return;
  const folder = getBackupFolderName();
  el.textContent = folder
    ? `Folder: ${folder}`
    : "Belum diatur — file disimpan ke folder Download default";
}

function showBackupFolderModal() {
  document.getElementById("backup-folder-modal")?.remove();

  const current = getBackupFolderName();
  const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

  // Petunjuk berbeda antara mobile dan desktop
  const guideHtml = isMobile
    ? `<div style="
        background:var(--bg-primary);border-radius:10px;
        padding:12px 14px;font-size:.82rem;color:var(--text-secondary);
        line-height:1.6;margin-bottom:16px;
      ">
        <strong style="color:var(--text-primary);">📱 Cara pakai di Android:</strong><br>
        1. Buka <em>File Manager</em> di HP kamu.<br>
        2. Buat folder baru, misalnya <code>MoneyManagerBackup</code>.<br>
        3. Ketik nama folder yang sama di kolom di atas (hanya sebagai label — tidak membuat folder otomatis).<br>
        4. Setiap kali backup, pindahkan file <strong>${getBackupFilename()}</strong> ke folder tersebut secara manual, atau biarkan di Downloads.<br>
        <br>
        <strong style="color:var(--text-primary);">💡 Tips:</strong> Karena nama file backup selalu sama (<strong>${getBackupFilename()}</strong>), file lama akan tertimpa jika kamu download ke folder yang sama — tidak akan menumpuk.
      </div>`
    : `<div style="
        background:var(--bg-primary);border-radius:10px;
        padding:12px 14px;font-size:.82rem;color:var(--text-secondary);
        line-height:1.6;margin-bottom:16px;
      ">
        <strong style="color:var(--text-primary);">🖥️ Cara pakai di Desktop/PC:</strong><br>
        1. Buat folder khusus di komputer kamu, misalnya <code>D:\\BackupKeuangan</code>.<br>
        2. Ketik nama atau path folder di kolom di atas (hanya sebagai label pengingat).<br>
        3. Setiap kali backup, browser akan mendownload file <strong>${getBackupFilename()}</strong>.<br>
        4. Pindahkan atau arahkan browser kamu agar menyimpan ke folder tersebut.<br>
        &nbsp;&nbsp;&nbsp;<em>(Chrome: Pengaturan → Downloads → ubah lokasi download)</em><br>
        <br>
        <strong style="color:var(--text-primary);">💡 Tips:</strong> Nama file selalu sama, jadi file lama akan tertimpa otomatis jika folder download-mu sama.
      </div>`;

  const modal = document.createElement("div");
  modal.id = "backup-folder-modal";
  modal.className = "modal-overlay";
  modal.innerHTML = `
    <div class="modal-container modal-small" style="max-width:440px;width:95%;">
      <div class="modal-header">
        <h3><i class="fas fa-folder-open"></i> Pengaturan Folder Backup</h3>
        <button class="modal-close-x" style="background:none;border:none;font-size:24px;cursor:pointer;color:var(--text-secondary);padding:0 8px;">&times;</button>
      </div>
      <div class="modal-body">
        ${guideHtml}
        <div class="form-group">
          <label style="font-size:.85rem;font-weight:500;display:block;margin-bottom:6px;">
            Nama / Label Folder Backup
          </label>
          <input
            type="text"
            id="backup-folder-input"
            class="form-input"
            placeholder="Contoh: MoneyManagerBackup atau D:\\BackupKeuangan"
            value="${escapeHtml(current)}"
          >
          <small style="color:var(--text-secondary);font-size:.75rem;display:block;margin-top:4px;">
            Ini hanya label pengingat. Nama file backup akan selalu: <strong>${getBackupFilename()}</strong>
          </small>
        </div>
        <div class="modal-buttons">
          <button type="button" class="btn-secondary" id="backup-folder-cancel">Batal</button>
          <button type="button" class="btn-primary" id="backup-folder-save">Simpan</button>
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  modal.querySelector("#backup-folder-save").addEventListener("click", () => {
    const val = modal.querySelector("#backup-folder-input").value;
    setBackupFolderName(val);
    updateBackupFolderDesc();
    showToast("Pengaturan folder backup disimpan", "success");
    modal.remove();
  });

  const close = () => modal.remove();
  modal.querySelector(".modal-close-x").addEventListener("click", close);
  modal.querySelector("#backup-folder-cancel").addEventListener("click", close);
  modal.addEventListener("click", (e) => {
    if (e.target === modal) close();
  });
}

// ─── backupData (nama file tetap, dengan info folder) ────────────────────────

async function backupData() {
  showToast("Menyiapkan backup...", "info");

  try {
    const data = await exportAllData();
    const jsonStr = JSON.stringify(data, null, 2);
    const blob = new Blob([jsonStr], { type: "application/json" });

    // Nama file SELALU TETAP — file lama akan tertimpa jika disimpan di folder yang sama
    const filename = getBackupFilename();
    const folderName = getBackupFolderName();

    const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

    if (isMobile) {
      document.getElementById("backup-overlay")?.remove();

      const url = URL.createObjectURL(blob);

      const folderInfo = folderName
        ? `<p style="margin:0 0 4px;color:var(--text-secondary);font-size:.82rem;">
            📁 Folder tujuan: <strong>${escapeHtml(folderName)}</strong><br>
            <span style="font-size:.78rem;">Pindahkan file ke folder tersebut setelah didownload.</span>
           </p>`
        : `<p style="margin:0 0 4px;color:var(--text-secondary);font-size:.82rem;">
            💡 Belum ada folder yang diatur. Atur folder di <em>Pengaturan Folder Backup</em>.
           </p>`;

      const overlay = document.createElement("div");
      overlay.id = "backup-overlay";
      overlay.style.cssText = `
        position:fixed;inset:0;background:rgba(0,0,0,.5);
        z-index:99999;display:flex;align-items:flex-end;justify-content:center;
      `;
      overlay.innerHTML = `
        <div style="
          background:var(--bg-secondary);width:100%;max-width:480px;
          border-radius:20px 20px 0 0;padding:24px 24px 36px;
        ">
          <div style="width:40px;height:4px;background:var(--border-color);border-radius:2px;margin:0 auto 20px;"></div>
          <h3 style="margin:0 0 8px;font-size:1.1rem;">💾 Backup Siap</h3>
          <p style="margin:0 0 6px;color:var(--text-secondary);font-size:.9rem;">
            File: <strong>${filename}</strong>
          </p>
          ${folderInfo}
          <div style="margin-bottom:16px;"></div>
          <a id="backup-download-btn" href="${url}" download="${filename}" style="
            display:block;width:100%;padding:14px;text-align:center;
            background:var(--info);color:#fff;border-radius:12px;
            font-size:1rem;font-weight:600;text-decoration:none;
            box-sizing:border-box;margin-bottom:10px;
          ">
            <i class="fas fa-download"></i>&nbsp; Download File
          </a>
          <button id="backup-close-btn" style="
            display:block;width:100%;padding:12px;text-align:center;
            background:var(--border-color);color:var(--text-primary);
            border:none;border-radius:12px;font-size:.95rem;cursor:pointer;
          ">Tutup</button>
        </div>
      `;
      document.body.appendChild(overlay);

      let closed = false;
      const close = (revokeUrl = true) => {
        if (closed) return;
        closed = true;
        overlay.remove();
        if (revokeUrl) setTimeout(() => URL.revokeObjectURL(url), 5000);
        else URL.revokeObjectURL(url);
      };

      overlay
        .querySelector("#backup-download-btn")
        .addEventListener("click", () => {
          showToast("Backup berhasil didownload!", "success");
          setTimeout(() => close(false), 1000);
        });

      overlay
        .querySelector("#backup-close-btn")
        .addEventListener("click", () => close(false));
      overlay.addEventListener("click", (e) => {
        if (e.target === overlay) close(false);
      });
    } else {
      // Desktop
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 3000);

      const msg = folderName
        ? `Backup berhasil! Simpan ke folder: ${folderName}`
        : "Backup berhasil!";
      showToast(msg, "success");
    }
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

async function exportToCSV() {
  showToast("Mengekspor data...", "info");

  try {
    const transactions = await getAllItems(STORES.TRANSACTIONS);
    const wallets = await getAllItems(STORES.WALLETS);

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

    const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

    if (isMobile) {
      document.getElementById("csv-overlay")?.remove();

      const overlay = document.createElement("div");
      overlay.id = "csv-overlay";
      overlay.style.cssText = `
        position:fixed;inset:0;background:rgba(0,0,0,.5);
        z-index:99999;display:flex;align-items:flex-end;justify-content:center;
      `;
      overlay.innerHTML = `
        <div style="
          background:var(--bg-secondary);width:100%;max-width:480px;
          border-radius:20px 20px 0 0;padding:24px 24px 36px;
        ">
          <div style="width:40px;height:4px;background:var(--border-color);border-radius:2px;margin:0 auto 20px;"></div>
          <h3 style="margin:0 0 6px;font-size:1.1rem;">📊 Export CSV Siap</h3>
          <p style="margin:0 0 20px;color:var(--text-secondary);font-size:.9rem;">
            <strong>${transactions.length}</strong> transaksi siap diexport.<br>
            File: <strong>${filename}</strong>
          </p>
          <a id="csv-download-btn" href="${url}" download="${filename}" style="
            display:block;width:100%;padding:14px;text-align:center;
            background:var(--info);color:#fff;border-radius:12px;
            font-size:1rem;font-weight:600;text-decoration:none;
            box-sizing:border-box;margin-bottom:10px;
          ">
            <i class="fas fa-file-csv"></i>&nbsp; Download CSV
          </a>
          <button id="csv-close-btn" style="
            display:block;width:100%;padding:12px;text-align:center;
            background:var(--border-color);color:var(--text-primary);
            border:none;border-radius:12px;font-size:.95rem;cursor:pointer;
          ">Tutup</button>
        </div>
      `;
      document.body.appendChild(overlay);

      let closed = false;
      const close = () => {
        if (closed) return;
        closed = true;
        overlay.remove();
        URL.revokeObjectURL(url);
      };

      overlay
        .querySelector("#csv-download-btn")
        .addEventListener("click", () => {
          showToast(
            `Export ${transactions.length} transaksi berhasil!`,
            "success",
          );
          close();
        });
      overlay.querySelector("#csv-close-btn").addEventListener("click", close);
      overlay.addEventListener("click", (e) => {
        if (e.target === overlay) close();
      });
    } else {
      // Desktop
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      showToast(`Export ${transactions.length} transaksi berhasil!`, "success");
    }
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
        localStorage.removeItem("app_pin_value");
        localStorage.removeItem("app_pin_disabled");
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

// Modal kelola kategori
async function showManageCategoriesModal() {
  document.getElementById("categories-modal")?.remove();

  const categories = await getAllItems(STORES.CATEGORIES);
  const incomes = categories.filter((c) => c.type === "income");
  const expenses = categories.filter((c) => c.type === "expense");

  const renderList = (list) =>
    list
      .map(
        (c) => `
    <div style="display:flex;justify-content:space-between;align-items:center;padding:10px 0;border-bottom:1px solid var(--border-color);">
      <span>${c.name}</span>
      <button class="delete-cat-btn" data-id="${c.id}" style="
        background:none;border:none;color:#ef4444;cursor:pointer;font-size:.9rem;padding:4px 8px;
      "><i class="fas fa-trash"></i></button>
    </div>
  `,
      )
      .join("") ||
    `<p style="color:var(--text-secondary);font-size:.85rem;">Belum ada kategori</p>`;

  const modal = document.createElement("div");
  modal.id = "categories-modal";
  modal.className = "modal-overlay";
  modal.innerHTML = `
    <div class="modal-container modal-medium" style="max-width:460px;width:95%;max-height:85vh;overflow:auto;">
      <div class="modal-header">
        <h3><i class="fas fa-tags"></i> Kelola Kategori</h3>
        <button class="modal-close-x" style="background:none;border:none;font-size:24px;cursor:pointer;">&times;</button>
      </div>
      <div class="modal-body">

        <!-- Tambah kategori baru -->
        <div style="display:flex;gap:8px;margin-bottom:20px;">
          <input type="text" id="new-cat-name" class="form-input" placeholder="Nama kategori baru" style="flex:1;">
          <select id="new-cat-type" class="form-input" style="width:130px;">
            <option value="expense">Pengeluaran</option>
            <option value="income">Pemasukan</option>
          </select>
          <button id="add-cat-btn" style="
            padding:10px 14px;background:var(--info);color:#fff;
            border:none;border-radius:8px;cursor:pointer;white-space:nowrap;
          "><i class="fas fa-plus"></i></button>
        </div>

        <h4 style="margin-bottom:8px;">📤 Pengeluaran</h4>
        <div id="expense-cat-list">${renderList(expenses)}</div>

        <h4 style="margin:16px 0 8px;">📥 Pemasukan</h4>
        <div id="income-cat-list">${renderList(incomes)}</div>

      </div>
    </div>
  `;

  document.body.appendChild(modal);

  const close = () => modal.remove();
  modal.querySelector(".modal-close-x").addEventListener("click", close);
  modal.addEventListener("click", (e) => {
    if (e.target === modal) close();
  });

  // Tambah kategori
  modal.querySelector("#add-cat-btn").addEventListener("click", async () => {
    const name = modal.querySelector("#new-cat-name").value.trim();
    const type = modal.querySelector("#new-cat-type").value;
    if (!name) {
      showToast("Nama kategori harus diisi", "error");
      return;
    }

    const existing = await getAllItems(STORES.CATEGORIES);
    const isDupe = existing.some(
      (c) => c.name.toLowerCase() === name.toLowerCase() && c.type === type,
    );
    if (isDupe) {
      showToast("Kategori sudah ada", "error");
      return;
    }

    await addItem(STORES.CATEGORIES, {
      name,
      type,
      icon: type === "income" ? "fa-arrow-up" : "fa-arrow-down",
      color: type === "income" ? "#10b981" : "#ef4444",
    });
    showToast("Kategori ditambahkan", "success");
    modal.remove();
    showManageCategoriesModal();
  });

  // Hapus kategori
  modal.querySelectorAll(".delete-cat-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      confirmDialog("Hapus kategori ini?", async () => {
        await deleteItem(STORES.CATEGORIES, Number(btn.dataset.id));
        showToast("Kategori dihapus", "success");
        modal.remove();
        showManageCategoriesModal();
      });
    });
  });
}

// Helper
function escapeHtml(text) {
  if (!text) return "";
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}
