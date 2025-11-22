/**
 * Database Client Tests
 */

import { describe, it, expect, afterEach, vi } from "vitest";
import { createDatabase } from "../client";
import type { Env } from "@/types";
import Database from "better-sqlite3";
import { existsSync, unlinkSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

describe("createDatabase", () => {
  const testDbPath = join(tmpdir(), `test-tuvix-${Date.now()}.db`);

  afterEach(() => {
    // Clean up test database files
    if (existsSync(testDbPath)) {
      try {
        unlinkSync(testDbPath);
      } catch {
        // Ignore cleanup errors
      }
    }
  });

  describe("Node.js runtime", () => {
    it("should create database with default path when DATABASE_PATH is not set", () => {
      const env: Env = {
        RUNTIME: "nodejs",
        BETTER_AUTH_SECRET: "test-secret",
      };

      const db = createDatabase(env);

      expect(db).toBeDefined();
      expect(db.$client).toBeDefined();
    });

    it("should create database with custom DATABASE_PATH", () => {
      const env: Env = {
        RUNTIME: "nodejs",
        DATABASE_PATH: testDbPath,
        BETTER_AUTH_SECRET: "test-secret",
      };

      const db = createDatabase(env);

      expect(db).toBeDefined();
      expect(db.$client).toBeDefined();
      expect(existsSync(testDbPath)).toBe(true);
    });

    it("should enable WAL mode for better concurrency", () => {
      const env: Env = {
        RUNTIME: "nodejs",
        DATABASE_PATH: testDbPath,
        BETTER_AUTH_SECRET: "test-secret",
      };

      const db = createDatabase(env);
      const sqlite = db.$client as Database.Database;

      // Check that WAL mode is enabled
      const journalMode = sqlite.prepare("PRAGMA journal_mode").get() as {
        journal_mode: string;
      };
      expect(journalMode.journal_mode.toLowerCase()).toBe("wal");
    });

    it("should enable foreign keys", () => {
      const env: Env = {
        RUNTIME: "nodejs",
        DATABASE_PATH: testDbPath,
        BETTER_AUTH_SECRET: "test-secret",
      };

      const db = createDatabase(env);
      const sqlite = db.$client as Database.Database;

      // Check that foreign keys are enabled
      const foreignKeys = sqlite.prepare("PRAGMA foreign_keys").get() as {
        foreign_keys: number;
      };
      expect(foreignKeys.foreign_keys).toBe(1);
    });

    it("should use nodejs runtime when RUNTIME is undefined", () => {
      const env: Env = {
        BETTER_AUTH_SECRET: "test-secret",
        // RUNTIME is undefined, should default to nodejs
      };

      const db = createDatabase(env);

      expect(db).toBeDefined();
      expect(db.$client).toBeDefined();
    });
  });

  describe("Cloudflare runtime", () => {
    it("should create database with D1 binding when DB is provided", () => {
      // Mock D1Database
      const mockD1: D1Database = {
        prepare: vi.fn(),
        batch: vi.fn(),
        exec: vi.fn(),
        dump: vi.fn(),
      } as unknown as D1Database;

      const env: Env = {
        RUNTIME: "cloudflare",
        DB: mockD1,
        BETTER_AUTH_SECRET: "test-secret",
      };

      const db = createDatabase(env);

      expect(db).toBeDefined();
      // Verify it's a drizzle database instance (has select, insert, etc.)
      expect(typeof db.select).toBe("function");
      expect(typeof db.insert).toBe("function");
    });

    it("should throw error when DB binding is missing", () => {
      const env: Env = {
        RUNTIME: "cloudflare",
        // DB is undefined
        BETTER_AUTH_SECRET: "test-secret",
      };

      expect(() => createDatabase(env)).toThrow(
        "D1 database binding (DB) not found"
      );
    });

    it("should throw error when DB is null", () => {
      const env: Env = {
        RUNTIME: "cloudflare",
        DB: null as unknown as D1Database,
        BETTER_AUTH_SECRET: "test-secret",
      };

      expect(() => createDatabase(env)).toThrow(
        "D1 database binding (DB) not found"
      );
    });
  });
});
