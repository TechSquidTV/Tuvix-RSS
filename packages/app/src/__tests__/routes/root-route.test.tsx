import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockGetSession, mockCaptureException, mockSetUser } = vi.hoisted(
  () => ({
    mockGetSession: vi.fn(),
    mockCaptureException: vi.fn(),
    mockSetUser: vi.fn(),
  })
);

vi.mock("@/lib/auth-client", () => ({
  authClient: {
    getSession: mockGetSession,
  },
}));

vi.mock("@sentry/react", () => ({
  captureException: mockCaptureException,
  setUser: mockSetUser,
}));

const routeModule = await import("../../routes/__root");

describe("Root route beforeLoad", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns an empty session context when session fetch fails", async () => {
    const sessionError = new Error("Session unavailable");
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    mockGetSession.mockRejectedValue(sessionError);

    const result = await routeModule.Route.options.beforeLoad?.({} as never);

    expect(result).toEqual({
      auth: {
        session: null,
      },
    });
    expect(mockSetUser).toHaveBeenCalledWith(null);
    expect(mockCaptureException).toHaveBeenCalledWith(
      sessionError,
      expect.objectContaining({
        tags: {
          component: "root-route",
          operation: "session-fetch",
        },
        level: "warning",
      })
    );
    expect(warnSpy).toHaveBeenCalledWith(
      "[Root] Failed to fetch session at root level:",
      sessionError
    );

    warnSpy.mockRestore();
  });
});
