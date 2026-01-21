import { GoogleGenAI, Type, Schema } from "@google/genai";
import { SYSTEM_PROMPT, MODEL_NAME } from '../constants';
import { QuizData, DifficultyDistribution, GenerationSource } from '../types';

const getClient = () => {
  const apiKey = process.env.API_KEY;
  if (!apiKey) {
    throw new Error("API Key not found in environment variables");
  }
  return new GoogleGenAI({ apiKey });
};

// Define the response schema using the GenAI SDK Type enum
const quizSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    file_name: { type: Type.STRING },
    total_questions: { type: Type.NUMBER },
    chapters: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          chapter_title: { type: Type.STRING },
          questions: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                id: { type: Type.STRING },
                difficulty: { type: Type.STRING, enum: ["easy", "medium", "hard"] },
                question: { type: Type.STRING },
                image_url: { type: Type.STRING, description: "Optional URL for a relevant image placeholder" },
                options: {
                  type: Type.OBJECT,
                  properties: {
                    A: { type: Type.STRING },
                    B: { type: Type.STRING },
                    C: { type: Type.STRING },
                    D: { type: Type.STRING },
                  },
                  required: ["A", "B", "C", "D"],
                },
                correct_answer: { type: Type.STRING, enum: ["A", "B", "C", "D"] },
                explanation: { type: Type.STRING },
              },
              required: ["id", "difficulty", "question", "options", "correct_answer", "explanation"],
            },
          },
        },
        required: ["chapter_title", "questions"],
      },
    },
  },
  required: ["file_name", "total_questions", "chapters"],
};

/**
 * Simplified config: Just return generic types to avoid conflicting with user quantity requests.
 */
const getContextLabel = (textLength: number, source: GenerationSource) => {
  if (source === 'web') return "Web Search Topic";
  return "Document Context"; // Removed "Short/Long Document" labels to prevent AI bias
};

const getDifficultyInstruction = (difficulty: DifficultyDistribution): string => {
  switch (difficulty) {
    case 'beginner':
      return "Difficulty distribution: Easy: ~60%, Medium: ~30%, Hard: ~10%. Focus on basic definitions.";
    case 'expert':
      return "Difficulty distribution: Easy: ~10%, Medium: ~40%, Hard: ~50%. Focus on analysis and edge cases.";
    case 'balanced':
    default:
      return "Difficulty distribution: Easy: ~30%, Medium: ~50%, Hard: ~20%.";
  }
};

/**
 * Helper to identify the main topic from the text (used for Web search mode)
 */
const identifyMainTopic = async (ai: GoogleGenAI, text: string): Promise<string> => {
  try {
    const response = await ai.models.generateContent({
      model: MODEL_NAME,
      contents: `Identify the main technical subject or central topic of the following text in 5 words or less. Return ONLY the topic name in Vietnamese.\n\nText preview: ${text.substring(0, 3000)}...`,
      config: { temperature: 0.1 }
    });
    return response.text?.trim() || "Kiến thức tổng hợp";
  } catch (e) {
    console.warn("Failed to extract topic, using generic.", e);
    return "Kiến thức tổng hợp";
  }
};

