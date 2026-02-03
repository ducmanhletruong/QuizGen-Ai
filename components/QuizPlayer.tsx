import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { QuizData, QuizQuestion, StudyMode } from '../types';
import { CheckCircle, XCircle, ChevronRight, ChevronLeft, RefreshCw, BookOpen, Trophy, Lightbulb, HelpCircle, Clock, RotateCw, Flag, PlusCircle, LayoutList } from 'lucide-react';

interface QuizPlayerProps {
  data: QuizData;
  mode: StudyMode;
  examDuration?: number; // in minutes
  onReset: () => void;
  onRegenerate: () => void;
}

// Reusable Markdown Component for Math & Text
const RichText: React.FC<{ content: string; className?: string }> = React.memo(({ content, className = '' }) => {
  
  // Preprocess text to ensure standard LaTeX delimiters
  const preprocessContent = (text: string) => {
    if (!text) return "";
    return text
      // Replace \[ ... \] with $$ ... $$ for better compatibility with remark-math
      .replace(/\\\[(.*?)\\\]/gs, '$$$1$$')
      // Replace \( ... \) with $ ... $
      .replace(/\\\((.*?)\\\)/gs, '$$$1$$');
  };

  const processedContent = useMemo(() => preprocessContent(content), [content]);

  return (
    <div className={`markdown-content ${className}`}>
      <ReactMarkdown
        remarkPlugins={[remarkMath]}
        rehypePlugins={[
          [rehypeKatex, { 
            throwOnError: false, 
            errorColor: '#ef4444', 
            strict: false 
          }]
        ]}
        components={{
          // Override default elements to fit better in UI
          p: ({children}) => <p className="inline-block w-full mb-1 last:mb-0">{children}</p>,
          a: ({href, children}) => <a href={href} target="_blank" rel="noopener noreferrer" className="text-blue-500 underline">{children}</a>,
        }}
      >
        {processedContent}
      </ReactMarkdown>
    </div>
  );
});

