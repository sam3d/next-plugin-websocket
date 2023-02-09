import fs from "fs";
import type { NextConfig } from "next";
import type { Options } from "next/dist/server/base-server";
import NextNodeServer from "next/dist/server/next-server";
import * as stream from "stream";
import type { Compiler, WebpackPluginInstance } from "webpack";
import { WebSocketServer } from "ws";

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

class NextWebSocketServer extends NextNodeServer {
  constructor(opts: Options) {
    super(opts);

    const server = this.serverOptions.httpServer;
    if (!server) {
      console.warn("HTTP server not found");
      return;
    }

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

      // Add the socket to a list of open sockets so that we can close them all
      // of the dev server reloads any file on the API. In future bind this to
      // the specific route so that we only disconnect sockets that depended on
      // a specific route for that handler
      if (this.serverOptions.dev) {
        openSockets.add(socket);
        socket.once("close", () => openSockets.delete(socket));
      }
    });
  }
}

// The following is a slightly modified version of the special handling of the
// Next.js 13 experimental app directory. It modifies the file in node_modules
// in order to mark react as being pre-bundled. I hate that it does this, and
// will probably make this module a nightmare to maintain in a backwards
// compatible way, but there it is.
//
// https://github.com/vercel/next.js/blob/c76380fa25cfa3124fb17aa9f929d6c6afe3dbcd/packages/next/src/build/index.ts#L301-L325
function applyAppDirFix(nextConfig: NextConfig) {
  const isAppDirEnabled = nextConfig.experimental?.appDir ?? false;
  const initialRequireHookFilePath = require.resolve(
    "next/dist/server/initialize-require-hook"
  );
  const content = fs.readFileSync(initialRequireHookFilePath, "utf8");

  if (isAppDirEnabled) {
    process.env["NEXT_PREBUNDLED_REACT"] = "1";
  }

  fs.writeFileSync(
    initialRequireHookFilePath,
    content.replace(
      /isPrebundled = (true|false)/,
      `isPrebundled = ${isAppDirEnabled}`
    )
  );
}

function applyRuntimePatches() {
  require("next/dist/server/next-server").default = NextWebSocketServer;
}

export function withWebSocket(nextConfig: NextConfig): NextConfig {
  applyAppDirFix(nextConfig);
  applyRuntimePatches();

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
