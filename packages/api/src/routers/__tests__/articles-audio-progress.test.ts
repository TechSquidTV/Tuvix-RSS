/**
 * Articles Router Audio Progress Tests
 *
 * Tests for podcast playback progress tracking functionality
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  createTestDb,
  cleanupTestDb,
  seedTestUser,
  seedTestSource,
  seedTestSubscription,
} from "@api/test/setup";
import * as schema from "@api/db/schema";
import { articlesRouter } from "../articles";
import { eq, and } from "drizzle-orm";

describe("Articles Router - Audio Progress", () => {
  let db!: NonNullable<ReturnType<typeof createTestDb>>;
  let testUser: { id: number };
  let testSource: { id: number };
  let testArticle: { id: number };

  beforeEach(async () => {
    db = createTestDb();
    const { user } = await seedTestUser(db);
    testUser = user;

    // Create test source
    testSource = await seedTestSource(db, {
      url: "https://example.com/podcast.xml",
      title: "Test Podcast",
    });

    // Create subscription
    await seedTestSubscription(db, testUser.id, testSource.id);

    // Create podcast article with audio
    const [article] = await db
      .insert(schema.articles)
      .values({
        sourceId: testSource.id,
        guid: `podcast-episode-${Date.now()}`,
        title: "Test Podcast Episode",
        description: "A test podcast episode",
        content: "Episode content",
        audioUrl: "https://example.com/podcast/episode1.mp3",
        publishedAt: new Date(),
      })
      .returning();
    testArticle = article;
  });

  afterEach(() => {
    cleanupTestDb(db);
  });

  /**
   * Helper to create tRPC caller
   */
  function createCaller() {
    return articlesRouter.createCaller({
      db,
      user: { userId: testUser.id, username: "testuser", role: "user" },
      env: {} as any,
      headers: {},
      req: {} as any,
    });
  }

  describe("updateAudioProgress", () => {
    it("should create new progress state when none exists", async () => {
      const caller = createCaller();

      const result = await caller.updateAudioProgress({
        articleId: testArticle.id,
        position: 120,
        duration: 3600,
      });

      expect(result.success).toBe(true);

      // Verify state was created
      const [state] = await db
        .select()
        .from(schema.userArticleStates)
        .where(
          and(
            eq(schema.userArticleStates.userId, testUser.id),
            eq(schema.userArticleStates.articleId, testArticle.id)
          )
        );

      expect(state).toBeDefined();
      expect(state.audioPosition).toBe(120);
      expect(state.audioDuration).toBe(3600);
      expect(state.audioLastPlayedAt).toBeDefined();
      expect(state.read).toBe(false);
      expect(state.saved).toBe(false);
    });

    it("should update existing progress without affecting read/saved flags", async () => {
      const caller = createCaller();

      // Create initial state with read=true
      await db.insert(schema.userArticleStates).values({
        userId: testUser.id,
        articleId: testArticle.id,
        read: true,
        saved: false,
        audioPosition: 60,
        audioDuration: 3600,
        audioLastPlayedAt: new Date(),
      });

      // Update progress
      await caller.updateAudioProgress({
        articleId: testArticle.id,
        position: 180,
        duration: 3600,
      });

      // Verify progress updated but read flag preserved
      const [state] = await db
        .select()
        .from(schema.userArticleStates)
        .where(
          and(
            eq(schema.userArticleStates.userId, testUser.id),
            eq(schema.userArticleStates.articleId, testArticle.id)
          )
        );

      expect(state.audioPosition).toBe(180);
      expect(state.read).toBe(true); // Should be preserved
      expect(state.saved).toBe(false);
    });

    it("should mark as completed when >95% watched", async () => {
      const caller = createCaller();

      // Update to 96% completion
      await caller.updateAudioProgress({
        articleId: testArticle.id,
        position: 3456, // 96% of 3600
        duration: 3600,
      });

      const [state] = await db
        .select()
        .from(schema.userArticleStates)
        .where(
          and(
            eq(schema.userArticleStates.userId, testUser.id),
            eq(schema.userArticleStates.articleId, testArticle.id)
          )
        );

      expect(state.audioCompletedAt).toBeDefined();
    });

    it("should mark as completed when within 30s of end", async () => {
      const caller = createCaller();

      // Update to 25 seconds before end
      await caller.updateAudioProgress({
        articleId: testArticle.id,
        position: 3575, // 25s before 3600
        duration: 3600,
      });

      const [state] = await db
        .select()
        .from(schema.userArticleStates)
        .where(
          and(
            eq(schema.userArticleStates.userId, testUser.id),
            eq(schema.userArticleStates.articleId, testArticle.id)
          )
        );

      expect(state.audioCompletedAt).toBeDefined();
    });

    it("should not mark as completed when <95% and >30s from end", async () => {
      const caller = createCaller();

      // Update to 50% completion
      await caller.updateAudioProgress({
        articleId: testArticle.id,
        position: 1800, // 50% of 3600
        duration: 3600,
      });

      const [state] = await db
        .select()
        .from(schema.userArticleStates)
        .where(
          and(
            eq(schema.userArticleStates.userId, testUser.id),
            eq(schema.userArticleStates.articleId, testArticle.id)
          )
        );

      expect(state.audioCompletedAt).toBeNull();
    });

    it("should preserve saved flag when updating progress", async () => {
      const caller = createCaller();

      // Create initial state with saved=true
      await db.insert(schema.userArticleStates).values({
        userId: testUser.id,
        articleId: testArticle.id,
        read: false,
        saved: true,
        audioPosition: 0,
      });

      // Update progress
      await caller.updateAudioProgress({
        articleId: testArticle.id,
        position: 300,
        duration: 3600,
      });

      const [state] = await db
        .select()
        .from(schema.userArticleStates)
        .where(
          and(
            eq(schema.userArticleStates.userId, testUser.id),
            eq(schema.userArticleStates.articleId, testArticle.id)
          )
        );

      expect(state.saved).toBe(true); // Should be preserved
      expect(state.audioPosition).toBe(300);
    });

    it("should cache duration on first update", async () => {
      const caller = createCaller();

      // First update with duration
      await caller.updateAudioProgress({
        articleId: testArticle.id,
        position: 100,
        duration: 3600,
      });

      // Second update without duration
      await caller.updateAudioProgress({
        articleId: testArticle.id,
        position: 200,
      });

      const [state] = await db
        .select()
        .from(schema.userArticleStates)
        .where(
          and(
            eq(schema.userArticleStates.userId, testUser.id),
            eq(schema.userArticleStates.articleId, testArticle.id)
          )
        );

      expect(state.audioDuration).toBe(3600); // Should be preserved
      expect(state.audioPosition).toBe(200);
    });
  });

  describe("markAudioCompleted", () => {
    it("should mark article as completed and read", async () => {
      const caller = createCaller();

      // Create initial progress
      await db.insert(schema.userArticleStates).values({
        userId: testUser.id,
        articleId: testArticle.id,
        read: false,
        saved: false,
        audioPosition: 3400,
        audioDuration: 3600,
      });

      // Mark as completed
      const result = await caller.markAudioCompleted({
        articleId: testArticle.id,
      });

      expect(result.success).toBe(true);

      const [state] = await db
        .select()
        .from(schema.userArticleStates)
        .where(
          and(
            eq(schema.userArticleStates.userId, testUser.id),
            eq(schema.userArticleStates.articleId, testArticle.id)
          )
        );

      expect(state.read).toBe(true);
      expect(state.audioCompletedAt).toBeDefined();
      expect(state.audioLastPlayedAt).toBeDefined();
    });

    it("should preserve saved flag when marking as completed", async () => {
      const caller = createCaller();

      // Create initial state with saved=true
      await db.insert(schema.userArticleStates).values({
        userId: testUser.id,
        articleId: testArticle.id,
        read: false,
        saved: true,
        audioPosition: 3400,
      });

      // Mark as completed
      await caller.markAudioCompleted({
        articleId: testArticle.id,
      });

      const [state] = await db
        .select()
        .from(schema.userArticleStates)
        .where(
          and(
            eq(schema.userArticleStates.userId, testUser.id),
            eq(schema.userArticleStates.articleId, testArticle.id)
          )
        );

      expect(state.saved).toBe(true); // Should be preserved
      expect(state.read).toBe(true);
    });

    it("should create state if none exists", async () => {
      const caller = createCaller();

      // Mark as completed without existing state
      const result = await caller.markAudioCompleted({
        articleId: testArticle.id,
      });

      expect(result.success).toBe(true);

      const [state] = await db
        .select()
        .from(schema.userArticleStates)
        .where(
          and(
            eq(schema.userArticleStates.userId, testUser.id),
            eq(schema.userArticleStates.articleId, testArticle.id)
          )
        );

      expect(state).toBeDefined();
      expect(state.read).toBe(true);
      expect(state.audioCompletedAt).toBeDefined();
    });
  });

  describe("clearAudioProgress", () => {
    it("should reset audio position and completion timestamp", async () => {
      const caller = createCaller();

      // Create state with progress
      await db.insert(schema.userArticleStates).values({
        userId: testUser.id,
        articleId: testArticle.id,
        read: false,
        saved: false,
        audioPosition: 1800,
        audioDuration: 3600,
        audioCompletedAt: new Date(),
        audioLastPlayedAt: new Date(),
      });

      // Clear progress
      const result = await caller.clearAudioProgress({
        articleId: testArticle.id,
      });

      expect(result.success).toBe(true);

      const [state] = await db
        .select()
        .from(schema.userArticleStates)
        .where(
          and(
            eq(schema.userArticleStates.userId, testUser.id),
            eq(schema.userArticleStates.articleId, testArticle.id)
          )
        );

      expect(state.audioPosition).toBe(0);
      expect(state.audioCompletedAt).toBeNull();
      expect(state.audioDuration).toBe(3600); // Duration preserved
    });

    it("should preserve read and saved flags", async () => {
      const caller = createCaller();

      // Create state with flags set
      await db.insert(schema.userArticleStates).values({
        userId: testUser.id,
        articleId: testArticle.id,
        read: true,
        saved: true,
        audioPosition: 1800,
        audioCompletedAt: new Date(),
      });

      // Clear progress
      await caller.clearAudioProgress({
        articleId: testArticle.id,
      });

      const [state] = await db
        .select()
        .from(schema.userArticleStates)
        .where(
          and(
            eq(schema.userArticleStates.userId, testUser.id),
            eq(schema.userArticleStates.articleId, testArticle.id)
          )
        );

      expect(state.read).toBe(true);
      expect(state.saved).toBe(true);
      expect(state.audioPosition).toBe(0);
    });

    it("should return success when no state exists", async () => {
      const caller = createCaller();

      const result = await caller.clearAudioProgress({
        articleId: testArticle.id,
      });

      expect(result.success).toBe(true);
    });
  });

  describe("Article list with audio progress", () => {
    it("should include audioProgress in article response", async () => {
      const caller = createCaller();

      // Create audio progress
      await db.insert(schema.userArticleStates).values({
        userId: testUser.id,
        articleId: testArticle.id,
        read: false,
        saved: false,
        audioPosition: 1200,
        audioDuration: 3600,
        audioLastPlayedAt: new Date(),
      });

      // Fetch articles
      const result = await caller.list({
        limit: 10,
        offset: 0,
      });

      const article = result.items.find((a) => a.id === testArticle.id);
      expect(article).toBeDefined();
      expect(article?.audioProgress).toBeDefined();
      expect(article?.audioProgress?.position).toBe(1200);
      expect(article?.audioProgress?.duration).toBe(3600);
    });

    it("should return null audioProgress when no progress exists", async () => {
      const caller = createCaller();

      // Fetch articles without creating progress
      const result = await caller.list({
        limit: 10,
        offset: 0,
      });

      const article = result.items.find((a) => a.id === testArticle.id);
      expect(article).toBeDefined();
      expect(article?.audioProgress).toBeNull();
    });

    it("should return null audioProgress when position is 0", async () => {
      const caller = createCaller();

      // Create state with position 0
      await db.insert(schema.userArticleStates).values({
        userId: testUser.id,
        articleId: testArticle.id,
        read: false,
        saved: false,
        audioPosition: 0,
      });

      // Fetch articles
      const result = await caller.list({
        limit: 10,
        offset: 0,
      });

      const article = result.items.find((a) => a.id === testArticle.id);
      expect(article).toBeDefined();
      expect(article?.audioProgress).toBeNull();
    });
  });

  describe("Integration with read/saved mutations", () => {
    it("should preserve audio progress when marking article as read", async () => {
      const caller = createCaller();

      // Create audio progress
      await db.insert(schema.userArticleStates).values({
        userId: testUser.id,
        articleId: testArticle.id,
        read: false,
        saved: false,
        audioPosition: 1500,
        audioDuration: 3600,
        audioLastPlayedAt: new Date(),
      });

      // Mark as read
      await caller.markRead({ id: testArticle.id });

      const [state] = await db
        .select()
        .from(schema.userArticleStates)
        .where(
          and(
            eq(schema.userArticleStates.userId, testUser.id),
            eq(schema.userArticleStates.articleId, testArticle.id)
          )
        );

      expect(state.read).toBe(true);
      expect(state.audioPosition).toBe(1500);
      expect(state.audioDuration).toBe(3600);
    });

    it("should preserve audio progress when saving article", async () => {
      const caller = createCaller();

      // Create audio progress
      await db.insert(schema.userArticleStates).values({
        userId: testUser.id,
        articleId: testArticle.id,
        read: false,
        saved: false,
        audioPosition: 2000,
        audioDuration: 3600,
        audioCompletedAt: new Date(),
      });

      // Save article
      await caller.save({ id: testArticle.id });

      const [state] = await db
        .select()
        .from(schema.userArticleStates)
        .where(
          and(
            eq(schema.userArticleStates.userId, testUser.id),
            eq(schema.userArticleStates.articleId, testArticle.id)
          )
        );

      expect(state.saved).toBe(true);
      expect(state.audioPosition).toBe(2000);
      expect(state.audioCompletedAt).toBeDefined();
    });
  });
});
