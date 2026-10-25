// Transaction Templates Module
// Template untuk autofill form transaksi. Dua jenis:
//   1. Template transaksi (type: "expense" | "income") -> nama, nominal, kategori, dompet, catatan
//   2. Template lokasi    (type: "location")           -> nama lokasi saja
// Memilih template TIDAK langsung membuat transaksi, hanya mengisi form.
//
// Template lokasi disimpan di store TEMPLATES yang sama (type: "location"),
// jadi tidak perlu mengubah db.js. getTemplatesByType("expense"/"income")
// tidak ikut mengembalikannya.
//
// Desain halaman & modal memakai gaya yang sama dengan transaction.js
// (header hijau, kartu tp-*, modal mx-*).

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
  escapeAttr,
} from "./utils.js";
import {
  addTransactionStyles,
  ensureMultiSheetStyles,
  ensureMobileViewport,
  scheduleTxFullBleed,
  typeTriangle,
} from "./transaction.js";

// ───────────────────────────────────────────────
// Data helper
// ───────────────────────────────────────────────
export async function getAllTemplates() {
  return getAllItems(STORES.TEMPLATES);
}

export async function getTemplatesByType(type) {
  const templates = await getAllTemplates();
  return templates.filter((t) => t.type === type);
}

export async function getLocationTemplates() {
  const list = await getTemplatesByType("location");
  return list.sort((a, b) =>
    String(a.name || "").localeCompare(String(b.name || ""), "id"),
  );
}

const sameLocation = (a, b) =>
  String(a || "")
    .trim()
    .toLowerCase() ===
  String(b || "")
    .trim()
    .toLowerCase();

// Simpan lokasi sebagai template (tanpa duplikat). true = tersimpan.
export async function saveLocationTemplate(name) {
  const clean = String(name || "").trim();
  if (!clean) return false;
  try {
    const existing = await getLocationTemplates();
    if (existing.some((t) => sameLocation(t.name, clean))) return false;
    const nowIso = new Date().toISOString();
    await addItem(STORES.TEMPLATES, {
      type: "location",
      name: clean,
      createdAt: nowIso,
      updatedAt: nowIso,
    });
    return true;
  } catch (err) {
    console.error("Gagal menyimpan template lokasi:", err);
    return false;
  }
}

// ───────────────────────────────────────────────
// Dipakai form transaksi (biasa & banyak): pilih / simpan template lokasi
// Markup memakai kelas mx-*; pemanggil harus sudah memanggil ensureMultiSheetStyles().
// ───────────────────────────────────────────────

// Dropdown "Template lokasi" (disisipkan SEBELUM input lokasi; tersembunyi bila belum ada template)
export function locationTemplateSelectHtml(prefix) {
  return `
    <label class="mx-field" id="${prefix}-loc-tpl-group" style="display:none;">
      <span class="mx-lbl">Template lokasi</span>
      <select id="${prefix}-loc-tpl" class="mx-input">
        <option value="">Pilih dari template lokasi</option>
      </select>
    </label>`;
}

// Checkbox "Simpan lokasi ini sebagai template" (disisipkan SESUDAH input lokasi)
export function locationTemplateSaveHtml(prefix) {
  return `
    <label class="mx-check" id="${prefix}-loc-save-group" style="display:none;">
      <input type="checkbox" id="${prefix}-loc-save">
      Simpan lokasi ini sebagai template
    </label>`;
}

