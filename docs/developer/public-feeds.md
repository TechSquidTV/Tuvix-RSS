# Public Feeds

Comprehensive guide to TuvixRSS's public feeds feature - create custom RSS feeds by aggregating articles from your categories and share them with others.

## Table of Contents

- [Overview](#overview)
- [How It Works](#how-it-works)
- [User Workflows](#user-workflows)
- [Database Schema](#database-schema)
- [API Reference](#api-reference)
- [RSS Generation](#rss-generation)
- [Access Control & Security](#access-control--security)
- [Rate Limiting](#rate-limiting)
- [Plan Limits](#plan-limits)
- [Frontend Implementation](#frontend-implementation)
- [Public Access](#public-access)
- [Analytics & Monitoring](#analytics--monitoring)
- [Best Practices](#best-practices)
- [Troubleshooting](#troubleshooting)

---

## Overview

Public feeds allow users to create custom RSS 2.0 feeds by aggregating articles from their subscriptions and categories. These feeds can be shared publicly via unique URLs that anyone can subscribe to in their RSS reader.

### Key Features

- **Category-Based Aggregation**: Select specific categories to include in your feed
- **Custom Branding**: Give your feed a custom title, description, and URL slug
- **Public/Private Toggle**: Control feed visibility
- **RSS 2.0 Standard**: Compatible with all RSS readers
- **Plan-Based Limits**: Number of public feeds limited by subscription plan
- **Rate Limiting**: Prevent abuse while allowing anonymous access
- **Access Logging**: Track who accesses your feeds

### Use Cases

1. **Curated Content Sharing**: Share a curated collection of articles on specific topics
2. **Team Updates**: Create department-specific feeds for team members
3. **Public Newsletters**: Distribute content to subscribers via RSS
4. **Topic-Specific Feeds**: Separate tech news, politics, sports, etc. into different feeds
5. **Client Deliverables**: Create custom feeds for clients showing industry news

---

## How It Works

### Architecture Flow

```
┌─────────────────────────────────────────────────────────────┐
│ 1. User Creates Feed                                        │
│    - Selects categories to include                          │
│    - Sets title, slug, description                          │
│    - Marks as public/private                                │
└─────────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────┐
│ 2. Feed Configuration Stored                                │
│    - Feed metadata in feeds table                           │
│    - Category associations in feed_categories table         │
│    - Usage stats updated                                    │
└─────────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────┐
│ 3. Public URL Generated                                     │
│    - Format: /public/{username}/{slug}                      │
│    - No authentication required                             │
│    - Accessible by anyone with URL                          │
└─────────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────┐
│ 4. RSS Request Handled                                      │
│    - Rate limit checked (per feed owner)                    │
│    - Articles aggregated from selected categories           │
│    - RSS 2.0 XML generated                                  │
│    - Access logged for analytics                            │
└─────────────────────────────────────────────────────────────┘
```

### Data Flow

1. **Feed Definition**: User selects which categories to include in the feed
2. **Article Aggregation**: System finds all subscriptions linked to those categories
3. **Source Resolution**: Gets all RSS sources from those subscriptions
4. **Article Collection**: Retrieves latest 50 articles from those sources
5. **XML Generation**: Converts articles to RSS 2.0 XML format
6. **Delivery**: Serves XML with appropriate headers and rate limits

### Category Filtering Logic

```typescript
// If categories are specified
if (categoryIds.length > 0) {
  // Find subscriptions in these categories
  subscriptions = user.subscriptions.filter((sub) =>
    sub.categories.includes(categoryIds)
  );

  // Get articles from those subscription sources
  articles = getArticles(subscriptions.sources);
}
// If no categories specified
else {
  // Get ALL articles from ALL user subscriptions
  articles = getArticles(user.allSubscriptions.sources);
}
```

---

## User Workflows

### Creating a Public Feed

**Step 1: Navigate to Feeds Page**

- Click "Feeds" in the sidebar
- View existing feeds or create new one

**Step 2: Fill Out Form**

```
Title: "Tech News Digest"
Slug: "tech-news-digest"
Description: "Curated technology news from top sources"
Public: ✓ (checked)
Categories: [Technology, Programming] (optional)
```

**Step 3: Save Feed**

- Click "Create"
- Feed is immediately available at `/public/{username}/tech-news-digest`

**Step 4: Share URL**

- Copy the public URL
- Share with others or add to RSS reader

### Editing a Feed

**Update Metadata**:

- Change title, description, or slug
- Toggle public/private status
- Add/remove categories

**Important Notes**:

- Changing slug will break existing subscriptions
- Making feed private immediately hides it from public access
- Category changes take effect immediately

### Deleting a Feed

**Soft Delete**: Feed is removed but URL becomes a 404
**Cascade**: All feed-category associations are deleted automatically
**Usage Stats**: Public feed count decremented

---

## Database Schema

### Tables

#### feeds

Stores feed metadata and configuration.

```sql
CREATE TABLE feeds (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  slug TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  public INTEGER NOT NULL DEFAULT 1, -- Boolean: 1 = public, 0 = private
  created_at INTEGER NOT NULL,       -- Timestamp
  updated_at INTEGER NOT NULL,       -- Timestamp

  UNIQUE(user_id, slug)              -- Slug must be unique per user
);

CREATE INDEX idx_feeds_user_id ON feeds(user_id);
CREATE INDEX idx_feeds_slug ON feeds(slug);
```

**Fields**:

- `id`: Auto-incrementing primary key
- `user_id`: Owner of this feed
- `slug`: URL-friendly identifier (lowercase, hyphens only)
- `title`: Display name for the feed
- `description`: Optional description for RSS feed metadata
- `public`: Whether feed is publicly accessible
- `created_at`: When feed was created
- `updated_at`: Last modification time

**Constraints**:

- User can have multiple feeds with different slugs
- Slug must be unique per user (not globally unique)
- Cascade delete: Removing user removes all their feeds

#### feed_categories

Many-to-many junction table linking feeds to categories.

```sql
CREATE TABLE feed_categories (
  feed_id INTEGER NOT NULL REFERENCES feeds(id) ON DELETE CASCADE,
  category_id INTEGER NOT NULL REFERENCES categories(id) ON DELETE CASCADE,

  PRIMARY KEY (feed_id, category_id)
);

CREATE INDEX idx_feed_categories_feed_id ON feed_categories(feed_id);
CREATE INDEX idx_feed_categories_category_id ON feed_categories(category_id);
```

**Relationships**:

- One feed can include multiple categories
- One category can be included in multiple feeds
- Empty (no categories) = include all subscriptions

#### public_feed_access_log

Tracks every access to public feeds for analytics.

```sql
CREATE TABLE public_feed_access_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  feed_id INTEGER NOT NULL REFERENCES feeds(id) ON DELETE CASCADE,
  ip_address TEXT NOT NULL,
  user_agent TEXT,
  accessed_at INTEGER NOT NULL  -- Timestamp
);

CREATE INDEX idx_public_feed_access_log_feed_id ON public_feed_access_log(feed_id);
CREATE INDEX idx_public_feed_access_log_accessed_at ON public_feed_access_log(accessed_at);
```

**Purpose**: Analytics, abuse detection, popular feed identification

---

## API Reference

### List User's Feeds

**Endpoint**: `feeds.list`
**Auth**: Required
**Method**: Query

**Input**:

```typescript
{
  limit: number; // Default: 50, Max: 100
  offset: number; // Default: 0
}
```

**Output**:

```typescript
{
  items: Array<{
    id: number;
    userId: number;
    slug: string;
    title: string;
    description: string | null;
    public: boolean;
    categoryIds: number[];
    createdAt: Date;
    updatedAt: Date;
  }>;
  hasMore: boolean;
}
```

**Example**:

```typescript
const feeds = await client.feeds.list.query({ limit: 20, offset: 0 });

feeds.items.forEach((feed) => {
  console.log(`${feed.title}: /public/${username}/${feed.slug}`);
});
```

### Get Feed by ID

**Endpoint**: `feeds.getById`
**Auth**: Required (must own feed)
**Method**: Query

**Input**:

```typescript
{
  id: number;
}
```

**Output**:

```typescript
{
  id: number;
  userId: number;
  slug: string;
  title: string;
  description: string | null;
  public: boolean;
  categoryIds: number[];
  createdAt: Date;
  updatedAt: Date;
}
```

### Create Feed

**Endpoint**: `feeds.create`
**Auth**: Required
**Method**: Mutation

**Input**:

```typescript
{
  title: string;              // Required, min 1 char
  slug: string;               // Required, lowercase, hyphens only
  description?: string;       // Optional
  public?: boolean;           // Default: true
  categoryIds?: number[];     // Optional, empty = all categories
}
```

**Output**: Created feed object

**Validation**:

- Slug must match: `/^[a-z0-9]+(?:-[a-z0-9]+)*$/`
- Slug must be unique for this user
- Must not exceed plan's public feed limit

**Example**:

```typescript
const feed = await client.feeds.create.mutate({
  title: "Tech News",
  slug: "tech-news",
  description: "Latest technology articles",
  public: true,
  categoryIds: [1, 3, 5], // Technology, Programming, Science
});
```

**Errors**:

- `CONFLICT`: Slug already exists for this user
- `FORBIDDEN`: Public feed limit reached
- `BAD_REQUEST`: Invalid slug format

### Update Feed

**Endpoint**: `feeds.update`
**Auth**: Required (must own feed)
**Method**: Mutation

**Input**:

```typescript
{
  id: number;                 // Required
  title?: string;             // Optional update
  slug?: string;              // Optional update
  description?: string;       // Optional update
  public?: boolean;           // Optional update
  categoryIds?: number[];     // Optional update
}
```

**Output**: Updated feed object

**Important**:

- Changing slug breaks existing RSS subscriptions
- Changing from private to public checks limits
- Category changes take effect immediately
- All fields are optional (partial updates)

**Example**:

```typescript
// Just toggle public status
await client.feeds.update.mutate({
  id: 123,
  public: false,
});

// Update everything
await client.feeds.update.mutate({
  id: 123,
  title: "New Title",
  slug: "new-slug",
  description: "Updated description",
  public: true,
  categoryIds: [1, 2, 3],
});
```

### Delete Feed

**Endpoint**: `feeds.delete`
**Auth**: Required (must own feed)
**Method**: Mutation

**Input**:

```typescript
{
  id: number;
}
```

**Output**:

```typescript
{
  success: boolean;
}
```

**Side Effects**:

- Feed removed from database
- All feed_categories associations deleted (cascade)
- Public feed count decremented (if was public)
- Access logs retained for analytics

### Get Public RSS XML

**Endpoint**: `feeds.getPublicXml`
**Auth**: Not required (public endpoint)
**Method**: Query

**Input**:

```typescript
{
  username: string;
  slug: string;
}
```

**Output**: RSS 2.0 XML string

**Example**:

```typescript
const xml = await client.feeds.getPublicXml.query({
  username: "john",
  slug: "tech-news",
});
```

**Errors**:

- `NOT_FOUND`: User doesn't exist
- `NOT_FOUND`: Feed doesn't exist
- `NOT_FOUND`: Feed is private
- `TOO_MANY_REQUESTS`: Rate limit exceeded

**Note**: This endpoint is also exposed as HTTP GET at `/public/:username/:slug` for RSS reader compatibility.

---

## RSS Generation

### RSS 2.0 Format

TuvixRSS uses the `feedsmith` library to generate standards-compliant RSS 2.0 XML.

**Implementation**: `packages/api/src/services/xml-generator.ts`

### Feed Structure

```xml
<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Tech News Digest</title>
    <link>https://tuvix.app/public/john/tech-news</link>
    <description>Curated technology news from top sources</description>
    <language>en-us</language>
    <generator>TuvixRSS</generator>
    <pubDate>Mon, 15 Jan 2025 10:00:00 GMT</pubDate>

    <item>
      <title>Breaking: New AI Model Released</title>
      <link>https://example.com/article/ai-model</link>
      <description>Details about the new model...</description>
      <pubDate>Mon, 15 Jan 2025 09:00:00 GMT</pubDate>
      <guid isPermaLink="false">article-123-abc</guid>
      <author>[email protected]</author>
    </item>

    <!-- Up to 50 items -->

  </channel>
</rss>
```

### Channel Metadata

**Required Fields**:

- `title`: Feed title from database
- `link`: Public feed URL
- `description`: Feed description (or title if none)

**Optional Fields**:

- `language`: Default "en-us"
- `generator`: "TuvixRSS"
- `pubDate`: Most recent article's publish date

### Item Metadata

**Fields**:

- `title`: Article title
- `link`: Original article URL
- `description`: Article content/excerpt
- `pubDate`: When article was published
- `guid`: Unique identifier (not permalink)
- `author`: Article author (if available)

### Article Selection

**Query Logic**:

```typescript
// 1. Get feed configuration
const feed = await db.feeds.findBySlug(username, slug);

// 2. Get category filters
const categoryIds = await db.feedCategories.getCategoryIds(feed.id);

// 3. Find matching subscriptions
const subscriptions =
  categoryIds.length > 0
    ? await db.subscriptions.findByCategories(userId, categoryIds)
    : await db.subscriptions.findByUser(userId);

// 4. Get source IDs
const sourceIds = subscriptions.map((sub) => sub.sourceId);

// 5. Fetch articles
const articles = await db.articles
  .where({ sourceId: sourceIds })
  .orderBy("publishedAt", "DESC")
  .limit(50);
```

**Ordering**: Most recent first (by `publishedAt`)
**Limit**: 50 articles maximum
**Filtering**: Only articles from sources in selected categories

### XML Generation

```typescript
import { generateRSS } from "@/services/xml-generator";

const xml = generateRSS({
  title: feed.title,
  link: feedUrl,
  description: feed.description || feed.title,
  items: articles.map((article) => ({
    title: article.title,
    link: article.link || feedUrl,
    description: article.description,
    author: article.author,
    pubDate: article.publishedAt,
    guid: article.guid,
  })),
});
```

---

## Access Control & Security

### Public vs Private Feeds

**Public Feeds** (`public: true`):

- Accessible at `/public/:username/:slug`
- No authentication required
- Indexed by search engines
- Can be subscribed to by anyone
- Rate limited by owner's plan

**Private Feeds** (`public: false`):

- Not accessible via public URL
- Returns 404 even if you have the URL
- Useful for drafts or personal archives
- No rate limiting (not publicly accessible)

### Ownership Verification

**Authenticated Endpoints**: All feed management operations verify ownership

```typescript
// Automatically checks that feed.userId === ctx.user.userId
const feed = await requireOwnership(db, feeds, feedId, userId, "Feed");
```

**Public Endpoint**: No ownership check, but feed must be public

```typescript
if (!feed.public) {
  throw new TRPCError({
    code: "NOT_FOUND",
    message: "Feed not found", // Don't reveal it's private
  });
}
```

### Slug Uniqueness

**Per-User Uniqueness**: Slugs must be unique per user, not globally

```sql
UNIQUE(user_id, slug)
```

**Why**: Allows multiple users to have `/public/john/tech-news` and `/public/jane/tech-news`

**Validation**: Checked on create and update:

```typescript
const exists = await slugExists(db, feeds, userId, slug, excludeId);
if (exists) {
  throw new TRPCError({ code: "CONFLICT", message: "Slug already exists" });
}
```

### Security Best Practices

1. **No Authentication Leaking**: Private feeds return 404, not 403 (don't reveal existence)
2. **Rate Limiting**: Prevents abuse of public endpoints
3. **Access Logging**: Enables abuse detection and blocking
4. **Input Validation**: Slug format strictly enforced
5. **SQL Injection**: Drizzle ORM prevents SQL injection
6. **XSS Protection**: XML is properly escaped by feedsmith

---

## Rate Limiting

Public feeds are rate limited to prevent abuse while allowing anonymous access.

### How It Works

**Rate Limit Type**: Per-feed owner, not per requester
**Window**: Per minute
**Storage**: Cloudflare Workers rate limit bindings (production) or disabled (Docker Compose)

**Why per-owner?**:

- RSS readers don't authenticate
- Prevents abuse of any single user's feeds
- Each user's plan determines their feed's rate limit

### Limits by Plan

| Plan       | Public Feed Rate Limit |
| ---------- | ---------------------- |
| Free       | ~17 requests/minute    |
| Pro        | ~167 requests/minute   |
| Enterprise | ~1,667 requests/minute |
| Custom     | Admin-defined          |

Note: Limits are configured per-minute. Docker Compose deployments have no rate limiting.

### When Limit Exceeded

**Response**:

```http
HTTP/1.1 429 Too Many Requests

{
  "error": "Rate limit exceeded",
  "message": "This feed has been accessed too many times. Limit: 17 requests per minute.",
  "limit": 17
}
```

**RSS Readers**: Should wait before retrying requests.

### Admin Controls

**View Usage**:

```typescript
const status = await admin.getUserRateLimitStatus.query({ userId: 123 });
console.log(`Feed usage: ${status.feedUsagePercent}%`);
```

**Reset Limit**:

```typescript
await admin.resetUserRateLimit.mutate({ userId: 123, type: "publicFeed" });
```

See [Rate Limiting Guide](./rate-limiting.md) for complete documentation.

---

## Plan Limits

### Maximum Public Feeds

Users are limited in how many public feeds they can create based on their plan.

**Default Limits**:
| Plan | Max Public Feeds |
|------|------------------|
| Free | 3 |
| Pro | 10 |
| Enterprise | 50 |
| Custom | Admin-defined |

### Limit Enforcement

**On Create**:

```typescript
const limitCheck = await checkPublicFeedLimit(db, userId);
if (!limitCheck.allowed) {
  throw new TRPCError({
    code: "FORBIDDEN",
    message: `You have reached your limit of ${limitCheck.limit} public feeds`,
  });
}
```

**On Update** (private → public):

```typescript
if (!wasPublic && willBePublic) {
  const limitCheck = await checkPublicFeedLimit(db, userId);
  if (!limitCheck.allowed) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Limit reached" });
  }
}
```

### Usage Stats

**Tracking**: `usage_stats.public_feed_count`
**Updates**:

- Incremented when creating public feed
- Incremented when changing private → public
- Decremented when changing public → private
- Decremented when deleting public feed

**Example**:

```typescript
// Check current usage
const user = await admin.getUser.query({ userId: 123 });
console.log(
  `Public feeds: ${user.usage.publicFeedCount} / ${user.limits.maxPublicFeeds}`
);
```

### Custom Limits

Admins can override plan limits for specific users:

```typescript
await admin.setCustomLimits.mutate({
  userId: 123,
  maxPublicFeeds: 100,
  notes: "Beta tester - unlimited feeds",
});
```

---

## Frontend Implementation

### Feeds Page UI

**Location**: `packages/app/src/routes/app/feeds.tsx`

**Features**:

- List all user's feeds (public and private)
- Create new feed with form
- Toggle public/private status
- Copy public URL to clipboard
- Open feed in new tab
- Delete feeds with confirmation

### Component Structure

```tsx
function FeedsPage() {
  // Hooks
  const { data: feedsData, isLoading } = useFeeds();
  const createFeed = useCreateFeed();
  const updateFeed = useUpdateFeed();
  const deleteFeed = useDeleteFeed();

  // State
  const [showAddForm, setShowAddForm] = useState(false);
  const [formData, setFormData] = useState({
    title: "",
    slug: "",
    description: "",
    public: true,
  });

  return (
    <>
      {/* Header */}
      <h1>Public Feeds</h1>
      <Button onClick={() => setShowAddForm(true)}>Create Feed</Button>

      {/* Create Form */}
      {showAddForm && <CreateFeedForm />}

      {/* Feeds List */}
      {feeds.map((feed) => (
        <FeedCard
          key={feed.id}
          feed={feed}
          onTogglePublic={handleTogglePublic}
          onDelete={handleDelete}
          onCopyUrl={handleCopyUrl}
        />
      ))}
    </>
  );
}
```

### tRPC Hooks

**Implementation**: `packages/app/src/lib/hooks/useData.ts`

```typescript
// Fetch feeds
export const useFeeds = () => {
  return trpc.feeds.list.useQuery({ limit: 100, offset: 0 });
};

// Create feed
export const useCreateFeed = () => {
  const utils = trpc.useUtils();
  return trpc.feeds.create.useMutation({
    onSuccess: () => {
      utils.feeds.list.invalidate();
      toast.success("Feed created");
    },
  });
};

// Update feed
export const useUpdateFeed = () => {
  const utils = trpc.useUtils();
  return trpc.feeds.update.useMutation({
    onSuccess: () => {
      utils.feeds.invalidate();
      toast.success("Feed updated");
    },
  });
};

// Delete feed
export const useDeleteFeed = () => {
  const utils = trpc.useUtils();
  return trpc.feeds.delete.useMutation({
    onSuccess: () => {
      utils.feeds.list.invalidate();
      toast.success("Feed deleted");
    },
  });
};
```

### Form Validation

**Client-Side**:

```typescript
const handleSlugChange = (value: string) => {
  // Auto-format slug
  const formatted = value.toLowerCase().replace(/[^a-z0-9-]/g, "-");

  setFormData({ ...formData, slug: formatted });
};
```

**Server-Side**: Zod validation with `slugValidator`:

```typescript
export const slugValidator = z
  .string()
  .min(1)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Invalid slug format");
```

### URL Generation

```typescript
import { getPublicBaseUrl } from "@/lib/utils";

const handleCopyUrl = (username: string, slug: string) => {
  const url = `${getPublicBaseUrl()}/public/${username}/${slug}`;
  navigator.clipboard.writeText(url);
  toast.success("Feed URL copied to clipboard");
};
```

**Environment Configuration**:

- `VITE_PUBLIC_URL`: Optional environment variable for the public base URL (e.g., `https://app.example.com`)
- If not set, defaults to `window.location.origin` (works for development)
- Should match server-side `BASE_URL` for consistency

---

## Public Access

### HTTP Endpoints

Public feeds are accessible via two mechanisms:

1. **tRPC Endpoint** (programmatic):

   ```
   POST /trpc/feeds.getPublicXml
   ```

2. **HTTP GET Endpoint** (RSS readers):
   ```
   GET /public/:username/:slug
   ```

### Express.js Handler (Docker)

**Location**: `packages/api/src/adapters/express.ts`

```typescript
app.get("/public/:username/:slug", async (req, res) => {
  const { username, slug } = req.params;

  // 1. Find user by username (Better Auth uses user table, singular)
  const [user] = await db
    .select()
    .from(schema.user)
    .where(
      sql`COALESCE(${schema.user.username}, ${schema.user.name}) = ${username}`
    )
    .limit(1);

  if (!user) {
    return res.status(404).json({ error: "User not found" });
  }

  // 2. Check rate limit
  const rateLimitResult = await checkPublicFeedRateLimit(env, user.id, limits);

  // 3. Check rate limit (headers removed - rate limiting handled by Cloudflare Workers bindings)

  // 4. Check if allowed
  if (!rateLimitResult.allowed) {
    return res.status(429).json({ error: "Rate limit exceeded" });
  }

  // 5. Generate RSS XML
  const xml = await feeds.getPublicXml({ username, slug });

  // 6. Log access
  await db.publicFeedAccessLog.insert({
    feedId: feed.id,
    ipAddress: req.ip,
    userAgent: req.headers["user-agent"],
    accessedAt: new Date(),
  });

  // 7. Return XML
  res.set("Content-Type", "application/rss+xml; charset=utf-8");
  res.send(xml);
});
```

### Cloudflare Workers Handler

**Location**: `packages/api/src/adapters/cloudflare.ts`

Similar to Express handler but uses Cloudflare-specific APIs:

- `request.headers.get("cf-connecting-ip")` for IP address
- Returns `new Response(xml, { ... })` instead of Express `res.send()`

### Content-Type Header

```http
Content-Type: application/rss+xml; charset=utf-8
```

**Alternative**: `application/xml` or `text/xml` (also valid)

### CORS Headers

Public feeds include CORS headers to allow web-based RSS readers:

```http
Access-Control-Allow-Origin: *
Access-Control-Allow-Methods: GET
```

---

## Analytics & Monitoring

### Access Logging

Every public feed request is logged to `public_feed_access_log`:

```typescript
await db.insert(publicFeedAccessLog).values({
  feedId: feed.id,
  ipAddress: clientIP,
  userAgent: userAgent,
  accessedAt: new Date(),
});
```

**Non-Blocking**: Logging errors don't fail the request

### Admin Dashboard

**Location**: `/app/admin/rate-limits`

**Metrics Available**:

- Public feed access count (last 24 hours)
- Most accessed feeds
- Users approaching rate limits
- Access log with IP addresses and user agents

### Querying Access Logs

**Get access log for specific feed**:

```typescript
const log = await admin.getPublicFeedAccessLog.query({
  feedId: 123,
  limit: 50,
  offset: 0,
});

log.items.forEach((entry) => {
  console.log(`${entry.ipAddress} - ${entry.accessedAt}`);
});
```

**System-wide statistics**:

```typescript
const stats = await admin.getRateLimitStats.query();
console.log(
  `Total public feed access (24h): ${stats.totalPublicFeedAccessLast24h}`
);
```

### Popular Feed Identification

```sql
-- Most accessed feeds in last 7 days
SELECT
  f.id,
  f.slug,
  f.title,
  COALESCE(u.username, u.name) as username,
  COUNT(*) as access_count
FROM public_feed_access_log l
JOIN feeds f ON l.feed_id = f.id
JOIN user u ON f.user_id = u.id
WHERE l.accessed_at > datetime('now', '-7 days')
GROUP BY f.id
ORDER BY access_count DESC
LIMIT 10;
```

---

## Best Practices

### For Users

1. **Choose Descriptive Slugs**
   - Good: `tech-news`, `weekly-digest`, `ai-research`
   - Bad: `feed1`, `test`, `my-feed`

2. **Write Clear Descriptions**

   ```typescript
   // Good
   description: "Daily roundup of AI research papers from arXiv, Nature, and top ML conferences";

   // Bad
   description: "My feed";
   ```

3. **Use Categories Wisely**
   - Specific categories = focused feed
   - No categories = all your subscriptions
   - Too many categories = unfocused feed

4. **Don't Change Slugs**
   - Breaks existing RSS subscriptions
   - If you must, create new feed and deprecate old one

5. **Monitor Usage**
   - Check access logs occasionally
   - Upgrade plan if approaching limits

### For Developers

1. **Handle Rate Limit Errors**

   ```typescript
   // Rate limiting is handled automatically by Cloudflare Workers
   // No headers are returned - check HTTP status code
   const response = await fetch(`/public/${username}/${slug}`);

   if (response.status === 429) {
     const error = await response.json();
     console.warn(`Rate limit exceeded: ${error.message}`);
     // Wait before retrying (rate limit resets every minute)
   }
   ```

2. **Handle Errors Gracefully**

   ```typescript
   try {
     const xml = await fetch(`/public/${username}/${slug}`);
   } catch (error) {
     if (error.status === 429) {
       // Rate limit exceeded - wait before retrying
       await new Promise((resolve) => setTimeout(resolve, 60000)); // Wait 1 minute
     } else if (error.status === 404) {
       // Feed doesn't exist or is private
     }
   }
   ```

3. **Cache RSS Feeds**

   ```typescript
   // Don't fetch more than once per 5 minutes
   const CACHE_TTL = 5 * 60 * 1000;
   ```

4. **Validate XML**
   ```typescript
   // Ensure valid RSS 2.0 before parsing
   const parser = new DOMParser();
   const doc = parser.parseFromString(xml, "application/xml");
   const errors = doc.getElementsByTagName("parsererror");
   if (errors.length > 0) {
     throw new Error("Invalid RSS XML");
   }
   ```

### For Administrators

1. **Monitor Popular Feeds**
   - Identify high-traffic feeds
   - Ensure owners are on appropriate plans
   - Contact if approaching limits

2. **Review Access Patterns**

   ```typescript
   // Check for suspicious activity
   const stats = await admin.getRateLimitStats.query();
   stats.usersNearLimit.forEach((user) => {
     console.log(`${user.username}: ${user.feedUsagePercent}% of limit`);
   });
   ```

3. **Set Appropriate Limits**

   ```typescript
   // Personal blog: Free plan (1,000/hour)
   // Tech newsletter: Pro plan (10,000/hour)
   // Major publication: Enterprise (100,000/hour)
   ```

4. **Handle Abuse**

```sql
-- Find feeds with suspicious traffic patterns
SELECT
  f.id,
  f.slug,
  COALESCE(u.username, u.name) as username,
  COUNT(DISTINCT l.ip_address) as unique_ips,
  COUNT(*) as total_requests
FROM public_feed_access_log l
JOIN feeds f ON l.feed_id = f.id
JOIN user u ON f.user_id = u.id
WHERE l.accessed_at > datetime('now', '-1 hour')
GROUP BY f.id
HAVING unique_ips < 5 AND total_requests > 100
ORDER BY total_requests DESC;
```

---

## Troubleshooting

### Feed Not Found (404)

**Possible Causes**:

1. Feed doesn't exist
2. Feed is private
3. Username is incorrect
4. Slug is incorrect

**Diagnosis**:

```typescript
// Check if feed exists
const feed = await client.feeds.list.query();
console.log(feed.items.find((f) => f.slug === "tech-news"));

// Check if feed is public
console.log(`Public: ${feed.public}`);
```

**Solution**:

- Verify URL: `/public/{username}/{slug}`
- Check feed is marked as public
- Ensure slug matches exactly (case-sensitive)

### Rate Limit Exceeded

**Symptom**: 429 responses

**Diagnosis**:

```typescript
const status = await admin.getUserRateLimitStatus.query({ userId: 123 });
console.log(`Feed usage: ${status.feedCurrent} / ${status.feedLimit}`);
```

**Solutions**:

1. **Temporary Relief**:

   ```typescript
   await admin.resetUserRateLimit.mutate({ userId: 123, type: "publicFeed" });
   ```

2. **Upgrade Plan**:

   ```typescript
   await admin.changePlan.mutate({ userId: 123, plan: "pro" });
   ```

3. **Custom Limit**:
   ```typescript
   await admin.setCustomLimits.mutate({
     userId: 123,
     publicFeedRateLimitPerMinute: 833, // ~50000/hour = ~833/minute
   });
   ```

### Empty Feed (No Articles)

**Possible Causes**:

1. No categories selected and user has no subscriptions
2. Selected categories have no subscriptions
3. Subscriptions exist but no articles fetched yet

**Diagnosis**:

```typescript
// Check feed categories
const feed = await client.feeds.getById.query({ id: 123 });
console.log(`Categories: ${feed.categoryIds}`);

// Check subscriptions
const subs = await client.subscriptions.list.query();
console.log(`Total subscriptions: ${subs.items.length}`);

// Check if articles exist
// (Direct database query)
SELECT COUNT(*) FROM articles
WHERE source_id IN (
  SELECT source_id FROM subscriptions WHERE user_id = 123
);
```

**Solutions**:

- Wait for initial RSS fetch (cron job)
- Add subscriptions to selected categories
- Remove category filter (empty = all subscriptions)

### Slug Conflict

**Error**: "A feed with this slug already exists"

**Cause**: Slug is not unique for this user

**Solution**:

```typescript
// Try different slug
slug: "tech-news-2";
slug: "tech-news-digest";
slug: "my-tech-news";
```

### Can't Create More Feeds

**Error**: "You have reached your limit of X public feeds"

**Cause**: Plan limit reached

**Solutions**:

1. **Delete unused feeds**:

   ```typescript
   await client.feeds.delete.mutate({ id: oldFeedId });
   ```

2. **Make feeds private** (doesn't count toward limit):

   ```typescript
   await client.feeds.update.mutate({ id: feedId, public: false });
   ```

3. **Upgrade plan**:
   - Free → Pro: 3 → 10 feeds
   - Pro → Enterprise: 10 → 50 feeds

---

## Related Documentation

- **[Rate Limiting Guide](./rate-limiting.md)** - Complete rate limiting documentation
- **[Admin Guide](../admin/admin-guide.md)** - Admin API and user management
- **[Authentication Guide](./authentication.md)** - User authentication and plans
- **[tRPC API Architecture](../../trpc-api-architecture.md)** - Complete API reference
- **[Deployment Guide](../../deployment.md)** - Deployment setup

---

**Last Updated:** 2025-01-15
**Version:** 1.0.0
