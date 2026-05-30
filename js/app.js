// Main Application Entry Point
import {
  initDB,
  initializeDefaultData,
  getAllItems,
  addItem,
  updateItem,
  deleteItem,
  getTransactionsByDateRange,
  STORES,
  searchTransactions,
} from "./db.js";
import { setupEventListeners, showToast } from "./utils.js";
import { renderDashboard } from "./dashboard.js";
import {
  checkAndCreateNotifications,
  cleanOldNotifications,
  getUnreadNotifications,
} from "./notifications.js";
import { processRecurringTransactions } from "./recurring.js";

// App State
let currentPage = "dashboard";
let db = null;

// Make navigateTo available globally
window.navigateTo = navigateTo;

// Initialize App
async function initApp() {
  try {
    // Show loading
    showLoading(true);

    // Initialize IndexedDB
    db = await initDB();
    window.appDB = db;

    // Initialize default data (wallets, categories, settings)
    await initializeDefaultData();

    // Check PIN Setup
    checkPINStatus();

    // Setup Navigation
    setupNavigation();

    // Setup Global Event Listeners
    setupEventListeners();

    // Load Initial Page
    await loadPage("dashboard");

    // Terapkan tema tersimpan
    const savedTheme = localStorage.getItem("theme") || "light";
    document.documentElement.setAttribute("data-theme", savedTheme);

    // Setup PWA
    // Setup PWA
    setupPWA();

    // Proses recurring transactions
    await processRecurringTransactions();

    // Cek & buat notifikasi
    await checkAndCreateNotifications();
    await cleanOldNotifications();

    // Update badge notifikasi
    await updateNotificationBadge();

    showLoading(false);
    showToast("Aplikasi siap digunakan!", "success");
  } catch (error) {
    console.error("Failed to initialize app:", error);
    showLoading(false);
    showToast("Gagal memuat aplikasi", "error");
  }
}