// Pasang perilaku. Mengembalikan { shouldSave(), save() }.
export async function setupLocationTemplates(root, prefix, input) {
  const group = root.querySelector(`#${prefix}-loc-tpl-group`);
  const select = root.querySelector(`#${prefix}-loc-tpl`);
  const saveGroup = root.querySelector(`#${prefix}-loc-save-group`);
  const saveCheck = root.querySelector(`#${prefix}-loc-save`);

  let templates = [];
  try {
    templates = await getLocationTemplates();
  } catch (err) {
    console.error("Gagal memuat template lokasi:", err);
  }

  if (group && select) {
    select.innerHTML =
      `<option value="">Pilih dari template lokasi</option>` +
      templates
        .map(
          (t) =>
            `<option value="${escapeAttr(t.id)}">${escapeHtml(t.name)}</option>`,
        )
        .join("");
    group.style.display = templates.length ? "" : "none";
    // Pilih template = isi kolom lokasi saja
    select.addEventListener("change", () => {
      const t = templates.find((x) => String(x.id) === select.value);
      if (!t) return;
      input.value = t.name;
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
  }

  // Opsi simpan hanya muncul untuk lokasi yang belum jadi template
  const refreshSave = () => {
    if (!saveGroup || !saveCheck) return;
    const value = input.value.trim();
    const show =
      value !== "" && !templates.some((t) => sameLocation(t.name, value));
    saveGroup.style.display = show ? "" : "none";
    if (!show) saveCheck.checked = false;
  };
  input.addEventListener("input", () => {
    // Lokasi diketik ulang -> dropdown kembali ke "Pilih dari template lokasi"
    if (select && select.value) {
      const t = templates.find((x) => String(x.id) === select.value);
      if (!t || !sameLocation(t.name, input.value)) select.value = "";
    }
    refreshSave();
  });
  refreshSave();

  return {
    shouldSave: () =>
      !!saveCheck && saveGroup.style.display !== "none" && saveCheck.checked,
    save: () => saveLocationTemplate(input.value),
  };
}

// ───────────────────────────────────────────────
// Halaman Template
// ───────────────────────────────────────────────
export async function renderTemplatesPage() {
  const container = document.getElementById("page-content");
  if (!container) return;

  // Style harus ada SEBELUM markup dirender
  addTransactionStyles();
  addTemplateStyles();
  ensureMobileViewport();

  const [templates, wallets] = await Promise.all([
    getAllTemplates(),
    getAllItems(STORES.WALLETS),
  ]);
  const walletMap = new Map(wallets.map((w) => [w.id, w]));

  const byNewest = (a, b) =>
    (b.updatedAt || "").localeCompare(a.updatedAt || "");
  const expenseTemplates = templates
    .filter((t) => t.type === "expense")
    .sort(byNewest);
  const incomeTemplates = templates
    .filter((t) => t.type === "income")
    .sort(byNewest);
  const locationTemplates = templates
    .filter((t) => t.type === "location")
    .sort((a, b) =>
      String(a.name || "").localeCompare(String(b.name || ""), "id"),
    );
  const total =
    expenseTemplates.length + incomeTemplates.length + locationTemplates.length;

  const section = (title, icon, count, listHtml) => `
    <section class="tp-card tpl-section">
      <div class="tp-section-head">
        <h2>${icon} ${title}</h2>
        <span class="tp-muted">${count}</span>
      </div>
      <div class="tp-list">${listHtml}</div>
    </section>`;

  container.innerHTML = `
    <div class="transactions-container tpl-page">
      <header class="tp-hero">
        <div class="tp-top">
          <div class="tp-avatar"><i class="fas fa-file-invoice"></i></div>
          <div class="tp-greet">
            <span class="tp-eyebrow">Isi form lebih cepat</span>
            <h1>Template</h1>
          </div>
          <button class="tp-refresh" id="tpl-refresh" type="button" aria-label="Perbarui data" title="Perbarui data">
            <i class="fas fa-sync-alt"></i>
          </button>
        </div>

        <div class="tp-balance">
          <span class="tp-label">Total Template</span>
          <span class="tp-amount" id="tp-wallet-balance">${total}</span>
          <span class="tp-chip up tpl-chip">${expenseTemplates.length} pengeluaran • ${incomeTemplates.length} pemasukan • ${locationTemplates.length} lokasi</span>
        </div>

        <div class="tp-actions tpl-actions">
          <button type="button" class="tp-action primary" id="tpl-add-btn" title="Template transaksi baru">
            <span class="ico"><i class="fas fa-plus"></i></span>Template
          </button>
          <button type="button" class="tp-action" id="tpl-add-loc-btn" title="Template lokasi baru">
            <span class="ico"><i class="fas fa-location-dot"></i></span>Lokasi
          </button>
        </div>
      </header>

      <div class="tp-grid tpl-grid">
        <div class="tp-card tpl-note">
          <i class="fas fa-circle-info"></i>
          <p>Template mengisi form transaksi secara otomatis. Memilih template <b>tidak langsung membuat transaksi</b>, jadi isiannya masih bisa diubah sebelum disimpan.</p>
        </div>

        ${section(
          "Template Pengeluaran",
          typeTriangle("expense"),
          expenseTemplates.length,
          expenseTemplates.length
            ? expenseTemplates
                .map((t) => transactionRowHtml(t, walletMap))
                .join("")
            : emptyHtml("Belum ada template pengeluaran"),
        )}

        ${section(
          "Template Pemasukan",
          typeTriangle("income"),
          incomeTemplates.length,
          incomeTemplates.length
            ? incomeTemplates
                .map((t) => transactionRowHtml(t, walletMap))
                .join("")
            : emptyHtml("Belum ada template pemasukan"),
        )}

        ${section(
          "Template Lokasi",
          '<i class="fas fa-location-dot tpl-sec-ico"></i>',
          locationTemplates.length,
          locationTemplates.length
            ? locationTemplates.map((t) => locationRowHtml(t)).join("")
            : emptyHtml("Belum ada template lokasi"),
        )}
      </div>
    </div>
  `;

  scheduleTxFullBleed();

  document.getElementById("tpl-add-btn")?.addEventListener("click", () => {
    showTemplateModal();
  });
  document.getElementById("tpl-add-loc-btn")?.addEventListener("click", () => {
    showLocationTemplateModal();
  });
  document.getElementById("tpl-refresh")?.addEventListener("click", () => {
    renderTemplatesPage();
  });

  setupTemplateItemListeners(container);
}

function emptyHtml(text) {
  return `<div class="tp-empty"><i class="fas fa-file-invoice"></i><p>${text}</p></div>`;
}

function transactionRowHtml(item, walletMap) {
  const isIncome = item.type === "income";
  const wallet = item.walletId ? walletMap.get(item.walletId) : null;
  const qty = Number(item.quantity) > 1 ? Number(item.quantity) : 1;

  const pill = wallet
    ? `<span class="tp-wallet-pill" style="--wc:${escapeAttr(wallet.color || "#3b82f6")}">${escapeHtml(wallet.name)}</span>`
    : "";

  return `
    <div class="tp-row" role="button" tabindex="0" data-kind="transaction" data-id="${escapeAttr(item.id)}">
      <div class="tp-lead"><span class="tp-lead-ico">${typeTriangle(item.type)}</span></div>
      <div class="tp-info">
        <div class="tp-name">${escapeHtml(item.name)}</div>
        <div class="tp-meta">
          <span>${escapeHtml(item.category || "Lainnya")}</span>
          ${qty > 1 ? `<span>Jumlah ${qty}</span>` : ""}
        </div>
        ${pill ? `<div class="tp-tags">${pill}</div>` : ""}
        ${item.note ? `<div class="tp-note">${escapeHtml(item.note)}</div>` : ""}
      </div>
      <div class="tp-amount ${isIncome ? "income" : "expense"}">${isIncome ? "+" : "-"}${formatCurrency(item.amount)}</div>
      ${actionsHtml(item.id)}
    </div>`;
}

function locationRowHtml(item) {
  return `
    <div class="tp-row tpl-row-loc" role="button" tabindex="0" data-kind="location" data-id="${escapeAttr(item.id)}">
      <div class="tp-lead"><span class="tp-lead-ico tpl-loc-ico"><i class="fas fa-location-dot"></i></span></div>
      <div class="tp-info">
        <div class="tp-name">${escapeHtml(item.name)}</div>
      </div>
      ${actionsHtml(item.id)}
    </div>`;
}

function actionsHtml(id) {
  return `
    <div class="tp-row-actions">
      <button type="button" class="tp-icon-btn" data-act="edit" data-id="${escapeAttr(id)}" title="Edit" aria-label="Edit"><i class="fas fa-pencil-alt"></i></button>
      <button type="button" class="tp-icon-btn danger" data-act="delete" data-id="${escapeAttr(id)}" title="Hapus" aria-label="Hapus"><i class="fas fa-trash"></i></button>
    </div>`;
}

function setupTemplateItemListeners(root) {
  const open = (row) => {
    const id = Number(row.dataset.id);
    if (row.dataset.kind === "location") showLocationTemplateModal(id);
    else showTemplateModal(id);
  };

  root.querySelectorAll(".tp-row").forEach((row) => {
    row.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-act]");
      if (!btn) return open(row);
      e.stopPropagation();
      const id = Number(btn.dataset.id);
      if (btn.dataset.act === "edit") return open(row);
      confirmDialog("Hapus template ini?", async (confirmed) => {
        if (!confirmed) return;
        await deleteItem(STORES.TEMPLATES, id);
        showToast("Template dihapus", "success");
        await renderTemplatesPage();
      });
    });
    row.addEventListener("keydown", (e) => {
      if (e.target !== row) return;
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        open(row);
      }
    });
  });
}

