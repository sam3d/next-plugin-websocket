# next-plugin-websocket

Add WebSocket support to Next.js API routes

## Features

- **Zero configuration** - Just install the package and you're good to go
- **Hot reloading** - Whenever an API route is modified, any open sockets will be automatically disconnected
- **URL routing** - The connection URL will get correctly mapped to the corresponding Next.js `/api` page

## Compatibility

- ✅ [Next.js 13](https://nextjs.org/blog/next-13)
- ✅ [The new `app` directory](https://beta.nextjs.org/docs/routing/fundamentals)
- ✅ [Standalone output mode](https://nextjs.org/docs/advanced-features/output-file-tracing)

## Installation

```sh
yarn add next-plugin-websocket
```

## Usage

Export a `socket` handler function from a Next.js API route. The first argument will be the `WebSocket` client instance and the second argument will be the original request object.

### Basic example (echo server)

```ts
import { NextApiHandler } from "next";
import { NextWebSocketHandler } from "next-plugin-websocket";

export const socket: NextWebSocketHandler = (client, req) => {
  console.log("Client connected");

  client.on("message", (msg) => {
    client.send(msg);
  });

  client.on("close", () => {
    console.log("Client disconnected");
  });
};

// You still need to expose a regular HTTP handler, even if you only intend to
// use this API route for WebSocket connections.
const handler: NextApiHandler = (req, res) => {
  res.status(426).send("Upgrade Required");
};

export default handler;
```

### tRPC example

```ts
import { appRouter } from "@/server/routers/_app";
import { createNextApiHandler } from "@trpc/server/adapters/next";
import { applyWSSHandler } from "@trpc/server/adapters/ws";
import { NextWebSocketHandler } from "next-plugin-websocket";
import { WebSocketServer } from "ws";

export const socket: NextWebSocketHandler = (client, req) => {
  const wss = new WebSocketServer({ noServer: true });
  applyWSSHandler({ wss, router: appRouter });
  wss.emit("connection", client, req);
};

export default createNextApiHandler({
  router: appRouter,
});
```

## Caveats

This plugin works by injecting a couple of micro-patches into the Next.js core in `node_modules`. It also uses a syntax tree parser to ensure that it ends up in exactly the right place, which makes it more resilient to changes over time. However, there are a couple of things to be aware of when using this module:

1. It may not work with every permutation of Next.js, as it relies on patching at install time and Next.js may change internals relied upon by the syntax parser / patch injection pipeline
2. Any node package manager that doesn't use a `node_modules` folder won't work, as that's how the patch is applied. This means no [Yarn PnP](https://yarnpkg.com/features/pnp) support (yet)
3. Because it still relies on having access to a HTTP server instance to bind the HTTP upgrade handler, it won't work in environments that take full control of how Next.js is deployed (i.e. it doesn't use the `server.js` file generated in the `standalone` output mode, or `next start`). This means that serverless environments might be hit or miss depending on whether or not they provide an instance of [`http.Server`](https://nodejs.org/api/http.html#class-httpserver) to Next.js
4. You still must expose a regular HTTP handler from an API route, even if you only intend to use the socket handler
