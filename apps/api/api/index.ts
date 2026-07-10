import { createApp } from "../src/app.js";
import { loadConfig } from "../src/config.js";

// Vercel owns the HTTP server lifecycle. The same application factory is used
// by the local Node server and the serverless function so behavior cannot drift.
const app = createApp(loadConfig());

const fetchHandler = (request: Request) => app.fetch(request);

// Current Vercel Web handlers use named HTTP-method exports. A default export
// is treated as the legacy `(req, res) => void` signature and would ignore a
// returned Web Response.
export const GET = fetchHandler;
export const POST = fetchHandler;
export const OPTIONS = fetchHandler;
