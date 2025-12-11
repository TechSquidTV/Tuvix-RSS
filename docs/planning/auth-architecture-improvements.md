# Authentication Architecture Improvements

**Date**: 2025-12-10
**Status**: Problem 1 ✅ Resolved | Problem 2 Planning
**Priority**: High (Problem 2)

## Executive Summary

This document identifies architectural issues with the current authentication implementation and proposes solutions to improve consistency, type safety, and maintainability.

## Problems Identified

### Problem 1: Type Safety Issue - `as any` Type Assertion

**Location**: `packages/api/src/hono/app.ts:191`

```typescript
// Type assertion needed: @hono/trpc-server expects Context<any, string, {}>
// but Hono with custom Variables provides Context<{ Variables: Variables }, "/trpc/*", any>
// eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-explicit-any
c as any,
```

**Issue**:

- Using `as any` defeats TypeScript's type safety
- ESLint rules disabled to suppress warnings
- Type incompatibility between Hono's Context and @hono/trpc-server's expected type

**Root Cause**:
@hono/trpc-server v0.4.1 has stricter type requirements that don't account for Hono apps with custom `Variables` in the context.

**Risk Level**: Medium

- Code works at runtime
- Loses compile-time type safety
- Could hide future type errors

---

### Problem 2: Inconsistent Authentication Architecture

**Issue**: Email login bypasses tRPC, username login goes through tRPC

#### Current Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                         Frontend                             │
│                                                              │
│  useLogin() hook (useAuth.ts)                               │
│  ├─ if (input contains @)                                   │
│  │   └─ authClient.signIn.email() ──────────┐             │
│  │                                            │             │
│  └─ else                                      │             │
│      └─ authClient.signIn.username()         │             │
│         (calls Better Auth directly)         │             │
└─────────────────────────────────────────────┼──────────────┘
                                               │
                              ┌────────────────┴──────────────┐
                              │                               │
                              ▼                               ▼
                    ┌─────────────────┐          ┌────────────────────┐
                    │  Better Auth    │          │  tRPC (unused)     │
                    │  HTTP Endpoints │          │                    │
                    │                 │          │  auth.login()      │
                    │  /api/auth/     │          │  (only username)   │
                    │  sign-in/email  │          │                    │
                    │  sign-in/       │          │  Not used by       │
                    │  username       │          │  frontend!         │
                    └─────────────────┘          └────────────────────┘
```

#### Problems

1. **Duplication**:
   - Backend has tRPC `auth.login` endpoint (lines 429-678 in auth.ts)
   - Frontend bypasses it and calls Better Auth directly
   - tRPC endpoint is essentially dead code

2. **Inconsistency**:
   - Email login: Better Auth HTTP → No tRPC
   - Username login: Better Auth HTTP → No tRPC
   - Registration: Uses tRPC `auth.register` → Inconsistent!
   - Password reset: Uses tRPC `auth.requestPasswordReset` → Inconsistent!

3. **Loss of Type Safety**:
   - Direct Better Auth calls lose tRPC's end-to-end type safety
   - Frontend must cast responses as `AuthResult`
   - No compile-time guarantee about response shape

4. **Loss of Observability**:
   - Better Auth direct calls don't go through tRPC middleware
   - Missing Sentry tracing for auth operations
   - No unified logging format
   - Harder to debug auth issues

5. **Testing Complexity**:
   - Need to test both Better Auth HTTP endpoints AND tRPC endpoints
   - Can't use tRPC caller pattern for auth integration tests
   - Frontend mocks are more complex (mocking Better Auth client)

6. **Documentation Confusion**:
   - Docs show tRPC endpoints exist
   - Frontend doesn't actually use them
   - New developers might use wrong pattern

#### Why This Happened

Looking at the code history:

1. Initially, tRPC endpoints were primary auth method
2. Better Auth was integrated for session management
3. Frontend was updated to call Better Auth directly (simpler)
4. Backend tRPC endpoints were kept "for backward compatibility" (line 406 in docs)
5. **But nothing actually uses them anymore**

---

## Proposed Solutions

### Solution 1: Fix Type Safety ✅ **RESOLVED**

**Resolution Date**: 2025-12-10

**Approach Taken**: Created proper type bridge with documented adapter function

**What Was Implemented**:

1. **Created Type Helper**: `TRPCMiddleware<I extends Input>` type
   - Properly typed for Hono's Context with custom Variables
   - Generic over Input parameter to handle Hono's type inference
   - Clear JSDoc explaining the type incompatibility

2. **Created Adapter Function**: `adaptTRPCMiddleware<I extends Input>()`
   - Safely bridges @hono/trpc-server's generic types with our typed context
   - Comprehensive documentation explaining why the cast is safe
   - Explains covariance and runtime behavior

3. **Updated Implementation**:
   - Replaced raw `as any` cast with typed adapter
   - Added contextual comment at call site
   - Single eslint-disable with clear explanation (down from 2)

**Files Modified**:

- `packages/api/src/hono/app.ts` (lines 1-244)

**Benefits Achieved**:

- ✅ Type safety preserved (no blind `as any`)
- ✅ Clear documentation of why cast is necessary
- ✅ Maintainable solution (documented alternatives considered)
- ✅ All type checks pass
- ✅ All lints pass (1 targeted disable vs 2 broad disables)

**Why Not Other Options**:

❌ **Option A: Update @hono/trpc-server**

- Already on latest version (0.4.1)
- No newer versions with better types available

❌ **Option B: Generic Type Assertion**

- Would still require type cast
- Less clear documentation
- Chosen solution is more explicit

**Code Reference**:

```typescript
// Type helper to bridge Hono's typed Context with @hono/trpc-server
type TRPCMiddleware<I extends Input = Input> = (
  c: Context<{ Variables: Variables }, "/trpc/*", I>,
  next: Next,
) => ReturnType<ReturnType<typeof trpcServer>>;

