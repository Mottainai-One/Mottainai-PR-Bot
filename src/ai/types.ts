export type ChangeType =
  | "Feature"
  | "Bug Fix"
  | "Documentation"
  | "Refactoring"
  | "Test"
  | "Chore"
  | "CI/CD";

export type Recommendation = "APPROVE" | "REQUEST_CHANGES" | "COMMENT";

export interface ReviewIssue {
  severity: "HIGH" | "MEDIUM" | "LOW";
  description: string;
  suggestion: string;
}

export interface PrReviewResult {
  summary: string;
  typeOfChange: ChangeType;
  changesMade: string[];
  issuesFound: ReviewIssue[];
  recommendation: Recommendation;
  suggestedDescription: string;
}

export const REVIEW_COMMENT_MARKER = "<!-- MOTTAINAI-BOT-REVIEW -->";
export const DESCRIPTION_MARKER_START = "<!-- MOTTAINAI-DESCRIPTION-START -->";
export const DESCRIPTION_MARKER_END = "<!-- MOTTAINAI-DESCRIPTION-END -->";
