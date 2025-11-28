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
  ImageIcon,
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
import { useState, useCallback, type MouseEvent } from "react";
import type { RouterOutputs } from "@/lib/api/trpc";
import { SwipeableItem } from "@/components/ui/swipeable-item";
import { FeedAvatar } from "@/components/app/feed-avatar";
import { ShareDropdown } from "@/components/app/share-dropdown";
import { AudioPlayer } from "@/components/app/audio-player";
import { getRelativeTime } from "@/lib/utils/date";

// Constants
const SWIPE_RESET_DELAY = 300;

// Get the actual article type from tRPC router output
type Article = RouterOutputs["articles"]["list"]["items"][number];

interface ArticleItemAudioProps {
  article: Article;
  className?: string;
}

export function ArticleItemAudio({
  article,
  className,
}: ArticleItemAudioProps) {
  const isMobile = useIsMobile();
  const markRead = useMarkArticleRead();
  const markUnread = useMarkArticleUnread();
  const saveArticle = useSaveArticle();
  const unsaveArticle = useUnsaveArticle();

  const [isDragging, setIsDragging] = useState(false);
  const [imageError, setImageError] = useState(false);

  // Use article state directly - mutations handle optimistic updates
  const isSaved = article.saved || false;
  const isRead = article.read || false;

  // Format published date for display
  const publishedAtString =
    typeof article.publishedAt === "string"
      ? article.publishedAt
      : article.publishedAt instanceof Date
        ? article.publishedAt.toISOString()
        : undefined;
  const formattedTime = getRelativeTime(publishedAtString);

  const handleRead = useCallback(
    (e: MouseEvent) => {
      e.stopPropagation();
      if (article.id) {
        if (isRead) {
          markUnread.mutate({ id: article.id });
        } else {
          markRead.mutate({ id: article.id });
        }
      }
    },
    [article.id, isRead, markRead, markUnread],
  );

  const handleSave = useCallback(
    (e: MouseEvent) => {
      e.stopPropagation();
      if (article.id) {
        if (isSaved) {
          unsaveArticle.mutate({ id: article.id });
        } else {
          saveArticle.mutate({ id: article.id });
        }
      }
    },
    [article.id, isSaved, saveArticle, unsaveArticle],
  );

  const handleOpenLink = useCallback(() => {
    if (article.link) {
      window.open(article.link, "_blank", "noopener,noreferrer");
    }
  }, [article.link]);

  const handleCardClick = useCallback(() => {
    // Only open link on mobile and if not dragging
    if (isMobile && !isDragging && article.link) {
      window.open(article.link, "_blank", "noopener,noreferrer");
    }
  }, [isMobile, isDragging, article.link]);

  const handleSwipe = useCallback(
    (action: "read" | "save") => {
      setIsDragging(true);
      if (!article.id) return;

      if (action === "read") {
        if (isRead) {
          markUnread.mutate({ id: article.id });
        } else {
          markRead.mutate({ id: article.id });
        }
      } else {
        if (isSaved) {
          unsaveArticle.mutate({ id: article.id });
        } else {
          saveArticle.mutate({ id: article.id });
        }
      }

      setTimeout(() => setIsDragging(false), SWIPE_RESET_DELAY);
    },
    [
      article.id,
      isRead,
      isSaved,
      markRead,
      markUnread,
      saveArticle,
      unsaveArticle,
    ],
  );

  const handleImageError = useCallback(() => {
    setImageError(true);
  }, []);

  return (
    <SwipeableItem
      onSwipeRight={() => handleSwipe("read")}
      onSwipeLeft={() => handleSwipe("save")}
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
          className,
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
            <time
              className="hidden sm:flex items-center gap-1"
              dateTime={publishedAtString}
            >
              <ClockIcon className="w-3.5 h-3.5" aria-hidden="true" />
              <span>{formattedTime}</span>
            </time>
          </div>
          <div className="flex items-center gap-2">
            <time
              className="flex sm:hidden items-center gap-1"
              dateTime={publishedAtString}
            >
              <ClockIcon className="w-3.5 h-3.5" aria-hidden="true" />
              <span>{formattedTime}</span>
            </time>
            {article.author && (
              <Badge variant="secondary" className="hidden sm:flex text-xs">
                {article.author}
              </Badge>
            )}
          </div>
        </ItemHeader>

        <ItemContent className="gap-4">
          {/* Audio article layout */}
          <div className={cn("flex gap-4", isMobile && "flex-col")}>
            {/* Content area */}
            <div className="flex-1 space-y-3">
              <ItemTitle className="w-full text-xl font-bold leading-tight group-hover:text-primary transition-colors line-clamp-2">
                {article.title || "Untitled Episode"}
              </ItemTitle>

              {/* Audio Player - prominent placement */}
              {article.audioUrl && article.id && (
                <div
                  className="py-2"
                  onClick={(e) => e.stopPropagation()}
                  role="region"
                  aria-label={`Audio player for ${article.title || "episode"}`}
                >
                  <AudioPlayer
                    audioUrl={article.audioUrl}
                    articleId={article.id}
                    title={article.title || undefined}
                    audioProgress={article.audioProgress ?? null}
                  />
                </div>
              )}

              {/* Description */}
              {article.description && (
                <ItemDescription className="text-muted-foreground line-clamp-2 leading-relaxed">
                  {article.description}
                </ItemDescription>
              )}
            </div>

            {/* Podcast artwork - fallback to source icon if no article image */}
            <div className="shrink-0" aria-label="Podcast artwork">
              {!imageError && (article.imageUrl || article.source?.iconUrl) ? (
                <img
                  src={article.imageUrl || article.source?.iconUrl || ""}
                  alt={`Artwork for ${article.title || "podcast episode"}`}
                  className={cn(
                    "object-cover rounded-lg",
                    isMobile ? "w-full h-48" : "w-32 h-32",
                  )}
                  onError={handleImageError}
                  loading="lazy"
                />
              ) : (
                <div
                  className={cn(
                    "flex items-center justify-center bg-muted rounded-lg",
                    isMobile ? "w-full h-48" : "w-32 h-32",
                  )}
                  aria-hidden="true"
                >
                  <ImageIcon className="w-8 h-8 text-muted-foreground" />
                </div>
              )}
            </div>
          </div>
        </ItemContent>

        {/* Footer with actions */}
        <ItemFooter
          className={cn(
            "flex items-center pt-3 border-t",
            isMobile ? "flex-col gap-2" : "justify-between",
          )}
        >
          <div
            className={cn(
              "flex items-center gap-2",
              isMobile && "w-full justify-between",
            )}
          >
            <Button
              variant="ghost"
              size="sm"
              className={cn(
                "h-8 gap-1.5",
                isMobile && "flex-1",
                isRead && "text-primary",
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
                isSaved && "text-primary",
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
