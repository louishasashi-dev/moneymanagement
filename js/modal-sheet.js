// Gaya bersama Bottom Sheet mobile (Aurora Glass, DESIGN_MODAL.md).
// Dipakai oleh modal di transaction.js dan wallet.js. Struktur markup yang dibutuhkan:
//   .modal-overlay.tx-sheet-overlay
//     .modal-container.tx-sheet
//       .modal-header
//       .modal-body > [form >] .tx-sheet-scroll + .tx-sheet-footer
// Di desktop semua class ini netral, jadi tampilan desktop tidak berubah.

// Sticky Action Footer untuk Bottom Sheet mobile (modal Tambah Transaksi & Transaksi Banyak).
// Struktur: .modal-container.tx-sheet > header | .modal-body > form > (.tx-sheet-scroll | .tx-sheet-footer)
// Di desktop wrapper ini netral (tidak ada style), jadi tampilan desktop tidak berubah.
export function ensureTxSheetStyles() {
  if (document.getElementById("tx-sheet-styles")) return;
  const vp = document.querySelector('meta[name="viewport"]');
  if (vp && !/interactive-widget/.test(vp.getAttribute("content") || "")) {
    vp.setAttribute(
      "content",
      (vp.getAttribute("content") || "width=device-width, initial-scale=1") +
        ", interactive-widget=resizes-content",
    );
  }
  const style = document.createElement("style");
  style.id = "tx-sheet-styles";
  style.textContent = `
    @keyframes txSheetUp {
      from { transform: translateY(100%); }
      to { transform: translateY(0); }
    }
    @keyframes txSheetFade {
      from { opacity: 0; }
      to { opacity: 1; }
    }
    /* Aurora Glass (DESIGN_MODAL.md) - hanya Bottom Sheet mobile */
    @media (max-width: 768px) {
      /* Latar overlay: gradient yang sama dengan header dashboard (.dash-hero)
         agar kaca sheet punya warna untuk dibiaskan. */
      .modal-overlay.tx-sheet-overlay {
        position: fixed !important;
        top: 0 !important;
        left: 0 !important;
        right: 0 !important;
        bottom: 0 !important;
        width: 100% !important;
        height: 100vh !important;
        height: 100dvh !important;
        box-sizing: border-box !important;
        display: flex !important;
        align-items: flex-end !important;
        justify-content: center !important;
        padding: 0 !important;
        z-index: 10000 !important;
        background:
          radial-gradient(circle at 92% 0%, rgba(198, 244, 50, 0.16) 0%, rgba(198, 244, 50, 0) 45%),
          linear-gradient(160deg, #0F5A3A 0%, #0B3D2A 70%),
          #0B3D2A !important;
        animation: txSheetFade 200ms ease both;
      }

      /* Sheet: pane kaca (glass tokens) */
      .modal-overlay.tx-sheet-overlay .modal-container.tx-sheet {
        position: relative !important;
        top: auto !important;
        left: auto !important;
        right: auto !important;
        bottom: auto !important;
        width: 100% !important;
        max-width: 100% !important;
        margin: 0 !important;
        border-radius: 26px 26px 0 0 !important;
        transform: none;
        animation: txSheetUp 350ms cubic-bezier(0.32, 0.72, 0, 1) both;
        display: flex;
        flex-direction: column;
        max-height: 88vh;
        max-height: 88dvh;
        overflow: hidden;
        color-scheme: dark;
        font-family: "Inter", system-ui, -apple-system, "Segoe UI", sans-serif;
        color: #F4F7FB;
        background: rgba(255, 255, 255, 0.06) !important;
        -webkit-backdrop-filter: blur(40px) saturate(200%);
        backdrop-filter: blur(40px) saturate(200%);
        border: 1px solid rgba(255, 255, 255, 0.18) !important;
        border-bottom: none !important;
        box-shadow:
          0 30px 80px -20px rgba(0, 0, 0, 0.65),
          inset 0 1px 0 rgba(255, 255, 255, 0.22),
          inset 0 -1px 0 rgba(255, 255, 255, 0.04) !important;
      }

      /* Header: tidak ikut scroll */
      .modal-container.tx-sheet > .modal-header {
        flex-shrink: 0;
        background: transparent;
        border-bottom: 1px solid rgba(255, 255, 255, 0.08);
      }
      .modal-container.tx-sheet > .modal-header h3 {
        color: #F4F7FB;
        font-weight: 600;
        letter-spacing: -0.02em;
      }
      .modal-container.tx-sheet .modal-close-x {
        color: #A6B0C2;
      }
      .modal-container.tx-sheet .modal-close-x:hover,
      .modal-container.tx-sheet .modal-close-x:active {
        color: #F4F7FB;
      }

      /* Struktur flex: header | konten (scroll) | footer */
      .modal-container.tx-sheet > .modal-body {
        flex: 1;
        min-height: 0;
        display: flex;
        flex-direction: column;
        overflow: hidden;
        padding: 0;
        background: transparent;
      }
      .modal-container.tx-sheet form {
        flex: 1;
        min-height: 0;
        display: flex;
        flex-direction: column;
        margin: 0;
      }
      .modal-container.tx-sheet .tx-sheet-scroll {
        flex: 1;
        min-height: 0;
        overflow-y: auto;
        overscroll-behavior: contain;
        -webkit-overflow-scrolling: touch;
        padding: 20px 20px 24px;
        scroll-padding-bottom: 24px;
        scrollbar-width: thin;
        scrollbar-color: rgba(255, 255, 255, 0.28) transparent;
      }

      /* Teks: kontras tinggi (ink) untuk label, mid untuk keterangan */
      .modal-container.tx-sheet label,
      .modal-container.tx-sheet .multi-section-title,
      .modal-container.tx-sheet .multi-item-title {
        color: #F4F7FB;
        font-weight: 500;
      }
      .modal-container.tx-sheet .form-help,
      .modal-container.tx-sheet small {
        color: #A6B0C2;
        display: block;
        margin-top: 8px;
        font-size: 0.8125rem;
        line-height: 1.45;
      }
      /* Ritme vertikal: label 8px di atas field, 20px antar grup */
      .modal-container.tx-sheet .form-group {
        margin-top: 0;
        margin-bottom: 20px;
      }
      .modal-container.tx-sheet .form-group:last-child {
        margin-bottom: 0;
      }
      .modal-container.tx-sheet .form-group > label {
        display: block;
        margin-bottom: 8px;
        line-height: 1.3;
      }
      .modal-container.tx-sheet .form-row,
      .modal-container.tx-sheet .multi-form-row {
        gap: 12px;
      }
      /* Jarak sudah diatur oleh label dan form-group, jadi margin bawaan pemilih dinolkan */
      .modal-container.tx-sheet .type-selector,
      .modal-container.tx-sheet .quantity-selector,
      .modal-container.tx-sheet .icon-selector,
      .modal-container.tx-sheet .color-selector,
      .modal-container.tx-sheet .photo-upload {
        margin-top: 0;
        margin-bottom: 0;
      }
      .modal-container.tx-sheet .multi-section-title {
        margin: 4px 0 12px;
      }
      .modal-container.tx-sheet .multi-item {
        margin-bottom: 14px;
      }
      .modal-container.tx-sheet input[type="checkbox"] {
        accent-color: #7DF9D6;
      }

      /* Input: kaca lebih terang dari sheet + hairline jelas */
      .modal-container.tx-sheet .form-input {
        background: rgba(255, 255, 255, 0.10);
        color: #F4F7FB;
        border: 1px solid rgba(255, 255, 255, 0.22);
        border-radius: 18px;
        font-size: 1rem;
        box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.18);
        caret-color: #7DF9D6;
      }
      .modal-container.tx-sheet .form-input::placeholder {
        color: #A6B0C2;
        opacity: 1;
      }
      .modal-container.tx-sheet .form-input:hover {
        border-color: rgba(125, 249, 214, 0.4);
      }
      .modal-container.tx-sheet .form-input:focus {
        outline: none;
        border-color: rgba(125, 249, 214, 0.65);
        box-shadow: 0 0 0 4px rgba(125, 249, 214, 0.15), inset 0 1px 0 rgba(255, 255, 255, 0.18);
      }
      .modal-container.tx-sheet .form-input.error,
      .modal-container.tx-sheet .form-input.input-error,
      .modal-container.tx-sheet .form-input[aria-invalid="true"] {
        border-color: rgba(248, 113, 113, 0.7);
        box-shadow: 0 0 0 4px rgba(248, 113, 113, 0.15);
      }
      .modal-container.tx-sheet .form-input:disabled {
        opacity: 0.4;
      }
      .modal-container.tx-sheet select.form-input option {
        background: #0A0D18;
        color: #F4F7FB;
      }

      /* Pilihan tipe / jumlah: outline pill, terpilih = aksen mint */
      .modal-container.tx-sheet .type-btn,
      .modal-container.tx-sheet .qty-btn {
        background: rgba(255, 255, 255, 0.04);
        color: #F4F7FB;
        border: 1px solid rgba(255, 255, 255, 0.18);
        border-radius: 9999px;
        font-weight: 500;
        box-shadow: none;
      }
      .modal-container.tx-sheet .type-btn.active,
      .modal-container.tx-sheet .qty-btn.active {
        background: rgba(125, 249, 214, 0.18);
        color: #7DF9D6;
        border-color: rgba(125, 249, 214, 0.45);
        font-weight: 600;
      }

      /* Transaksi Banyak: kartu barang, total, tombol tambah */
      .modal-container.tx-sheet .multi-item {
        background: rgba(255, 255, 255, 0.06);
        border: 1px solid rgba(255, 255, 255, 0.10);
        border-radius: 18px;
        box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.18);
      }
      .modal-container.tx-sheet .multi-item-total {
        color: #F4F7FB;
        font-weight: 600;
      }
      .modal-container.tx-sheet .icon-btn {
        background: transparent;
        color: #A6B0C2;
        border: none;
      }
      .modal-container.tx-sheet .icon-btn:hover,
      .modal-container.tx-sheet .icon-btn:active {
        color: #F4F7FB;
      }
      .modal-container.tx-sheet .info-box {
        background: rgba(255, 255, 255, 0.06);
        border: 1px solid rgba(255, 255, 255, 0.10);
        border-radius: 18px;
        color: #A6B0C2;
      }
      .modal-container.tx-sheet .multi-add-btn {
        background: rgba(255, 255, 255, 0.10);
        color: #F4F7FB;
        border: 1px solid rgba(255, 255, 255, 0.22);
        border-radius: 9999px;
        font-weight: 600;
        box-shadow: 0 8px 24px -8px rgba(0, 0, 0, 0.45), inset 0 1px 0 rgba(255, 255, 255, 0.18);
      }

      /* Footer: kaca, tidak ikut scroll, aman dari home indicator */
      .modal-container.tx-sheet .tx-sheet-footer {
        position: relative;
        flex-shrink: 0;
        margin: 0;
        padding: 16px 20px calc(28px + env(safe-area-inset-bottom, 0px));
        background: rgba(255, 255, 255, 0.06);
        -webkit-backdrop-filter: blur(40px) saturate(200%);
        backdrop-filter: blur(40px) saturate(200%);
        border-top: 1px solid rgba(255, 255, 255, 0.08);
        box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.18);
      }
      .modal-container.tx-sheet .tx-sheet-footer.modal-buttons {
        display: flex;
        gap: 12px;
      }
      .modal-container.tx-sheet .tx-sheet-footer .modal-buttons {
        display: flex;
        gap: 12px;
        margin: 0;
        padding: 0;
        border: 0;
        background: none;
      }
      .modal-container.tx-sheet .tx-sheet-footer button {
        min-height: 48px;
        border-radius: 9999px;
        padding: 12px 16px;
        font-size: 0.9375rem;
        font-weight: 600;
        letter-spacing: -0.01em;
        color: #F4F7FB;
        white-space: nowrap;
      }
      .modal-container.tx-sheet .tx-sheet-footer .btn-secondary {
        flex: 1;
        background: rgba(255, 255, 255, 0.10);
        border: 1px solid rgba(255, 255, 255, 0.22);
        box-shadow: 0 8px 24px -8px rgba(0, 0, 0, 0.45), inset 0 1px 0 rgba(255, 255, 255, 0.18);
        -webkit-backdrop-filter: blur(32px) saturate(180%);
        backdrop-filter: blur(32px) saturate(180%);
      }
      .modal-container.tx-sheet .tx-sheet-footer .btn-primary {
        flex: 2;
        background: rgba(125, 249, 214, 0.22);
        border: 1px solid rgba(125, 249, 214, 0.45);
        box-shadow: 0 12px 32px -8px rgba(125, 249, 214, 0.45), inset 0 1px 0 rgba(255, 255, 255, 0.28);
        -webkit-backdrop-filter: blur(32px) saturate(200%);
        backdrop-filter: blur(32px) saturate(200%);
      }
      .modal-container.tx-sheet .tx-sheet-footer .btn-primary:active,
      .modal-container.tx-sheet .tx-sheet-footer .btn-secondary:active {
        transform: translateY(0) scale(0.98);
        filter: brightness(0.96);
      }
      .modal-container.tx-sheet .tx-sheet-footer .btn-primary:disabled {
        opacity: 0.4;
        filter: saturate(0.4);
      }
      .modal-container.tx-sheet .tx-sheet-footer button:focus-visible,
      .modal-container.tx-sheet .type-btn:focus-visible,
      .modal-container.tx-sheet .qty-btn:focus-visible {
        outline: 2px solid rgba(125, 249, 214, 0.5);
        outline-offset: 3px;
      }

      /* Transaksi Banyak: total + tombol dalam satu footer */
      .modal-container.tx-sheet .multi-footer.tx-sheet-footer {
        display: flex;
        flex-direction: column;
        gap: 12px;
        padding-top: 14px;
      }
      .modal-container.tx-sheet .multi-footer .multi-total-row {
        margin: 0;
        color: #F4F7FB;
      }
      .modal-container.tx-sheet .multi-footer #multi-total {
        color: #7DF9D6;
        font-weight: 600;
      }
    }
  `;
  document.head.appendChild(style);
}
