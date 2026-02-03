import { getDocument, GlobalWorkerOptions, version, PDFDocumentProxy } from 'pdfjs-dist';
import { runOCRFromPDF } from './ocrUtils';

const CDN_BASE = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${version}`;
GlobalWorkerOptions.workerSrc = `${CDN_BASE}/build/pdf.worker.min.mjs`;

// Preload worker to avoid delay on first use
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
    
    if (!arrayBuffer || arrayBuffer.byteLength === 0) {
      throw new Error("File trống (0 bytes).");
    }

    const loadingTask = getDocument({
      data: arrayBuffer,
      cMapUrl: `${CDN_BASE}/cmaps/`,
      cMapPacked: true,
      standardFontDataUrl: `${CDN_BASE}/standard_fonts/`,
    });

    // Report loading progress (0-20%)
    if (options.onProgress) {
        loadingTask.onProgress = (p) => {
            if (p.total > 0) {
                 options.onProgress!(Math.round((p.loaded / p.total) * 20));
            }
        };
    }

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
        
        // Timeout race condition for stuck pages
        const textContentPromise = page.getTextContent();
        const textContent = await Promise.race([
            textContentPromise,
            new Promise<any>((_, reject) => setTimeout(() => reject(new Error("Timeout")), 5000))
        ]).catch(e => {
            console.warn(`Page ${i} extraction timed out or failed`, e);
            return { items: [] }; 
        });

        if (!textContent.items) textContent.items = [];
        
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

        // Report extraction progress (20-100%)
        if (options.onProgress) {
            const percentage = 20 + Math.floor((i / pdf.numPages) * 80);
            options.onProgress(percentage);
        }

      } catch (pageError) {
        console.warn(`Warning: Could not extract text from page ${i}`, pageError);
      }
    }

    const trimmedText = fullText.trim();
    
    // Low Density / Scanned Detection
    const MIN_CHARS_TOTAL = 100;
    const MIN_ITEMS_TOTAL = 10;

    if (trimmedText.length < MIN_CHARS_TOTAL) {
        if (totalItems < MIN_ITEMS_TOTAL) {
            // Case 1: Scanned PDF (Almost no text layer)
            if (options.enableOCR) {
              console.log("Scanned PDF detected. Starting OCR...");
              try {
                const ocrText = await runOCRFromPDF(pdf, {
                  onProgress: options.onProgress,
                });
                return { text: ocrText, pdfDoc: pdf };
              } catch (ocrError: any) {
                throw new Error(`OCR thất bại: ${ocrError.message}`);
              }
            }

            // Throw a custom error object that the UI can detect to prompt user for OCR
            const error: any = new Error("File PDF giống hình ảnh scan.");
            error.code = "PDF_SCANNED";
            error.pdfDoc = pdf; // Pass the loaded PDF document to avoid re-parsing
            throw error;
        } else {
            // Case 2: Encoding/Font Issue (Items exist but empty text)
            console.warn("PDF extraction found items but text is mostly empty. Items count:", totalItems);
            throw new Error("Lỗi Font/Encoding: Văn bản không thể giải mã. Có thể PDF bị mã hóa hoặc dùng font không chuẩn.");
        }
    }

    return { text: fullText, pdfDoc: pdf };

  } catch (error: any) {
    console.error("Error extracting PDF text:", error);
    
    // Pass through our specific scanned error or OCR error
    if (error.code === 'PDF_SCANNED') {
      throw error;
    }

    if (error.name === 'PasswordException' || error.message?.toLowerCase().includes('password')) {
        throw new Error("File PDF được bảo vệ bằng mật khẩu. Vui lòng mở khóa file trước khi tải lên.");
    }
    if (error.name === 'InvalidPDFException' || error.name === 'FormatError') {
        throw new Error("File không đúng định dạng PDF hoặc bị hỏng.");
    }
    if (error.message?.includes('Failed to fetch') || error.message?.includes('dynamically imported module') || error.message?.includes('NetworkError')) {
         throw new Error("Không thể tải thư viện xử lý PDF. Vui lòng tắt AdBlock hoặc kiểm tra kết nối mạng.");
    }

    // Preserve original error message if it's already specific
    throw error.message ? error : new Error("Đã xảy ra lỗi khi đọc file PDF.");
  }
};