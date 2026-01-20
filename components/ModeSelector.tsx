
import React, { useState } from 'react';
import { StudyMode } from '../types';
import { BookOpen, Clock, Layers, Play, CheckCircle2 } from 'lucide-react';

interface ModeSelectorProps {
  totalQuestions: number;
  onStart: (mode: StudyMode, duration?: number) => void;
  onCancel: () => void;
}

const ModeSelector: React.FC<ModeSelectorProps> = ({ totalQuestions, onStart, onCancel }) => {
  const [selectedMode, setSelectedMode] = useState<StudyMode>('review');
  const [examDuration, setExamDuration] = useState<number>(Math.min(Math.ceil(totalQuestions * 1.5), 60)); // Default 1.5 min per question

  const handleStart = () => {
    onStart(selectedMode, selectedMode === 'exam' ? examDuration : undefined);
  };

  const getStartButtonText = () => {
    switch (selectedMode) {
      case 'exam': return 'Bắt đầu làm bài thi';
      case 'flashcard': return 'Mở Flashcard';
      default: return 'Bắt đầu ôn tập';
    }
  };

  const getStartButtonColor = () => {
     switch (selectedMode) {
        case 'exam': return 'bg-red-600 hover:bg-red-700 shadow-red-200';
        case 'flashcard': return 'bg-purple-600 hover:bg-purple-700 shadow-purple-200';
        default: return 'bg-primary-600 hover:bg-primary-700 shadow-primary-200';
     }
  };

  return (
    <div className="w-full max-w-4xl mx-auto animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="text-center mb-8">
        <h2 className="text-2xl font-bold text-slate-800 mb-2">Chọn chế độ học</h2>
        <p className="text-slate-500">
          Bộ câu hỏi đã sẵn sàng ({totalQuestions} câu). Bạn muốn ôn tập như thế nào?
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        {/* Review Mode */}
        <button
          onClick={() => setSelectedMode('review')}
          className={`relative p-6 rounded-xl border-2 text-left transition-all duration-300 ${
            selectedMode === 'review'
              ? 'border-primary-500 bg-primary-50 shadow-lg scale-[1.02]'
              : 'border-slate-200 bg-white hover:border-primary-200 hover:shadow-md'
          }`}
        >
          {selectedMode === 'review' && (
            <div className="absolute top-4 right-4 text-primary-600 animate-in zoom-in duration-300">
                <CheckCircle2 className="w-6 h-6 fill-primary-100" />
            </div>
          )}
          <div className={`w-12 h-12 rounded-full flex items-center justify-center mb-4 transition-colors ${
             selectedMode === 'review' ? 'bg-primary-100 text-primary-600' : 'bg-slate-100 text-slate-500'
          }`}>
            <BookOpen className="w-6 h-6" />
          </div>
          <h3 className={`text-lg font-bold mb-2 transition-colors ${selectedMode === 'review' ? 'text-primary-900' : 'text-slate-800'}`}>
            Ôn tập
          </h3>
          <p className="text-sm text-slate-600">
            Xem kết quả và giải thích ngay sau mỗi câu trả lời. Phù hợp để học kiến thức mới.
          </p>
        </button>

        {/* Exam Mode */}
        <button
          onClick={() => setSelectedMode('exam')}
          className={`relative p-6 rounded-xl border-2 text-left transition-all duration-300 ${
            selectedMode === 'exam'
              ? 'border-red-500 bg-red-50 shadow-lg scale-[1.02]'
              : 'border-slate-200 bg-white hover:border-red-200 hover:shadow-md'
          }`}
        >
          {selectedMode === 'exam' && (
            <div className="absolute top-4 right-4 text-red-600 animate-in zoom-in duration-300">
                <CheckCircle2 className="w-6 h-6 fill-red-100" />
            </div>
          )}
          <div className={`w-12 h-12 rounded-full flex items-center justify-center mb-4 transition-colors ${
             selectedMode === 'exam' ? 'bg-red-100 text-red-600' : 'bg-slate-100 text-slate-500'
          }`}>
            <Clock className="w-6 h-6" />
          </div>
          <h3 className={`text-lg font-bold mb-2 transition-colors ${selectedMode === 'exam' ? 'text-red-900' : 'text-slate-800'}`}>
            Thi thử
          </h3>
          <p className="text-sm text-slate-600">
            Giới hạn thời gian. Chỉ xem kết quả sau khi nộp bài. Mô phỏng áp lực phòng thi.
          </p>
        </button>

        {/* Flashcard Mode */}
        <button
          onClick={() => setSelectedMode('flashcard')}
          className={`relative p-6 rounded-xl border-2 text-left transition-all duration-300 ${
            selectedMode === 'flashcard'
              ? 'border-purple-500 bg-purple-50 shadow-lg scale-[1.02]'
              : 'border-slate-200 bg-white hover:border-purple-200 hover:shadow-md'
          }`}
        >
          {selectedMode === 'flashcard' && (
            <div className="absolute top-4 right-4 text-purple-600 animate-in zoom-in duration-300">
                <CheckCircle2 className="w-6 h-6 fill-purple-100" />
            </div>
          )}
          <div className={`w-12 h-12 rounded-full flex items-center justify-center mb-4 transition-colors ${
             selectedMode === 'flashcard' ? 'bg-purple-100 text-purple-600' : 'bg-slate-100 text-slate-500'
          }`}>
            <Layers className="w-6 h-6" />
          </div>
          <h3 className={`text-lg font-bold mb-2 transition-colors ${selectedMode === 'flashcard' ? 'text-purple-900' : 'text-slate-800'}`}>
            Flashcard
          </h3>
          <p className="text-sm text-slate-600">
            Lật thẻ để kiểm tra trí nhớ nhanh. Một mặt là câu hỏi, mặt sau là đáp án.
          </p>
        </button>
      </div>

      {/* Exam Configuration */}
      {selectedMode === 'exam' && (
        <div className="bg-white p-6 rounded-xl border border-red-200 bg-red-50/50 mb-8 animate-in fade-in slide-in-from-top-2">
          <label className="block text-sm font-medium text-slate-700 mb-2">
            Thời gian làm bài: <span className="font-bold text-red-600 text-lg">{examDuration} phút</span>
          </label>
          <input
            type="range"
            min="5"
            max="120"
            step="5"
            value={examDuration}
            onChange={(e) => setExamDuration(parseInt(e.target.value))}
            className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-red-600 hover:accent-red-700 transition-all"
          />
          <div className="flex justify-between text-xs text-slate-500 font-medium mt-2">
            <span>5 phút</span>
            <span>60 phút</span>
            <span>120 phút</span>
          </div>
        </div>
      )}

      <div className="flex flex-col sm:flex-row justify-center gap-4 mt-8">
        <button
          onClick={onCancel}
          className="px-6 py-4 bg-white border border-slate-300 text-slate-700 font-medium rounded-xl hover:bg-slate-50 transition-colors w-full sm:w-auto"
        >
          Quay lại
        </button>
        <button
          onClick={handleStart}
          className={`px-8 py-4 text-white text-lg font-bold rounded-xl shadow-lg hover:shadow-xl hover:-translate-y-1 transition-all flex items-center justify-center w-full sm:w-auto ${getStartButtonColor()}`}
        >
          <Play className="w-6 h-6 mr-3 fill-current" />
          {getStartButtonText()}
        </button>
      </div>
    </div>
  );
};

export default ModeSelector;
