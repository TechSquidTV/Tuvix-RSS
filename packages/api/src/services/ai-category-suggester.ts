/**
 * AI Category Suggestion Service
 *
 * Uses Vercel AI SDK (OpenAI) to suggest categories for new RSS feeds.
 * Analyzes feed metadata, recent entry titles, and existing user categories.
 */

import { generateObject } from "ai";
import { z } from "zod";
import * as Sentry from "@/utils/sentry";
import { withTiming } from "@/utils/metrics";

interface FeedContext {
  title: string;
  description?: string;
  siteUrl?: string;
  feedCategories: string[];
  entryCategories: string[];
  entryTitles: string[];
}

interface UserCategory {
  id: number;
  name: string;
}

interface CategorySuggestionResult {
  matchedCategoryIds: number[];
  newCategorySuggestions: string[];
  status: "success" | "no_input" | "fail";
}

/**
 * Suggest categories for a new feed
 *
 * @param feedContext Information about the feed content
 * @param userCategories User's existing category list
 * @param apiKey OpenAI API Key
 * @returns Filtered list of matched existing IDs and new suggested names
 */
export async function suggestCategories(
  feedContext: FeedContext,
  userCategories: UserCategory[],
  apiKey: string
): Promise<CategorySuggestionResult> {
  return withTiming("ai.suggestCategories", async () => {
    try {
      // If we have no input signals, return empty
      if (!feedContext.title && feedContext.entryTitles.length === 0) {
        return {
          matchedCategoryIds: [],
          newCategorySuggestions: [],
          status: "no_input",
        };
      }

      const { createOpenAI } = await import("@ai-sdk/openai");
      const openai = createOpenAI({ apiKey });

      // Truncate titles to prevent token overflow (Comment 3)
      const truncatedTitles = feedContext.entryTitles
        .slice(0, 10)
        .map((t) => (t.length > 100 ? t.substring(0, 97) + "..." : t));

      const systemPrompt = `You are an expert at categorizing content for an RSS reader.
Your goal is to suggest relevant categories for a user's new RSS subscription.

CONTEXT:
Feed Title: ${feedContext.title.substring(0, 100)}
Feed Description: ${(feedContext.description || "N/A").substring(0, 300)}
Site URL: ${feedContext.siteUrl || "N/A"}
Feed XML Categories: ${feedContext.feedCategories.join(", ").substring(0, 200) || "N/A"}
Recent Article Titles:
${truncatedTitles.map((t) => `- ${t}`).join("\n")}

USER'S EXISTING CATEGORIES:
${userCategories.map((c) => `- [${c.id}] ${c.name}`).join("\n")}

INSTRUCTIONS:
1. Match the feed to existing categories when possible.
2. Suggest up to 3 brand new category names if they are significantly different from existing ones.
3. Return a confidence score (0-1) for each.
4. ONLY return suggestions with a confidence score of 0.85 or higher.
5. Prefer existing categories over new ones.
6. New category suggestions should be concise (1-3 words).`;

      const { object } = await generateObject({
        model: openai("gpt-4o-mini"),
        schema: z.object({
          existingMatches: z
            .array(
              z.object({
                categoryId: z
                  .number()
                  .describe("The ID of the existing category"),
                confidence: z
                  .number()
                  .min(0)
                  .max(1)
                  .describe("Confidence score from 0 to 1"),
              })
            )
            .describe("Matching categories from the user's list"),
          newSuggestions: z
            .array(
              z.object({
                name: z.string().describe("Suggested name for a new category"),
                confidence: z
                  .number()
                  .min(0)
                  .max(1)
                  .describe("Confidence score from 0 to 1"),
              })
            )
            .describe("Highly relevant new category names"),
        }),
        prompt:
          "Based on the provided context, suggest relevant categories for this RSS feed.",
        system: systemPrompt,
        // Enable Sentry AI SDK telemetry for automatic span tracking
        // Captures token usage, model info, latency, and errors
        experimental_telemetry: {
          isEnabled: true,
          functionId: "ai.suggestCategories",
          recordInputs: true, // Safe: only captures feed metadata, not user PII
          recordOutputs: true, // Captures structured category suggestions
        },
      });

      // Filter by confidence threshold (85%)
      const existingCategoryIds = new Set(userCategories.map((c) => c.id));
      const matchedCategoryIds = object.existingMatches
        .filter(
          (m) => m.confidence >= 0.85 && existingCategoryIds.has(m.categoryId) // Validate returned IDs (Comment 8)
        )
        .map((m) => m.categoryId);

      const newCategorySuggestions = object.newSuggestions
        .filter((s) => s.confidence >= 0.85)
        .map((s) => s.name)
        .slice(0, 3); // Max 3 new ones

      return {
        matchedCategoryIds,
        newCategorySuggestions,
        status: "success",
      };
    } catch (error) {
      console.error("[AI] Category suggestion failed:", error);
      Sentry.captureException(error, {
        tags: { flow: "ai_category_suggestion" },
        extra: { feedTitle: feedContext.title },
      });
      return {
        matchedCategoryIds: [],
        newCategorySuggestions: [],
        status: "fail", // Improved error reporting (Comment 7)
      };
    }
  });
}
