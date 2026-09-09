/**
 * The quotation document, as a standalone HTML string.
 *
 * Standalone, and not a React component, for two reasons that are both hard
 * constraints rather than preferences:
 *
 *  - html2pdf renders through html2canvas, which rasterises *computed* styles.
 *    CSS variables and modern colour functions do not survive it, so every
 *    colour here is a literal hex and there is no Tailwind.
 *  - the same markup has to render in a bare `window.open('')` document that
 *    has no stylesheet of its own, so the CSS travels with it.
 *
 * Layout is explicit A4 blocks. html2canvas slices a tall page blindly, which
 * is how a table ends up cut through the middle of a row; declaring the pages
 * lets `pagebreak` in quotationPdf.ts break where we intend.
 */

import { formatMoney, type QuotationDocument } from '@/lib/quotationDocument';
import { involvesLoan } from '@/lib/payments';

/** Solar orange — the app's own theme-color, not Tailwind's orange-500. */
const BRAND = '#BD4308';
const INK = '#1B2437';
const MUTED = '#5A6478';
const LINE = '#E2E6ED';
const WASH = '#F7F8FA';

/** HTML-escape. Every value here is customer data or admin-entered text. */
const esc = (value: unknown): string =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const nl2br = (value: string): string => esc(value).replace(/\n/g, '<br/>');

const styles = `
  *{box-sizing:border-box;margin:0;padding:0}
  body{background:${WASH};color:${INK};
       font-family:Inter,-apple-system,"Segoe UI",Roboto,Arial,sans-serif;
       font-size:10.5px;line-height:1.5;-webkit-font-smoothing:antialiased}
  .q-page{width:210mm;min-height:297mm;padding:12mm 12mm 14mm;background:#fff;
          position:relative;overflow:hidden}
  .q-page + .q-page{page-break-before:always;break-before:page}
  .q-block{break-inside:avoid;page-break-inside:avoid}
  tr,thead{break-inside:avoid;page-break-inside:avoid}

  /* Letterhead: a solid brand band, so the page reads as a document and not a
     spreadsheet print. */
  .lh{display:flex;align-items:center;gap:12px;padding-bottom:10px;
      border-bottom:3px solid ${BRAND}}
  .lh-logo{width:52px;height:52px;object-fit:contain;flex:0 0 52px}
  .lh-mark{width:52px;height:52px;flex:0 0 52px;border-radius:12px;background:${BRAND};
           color:#fff;display:flex;align-items:center;justify-content:center;
           font-size:19px;font-weight:800;letter-spacing:.5px}
  .lh-name{font-size:21px;font-weight:800;letter-spacing:.3px;color:${BRAND};line-height:1.15}
  .lh-sub{font-size:9.5px;color:${MUTED};margin-top:2px}
  .lh-right{margin-left:auto;text-align:right;font-size:9.5px;color:${MUTED}}

  .doc-bar{display:flex;align-items:flex-end;justify-content:space-between;
           gap:16px;margin-top:14px}
  .doc-title{font-size:17px;font-weight:800;letter-spacing:.02em}
  .doc-title small{display:block;font-size:9.5px;font-weight:600;color:${MUTED};
                   letter-spacing:.14em;text-transform:uppercase;margin-bottom:3px}
  .chip{display:inline-block;background:${BRAND};color:#fff;border-radius:999px;
        padding:3px 10px;font-size:9.5px;font-weight:700;letter-spacing:.04em}
  .meta{text-align:right;font-size:9.5px;color:${MUTED};line-height:1.7}
  .meta b{color:${INK}}

  .cards{display:flex;gap:10px;margin-top:12px}
  .card{flex:1;border:1px solid ${LINE};border-radius:10px;padding:10px 12px;background:${WASH}}
  .card h4{font-size:8.5px;text-transform:uppercase;letter-spacing:.14em;
           color:${MUTED};font-weight:700;margin-bottom:5px}
  .card .big{font-size:12.5px;font-weight:700}
  .card p{font-size:10px;color:${MUTED};margin-top:2px}

  h3.sec{font-size:11.5px;font-weight:800;letter-spacing:.02em;margin:16px 0 8px;
         padding-left:9px;border-left:3px solid ${BRAND}}

  table{width:100%;border-collapse:collapse}
  th{background:${INK};color:#fff;font-size:8.5px;font-weight:700;
     text-transform:uppercase;letter-spacing:.1em;padding:7px 9px;text-align:left}
  td{padding:7px 9px;border-bottom:1px solid ${LINE};vertical-align:top}
  tbody tr:nth-child(even){background:${WASH}}
  .num{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}
  .c{text-align:center}

  .credit td{color:#0F7B4F;font-weight:600}
  .total-row td{background:${BRAND};color:#fff;font-weight:800;font-size:12px;
                border-bottom:none;padding:9px}

  .notes{border:1px solid ${LINE};border-radius:10px;padding:10px 12px;background:${WASH}}
  .notes li{margin-left:14px;margin-bottom:3px;color:${MUTED}}

  .tc{margin-bottom:9px}
  .tc h5{font-size:10px;font-weight:700;margin-bottom:2px}
  .tc p{font-size:9.5px;color:${MUTED};white-space:pre-line}

  .bank{display:flex;gap:12px;border:1px solid ${LINE};border-left:3px solid ${BRAND};
        border-radius:10px;padding:11px 13px;background:${WASH}}
  .bank dl{flex:1;display:grid;grid-template-columns:auto 1fr;gap:3px 12px;font-size:10px}
  .bank dt{color:${MUTED}}
  .bank dd{font-weight:600;font-variant-numeric:tabular-nums}
  .bank img{width:82px;height:82px;object-fit:contain}

  .sign{margin-top:18px;display:flex;justify-content:space-between;align-items:flex-end}
  .sign-box{text-align:center;min-width:180px}
  .sign-img{height:52px;object-fit:contain;margin-bottom:2px}
  .sign-rule{border-top:1px solid ${INK};padding-top:4px;font-size:10px;font-weight:700}
  .sign-sub{font-size:9px;color:${MUTED}}

  .foot{position:absolute;left:12mm;right:12mm;bottom:6mm;display:flex;
        justify-content:space-between;font-size:8.5px;color:${MUTED};
        border-top:1px solid ${LINE};padding-top:5px}
`;

