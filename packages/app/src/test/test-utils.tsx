import { render, RenderOptions } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ReactElement, ReactNode } from "react";
import { trpc } from "@/lib/api/trpc";

// Create a fresh QueryClient for each test
export function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: 0,
      },
      mutations: {
        retry: false,
      },
    },
  });
}

// Mock tRPC client that returns undefined by default
// Tests can override this to provide specific mock responses
export function createMockTRPCClient() {
  return trpc.createClient({
    links: [],
  });
}

interface AllTheProvidersProps {
  children: ReactNode;
}

export function createWrapper() {
  const queryClient = createTestQueryClient();
  const trpcClient = createMockTRPCClient();

  function AllTheProviders({ children }: AllTheProvidersProps) {
    return (
      <trpc.Provider client={trpcClient} queryClient={queryClient}>
        <QueryClientProvider client={queryClient}>
          {children}
        </QueryClientProvider>
      </trpc.Provider>
    );
  }

  return AllTheProviders;
}

interface CustomRenderOptions extends Omit<RenderOptions, "wrapper"> {
  wrapper?: React.ComponentType<{ children: ReactNode }>;
}

export function renderWithProviders(
  ui: ReactElement,
  options?: CustomRenderOptions
) {
  const Wrapper = options?.wrapper || createWrapper();
  return render(ui, { wrapper: Wrapper, ...options });
}

// Re-export everything from React Testing Library
// eslint-disable-next-line react-refresh/only-export-components
export * from "@testing-library/react";
export { renderWithProviders as render };
