import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import * as Sentry from "@sentry/react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertTriangle, CheckCircle2 } from "lucide-react";

export const Route = createFileRoute("/debug-sentry")({
  component: DebugSentryPage,
});

function DebugSentryPage() {
  const [lastError, setLastError] = useState<string | null>(null);
  const [lastSuccess, setLastSuccess] = useState<string | null>(null);

  const isSentryEnabled = !!import.meta.env.VITE_SENTRY_DSN;

  const triggerError = async () => {
    setLastError(null);
    setLastSuccess(null);
    try {
      throw new Error("Test Sentry Error - This is a test error for debugging");
    } catch (error) {
      const eventId = await Sentry.captureException(error);
      console.log("Sentry captureException called, event ID:", eventId);
      setLastError(
        `Error captured and sent to Sentry! Event ID: ${eventId || "unknown"}`
      );
    }
  };

  const triggerUnhandledError = () => {
    setLastError(null);
    setLastSuccess(null);
    // This will be caught by the global error handler in main.tsx
    console.log("Triggering unhandled error...");
    setTimeout(() => {
      const error = new Error(
        "Test Unhandled Error - This simulates an unhandled error"
      );
      console.log("Throwing unhandled error:", error);
      throw error;
    }, 100);
  };

  const triggerUnhandledRejection = () => {
    setLastError(null);
    setLastSuccess(null);
    // This will be caught by the unhandled rejection handler in main.tsx
    console.log("Triggering unhandled promise rejection...");
    const error = new Error("Test Unhandled Promise Rejection");
    Promise.reject(error).catch(() => {
      // Swallow the error to prevent console noise, but it should still be captured by Sentry
    });
  };

  const triggerTransaction = async () => {
    setLastError(null);
    setLastSuccess(null);
    await Sentry.startSpan(
      {
        op: "test",
        name: "Test Sentry Transaction",
      },
      async () => {
        await new Promise((resolve) => setTimeout(resolve, 500));
        setLastSuccess("Transaction created and sent to Sentry!");
      }
    );
  };

  const testBackendError = async () => {
    setLastError(null);
    setLastSuccess(null);
    try {
      const apiUrl = import.meta.env.VITE_API_URL || "http://localhost:3001";
      const response = await fetch(
        `${apiUrl.replace("/trpc", "")}/debug-sentry`
      );

      // Handle non-JSON responses (e.g., 404 HTML)
      const contentType = response.headers.get("content-type");
      if (!contentType?.includes("application/json")) {
        if (response.status === 404) {
          setLastError(
            "Backend debug endpoint not found. This endpoint is only available in Cloudflare Workers runtime."
          );
        } else {
          const text = await response.text();
          setLastError(
            `Backend returned non-JSON response (${response.status}): ${text.substring(0, 100)}`
          );
        }
        return;
      }

      const data = await response.json();

      if (response.ok) {
        setLastSuccess(
          `Backend test completed: ${data.message || JSON.stringify(data)}`
        );
      } else {
        // The endpoint returns 500 for test errors, which is expected
        // In Node.js, it will indicate Sentry is disabled
        const message = data.note
          ? `${data.message || data.error} (${data.note})`
          : `Backend test error captured! Event ID: ${data.eventId || "unknown"}, Message: ${data.message || data.error}`;
        setLastSuccess(message);
      }
    } catch (error) {
      // Handle JSON parsing errors
      if (error instanceof SyntaxError) {
        setLastError(
          "Backend returned invalid JSON. The endpoint may not be available in this runtime."
        );
      } else {
        setLastError(
          `Backend test error: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }
  };

  return (
    <div className="container mx-auto p-6 max-w-4xl">
      <Card>
        <CardHeader>
          <CardTitle>Sentry Debug Page</CardTitle>
          <CardDescription>
            Test Sentry error monitoring, performance tracing, and distributed
            tracing
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {!isSentryEnabled && (
            <Alert>
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Sentry Not Configured</AlertTitle>
              <AlertDescription>
                VITE_SENTRY_DSN is not set. Sentry features will not work. Set
                VITE_SENTRY_DSN in your environment to enable Sentry.
              </AlertDescription>
            </Alert>
          )}

          {isSentryEnabled && (
            <Alert>
              <CheckCircle2 className="h-4 w-4" />
              <AlertTitle>Sentry Enabled</AlertTitle>
              <AlertDescription>
                Sentry is configured and ready to capture errors and performance
                data.
              </AlertDescription>
            </Alert>
          )}

          <div className="space-y-4">
            <div>
              <h3 className="text-lg font-semibold mb-2">Error Testing</h3>
              <div className="flex flex-wrap gap-2">
                <Button onClick={triggerError} variant="destructive">
                  Trigger Handled Error
                </Button>
                <Button onClick={triggerUnhandledError} variant="destructive">
                  Trigger Unhandled Error
                </Button>
                <Button
                  onClick={triggerUnhandledRejection}
                  variant="destructive"
                >
                  Trigger Unhandled Rejection
                </Button>
              </div>
            </div>

            <div>
              <h3 className="text-lg font-semibold mb-2">
                Performance Testing
              </h3>
              <div className="flex flex-wrap gap-2">
                <Button onClick={triggerTransaction} variant="default">
                  Create Test Transaction
                </Button>
              </div>
            </div>

            <div>
              <h3 className="text-lg font-semibold mb-2">Backend Testing</h3>
              <div className="flex flex-wrap gap-2">
                <Button onClick={testBackendError} variant="outline">
                  Test Backend Sentry Route
                </Button>
              </div>
            </div>

            {lastError && (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>Error Triggered</AlertTitle>
                <AlertDescription>{lastError}</AlertDescription>
              </Alert>
            )}

            {lastSuccess && (
              <Alert>
                <CheckCircle2 className="h-4 w-4" />
                <AlertTitle>Success</AlertTitle>
                <AlertDescription>{lastSuccess}</AlertDescription>
              </Alert>
            )}

            <div className="mt-6 p-4 bg-muted rounded-lg">
              <h4 className="font-semibold mb-2">How to Verify</h4>
              <ol className="list-decimal list-inside space-y-1 text-sm">
                <li>Click any of the test buttons above</li>
                <li>
                  Check your Sentry dashboard at{" "}
                  <a
                    href="https://sentry.io"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary underline"
                  >
                    sentry.io
                  </a>
                </li>
                <li>
                  Look for new issues or transactions in your Sentry project
                </li>
                <li>
                  For distributed tracing, check that frontend transactions link
                  to backend spans
                </li>
              </ol>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
