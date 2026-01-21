import { getDocument, GlobalWorkerOptions, version, PDFDocumentProxy } from 'pdfjs-dist';
import { runOCRFromPDF } from './ocrUtils';

const CDN_BASE = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${version}`;
GlobalWorkerOptions.workerSrc = `${CDN_BASE}/build/pdf.worker.min.mjs`;

// Preload worker
try {
  fetch(GlobalWorkerOptions.workerSrc, { method: 'HEAD', mode: 'cors' }).catch(() => {});
} catch (e) {
  // Ignore
}

const cleanText = (text: string): string => {
  if (!text) return "";
  return text
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
    .normalize('NFKC')
    .replace(/[ \t]+/g, ' ')
    .replace(/(\w+)-\n(\w+)/g, '$1$2')
    .trim();
};

export interface PDFExtractionResult {
  text: string;
  pdfDoc?: PDFDocumentProxy; // Return doc proxy so OCR can use it without reloading
}

export interface ExtractOptions {
  enableOCR?: boolean;
  onProgress?: (percent: number) => void;
}

export const extractTextFromPDF = async (
  file: File, 
  options: ExtractOptions = {}
): Promise<PDFExtractionResult> => {
  try {
    const arrayBuffer = await file.arrayBuffer();
    
    const loadingTask = getDocument({
      data: arrayBuffer,
      cMapUrl: `${CDN_BASE}/cmaps/`,
      cMapPacked: true,
      standardFontDataUrl: `${CDN_BASE}/standard_fonts/`,
    });

    const pdf = await loadingTask.promise;
    
    if (pdf.numPages === 0) {
      throw new Error("File PDF không có trang nào.");
    }

    let fullText = '';
    let totalItems = 0;
    
    // Iterate through all pages
    for (let i = 1; i <= pdf.numPages; i++) {
      try {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        
        const meaningfulItems = textContent.items.filter((item: any) => (item.str || '').trim().length > 0);
        totalItems += meaningfulItems.length;

        const pageText = textContent.items
          .map((item: any) => {
             const str = item.str || ''; 
             return item.hasEOL ? `${str}\n` : `${str} `;
          })
          .join('');
        
        const cleanedPageText = cleanText(pageText);

        if (cleanedPageText.length > 0) {
          fullText += `--- Page ${i} ---\n${cleanedPageText}\n\n`;
        }
      } catch (pageError) {
        console.warn(`Warning: Could not extract text from page ${i}`, pageError);
      }
    }

    const trimmedText = fullText.trim();
    
    // Scanned PDF Detection
    if (trimmedText.length < 50) {
        if (totalItems < 10) {
            // Case 1: Scanned PDF (OCR required)
            if (options.enableOCR) {
              console.log("Scanned PDF detected. Starting OCR...");
              try {
                const ocrText = await runOCRFromPDF(pdf, {
                  onProgress: options.onProgress,
                  // Pass a signal if we extended extractTextFromPDF to support cancellation
                });
                return { text: ocrText, pdfDoc: pdf };
              } catch (ocrError: any) {
                // If OCR fails or is cancelled, we still might want to throw the specific error
                // so the UI knows it was a scanned file issue.
                throw new Error(`OCR thất bại: ${ocrError.message}`);
              }
            }

            // Throw a custom error object that the UI can detect to prompt user for OCR
            const error: any = new Error("File PDF giống hình ảnh scan.");
            error.code = "PDF_SCANNED";
            error.pdfDoc = pdf; // Pass the loaded PDF document to avoid re-parsing
            throw error;
        }
        
        console.warn("PDF extraction found items but text is mostly empty. Items count:", totalItems);
        throw new Error("Không thể giải mã văn bản (Lỗi Font/Encoding).");
    }

    return { text: fullText, pdfDoc: pdf };

  } catch (error: any) {
    console.error("Error extracting PDF text:", error);
    
    // Pass through our specific scanned error or OCR error
    if (error.code === 'PDF_SCANNED') {
      throw error;
    }

    if (error.name === 'PasswordException' || error.message?.includes('Password')) {
        throw new Error("File PDF được bảo vệ bằng mật khẩu.");
    }
    if (error.name === 'InvalidPDFException') {
        throw new Error("File không đúng định dạng PDF hoặc bị hỏng.");
    }
    if (error.message?.includes('Failed to fetch') || error.message?.includes('dynamically imported module')) {
         throw new Error("Không thể tải thư viện xử lý PDF. Vui lòng tắt AdBlock hoặc kiểm tra mạng.");
    }

    // Preserve original error message if it's already specific
    throw error.message ? error : new Error("Đã xảy ra lỗi khi đọc file PDF.");
  }
};