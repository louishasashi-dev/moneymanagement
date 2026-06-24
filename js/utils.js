// Utility Functions
// Helper functions yang digunakan di seluruh aplikasi

// Format Currency
export function formatCurrency(amount, currency = "IDR") {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

// Format Date
export function formatDate(date, format = "dd/mm/yyyy") {
  const d = new Date(date);
  const day = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const year = d.getFullYear();
  const hours = String(d.getHours()).padStart(2, "0");
  const minutes = String(d.getMinutes()).padStart(2, "0");

  switch (format) {
    case "dd/mm/yyyy":
      return `${day}/${month}/${year}`;
    case "yyyy-mm-dd":
      return `${year}-${month}-${day}`;
    case "datetime":
      return `${day}/${month}/${year} ${hours}:${minutes}`;
    default:
      return `${day}/${month}/${year}`;
  }
}

// Get Current Date Time
export function getCurrentDateTime() {
  const now = new Date();
  return {
    date: formatDate(now, "yyyy-mm-dd"),
    time: `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`,
    datetime: formatDate(now, "datetime"),
    timestamp: now.getTime(),
  };
}

// Generate Unique ID
export function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

// Debounce Function
export function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

// Show Toast Notification
export function showToast(message, type = "success", duration = 3000) {
  // Remove existing toast
  const existingToast = document.querySelector(".toast-notification");
  if (existingToast) {
    existingToast.remove();
  }

  const toast = document.createElement("div");
  toast.className = `toast-notification toast-${type}`;
  toast.innerHTML = `
        <i class="fas ${type === "success" ? "fa-check-circle" : type === "error" ? "fa-exclamation-circle" : "fa-info-circle"}"></i>
        <span>${message}</span>
    `;

  // Add styles
  toast.style.cssText = `
        position: fixed;
        bottom: 80px;
        left: 50%;
        transform: translateX(-50%);
        background: var(--bg-secondary);
        color: var(--text-primary);
        padding: 12px 20px;
        border-radius: 12px;
        display: flex;
        align-items: center;
        gap: 10px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        z-index: 1000;
        animation: slideUp 0.3s ease;
        border-left: 4px solid ${type === "success" ? "#10b981" : type === "error" ? "#ef4444" : "#3b82f6"};
    `;

  document.body.appendChild(toast);

  setTimeout(() => {
    toast.style.animation = "slideDown 0.3s ease";
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

// Show Modal
export function showModal(title, content, onConfirm = null, onCancel = null) {
  // Tutup semua modal konfirmasi yang ada dulu sebelum buat baru
  document
    .querySelectorAll(".modal-overlay.confirm-modal")
    .forEach((m) => m.remove());

  const modal = document.createElement("div");
  modal.className = "modal-overlay confirm-modal";
  modal.innerHTML = `
        <div class="modal-container">
            <div class="modal-header">
                <h3>${title}</h3>
                <button class="modal-close">&times;</button>
            </div>
            <div class="modal-body">
                ${content}
            </div>
            <div class="modal-footer">
                ${onCancel !== undefined ? '<button class="btn-secondary modal-cancel">Batal</button>' : ""}
                ${onConfirm !== null ? '<button class="btn-primary modal-confirm">Konfirmasi</button>' : ""}
            </div>
        </div>
    `;

  document.body.appendChild(modal);

  const closeModal = () => modal.remove();

  modal.querySelector(".modal-close")?.addEventListener("click", closeModal);
  modal.querySelector(".modal-cancel")?.addEventListener("click", () => {
    closeModal();
    if (onCancel) onCancel(false);
  });
  modal.querySelector(".modal-confirm")?.addEventListener("click", () => {
    closeModal();
    if (onConfirm) onConfirm(true);
  });

  modal.addEventListener("click", (e) => {
    if (e.target === modal) closeModal();
  });
}

// Show Confirmation Dialog
export function confirmDialog(message, onConfirm, onCancel) {
  showModal("Konfirmasi", `<p>${message}</p>`, onConfirm, onCancel ?? null);
}

// Calculate Statistics
export function calculateStats(transactions) {
  const income = transactions
    .filter((t) => t.type === "income")
    .reduce((sum, t) => sum + t.amount, 0);

  const expense = transactions
    .filter((t) => t.type === "expense")
    .reduce((sum, t) => sum + t.amount, 0);

  const balance = income - expense;

  return { income, expense, balance };
}

// Group Transactions by Month
export function groupByMonth(transactions) {
  const grouped = {};

  transactions.forEach((t) => {
    const month = t.date.substring(0, 7); // YYYY-MM
    if (!grouped[month]) {
      grouped[month] = [];
    }
    grouped[month].push(t);
  });

  return grouped;
}

// Get Month Name
export function getMonthName(monthStr) {
  const [year, month] = monthStr.split("-");
  const date = new Date(year, parseInt(month) - 1, 1);
  return date.toLocaleDateString("id-ID", { month: "long", year: "numeric" });
}

// Validate Amount
export function validateAmount(amount) {
  const num = Number(amount);
  return !isNaN(num) && num > 0 && num <= 999999999;
}

// Capitalize String
export function capitalize(str) {
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
}

// Normalize String (case insensitive comparison)
export function normalizeString(str) {
  return str.toLowerCase().trim().replace(/\s+/g, " ");
}

// Setup Global Event Listeners
export function setupEventListeners() {
  // Handle ESC key untuk tutup SEMUA modal overlay sekaligus
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      document.querySelectorAll(".modal-overlay").forEach((m) => m.remove());
    }
  });
}

// Add CSS animations + modal styles (satu kali, tidak inject berulang)
if (!document.getElementById("utils-global-styles")) {
  const globalStyles = document.createElement("style");
  globalStyles.id = "utils-global-styles";
  globalStyles.textContent = `
    @keyframes slideUp {
        from {
            opacity: 0;
            transform: translateX(-50%) translateY(20px);
        }
        to {
            opacity: 1;
            transform: translateX(-50%) translateY(0);
        }
    }
    @keyframes slideDown {
        from {
            opacity: 1;
            transform: translateX(-50%) translateY(0);
        }
        to {
            opacity: 0;
            transform: translateX(-50%) translateY(20px);
        }
    }
    @keyframes fadeIn {
        from { opacity: 0; }
        to { opacity: 1; }
    }

    .modal-overlay {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0,0,0,0.5);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 2000;
        animation: fadeIn 0.2s ease;
    }
    .modal-container {
        background: var(--bg-secondary);
        border-radius: 20px;
        width: 90%;
        max-width: 400px;
        max-height: 80vh;
        overflow: auto;
        animation: slideUp 0.3s ease;
    }
    .modal-header {
        padding: 16px 20px;
        border-bottom: 1px solid var(--border-color);
        display: flex;
        justify-content: space-between;
        align-items: center;
    }
    .modal-close, .modal-close-x {
        background: none;
        border: none;
        font-size: 24px;
        cursor: pointer;
        color: var(--text-secondary);
    }
    .modal-body {
        padding: 20px;
    }
    .modal-footer {
        padding: 16px 20px;
        border-top: 1px solid var(--border-color);
        display: flex;
        justify-content: flex-end;
        gap: 10px;
    }
    .btn-primary {
        padding: 8px 16px;
        border-radius: 8px;
        border: none;
        cursor: pointer;
        font-size: 14px;
        background: var(--info);
        color: white;
    }
    .btn-secondary {
        padding: 8px 16px;
        border-radius: 8px;
        border: none;
        cursor: pointer;
        font-size: 14px;
        background: var(--border-color);
        color: var(--text-primary);
    }
  `;
  document.head.appendChild(globalStyles);
}