function showLoading(show) {
  let loader = document.getElementById("app-loader");
  if (show && !loader) {
    loader = document.createElement("div");
    loader.id = "app-loader";
    loader.innerHTML = '<div class="spinner"></div>';
    loader.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0,0,0,0.5);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 9999;
        `;
    document.body.appendChild(loader);

    const spinnerStyle = document.createElement("style");
    spinnerStyle.textContent = `
            .spinner {
                width: 50px;
                height: 50px;
                border: 4px solid var(--bg-secondary);
                border-top-color: var(--info);
                border-radius: 50%;
                animation: spin 0.8s linear infinite;
            }
            @keyframes spin {
                to { transform: rotate(360deg); }
            }
        `;
    document.head.appendChild(spinnerStyle);
  } else if (!show && loader) {
    loader.remove();
  }
}

function setupNavigation() {
  // Desktop navigation
  document.querySelectorAll(".nav-item").forEach((item) => {
    item.addEventListener("click", (e) => {
      e.preventDefault();
      const page = item.dataset.page;
      if (page) navigateTo(page);
    });
  });

  // Mobile bottom navigation (5 tombol utama)
  document.querySelectorAll(".bottom-nav-item").forEach((item) => {
    item.addEventListener("click", () => {
      const page = item.dataset.page;
      if (page) navigateTo(page);
    });
  });

  // Tombol "Lainnya"
  const moreBtn = document.getElementById("bottom-nav-more");
  const drawer = document.getElementById("more-menu-drawer");
  const backdrop = drawer?.querySelector(".more-menu-backdrop");

  if (moreBtn && drawer) {
    moreBtn.addEventListener("click", () => {
      drawer.classList.toggle("hidden");
    });
    backdrop?.addEventListener("click", () => {
      drawer.classList.add("hidden");
    });
    // Tombol di dalam drawer
    drawer.querySelectorAll(".more-menu-item").forEach((item) => {
      item.addEventListener("click", () => {
        const page = item.dataset.page;
        drawer.classList.add("hidden");
        if (page) navigateTo(page);
      });
    });
  }
}

// Navigate to Page
async function navigateTo(page) {
  currentPage = page;

  // Update active states
  document.querySelectorAll(".nav-item, .bottom-nav-item").forEach((item) => {
    if (item.dataset.page === page) {
      item.classList.add("active");
    } else {
      item.classList.remove("active");
    }
  });

  // Close mobile sidebar if open
  const sidebar = document.getElementById("sidebar");
  if (sidebar && sidebar.classList.contains("open")) {
    sidebar.classList.remove("open");
  }

  // Close more-menu drawer if open
  document.getElementById("more-menu-drawer")?.classList.add("hidden");

  // Load page content
  await loadPage(page);
}

// Load Page Content
async function loadPage(page) {
  const contentDiv = document.getElementById("page-content");
  if (!contentDiv) return;

  showLoading(true);

  try {
    switch (page) {
      case "dashboard":
        await renderDashboard();
        break;
      case "transactions": {
        const { renderTransactionsPage } = await import("./transaction.js");
        await renderTransactionsPage();
        break;
      }
      case "wallets": {
        const { renderWalletsPage } = await import("./wallet.js");
        await renderWalletsPage();
        break;
      }
      case "savings": {
        const { renderSavingsPage } = await import("./savings.js");
        await renderSavingsPage();
        break;
      }
      case "debts": {
        const { renderDebtsPage } = await import("./debt.js");
        await renderDebtsPage();
        break;
      }
      case "reports":
        try {
          const module = await import("./report.js");
          await module.renderReportsPage();
        } catch (error) {
          console.error("Error loading reports:", error);
          contentDiv.innerHTML =
            '<div class="card error"><h2>Gagal memuat Laporan</h2><p>' +
            error.message +
            "</p></div>";
        }
        break;
      case "notifications": {
        const { renderNotificationsPage } = await import("./notifications.js");
        await renderNotificationsPage();
        break;
      }
      case "recurring": {
        const { renderRecurringPage } = await import("./recurring.js");
        await renderRecurringPage();
        break;
      }
      case "settings":
        try {
          const { renderSettingsPage } = await import("./settings.js");
          await renderSettingsPage();
        } catch (error) {
          console.error("Error loading settings:", error);
          contentDiv.innerHTML =
            '<div class="card error"><h2>Gagal memuat Pengaturan</h2><p>' +
            error.message +
            "</p></div>";
        }
        break;
      default:
        contentDiv.innerHTML =
          '<div class="card"><h2>Halaman tidak ditemukan</h2></div>';
    }
  } catch (error) {
    console.error("Error loading page:", error);
    contentDiv.innerHTML =
      '<div class="card error"><h2>Gagal memuat halaman</h2><p>' +
      error.message +
      "</p></div>";
  }

  showLoading(false);
}

function checkPINStatus() {
  const hasPIN = localStorage.getItem("app_pin");
  const pinScreen = document.getElementById("pin-screen");

  if (hasPIN) {
    pinScreen.classList.remove("hidden");
    setupPINHandler();
  }
}

function setupPINHandler() {
  const pinInput = document.getElementById("pin-input");
  const keypadButtons = document.querySelectorAll("[data-pin]");

  // Hapus listener lama dulu supaya tidak ganda
  keypadButtons.forEach((btn) => {
    const newBtn = btn.cloneNode(true);
    btn.parentNode.replaceChild(newBtn, btn);
  });

  // Pasang listener baru
  document.querySelectorAll("[data-pin]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const value = btn.dataset.pin;

      if (value === "clear") {
        pinInput.value = "";
      } else if (value === "enter") {
        const enteredPIN = pinInput.value;
        const savedPIN = localStorage.getItem("app_pin");

        if (enteredPIN === savedPIN) {
          document.getElementById("pin-screen").classList.add("hidden");
          pinInput.value = "";
          showToast("Selamat datang kembali!", "success");
        } else {
          showToast("PIN salah!", "error");
          pinInput.value = "";
          // Efek getar input kalau salah
          pinInput.style.borderColor = "#ef4444";
          setTimeout(() => {
            pinInput.style.borderColor = "";
          }, 800);
        }
      } else {
        if (pinInput.value.length < 6) {
          pinInput.value += value;
        }
      }
    });
  });
}
function setupPWA() {
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker
      .register("/moneymanagement/js/service-worker.js", {
        scope: "/moneymanagement/",
      })
      .then((reg) => console.log("Service Worker registered:", reg))
      .catch((err) => console.log("Service Worker registration failed:", err));
  }
}

// Update badge angka notifikasi di nav
async function updateNotificationBadge() {
  const unread = await getUnreadNotifications();
  const count = unread.length;
  const badge = document.getElementById("notif-badge");
  if (badge) {
    badge.textContent = count;
    badge.style.display = count > 0 ? "flex" : "none";
  }
}

// Expose untuk dipakai di file lain
window.updateNotificationBadge = updateNotificationBadge;
// Start App
document.addEventListener("DOMContentLoaded", initApp);
