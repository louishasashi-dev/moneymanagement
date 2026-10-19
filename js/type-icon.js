// Ikon tipe transaksi (satu sumber untuk semua halaman).
//   Pengeluaran : segitiga MERAH, ujung ke BAWAH
//   Pemasukan   : segitiga HIJAU, ujung ke ATAS
//   Tabungan    : piggy bank (Font Awesome) UNGU
// Warna tile mengikuti nilai .transaction-card-icon.{income|expense|saving} di transaction.js.

const TRI_PATHS = {
  income: "M12 3L21 18H3Z",
  expense: "M3 3H21L12 18Z",
};

// Hanya markup segitiga (dipakai transaction.js, yang memilih sendiri kapan menampilkannya).
// Tipe selain "income" memakai segitiga terbalik, sama seperti perilaku sebelumnya.
export function renderTypeTriangle(type) {
  const path = type === "income" ? TRI_PATHS.income : TRI_PATHS.expense;
  return `<svg class="tx-tri" viewBox="0 0 24 21" aria-hidden="true"><path d="${path}" fill="currentColor" stroke="currentColor" stroke-width="3" stroke-linejoin="round"/></svg>`;
}

// Isi ikon untuk satu tipe: segitiga untuk pemasukan/pengeluaran, piggy bank untuk tabungan
export function renderTypeIcon(type) {
  if (type === "saving") {
    return `<i class="fas fa-piggy-bank" aria-hidden="true"></i>`;
  }
  return renderTypeTriangle(type);
}

// Tile ikon lengkap (42px, radius 12px, latar tint 12%)
export function renderTypeTile(type, extraClass = "") {
  const cls = ["type-tile", type, extraClass].filter(Boolean).join(" ");
  return `<span class="${cls}">${renderTypeIcon(type)}</span>`;
}

export function ensureTypeIconStyles() {
  if (document.getElementById("type-icon-styles")) return;
  const style = document.createElement("style");
  style.id = "type-icon-styles";
  style.textContent = `
    .type-tile {
      width: 42px;
      height: 42px;
      border-radius: 12px;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
      font-size: 1.05rem;
    }
    .type-tile.income {
      background: rgba(16, 185, 129, 0.12);
      color: #10b981;
    }
    .type-tile.expense {
      background: rgba(239, 68, 68, 0.12);
      color: #ef4444;
    }
    .type-tile.saving {
      background: rgba(139, 92, 246, 0.12);
      color: #8b5cf6;
    }
    .type-tile .tx-tri {
      display: block;
      width: 18px;
      height: 16px;
    }
  `;
  document.head.appendChild(style);
}
