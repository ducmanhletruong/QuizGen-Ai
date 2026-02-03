// file: services/geminiUploadSamples.ts
// Service to handle file uploads to Gemini Files API.
// NOTE: Browser-side uploads to Gemini Files API are NOT supported due to CORS restrictions 
// on the 'x-goog-upload-url' header. This service is disabled to prevent runtime errors.

export interface UploadResult {
  fileUri: string;
}

export class UploadError extends Error {
  code: string;
  originalError?: any;

  constructor(message: string, code: string, originalError?: any) {
    super(message);
    this.name = 'UploadError';
    this.code = code;
    this.originalError = originalError;
  }
}

/**
 * Orchestrator: DISABLED
 * The Gemini Files API requires server-side authentication and header handling.
 * It cannot be used directly from a browser.
 */
export async function uploadToGeminiFiles(
  file: File,
  onProgress?: (percent: number) => void,
  signal?: AbortSignal
): Promise<UploadResult> {
  // Immediately throw to indicate architecture limitation
  console.error("Gemini Files API Upload is not supported in browser environments due to CORS.");
  throw new UploadError(
    "Direct browser upload is not supported by Google Files API. Please use local text extraction.",
    "NOT_SUPPORTED"
  );
}
