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
  return (
    <motion.div
      className={cn("flex flex-col gap-4", className)}
      initial={{ opacity: 0 }}
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
