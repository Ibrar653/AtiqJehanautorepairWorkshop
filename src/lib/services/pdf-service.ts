import jsPDF from "jspdf";
import html2canvas from "html2canvas-pro";

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
    // The on-screen PDF template is deliberately positioned offscreen.
    // Move only the cloned copy into the capture viewport to avoid blank PDFs.
    onclone: (_clonedDocument, clonedElement) => {
      clonedElement.style.position = "absolute";
      clonedElement.style.left = "0";
      clonedElement.style.top = "0";
      clonedElement.style.visibility = "visible";
      clonedElement.style.zIndex = "1";
    },
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
