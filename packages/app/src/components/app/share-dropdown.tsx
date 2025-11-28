import { Share2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/animate-ui/components/radix/dropdown-menu";
import { trpc } from "@/lib/api/trpc";

interface ShareDropdownProps {
  url: string;
  title: string;
  size?: "sm" | "default" | "lg";
  variant?: "ghost" | "default" | "outline";
  className?: string;
}

// Check if native share is supported (outside component to avoid re-computation)
const canUseNativeShare =
  typeof navigator !== "undefined" && "share" in navigator;

export function ShareDropdown({
  url,
  title,
  size = "sm",
  variant = "ghost",
  className = "",
}: ShareDropdownProps) {
  const { data: settings } = trpc.userSettings.get.useQuery();

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(url);
    } catch (err) {
      console.error("Failed to copy link:", err);
    }
  };

  const handleNativeShare = async () => {
    try {
      await navigator.share({
        title,
        url,
      });
    } catch (err) {
      // User cancelled or share failed
      if ((err as Error).name !== "AbortError") {
        console.error("Failed to share:", err);
      }
    }
  };

  const handleEmailShare = () => {
    const subject = encodeURIComponent(title);
    const body = encodeURIComponent(`Check out this article: ${url}`);
    window.open(`mailto:?subject=${subject}&body=${body}`, "_blank");
  };

  const handleTwitterShare = () => {
    const text = encodeURIComponent(title);
    window.open(
      `https://twitter.com/intent/tweet?text=${text}&url=${encodeURIComponent(url)}`,
      "_blank",
      "noopener,noreferrer",
    );
  };

  const handleRedditShare = () => {
    window.open(
      `https://reddit.com/submit?url=${encodeURIComponent(url)}&title=${encodeURIComponent(title)}`,
      "_blank",
      "noopener,noreferrer",
    );
  };

  const handleHackernewsShare = () => {
    window.open(
      `https://news.ycombinator.com/submitlink?u=${encodeURIComponent(url)}&t=${encodeURIComponent(title)}`,
      "_blank",
      "noopener,noreferrer",
    );
  };

  const handleMastodonShare = () => {
    const text = encodeURIComponent(`${title} ${url}`);
    // Generic Mastodon share - user will need to enter their instance
    window.open(
      `https://mastodon.social/share?text=${text}`,
      "_blank",
      "noopener,noreferrer",
    );
  };

  const handleBlueskyShare = () => {
    const text = encodeURIComponent(`${title} ${url}`);
    window.open(
      `https://bsky.app/intent/compose?text=${text}`,
      "_blank",
      "noopener,noreferrer",
    );
  };

  // If settings haven't loaded yet, show a basic share button
  if (!settings) {
    return (
      <Button
        variant={variant}
        size={size}
        className={className}
        onClick={handleCopyLink}
      >
        <Share2Icon className="w-4 h-4" />
        <span className="text-xs">Share</span>
      </Button>
    );
  }

  // Count enabled share options
  const enabledOptions = [
    settings.shareEmail,
    settings.shareTwitter,
    settings.shareReddit,
    settings.shareHackernews,
    settings.shareMastodon,
    settings.shareBluesky,
  ].filter(Boolean).length;

  // If only copy link is available, just show a button
  if (enabledOptions === 0) {
    return (
      <Button
        variant={variant}
        size={size}
        className={className}
        onClick={handleCopyLink}
      >
        <Share2Icon className="w-4 h-4" />
        <span className="text-xs">Copy Link</span>
      </Button>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant={variant} size={size} className={className}>
          <Share2Icon className="w-4 h-4" />
          <span className="text-xs">Share</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={handleCopyLink}>Copy Link</DropdownMenuItem>
        {canUseNativeShare && (
          <DropdownMenuItem onClick={handleNativeShare}>
            Share...
          </DropdownMenuItem>
        )}
        {settings.shareEmail && (
          <DropdownMenuItem onClick={handleEmailShare}>Email</DropdownMenuItem>
        )}
        {settings.shareTwitter && (
          <DropdownMenuItem onClick={handleTwitterShare}>
            Twitter/X
          </DropdownMenuItem>
        )}
        {settings.shareReddit && (
          <DropdownMenuItem onClick={handleRedditShare}>
            Reddit
          </DropdownMenuItem>
        )}
        {settings.shareHackernews && (
          <DropdownMenuItem onClick={handleHackernewsShare}>
            Hacker News
          </DropdownMenuItem>
        )}
        {settings.shareMastodon && (
          <DropdownMenuItem onClick={handleMastodonShare}>
            Mastodon
          </DropdownMenuItem>
        )}
        {settings.shareBluesky && (
          <DropdownMenuItem onClick={handleBlueskyShare}>
            Bluesky
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