const letterhead = (doc: QuotationDocument, page: number, pages: number): string => {
  const v = doc.vendor;
  const mark = v.logoUrl
    ? `<img class="lh-logo" src="${esc(v.logoUrl)}" alt=""/>`
    : `<div class="lh-mark">${esc(v.firmName.trim().charAt(0) || 'V')}</div>`;
  return `
  <div class="lh">
    ${mark}
    <div>
      <div class="lh-name">${esc(v.firmName)}</div>
      <div class="lh-sub">${esc(v.address)}</div>
    </div>
    <div class="lh-right">
      ${v.gstin ? `GSTIN: <b>${esc(v.gstin)}</b><br/>` : ''}
      ${v.licenseNo ? `Licence: ${esc(v.licenseNo)}<br/>` : ''}
      ${v.mobile ? `${esc(v.mobile)}` : ''}${v.email ? ` &middot; ${esc(v.email)}` : ''}
    </div>
  </div>
  <div class="foot">
    <span>${esc(v.firmName)} &middot; Quotation ${esc(doc.meta.quotationNumber)}</span>
    <span>Page ${page} of ${pages}</span>
  </div>`;
};

const pageOne = (doc: QuotationDocument): string => `
<div class="q-page">
  ${letterhead(doc, 1, 3)}

  <div class="doc-bar">
    <div class="doc-title"><small>Quotation</small>On-Grid Solar Power Plant</div>
    <div class="meta">
      No. <b>${esc(doc.meta.quotationNumber)}</b><br/>
      Date: <b>${esc(doc.meta.date)}</b><br/>
      Valid for <b>${doc.meta.validityDays} days</b>
    </div>
  </div>

  <div class="cards">
    <div class="card">
      <h4>Quotation for</h4>
      <div class="big">${esc(doc.customer.name)}</div>
      ${doc.customer.address ? `<p>${esc(doc.customer.address)}</p>` : ''}
      ${doc.customer.mobile ? `<p>Mobile: ${esc(doc.customer.mobile)}</p>` : ''}
      ${doc.meta.kNumber ? `<p>K-Number: ${esc(doc.meta.kNumber)}</p>` : ''}
    </div>
    <div class="card">
      <h4>Plant capacity</h4>
      <div class="big">${esc(doc.meta.capacityKw || '—')} kW${
        doc.meta.phase ? ` &middot; ${esc(doc.meta.phase)}` : ''
      }</div>
      <p>On-Grid Solar Power Pack System</p>
      <p style="margin-top:5px"><span class="chip">${
        involvesLoan(doc.meta.paymentType) ? 'Bank Financed' : 'Consumer (Cash)'
      }</span></p>
    </div>
  </div>

  <p style="margin-top:12px;color:${MUTED}">
    With reference to our discussion, we are pleased to submit our best offer for the
    design, supply, and installation of an On-Grid Solar Power Pack System.
  </p>

  <h3 class="sec">Bill of Material</h3>
  <table class="q-block">
    <thead><tr>
      <th style="width:34px">#</th><th>Description</th>
      <th>Make / Specification</th><th style="width:82px">Qty</th>
    </tr></thead>
    <tbody>
      ${doc.bom
        .map(
          (r) => `<tr>
        <td class="c">${r.sno}</td>
        <td>${esc(r.description)}</td>
        <td>${esc(r.spec)}</td>
        <td>${esc(r.qty)}</td>
      </tr>`
        )
        .join('')}
    </tbody>
  </table>
</div>`;

