/**
 * By default, Remix will handle hydrating your app on the client for you.
 * You are free to delete this file if you'd like to, but if you ever want it revealed again, you can run `npx remix reveal` ✨
 * For more information, see https://remix.run/file-conventions/entry.client
 */

import { RemixBrowser } from "@remix-run/react";
import { startTransition, StrictMode } from "react";
import { hydrateRoot } from "react-dom/client";

// If we're in development, we don't use strict mode because it can run some effects twice
// and we don't want that. We'll just use it in production.

startTransition(() => {
  if (process.env.NODE_ENV !== "production") {
    hydrateRoot(
      document,
      <RemixBrowser />
    );
    return;
  }
  hydrateRoot(
    document,
    <StrictMode>
      <RemixBrowser />
    </StrictMode>
  );
});
