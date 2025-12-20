
import { GoogleGenAI } from "@google/genai";

const blobToBase64 = (blob: Blob): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64String = reader.result as string;
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
    if (!apiKey) throw new Error("API Key não configurada.");

    const ai = new GoogleGenAI({ apiKey });
    const base64Data = await blobToBase64(audioBlob);
    
    // Utilizamos o gemini-3-flash-preview para transcrição estável e rápida
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: {
        parts: [
          {
            inlineData: {
              mimeType: audioBlob.type || 'audio/webm',
              data: base64Data,
            },
          },
          {
            text: "Transcreva este áudio para Português do Brasil com precisão. Identifique falantes diferentes e utilize pontuação correta. Retorne apenas a transcrição do que foi falado.",
          },
        ],
      },
    });

    return response.text || "Não foi possível transcrever o áudio.";
  } catch (error: any) {
    console.error("Erro na transcrição:", error);
    throw new Error(error.message || "Erro ao processar áudio.");
  }
};

export const summarizeText = async (text: string): Promise<string> => {
  try {
    const apiKey = process.env.API_KEY;
    if (!apiKey) throw new Error("API Key não configurada.");

    const ai = new GoogleGenAI({ apiKey });

    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: {
        parts: [
          {
            text: `Atue como um assistente executivo sênior. Resuma a seguinte transcrição de reunião em Português do Brasil de forma estruturada e profissional.
            Estruture o resumo com:
            - Título Descritivo
            - Principais Tópicos (Bullet points)
            - Decisões Tomadas
            - Próximos Passos (Action Items)
            
            Transcrição: ${text}`,
          },
        ],
      },
    });

    return response.text || "Não foi possível gerar o resumo.";
  } catch (error: any) {
    console.error("Erro no resumo:", error);
    throw new Error(error.message || "Erro ao gerar resumo.");
  }
};