export const generateQuizFromText = async (
  text: string, 
  fileName: string, 
  difficulty: DifficultyDistribution, 
  source: GenerationSource = 'document',
  previousQuestions: string[] = [],
  targetQuestionCount?: number
): Promise<QuizData> => {
  const ai = getClient();
  const contextLabel = getContextLabel(text.length, source);
  const difficultyInstruction = getDifficultyInstruction(difficulty);

  // 1. Determine Count: Strict priority to user input
  // Default to 20 if not specified
  const finalQuestionCount = targetQuestionCount ? targetQuestionCount.toString() : "20";
  const numQuestions = parseInt(finalQuestionCount);

  let finalPrompt = "";
  let toolsConfig = undefined;
  
  // 2. Avoidance Logic
  let avoidanceInstruction = "";
  if (previousQuestions.length > 0) {
    const historySlice = previousQuestions.slice(-50).map(q => `"${q}"`).join(", ");
    avoidanceInstruction = `
    CRITICAL - DUPLICATE PREVENTION:
    DO NOT generate questions identical/similar to: [${historySlice}]
    Create COMPLETELY NEW questions.
    `;
  }

  // 3. Formatting Logic
  const latexInstruction = `
  IMPORTANT - LaTeX:
  - Use LaTeX for math.
  - MUST double-escape backslashes (e.g., "\\\\frac") for valid JSON.
  - Use $$ for block equations, $ for inline.
  `;

  // 4. Hard Question Logic
  const hardQuestionsInstruction = `
  DIFFICULTY RULES:
  - Uniform Length: Correct answer must not be the longest option.
  - Homogeneity: Distractors must be plausible and semantically similar.
  `;

  // 5. Count & Volume Logic (CRITICAL FIX FOR 50 QUESTIONS)
  // With 65k tokens, we can be verbose, but we must emphasize quantity.
  const volumeInstruction = `
  VOLUME REQUIREMENT (CRITICAL):
  - You MUST generate EXACTLY ${finalQuestionCount} questions.
  - If the document is short, create variations, test specific details, or reverse logic to reach the target.
  - DO NOT STOP until you reach ${finalQuestionCount} questions.
  `;

  const randomizationInstruction = `
  RANDOMIZATION:
  - Shuffle correct answer positions (A, B, C, D).
  - DO NOT bias towards 'A'.
  `;

  // 6. Source-Specific Logic
  let contextInstruction = "";
  if (source === 'web') {
    const mainTopic = await identifyMainTopic(ai, text);
    console.log("Extracted Topic for Search:", mainTopic);
    contextInstruction = `
      Task: Generate a quiz about topic: "${mainTopic}".
      Source: Use "googleSearch" to find LATEST info.
      Context: ${fileName}
    `;
    toolsConfig = [{ googleSearch: {} }];
  } else {
    // Truncate extremely long text to avoid input token limits (though Flash has a huge window)
    const MAX_SAFE_CHARS = 800000; 
    let processText = text;
    if (text.length > MAX_SAFE_CHARS) {
      processText = text.substring(0, MAX_SAFE_CHARS) + "\n...[TRUNCATED]...";
    }
    contextInstruction = `
      Task: Generate a quiz based on the provided document.
      File Name: ${fileName} (${contextLabel})
      Content:
      ${processText}
    `;
  }

  // 7. Assemble Prompt
  finalPrompt = `
    ${contextInstruction}

    CONFIGURATION:
    - Target Count: ${finalQuestionCount}
    - ${difficultyInstruction}

    RULES:
    ${volumeInstruction}
    ${hardQuestionsInstruction}
    ${randomizationInstruction}
    ${latexInstruction}
    ${avoidanceInstruction}
  `;

  // Helper function to make the API call
  const attemptGeneration = async (targetCount: string, instructionOverride?: string) => {
    const currentPrompt = instructionOverride ? finalPrompt + `\n\nIMPORTANT: ${instructionOverride}` : finalPrompt;

    const response = await ai.models.generateContent({
      model: MODEL_NAME,
      contents: [{ role: 'user', parts: [{ text: currentPrompt }] }],
      config: {
        systemInstruction: SYSTEM_PROMPT,
        responseMimeType: "application/json",
        responseSchema: quizSchema,
        // CRITICAL UPDATE: Set to 65536 to prevent cutting off large question sets
        maxOutputTokens: 65536, 
        temperature: 0.5,
        tools: toolsConfig,
      }
    });

    let jsonText = response.text;
    if (!jsonText) throw new Error("No response generated from AI");
    
    // Improved Parsing Logic: Handle Code Blocks and Extract JSON Object
    // 1. Strip markdown code blocks if present
    if (jsonText.includes("```")) {
       jsonText = jsonText.replace(/```json/gi, "").replace(/```/g, "");
    }
    
    // 2. Locate the first '{' and last '}' to strip any prologue/epilogue text
    const firstBrace = jsonText.indexOf('{');
    const lastBrace = jsonText.lastIndexOf('}');
    
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      jsonText = jsonText.substring(firstBrace, lastBrace + 1);
    }
    
    return JSON.parse(jsonText) as QuizData;
  };

  try {
    const data = await attemptGeneration(finalQuestionCount);
    
    if (!data.chapters || data.chapters.length === 0) {
      throw new Error("AI could not generate valid questions.");
    }
    
    // Naming logic
    if (source === 'web') {
      data.file_name = `Đề mở rộng: ${fileName} #${previousQuestions.length > 0 ? (previousQuestions.length / 10 + 1).toFixed(0) : '1'}`;
    } else if (previousQuestions.length > 0) {
       data.file_name = `${fileName} (Đề số ${(previousQuestions.length / numQuestions + 1).toFixed(0)})`;
    }

    return data;

  } catch (error: any) {
    // Retry Logic
    if (error instanceof SyntaxError || error.message.includes('JSON')) {
      console.warn(`JSON Parse failed for ${finalQuestionCount} questions. Retrying...`);
      
      // Attempt 1: Retry SAME count. With 65k tokens, failures are likely due to syntax, not length.
      try {
        const retryPrompt = `
        ERROR RECOVERY: Previous response was invalid JSON.
        1. YOU MUST GENERATE EXACTLY ${finalQuestionCount} QUESTIONS.
        2. CHECK JSON SYNTAX CAREFULLY.
        `;
        const retryData = await attemptGeneration(finalQuestionCount, retryPrompt);
        return retryData;
      } catch (retryError) {
        
        // Attempt 2: Only fallback if absolutely necessary.
        // If 50 fails twice, try 40 (instead of dropping to 20).
        const fallbackCount = Math.max(20, Math.floor(numQuestions * 0.8)).toString();
        
        console.warn(`Retry failed. Falling back to ${fallbackCount} questions.`);
        
        try {
           const fallbackData = await attemptGeneration(fallbackCount, `CRITICAL: Previous attempts failed. Reduce count to ${fallbackCount}. Ensure valid JSON.`);
           return fallbackData;
        } catch (finalError) {
           throw new Error("Không thể tạo số lượng câu hỏi lớn. Vui lòng thử lại với số lượng ít hơn.");
        }
      }
    }
    console.error("Gemini Generation Error:", error);
    throw error;
  }
};