import { useState } from "react";
import Constants from "expo-constants";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  httpBatchLink,
  loggerLink,
  unstable_httpSubscriptionLink,
  splitLink,
} from "@trpc/client";
import { createTRPCReact } from "@trpc/react-query";
import superjson from "superjson";

import type { AppRouter } from "@repo/api";
import { useLogto } from "@logto/rn";
import { logtoService } from "~/config/logto";
import "@azure/core-asynciterator-polyfill";
import { EventSourcePolyfill } from "event-source-polyfill";
import { RNEventSource } from "rn-eventsource-reborn";
import { ReadableStream, TransformStream } from "web-streams-polyfill";
import { Platform } from "react-native";

// RNEventSource extends EventSource's functionality, you can add this to make the typing reflect this but it's not a requirement
declare global {
  // eslint-disable-next-line @typescript-eslint/no-empty-interface
  interface EventSource extends RNEventSource {}
}

// @ts-expect-error - TransformStream is not yet in the globalThis
globalThis.EventSource =
  Platform.OS === "web"
    ? EventSourcePolyfill
    : globalThis.EventSource || RNEventSource;
globalThis.ReadableStream = globalThis.ReadableStream || ReadableStream;
globalThis.TransformStream = globalThis.TransformStream || TransformStream;

/**
 * A set of typesafe hooks for consuming your API.
 */
export const api = createTRPCReact<AppRouter>();
export { type RouterInputs, type RouterOutputs } from "@repo/api";

/**
 * Extend this function when going to production by
 * setting the baseUrl to your production API URL.
 */
const getBaseUrl = () => {
  /**
   * Gets the IP address of your host-machine. If it cannot automatically find it,
   * you'll have to manually set it. NOTE: Port 3000 should work for most but confirm
   * you don't have anything else running on it, or you'd have to change it.
   *
   * **NOTE**: This is only for development. In production, you'll want to set the
   * baseUrl to your production API URL.
   */
  const debuggerHost = Constants.expoConfig?.hostUri;
  const localhost = debuggerHost?.split(":")[0];

  if (!localhost) {
    return process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:5001";
  }
  return `http://${localhost}:5001`;
};

/**
 * A wrapper for your app that provides the TRPC context.
 * Use only in _app.tsx
 */
export function TRPCProvider(props: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());
  const { getAccessToken, signOut } = useLogto();
  const [trpcClient] = useState(() =>
    api.createClient({
      links: [
        loggerLink({
          enabled: (opts) =>
            process.env.NODE_ENV === "development" ||
            (opts.direction === "down" && opts.result instanceof Error),
          colorMode: "ansi",
        }),
        splitLink({
          condition: (op) => op.type === "subscription",
          true: unstable_httpSubscriptionLink({
            url: `${getBaseUrl()}/trpc`,
            eventSourceOptions: async () => {
              const headers = new Map<string, string>();
              headers.set("x-trpc-source", "expo-react");
              try {
                const token = `Bearer ${await getAccessToken(logtoService.config.resources[0])}`;
                headers.set("authorization", token);
                console.log(">>> token", token);
                return {
                  headers: Object.fromEntries(headers),
                };
              } catch (error) {
                await signOut();
                throw error;
              }
            },
            transformer: superjson,
          }),
          false: httpBatchLink({
            transformer: superjson,
            url: `${getBaseUrl()}/trpc`,
            headers: async function () {
              const headers = new Map<string, string>();
              headers.set("x-trpc-source", "expo-react");
              try {
                const token = `Bearer ${await getAccessToken(logtoService.config.resources[0])}`;
                headers.set("authorization", token);
                return Object.fromEntries(headers);
              } catch (error) {
                await signOut();
                throw error;
              }
            },
          }),
        }),
      ],
    }),
  );

  return (
    <api.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>
        {props.children}
      </QueryClientProvider>
    </api.Provider>
  );
}
