/**
 * Root Application Router
 *
 * Combines all sub-routers into the main application router.
 * This type is exported to the frontend for end-to-end type safety.
 */

import { router } from "./init";
import { authRouter } from "@api/routers/auth";
import { articlesRouter } from "@api/routers/articles";
import { subscriptionsRouter } from "@api/routers/subscriptions";
import { categoriesRouter } from "@api/routers/categories";
import { feedsRouter } from "@api/routers/feeds";
import { userSettingsRouter } from "@api/routers/userSettings";
import { adminRouter } from "@api/routers/admin";
import { plansRouter } from "@api/routers/plans";

export const appRouter = router({
  auth: authRouter,
  articles: articlesRouter,
  subscriptions: subscriptionsRouter,
  categories: categoriesRouter,
  feeds: feedsRouter,
  userSettings: userSettingsRouter,
  admin: adminRouter,
  plans: plansRouter,
});

// Export type for frontend
export type AppRouter = typeof appRouter;
