# Testing Guide

This directory contains test utilities and helpers for the TuvixRSS API backend.

## Running Tests

```bash
# Run all tests
pnpm test

# Run tests in watch mode (for development)
pnpm test:watch

# Generate coverage report
pnpm test:coverage

# Open Vitest UI
pnpm test:ui
```

From the monorepo root:

```bash
# Run API tests
pnpm test:api

# Run all tests (API + App)
pnpm test
```

## Writing Tests

### Test File Structure

Place test files next to the code they test, using the `__tests__` directory pattern:

```
src/
  auth/
    __tests__/
      password.test.ts
    better-auth.ts
    password.ts
    security.ts
```

Or use the `.test.ts` suffix:

```
src/
  utils/
    color-generator.ts
    color-generator.test.ts
```

### Basic Test Example

```typescript
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createTestDb, cleanupTestDb, seedTestUser } from "@/test/setup";
import { someFunction } from "./your-module";

describe("someFunction", () => {
  let db: ReturnType<typeof createTestDb>;

  beforeEach(() => {
    db = createTestDb();
  });

  afterEach(() => {
    cleanupTestDb(db);
  });

  it("should do something", async () => {
    // Arrange
    const { user } = await seedTestUser(db);

    // Act
    const result = await someFunction(db, user.id);

    // Assert
    expect(result).toBeDefined();
    expect(result.id).toBe(user.id);
  });
});
```

### Using Test Utilities

#### Database Setup

```typescript
import {
  createTestDb,
  cleanupTestDb,
  seedTestUser,
  seedTestPlan,
} from "@/test/setup";

// Create in-memory test database
const db = createTestDb();

// Seed test data
const { user, plainPassword } = await seedTestUser(db, {
  username: "testuser",
  email: "test@example.com",
  role: "admin",
});

// Clean up after tests
cleanupTestDb(db);
```

#### Helpers

```typescript
import { generateTestEmail, expectError, mockConsole } from "@/test/helpers";

// Generate unique test data
const email = generateTestEmail("mytest");

// Assert errors
await expectError(async () => {
  await functionThatShouldThrow();
}, "Expected error message");

// Mock console output
const consoleMock = mockConsole();
// ... code that logs to console ...
consoleMock.restore();
```

#### Mocks

```typescript
import {
  mockFetchRssFeed,
  MOCK_RSS_FEED,
  MOCK_BETTER_AUTH_SECRET,
} from "@/test/mocks";

// Mock fetch for RSS feeds
global.fetch = mockFetchRssFeed();

// Use mock data
const response = await fetch("https://example.com/feed.xml");
const text = await response.text();
```

## Testing Patterns

### Unit Tests

Test individual functions in isolation:

```typescript
describe("calculatePasswordStrength", () => {
  it("should return weak for short passwords", () => {
    const result = calculatePasswordStrength("abc");
    expect(result.strength).toBe("weak");
    expect(result.score).toBeLessThan(40);
  });

  it("should return strong for complex passwords", () => {
    const result = calculatePasswordStrength("MyP@ssw0rd123!");
    expect(result.strength).toBe("strong");
    expect(result.score).toBeGreaterThan(80);
  });
});
```

### Integration Tests

Test multiple components working together:

```typescript
describe("User limits integration", () => {
  let db: ReturnType<typeof createTestDb>;

  beforeEach(async () => {
    db = createTestDb();
    await seedTestPlan(db, { id: "free", maxSources: 5 });
  });

  it("should enforce source limits", async () => {
    const { user } = await seedTestUser(db, { plan: "free" });

    // Create 5 sources (at limit)
    for (let i = 0; i < 5; i++) {
      const source = await seedTestSource(db, {
        url: `https://example.com/feed${i}.xml`,
      });
      await seedTestSubscription(db, user.id, source.id);
    }

    // Try to add one more (should fail)
    const limitCheck = await checkSourceLimit(db, user.id);
    expect(limitCheck.allowed).toBe(false);
  });
});
```

### Async Tests

Use `async/await` for asynchronous operations:

```typescript
it("should fetch and parse RSS feed", async () => {
  global.fetch = mockFetchRssFeed();

  const result = await fetchSingleFeed(1, "https://example.com/feed.xml", db);

  expect(result.articlesAdded).toBeGreaterThan(0);
});
```

### Error Cases

Always test error scenarios:

```typescript
it("should handle authentication errors", async () => {
  await expectError(() => someAuthFunction("invalid-input"), "UNAUTHORIZED");
});
```

## Coverage Guidelines

- Target: **70%** coverage for lines, functions, and branches
- Critical modules (auth, limits, db helpers) should aim for **90%+**
- Focus on business logic over boilerplate
- Don't test external libraries or frameworks

## Best Practices

1. **One assertion per test** (when possible) - makes failures easier to debug
2. **Use descriptive test names** - `it("should throw error when password is too short")`
3. **Follow AAA pattern** - Arrange, Act, Assert
4. **Clean up after tests** - use `beforeEach`/`afterEach` to reset state
5. **Mock external dependencies** - don't make real HTTP requests
6. **Test edge cases** - null values, empty arrays, boundary conditions
7. **Keep tests fast** - use in-memory databases, avoid sleeps
8. **Test behavior, not implementation** - test what the code does, not how it does it

## CI/CD Integration

Tests run automatically on:

- Pre-commit (via git hooks, if configured)
- Pull requests
- Main branch merges

Coverage reports are generated and should be reviewed regularly.
