import { GoogleGenerativeAI } from "@google/generative-ai";
import { config } from "../config.js";
import type { PrReviewResult } from "./types.js";

export class GeminiClient {
  private readonly client: GoogleGenerativeAI;

  constructor() {
    if (!config.geminiApiKey) {
      throw new Error("GEMINI_API_KEY não configurada");
    }
    this.client = new GoogleGenerativeAI(config.geminiApiKey);
  }

  async generateReview(prompt: string): Promise<PrReviewResult> {
    const model = this.client.getGenerativeModel({
      model: config.geminiModel,
      generationConfig: {
        temperature: 0.2,
        responseMimeType: "application/json",
      },
    });

    const result = await model.generateContent(prompt);
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
