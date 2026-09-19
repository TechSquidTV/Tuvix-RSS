import { afterEach, expect, it, vi } from "vitest";
import { openArticleLink } from "../utils";

afterEach(() => vi.restoreAllMocks());

it.each([
  "javascript:alert(1)",
  "data:text/html,<script>alert(1)</script>",
  "file:///etc/passwd",
  "not a url",
  null,
])("does not open unsafe publisher link %s", (url) => {
  const open = vi.spyOn(window, "open").mockImplementation(() => null);
  openArticleLink(url);
  expect(open).not.toHaveBeenCalled();
});

it("opens HTTP publisher links without an opener", () => {
  const open = vi.spyOn(window, "open").mockImplementation(() => null);
  openArticleLink("https://example.com/article");
  expect(open).toHaveBeenCalledWith(
    "https://example.com/article",
    "_blank",
    "noopener,noreferrer"
  );
});