// Adapter function with comprehensive documentation
function adaptTRPCMiddleware<I extends Input>(
  middleware: ReturnType<typeof trpcServer>,
): TRPCMiddleware<I> {
  // Safe cast - see JSDoc for full explanation
  return middleware as TRPCMiddleware<I>;
}

// Usage
const trpcMiddleware = adaptTRPCMiddleware(trpcServer({ ... }));
return trpcMiddleware(c, next);
```

**Lessons Learned**:

- Type incompatibilities with third-party libraries sometimes unavoidable
- Proper documentation makes necessary casts acceptable
- Generic type helpers provide better type safety than blind `any`
- Clear explanations in code more valuable than forcing imperfect abstractions

---

### Solution 2: Unify Authentication Architecture

#### Recommendation: Keep tRPC as Primary Auth Interface

**Rationale**:

1. TuvixRSS is a tRPC-based API - all other endpoints use tRPC
2. tRPC provides end-to-end type safety
3. Better observability through unified middleware
4. Simpler testing story
5. Consistent developer experience

#### Proposed Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                         Frontend                             │
│                                                              │
│  useLogin() hook (useAuth.ts)                               │
│  ├─ if (input contains @)                                   │
│  │   └─ trpc.auth.loginWithEmail.mutate() ───────┐        │
│  │                                                 │        │
│  └─ else                                           │        │
│      └─ trpc.auth.loginWithUsername.mutate()      │        │
│                                                    │        │
└────────────────────────────────────────────────────┼────────┘
                                                     │
                                                     ▼
                                          ┌────────────────────┐
                                          │  tRPC Router       │
                                          │                    │
                                          │  auth.loginWith    │
                                          │  Email()           │
                                          │  auth.loginWith    │
                                          │  Username()        │
                                          │  auth.register()   │
                                          │  auth.password*()  │
                                          │                    │
                                          │  Internal: calls   │
                                          │  Better Auth API   │
                                          └────────┬───────────┘
                                                   │
                                                   ▼
                                          ┌────────────────────┐
                                          │  Better Auth       │
                                          │  (Internal Only)   │
                                          │                    │
                                          │  signInEmail()     │
                                          │  signInUsername()  │
                                          └────────────────────┘
```

#### Implementation Plan

##### Phase 1: Add Missing tRPC Endpoints (Backend)

**File**: `packages/api/src/routers/auth.ts`

**Changes**:

1. Rename `login` → `loginWithUsername` (current behavior)
2. Add new `loginWithEmail` endpoint