// ───────────────────────────────────────────────
// Modal (gaya mx-* seperti form transaksi): kerangka bersama
// ───────────────────────────────────────────────
function openSheet({ icon, title, subtitle, fieldsHtml, submitLabel }) {
  ensureMultiSheetStyles();
  document.querySelector(".mx-overlay")?.remove();

  const overlay = document.createElement("div");
  overlay.className = "mx-overlay";
  overlay.innerHTML = `
    <form class="mx-sheet" role="dialog" aria-modal="true" aria-labelledby="mx-title" novalidate>
      <header class="mx-head">
        <span class="mx-grab" aria-hidden="true"></span>
        <div class="mx-head-row">
          <span class="mx-head-ico"><i class="fas ${icon}"></i></span>
          <div class="mx-head-text">
            <h3 id="mx-title">${title}</h3>
            <p>${subtitle}</p>
          </div>
          <button type="button" class="mx-x mx-close" aria-label="Tutup"><i class="fas fa-xmark"></i></button>
        </div>
      </header>
      <div class="mx-body">
        <section class="mx-fields">${fieldsHtml}</section>
      </div>
      <footer class="mx-foot">
        <div class="mx-btns">
          <button type="button" class="mx-btn ghost mx-close">Batal</button>
          <button type="submit" class="mx-btn primary">${submitLabel}</button>
        </div>
      </footer>
    </form>`;
  document.body.appendChild(overlay);

  const prevOverflow = document.body.style.overflow;
  document.body.style.overflow = "hidden";
  const close = () => {
    overlay.remove();
    document.body.style.overflow = prevOverflow;
  };
  // Hanya bisa ditutup lewat Batal / X (klik area gelap tidak menutup,
  // supaya isian tidak hilang) - sama seperti form transaksi.
  overlay.querySelectorAll(".mx-close").forEach((b) => {
    b.addEventListener("click", close);
  });

  return { overlay, form: overlay.querySelector("form"), close };
}

