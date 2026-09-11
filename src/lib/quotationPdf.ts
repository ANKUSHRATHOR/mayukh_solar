/**
 * html2pdf.js pulls in jsPDF and html2canvas: 982 kB raw, 285 kB gzipped, the
 * single largest thing the app could bundle. It is used only when someone
 * renders a quotation, so it is fetched then rather than shipped to every user
 * who opens the app to look at a lead.
 */
const loadHtml2Pdf = async () => {
  // @ts-ignore - html2pdf.js ships no types
  const mod = await import('html2pdf.js');
  return (mod.default ?? mod) as any;
};

/**
 * Shared html2pdf configuration for quotation documents. Previously duplicated
 * in three places, which meant a tweak to page size or scale in one flow
 * silently produced a different PDF in the others.
 *
 * `as const` on `image.type` matters: the library's option type narrows it to
 * 'jpeg' | 'png' | 'webp', and a widened `string` fails to typecheck.
 */
const pdfOptions = (filename: string) =>
  ({
    // The template lays out its own 210x297mm pages with their own padding, so
    // an outer margin here would shrink each page and leave a white gutter.
    margin: 0,
    filename,
    image: { type: 'jpeg' as const, quality: 0.98 },
    html2canvas: { scale: 2, useCORS: true, logging: false },
    jsPDF: { unit: 'mm' as const, format: 'a4' as const, orientation: 'portrait' as const },
    // Without this html2canvas slices a tall document blindly and cuts through
    // the middle of a table row. `css` honours the page-break-before on each
    // .q-page; `avoid-all` keeps rows and blocks whole.
    pagebreak: { mode: ['css', 'legacy'] as const, before: '.q-page-break' },
  });

/** Source for a PDF: either a live DOM node or an HTML string. */
type PdfSource = HTMLElement | string;

/** Renders a quotation to a Blob, for upload or sharing. */
export const renderQuotationPdfBlob = async (
  source: PdfSource,
  quotationNumber: string
): Promise<Blob> => {
  const html2pdf = await loadHtml2Pdf();
  return html2pdf()
    .set(pdfOptions(`Quotation_${quotationNumber}.pdf`))
    .from(source)
    .output('blob');
};

/** Triggers a browser download of the quotation PDF. */
export const downloadQuotationPdf = async (
  source: PdfSource,
  quotationNumber: string
): Promise<void> => {
  const html2pdf = await loadHtml2Pdf();
  await html2pdf()
    .set(pdfOptions(`Quotation_${quotationNumber || 'draft'}.pdf`))
    .from(source)
    .save();
};
