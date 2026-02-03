// file: utils/ocrUtils.ts
// Handles client-side OCR using Tesseract.js with batch processing, image enhancement, and progress tracking.

import { createWorker } from 'tesseract.js';
import { PDFDocumentProxy } from 'pdfjs-dist';

export interface OCROptions {
  maxPages?: number;
  batchSize?: number;
  scale?: number;
  lang?: string;
  enhanceVisibility?: boolean; // New: Toggle image preprocessing
  debug?: boolean; // New: Enable verbose logging
  onProgress?: (percent: number) => void;
  signal?: AbortSignal;
}

/**
 * Applies image processing algorithms to improve OCR accuracy.
 * 1. Grayscale (Luma)
 * 2. Dynamic Thresholding (Binarization) based on average luminance
 */
const applyImagePreprocessing = (context: CanvasRenderingContext2D, width: number, height: number) => {
  const imgData = context.getImageData(0, 0, width, height);
  const data = imgData.data;
  let totalLuma = 0;

  // Pass 1: Convert to Grayscale & Calculate Average Luminance
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    
    // Standard Rec. 601 Luma formula
    const luma = 0.299 * r + 0.587 * g + 0.114 * b;
    
    data[i] = luma;     // R
    data[i + 1] = luma; // G
    data[i + 2] = luma; // B
    // data[i+3] is Alpha, leave it alone
    
    totalLuma += luma;
  }

  const avgLuma = totalLuma / (data.length / 4);
  
  // Heuristic: Text is usually darker than the background.
  // We set the threshold slightly below the average brightness to keep text black and make background white.
  // 0.9 is a safe factor to avoid washing out thin text.
  const threshold = avgLuma * 0.9;

  // Pass 2: Binarization (Thresholding)
  for (let i = 0; i < data.length; i += 4) {
    const luma = data[i];
    // If pixel is darker than threshold, make it absolute black, else absolute white
    const val = luma < threshold ? 0 : 255;
    
    data[i] = val;
    data[i + 1] = val;
    data[i + 2] = val;
  }

  context.putImageData(imgData, 0, 0);
  return { avgLuma, threshold };
};

/**
 * Converts a PDF Page to a Canvas element for OCR.
 */
const renderPageToCanvas = async (
  pdfDoc: PDFDocumentProxy, 
  pageNum: number, 
  scale: number,
  enhance: boolean
): Promise<HTMLCanvasElement> => {
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

  if (enhance) {
    try {
      applyImagePreprocessing(context, canvas.width, canvas.height);
    } catch (e) {
      console.warn("Image preprocessing failed, continuing with raw image.", e);
    }
  }

  return canvas;
};

export const runOCRFromPDF = async (pdfDoc: PDFDocumentProxy, options: OCROptions = {}): Promise<string> => {
  const {
    maxPages = 70, 
    batchSize = 5,  
    scale = 1.5,    
    lang = 'vie+eng',
    enhanceVisibility = true,
    debug = false,
    onProgress,
    signal
  } = options;

  let worker = null;
  let fullText = '';
  let failedPages = 0;
  
  try {
    if (debug) console.log(`Starting OCR: Lang=${lang}, Enhance=${enhanceVisibility}, Scale=${scale}`);

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
          const canvas = await renderPageToCanvas(pdfDoc, p, scale, enhanceVisibility);
          
          // Convert canvas to blob url for Tesseract
          const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/png'));
          if (!blob) {
            console.warn(`Page ${p}: Failed to create image blob.`);
            failedPages++;
            continue;
          }

          if (debug) console.log(`Page ${p}: Recognizing...`);

          const result = await worker.recognize(blob);
          const pageText = result.data.text;
          
          if (pageText && pageText.trim().length > 0) {
            fullText += `--- Page ${p} (OCR) ---\n${pageText}\n\n`;
          } else {
            if (debug) console.warn(`Page ${p}: Tesseract returned empty text.`);
            // Don't count as 'failed', just empty (maybe a blank page)
          }

          // Update Progress
          const percent = Math.round((p / numPages) * 100);
          if (onProgress) onProgress(percent);

        } catch (pageErr: any) {
          failedPages++;
          console.warn(`OCR Failed on page ${p}`, pageErr);
          
          // If Tesseract throws a memory error or specific runtime error, we might need to break
          if (pageErr.message?.includes('memory') || pageErr.message?.includes('wasm')) {
             throw new Error("Tesseract Memory Error: Trình duyệt không đủ bộ nhớ để xử lý ảnh này.");
          }
        }
      }

      // Yield to main thread to allow UI updates and prevent freezing
      await new Promise(resolve => setTimeout(resolve, 0));
    }

    if (fullText.trim().length === 0 && numPages > 0) {
      throw new Error("OCR hoàn tất nhưng không tìm thấy văn bản nào. Có thể ảnh quá mờ hoặc handwriting không đọc được.");
    }

    if (failedPages > 0 && debug) {
      console.warn(`OCR completed with ${failedPages} failed pages.`);
    }

    return fullText;

  } catch (error: any) {
    if (error.message === 'OCR_ABORTED') {
      throw new Error("Đã hủy quá trình OCR.");
    }
    console.error("OCR Final Error:", error);
    
    // Propagate specific errors, otherwise generic
    if (error.message?.includes("Tesseract")) {
       throw error;
    }
    throw new Error("Lỗi xử lý OCR: " + (error.message || "Lỗi không xác định"));
  } finally {
    if (worker) {
      await worker.terminate();
    }
  }
};