const pageTwo = (doc: QuotationDocument): string => {
  const p = doc.pricing;
  return `
<div class="q-page q-page-break">
  ${letterhead(doc, 2, 3)}

  <h3 class="sec">Price Quotation</h3>
  <table class="q-block">
    <thead><tr><th>Description</th><th class="num" style="width:150px">Amount (INR)</th></tr></thead>
    <tbody>
      <tr>
        <td>Solar Power Plant — turnkey supply &amp; installation</td>
        <td class="num">${formatMoney(p.turnkey)}</td>
      </tr>
      ${
        p.subsidy > 0
          ? `<tr class="credit">
               <td>Less: PM Surya Ghar central subsidy</td>
               <td class="num">− ${formatMoney(p.subsidy)}</td>
             </tr>`
          : ''
      }
      <tr class="total-row">
        <td>Net payable by customer</td>
        <td class="num">${formatMoney(p.quotePrice)}</td>
      </tr>
    </tbody>
  </table>

  <h3 class="sec">Payment Schedule${
    involvesLoan(doc.meta.paymentType) ? ' — Bank Financed' : ''
  }</h3>
  <table class="q-block">
    <thead><tr>
      <th style="width:64px">Instalment</th><th>Stage</th>
      <th style="width:58px" class="c">Share</th><th class="num" style="width:130px">Amount (INR)</th>
    </tr></thead>
    <tbody>
      ${doc.schedule
        .map(
          (r) => `<tr>
        <td>${esc(r.installment)}</td>
        <td>${esc(r.stage)}<br/><span style="color:${MUTED};font-size:9px">${esc(
          r.dueWhen
        )}</span></td>
        <td class="c">${esc(r.share || '—')}</td>
        <td class="num">${r.amount === null ? 'As sanctioned' : formatMoney(r.amount)}</td>
      </tr>`
        )
        .join('')}
    </tbody>
  </table>

  <h3 class="sec">Other Terms</h3>
  <div class="notes q-block">
    <ul>
      <li>Net metering and demand charges are not included.</li>
      <li>Delivery 1–2 weeks after purchase order and advance; installation within
          4–5 weeks on a site-ready condition.</li>
      <li>Offer valid for ${doc.meta.validityDays} days from the date above.</li>
      <li>Interest at 18% p.a. applies on payments delayed beyond 7 days.</li>
      <li>Taxes and duties other than those specified will be charged extra.</li>
    </ul>
  </div>
</div>`;
};

const pageThree = (doc: QuotationDocument): string => {
  const b = doc.bank;
  const v = doc.vendor;
  return `
<div class="q-page q-page-break">
  ${letterhead(doc, 3, 3)}

  <h3 class="sec">Terms &amp; Conditions</h3>
  <div>
    ${doc.terms
      .map(
        (t, i) => `<div class="tc q-block">
          <h5>${i + 1}. ${esc(t.title)}</h5>
          <p>${nl2br(t.body)}</p>
        </div>`
      )
      .join('')}
  </div>

  ${
    b
      ? `<h3 class="sec">Bank Details</h3>
         <div class="bank q-block">
           <dl>
             <dt>Firm name</dt><dd>${esc(b.holderName)}</dd>
             <dt>Bank</dt><dd>${esc(b.bankName)}</dd>
             <dt>Account no.</dt><dd>${esc(b.accountNo)}</dd>
             <dt>Account type</dt><dd>${esc(b.accountType)}</dd>
             <dt>IFSC</dt><dd>${esc(b.ifsc)}</dd>
             ${b.branch ? `<dt>Branch</dt><dd>${esc(b.branch)}</dd>` : ''}
           </dl>
           ${b.upiImageUrl ? `<img src="${esc(b.upiImageUrl)}" alt="UPI"/>` : ''}
         </div>`
      : ''
  }

  <p style="margin-top:14px;color:${MUTED}">
    Thank you for your interest in renewable energy with ${esc(v.firmName)}.
    We look forward to your acceptance.
  </p>

  <div class="sign">
    <div style="font-size:10px;color:${MUTED}">
      Warm regards,<br/><b style="color:${INK}">For ${esc(v.firmName)}</b>
    </div>
    <div class="sign-box">
      ${
        v.signatureUrl
          ? `<img class="sign-img" src="${esc(v.signatureUrl)}" alt=""/>`
          : '<div style="height:52px"></div>'
      }
      <div class="sign-rule">Authorised Signatory</div>
      <div class="sign-sub">${esc(v.firmName)}</div>
    </div>
  </div>
</div>`;
};

/** The full document. Returns a complete HTML page, styles included. */
export const buildQuotationHtml = (doc: QuotationDocument): string => `<!doctype html>
<html><head><meta charset="utf-8"/>
<title>Quotation ${esc(doc.meta.quotationNumber)}</title>
<style>${styles}</style></head>
<body>${pageOne(doc)}${pageTwo(doc)}${pageThree(doc)}</body></html>`;

/** Just the pages, for mounting inside an existing React tree. */
export const buildQuotationBody = (doc: QuotationDocument): string =>
  `<style>${styles}</style>${pageOne(doc)}${pageTwo(doc)}${pageThree(doc)}`;
