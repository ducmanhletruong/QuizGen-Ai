
import React, { useState } from 'react';
import { DifficultyDistribution, GenerationSource } from '../types';
import { BookOpen, Scale, Brain, Globe, FileText, Sparkles, ListChecks } from 'lucide-react';

interface DifficultySelectorProps {
  fileName: string;
  onSelect: (difficulty: DifficultyDistribution, source: GenerationSource, questionCount: number) => void;
  onCancel: () => void;
}

const DifficultySelector: React.FC<DifficultySelectorProps> = ({ fileName, onSelect, onCancel }) => {
  const [source, setSource] = useState<GenerationSource>('document');
  const [questionCount, setQuestionCount] = useState<number>(20);

  const handleSelect = (difficulty: DifficultyDistribution) => {
    onSelect(difficulty, source, questionCount);
  };

  return (
    <div className="w-full max-w-4xl mx-auto animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="text-center mb-8">
        <h2 className="text-2xl font-bold text-slate-800 mb-2">Cấu hình bài kiểm tra</h2>
        <p className="text-slate-500">
          Đã tải lên: <span className="font-medium text-slate-700">{fileName}</span>
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
        {/* Source Selection */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
          <label className="block text-sm font-bold text-slate-700 mb-3 flex items-center">
             <Globe className="w-4 h-4 mr-2 text-blue-500" /> Nguồn dữ liệu
          </label>
          <div className="flex bg-slate-100 p-1 rounded-lg">
            <button
              onClick={() => setSource('document')}
              className={`flex-1 py-2 px-3 rounded-md text-sm font-bold flex items-center justify-center transition-all duration-200 ${
                source === 'document' 
                  ? 'bg-white text-slate-800 shadow-sm ring-1 ring-slate-200' 
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              <FileText className="w-4 h-4 mr-2" />
              Tài liệu
            </button>
            <button
              onClick={() => setSource('web')}
              className={`flex-1 py-2 px-3 rounded-md text-sm font-bold flex items-center justify-center transition-all duration-200 relative ${
                source === 'web' 
                  ? 'bg-white text-blue-600 shadow-sm ring-1 ring-blue-100' 
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              <Globe className="w-4 h-4 mr-2" />
              Web Search
              <div className="absolute top-1 right-2">
                 <Sparkles className="w-2 h-2 text-yellow-500" />
              </div>
            </button>
          </div>
          <p className="text-xs text-slate-500 mt-3 leading-relaxed">
            {source === 'document' 
              ? "Tạo câu hỏi dựa trên nội dung file PDF đã tải lên." 
              : "AI sẽ tìm kiếm Google để tạo bộ đề mới mở rộng."}
          </p>
        </div>

        {/* Question Count Selection */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
          <label className="block text-sm font-bold text-slate-700 mb-3 flex items-center justify-between">
             <div className="flex items-center">
               <ListChecks className="w-4 h-4 mr-2 text-primary-500" /> Số lượng câu hỏi
             </div>
             <span className="bg-primary-100 text-primary-700 px-2 py-0.5 rounded text-xs font-bold">
               {questionCount} câu
             </span>
          </label>
          
          <div className="flex items-center space-x-4 mt-4">
             <span className="text-xs text-slate-400 font-bold">5</span>
             <input
              type="range"
              min="5"
              max="50"
              step="5"
              value={questionCount}
              onChange={(e) => setQuestionCount(parseInt(e.target.value))}
              className="flex-1 h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-primary-600 hover:accent-primary-700 transition-all"
             />
             <span className="text-xs text-slate-400 font-bold">50</span>
          </div>
          <p className="text-xs text-slate-500 mt-4 leading-relaxed">
            Chọn số lượng câu hỏi mong muốn. (Khuyên dùng: 20-30 câu)
          </p>
        </div>
      </div>

      <h3 className="text-lg font-bold text-slate-800 mb-4 px-1">Chọn độ khó</h3>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Beginner Option */}
        <button
          onClick={() => handleSelect('beginner')}
          className="group relative p-6 bg-white border-2 border-slate-200 rounded-xl hover:border-green-400 hover:shadow-lg transition-all duration-200 text-left flex flex-col h-full"
        >
          <div className="w-12 h-12 bg-green-100 text-green-600 rounded-full flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
            <BookOpen className="w-6 h-6" />
          </div>
          <h3 className="text-lg font-bold text-slate-800 mb-2">Cơ bản</h3>
          <div className="space-y-2 mb-4">
            <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
               <div className="bg-green-500 h-full w-[60%]"></div>
            </div>
            <p className="text-xs text-slate-400">60% Dễ • 30% Vừa • 10% Khó</p>
          </div>
          <p className="text-sm text-slate-600 mt-auto">
            Tập trung vào các định nghĩa, khái niệm cơ bản và ghi nhớ kiến thức cốt lõi.
          </p>
        </button>

        {/* Balanced Option */}
        <button
          onClick={() => handleSelect('balanced')}
          className="group relative p-6 bg-white border-2 border-primary-100 rounded-xl ring-1 ring-primary-100 hover:border-primary-500 hover:shadow-lg transition-all duration-200 text-left flex flex-col h-full"
        >
          <div className="absolute top-0 right-0 bg-primary-500 text-white text-xs font-bold px-3 py-1 rounded-bl-lg rounded-tr-lg">
            Khuyên dùng
          </div>
          <div className="w-12 h-12 bg-primary-100 text-primary-600 rounded-full flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
            <Scale className="w-6 h-6" />
          </div>
          <h3 className="text-lg font-bold text-slate-800 mb-2">Cân bằng</h3>
          <div className="space-y-2 mb-4">
            <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden flex">
               <div className="bg-green-500 h-full w-[30%]"></div>
               <div className="bg-yellow-500 h-full w-[50%]"></div>
               <div className="bg-red-500 h-full w-[20%]"></div>
            </div>
            <p className="text-xs text-slate-400">30% Dễ • 50% Vừa • 20% Khó</p>
          </div>
          <p className="text-sm text-slate-600 mt-auto">
            Sự kết hợp hài hòa giữa lý thuyết và vận dụng. Kiểm tra toàn diện.
          </p>
        </button>

        {/* Expert Option */}
        <button
          onClick={() => handleSelect('expert')}
          className="group relative p-6 bg-white border-2 border-slate-200 rounded-xl hover:border-red-400 hover:shadow-lg transition-all duration-200 text-left flex flex-col h-full"
        >
          <div className="w-12 h-12 bg-red-100 text-red-600 rounded-full flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
            <Brain className="w-6 h-6" />
          </div>
          <h3 className="text-lg font-bold text-slate-800 mb-2">Chuyên sâu</h3>
          <div className="space-y-2 mb-4">
            <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden flex justify-end">
               <div className="bg-red-500 h-full w-[50%]"></div>
            </div>
            <p className="text-xs text-slate-400">10% Dễ • 40% Vừa • 50% Khó</p>
          </div>
          <p className="text-sm text-slate-600 mt-auto">
            Thử thách với các câu hỏi phân tích, tổng hợp và tình huống phức tạp.
          </p>
        </button>
      </div>

      <div className="mt-8 text-center">
        <button
          onClick={onCancel}
          className="text-slate-500 hover:text-slate-700 font-medium px-4 py-2 hover:bg-slate-100 rounded-lg transition-colors"
        >
          Hủy và chọn file khác
        </button>
      </div>
    </div>
  );
};

export default DifficultySelector;
