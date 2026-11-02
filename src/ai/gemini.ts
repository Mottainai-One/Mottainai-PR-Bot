import { GoogleGenerativeAI } from "@google/generative-ai";
import { config } from "../config.js";
import type { PrReviewResult } from "./types.js";
import { retryAcrossModels } from "./retry.js";

type RetryLogger = (message: string) => void;

export class GeminiClient {
  private readonly client: GoogleGenerativeAI;

  constructor(private readonly logRetry?: RetryLogger) {
    if (!config.geminiApiKey) {
      throw new Error("GEMINI_API_KEY não configurada");
    }
    this.client = new GoogleGenerativeAI(config.geminiApiKey);
  }

  async generateReview(prompt: string): Promise<PrReviewResult> {
    const result = await retryAcrossModels([config.geminiModel, config.geminiFallbackModel], (modelName) => {
      const model = this.client.getGenerativeModel({
        model: modelName,
        generationConfig: {
          temperature: 0.2,
          responseMimeType: "application/json",
        },
      });
      return model.generateContent(prompt);
    }, {
      maxAttempts: config.geminiMaxAttempts,
      baseDelayMs: config.geminiRetryBaseDelayMs,
      onRetry: (error, nextAttempt, delayMs) => {
        const message = error instanceof Error ? error.message : String(error);
        this.logRetry?.(
          `Gemini indisponivel (${message}); nova tentativa ${nextAttempt}/${config.geminiMaxAttempts} em ${delayMs}ms`
        );
      },
      onFallback: (failedModel, nextModel) => {
        this.logRetry?.(`Gemini ${failedModel} indisponivel apos as tentativas; usando ${nextModel}`);
      },
    });
    const text = result.response.text();
    return this.parseJson(text);
  }

  private parseJson(text: string): PrReviewResult {
    const cleaned = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
    const parsed = JSON.parse(cleaned) as Partial<PrReviewResult>;

    return {
      summary: parsed.summary ?? "",
      typeOfChange: parsed.typeOfChange ?? "Feature",
      changesMade: Array.isArray(parsed.changesMade) ? parsed.changesMade : [],
      issuesFound: Array.isArray(parsed.issuesFound) ? parsed.issuesFound : [],
      recommendation: parsed.recommendation ?? "COMMENT",
      suggestedDescription: parsed.suggestedDescription ?? "",
    };
  }
}
