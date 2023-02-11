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

const handler: NextApiHandler = (req, res) => {
  res.status(405).end();
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

_TODO_
