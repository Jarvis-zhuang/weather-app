import { QueryClient, isServer } from "@tanstack/react-query";

const MINUTE = 60_000;

export function makeQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // Weather changes slowly; 10 minutes keeps navigation instant without
        // hammering the upstream API.
        staleTime: 10 * MINUTE,
        gcTime: 30 * MINUTE,
        // Retrying a 4xx (bad query / unknown place) is pointless.
        retry: (failureCount, error) => {
          const status = (error as { status?: number }).status;
          if (typeof status === "number" && status >= 400 && status < 500) return false;
          return failureCount < 2;
        },
        refetchOnWindowFocus: false,
      },
    },
  });
}

let browserQueryClient: QueryClient | undefined;

/**
 * On the server we need a fresh client per request (no state leaking between
 * users); in the browser we keep one instance across re-renders.
 */
export function getQueryClient(): QueryClient {
  if (isServer) return makeQueryClient();
  browserQueryClient ??= makeQueryClient();
  return browserQueryClient;
}
