import * as Log from "next/dist/build/output/log";
import { isAPIRoute } from "next/dist/lib/is-api-route";
import { isDynamicRoute } from "next/dist/shared/lib/router/utils/is-dynamic";
import { WebSocket, WebSocketServer } from "ws";

import type http from "http";
import type NextNodeServer from "next/dist/server/next-server";
import type { Params } from "next/dist/shared/lib/router/utils/route-matcher";
import type * as stream from "stream";
import type { Compiler, WebpackPluginInstance } from "webpack";

// Map open sockets to a page path
const openSocketsMap = new Map<string, Set<stream.Duplex>>();

class WebpackNextWebSocketPlugin implements WebpackPluginInstance {
  apply(compiler: Compiler) {
    compiler.hooks.afterEmit.tap(
      "WebpackNextWebSocketPlugin",
      (compilation) => {
        for (const entry of compilation.entries.keys()) {
          // Map the entry to a page relative URL. We should maybe use a more
          // Next.js native process for doing this at some point
          const key = entry.replace(/^pages(?=\/)/, "");

          // Find the sockets for this key
          const sockets = openSocketsMap.get(key);

          // If there are open sockets, close them
          if (sockets && sockets.size > 0) {
            sockets.forEach((socket) => socket.end());
            Log.event(
              `refresh of ${key} closed ${sockets.size} open ${
                sockets.size === 1 ? "websocket" : "websockets"
              }`
            );
          }
        }
      }
    );
  }
}

export type NextWebSocketHandler = (
  client: WebSocket,
  req: http.IncomingMessage
) => void;

function hookNextNodeServer(this: NextNodeServer) {
  // We need a server instance to bind the websocket handler to
  const server = this.serverOptions.httpServer;
  if (!server) {
    Log.error("failed to load websocket plugin, no HTTP server provided");
    return;
  }

  Log.ready("loaded websocket plugin successfully");

  const wss = new WebSocketServer({ noServer: true });

  server.on("upgrade", async (req, socket, head) => {
    // Parse the request URL
    const url = new URL(req.url ?? "", "http://n");

    // Ignore webpack dev server and other next-related requests
    if (url.pathname.startsWith("/_next")) return;

    // Attempt to match the URL (potentially dynamic) to a page. This is copied
    // straight over from the Next.js codebase that handles this same thing. A
    // better abstraction might be nice for this at some point
    let page = url.pathname;
    let params: Params | undefined = undefined;
    let isPageFound = !isDynamicRoute(page) && (await this.hasPage(page));
    if (!isPageFound && this.dynamicRoutes) {
      for (const dynamicRoute of this.dynamicRoutes) {
        params = dynamicRoute.match(url.pathname) || undefined;
        if (isAPIRoute(dynamicRoute.page) && params) {
          page = dynamicRoute.page;
          isPageFound = true;
          break;
        }
      }
    }
    if (!isPageFound) return false;

    // Ensure that the page gets built, if it exists
    await this.ensureApiPage(page);

    // Get the path of the built page. Will throw an error if the page doesn't
    // exist. This is fine to ignore, as it just falls into one of the many
    // other 404's that Next.js doesn't really do anything with
    let builtPagePath;
    try {
      builtPagePath = this.getPagePath(page);
    } catch (err) {
      return;
    }

    // Require the built page module when making this request
    const pageModule = await require(builtPagePath);

    // Ensure that the websocket handler callback exists on this page
    const handler = pageModule.socket as NextWebSocketHandler | undefined;
    if (!handler) return;

    // Call the provided websocket handler
    wss.handleUpgrade(req, socket, head, handler);

    // Add the socket to its map of open sockets
    if (this.serverOptions.dev) {
      const sockets =
        openSocketsMap.get(page) ??
        (() => {
          const set = new Set<stream.Duplex>();
          openSocketsMap.set(page, set);
          return set;
        })();

      sockets.add(socket);
      socket.once("close", () => sockets.delete(socket));
    }
  });
}

export {
  hookNextNodeServer as _hookNextNodeServer,
  WebpackNextWebSocketPlugin as _WebpackPlugin,
};
