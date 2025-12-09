import { GoogleGenAI } from "@google/genai";

// Helper to convert Blob to Base64
const blobToBase64 = (blob: Blob): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64String = reader.result as string;
      // Remove the data URL prefix (e.g., "data:audio/webm;base64,")
      const base64Data = base64String.split(',')[1];
      resolve(base64Data);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
};

export const transcribeAudio = async (audioBlob: Blob): Promise<string> => {
  try {
    const apiKey = process.env.API_KEY;
    if (!apiKey) {
        throw new Error("Chave de API não configurada no ambiente.");
    }

    const ai = new GoogleGenAI({ apiKey });
    const base64Data = await blobToBase64(audioBlob);
    const mimeType = audioBlob.type || 'audio/webm';

    console.log("Enviando áudio para IA:", { mimeType, size: audioBlob.size });

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: {
        parts: [
          {
            inlineData: {
              mimeType: mimeType,
              data: base64Data,
            },
          },
          {
            text: `Transcreva o áudio a seguir para Português do Brasil com precisão. 
            Identifique diferentes falantes se houver (ex: Falante 1, Falante 2). 
            Se houver pausas longas ou ruídos irrelevantes, ignore-os.
            Formate o texto em parágrafos claros.`,
          },
        ],
      },
    });

    return response.text || "";
  } catch (error: any) {
    console.error("Transcription error detail:", error);
    if (error.message?.includes("API_KEY")) {
        throw error;
    }
    // Generic Gemini error often means format issue
    throw new Error("Falha na transcrição. Verifique se o formato de áudio é compatível ou se a chave de API está válida.");
  }
};

export const summarizeText = async (text: string): Promise<string> => {
  try {
    const apiKey = process.env.API_KEY;
    if (!apiKey) {
         throw new Error("Chave de API não configurada.");
    }

    const ai = new GoogleGenAI({ apiKey });

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: {
        parts: [
          {
            text: `Você é um assistente executivo especialista em resumir reuniões.
            Analise o seguinte texto transcrito (em Português do Brasil) e gere um resumo estruturado.
            
            O resumo deve conter:
            1. Tópicos Principais discutidos.
            2. Decisões tomadas (se houver).
            3. Ações futuras (Action Items) (se houver).
            
            Mantenha a formatação limpa (Markdown).
            
            Texto:
            ${text}`,
          },
        ],
      },
    });

    return response.text || "";
  } catch (error) {
    console.error("Summarization error:", error);
    throw new Error("Falha ao gerar o resumo.");
  }
};