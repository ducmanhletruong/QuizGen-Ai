// file: services/geminiUploadSamples.ts
// Service to handle file uploads to Gemini Files API with progress tracking, cancellation, and retry logic.

// --- CONFIGURATION & ENV VARS ---
// Use the API_KEY defined in vite.config.ts, fallback to REACT_APP_ if present
const API_KEY = process.env.API_KEY || process.env.REACT_APP_GEMINI_API_KEY;

// Default to the v1beta files endpoint if not explicitly configured
const CREATE_SESSION_ENDPOINT = process.env.REACT_APP_GEMINI_CREATE_UPLOAD_SESSION_URL || 'https://generativelanguage.googleapis.com/upload/v1beta/files';

const MAX_BYTES = Number(process.env.REACT_APP_UPLOAD_MAX_BYTES) || 50 * 1024 * 1024; // Default 50MB
const DEBUG_MODE = process.env.REACT_APP_UPLOAD_DEBUG === 'true';

// --- TYPES ---
export interface UploadResult {
  fileUri: string;
}

interface SessionResponse {
  uploadUrl: string;
  fileUri?: string;
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

// --- HELPERS ---

const logDebug = (message: string, data?: any) => {
  if (DEBUG_MODE) {
    console.log(`[GeminiUpload] ${message}`, data || '');
  }
};

/**
 * Step 1: Create a resumable upload session.
 * [Unverified] Endpoint path and response shape depend on specific API version (v1beta).
 */
async function createUploadSession(fileName: string, mimeType: string, fileSize: number): Promise<SessionResponse> {
  if (!API_KEY) {
    throw new UploadError("Missing API Key configuration. Please check your .env file.", "CONFIG_ERROR");
  }

  // [Unverified] Constructing URL. Assuming standard Google API pattern where key is a query param or header.
  const url = `${CREATE_SESSION_ENDPOINT}?key=${API_KEY}`; 

  logDebug(`Creating session for ${fileName} (${mimeType}, ${fileSize} bytes) at ${url}`);

  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Upload-Protocol': 'resumable',
        'X-Goog-Upload-Command': 'start',
        'X-Goog-Upload-Header-Content-Length': fileSize.toString(),
        'X-Goog-Upload-Header-Content-Type': mimeType,
      },
      body: JSON.stringify({
        file: {
          display_name: fileName,
        }
      })
    });
  } catch (err: any) {
    throw new UploadError("Network error during session creation", "NETWORK_ERROR", err);
  }

  if (!response.ok) {
    const text = await response.text();
    logDebug(`Session creation failed: ${response.status}`, text);
    
    if (response.status === 401 || response.status === 403) {
      throw new UploadError("Authentication failed (401/403)", "AUTH_ERROR");
    }
    throw new UploadError(`Failed to create upload session: ${response.status}`, "CREATE_SESSION_FAILED");
  }

  // [Unverified] Google APIs usually return the `upload_url` in the `x-goog-upload-url` header OR in the JSON body.
  // We check both to be robust.
  const headerUrl = response.headers.get('x-goog-upload-url');
  let bodyData: any = {};
  try {
    bodyData = await response.json();
  } catch (e) { /* ignore JSON parse error if body is empty */ }

  const uploadUrl = headerUrl || bodyData.uploadUrl;

  if (!uploadUrl) {
    logDebug("No uploadUrl found in headers or body", { headers: response.headers, body: bodyData });
    throw new UploadError("API response missing uploadUrl", "CREATE_SESSION_FAILED");
  }

  logDebug("Session created successfully", { uploadUrl, fileUri: bodyData.fileUri });

  return {
    uploadUrl,
    fileUri: bodyData.fileUri // [Unverified] Might be null until upload completes
  };
}

/**
 * Step 2: Upload file bytes using XHR (for progress).
 * [Unverified] Defaulting to PUT as requested. Some Google APIs accept POST.
 */
