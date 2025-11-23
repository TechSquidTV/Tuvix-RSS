/**
 * Domain Checker Utility Tests
 *
 * Tests for domain extraction, normalization, and blocking checks
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  extractDomain,
  normalizeDomain,
  isDomainBlocked,
  getBlockedDomainReason,
  getBlockedDomains,
} from "../domain-checker";
import { createTestDb, cleanupTestDb, seedTestUser } from "@/test/setup";
import * as schema from "@/db/schema";

describe("extractDomain", () => {
  it("should extract domain from HTTP URL", () => {
    expect(extractDomain("http://example.com/feed")).toBe("example.com");
  });

  it("should extract domain from HTTPS URL", () => {
    expect(extractDomain("https://example.com/feed")).toBe("example.com");
  });

  it("should extract domain with subdomain", () => {
    expect(extractDomain("https://sub.example.com/feed")).toBe(
      "sub.example.com"
    );
  });

  it("should extract domain with port", () => {
    expect(extractDomain("https://example.com:8080/feed")).toBe("example.com");
  });

  it("should extract domain with path and query", () => {
    expect(extractDomain("https://example.com/blog/feed?category=tech")).toBe(
      "example.com"
    );
  });

  it("should return null for invalid URL", () => {
    expect(extractDomain("not-a-url")).toBeNull();
  });

  it("should handle URLs with www prefix", () => {
    expect(extractDomain("https://www.example.com/feed")).toBe(
      "www.example.com"
    );
  });
});

describe("normalizeDomain", () => {
  it("should convert to lowercase", () => {
    expect(normalizeDomain("EXAMPLE.COM")).toBe("example.com");
    expect(normalizeDomain("Example.Com")).toBe("example.com");
  });

  it("should remove www prefix", () => {
    expect(normalizeDomain("www.example.com")).toBe("example.com");
    expect(normalizeDomain("WWW.EXAMPLE.COM")).toBe("example.com");
  });

  it("should trim whitespace", () => {
    expect(normalizeDomain("  example.com  ")).toBe("example.com");
  });

  it("should handle domains with subdomains", () => {
    expect(normalizeDomain("sub.example.com")).toBe("sub.example.com");
    expect(normalizeDomain("www.sub.example.com")).toBe("sub.example.com");
  });

  it("should handle wildcard patterns", () => {
    expect(normalizeDomain("*.example.com")).toBe("*.example.com");
    expect(normalizeDomain("*.EXAMPLE.COM")).toBe("*.example.com");
  });
});

describe("isDomainBlocked", () => {
  describe("exact match blocking", () => {
    it("should block exact domain match", () => {
      const blockedDomains = ["example.com", "spam.net"];
      expect(isDomainBlocked("example.com", blockedDomains)).toBe(true);
      expect(isDomainBlocked("spam.net", blockedDomains)).toBe(true);
      expect(isDomainBlocked("other.com", blockedDomains)).toBe(false);
    });

    it("should block subdomains when parent is blocked", () => {
      const blockedDomains = ["example.com"];
      expect(isDomainBlocked("sub.example.com", blockedDomains)).toBe(true);
      expect(isDomainBlocked("www.example.com", blockedDomains)).toBe(true);
      expect(isDomainBlocked("deep.sub.example.com", blockedDomains)).toBe(
        true
      );
    });

    it("should not block parent domain when subdomain is blocked", () => {
      const blockedDomains = ["sub.example.com"];
      expect(isDomainBlocked("example.com", blockedDomains)).toBe(false);
    });
  });

  describe("wildcard pattern blocking", () => {
    it("should block subdomains with wildcard pattern", () => {
      const blockedDomains = ["*.example.com"];
      expect(isDomainBlocked("sub.example.com", blockedDomains)).toBe(true);
      expect(isDomainBlocked("anything.example.com", blockedDomains)).toBe(
        true
      );
      expect(isDomainBlocked("deep.sub.example.com", blockedDomains)).toBe(
        true
      );
    });

    it("should block exact match with wildcard pattern", () => {
      const blockedDomains = ["*.example.com"];
      expect(isDomainBlocked("example.com", blockedDomains)).toBe(true);
    });

    it("should not block unrelated domains with wildcard", () => {
      const blockedDomains = ["*.example.com"];
      expect(isDomainBlocked("other.com", blockedDomains)).toBe(false);
      expect(isDomainBlocked("example.net", blockedDomains)).toBe(false);
    });
  });

  describe("enterprise user bypass", () => {
    it("should not block domains for enterprise users", () => {
      const blockedDomains = ["example.com", "spam.net"];
      expect(isDomainBlocked("example.com", blockedDomains, "enterprise")).toBe(
        false
      );
      expect(isDomainBlocked("spam.net", blockedDomains, "enterprise")).toBe(
        false
      );
    });

    it("should block domains for non-enterprise users", () => {
      const blockedDomains = ["example.com"];
      expect(isDomainBlocked("example.com", blockedDomains, "free")).toBe(true);
      expect(isDomainBlocked("example.com", blockedDomains, "pro")).toBe(true);
    });

    it("should block domains when plan is undefined", () => {
      const blockedDomains = ["example.com"];
      expect(isDomainBlocked("example.com", blockedDomains)).toBe(true);
    });
  });

  describe("case insensitivity", () => {
    it("should handle case-insensitive domain matching", () => {
      const blockedDomains = ["EXAMPLE.COM"];
      expect(isDomainBlocked("example.com", blockedDomains)).toBe(true);
      expect(isDomainBlocked("Example.Com", blockedDomains)).toBe(true);
    });
  });
});

describe("getBlockedDomainReason", () => {
  it("should return blocked status and reason", () => {
    const blockedDomains = [
      { domain: "example.com", reason: "spam" },
      { domain: "spam.net", reason: null },
    ];

    const result1 = getBlockedDomainReason("example.com", blockedDomains);
    expect(result1.blocked).toBe(true);
    expect(result1.reason).toBe("spam");

    const result2 = getBlockedDomainReason("spam.net", blockedDomains);
    expect(result2.blocked).toBe(true);
    expect(result2.reason).toBeNull();
  });

  it("should return not blocked for non-blocked domains", () => {
    const blockedDomains = [{ domain: "example.com", reason: "spam" }];
    const result = getBlockedDomainReason("other.com", blockedDomains);
    expect(result.blocked).toBe(false);
    expect(result.reason).toBeNull();
  });

  it("should respect enterprise user bypass", () => {
    const blockedDomains = [{ domain: "example.com", reason: "spam" }];
    const result = getBlockedDomainReason(
      "example.com",
      blockedDomains,
      "enterprise"
    );
    expect(result.blocked).toBe(false);
    expect(result.reason).toBeNull();
  });

  it("should handle wildcard patterns", () => {
    const blockedDomains = [{ domain: "*.example.com", reason: "malware" }];
    const result = getBlockedDomainReason("sub.example.com", blockedDomains);
    expect(result.blocked).toBe(true);
    expect(result.reason).toBe("malware");
  });
});

describe("getBlockedDomains", () => {
  let db!: ReturnType<typeof createTestDb>;

  beforeEach(() => {
    db = createTestDb();
  });

  afterEach(() => {
    cleanupTestDb(db);
  });

  it("should return empty array when no domains are blocked", async () => {
    const result = await getBlockedDomains(db);
    expect(result).toEqual([]);
  });

  it("should return all blocked domains", async () => {
    const { user } = await seedTestUser(db, { role: "admin" });

    await db.insert(schema.blockedDomains).values([
      {
        domain: "example.com",
        reason: "spam",
        createdBy: user.id,
      },
      {
        domain: "spam.net",
        reason: null,
        createdBy: user.id,
      },
      {
        domain: "*.malware.org",
        reason: "malware",
        createdBy: user.id,
      },
    ]);

    const result = await getBlockedDomains(db);
    expect(result).toHaveLength(3);
    expect(result).toContainEqual({
      domain: "example.com",
      reason: "spam",
    });
    expect(result).toContainEqual({
      domain: "spam.net",
      reason: null,
    });
    expect(result).toContainEqual({
      domain: "*.malware.org",
      reason: "malware",
    });
  });

  it("should handle missing table gracefully (safe migration)", async () => {
    // Create a mock database that throws "no such table" error
    const mockDb = {
      select: () => ({
        from: () => {
          throw new Error("no such table: blocked_domains");
        },
      }),
    } as any;

    const result = await getBlockedDomains(mockDb);
    expect(result).toEqual([]);
  });

  it("should re-throw non-table errors", async () => {
    const mockDb = {
      select: () => ({
        from: () => {
          throw new Error("connection error");
        },
      }),
    } as any;

    await expect(getBlockedDomains(mockDb)).rejects.toThrow("connection error");
  });
});