```typescript
/**
 * Login with email and password
 * Uses Better Auth signIn.email
 */
loginWithEmail: publicProcedure
  .input(
    z.object({
      email: emailValidator,
      password: z.string(),
    })
  )
  .mutation(async ({ ctx, input }) => {
    return Sentry.startSpan(
      {
        name: "auth.login.email",
        op: "auth.signin",
        attributes: {
          "auth.method": "email_password",
          "auth.email": input.email,
        },
      },
      async (parentSpan) => {
        // Similar implementation to current login endpoint
        // but calls auth.api.signInEmail instead of signInUsername
      }
    );
  }),

/**
 * Login with username and password
 * Uses Better Auth signIn.username
 */
loginWithUsername: publicProcedure
  .input(
    z.object({
      username: usernameValidator,
      password: z.string(),
    })
  )
  .mutation(async ({ ctx, input }) => {
    // Current login implementation
  }),
```

3. Keep old `login` endpoint for backward compatibility (mark as deprecated)

```typescript
/**
 * @deprecated Use loginWithUsername or loginWithEmail instead
 * Legacy login endpoint - kept for backward compatibility
 */
login: publicProcedure
  .input(
    z.object({
      username: z.string(),
      password: z.string(),
    })
  )
  .mutation(async ({ ctx, input }) => {
    // Proxy to loginWithUsername for backward compatibility
    return authRouter.createCaller(ctx).loginWithUsername(input);
  }),
```

##### Phase 2: Update Frontend (Breaking Change)

**File**: `packages/app/src/lib/hooks/useAuth.ts`

**Changes**:

```typescript
export const useLogin = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  return trpc.auth.loginWithEmail.useMutation({
    onSuccess: async (data) => {
      // Invalidate session query to refetch user data
      await queryClient.invalidateQueries({ queryKey: ["session"] });
      navigate({ to: "/app/articles" });
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });
};

export const useLoginWithUsername = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  return trpc.auth.loginWithUsername.useMutation({
    onSuccess: async (data) => {
      await queryClient.invalidateQueries({ queryKey: ["session"] });
      navigate({ to: "/app/articles" });
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });
};

// Smart login hook that detects email vs username
export const useSmartLogin = () => {
  const loginWithEmail = useLogin();
  const loginWithUsername = useLoginWithUsername();

  return useMutation({
    mutationFn: async (input: { username: string; password: string }) => {
      // Auto-detect email vs username
      if (input.username.includes("@")) {
        return loginWithEmail.mutateAsync({
          email: input.username,
          password: input.password,
        });
      } else {
        return loginWithUsername.mutateAsync({
          username: input.username,
          password: input.password,
        });
      }
    },
  });
};
```

**Usage in Login Form**:

```typescript
// Simple usage - auto-detects email vs username
const login = useSmartLogin();

// Or explicit control
const loginWithEmail = useLogin();
const loginWithUsername = useLoginWithUsername();
```

##### Phase 3: Update Tests

**Changes needed**:

1. Update frontend tests to use tRPC mocks instead of Better Auth mocks
2. Backend tests already use tRPC caller (no changes needed)
3. Update integration tests to test new endpoints

##### Phase 4: Update Documentation

**Files to update**:

- `docs/developer/authentication.md` - Update architecture diagrams
- `packages/app/src/lib/hooks/useAuth.ts` - Update JSDoc comments
- `packages/api/src/routers/auth.ts` - Add deprecation notices

##### Phase 5: Remove Direct Better Auth Usage (Cleanup)

**After migration is complete**:

1. Remove direct Better Auth client usage from frontend
2. Keep Better Auth client only for session queries (`useSession`)
3. Update imports to use tRPC hooks exclusively

---

## Benefits of Unified Architecture

### 1. Type Safety

✅ **Before** (Lost):

```typescript
// Frontend loses type safety
const result = await authClient.signIn.email({ ... }) as AuthResult;
```

✅ **After** (Preserved):

```typescript
// Frontend has full type safety
const result = await trpc.auth.loginWithEmail.mutate({ ... });
// TypeScript knows exact response shape
```

### 2. Observability

✅ **Before** (Fragmented):

```
Better Auth direct calls → No Sentry tracing → Hard to debug
```

✅ **After** (Unified):

