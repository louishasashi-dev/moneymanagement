// Transaction Templates Module
// Template transaksi untuk autofill form Pemasukan/Pengeluaran.
// Memilih template TIDAK langsung membuat transaksi — hanya mengisi form.

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
  formatMoneyInput,
  parseMoney,
} from "./utils.js";

// ───────────────────────────────────────────────
// Helper: ambil semua template, opsional filter by type
// ───────────────────────────────────────────────
export async function getAllTemplates() {
  return getAllItems(STORES.TEMPLATES);
}

export async function getTemplatesByType(type) {
  const templates = await getAllTemplates();
  return templates.filter((t) => t.type === type);
}

// ───────────────────────────────────────────────
// Render halaman Template Transaksi
// ───────────────────────────────────────────────
export async function renderTemplatesPage() {
  const container = document.getElementById("page-content");
  if (!container) return;

  const templates = await getAllTemplates();
  templates.sort((a, b) => (b.updatedAt || "").localeCompare(a.updatedAt || ""));

  const incomeTemplates = templates.filter((t) => t.type === "income");
  const expenseTemplates = templates.filter((t) => t.type === "expense");

  container.innerHTML = `
    <div class="transactions-container">
      <div class="page-header">
        <h1><i class="fas fa-file-invoice"></i> Template Transaksi</h1>
        <button class="btn-primary" id="add-template-btn">
          <i class="fas fa-plus"></i> Template Baru
        </button>
      </div>

      <div class="card" style="padding:12px 16px;margin-bottom:16px;font-size:.83rem;color:var(--text-secondary);">
        <i class="fas fa-info-circle"></i>
        Template membantu mengisi form transaksi secara otomatis (nama, nominal, kategori, dompet, catatan).
        Memilih template <strong>tidak langsung membuat transaksi</strong> — kamu tetap bisa mengubah isian sebelum menyimpan.
      </div>

      <div class="card" style="margin-bottom:16px;">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;">
          <h3 style="margin:0;font-size:1rem;">
            <i class="fas fa-arrow-up" style="color:#ef4444;"></i>
            Template Pengeluaran (${expenseTemplates.length})
          </h3>
        </div>
        <div id="template-expense-list">
          ${
            expenseTemplates.length === 0
              ? emptyState()
              : expenseTemplates.map((t) => renderTemplateItem(t)).join("")
          }
        </div>
      </div>

      <div class="card">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;">
          <h3 style="margin:0;font-size:1rem;">
            <i class="fas fa-arrow-down" style="color:#10b981;"></i>
            Template Pemasukan (${incomeTemplates.length})
          </h3>
        </div>
        <div id="template-income-list">
          ${
            incomeTemplates.length === 0
              ? emptyState()
              : incomeTemplates.map((t) => renderTemplateItem(t)).join("")
          }
        </div>
      </div>
    </div>
  `;

  document.getElementById("add-template-btn")?.addEventListener("click", () => {
    showTemplateModal();
  });

  setupTemplateItemListeners();
}

function emptyState() {
  return `<div class="empty-state" style="padding:30px 0;text-align:center;">
    <i class="fas fa-file-invoice" style="font-size:2.5rem;color:var(--text-secondary);display:block;margin-bottom:10px;"></i>
    <p style="color:var(--text-secondary);">Belum ada template</p>
  </div>`;
}

