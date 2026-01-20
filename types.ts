
export type Difficulty = 'easy' | 'medium' | 'hard';

export interface QuizOption {
  A: string;
  B: string;
  C: string;
  D: string;
}

export interface QuizQuestion {
  id: string;
  difficulty: Difficulty;
  question: string;
  image_url?: string;
  options: QuizOption;
  correct_answer: keyof QuizOption;
  explanation: string;
}

export interface QuizChapter {
  chapter_title: string;
  questions: QuizQuestion[];
}

export interface QuizData {
  file_name: string;
  total_questions: number;
  chapters: QuizChapter[];
}

export enum AppState {
  IDLE = 'IDLE',
  EXTRACTING = 'EXTRACTING',
  FILE_REVIEW = 'FILE_REVIEW',
  CONFIGURING = 'CONFIGURING',
  GENERATING = 'GENERATING',
  MODE_SELECTION = 'MODE_SELECTION',
  READY = 'READY',
  ERROR = 'ERROR'
}

export type DifficultyDistribution = 'beginner' | 'balanced' | 'expert';

export type StudyMode = 'review' | 'exam' | 'flashcard';

export type GenerationSource = 'document' | 'web';
