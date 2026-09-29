// Catch-all Pages Function: every request under /api/* is handed to the
// Hono app in _lib/app.ts. Splitting routing logic (Hono) from Pages'
// file-based entry point keeps app.ts testable/importable on its own.
// hono/cloudflare-pages's `handle()` is Hono's own adapter for exactly this
// EventContext -> Fetch handler shape, rather than hand-rolling one.
import { handle } from 'hono/cloudflare-pages'
import app from './_lib/app'

export const onRequest = handle(app)
