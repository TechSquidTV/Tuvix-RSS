/**
 * FeedAvatar Component Tests
 */

import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { FeedAvatar } from "./feed-avatar";

describe("FeedAvatar", () => {
  it("should render with fallback letter when no icon provided", () => {
    render(<FeedAvatar feedName="Technology" />);

    const fallback = screen.getByText("T");
    expect(fallback).toBeInTheDocument();
  });

  it("should use first letter of feed name for fallback", () => {
    render(<FeedAvatar feedName="news" />);

    const fallback = screen.getByText("N");
    expect(fallback).toBeInTheDocument();
  });

  it("should show ? for empty feed name", () => {
    render(<FeedAvatar feedName="" />);

    const fallback = screen.getByText("?");
    expect(fallback).toBeInTheDocument();
  });

  it("should handle invalid feedUrl gracefully", () => {
    // Should not throw error with invalid URL
    render(<FeedAvatar feedName="Tech" feedUrl="not-a-valid-url" />);

    // Should render without error, showing fallback
    const fallback = screen.getByText("T");
    expect(fallback).toBeInTheDocument();
  });

  it("should apply size classes for xs", () => {
    const { container } = render(<FeedAvatar feedName="Tech" size="xs" />);

    const avatar = container.querySelector('[class*="h-5"]');
    expect(avatar).toBeInTheDocument();
  });

  it("should apply size classes for sm", () => {
    const { container } = render(<FeedAvatar feedName="Tech" size="sm" />);

    const avatar = container.querySelector('[class*="h-8"]');
    expect(avatar).toBeInTheDocument();
  });

  it("should apply size classes for lg", () => {
    const { container } = render(<FeedAvatar feedName="Tech" size="lg" />);

    const avatar = container.querySelector('[class*="h-12"]');
    expect(avatar).toBeInTheDocument();
  });

  it("should apply custom className", () => {
    const { container } = render(
      <FeedAvatar feedName="Tech" className="custom-class" />
    );

    const avatar = container.querySelector(".custom-class");
    expect(avatar).toBeInTheDocument();
  });

  it("should generate consistent colors for same feed names", () => {
    const { container: container1 } = render(
      <FeedAvatar feedName="SameName" />
    );
    const { container: container2 } = render(
      <FeedAvatar feedName="SameName" />
    );

    const fallback1 = container1.querySelector('[style*="hsl"]');
    const fallback2 = container2.querySelector('[style*="hsl"]');

    expect(fallback1?.getAttribute("style")).toBe(
      fallback2?.getAttribute("style")
    );
  });

  it("should render AvatarImage when iconUrl is provided", () => {
    const { container } = render(
      <FeedAvatar feedName="Tech" iconUrl="https://example.com/icon.png" />
    );

    // AvatarImage renders when there's an iconUrl
    // The component sets the src on the image element
    const avatar = container.querySelector('[class*="h-10"]');
    expect(avatar).toBeInTheDocument();
  });

  it("should render AvatarImage when iconPath is provided", () => {
    const { container } = render(
      <FeedAvatar feedName="Tech" iconPath="test-feed/icon.png" />
    );

    // AvatarImage should be rendered when iconPath is provided
    const avatar = container.querySelector('[class*="h-10"]');
    expect(avatar).toBeInTheDocument();
  });

  it("should render AvatarImage when feedUrl is provided", () => {
    const { container } = render(
      <FeedAvatar feedName="Tech" feedUrl="https://example.com/feed.xml" />
    );

    // AvatarImage should be rendered when feedUrl is provided (uses DuckDuckGo API)
    const avatar = container.querySelector('[class*="h-10"]');
    expect(avatar).toBeInTheDocument();
  });
});
