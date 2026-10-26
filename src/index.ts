import { serve } from "bun";
import index from "./index.html";
import { api } from "./api";

const server = serve({
  routes: {
    "/*": index,
    "/api/*": api.fetch
  },

  development: process.env.NODE_ENV !== "production" && {
    hmr: true,
    console: true,
  },
});

console.log(`🚀 Server running at ${server.url}`);