```
All auth → tRPC middleware → Sentry spans → Complete traces
```

### 3. Testing

✅ **Before** (Complex):

```typescript
// Frontend: Mock Better Auth client
vi.mock("@/lib/auth-client");

// Backend: Test tRPC endpoint (unused by frontend)
```

✅ **After** (Simple):

```typescript
// Frontend: Mock tRPC client
const mockTrpc = createMockTrpc();

// Backend: Same tests work (used by frontend)
```

### 4. Developer Experience

✅ **Before** (Confusing):

- "Why do we have tRPC auth endpoints if we don't use them?"
- "Should I use Better Auth directly or tRPC?"
- "Documentation shows tRPC but code uses Better Auth?"

✅ **After** (Clear):

- Single source of truth: tRPC
- Consistent patterns across entire API
- Documentation matches implementation

### 5. Maintainability

✅ **Before**:

- Changes require updating both Better Auth and tRPC code
- Need to keep two auth implementations in sync
- More code to maintain

✅ **After**:

- Single auth implementation (tRPC wraps Better Auth)
- Better Auth is an internal implementation detail
- Less code, clearer boundaries

---

## Migration Path

### Option A: Breaking Change (Recommended)

**Timeline**: Single sprint

**Steps**:

1. Implement new tRPC endpoints
2. Update frontend to use tRPC
3. Mark old patterns as deprecated
4. Remove Better Auth direct usage

**Breaking Change?**: Yes, but controlled

- Affects frontend auth implementation only
- Backend API remains compatible
- Session cookies still work
- Can be deployed atomically

**Pros**:

- Clean break, fresh start
- No technical debt
- Simplest end state

**Cons**:

- Requires coordination
- Frontend changes required

### Option B: Gradual Migration (Conservative)

**Timeline**: 2-3 sprints

**Steps**:

1. **Sprint 1**: Add new tRPC endpoints (no breaking changes)
2. **Sprint 2**: Update frontend to use new endpoints (keep old as fallback)
3. **Sprint 3**: Remove old patterns after validation period

**Breaking Change?**: No

**Pros**:

- Low risk
- Can be tested incrementally
- Easy rollback

**Cons**:

- More complex migration
- Temporary duplication
- Takes longer

---

## Decision Matrix

| Criteria              | Quick Type Fix    | Unified Auth Architecture |
| --------------------- | ----------------- | ------------------------- |
| **Complexity**        | Low               | Medium                    |
| **Risk**              | Low               | Medium                    |
| **Time to Implement** | 1 hour            | 1-2 days                  |
| **Long-term Value**   | Low               | High                      |
| **Breaking Changes**  | None              | Frontend only             |
| **Technical Debt**    | Adds (workaround) | Removes (cleanup)         |

---

## Recommendations

### Immediate (This PR)

1. ✅ **Fix type safety issue** - Try updating @hono/trpc-server first, fallback to typed context if needed
2. ✅ **Document the inconsistency** - Add TODO comments in code explaining the architectural issue
3. ✅ **Create this planning doc** - Document problems and proposed solutions

### Short Term (Next Sprint)

1. ✅ **Implement unified auth architecture** - Option A (breaking change)
   - Cleaner end state
   - Removes technical debt
   - Better developer experience

### Alternative (If breaking changes not acceptable)

1. ⚠️ **Keep current architecture** but add:
   - Better documentation explaining why Better Auth is called directly
   - Remove unused tRPC auth endpoints to reduce confusion
   - Update architecture docs to reflect actual implementation

---

## Open Questions

1. **Are there any external clients/apps using the tRPC auth endpoints?**
   - If yes → Need gradual migration
   - If no → Can do breaking change

2. **Do we want to expose Better Auth endpoints publicly at all?**
   - Currently exposed at `/api/auth/*`
   - Could restrict to tRPC-only access
   - Trade-off: flexibility vs. consistency

3. **Should we support both patterns long-term?**
   - Pros: Maximum flexibility
   - Cons: Complexity, confusion, technical debt

---

## Action Items

- [ ] Review this document with team
- [ ] Decide on migration approach (Option A vs B)
- [ ] Answer open questions
- [ ] Create implementation tickets
- [ ] Update architecture documentation

---

**Last Updated**: 2025-12-10
