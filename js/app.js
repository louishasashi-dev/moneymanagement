// Main Application Entry Point
import {
  initDB,
  initializeDefaultData,
  updateItem,
  STORES,
  getAllItems,
} from "./db.js";
import { setupEventListeners, showToast } from "./utils.js";
import { renderDashboard } from "./dashboard.js";

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

    // Setup PWA
    setupPWA();

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

// Navigation Setup
function setupNavigation() {
  // Desktop navigation
  document.querySelectorAll(".nav-item").forEach((item) => {
    item.addEventListener("click", (e) => {
      e.preventDefault();
      const page = item.dataset.page;
      if (page) {
        navigateTo(page);
      }
    });
  });

  // Mobile bottom navigation
  document.querySelectorAll(".bottom-nav-item").forEach((item) => {
    item.addEventListener("click", () => {
      const page = item.dataset.page;
      if (page) {
        navigateTo(page);
      }
    });
  });
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
      case "transactions":
        const { renderTransactionsPage } = await import("./transaction.js");
        await renderTransactionsPage();
        break;
      case "wallets":
        const { renderWalletsPage } = await import("./wallet.js");
        await renderWalletsPage();
        break;
      case "savings":
        const { renderSavingsPage } = await import("./savings.js");
        await renderSavingsPage();
        break;
      case "debts":
        const { renderDebtsPage } = await import("./debt.js");
        await renderDebtsPage();
        break;
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

// Check PIN Status
function checkPINStatus() {
  const hasPIN = localStorage.getItem("app_pin");
  const pinScreen = document.getElementById("pin-screen");

  if (hasPIN) {
    // Show PIN screen
    pinScreen.classList.remove("hidden");
    setupPINHandler();
  } else {
    // First time setup - ask to create PIN
    const newPIN = prompt("Buat PIN 6 digit untuk keamanan:");
    if (newPIN && newPIN.length === 6 && /^\d+$/.test(newPIN)) {
      localStorage.setItem("app_pin", newPIN);
      showToast("PIN berhasil dibuat!", "success");
    } else if (newPIN) {
      alert("PIN harus 6 digit angka!");
    }
  }
}

// Setup PIN Handler
function setupPINHandler() {
  const pinInput = document.getElementById("pin-input");
  const keypadButtons = document.querySelectorAll("[data-pin]");

  keypadButtons.forEach((btn) => {
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
      .register("./js/service-worker.js")
      .then((reg) => console.log("Service Worker registered:", reg))
      .catch((err) => console.log("Service Worker registration failed:", err));
  }
}

// Start App
document.addEventListener("DOMContentLoaded", initApp);