const QuizPlayer: React.FC<QuizPlayerProps> = ({ data, mode, examDuration, onReset, onRegenerate }) => {
  const [allQuestions, setAllQuestions] = useState<QuizQuestion[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  
  // State to store answers: { [questionIndex]: selectedOptionKey }
  const [userAnswers, setUserAnswers] = useState<Record<number, string>>({});
  
  // Flashcard flip state
  const [isFlipped, setIsFlipped] = useState(false);

  // Exam specific states
  const [timeLeft, setTimeLeft] = useState<number>((examDuration || 0) * 60);
  const [isExamSubmitted, setIsExamSubmitted] = useState(false);
  
  // Hint state
  const [hiddenOptions, setHiddenOptions] = useState<Record<number, string[]>>({});
  
  const [showSummary, setShowSummary] = useState(false);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    const flattened = data.chapters.flatMap(chapter => chapter.questions);
    setAllQuestions(flattened);
    // Reset state when data changes
    setCurrentIndex(0);
    setUserAnswers({});
    setShowSummary(false);
    setIsExamSubmitted(false);
    setTimeLeft((examDuration || 0) * 60);
  }, [data, examDuration]);

  // Keyboard Navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (showSummary) return;

      if (e.key === 'ArrowRight') {
        if (currentIndex < allQuestions.length - 1) {
          nextQuestion();
        }
      } else if (e.key === 'ArrowLeft') {
        if (currentIndex > 0) {
          prevQuestion();
        }
      } else if (e.key === ' ' || e.key === 'Enter') {
        if (mode === 'flashcard') {
           e.preventDefault(); 
           setIsFlipped(prev => !prev);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentIndex, allQuestions.length, showSummary, mode]);

  const submitExam = useCallback(() => {
    setIsExamSubmitted(true);
    if (timerRef.current) clearInterval(timerRef.current);
    setShowSummary(true);
  }, []);

  // Exam Timer
  useEffect(() => {
    if (mode === 'exam' && !isExamSubmitted) {
      timerRef.current = window.setInterval(() => {
        setTimeLeft((prev) => {
          if (prev <= 1) {
            if (timerRef.current) clearInterval(timerRef.current);
            submitExam();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [mode, isExamSubmitted, submitExam]);

  const currentQuestion = allQuestions[currentIndex];
  const currentAnswer = userAnswers[currentIndex];
  
  const isReviewMode = mode === 'review';
  const isExamMode = mode === 'exam';
  const isFlashcardMode = mode === 'flashcard';

  const isAnswered = !!currentAnswer;
  // Lock questions if Review mode + Answered OR Exam Submitted
  const isLocked = isReviewMode ? isAnswered : isExamSubmitted;

  const score = useMemo(() => {
    return Object.keys(userAnswers).reduce((acc, indexStr) => {
      const idx = parseInt(indexStr);
      const question = allQuestions[idx];
      const answer = userAnswers[idx];
      return question && answer === question.correct_answer ? acc + 1 : acc;
    }, 0);
  }, [userAnswers, allQuestions]);

  const handleAnswerSelect = (key: string) => {
    if (isReviewMode && isAnswered) return; 
    if (isExamMode && isExamSubmitted) return; 

    setUserAnswers(prev => ({
      ...prev,
      [currentIndex]: key
    }));
  };

  const nextQuestion = () => {
    if (currentIndex < allQuestions.length - 1) {
      setCurrentIndex(prev => prev + 1);
      setIsFlipped(false);
    } else if (!isExamMode || isExamSubmitted) {
      setShowSummary(true);
    }
  };

  const prevQuestion = () => {
    if (currentIndex > 0) {
      setCurrentIndex(prev => prev - 1);
      setIsFlipped(false);
    }
  };

  const handleHint = () => {
    if (isLocked || hiddenOptions[currentIndex]) return;
    const correct = currentQuestion.correct_answer;
    const allOptions = Object.keys(currentQuestion.options);
    const wrongOptions = allOptions.filter(opt => opt !== correct);
    const shuffled = wrongOptions.sort(() => 0.5 - Math.random());
    const toHide = shuffled.slice(0, 2);
    setHiddenOptions(prev => ({ ...prev, [currentIndex]: toHide }));
  };

  const restartQuiz = () => {
    setShowSummary(false);
    setCurrentIndex(0);
    setUserAnswers({});
    setHiddenOptions({});
    setIsExamSubmitted(false);
    setIsFlipped(false);
    if (examDuration) setTimeLeft(examDuration * 60);
  };

  // Handler for "Review Answers" (Xem lại kết quả)
  const handleReviewResults = () => {
    setShowSummary(false);
    setCurrentIndex(0);
    setIsExamSubmitted(true); // Ensure locked mode is on for review
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const getDifficultyColor = (diff: string) => {
    switch (diff) {
      case 'easy': return 'bg-green-100 text-green-800';
      case 'medium': return 'bg-yellow-100 text-yellow-800';
      case 'hard': return 'bg-red-100 text-red-800';
      default: return 'bg-slate-100 text-slate-800';
    }
  };

  // Helper to hide image container if load fails
  const handleImageError = (e: React.SyntheticEvent<HTMLImageElement, Event>) => {
    e.currentTarget.style.display = 'none';
    const parent = e.currentTarget.parentElement;
    if (parent) parent.style.display = 'none';
  };

  if (!currentQuestion) return null;

  // --- SUMMARY SCREEN ---
  if (showSummary) {
    return (
      <div className="max-w-2xl mx-auto bg-white rounded-2xl shadow-sm border border-slate-200 p-6 md:p-8 text-center animate-in zoom-in-95 duration-300 mx-2">
        <div className="w-16 h-16 md:w-20 md:h-20 bg-yellow-100 rounded-full flex items-center justify-center mx-auto mb-4 md:mb-6">
          <Trophy className="w-8 h-8 md:w-10 md:h-10 text-yellow-600" />
        </div>
        <h2 className="text-2xl md:text-3xl font-bold text-slate-800 mb-2">
          {isExamMode && timeLeft === 0 ? "Hết giờ!" : "Hoàn thành!"}
        </h2>
        <p className="text-slate-500 mb-6 md:mb-8 text-sm md:text-base">
          {isExamMode 
            ? "Bạn đã hoàn thành bài thi thử." 
            : "Bạn đã hoàn thành bộ câu hỏi."}
        </p>
        
        <div className="grid grid-cols-2 gap-3 md:gap-4 mb-6 md:mb-8">
          <div className="p-3 md:p-4 bg-slate-50 rounded-xl">
            <div className="text-2xl md:text-3xl font-bold text-primary-600">{score}</div>
            <div className="text-xs md:text-sm text-slate-500">Câu đúng</div>
          </div>
          <div className="p-3 md:p-4 bg-slate-50 rounded-xl">
            <div className="text-2xl md:text-3xl font-bold text-slate-800">{allQuestions.length}</div>
            <div className="text-xs md:text-sm text-slate-500">Tổng câu hỏi</div>
          </div>
        </div>

        {/* Action Buttons Group 1: Quiz Actions */}
        <div className="space-y-3 mb-8">
           <button 
             onClick={handleReviewResults}
             className="w-full flex items-center justify-center px-4 py-3 bg-blue-50 text-blue-700 font-bold rounded-xl border border-blue-200 hover:bg-blue-100 transition-colors"
           >
             <LayoutList className="w-5 h-5 mr-2" />
             Xem lại kết quả & giải thích
           </button>
           
           <button 
             onClick={onRegenerate}
             className="w-full flex items-center justify-center px-4 py-3 bg-gradient-to-r from-primary-600 to-primary-500 text-white font-bold rounded-xl shadow-md hover:shadow-lg hover:from-primary-700 hover:to-primary-600 transition-all"
           >
             <PlusCircle className="w-5 h-5 mr-2" />
             Tạo đề mới (Không trùng lặp)
           </button>
        </div>

        {/* Divider */}
        <div className="border-t border-slate-100 pt-6 flex flex-col sm:flex-row justify-center gap-3">
          <button 
             onClick={restartQuiz}
            className="w-full sm:w-auto px-6 py-3 bg-white text-slate-600 font-medium rounded-lg hover:bg-slate-50 transition-colors flex items-center justify-center text-sm border border-slate-200"
          >
            <RefreshCw className="w-4 h-4 mr-2" />
            Làm lại đề này
          </button>
          <button 
            onClick={onReset}
            className="w-full sm:w-auto px-6 py-3 bg-white text-slate-600 font-medium rounded-lg hover:bg-slate-50 transition-colors text-sm border border-slate-200"
          >
            Tải file khác
          </button>
        </div>
      </div>
    );
  }

  const progress = ((currentIndex + 1) / allQuestions.length) * 100;
  const answeredCount = Object.keys(userAnswers).length;

  // --- FLASHCARD MODE ---
  if (isFlashcardMode) {
    return (
      <div className="max-w-3xl mx-auto px-4">
        <div className="flex items-center justify-between mb-4">
           <span className="text-slate-500 font-medium text-sm">Thẻ {currentIndex + 1} / {allQuestions.length}</span>
           <div className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${getDifficultyColor(currentQuestion.difficulty)}`}>
            {currentQuestion.difficulty === 'easy' ? 'Dễ' : currentQuestion.difficulty === 'medium' ? 'TB' : 'Khó'}
           </div>
        </div>

        <div 
          className="relative h-[300px] md:h-[400px] w-full perspective-1000 cursor-pointer"
          onClick={() => setIsFlipped(!isFlipped)}
        >
          <div className={`relative w-full h-full transition-all duration-500 transform-style-3d ${isFlipped ? 'rotate-y-180' : ''}`} style={{ transformStyle: 'preserve-3d', transform: isFlipped ? 'rotateY(180deg)' : 'rotateY(0deg)' }}>
            <div className="absolute inset-0 backface-hidden bg-white rounded-2xl shadow-md border-2 border-slate-200 flex flex-col items-center justify-center p-6 text-center" style={{ backfaceVisibility: 'hidden' }}>
              
              {/* Optional Image for Flashcard */}
              {currentQuestion.image_url && (
                <div className="w-full max-h-[140px] mb-4 flex items-center justify-center">
                   <img 
                     src={currentQuestion.image_url} 
                     alt="Question" 
                     className="max-w-full max-h-[140px] object-contain rounded"
                     onError={handleImageError}
                   />
                </div>
              )}

              <div className="text-xl md:text-2xl font-semibold text-slate-800 leading-relaxed overflow-y-auto max-h-[50%] w-full">
                <RichText content={currentQuestion.question} />
              </div>
              <p className="mt-4 text-[10px] text-slate-400 font-bold uppercase tracking-widest absolute bottom-6">
                Nhấn để xem đáp án
              </p>
            </div>
            <div className="absolute inset-0 backface-hidden bg-white rounded-2xl shadow-md border-2 border-primary-200 flex flex-col items-center justify-center p-6 text-center rotate-y-180" style={{ backfaceVisibility: 'hidden', transform: 'rotateY(180deg)' }}>
              <div className="w-12 h-12 bg-green-100 text-green-600 rounded-full flex items-center justify-center mb-3 font-bold text-xl shrink-0">
                {currentQuestion.correct_answer}
              </div>
              <div className="text-lg font-medium text-slate-800 mb-4 overflow-y-auto max-h-[120px] w-full">
                <RichText content={currentQuestion.options[currentQuestion.correct_answer]} />
              </div>
              <div className="bg-slate-50 p-3 rounded-xl text-xs text-slate-600 border border-slate-100 overflow-y-auto max-h-[100px] w-full text-left">
                <RichText content={currentQuestion.explanation} />
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-center gap-4 mt-6">
          <button onClick={(e) => { e.stopPropagation(); prevQuestion(); }} disabled={currentIndex === 0} className="p-3 rounded-full bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-30">
            <ChevronLeft className="w-5 h-5" />
          </button>
          <button onClick={(e) => { e.stopPropagation(); setIsFlipped(!isFlipped); }} className="flex items-center px-5 py-2.5 bg-primary-100 text-primary-700 text-sm font-bold rounded-full hover:bg-primary-200">
            <RotateCw className="w-3.5 h-3.5 mr-2" /> Lật thẻ
          </button>
          <button onClick={(e) => { e.stopPropagation(); nextQuestion(); }} disabled={currentIndex === allQuestions.length - 1} className="p-3 rounded-full bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-30">
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>
      </div>
    );
  }

  // --- REVIEW & EXAM MODE ---
  return (
    <div className="max-w-3xl mx-auto px-2 sm:px-4 pb-12">
      <div className="mb-4">
        <div className="flex items-center justify-between mb-2">
           <div className="flex items-center min-w-0 pr-4">
            <BookOpen className="w-4 h-4 mr-2 text-primary-500 shrink-0" />
            <h2 className="text-sm md:text-lg font-bold text-slate-800 truncate">
              {data.file_name}
            </h2>
           </div>
           <div className="shrink-0">
             {isExamMode ? (
               <div className={`flex items-center px-2 py-1 rounded-lg font-mono font-bold text-xs ${timeLeft < 60 ? 'bg-red-100 text-red-600 animate-pulse' : 'bg-slate-100 text-slate-700'}`}>
                 <Clock className="w-3.5 h-3.5 mr-1" />
                 {formatTime(timeLeft)}
               </div>
             ) : (
               <div className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide ${getDifficultyColor(currentQuestion.difficulty)}`}>
                {currentQuestion.difficulty === 'easy' ? 'Dễ' : currentQuestion.difficulty === 'medium' ? 'TB' : 'Khó'}
               </div>
             )}
           </div>
        </div>
        <div className="flex items-center justify-between text-[11px] text-slate-500 font-bold uppercase tracking-tight">
           <span>Câu {currentIndex + 1} / {allQuestions.length}</span>
           <span className="flex items-center text-primary-600">
             {isExamMode ? <Flag className="w-3.5 h-3.5 mr-1"/> : <CheckCircle className="w-3.5 h-3.5 mr-1" />}
             {answeredCount}/{allQuestions.length}
           </span>
        </div>
      </div>

      <div className="h-1.5 w-full bg-slate-100 rounded-full mb-6 overflow-hidden">
        <div className={`h-full transition-all duration-500 ease-out ${isExamMode ? 'bg-red-500' : 'bg-primary-500'}`} style={{ width: `${progress}%` }} />
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5 md:p-8 mb-4 relative overflow-hidden">
        {!isLocked && isReviewMode && (
          <button onClick={handleHint} disabled={!!hiddenOptions[currentIndex]} className={`absolute top-4 right-4 p-1.5 rounded-full transition-all z-10 ${hiddenOptions[currentIndex] ? 'text-slate-200 cursor-not-allowed' : 'bg-yellow-50 text-yellow-500 hover:bg-yellow-100'}`}>
            <Lightbulb className={`w-4 h-4 ${hiddenOptions[currentIndex] ? '' : 'fill-current'}`} />
          </button>
        )}

        <div className="text-lg md:text-2xl font-bold text-slate-900 mb-6 leading-snug pr-4">
          <RichText content={currentQuestion.question} />
        </div>

        {/* Render Image if exists (Review/Exam Mode) */}
        {currentQuestion.image_url && (
          <div className="mb-6 rounded-xl overflow-hidden shadow-sm border border-slate-200 bg-slate-50 flex justify-center p-4">
             <img 
               src={currentQuestion.image_url} 
               alt="Question Illustration" 
               className="max-h-80 object-contain rounded-md"
               onError={handleImageError}
             />
          </div>
        )}

        <div className="space-y-3">
          {Object.entries(currentQuestion.options).map(([key, value]) => {
            const isHidden = hiddenOptions[currentIndex]?.includes(key);
            if (isHidden) return null;

            let stateClass = "border-slate-200 hover:border-primary-300 active:bg-slate-50 shadow-sm";
            let icon = null;

            if (isLocked) {
              if (key === currentQuestion.correct_answer) {
                stateClass = "border-green-500 bg-green-50 text-green-900";
                icon = <CheckCircle className="w-5 h-5 text-green-600 shrink-0 ml-2" />;
              } else if (key === currentAnswer) {
                stateClass = "border-red-500 bg-red-50 text-red-900";
                icon = <XCircle className="w-5 h-5 text-red-600 shrink-0 ml-2" />;
              } else {
                stateClass = "border-slate-100 opacity-40";
              }
            } else if (key === currentAnswer) {
              stateClass = "border-primary-500 bg-primary-50 ring-1 ring-primary-500";
            }

            return (
              <button
                key={key}
                onClick={() => handleAnswerSelect(key)}
                disabled={isLocked && isReviewMode}
                className={`w-full text-left p-4 rounded-xl border-2 transition-all duration-150 flex items-start justify-between ${stateClass}`}
              >
                <div className="flex items-start flex-1 min-w-0">
                  <span className={`w-7 h-7 flex items-center justify-center rounded-lg text-xs font-black mr-3 shrink-0 mt-0.5 ${
                     isLocked && key === currentQuestion.correct_answer ? 'bg-green-200 text-green-800' :
                     isLocked && key === currentAnswer ? 'bg-red-200 text-red-800' :
                     key === currentAnswer ? 'bg-primary-200 text-primary-800' :
                     'bg-slate-100 text-slate-600'
                  }`}>
                    {key}
                  </span>
                  <div className="text-sm md:text-base font-semibold text-slate-800 leading-normal break-words flex-1 pr-1">
                    <RichText content={value} />
                  </div>
                </div>
                {icon}
              </button>
            );
          })}
        </div>
      </div>

      <div className="min-h-[60px]">
        {isLocked && (
          <div className="animate-in fade-in slide-in-from-bottom-2 duration-300 mb-4 px-1">
             <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 shadow-sm">
                <div className="flex items-start">
                  <HelpCircle className="w-4 h-4 mr-2 text-blue-500 mt-0.5 shrink-0" />
                  <div className="text-blue-900 text-xs md:text-sm font-medium leading-relaxed w-full">
                    <span className="font-bold block mb-1">Giải thích:</span>
                    <RichText content={currentQuestion.explanation} />
                  </div>
                </div>
             </div>
          </div>
        )}

        <div className="flex items-center justify-between gap-3 px-1">
          <button
            onClick={prevQuestion}
            disabled={currentIndex === 0}
            className={`px-4 py-3 border border-slate-300 text-slate-700 font-bold rounded-xl text-sm flex items-center ${currentIndex === 0 ? 'opacity-0 pointer-events-none' : 'active:bg-slate-50'}`}
          >
            <ChevronLeft className="w-4 h-4 mr-1" /> Quay lại
          </button>
          
          <div className="flex-1 flex justify-center">
             {isExamMode && !isExamSubmitted && (
               <button onClick={submitExam} className="px-4 py-2 text-red-600 font-bold text-xs uppercase hover:underline">Nộp bài</button>
             )}
          </div>

          <button
            onClick={nextQuestion}
            className={`px-6 py-3 bg-slate-900 text-white font-bold rounded-xl text-sm flex items-center shadow-lg active:scale-95 transition-transform ${isReviewMode && !isAnswered ? 'opacity-50' : ''}`}
            disabled={isReviewMode && !isAnswered}
          >
            {currentIndex < allQuestions.length - 1 ? 'Tiếp' : 'Kết quả'}
            <ChevronRight className="w-4 h-4 ml-1" />
          </button>
        </div>
      </div>
    </div>
  );
};

export default QuizPlayer;