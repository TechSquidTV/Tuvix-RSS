import React from "react";
import { motion } from "motion/react";
import { cn } from "@/lib/utils";
import { ArticleItem } from "./article-item";
import type { RouterOutputs } from "@/lib/api/trpc";

type Article = RouterOutputs["articles"]["list"]["items"][number];

interface AnimatedArticleListProps {
  articles: Article[];
  newArticleIds?: Set<number>; // Kept for API compatibility, but not used
  children?: React.ReactNode; // For infinite scroll trigger
  className?: string;
}

export function AnimatedArticleList({
  articles,
  children,
  className,
}: AnimatedArticleListProps) {
  // Track if we've rendered articles before to detect initial appearance after skeleton
  const [hasRendered, setHasRendered] = React.useState(false);
  const isInitialAppearance = !hasRendered && articles.length > 0;

  React.useEffect(() => {
    if (articles.length > 0) {
      setHasRendered(true);
    }
  }, [articles.length]);

  return (
    <motion.div
      className={cn("flex flex-col gap-4", className)}
      initial={isInitialAppearance ? { opacity: 0 } : undefined}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3, ease: "easeOut" }}
    >
      {articles.map((article) => (
        <ArticleItem key={article.id} article={article} />
      ))}
      {children}
    </motion.div>
  );
}
