# next-plugin-websocket

Add WebSocket support to Next.js API routes

## Features

- **Hot reloading** - whenever an API route is modified, any TCP sockets open for that page will be automatically disconnected.

## Compatibility

- ✅ Next.js ^13 (with or without `appDir`)

## Installation

```sh
yarn add next-plugin-websocket
```

## Usage

Export a `socket` handler function from a Next.js API route. The first argument will be the WebSocket client and the second argument will be the original request object.

### Basic example

```ts
import { appRouter } from "@/server/routers/_app";
import { NextApiHandler } from "next";
import { NextWebSocketHandler } from "next-plugin-websocket";

export const socket: NextWebSocketHandler = (client, req) => {
  client.on("message", (msg) => {
    client.send(msg);
  });
};

const handler: NextApiHandler = async (req, res) => {
  res.send("Hello, world!");
};

export default handler;
```

### tRPC example

```ts
import { appRouter } from "@/server/routers/_app";
import { applyWSSHandler } from "@trpc/server/adapters/ws";
import { NextApiHandler } from "next";
import { NextWebSocketHandler } from "next-plugin-websocket";
import { WebSocketServer } from "ws";

export const socket: NextWebSocketHandler = (client, req) => {
  const wss = new WebSocketServer({ noServer: true });
  applyWSSHandler({ wss, router: appRouter });
  wss.emit("connection", client, req);
};

const handler: NextApiHandler = async (req, res) => {
  res.send("Hello, world!");
};

export default handler;
```

## Caveats

_TODO_
