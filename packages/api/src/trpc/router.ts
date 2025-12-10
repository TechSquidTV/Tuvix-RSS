/**
 * Root Application Router
 *
 * Combines all sub-routers into the main application router.
 * This type is exported to the frontend for end-to-end type safety.
 */

import { router } from "./init";
import { authRouter } from "@/routers/auth";
import { articlesRouter } from "@/routers/articles";
import { subscriptionsRouter } from "@/routers/subscriptions";
import { categoriesRouter } from "@/routers/categories";
import { feedsRouter } from "@/routers/feeds";
import { userSettingsRouter } from "@/routers/userSettings";
import { adminRouter } from "@/routers/admin";
import { plansRouter } from "@/routers/plans";

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