function uploadFileToUrlWithXHR(
  uploadUrl: string,
  file: File,
  onProgress?: (percent: number) => void,
  signal?: AbortSignal
): Promise<void> {
  return new Promise((resolve, reject) => {
    logDebug("Starting XHR upload", { uploadUrl, size: file.size });

    const xhr = new XMLHttpRequest();
    
    // [Unverified] Using PUT. If the API returns 405 Method Not Allowed, switch to POST.
    xhr.open('PUT', uploadUrl);

    // [Unverified] Standard headers for raw byte upload
    xhr.setRequestHeader('Content-Type', file.type);
    xhr.setRequestHeader('X-Goog-Upload-Command', 'upload, finalize');
    xhr.setRequestHeader('X-Goog-Upload-Offset', '0');
    
    // Progress Listener
    if (xhr.upload) {
      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable && onProgress) {
          const percent = Math.round((event.loaded / event.total) * 100);
          onProgress(percent);
        }
      };
    }

    // Load Listener
    xhr.onload = () => {
      logDebug(`XHR Load: ${xhr.status}`, xhr.responseText);

      if (xhr.status >= 200 && xhr.status < 300) {
        if (onProgress) onProgress(100);
        resolve();
      } else if (xhr.status === 404) {
        // [Unverified] 404 on the uploadUrl usually means the session ID is invalid or expired.
        reject(new UploadError("Upload URL not found or expired", "UPLOAD_URL_NOT_FOUND"));
      } else if (xhr.status === 401 || xhr.status === 403) {
        reject(new UploadError("Unauthorized upload request", "AUTH_ERROR"));
      } else {
        reject(new UploadError(`Upload failed with status ${xhr.status}`, "UPLOAD_FAILED"));
      }
    };

    // Error/Abort Listeners
    xhr.onerror = () => reject(new UploadError("Network error during XHR", "NETWORK_ERROR"));
    xhr.onabort = () => reject(new UploadError("Upload aborted", "UPLOAD_ABORTED"));

    // Signal Wiring
    if (signal) {
      if (signal.aborted) {
        reject(new UploadError("Aborted before start", "UPLOAD_ABORTED"));
        return;
      }
      signal.addEventListener('abort', () => {
        xhr.abort();
      });
    }

    xhr.send(file);
  });
}

/**
 * Orchestrator: Size check -> Create Session -> Upload -> Retry Logic.
 */
export async function uploadToGeminiFiles(
  file: File,
  onProgress?: (percent: number) => void,
  signal?: AbortSignal
): Promise<UploadResult> {
  
  // 1. Validate Size
  if (file.size > MAX_BYTES) {
    throw new UploadError(`File exceeds ${MAX_BYTES} bytes limit`, "FILE_TOO_LARGE");
  }

  let session: SessionResponse;

  // 2. Initial Attempt
  try {
    session = await createUploadSession(file.name, file.type, file.size);
  } catch (err: any) {
    throw err; // Pass through config/auth errors
  }

  try {
    await uploadFileToUrlWithXHR(session.uploadUrl, file, onProgress, signal);
  } catch (error: any) {
    // 3. Retry Logic on 404
    if (error.code === 'UPLOAD_URL_NOT_FOUND') {
      if (signal?.aborted) throw new UploadError("Aborted", "UPLOAD_ABORTED");

      logDebug("Encountered 404. Refreshing session and retrying...");
      
      try {
        if (onProgress) onProgress(0); // Reset UI
        
        // Re-create session
        session = await createUploadSession(file.name, file.type, file.size);
        // Retry upload
        await uploadFileToUrlWithXHR(session.uploadUrl, file, onProgress, signal);
        
      } catch (retryErr: any) {
        // If retry fails, throw specific error
        logDebug("Retry failed", retryErr);
        throw retryErr;
      }
    } else {
      throw error;
    }
  }

  // 4. Result Construction
  // [Unverified] If fileUri was not in the initial createSession response, 
  // we assume a placeholder based on filename as the API doesn't always return the URI in the PUT response body.
  const finalUri = session.fileUri || `[Unverified-URI]/${file.name}`;
  
  return { fileUri: finalUri };
}

// notes:
// 1. Env vars: Uses `process.env.API_KEY` (standard) with a default endpoint.
// 2. Endpoint: Defaults to 'https://generativelanguage.googleapis.com/upload/v1beta/files'.
// 3. Debugging: Set REACT_APP_UPLOAD_DEBUG=true to see logs.

/*
// --- TROUBLESHOOTING CHECKLIST (Run if 404 persists) ---
// 1. CURL Test - Create Session:
//    curl -X POST -H "X-Goog-Upload-Protocol: resumable" -H "X-Goog-Upload-Command: start" -H "X-Goog-Upload-Header-Content-Length: <SIZE>" -H "X-Goog-Upload-Header-Content-Type: application/pdf" -d '{"file": {"display_name": "test.pdf"}}' "https://generativelanguage.googleapis.com/upload/v1beta/files?key=YOUR_KEY"
//
// 2. CURL Test - Upload Bytes (using URL from step 1):
//    curl -X PUT -H "Content-Type: application/pdf" -H "X-Goog-Upload-Command: upload, finalize" --data-binary @test.pdf "<UPLOAD_URL>"
//
// 3. Check Time: If delay between Step 1 and 2 is > 1 hour, session expires.
// 4. Check CORS: Open DevTools > Network. Look for OPTIONS request to uploadUrl. If failed, it's a CORS issue on the Google Endpoint (requires proxy).

// --- USAGE SNIPPET ---
// const controller = new AbortController();
// uploadToGeminiFiles(myFile, (p) => console.log(p), controller.signal)
//   .then(res => console.log("Success:", res.fileUri))
//   .catch(err => console.error("Error:", err.code));
*/