// ───────────────────────────────────────────────
// Modal tambah / edit template transaksi
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
  const initialType = isEdit ? item.type : "expense";

  const { overlay, form, close } = openSheet({
    icon: isEdit ? "fa-pen" : "fa-file-circle-plus",
    title: isEdit ? "Edit template" : "Template baru",
    subtitle: "Isian ini akan mengisi form transaksi otomatis",
    submitLabel: isEdit ? "Simpan perubahan" : "Simpan template",
    fieldsHtml: `
      <div class="mx-field">
        <span class="mx-lbl">Tipe</span>
        <div class="mx-seg" style="grid-template-columns:repeat(2,minmax(0,1fr));" role="group" aria-label="Tipe template">
          <button type="button" class="mx-seg-btn ${initialType === "expense" ? "active" : ""}" data-type="expense">${typeTriangle("expense")} Pengeluaran</button>
          <button type="button" class="mx-seg-btn ${initialType === "income" ? "active" : ""}" data-type="income">${typeTriangle("income")} Pemasukan</button>
        </div>
        <input type="hidden" id="template-type" value="${initialType}">
      </div>

      <label class="mx-field">
        <span class="mx-lbl">Nama template</span>
        <input type="text" id="template-name" class="mx-input" autocomplete="off"
               value="${isEdit ? escapeAttr(item.name) : ""}"
               placeholder="Contoh: Nasi Padang, Gaji Bulanan">
      </label>

      <div class="mx-grid2">
        <label class="mx-field">
          <span class="mx-lbl">Nominal</span>
          <span class="mx-money"><b>Rp</b><input type="text" inputmode="numeric" autocomplete="off" data-money id="template-amount"
                 value="${isEdit ? escapeAttr(formatMoneyInput(item.amount)) : ""}" placeholder="0"></span>
        </label>
        <div class="mx-field">
          <span class="mx-lbl">Jumlah</span>
          <div class="mx-stepper" role="group" aria-label="Jumlah">
            <button type="button" class="mx-step" data-step="-1" aria-label="Kurangi jumlah"><i class="fas fa-minus"></i></button>
            <input type="text" inputmode="numeric" autocomplete="off" class="mx-i-qty" id="template-quantity"
                   value="${isEdit ? Number(item.quantity) || 1 : 1}" aria-label="Jumlah">
            <button type="button" class="mx-step" data-step="1" aria-label="Tambah jumlah"><i class="fas fa-plus"></i></button>
          </div>
        </div>
      </div>

      <label class="mx-field">
        <span class="mx-lbl">Kategori</span>
        <select id="template-category" class="mx-input"></select>
      </label>

      <label class="mx-field">
        <span class="mx-lbl">Dompet (opsional)</span>
        <select id="template-wallet" class="mx-input">
          <option value="">Tanpa dompet default</option>
          ${wallets
            .map(
              (w) =>
                `<option value="${escapeAttr(w.id)}" ${isEdit && item.walletId === w.id ? "selected" : ""}>${escapeHtml(w.name)}</option>`,
            )
            .join("")}
        </select>
      </label>

      <label class="mx-field">
        <span class="mx-lbl">Catatan (opsional)</span>
        <textarea id="template-note" class="mx-input" rows="2" placeholder="Tambahkan catatan...">${isEdit ? escapeHtml(item.note || "") : ""}</textarea>
      </label>`,
  });

  const $ = (sel) => overlay.querySelector(sel);
  const typeBtns = overlay.querySelectorAll(".mx-seg-btn");
  const typeInput = $("#template-type");
  const categorySelect = $("#template-category");
  const quantityInput = $("#template-quantity");

  // Kategori mengikuti tipe; kategori lama yang sudah tidak ada tetap dipertahankan saat edit
  const fillCategories = (keep) => {
    const type = typeInput.value;
    const list = categories.filter((c) => c.type === type);
    const orphan =
      keep && !list.some((c) => c.name === keep)
        ? `<option value="${escapeAttr(keep)}">${escapeHtml(keep)}</option>`
        : "";
    categorySelect.innerHTML =
      `<option value="">Pilih kategori</option>` +
      orphan +
      list
        .map(
          (c) =>
            `<option value="${escapeAttr(c.name)}">${escapeHtml(c.name)}</option>`,
        )
        .join("");
    if (keep) categorySelect.value = keep;
  };
  fillCategories(isEdit ? item.category : "");

  typeBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      typeBtns.forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      typeInput.value = btn.dataset.type;
      fillCategories("");
    });
  });

  // Jumlah: stepper + hanya angka
  const parseQty = () =>
    /^\d+$/.test(quantityInput.value) ? parseInt(quantityInput.value, 10) : 0;
  quantityInput.addEventListener("input", () => {
    quantityInput.value = quantityInput.value.replace(/\D/g, "").slice(0, 6);
  });
  quantityInput.addEventListener("blur", () => {
    if (!/^[1-9]\d*$/.test(quantityInput.value)) quantityInput.value = "1";
  });
  overlay.querySelectorAll(".mx-step").forEach((btn) => {
    btn.addEventListener("click", () => {
      const next = Math.min(
        999999,
        Math.max(1, parseQty() + Number(btn.dataset.step)),
      );
      quantityInput.value = String(next);
    });
  });

  let saving = false;
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (saving) return;

    const name = $("#template-name").value.trim();
    const amount = parseMoney($("#template-amount").value);
    const quantity = parseQty() || 1;
    const type = typeInput.value;
    const category = categorySelect.value || "Lainnya";
    const walletId = $("#template-wallet").value || null;
    const note = $("#template-note").value;

    if (!name) {
      showToast("Nama template harus diisi", "error");
      $("#template-name").focus();
      return;
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      showToast("Nominal harus lebih dari 0", "error");
      $("#template-amount").focus();
      return;
    }

    // Spread dulu supaya field lain di template lama (mis. quantity) tidak hilang
    const data = {
      ...(isEdit ? item : {}),
      name: capitalize(name),
      amount,
      quantity,
      type,
      category,
      walletId,
      note,
      updatedAt: new Date().toISOString(),
    };
    if (!isEdit) data.createdAt = data.updatedAt;

    saving = true;
    try {
      if (isEdit) {
        await updateItem(STORES.TEMPLATES, data);
        showToast("Template diperbarui", "success");
      } else {
        await addItem(STORES.TEMPLATES, data);
        showToast("Template disimpan!", "success");
      }
    } catch (err) {
      console.error("Gagal menyimpan template:", err);
      showToast("Gagal menyimpan template", "error");
      return;
    } finally {
      saving = false;
    }

    close();
    await renderTemplatesPage();
  });

  $("#template-name").focus({ preventScroll: true });
}

