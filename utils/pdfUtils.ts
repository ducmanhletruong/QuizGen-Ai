import * as pdfjsLib from 'pdfjs-dist';

// Ensure we have a valid version, fallback to a known version if needed.
// Using the version from the library ensures the worker matches the main thread code.
const PDFJS_VERSION = pdfjsLib.version || '5.4.530';

// Set up the worker source using esm.sh to match the importmap provider.
// This is critical for avoiding version mismatch errors and 404s from cdnjs.
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://esm.sh/pdfjs-dist@${PDFJS_VERSION}/build/pdf.worker.min.mjs`;

/**
 * Normalizes extracted text to remove control characters and fix common encoding artifacts.
 */
const cleanText = (text: string): string => {
  return text
    // Remove null bytes and control characters (except newlines/tabs)
    .replace(/[\x00-\x09\x0B-\x0C\x0E-\x1F\x7F]/g, '')
    // Normalize unicode characters (e.g., separate accents to combined)
    .normalize('NFKC')
    // Collapse multiple spaces into one
    .replace(/[ \t]+/g, ' ')
    // Fix hyphenated words across lines (e.g., "exam-\nple" -> "example")
    .replace(/-\n/g, '')
    // Collapse multiple newlines into max two (paragraph breaks)
    .replace(/\n{3,}/g, '\n\n')
    .trim();
};

export const extractTextFromPDF = async (file: File): Promise<string> => {
  try {
    const arrayBuffer = await file.arrayBuffer();
    
    // Load the document with CMap support for better text extraction (handles complex fonts/Vietnamese)
    // standardFontDataUrl helps with standard font rendering
    const loadingTask = pdfjsLib.getDocument({
      data: arrayBuffer,
      cMapUrl: `https://esm.sh/pdfjs-dist@${PDFJS_VERSION}/cmaps/`,
      cMapPacked: true,
      standardFontDataUrl: `https://esm.sh/pdfjs-dist@${PDFJS_VERSION}/standard_fonts/`,
    });

    const pdf = await loadingTask.promise;
    
    if (pdf.numPages === 0) {
      throw new Error("File PDF không có trang nào.");
    }

    let fullText = '';
    
    // Extract text from each page
    for (let i = 1; i <= pdf.numPages; i++) {
      try {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        
        // Improve join logic: check for end of line markers if available, otherwise assume space
        const pageText = textContent.items
          .map((item: any) => {
             const str = item.str || '';
             // Add a newline if the item marks the end of a line (if property exists), otherwise space
             return item.hasEOL ? `${str}\n` : str;
          })
          .join(' ');
        
        const cleanedPageText = cleanText(pageText);

        // Add page markers to help the AI understand document structure
        if (cleanedPageText.length > 0) {
          fullText += `--- Page ${i} ---\n${cleanedPageText}\n\n`;
        }
      } catch (pageError) {
        console.warn(`Warning: Could not extract text from page ${i}`, pageError);
        fullText += `--- Page ${i} (Lỗi đọc trang này) ---\n\n`;
      }
    }

    if (fullText.trim().length === 0) {
        throw new Error("Không tìm thấy văn bản nào có thể đọc được. File có thể là ảnh scan chưa qua OCR.");
    }

    return fullText;
  } catch (error) {
    console.error("Error extracting PDF text:", error);
    
    if (error instanceof Error) {
        // Handle specific PDF.js errors
        if (error.message.includes('Setting up fake worker failed')) {
            throw new Error("Lỗi hệ thống đọc PDF (Worker mismatch). Vui lòng tải lại trang.");
        }
        if (error.name === 'PasswordException') {
            throw new Error("File PDF được bảo vệ bằng mật khẩu. Vui lòng mở khóa trước khi tải lên.");
        }
        if (error.message.includes('Invalid PDF structure') || error.message.includes('Missing PDF header')) {
             throw new Error("File bị lỗi hoặc không phải định dạng PDF hợp lệ.");
        }
        throw new Error(`Lỗi đọc file: ${error.message}`);
    }
    throw new Error("Đã xảy ra lỗi không xác định khi đọc file PDF.");
  }
};