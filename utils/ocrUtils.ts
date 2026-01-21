// file: utils/ocrUtils.ts
// Handles client-side OCR using Tesseract.js with batch processing and progress tracking.

import { createWorker } from 'tesseract.js';
import { PDFDocumentProxy } from 'pdfjs-dist';

export interface OCROptions {
  maxPages?: number;
  batchSize?: number;
  scale?: number;
  lang?: string;
  onProgress?: (percent: number) => void;
  signal?: AbortSignal;
}

/**
 * Converts a PDF Page to a Canvas element for OCR.
 * Optimizes image for text recognition (Grayscale).
 */
const renderPageToCanvas = async (pdfDoc: PDFDocumentProxy, pageNum: number, scale: number): Promise<HTMLCanvasElement> => {
  const page = await pdfDoc.getPage(pageNum);
  const viewport = page.getViewport({ scale });
  
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');
  
  if (!context) throw new Error("Could not create canvas context");

  canvas.height = viewport.height;
  canvas.width = viewport.width;

  await page.render({
    canvasContext: context,
    viewport: viewport
  } as any).promise;

  // Simple Grayscale Preprocessing [Inference: Increases Tesseract accuracy by ~10-15% on noisy scans]
  const imgData = context.getImageData(0, 0, canvas.width, canvas.height);
  const data = imgData.data;
  for (let i = 0; i < data.length; i += 4) {
    const avg = (data[i] + data[i + 1] + data[i + 2]) / 3;
    data[i] = avg;     // Red
    data[i + 1] = avg; // Green
    data[i + 2] = avg; // Blue
  }
  context.putImageData(imgData, 0, 0);

  return canvas;
};

export const runOCRFromPDF = async (pdfDoc: PDFDocumentProxy, options: OCROptions = {}): Promise<string> => {
  const {
    maxPages = 70, // Stop after 70 pages to prevent browser crash
    batchSize = 5,  // Process 5 pages then yield to UI
    scale = 1.5,    // 1.5 is a good balance for speed/accuracy [Inference]
    lang = 'vie+eng',
    onProgress,
    signal
  } = options;

  let worker = null;
  let fullText = '';
  
  try {
    // Initialize Tesseract Worker
    worker = await createWorker(lang);
    
    const numPages = Math.min(pdfDoc.numPages, maxPages);
    
    // Batch Processing Loop
    for (let i = 1; i <= numPages; i += batchSize) {
      if (signal?.aborted) throw new Error("OCR_ABORTED");

      const batchEnd = Math.min(i + batchSize - 1, numPages);
      
      // Process batch
      for (let p = i; p <= batchEnd; p++) {
        if (signal?.aborted) throw new Error("OCR_ABORTED");
        
        try {
          const canvas = await renderPageToCanvas(pdfDoc, p, scale);
          
          // Convert canvas to blob url for Tesseract
          const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/png'));
          if (!blob) continue;

          const { data: { text } } = await worker.recognize(blob);
          
          if (text.trim().length > 0) {
            fullText += `--- Page ${p} (OCR) ---\n${text}\n\n`;
          }

          // Update Progress
          const percent = Math.round((p / numPages) * 100);
          if (onProgress) onProgress(percent);

        } catch (pageErr) {
          console.warn(`OCR Failed on page ${p}`, pageErr);
        }
      }

      // Yield to main thread to allow UI updates and prevent freezing
      await new Promise(resolve => setTimeout(resolve, 0));
    }

    return fullText;

  } catch (error: any) {
    if (error.message === 'OCR_ABORTED') {
      throw new Error("Đã hủy quá trình OCR.");
    }
    console.error("OCR Error:", error);
    throw new Error("Lỗi xử lý OCR: " + error.message);
  } finally {
    if (worker) {
      await worker.terminate();
    }
  }
};