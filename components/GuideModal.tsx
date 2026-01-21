import React from 'react';
import { X, FileText, BrainCircuit, Globe, Layers, Zap, GraduationCap, CheckCircle2 } from 'lucide-react';

interface GuideModalProps {
  onClose: () => void;
}

const GuideModal: React.FC<GuideModalProps> = ({ onClose }) => {
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div 
        className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm transition-opacity"
        onClick={onClose}
      ></div>
      
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-hidden flex flex-col animate-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-slate-100 bg-slate-50/50">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-primary-100 text-primary-600 rounded-full flex items-center justify-center">
              <Zap className="w-6 h-6 fill-current" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-slate-900">Tính năng AI & Hướng dẫn</h2>
              <p className="text-xs text-slate-500 font-medium">Sức mạnh từ Google Gemini 1.5 Pro</p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-2 rounded-full hover:bg-slate-200 text-slate-400 hover:text-slate-600 transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Content */}
        <div className="overflow-y-auto p-6 space-y-8">
          
          {/* Section 1: Workflow */}
          <section>
            <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider mb-4 flex items-center">
              <GraduationCap className="w-4 h-4 mr-2 text-primary-500" />
              Quy trình học tập thông minh
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-100">
                <div className="w-8 h-8 bg-blue-100 text-blue-600 rounded-lg flex items-center justify-center mb-3 text-sm font-bold">1</div>
                <h4 className="font-bold text-slate-800 mb-1">Tải lên tài liệu</h4>
                <p className="text-sm text-slate-500">Hỗ trợ file PDF (giáo trình, slide, sách). AI sẽ đọc hiểu toàn bộ nội dung trong vài giây.</p>
              </div>
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-100">
                <div className="w-8 h-8 bg-purple-100 text-purple-600 rounded-lg flex items-center justify-center mb-3 text-sm font-bold">2</div>
                <h4 className="font-bold text-slate-800 mb-1">AI Tạo đề thi</h4>
                <p className="text-sm text-slate-500">Tùy chỉnh độ khó, số lượng câu. AI tự động trích xuất ý chính và tạo câu hỏi trắc nghiệm.</p>
              </div>
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-100">
                <div className="w-8 h-8 bg-green-100 text-green-600 rounded-lg flex items-center justify-center mb-3 text-sm font-bold">3</div>
                <h4 className="font-bold text-slate-800 mb-1">Ôn luyện</h4>
                <p className="text-sm text-slate-500">Làm bài thi thử, lật thẻ Flashcard hoặc ôn tập chi tiết với giải thích cặn kẽ.</p>
              </div>
            </div>
          </section>

          {/* Section 2: AI Features */}
          <section>
            <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider mb-4 flex items-center">
              <BrainCircuit className="w-4 h-4 mr-2 text-primary-500" />
              Các tính năng AI nổi bật
            </h3>
            <div className="space-y-3">
              <div className="flex items-start p-3 hover:bg-slate-50 rounded-lg transition-colors">
                <FileText className="w-5 h-5 text-slate-400 mt-0.5 mr-3 shrink-0" />
                <div>
                  <h4 className="font-bold text-slate-800 text-sm">Deep Document Analysis (Phân tích sâu)</h4>
                  <p className="text-sm text-slate-500 mt-1">
                    Không chỉ tìm từ khóa, AI hiểu ngữ cảnh, công thức Toán học (LaTeX) và logic của bài học để đưa ra câu hỏi suy luận.
                  </p>
                </div>
              </div>

              <div className="flex items-start p-3 hover:bg-slate-50 rounded-lg transition-colors">
                <Globe className="w-5 h-5 text-blue-500 mt-0.5 mr-3 shrink-0" />
                <div>
                  <h4 className="font-bold text-slate-800 text-sm">Web Search Expansion (Mở rộng Web)</h4>
                  <p className="text-sm text-slate-500 mt-1">
                    Chế độ <span className="font-bold text-blue-600">Web Search</span> cho phép AI tự động xác định chủ đề từ file của bạn, sau đó tìm kiếm thông tin mới nhất trên Google để tạo bộ đề mở rộng/nâng cao.
                  </p>
                </div>
              </div>

              <div className="flex items-start p-3 hover:bg-slate-50 rounded-lg transition-colors">
                <Layers className="w-5 h-5 text-purple-500 mt-0.5 mr-3 shrink-0" />
                <div>
                  <h4 className="font-bold text-slate-800 text-sm">Smart Duplicate Prevention (Chống trùng lặp)</h4>
                  <p className="text-sm text-slate-500 mt-1">
                    Khi bạn chọn "Tạo đề mới", hệ thống ghi nhớ các câu hỏi cũ và yêu cầu AI tạo ra các câu hỏi hoàn toàn mới, giúp bạn ôn tập không giới hạn.
                  </p>
                </div>
              </div>
            </div>
          </section>

          {/* Section 3: Tips */}
          <section className="bg-yellow-50 rounded-xl p-5 border border-yellow-100">
             <h3 className="text-sm font-bold text-yellow-800 uppercase tracking-wider mb-2 flex items-center">
              Mẹo sử dụng hiệu quả
            </h3>
            <ul className="space-y-2">
              <li className="flex items-center text-sm text-yellow-900">
                <CheckCircle2 className="w-4 h-4 mr-2 text-yellow-600" />
                Nên tải lên file PDF dạng text rõ ràng (hạn chế file ảnh scan mờ).
              </li>
              <li className="flex items-center text-sm text-yellow-900">
                <CheckCircle2 className="w-4 h-4 mr-2 text-yellow-600" />
                Với tài liệu dài, hãy chọn số lượng câu hỏi lớn (40-50 câu) để bao phủ kiến thức.
              </li>
              <li className="flex items-center text-sm text-yellow-900">
                <CheckCircle2 className="w-4 h-4 mr-2 text-yellow-600" />
                Sử dụng chế độ <b>Web Search</b> khi muốn kiểm tra kiến thức xã hội hoặc tin tức cập nhật.
              </li>
            </ul>
          </section>

        </div>
        
        {/* Footer */}
        <div className="p-4 border-t border-slate-100 bg-slate-50 flex justify-end">
          <button 
            onClick={onClose}
            className="px-6 py-2 bg-slate-900 text-white font-bold rounded-lg hover:bg-slate-800 transition-colors"
          >
            Đã hiểu
          </button>
        </div>
      </div>
    </div>
  );
};

export default GuideModal;