// ───────────────────────────────────────────────
// Modal tambah / edit template lokasi
// ───────────────────────────────────────────────
async function showLocationTemplateModal(templateId = null) {
  const isEdit = templateId !== null;
  let item = null;

  if (isEdit) {
    item = await getItem(STORES.TEMPLATES, templateId);
    if (!item) {
      showToast("Template tidak ditemukan", "error");
      return;
    }
  }

  const { overlay, form, close } = openSheet({
    icon: "fa-location-dot",
    title: isEdit ? "Edit template lokasi" : "Template lokasi baru",
    subtitle: "Lokasi ini bisa dipilih langsung saat mencatat transaksi",
    submitLabel: isEdit ? "Simpan perubahan" : "Simpan lokasi",
    fieldsHtml: `
      <label class="mx-field">
        <span class="mx-lbl">Nama lokasi</span>
        <input type="text" id="template-location" class="mx-input" autocomplete="off" maxlength="120"
               value="${isEdit ? escapeAttr(item.name) : ""}"
               placeholder="Contoh: Indomaret Pamulang, Warung Bu Siti">
      </label>`,
  });

  const input = overlay.querySelector("#template-location");
  let saving = false;

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (saving) return;

    const name = input.value.trim();
    if (!name) {
      showToast("Nama lokasi harus diisi", "error");
      input.focus();
      return;
    }

    saving = true;
    try {
      const existing = await getLocationTemplates();
      const duplicate = existing.some(
        (t) => t.id !== (item && item.id) && sameLocation(t.name, name),
      );
      if (duplicate) {
        showToast("Template lokasi itu sudah ada", "error");
        input.focus();
        return;
      }

      const nowIso = new Date().toISOString();
      if (isEdit) {
        await updateItem(STORES.TEMPLATES, {
          ...item,
          type: "location",
          name,
          updatedAt: nowIso,
        });
        showToast("Template lokasi diperbarui", "success");
      } else {
        await addItem(STORES.TEMPLATES, {
          type: "location",
          name,
          createdAt: nowIso,
          updatedAt: nowIso,
        });
        showToast("Template lokasi disimpan!", "success");
      }
    } catch (err) {
      console.error("Gagal menyimpan template lokasi:", err);
      showToast("Gagal menyimpan template lokasi", "error");
      return;
    } finally {
      saving = false;
    }

    close();
    await renderTemplatesPage();
  });

  input.focus({ preventScroll: true });
}

