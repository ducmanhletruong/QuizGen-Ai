// file: components/FileUpload.test.tsx
// Unit tests for FileUpload component logic

// Declare Jest globals to avoid TS errors when @types/jest is missing
declare const jest: any;
declare const describe: any;
declare const beforeEach: any;
declare const it: any;
declare const expect: any;

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import FileUpload from './FileUpload';
import * as geminiService from '../services/geminiUploadSamples';

// Mock the service
jest.mock('../services/geminiUploadSamples', () => ({
  uploadToGeminiFiles: jest.fn(),
  UploadError: class extends Error {
    code: string;
    constructor(msg: string, code: string) {
      super(msg);
      this.code = code;
    }
  }
}));

describe('FileUpload Component - Gemini Upload', () => {
  const mockOnFileUpload = jest.fn();
  const mockOnUploaded = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders the "Upload to Gemini" button', () => {
    render(<FileUpload onFileUpload={mockOnFileUpload} onUploaded={mockOnUploaded} />);
    const button = screen.getByText('Upload to Gemini');
    expect(button).toBeInTheDocument();
  });

  it('initiates upload when file is selected via Gemini button', async () => {
    // Setup Mock
    (geminiService.uploadToGeminiFiles as any).mockResolvedValue({ fileUri: 'https://gemini.google.com/files/123' });

    render(<FileUpload onFileUpload={mockOnFileUpload} onUploaded={mockOnUploaded} />);
    
    // Find the hidden input associated with "Upload to Gemini" label
    // In our component: <label>...<span>Upload to Gemini</span><input .../></label>
    const fileInput = screen.getByLabelText('Upload to Gemini');

    const file = new File(['dummy content'], 'test.pdf', { type: 'application/pdf' });
    fireEvent.change(fileInput, { target: { files: [file] } });

    await waitFor(() => {
      expect(geminiService.uploadToGeminiFiles).toHaveBeenCalledTimes(1);
    });
    
    // Check if onUploaded was called
    await waitFor(() => {
      expect(mockOnUploaded).toHaveBeenCalledWith('https://gemini.google.com/files/123');
    });

    // Check success message
    expect(screen.getByText(/Upload thành công/i)).toBeInTheDocument();
  });

  it('handles upload errors correctly', async () => {
    // Setup Mock Error
    const error = new Error("Network error");
    (error as any).code = "NETWORK_ERROR";
    (geminiService.uploadToGeminiFiles as any).mockRejectedValue(error);

    render(<FileUpload onFileUpload={mockOnFileUpload} onUploaded={mockOnUploaded} />);
    
    const fileInput = screen.getByLabelText('Upload to Gemini');
    const file = new File(['dummy content'], 'error.pdf', { type: 'application/pdf' });
    
    fireEvent.change(fileInput, { target: { files: [file] } });

    await waitFor(() => {
      expect(screen.getByText(/Network error/i)).toBeInTheDocument();
    });
  });

  it('validates file type before uploading', () => {
    render(<FileUpload onFileUpload={mockOnFileUpload} />);
    
    const fileInput = screen.getByLabelText('Upload to Gemini');
    const file = new File(['dummy content'], 'test.png', { type: 'image/png' }); // Invalid type
    
    fireEvent.change(fileInput, { target: { files: [file] } });
    
    expect(geminiService.uploadToGeminiFiles).not.toHaveBeenCalled();
    expect(screen.getByText(/Chỉ hỗ trợ file PDF/i)).toBeInTheDocument();
  });
});