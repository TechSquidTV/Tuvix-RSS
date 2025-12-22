import { cn } from "@/lib/utils";
import {
  Item,
  ItemContent,
  ItemDescription,
  ItemFooter,
  ItemHeader,
  ItemTitle,
} from "@/components/ui/item";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  ExternalLinkIcon,
  EyeIcon,
  EyeOffIcon as LucideEyeOffIcon,
  ClockIcon,
  MessageSquare,
} from "lucide-react";
import { EyeOffIcon } from "@/components/ui/eye-off";
import { BookmarkIcon } from "@/components/ui/bookmark";
import { BookmarkFilledIcon } from "@/components/ui/bookmark-filled";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  useMarkArticleRead,
  useMarkArticleUnread,
  useSaveArticle,
  useUnsaveArticle,
} from "@/lib/hooks/useArticles";
import { useState, type MouseEvent } from "react";
import type { RouterOutputs } from "@/lib/api/trpc";
import { SwipeableItem } from "@/components/ui/swipeable-item";
import { FeedAvatar } from "@/components/app/feed-avatar";
import { ShareDropdown } from "@/components/app/share-dropdown";
import { ArticleItemAudio } from "@/components/app/article-item-audio";

// Get the actual article type from tRPC router output
type Article = RouterOutputs["articles"]["list"]["items"][number];

interface ArticleItemProps {
  article: Article;
  className?: string;
}