// ───────────────────────────────────────────────
// Style tambahan halaman Template (melengkapi style transaction.js)
// ───────────────────────────────────────────────
function addTemplateStyles() {
  if (document.getElementById("template-page-styles")) return;
  const style = document.createElement("style");
  style.id = "template-page-styles";
  style.textContent = `
    /* Dua tombol aksi di header */
    .tpl-page .tp-actions.tpl-actions { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .tpl-page .tp-hero .tpl-chip { max-width: 100%; text-align: center; line-height: 1.35; }
    @media (min-width: 768px) {
      .tpl-page .tp-actions.tpl-actions { width: 200px; }
    }

    /* Satu kolom (tp-grid bawaan 2 kolom di desktop) */
    .tpl-page .tp-grid.tpl-grid {
      display: flex;
      flex-direction: column;
      gap: 16px;
      grid-template-columns: none;
    }
    .tpl-note { display: flex; align-items: flex-start; gap: 10px; padding: 14px 16px; }
    .tpl-note i { margin-top: 2px; color: var(--d-accent); }
    .tpl-note p { margin: 0; font-size: 0.82rem; line-height: 1.45; color: var(--d-muted); }
    .tpl-section .tp-section-head h2 { display: flex; align-items: center; gap: 8px; }
    .tpl-section .tp-section-head h2 svg { width: 14px; height: 14px; display: block; }
    .tpl-sec-ico { color: var(--d-accent); font-size: 0.9rem; }

    /* Baris template lokasi: ikon | nama | aksi */
    .tpl-page .tp-row.tpl-row-loc {
      grid-template-columns: 48px minmax(0, 1fr) auto;
      grid-template-areas: "lead info actions";
      align-items: center;
    }
    .tpl-page .tpl-row-loc .tp-row-actions { align-self: center; }
    .tpl-page .tpl-loc-ico { color: var(--d-accent); }
  `;
  document.head.appendChild(style);
}

function escapeHtml(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
