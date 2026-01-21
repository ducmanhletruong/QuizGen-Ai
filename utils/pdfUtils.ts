import { getDocument, GlobalWorkerOptions, version } from 'pdfjs-dist';

// Use jsDelivr for the worker source as it is generally reliable and CORS-enabled.
// We explicitly use the imported 'version' to ensure the worker matches the main thread exactly.
// This prevents "Setting up fake worker failed" errors caused by version mismatch.
const CDN_BASE = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${version}`;

// Configure worker to use the minified MJS version.
// Explicitly setting the workerSrc helps PDF.js locate the external worker file
// instead of trying to evaluate it from an incorrect relative path.
GlobalWorkerOptions.workerSrc = `${CDN_BASE}/build/pdf.worker.min.mjs`;

// OPTIMIZATION: Eagerly fetch the worker script in the background to warm up the cache.
// This acts as a redundant fallback to the HTML <link rel="preload"> to ensure 
// the worker is ready when the user uploads a file.
try {
  fetch(GlobalWorkerOptions.workerSrc, { method: 'HEAD', mode: 'cors' }).catch(() => {});
} catch (e) {
  // Ignore fetch errors during warmup
}

/**
 * Normalizes extracted text.
 * Relaxed logic to prevent filtering out valid text in some encodings.
 */
const cleanText = (text: string): string => {
  if (!text) return "";
  return text
    // Replace non-printable control characters (excluding newlines/tabs)
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
    // Normalize unicode 
    .normalize('NFKC')
    // Reduce excessive whitespace but keep structure
    .replace(/[ \t]+/g, ' ')
    // Fix broken words at end of lines (simple heuristic)
    .replace(/(\w+)-\n(\w+)/g, '$1$2')
    .trim();
};

export const extractTextFromPDF = async (file: File): Promise<string> => {
  try {
    const arrayBuffer = await file.arrayBuffer();
    
    // Load document with CMap support for foreign languages (Vietnamese/Asian characters)
    // CMap files are essential for correctly mapping character codes to glyphs in PDFs.
    // We load these from the same CDN to ensure consistency and speed (preconnect applies).
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
        
        totalItems += textContent.items.length;

        // Simple text assembly
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

    // Final Validation with Granular Error Messages
    const trimmedText = fullText.trim();
    
    if (trimmedText.length < 50) {
        // Case 1: Scanned PDF (OCR required)
        // If we found very few text items (less than 5 items total for the whole doc), it's likely an image.
        if (totalItems < 5) {
             throw new Error("File PDF giống ảnh scan (không có lớp văn bản). Vui lòng sử dụng file PDF có thể bôi đen/copy text được.");
        }
        
        // Case 2: Encoding/Font Issues
        // We found items, but they cleaned down to nothing or garbage.
        console.warn("PDF extraction found items but text is mostly empty. Items count:", totalItems);
        throw new Error("Không thể giải mã văn bản (Lỗi Font/Encoding). File có thể chứa ký tự đặc biệt hoặc font không chuẩn Unicode.");
    }

    return fullText;
  } catch (error: any) {
    console.error("Error extracting PDF text:", error);
    
    // Handle specific PDF.js errors
    if (error.name === 'PasswordException' || error.message?.includes('Password')) {
        throw new Error("File PDF được bảo vệ bằng mật khẩu. Vui lòng mở khóa file trước khi tải lên.");
    }

    if (error.name === 'InvalidPDFException') {
        throw new Error("File không đúng định dạng PDF hoặc bị hỏng.");
    }

    if (error.message?.includes('Setting up fake worker failed') || error.message?.includes('No PDF.js worker found')) {
        throw new Error("Lỗi hệ thống đọc PDF (Worker Load Failed). Vui lòng tải lại trang và thử lại.");
    }

    if (error.message?.includes('Failed to fetch') || error.message?.includes('dynamically imported module')) {
         throw new Error("Không thể tải thư viện xử lý PDF. Vui lòng tắt AdBlock hoặc kiểm tra kết nối internet.");
    }

    // Pass through custom errors thrown in the validation block
    if (
        error.message?.includes('File PDF giống ảnh scan') || 
        error.message?.includes('Không thể giải mã văn bản') ||
        error.message?.includes('File PDF không có trang nào')
    ) {
        throw error;
    }

    // Fallback generic error
    throw new Error("Đã xảy ra lỗi khi đọc file PDF. File có thể bị hỏng hoặc định dạng không hỗ trợ.");
  }
};