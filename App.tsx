import React, { useState, useEffect } from 'react';
import { extractTextFromPDF } from './utils/pdfUtils';
import { generateQuizFromText } from './services/geminiService';
import { QuizData, AppState, DifficultyDistribution, StudyMode, GenerationSource } from './types';
import FileUpload from './components/FileUpload';
import QuizPlayer from './components/QuizPlayer';
import DifficultySelector from './components/DifficultySelector';
import ModeSelector from './components/ModeSelector';
import GuideModal from './components/GuideModal';
import OCRRunner from './components/OCRRunner';
import { BrainCircuit, AlertTriangle, FileWarning, Lock, WifiOff, RefreshCcw, ShieldAlert, Globe, FileText, Plus, ArrowRight, X, HelpCircle, Cloud } from 'lucide-react';
import { PDFDocumentProxy } from 'pdfjs-dist';

const App: React.FC = () => {
  const [appState, setAppState] = useState<AppState>(AppState.IDLE);
  const [quizData, setQuizData] = useState<QuizData | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [statusMsg, setStatusMsg] = useState<string>('');
  const [showGuide, setShowGuide] = useState<boolean>(false);
  
  // OCR State
  const [showOCR, setShowOCR] = useState(false);
  const [scannedPDF, setScannedPDF] = useState<PDFDocumentProxy | null>(null);
  const [scannedFileName, setScannedFileName] = useState<string>("");

  // Settings
  const [selectedMode, setSelectedMode] = useState<StudyMode>('review');
  const [examDuration, setExamDuration] = useState<number | undefined>(undefined);
  const [currentDifficulty, setCurrentDifficulty] = useState<DifficultyDistribution>('balanced');
  const [currentSource, setCurrentSource] = useState<GenerationSource>('document');
  const [currentQuestionCount, setCurrentQuestionCount] = useState<number>(20);

  // Content State
  const [extractedText, setExtractedText] = useState<string | null>(null);
  // New: Store File URI for cloud-uploaded files
  const [currentFileUri, setCurrentFileUri] = useState<string | null>(null);
  const [uploadedFileNames, setUploadedFileNames] = useState<string[]>([]);

  // Derived display name
  const extractedFileName = React.useMemo(() => {
    if (uploadedFileNames.length === 0) return null;
    if (uploadedFileNames.length === 1) return uploadedFileNames[0];
    return `${uploadedFileNames[0]} và ${uploadedFileNames.length - 1} file khác`;
  }, [uploadedFileNames]);

  // Store history of generated questions to prevent duplicates
  const [historyQuestions, setHistoryQuestions] = useState<string[]>([]);

  const handleFileUpload = async (files: File[]) => {
    try {
      setAppState(AppState.EXTRACTING);
      setErrorMsg(null);
      setShowOCR(false);
      setScannedPDF(null);
      setCurrentFileUri(null); // Reset cloud file if new local upload
      
      if (!extractedText) {
        setHistoryQuestions([]);
      }
      
      let newCombinedText = "";
      const validFiles: string[] = [];
      const failedFiles: string[] = [];

      // Process each file sequentially
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        setStatusMsg(`Đang đọc file ${i + 1}/${files.length}: ${file.name}...`);
        
        try {
          const { text, pdfDoc } = await extractTextFromPDF(file, {
            onProgress: (p) => setStatusMsg(`Đang đọc file ${file.name} (${p}%)`)
          });
          if (text && text.trim().length >= 50) {
            newCombinedText += `\n\n=== FILE BẮT ĐẦU: ${file.name} ===\n${text}\n=== FILE KẾT THÚC: ${file.name} ===\n`;
            validFiles.push(file.name);
          } else {
            console.warn(`File ${file.name} is too short or empty.`);
            failedFiles.push(file.name);
          }
        } catch (fileErr: any) {
          // Check for specific OCR trigger
          if (fileErr.code === 'PDF_SCANNED' && fileErr.pdfDoc) {
             setScannedPDF(fileErr.pdfDoc);
             setScannedFileName(file.name);
             setShowOCR(true);
             setAppState(AppState.IDLE); // Go back to idle to show OCR component overlay
             return; // Stop processing and wait for user OCR decision
          }
          console.warn(`Lỗi đọc file ${file.name}`, fileErr);
          // If singular file failed with specific error, rethrow to show UI error
          if (files.length === 1) throw fileErr;
          failedFiles.push(file.name);
        }
      }

      if (validFiles.length === 0) {
        throw new Error(`Không đọc được nội dung văn bản. ${failedFiles.length} file bị lỗi.`);
      }

      setExtractedText(prev => (prev || "") + newCombinedText);
      setUploadedFileNames(prev => [...prev, ...validFiles]);
      
      setAppState(AppState.FILE_REVIEW);
      
    } catch (err: any) {
      console.error(err);
      setAppState(AppState.ERROR);
      setErrorMsg(err.message || 'Đã xảy ra lỗi không xác định.');
    }
  };

  const handleCloudUploadSuccess = (fileUri: string, fileName: string) => {
    // Reset local text if switching to cloud file
    setExtractedText(null); 
    setHistoryQuestions([]);
    setCurrentFileUri(fileUri);
    setUploadedFileNames([fileName]);
    setAppState(AppState.FILE_REVIEW);
  };

  const handleOCRComplete = (text: string) => {
    setShowOCR(false);
    setScannedPDF(null);
    setExtractedText(prev => (prev || "") + `\n\n=== FILE OCR: ${scannedFileName} ===\n${text}\n`);
    setUploadedFileNames(prev => [...prev, scannedFileName]);
    setAppState(AppState.FILE_REVIEW);
  };

  const handleOCRCancel = () => {
    setShowOCR(false);
    setScannedPDF(null);
    if (uploadedFileNames.length > 0) {
      setAppState(AppState.FILE_REVIEW);
    } else {
      setAppState(AppState.IDLE);
    }
  };

  const handleDifficultySelect = async (difficulty: DifficultyDistribution, source: GenerationSource, questionCount: number) => {
    // Allow proceeding if we have either text OR a cloud file uri
    if ((!extractedText && !currentFileUri) || !extractedFileName) return;

    setCurrentDifficulty(difficulty);
    setCurrentSource(source);
    setCurrentQuestionCount(questionCount);

    try {
      setAppState(AppState.GENERATING);
      
      const isRegeneration = historyQuestions.length > 0;

      if (source === 'web') {
        setStatusMsg(isRegeneration ? 'Đang tìm kiếm thông tin mới để tạo bộ đề không trùng lặp...' : `AI đang phân tích chủ đề và tìm kiếm thông tin mới (${questionCount} câu)...`);
      } else {
        setStatusMsg(isRegeneration ? 'Đang tạo bộ câu hỏi mới (Tránh trùng lặp với đề cũ)...' : `AI đang phân tích tài liệu và tạo ${questionCount} câu hỏi...`);
      }
      
      const data = await generateQuizFromText(
        extractedText, 
        currentFileUri,
        extractedFileName, 
        difficulty, 
        source,
        historyQuestions,
        questionCount
      );
      
      const newQuestionTexts = data.chapters.flatMap(c => c.questions.map(q => q.question));
      setHistoryQuestions(prev => [...prev, ...newQuestionTexts]);

      setQuizData(data);
      setAppState(AppState.MODE_SELECTION); 
    } catch (err: any) {
       console.error(err);
      setAppState(AppState.ERROR);
      setErrorMsg(err.message || 'Đã xảy ra lỗi khi tạo câu hỏi.');
    }
  };

  const handleModeSelect = (mode: StudyMode, duration?: number) => {
    setSelectedMode(mode);
    setExamDuration(duration);
    setAppState(AppState.READY);
  };

  // Cleanup effect to destroy PDF proxy when state changes or unmounts
  useEffect(() => {
    return () => {
      if (scannedPDF) {
        scannedPDF.destroy().catch(console.error);
      }
    };
  }, [scannedPDF]);

  // Memoize error info to prevent recalculation on every render
  const errorInfo = React.useMemo(() => {
    let icon = <AlertTriangle className="w-8 h-8 md:w-10 md:h-10 text-red-500" />;
    let title = "Đã xảy ra lỗi";
    let suggestion = "Vui lòng thử lại hoặc chọn file khác.";
    let bgColor = "bg-red-50";

    if (!errorMsg) return { icon, title, suggestion, bgColor };

    const msg = errorMsg.toLowerCase();

    if (msg.includes("mật khẩu") || msg.includes("password")) {
        icon = <Lock className="w-8 h-8 md:w-10 md:h-10 text-orange-600" />;
        title = "File được bảo vệ";
        suggestion = "File PDF này có mật khẩu. Vui lòng mở khóa file hoặc tải lên một file khác.";
        bgColor = "bg-orange-50";
    } else if (msg.includes("ảnh scan") || msg.includes("ocr")) {
        icon = <FileWarning className="w-8 h-8 md:w-10 md:h-10 text-orange-600" />;
        title = "Không nhận diện được";
        suggestion = "Quá trình OCR thất bại hoặc bạn đã hủy. Vui lòng thử file khác.";
        bgColor = "bg-orange-50";
    } else if (msg.includes("encoding") || msg.includes("font") || msg.includes("giải mã")) {
        icon = <FileText className="w-8 h-8 md:w-10 md:h-10 text-slate-600" />;
        title = "Lỗi Font chữ";
        suggestion = "PDF sử dụng font chữ không chuẩn hoặc bị mã hóa. Hãy thử chuyển sang định dạng Word hoặc OCR.";
        bgColor = "bg-slate-100";
    } else if (msg.includes("quá lớn") || msg.includes("limit")) {
        icon = <FileWarning className="w-8 h-8 md:w-10 md:h-10 text-blue-600" />;
        title = "File quá lớn";
        suggestion = "File của bạn vượt quá giới hạn xử lý. Vui lòng chọn file nhỏ hơn hoặc chia nhỏ tài liệu.";
        bgColor = "bg-blue-50";
    } else if (msg.includes("api key") || msg.includes("quota") || msg.includes("429")) {
        icon = <ShieldAlert className="w-8 h-8 md:w-10 md:h-10 text-purple-600" />;
        title = "Lỗi kết nối dịch vụ";
        suggestion = "Hệ thống AI đang bận hoặc gặp sự cố kết nối. Vui lòng đợi một lát rồi thử lại.";
        bgColor = "bg-purple-50";
    } else if (msg.includes("internet") || msg.includes("network") || msg.includes("fetch")) {
        icon = <WifiOff className="w-8 h-8 md:w-10 md:h-10 text-slate-600" />;
        title = "Lỗi mạng";
        suggestion = "Vui lòng kiểm tra kết nối internet của bạn và thử lại.";
        bgColor = "bg-slate-100";
    }

    return { icon, title, suggestion, bgColor };
  }, [errorMsg]);

  const resetApp = () => {
    setAppState(AppState.IDLE);
    setQuizData(null);
    setErrorMsg(null);
    setExtractedText(null);
    setCurrentFileUri(null);
    setUploadedFileNames([]);
    setHistoryQuestions([]);
    setShowOCR(false);
    setScannedPDF(null);
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {/* Navigation Bar */}
      <nav className="bg-white border-b border-slate-200 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-14 md:h-16">
            <div className="flex items-center cursor-pointer" onClick={resetApp}>
              <div className="w-7 h-7 md:w-8 h-8 bg-gradient-to-br from-primary-500 to-primary-700 rounded flex items-center justify-center mr-2 shadow">
                <BrainCircuit className="w-4 h-4 md:w-5 md:h-5 text-white" />
              </div>
              <span className="text-lg md:text-xl font-black bg-clip-text text-transparent bg-gradient-to-r from-slate-900 to-slate-600">
                QuizGen AI
              </span>
            </div>
            
            <div className="flex items-center space-x-2 md:space-x-4">
              <button 
                onClick={() => setShowGuide(true)}
                className="flex items-center px-3 py-1.5 text-sm font-medium text-slate-500 hover:text-primary-600 hover:bg-slate-50 rounded-lg transition-colors"
              >
                <HelpCircle className="w-4 h-4 mr-1.5" />
                <span className="hidden md:inline">Hướng dẫn</span>
              </button>
              
              {appState !== AppState.IDLE && appState !== AppState.READY && (
                 <button onClick={resetApp} className="text-sm font-medium text-slate-500 hover:text-slate-800 px-3 py-1.5">
                   Bắt đầu lại
                 </button>
              )}
            </div>
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main className="flex-grow container mx-auto px-3 py-6 md:py-12">
        
        {/* OCR Runner Modal/Overlay */}
        {showOCR && scannedPDF && (
           <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
             <div className="w-full">
               <OCRRunner 
                 pdfDoc={scannedPDF} 
                 fileName={scannedFileName}
                 onComplete={handleOCRComplete} 
                 onCancel={handleOCRCancel}
                 onError={(msg) => {
                   setShowOCR(false);
                   setAppState(AppState.ERROR);
                   setErrorMsg(msg);
                 }}
               />
             </div>
           </div>
        )}

        {/* State: IDLE - Initial Upload */}
        {appState === AppState.IDLE && !showOCR && (
          <div className="animate-in fade-in slide-in-from-bottom-2 duration-500">
            <div className="text-center mb-8 md:mb-12 px-4">
              <div className="inline-flex items-center justify-center px-3 py-1 rounded-full bg-primary-50 text-primary-600 text-xs font-bold uppercase tracking-widest mb-4 cursor-pointer hover:bg-primary-100 transition-colors" onClick={() => setShowGuide(true)}>
                <BrainCircuit className="w-3 h-3 mr-1.5" />
                Tính năng mới: AI Web Search
              </div>
              <h1 className="text-3xl md:text-5xl font-black text-slate-900 mb-3 leading-tight tracking-tight">
                Học tập <span className="text-primary-600">thông minh</span> hơn
              </h1>
              <p className="text-sm md:text-lg text-slate-500 max-w-xl mx-auto">
                Tạo bài kiểm tra từ PDF với sức mạnh trí tuệ nhân tạo Gemini.
              </p>
            </div>
            <FileUpload 
              onFileUpload={handleFileUpload} 
              onUploaded={handleCloudUploadSuccess}
            />
          </div>
        )}

        {/* State: FILE_REVIEW - Review & Add More */}
        {appState === AppState.FILE_REVIEW && (
          <div className="max-w-2xl mx-auto animate-in fade-in slide-in-from-bottom-4 duration-500">
             <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 md:p-8">
                <div className="text-center mb-8">
                  <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                    {currentFileUri ? (
                       <Cloud className="w-8 h-8 text-green-600" />
                    ) : (
                       <FileText className="w-8 h-8 text-green-600" />
                    )}
                  </div>
                  <h2 className="text-2xl font-bold text-slate-800 mb-2">Đã nhận tài liệu</h2>
                  <p className="text-slate-500">
                    Bạn đã tải lên <span className="font-bold text-slate-800">{uploadedFileNames.length}</span> file.
                  </p>
                </div>

                <div className="bg-slate-50 rounded-xl border border-slate-200 mb-8 max-h-60 overflow-y-auto">
                  {uploadedFileNames.map((name, idx) => (
                    <div key={`${name}-${idx}`} className="p-3 border-b border-slate-100 last:border-0 flex items-center">
                       {currentFileUri ? <Cloud className="w-4 h-4 text-slate-400 mr-3 shrink-0" /> : <FileText className="w-4 h-4 text-slate-400 mr-3 shrink-0" />}
                       <span className="text-sm font-medium text-slate-700 truncate flex-1">{name}</span>
                       {currentFileUri && <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded ml-2">Cloud</span>}
                    </div>
                  ))}
                </div>

                <div className="space-y-6">
                  {/* Option 1: Continue */}
                  <button 
                    onClick={() => setAppState(AppState.CONFIGURING)}
                    className="w-full py-4 bg-slate-900 text-white font-bold rounded-xl shadow-lg hover:bg-slate-800 hover:shadow-xl hover:-translate-y-0.5 transition-all flex items-center justify-center text-lg"
                  >
                    Tiếp tục cấu hình <ArrowRight className="w-5 h-5 ml-2" />
                  </button>
                  
                  {/* Disable "Add More" if using Cloud File (Simplify logic for now) */}
                  {!currentFileUri && (
                    <>
                      <div className="relative">
                        <div className="absolute inset-0 flex items-center">
                          <div className="w-full border-t border-slate-200"></div>
                        </div>
                        <div className="relative flex justify-center text-sm">
                          <span className="px-2 bg-white text-slate-500">Hoặc</span>
                        </div>
                      </div>

                      {/* Option 2: Add More Files (Local only) */}
                      <div>
                        <p className="text-center text-sm text-slate-500 mb-3 font-medium">Bạn muốn bổ sung thêm tài liệu?</p>
                        <div className="border-2 border-dashed border-slate-300 rounded-xl p-6 bg-slate-50 hover:bg-white hover:border-primary-400 transition-colors text-center cursor-pointer group">
                          <label className="cursor-pointer block w-full h-full">
                              <input 
                                type="file" 
                                className="hidden" 
                                accept=".pdf"
                                multiple
                                onChange={(e) => {
                                    if (e.target.files && e.target.files.length > 0) {
                                      handleFileUpload(Array.from(e.target.files));
                                    }
                                }}
                              />
                              <div className="flex flex-col items-center justify-center">
                                <Plus className="w-8 h-8 text-slate-400 group-hover:text-primary-500 mb-2" />
                                <span className="text-slate-600 font-bold group-hover:text-primary-700">Tải thêm file PDF</span>
                                <span className="text-xs text-slate-400 mt-1">Kéo thả hoặc nhấn để chọn</span>
                              </div>
                          </label>
                        </div>
                      </div>
                    </>
                  )}
                </div>
             </div>
          </div>
        )}

        {/* State: CONFIGURING - Difficulty Selection */}
        {appState === AppState.CONFIGURING && extractedFileName && (
           <DifficultySelector 
             fileName={extractedFileName}
             onSelect={handleDifficultySelect}
             onCancel={() => setAppState(AppState.FILE_REVIEW)} // Go back to review instead of full reset
           />
        )}

        {/* State: MODE_SELECTION */}
        {appState === AppState.MODE_SELECTION && quizData && (
          <ModeSelector 
            totalQuestions={quizData.total_questions || quizData.chapters.reduce((acc, ch) => acc + ch.questions.length, 0)}
            onStart={handleModeSelect}
            onCancel={() => setAppState(AppState.CONFIGURING)}
          />
        )}

        {/* State: LOADING (Extracting or Generating) */}
        {(appState === AppState.EXTRACTING || appState === AppState.GENERATING) && (
          <div className="flex flex-col items-center justify-center min-h-[50vh] animate-in fade-in zoom-in-95 duration-500">
            <div className="relative w-16 h-16 md:w-24 md:h-24 mb-6 md:mb-8">
              <div className="absolute inset-0 border-2 md:border-4 border-slate-100 rounded-full"></div>
              <div className={`absolute inset-0 border-2 md:border-4 rounded-full border-t-transparent animate-spin ${currentSource === 'web' && appState === AppState.GENERATING ? 'border-blue-500' : 'border-primary-500'}`}></div>
              <div className="absolute inset-0 flex items-center justify-center">
                 {currentSource === 'web' && appState === AppState.GENERATING ? (
                   <Globe className="w-6 h-6 md:w-8 md:h-8 text-blue-500 animate-pulse" />
                 ) : (
                   <BrainCircuit className="w-6 h-6 md:w-8 md:h-8 text-primary-500 animate-pulse" />
                 )}
              </div>
            </div>
            <h2 className="text-xl md:text-2xl font-bold text-slate-800 mb-1">
              {appState === AppState.EXTRACTING ? 'Đang đọc tài liệu' : (currentSource === 'web' ? 'Đang tìm kiếm & tạo đề' : 'Đang tạo câu hỏi')}
            </h2>
            <p className="text-xs md:text-sm text-slate-400 text-center max-w-xs animate-pulse">
              {statusMsg}
            </p>
          </div>
        )}

        {/* State: ERROR */}
        {appState === AppState.ERROR && errorMsg && (
          <div className="max-w-md mx-auto mt-8 md:mt-12 px-4 animate-in fade-in zoom-in-95 duration-300">
             <div className="bg-white rounded-2xl shadow-lg border border-red-100 p-6 md:p-8 text-center">
                 <div className={`w-16 h-16 md:w-20 md:h-20 ${errorInfo.bgColor} rounded-full flex items-center justify-center mx-auto mb-5 shadow-sm`}>
                   {errorInfo.icon}
                 </div>
                 <h3 className="text-xl md:text-2xl font-bold text-slate-900 mb-3">{errorInfo.title}</h3>
                 <p className="text-slate-600 mb-2 font-medium bg-slate-50 py-2 px-3 rounded-lg inline-block text-sm border border-slate-100 break-words max-w-full">
                   {errorMsg}
                 </p>
                 <p className="text-sm text-slate-500 mb-8 max-w-xs mx-auto leading-relaxed">
                   {errorInfo.suggestion}
                 </p>
                
                <div className="flex flex-col gap-3">
                  <button 
                    onClick={() => setAppState(AppState.FILE_REVIEW)} 
                    className="w-full px-8 py-3.5 bg-slate-900 text-white font-bold rounded-xl hover:bg-slate-800 transition-all shadow-md"
                  >
                    <RefreshCcw className="w-4 h-4 mr-2 inline" />
                    Thử lại (Về danh sách file)
                  </button>
                  <button 
                    onClick={resetApp} 
                    className="w-full px-8 py-3.5 bg-white border border-slate-200 text-slate-600 font-bold rounded-xl hover:bg-slate-50 transition-all"
                  >
                    Bắt đầu lại từ đầu
                  </button>
                </div>
             </div>
          </div>
        )}

        {/* State: READY (Quiz Player) */}
        {appState === AppState.READY && quizData && (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
            <QuizPlayer 
              data={quizData} 
              mode={selectedMode}
              examDuration={examDuration}
              onReset={resetApp}
              onRegenerate={() => handleDifficultySelect(currentDifficulty, currentSource, currentQuestionCount)}
            />
          </div>
        )}
      </main>

      {showGuide && <GuideModal onClose={() => setShowGuide(false)} />}

      <footer className="bg-white border-t border-slate-100 py-6 mt-auto">
        <div className="container mx-auto px-4 text-center text-slate-400 text-[10px] md:text-xs font-bold uppercase tracking-widest">
          <p>© {new Date().getFullYear()} QuizGen AI • Gemini Flash API</p>
        </div>
      </footer>
    </div>
  );
};

export default App;