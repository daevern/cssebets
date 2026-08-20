/**
 * Dev-only: force every `*.functions.ts` module into the SSR module graph.
 *
 * TanStack Start registers a server function's callable ID when the SSR
 * environment compiles the module that declares it. Routes rendered with
 * `ssr: false` (our landing/guest gate) never pull those modules through SSR,
 * so the very first client RPC fails with `Invalid server function ID` → 500.
 *
 * Eagerly importing them at dev server start-up registers all IDs up front.
 * This module is only imported behind `import.meta.env.DEV`, so production
 * bundles are unaffected.
 */
import.meta.glob("/src/**/*.functions.ts", { eager: true });

export {};
