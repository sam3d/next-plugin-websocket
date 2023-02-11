import * as Log from "next/dist/build/output/log";
import { isAPIRoute } from "next/dist/lib/is-api-route";
import { isDynamicRoute } from "next/dist/shared/lib/router/utils/is-dynamic";
import { WebSocket, WebSocketServer } from "ws";

import type http from "http";
import type NextNodeServer from "next/dist/server/next-server";
import type { Params } from "next/dist/shared/lib/router/utils/route-matcher";
import type * as stream from "stream";
import type { Compiler, WebpackPluginInstance } from "webpack";

const openSockets = new Set<stream.Duplex>();

class WebpackNextWebSocketPlugin implements WebpackPluginInstance {
  apply(compiler: Compiler) {
    compiler.hooks.afterEmit.tap(
      "WebpackNextWebSocketPlugin",
      (compilation) => {
        for (const entry of compilation.entries.keys()) {
          if (entry.startsWith("pages/api/")) {
            const openSocketsCount = openSockets.size;

            if (openSocketsCount > 0) {
              openSockets.forEach((socket) => socket.end());
              Log.event(
                `refresh of ${entry} closed ${openSocketsCount} open ${
                  openSocketsCount === 1 ? "websocket" : "websockets"
                }`
              );
            }

            break;
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

    // Attempt to match the URL (potentially dynamic) to a page
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

    // Add the socket to a list of open sockets so that we can close them all of
    // the dev server reloads any file on the API
    //
    // TODO: Bind this to the specific route so that we only disconnect sockets
    // that depended on a specific route for that handler. This is not being
    // done right now because trying to resolve a connected socket to a dynamic
    // page path may be challenging
    if (this.serverOptions.dev) {
      openSockets.add(socket);
      socket.once("close", () => openSockets.delete(socket));
    }
  });
}

export {
  hookNextNodeServer as _hookNextNodeServer,
  WebpackNextWebSocketPlugin as _WebpackPlugin,
};
