// file: services/geminiUploadSamples.ts
// Helper utilities for handling large text inputs for Gemini.

// OPTION A: Chunking Strategy
// Useful when sending raw text via generateContent() prompt.
// [Inference] 1 token approx 4 chars. Safe chunk size ~30k tokens for Flash.
export const chunkTextByApproxTokens = (text: string, chunkSizeTokens: number = 30000): string[] => {
  const charsPerChunk = chunkSizeTokens * 4;
  const chunks = [];
  
  for (let i = 0; i < text.length; i += charsPerChunk) {
    chunks.push(text.substring(i, i + charsPerChunk));
  }
  return chunks;
};

// OPTION B: Files API Upload Strategy
// [Unverified] Check official docs for latest endpoints/limits. 
// Requires API Key. Files are temporary (48h retention).
export const uploadToGeminiFiles = async (file: File | Blob, mimeType: string): Promise<string> => {
  const API_KEY = process.env.API_KEY; 
  // [Placeholder] Use the correct base URL for your region if needed
  const UPLOAD_URL = `https://generativelanguage.googleapis.com/upload/v1beta/files?key=${API_KEY}`;

  // 1. Initial Resumable Upload Request
  const initResponse = await fetch(UPLOAD_URL, {
    method: 'POST',
    headers: {
      'X-Goog-Upload-Protocol': 'resumable',
      'X-Goog-Upload-Command': 'start',
      'X-Goog-Upload-Header-Content-Length': file.size.toString(),
      'X-Goog-Upload-Header-Content-Type': mimeType,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ display_name: 'Uploaded PDF Content' })
  });

  const uploadUrl = initResponse.headers.get('X-Goog-Upload-URL');
  if (!uploadUrl) throw new Error("Failed to get upload URL from Gemini");

  // 2. Upload Actual Bytes
  const uploadResponse = await fetch(uploadUrl, {
    method: 'POST',
    headers: {
      'Content-Length': file.size.toString(),
      'X-Goog-Upload-Offset': '0',
      'X-Goog-Upload-Command': 'upload, finalize',
    },
    body: file
  });

  const result = await uploadResponse.json();
  // Returns 'files/...' URI
  return result.file.uri; 
};
