import jsPDF from "jspdf";
import html2canvas from "html2canvas";

/**
 * Ensures all <img> elements inside an element are fully loaded and decoded.
 */
async function waitForImagesToLoad(container: HTMLElement): Promise<void> {
  const images = Array.from(container.querySelectorAll("img"));
  if (images.length === 0) return;

  await Promise.all(
    images.map((img) => {
      if (img.complete && img.naturalWidth > 0) return Promise.resolve();
      return new Promise<void>((resolve) => {
        const onDone = () => {
          img.removeEventListener("load", onDone);
          img.removeEventListener("error", onDone);
          resolve();
        };
        img.addEventListener("load", onDone);
        img.addEventListener("error", onDone);
        // Fallback safety timeout for slow network / broken image
        setTimeout(onDone, 2000);
      });
    })
  );
}

/**
 * Tailwind CSS v4 uses OKLCH colors. html2canvas 1.4.x cannot parse them,
 * even though modern browsers can render them correctly.
 *
 * Only the temporary html2canvas document is modified. The live UI, print
 * templates, and Supabase records are never changed.
 */
function normalizePdfCloneColors(
  clonedDocument: Document,
  clonedElement: HTMLElement
): void {
  const view = clonedDocument.defaultView;
  if (!view) return;

  const colorCanvas = clonedDocument.createElement("canvas");
  colorCanvas.width = 1;
  colorCanvas.height = 1;
  const ctx = colorCanvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return;

  // html2canvas's CSS parser does not support these modern CSS Color functions.
  const unsupportedColor = /(?:oklch|oklab|lch|lab|hwb|color-mix|color)\\s*\\(/i;
  const colorProperties = [
    "color",
    "background-color",
    "border-top-color",
    "border-right-color",
    "border-bottom-color",
    "border-left-color",
    "outline-color",
    "text-decoration-color",
    "column-rule-color",
    "fill",
    "stroke",
  ];

  const toRgb = (value: string): string => {
    // The browser canvas understands OKLCH and converts it to sRGB pixels.
    // Reading a single pixel gives html2canvas a universally supported value.
    ctx.clearRect(0, 0, 1, 1);
    ctx.fillStyle = "#000000";
    ctx.fillStyle = value;
    ctx.fillRect(0, 0, 1, 1);
    const rgba = ctx.getImageData(0, 0, 1, 1).data;
    if (rgba[3] === 255) {
      return `rgb(${rgba[0]}, ${rgba[1]}, ${rgba[2]})`;
    }
    return `rgba(${rgba[0]}, ${rgba[1]}, ${rgba[2]}, ${Number((rgba[3] / 255).toFixed(3))})`;
  };

  // Include html/body and ancestors because html2canvas also inspects the
  // document background, not only the invoice/job-card subtree.
  const elements = new Set<HTMLElement>();
  if (clonedDocument.documentElement) elements.add(clonedDocument.documentElement);
  if (clonedDocument.body) elements.add(clonedDocument.body);
  let ancestor: HTMLElement | null = clonedElement;
  while (ancestor) {
    elements.add(ancestor);
    ancestor = ancestor.parentElement;
  }
  clonedElement.querySelectorAll<HTMLElement>("*").forEach((node) => elements.add(node));

  elements.forEach((node) => {
    const computed = view.getComputedStyle(node);
    for (const property of colorProperties) {
      const value = computed.getPropertyValue(property);
      if (value && unsupportedColor.test(value)) {
        node.style.setProperty(property, toRgb(value), "important");
      }
    }

    // Unsupported modern colors embedded in gradients/shadows/filters cannot
    // be parsed either. These are nonessential to the A4 print templates.
    for (const property of [
      "background-image",
      "box-shadow",
      "text-shadow",
      "border-image-source",
      "filter",
    ]) {
      const value = computed.getPropertyValue(property);
      if (value && unsupportedColor.test(value)) {
        node.style.setProperty(property, "none", "important");
      }
    }
  });
}

/**
 * Generates and downloads a real, downloadable PDF file from an HTML element
 * using html2canvas and jsPDF.
 *
 * Direct download, no browser Print dialog.
 */
export async function exportElementToPdf(
  element: HTMLElement,
  fileName: string
): Promise<void> {
  if (!element) {
    throw new Error("No DOM element provided for PDF generation.");
  }

  // 1. Wait for any logo, stamp, or signature images inside to load
  await waitForImagesToLoad(element);

  // 2. Capture element onto high-resolution canvas (scale: 2 = 192 DPI)
  const canvas = await html2canvas(element, {
    scale: 2,
    useCORS: true,
    allowTaint: true,
    logging: false,
    backgroundColor: "#ffffff",
    windowWidth: 794,
    onclone: normalizePdfCloneColors,
  });

  if (!canvas || canvas.width === 0 || canvas.height === 0) {
    throw new Error("Failed to render document to canvas.");
  }

  const imgData = canvas.toDataURL("image/png");

  // 3. Setup standard A4 PDF (210mm x 297mm)
  const pdf = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
    compress: true,
  });

  const pageWidthMm = 210;
  const pageHeightMm = 297;
  const imgHeightMm = (canvas.height * pageWidthMm) / canvas.width;

  // 4. Add pages if document spans more than one A4 sheet
  if (imgHeightMm <= pageHeightMm) {
    pdf.addImage(imgData, "PNG", 0, 0, pageWidthMm, imgHeightMm, undefined, "FAST");
  } else {
    let heightLeft = imgHeightMm;
    let position = 0;

    pdf.addImage(imgData, "PNG", 0, position, pageWidthMm, imgHeightMm, undefined, "FAST");
    heightLeft -= pageHeightMm;

    while (heightLeft > 0) {
      position -= pageHeightMm;
      pdf.addPage();
      pdf.addImage(imgData, "PNG", 0, position, pageWidthMm, imgHeightMm, undefined, "FAST");
      heightLeft -= pageHeightMm;
    }
  }

  // 5. Trigger direct browser download
  pdf.save(fileName);
}