function renderTemplateItem(item) {
  const isIncome = item.type === "income";
  const amountColor = isIncome ? "var(--success,#10b981)" : "var(--danger,#ef4444)";
  const amountSign = isIncome ? "+" : "-";

  return `
    <div class="template-item" data-id="${item.id}" style="
      display:flex;align-items:flex-start;gap:12px;
      padding:12px 0;
      border-bottom:1px solid var(--border-color);
    ">
      <div style="
        width:40px;height:40px;border-radius:50%;flex-shrink:0;
        background:${isIncome ? "rgba(16,185,129,.15)" : "rgba(239,68,68,.15)"};
        display:flex;align-items:center;justify-content:center;
        font-size:1.1rem;
      ">
        <i class="fas ${isIncome ? "fa-arrow-down" : "fa-arrow-up"}" style="color:${amountColor};"></i>
      </div>
      <div style="flex:1;min-width:0;">
        <div style="font-weight:600;font-size:.95rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
          ${escapeHtml(item.name)}
        </div>
        <div style="font-size:.78rem;color:var(--text-secondary);margin-top:2px;">
          ${item.category || "-"}
          ${item.note ? `<br><span style="font-style:italic;">${escapeHtml(item.note)}</span>` : ""}
        </div>
      </div>
      <div style="text-align:right;flex-shrink:0;">
        <div style="font-weight:700;color:${amountColor};font-size:.95rem;">
          ${amountSign}${formatCurrency(item.amount)}
        </div>
        <div style="display:flex;gap:6px;margin-top:6px;justify-content:flex-end;">
          <button class="template-edit-btn" data-id="${item.id}" title="Edit" style="
            width:30px;height:30px;border-radius:50%;border:none;cursor:pointer;
            background:rgba(99,102,241,.15);color:var(--primary,#6366f1);font-size:.85rem;
            display:flex;align-items:center;justify-content:center;
          "><i class="fas fa-pencil-alt"></i></button>
          <button class="template-delete-btn" data-id="${item.id}" title="Hapus" style="
            width:30px;height:30px;border-radius:50%;border:none;cursor:pointer;
            background:rgba(239,68,68,.15);color:#ef4444;font-size:.85rem;
            display:flex;align-items:center;justify-content:center;
          "><i class="fas fa-trash"></i></button>
        </div>
      </div>
    </div>
  `;
}

function setupTemplateItemListeners() {
  document.querySelectorAll(".template-edit-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const id = Number(btn.dataset.id);
      await showTemplateModal(id);
    });
  });

  document.querySelectorAll(".template-delete-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = Number(btn.dataset.id);
      confirmDialog("Hapus template ini?", async (confirmed) => {
        if (!confirmed) return;
        await deleteItem(STORES.TEMPLATES, id);
        showToast("Template dihapus", "success");
        await renderTemplatesPage();
      });
    });
  });
}

