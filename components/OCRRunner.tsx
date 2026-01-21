import React, { useEffect, useRef, useState } from 'react';
import { runOCRFromPDF } from '../utils/ocrUtils';
import { PDFDocumentProxy } from 'pdfjs-dist';
import { Loader2, XCircle, ScanText, Play } from 'lucide-react';

interface OCRRunnerProps {
  pdfDoc: PDFDocumentProxy | null;
  fileName: string;
  onComplete: (text: string) => void;
  onCancel: () => void;
  onError: (msg: string) => void;
}

const OCRRunner: React.FC<OCRRunnerProps> = ({ pdfDoc, fileName, onComplete, onCancel, onError }) => {
  const [progress, setProgress] = useState(0);
  const [isRunning, setIsRunning] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => {
      // Cleanup on unmount
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  const handleStart = async () => {
    if (!pdfDoc) return;
    
    setIsRunning(true);
    setProgress(0);
    abortControllerRef.current = new AbortController();

    try {
      // [Inference] Est. time: ~2-3s per page on desktop. 10 pages ~ 30s.
      const text = await runOCRFromPDF(pdfDoc, {
        onProgress: (p) => setProgress(p),
        signal: abortControllerRef.current.signal,
        maxPages: 50 // Limit for safety
      });
      
      onComplete(text);
    } catch (err: any) {
      if (err.message === "Đã hủy quá trình OCR.") {
        console.log("OCR Cancelled");
      } else {
        onError(err.message);
      }
      setIsRunning(false);
    }
  };

  const handleCancel = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    onCancel();
  };

  return (
    <div className="max-w-xl mx-auto p-6 bg-white rounded-2xl shadow-lg border border-orange-100 animate-in fade-in zoom-in-95">
      <div className="text-center mb-6">
        <div className="w-16 h-16 bg-orange-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <ScanText className="w-8 h-8 text-orange-600" />
        </div>
        <h3 className="text-xl font-bold text-slate-900 mb-2">Phát hiện file ảnh scan</h3>
        <p className="text-slate-500 text-sm">
          File <span className="font-semibold">{fileName}</span> không có lớp văn bản. 
          Bạn có muốn dùng AI để quét (OCR) không?
        </p>
        <p className="text-xs text-slate-400 mt-2 italic">
          *Lưu ý: Quá trình này chạy trực tiếp trên trình duyệt của bạn và có thể mất vài phút.
        </p>
      </div>

      {isRunning ? (
        <div className="space-y-4">
          <div className="w-full bg-slate-100 rounded-full h-4 overflow-hidden">
            <div 
              className="bg-orange-500 h-full transition-all duration-300 ease-out"
              style={{ width: `${progress}%` }}
            ></div>
          </div>
          <div className="flex justify-between items-center text-sm font-medium text-slate-600">
             <span>Đang xử lý... {progress}%</span>
             <button onClick={handleCancel} className="text-red-500 hover:text-red-700 flex items-center">
               <XCircle className="w-4 h-4 mr-1" /> Hủy
             </button>
          </div>
        </div>
      ) : (
        <div className="flex gap-3">
          <button 
            onClick={onCancel}
            className="flex-1 py-3 bg-slate-100 text-slate-700 font-bold rounded-xl hover:bg-slate-200 transition-colors"
          >
            Bỏ qua file này
          </button>
          <button 
            onClick={handleStart}
            className="flex-1 py-3 bg-orange-600 text-white font-bold rounded-xl hover:bg-orange-700 shadow-orange-200 shadow-lg transition-all flex items-center justify-center"
          >
            <Play className="w-4 h-4 mr-2" /> Bắt đầu OCR
          </button>
        </div>
      )}
    </div>
  );
};

export default OCRRunner;