export function ArticleItem({ article, className }: ArticleItemProps) {
  // Call all hooks before any conditional returns (React rules)
  const isMobile = useIsMobile();
  const markRead = useMarkArticleRead();
  const markUnread = useMarkArticleUnread();
  const saveArticle = useSaveArticle();
  const unsaveArticle = useUnsaveArticle();

  // Local state for optimistic updates - initialize from article state
  const [isSaved, setIsSaved] = useState(article.saved || false);
  const [isRead, setIsRead] = useState(article.read || false);
  const [isDragging, setIsDragging] = useState(false);

  // Check if this is an audio article (after all hooks)
  if (article.audioUrl) {
    return <ArticleItemAudio article={article} className={className} />;
  }

  // Standard article layout
  const handleRead = (e: MouseEvent) => {
    e.stopPropagation();
    if (article.id) {
      if (isRead) {
        setIsRead(false);
        markUnread.mutate({ id: article.id });
      } else {
        setIsRead(true);
        markRead.mutate({ id: article.id });
      }
    }
  };

  const handleSave = (e: MouseEvent) => {
    e.stopPropagation();
    if (article.id) {
      if (isSaved) {
        setIsSaved(false);
        unsaveArticle.mutate({ id: article.id });
      } else {
        setIsSaved(true);
        saveArticle.mutate({ id: article.id });
      }
    }
  };

  const handleOpenLink = () => {
    if (article.link) {
      window.open(article.link, "_blank", "noopener,noreferrer");
    }
  };

  const handleCardClick = (e: MouseEvent) => {
    // Check if the click was on a link inside the description (e.g., HN comments)
    // Use closest() to handle clicks on link children (e.g., <a><strong>text</strong></a>)
    const target = e.target as HTMLElement | null;
    if (target?.closest) {
      const clickedLink = target.closest("a");
      if (clickedLink) {
        // Let the browser handle the link navigation naturally
        return;
      }
    }

    // Only open link on mobile and if not dragging
    if (isMobile && !isDragging && article.link) {
      window.open(article.link, "_blank", "noopener,noreferrer");
    }
  };

  // Format relative time

  const getRelativeTime = (dateString?: string) => {
    if (!dateString) return "Unknown";

    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return "Just now";
    if (diffMins < 60)
      return `${diffMins} minute${diffMins === 1 ? "" : "s"} ago`;
    if (diffHours < 24)
      return `${diffHours} hour${diffHours === 1 ? "" : "s"} ago`;
    if (diffDays < 7) return `${diffDays} day${diffDays === 1 ? "" : "s"} ago`;
    return date.toLocaleDateString();
  };

  return (
    <SwipeableItem
      onSwipeRight={() => {
        setIsDragging(true);
        if (article.id) {
          if (isRead) {
            setIsRead(false);
            markUnread.mutate({ id: article.id });
          } else {
            setIsRead(true);
            markRead.mutate({ id: article.id });
          }
        }
        // Reset dragging flag after a short delay
        setTimeout(() => setIsDragging(false), 300);
      }}
      onSwipeLeft={() => {
        setIsDragging(true);
        if (article.id) {
          setIsSaved(!isSaved);
          if (isSaved) {
            unsaveArticle.mutate({ id: article.id });
          } else {
            saveArticle.mutate({ id: article.id });
          }
        }
        // Reset dragging flag after a short delay
        setTimeout(() => setIsDragging(false), 300);
      }}
      rightIcon={
        isRead ? (
          <LucideEyeOffIcon className="size-6" />
        ) : (
          <EyeIcon className="size-6" />
        )
      }
      leftIcon={
        isSaved ? (
          <BookmarkFilledIcon size={24} className="size-6" />
        ) : (
          <BookmarkIcon size={24} className="size-6" />
        )
      }
      disabled={!isMobile}
    >
      <Item
        className={cn(
          "group bg-card text-card-foreground border border-border hover:bg-accent/50 transition-colors",
          isRead && "opacity-60",
          isMobile && "cursor-pointer",
          className
        )}
        onClick={handleCardClick}
      >
        {/* Header with source and time */}
        <ItemHeader className="flex items-center justify-between text-sm text-muted-foreground">
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5">
              <FeedAvatar
                feedName={article.source?.title || "Unknown Source"}
                iconUrl={article.source?.iconUrl}
                feedUrl={article.source?.url}
                size="xs"
              />
              <span className="font-medium text-foreground">
                {article.source?.title || "Unknown Source"}
              </span>
            </div>
            <span className="hidden sm:inline text-muted-foreground">•</span>
            <div className="hidden sm:flex items-center gap-1">
              <ClockIcon className="w-3.5 h-3.5" />
              <span>
                {getRelativeTime(
                  typeof article.publishedAt === "string"
                    ? article.publishedAt
                    : article.publishedAt instanceof Date
                      ? article.publishedAt.toISOString()
                      : undefined
                )}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex sm:hidden items-center gap-1">
              <ClockIcon className="w-3.5 h-3.5" />
              <span>
                {getRelativeTime(
                  typeof article.publishedAt === "string"
                    ? article.publishedAt
                    : article.publishedAt instanceof Date
                      ? article.publishedAt.toISOString()
                      : undefined
                )}
              </span>
            </div>
            {article.author && (
              <Badge variant="secondary" className="hidden sm:flex text-xs">
                {article.author}
              </Badge>
            )}
          </div>
        </ItemHeader>

        <ItemContent className="gap-4">
          {/* Main content area with title and description */}
          <div className={cn("flex gap-4", isMobile && "flex-col")}>
            <div className="flex-1 space-y-2">
              <ItemTitle className="w-full text-xl font-bold leading-tight group-hover:text-primary transition-colors line-clamp-2">
                {article.title || "Untitled Article"}
              </ItemTitle>
              {article.description && (
                <ItemDescription
                  className={cn(
                    "text-muted-foreground line-clamp-3 leading-relaxed",
                    // Mobile: Make links easier to tap with larger hit area (44px minimum touch target)
                    // Use only vertical padding to increase tap area without causing text overlap
                    "[&_a]:inline-block [&_a]:py-1.5",
                    // Desktop: Normal inline links
                    "sm:[&_a]:inline sm:[&_a]:py-0"
                  )}
                  // SECURITY: Safe to use dangerouslySetInnerHTML here because descriptions are
                  // sanitized at ingestion via sanitize-html library (packages/api/src/services/rss-fetcher.ts:689)
                  // Only safe HTML tags are allowed (links, formatting), dangerous content is stripped
                  dangerouslySetInnerHTML={{ __html: article.description }}
                />
              )}
            </div>
            {/* Article thumbnail image */}
            {article.imageUrl && (
              <div className="shrink-0">
                <img
                  src={article.imageUrl}
                  alt={article.title || "Article thumbnail"}
                  className={cn(
                    "object-cover rounded-lg",
                    isMobile ? "w-full h-48" : "w-32 h-32"
                  )}
                  onError={(e) => {
                    // Hide image if it fails to load
                    e.currentTarget.style.display = "none";
                  }}
                  loading="lazy"
                />
              </div>
            )}
          </div>
        </ItemContent>

        {/* Footer with actions */}
        <ItemFooter
          className={cn(
            "flex items-center pt-3 border-t",
            isMobile ? "flex-col gap-2" : "justify-between"
          )}
        >
          <div
            className={cn(
              "flex items-center gap-2",
              isMobile && "w-full justify-between"
            )}
          >
            <Button
              variant="ghost"
              size="sm"
              className={cn(
                "h-8 gap-1.5",
                isMobile && "flex-1",
                isRead && "text-primary"
              )}
              onClick={handleRead}
              disabled={markRead.isPending || markUnread.isPending}
            >
              {isRead ? (
                <EyeOffIcon size={16} className="w-4 h-4" />
              ) : (
                <EyeIcon className="w-4 h-4" />
              )}
              <span className="text-xs">
                {isRead ? "Mark Unread" : "Mark Read"}
              </span>
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className={cn(
                "h-8 gap-1.5",
                isMobile && "flex-1",
                isSaved && "text-primary"
              )}
              onClick={handleSave}
              disabled={saveArticle.isPending || unsaveArticle.isPending}
            >
              {isSaved ? (
                <BookmarkFilledIcon size={16} className="w-4 h-4" />
              ) : (
                <BookmarkIcon size={16} className="w-4 h-4" />
              )}
              <span className="text-xs">{isSaved ? "Saved" : "Save"}</span>
            </Button>
            <div onClick={(e) => e.stopPropagation()}>
              <ShareDropdown
                url={article.link || ""}
                title={article.title || ""}
                className={cn("h-8 gap-1.5", isMobile && "flex-1")}
              />
            </div>
            {article.commentLink && (
              <Button
                variant="ghost"
                size="sm"
                className={cn("h-8 gap-1.5", isMobile && "flex-1")}
                asChild
              >
                <a
                  href={article.commentLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  title="View Comments"
                >
                  <MessageSquare className="w-4 h-4" />
                  <span className="text-xs">Comments</span>
                </a>
              </Button>
            )}
          </div>
          {!isMobile && (
            <Button
              variant="ghost"
              size="sm"
              className="h-8 gap-1.5 text-muted-foreground hover:text-foreground"
              onClick={handleOpenLink}
            >
              <ExternalLinkIcon className="w-4 h-4" />
              <span className="text-xs">Open Link</span>
            </Button>
          )}
        </ItemFooter>
      </Item>
    </SwipeableItem>
  );
}
