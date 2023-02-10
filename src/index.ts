import * as Log from "next/dist/build/output/log";
import { WebSocketServer } from "ws";

import type { NextConfig } from "next";
import type NextNodeServer from "next/dist/server/next-server";
import type * as stream from "stream";
import type { Compiler, WebpackPluginInstance } from "webpack";

const openSockets = new Set<stream.Duplex>();

class WebpackReloadSocketPlugin implements WebpackPluginInstance {
  apply(compiler: Compiler) {
    compiler.hooks.afterEmit.tap("WebpackReloadSocketPlugin", (compilation) => {
      for (const entry of compilation.entries.keys()) {
        if (entry.startsWith("pages/api/")) {
          openSockets.forEach((socket) => socket.end());
          break;
        }
      }
    });
  }
}

export function _hook(this: NextNodeServer) {
  const server = this.serverOptions.httpServer;
  if (!server) {
    Log.error("failed to load websocket plugin, no HTTP server provided");
    return;
  }

  Log.ready("loaded websocket plugin successfully");

  const wss = new WebSocketServer({ noServer: true });

  server.on("upgrade", async (req, socket, head) => {
    const url = new URL(req.url ?? "", "http://n");

    // Ignore webpack dev server and other next-related requests
    if (url.pathname.startsWith("/_next")) return;

    // Ensure the page exists
    await this.ensureApiPage(url.pathname);

    // Get the path of the page. This may throw an error so TODO to catch it
    const pagePath = this.getPagePath(url.pathname);

    // Require the built page module when making this request
    const pageModule = await require(pagePath);

    // Pass the socket handle to the websocket server
    wss.handleUpgrade(req, socket, head, pageModule.socket);

    // Add the socket to a list of open sockets so that we can close them all of
    // the dev server reloads any file on the API. In future bind this to the
    // specific route so that we only disconnect sockets that depended on a
    // specific route for that handler
    if (this.serverOptions.dev) {
      openSockets.add(socket);
      socket.once("close", () => openSockets.delete(socket));
    }
  });
}

function withWebSocket(nextConfig: NextConfig): NextConfig {
  return {
    ...nextConfig,

    webpack(config, context) {
      if (context.isServer && context.dev) {
        config.plugins.push(new WebpackReloadSocketPlugin());
      }
      nextConfig.webpack?.(config, context);
      return config;
    },
  };
}