// ───────────────────────────────────────────────
// Modal tambah / edit template
// ───────────────────────────────────────────────
async function showTemplateModal(templateId = null) {
  const isEdit = templateId !== null;
  let item = null;

  if (isEdit) {
    item = await getItem(STORES.TEMPLATES, templateId);
    if (!item) {
      showToast("Template tidak ditemukan", "error");
      return;
    }
  }

  const wallets = await getAllItems(STORES.WALLETS);
  const categories = await getAllItems(STORES.CATEGORIES);
  const expenseCats = categories.filter((c) => c.type === "expense");
  const incomeCats = categories.filter((c) => c.type === "income");

  const modal = document.createElement("div");
  modal.className = "modal-overlay";
  modal.innerHTML = `
    <div class="modal-container modal-large">
      <div class="modal-header">
        <h3><i class="fas ${isEdit ? "fa-edit" : "fa-file-circle-plus"}"></i>
          ${isEdit ? "Edit Template" : "Tambah Template"}
        </h3>
        <button class="modal-close-btn modal-close-x" style="background:none;border:none;font-size:24px;cursor:pointer;color:var(--text-secondary);padding:0 8px;">&times;</button>
      </div>
      <div class="modal-body">
        <form id="template-form">
          <div class="form-group">
            <label>Tipe <span class="required">*</span></label>
            <div class="type-selector">
              <button type="button" class="type-btn ${!isEdit || item.type === "expense" ? "active" : ""}" data-type="expense">
                <i class="fas fa-arrow-up"></i> Pengeluaran
              </button>
              <button type="button" class="type-btn ${isEdit && item.type === "income" ? "active" : ""}" data-type="income">
                <i class="fas fa-arrow-down"></i> Pemasukan
              </button>
            </div>
            <input type="hidden" id="template-type" value="${isEdit ? item.type : "expense"}">
          </div>

          <div class="form-group">
            <label>Nama Template <span class="required">*</span></label>
            <input type="text" id="template-name" class="form-input"
              value="${isEdit ? escapeHtml(item.name) : ""}"
              placeholder="Contoh: Nasi Padang, Gaji Bulanan..." required>
          </div>

          <div class="form-group">
            <label>Nominal <span class="required">*</span></label>
            <input type="text" inputmode="numeric" autocomplete="off" data-money id="template-amount" class="form-input"
              value="${isEdit ? formatMoneyInput(item.amount) : ""}"
              placeholder="0" min="1" required>
          </div>

          <div class="form-group">
            <label>Kategori</label>
            <select id="template-category" class="form-input">
              <option value="">Pilih Kategori</option>
              <optgroup label="📤 Pengeluaran">
                ${expenseCats.map((c) => `<option value="${c.name}" ${isEdit && item.category === c.name ? "selected" : ""}>${c.name}</option>`).join("")}
              </optgroup>
              <optgroup label="📥 Pemasukan">
                ${incomeCats.map((c) => `<option value="${c.name}" ${isEdit && item.category === c.name ? "selected" : ""}>${c.name}</option>`).join("")}
              </optgroup>
            </select>
          </div>

          <div class="form-group">
            <label>Dompet (Opsional)</label>
            <select id="template-wallet" class="form-input">
              <option value="">Tanpa Dompet Default</option>
              ${wallets.map((w) => `<option value="${w.id}" ${isEdit && item.walletId === w.id ? "selected" : ""}>${w.name}</option>`).join("")}
            </select>
          </div>

          <div class="form-group">
            <label>Catatan (Opsional)</label>
            <textarea id="template-note" class="form-input" rows="2" placeholder="Tambahkan catatan...">${isEdit ? escapeHtml(item.note || "") : ""}</textarea>
          </div>

          <div class="modal-buttons">
            <button type="button" class="btn-secondary modal-close-btn">Batal</button>
            <button type="submit" class="btn-primary">
              <i class="fas fa-save"></i>
              ${isEdit ? "Simpan Perubahan" : "Simpan Template"}
            </button>
          </div>
        </form>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  // Type selector
  const typeBtns = modal.querySelectorAll(".type-btn");
  const typeInput = modal.querySelector("#template-type");
  typeBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      typeBtns.forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      typeInput.value = btn.dataset.type;
    });
  });

  // Close handlers
  modal.querySelectorAll(".modal-close-btn, .modal-close-x").forEach((btn) => {
    btn.addEventListener("click", () => modal.remove());
  });
  modal.addEventListener("click", (e) => {
    if (e.target === modal) modal.remove();
  });

  // Submit
  modal.querySelector("#template-form").addEventListener("submit", async (e) => {
    e.preventDefault();

    const name = modal.querySelector("#template-name").value.trim();
    const amount = parseMoney(modal.querySelector("#template-amount").value);
    const type = typeInput.value;
    let category = modal.querySelector("#template-category").value;
    const walletId = modal.querySelector("#template-wallet").value || null;
    const note = modal.querySelector("#template-note").value;

    if (!name) {
      showToast("Nama template harus diisi", "error");
      return;
    }
    if (isNaN(amount) || amount <= 0) {
      showToast("Nominal harus lebih dari 0", "error");
      return;
    }
    if (!category) category = "Lainnya";

    const data = {
      name: capitalize(name),
      amount,
      type,
      category,
      walletId,
      note,
      updatedAt: new Date().toISOString(),
    };

    if (isEdit) {
      data.id = item.id;
      data.createdAt = item.createdAt;
      await updateItem(STORES.TEMPLATES, data);
      showToast("Template diperbarui", "success");
    } else {
      data.createdAt = new Date().toISOString();
      await addItem(STORES.TEMPLATES, data);
      showToast("Template disimpan!", "success");
    }

    modal.remove();
    await renderTemplatesPage();
  });
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
