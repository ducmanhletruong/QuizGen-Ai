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

const getContextLabel = (lengthOrType: number | string, source: GenerationSource) => {
  if (source === 'web') return "Web Search Topic";
  if (typeof lengthOrType === 'string') return "Cloud File";
  return "Document Context";
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
const identifyMainTopic = async (ai: GoogleGenAI, input: string | { fileUri: string, mimeType: string }): Promise<string> => {
  try {
    const contentPart = typeof input === 'string' 
      ? { text: `Identify the main technical subject of the following text in 5 words or less. Return ONLY the topic name in Vietnamese.\n\nText preview: ${input.substring(0, 3000)}...` }
      : { 
          // For file inputs, we ask based on the file.
          text: "Identify the main technical subject of this document in 5 words or less. Return ONLY the topic name in Vietnamese." 
        };

    const parts: any[] = typeof input === 'string' 
      ? [contentPart] 
      : [{ fileData: input }, contentPart];

    const response = await ai.models.generateContent({
      model: MODEL_NAME,
      contents: [{ role: 'user', parts }],
      config: { temperature: 0.1 }
    });
    return response.text?.trim() || "Kiến thức tổng hợp";
  } catch (e) {
    console.warn("Failed to extract topic, using generic.", e);
    return "Kiến thức tổng hợp";
  }
};

export const generateQuizFromText = async (
  text: string | null,
  fileUri: string | null,
  fileName: string, 
  difficulty: DifficultyDistribution, 
  source: GenerationSource = 'document',
  previousQuestions: string[] = [],
  targetQuestionCount?: number
): Promise<QuizData> => {
  const ai = getClient();
  const difficultyInstruction = getDifficultyInstruction(difficulty);

  // 1. Determine Count
  const finalQuestionCount = targetQuestionCount ? targetQuestionCount.toString() : "20";
  const numQuestions = parseInt(finalQuestionCount);

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

  // 5. Volume Logic
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

  // 6. Source-Specific Logic & Prompt Assembly
  let contextInstruction = "";
  let parts: any[] = [];

  if (source === 'web') {
    // WEB SEARCH MODE
    let mainTopic = "Kiến thức tổng hợp";
    if (fileUri) {
      mainTopic = await identifyMainTopic(ai, { fileUri, mimeType: 'application/pdf' });
    } else if (text) {
      mainTopic = await identifyMainTopic(ai, text);
    }
    
    console.log("Extracted Topic for Search:", mainTopic);
    contextInstruction = `
      Task: Generate a quiz about topic: "${mainTopic}".
      Source: Use "googleSearch" to find LATEST info.
      Context Reference: ${fileName}
    `;
    toolsConfig = [{ googleSearch: {} }];
    
    // For Web Search, we strictly use text prompt instructions to drive the search, 
    // but we can include the file context as reference if it exists.
    parts.push({ text: contextInstruction });

  } else {
    // DOCUMENT MODE
    contextInstruction = `
      Task: Generate a quiz based on the provided document.
      File Name: ${fileName}
    `;

    if (fileUri) {
      // Use File Data
      parts.push({
        fileData: {
          mimeType: 'application/pdf',
          fileUri: fileUri
        }
      });
      parts.push({ text: contextInstruction });
    } else if (text) {
      // Use Text Data
      const MAX_SAFE_CHARS = 800000; 
      let processText = text;
      if (text.length > MAX_SAFE_CHARS) {
        processText = text.substring(0, MAX_SAFE_CHARS) + "\n...[TRUNCATED]...";
      }
      parts.push({ 
        text: `${contextInstruction}\n\nContent:\n${processText}` 
      });
    } else {
      throw new Error("No text or file provided for generation.");
    }
  }

  // 7. Final Instructions
  const finalInstructions = `
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

  // Add instructions to parts
  parts.push({ text: finalInstructions });

  // Helper function to make the API call
  const attemptGeneration = async (targetCount: string, instructionOverride?: string) => {
    // Clone parts to avoid mutating for retries
    const currentParts = [...parts];
    if (instructionOverride) {
      currentParts.push({ text: `\n\nIMPORTANT: ${instructionOverride}` });
    }

    const response = await ai.models.generateContent({
      model: MODEL_NAME,
      contents: [{ role: 'user', parts: currentParts }],
      config: {
        systemInstruction: SYSTEM_PROMPT,
        responseMimeType: "application/json",
        responseSchema: quizSchema,
        maxOutputTokens: 65536, 
        temperature: 0.5,
        tools: toolsConfig,
      }
    });

    let jsonText = response.text;
    if (!jsonText) throw new Error("No response generated from AI");
    
    // Parsing Logic
    if (jsonText.includes("```")) {
       jsonText = jsonText.replace(/```json/gi, "").replace(/```/g, "");
    }
    
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
    if (error instanceof SyntaxError || error.message.includes('JSON')) {
      console.warn(`JSON Parse failed. Retrying...`);
      try {
        const retryPrompt = `
        ERROR RECOVERY: Previous response was invalid JSON.
        1. YOU MUST GENERATE EXACTLY ${finalQuestionCount} QUESTIONS.
        2. CHECK JSON SYNTAX CAREFULLY.
        `;
        return await attemptGeneration(finalQuestionCount, retryPrompt);
      } catch (retryError) {
        const fallbackCount = Math.max(20, Math.floor(numQuestions * 0.8)).toString();
        try {
           return await attemptGeneration(fallbackCount, `CRITICAL: Previous attempts failed. Reduce count to ${fallbackCount}. Ensure valid JSON.`);
        } catch (finalError) {
           throw new Error("Không thể tạo số lượng câu hỏi lớn. Vui lòng thử lại với số lượng ít hơn.");
        }
      }
    }
    console.error("Gemini Generation Error:", error);
    throw error;
  }
};