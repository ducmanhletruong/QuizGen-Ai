
import React, { useCallback, useState } from 'react';
import { Upload, FileText, AlertCircle, Loader2, Files } from 'lucide-react';

interface FileUploadProps {
  onFileUpload: (files: File[]) => void;
  isLoading?: boolean;
}

const FileUpload: React.FC<FileUploadProps> = ({ onFileUpload, isLoading = false }) => {
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isDriveProcessing, setIsDriveProcessing] = useState(false);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const validateAndUpload = (fileList: FileList | File[]) => {
    const files = Array.from(fileList);
    const validFiles: File[] = [];
    const errors: string[] = [];

    if (files.length === 0) return;

    for (const file of files) {
      if (file.type !== 'application/pdf') {
        errors.push(`"${file.name}" không phải là PDF`);
        continue;
      }
      if (file.size > 20 * 1024 * 1024) { // 20MB limit per file
        errors.push(`"${file.name}" quá lớn (>20MB)`);
        continue;
      }
      validFiles.push(file);
    }

    if (validFiles.length === 0) {
       setError(errors.length > 0 ? errors[0] : "Vui lòng chọn file PDF.");
       return;
    }

    // If some files were rejected but others are valid, we proceed but maybe log or alert?
    // For now, clear error and proceed with valid ones to be user-friendly.
    if (errors.length > 0) {
      console.warn("Some files were rejected:", errors);
    }

    setError(null);
    onFileUpload(validFiles);
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      validateAndUpload(e.dataTransfer.files);
    }
  }, [onFileUpload]);

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      validateAndUpload(e.target.files);
    }
  };

  // --- Google Drive Integration ---
  const handleDriveUpload = async () => {
    const API_KEY = process.env.API_KEY;
    
    let CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
    if (!CLIENT_ID) {
       const stored = localStorage.getItem('GOOGLE_CLIENT_ID');
       if (stored) CLIENT_ID = stored;
    }

    if (!CLIENT_ID) {
       const input = window.prompt("Tính năng này yêu cầu Google Client ID.\nVui lòng nhập Client ID của bạn (sẽ được lưu trên trình duyệt):");
       if (input && input.trim()) {
           CLIENT_ID = input.trim();
           localStorage.setItem('GOOGLE_CLIENT_ID', CLIENT_ID);
       }
    }

    if (!CLIENT_ID) {
      setError("Chưa cấu hình Google Client ID. Vui lòng nhập ID để tiếp tục.");
      return;
    }

    const gapi = (window as any).gapi;
    const google = (window as any).google;

    if (!gapi || !google) {
      setError("Google API chưa sẵn sàng. Vui lòng kiểm tra kết nối mạng.");
      return;
    }

    setIsDriveProcessing(true);
    setError(null);

    try {
      const tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: CLIENT_ID,
        scope: 'https://www.googleapis.com/auth/drive.readonly',
        callback: async (response: any) => {
          if (response.error !== undefined) {
             console.error(response);
             setIsDriveProcessing(false);
             if (response.error === 'popup_closed_by_user') return;
             setError(`Lỗi xác thực: ${response.error}`);
             return;
          }
          
          gapi.load('picker', () => {
             const picker = new google.picker.PickerBuilder()
                .addView(new google.picker.View(google.picker.ViewId.DOCS).setMimeTypes('application/pdf'))
                .enableFeature(google.picker.Feature.MULTISELECT_ENABLED)
                .setOAuthToken(response.access_token)
                .setDeveloperKey(API_KEY)
                .setCallback(async (data: any) => {
                   if (data.action === google.picker.Action.PICKED) {
                      const downloadedFiles: File[] = [];
                      try {
                        const docs = data.docs;
                        for (const doc of docs) {
                            const fileId = doc.id;
                            const name = doc.name;
                            const fileResp = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
                               headers: { Authorization: `Bearer ${response.access_token}` }
                            });
                            if (!fileResp.ok) throw new Error(`Lỗi tải file ${name}`);
                            const blob = await fileResp.blob();
                            downloadedFiles.push(new File([blob], name, { type: 'application/pdf' }));
                        }
                        setIsDriveProcessing(false);
                        validateAndUpload(downloadedFiles);
                      } catch (downloadErr) {
                         console.error(downloadErr);
                         setError("Không thể tải nội dung file từ Drive.");
                         setIsDriveProcessing(false);
                      }
                   } else if (data.action === google.picker.Action.CANCEL) {
                      setIsDriveProcessing(false);
                   }
                })
                .build();
             picker.setVisible(true);
          });
        },
      });
      tokenClient.requestAccessToken();
    } catch (err) {
      console.error(err);
      setError("Lỗi khởi tạo Google Drive Picker.");
      setIsDriveProcessing(false);
    }
  };

  const isBusy = isLoading || isDriveProcessing;

  return (
    <div className="w-full max-w-2xl mx-auto">
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`
          relative border-2 border-dashed rounded-xl p-12 text-center transition-all duration-200 ease-in-out
          ${isDragging 
            ? 'border-primary-500 bg-primary-50' 
            : 'border-slate-300 hover:border-primary-400 hover:bg-slate-50'
          }
          ${isBusy ? 'opacity-50 pointer-events-none' : ''}
        `}
      >
        <div className="flex flex-col items-center justify-center space-y-4">
          <div className="p-4 bg-white rounded-full shadow-sm">
            {isBusy ? (
               <Loader2 className="w-10 h-10 text-primary-600 animate-spin" />
            ) : (
               <div className="relative">
                 <Upload className="w-10 h-10 text-primary-600" />
                 <Files className="w-4 h-4 text-primary-400 absolute -bottom-1 -right-1 bg-white rounded-full" />
               </div>
            )}
          </div>
          
          <div className="space-y-2">
            <h3 className="text-xl font-semibold text-slate-800">
              {isBusy 
                ? (isDriveProcessing ? 'Đang tải từ Drive...' : 'Đang xử lý...') 
                : 'Tải lên tài liệu PDF'
              }
            </h3>
            <p className="text-slate-500 max-w-sm mx-auto">
              Kéo thả các file vào đây (hỗ trợ chọn nhiều file).
            </p>
          </div>

          <div className="flex flex-col sm:flex-row gap-4 mt-2">
            <label className="inline-flex items-center justify-center px-6 py-3 bg-primary-600 text-white font-medium rounded-lg hover:bg-primary-700 cursor-pointer transition-colors shadow-sm">
              <span>Chọn các File PDF</span>
              <input 
                type="file" 
                className="hidden" 
                accept=".pdf"
                multiple
                onChange={handleFileInput}
                disabled={isBusy}
              />
            </label>

            <button
              onClick={handleDriveUpload}
              disabled={isBusy}
              className="inline-flex items-center justify-center px-6 py-3 bg-white border border-slate-300 text-slate-700 font-medium rounded-lg hover:bg-slate-50 transition-colors shadow-sm"
            >
              <svg className="w-5 h-5 mr-2" viewBox="0 0 87.3 78" xmlns="http://www.w3.org/2000/svg">
                <path d="m6.6 66.85 3.85 6.65c.8 1.4 1.95 2.5 3.3 3.3l13.75-23.8h-27.5c0 1.55.4 3.1 1.2 4.5z" fill="#0066da"/>
                <path d="m43.65 25-13.75-23.8c-1.35.8-2.5 1.9-3.3 3.3l-25.4 44a9.06 9.06 0 0 0 -1.2 4.5h27.5z" fill="#00ac47"/>
                <path d="m73.55 76.8c1.35-.8 2.5-1.9 3.3-3.3l1.6-2.75 7.65-13.25c.8-1.4 1.2-2.95 1.2-4.5h-27.502l5.852 11.5z" fill="#ea4335"/>
                <path d="m43.65 25 13.75 23.8-13.75 23.8-13.75-23.8z" fill="#00832d"/>
                <path d="m59.8 53h-27.5l-13.75 23.8 13.75 23.8c1.55 0 3.1-.4 4.5-1.2l45.5-26.3c1.4-.8 2.5-1.95 3.3-3.3l-13.75-23.8z" fill="#2684fc"/>
                <path d="m73.4 26.5-12.7-22c-.8-1.4-1.95-2.5-3.3-3.3h-26.25l13.75 23.8 27.5 47.6c1.4-.8 2.5-1.9 3.3-3.3z" fill="#ffba00"/>
              </svg>
              <span>Google Drive</span>
            </button>
          </div>
        </div>

        {error && (
          <div className="absolute -bottom-20 md:-bottom-16 left-0 right-0 flex items-center justify-center space-x-2 text-red-500 bg-red-50 p-3 rounded-lg border border-red-200 animate-in fade-in slide-in-from-top-2">
            <AlertCircle className="w-5 h-5 flex-shrink-0" />
            <span className="text-sm font-medium">{error}</span>
          </div>
        )}
      </div>
      
      <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-6 text-center">
        <div className="p-4 bg-white rounded-lg border border-slate-100 shadow-sm">
          <div className="w-10 h-10 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center mx-auto mb-3">
            <FileText className="w-5 h-5" />
          </div>
          <h4 className="font-medium text-slate-800 mb-1">Phân tích sâu</h4>
          <p className="text-xs text-slate-500">AI đọc hiểu nhiều văn bản cùng lúc</p>
        </div>
        <div className="p-4 bg-white rounded-lg border border-slate-100 shadow-sm">
          <div className="w-10 h-10 bg-purple-100 text-purple-600 rounded-full flex items-center justify-center mx-auto mb-3">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M17.636 17.636l-.707-.707M12 21v-1M4.364 17.636l.707-.707M3 12h1m1.636-6.364l.707.707" />
            </svg>
          </div>
          <h4 className="font-medium text-slate-800 mb-1">Tạo câu hỏi</h4>
          <p className="text-xs text-slate-500">Tự động tạo bộ câu hỏi tổng hợp</p>
        </div>
        <div className="p-4 bg-white rounded-lg border border-slate-100 shadow-sm">
          <div className="w-10 h-10 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto mb-3">
             <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h4 className="font-medium text-slate-800 mb-1">Ôn luyện</h4>
          <p className="text-xs text-slate-500">Kiểm tra kiến thức ngay lập tức</p>
        </div>
      </div>
    </div>
  );
};

export default FileUpload;
