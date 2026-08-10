import express from "express";
import http from "http";
import path from "path";
import { fileURLToPath } from "url";
import { WebSocketServer, WebSocket } from "ws";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT || 8099);
const SUPERVISOR_TOKEN = process.env.SUPERVISOR_TOKEN;

const SUPERVISOR_CORE_API = "http://supervisor/core/api";
const SUPERVISOR_CORE_WS = "ws://supervisor/core/websocket";

if (!SUPERVISOR_TOKEN) {
  console.error("ERROR: SUPERVISOR_TOKEN no está disponible.");
  process.exit(1);
}

const app = express();
const server = http.createServer(app);

app.disable("x-powered-by");

app.use(express.json({ limit: "1mb" }));

/*
 * ------------------------------------------------------------
 * Health check
 * ------------------------------------------------------------
 */

app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    service: "dashboard-casa",
    version: "1.1.0"
  });
});

/*
 * ------------------------------------------------------------
 * Proxy REST hacia Home Assistant Core
 * ------------------------------------------------------------
 *
 * El navegador nunca recibe SUPERVISOR_TOKEN.
 *
 * Navegador:
 *   /api/states
 *
 * App:
 *   http://supervisor/core/api/states
 *
 * con:
 *   Authorization: Bearer SUPERVISOR_TOKEN
 */

async function proxyHomeAssistant(req, res) {
  try {
    const targetPath = req.originalUrl;

    const targetUrl =
      `${SUPERVISOR_CORE_API}${targetPath}`;

    const headers = {
      Authorization: `Bearer ${SUPERVISOR_TOKEN}`,
      Accept: req.headers.accept || "application/json"
    };

    if (req.headers["content-type"]) {
      headers["Content-Type"] = req.headers["content-type"];
    }

    const options = {
      method: req.method,
      headers
    };

    if (
      req.method !== "GET" &&
      req.method !== "HEAD" &&
      req.method !== "OPTIONS"
    ) {
      options.body = JSON.stringify(req.body ?? {});
      options.headers["Content-Type"] = "application/json";
    }

    const response = await fetch(targetUrl, options);

    const contentType =
      response.headers.get("content-type");

    if (contentType) {
      res.setHeader("Content-Type", contentType);
    }

    res.status(response.status);

    const body = await response.arrayBuffer();

    res.send(Buffer.from(body));
  } catch (error) {
    console.error(
      "Error comunicando con Home Assistant:",
      error
    );

    res.status(502).json({
      error: "No se pudo comunicar con Home Assistant"
    });
  }
}

/*
 * Todas las llamadas /api/* se envían al Core interno.
 */

app.use("/api", proxyHomeAssistant);

/*
 * ------------------------------------------------------------
 * Archivos estáticos del dashboard
 * ------------------------------------------------------------
 */

const distPath = path.join(__dirname, "dist");

app.use(
  express.static(distPath, {
    index: "index.html",
    extensions: ["html"]
  })
);

/*
 * SPA fallback
 */

app.get("*", (req, res, next) => {
  if (
    req.path.startsWith("/api/") ||
    req.path === "/health"
  ) {
    return next();
  }

  res.sendFile(
    path.join(distPath, "index.html")
  );
});

/*
 * ------------------------------------------------------------
 * WebSocket proxy
 * ------------------------------------------------------------
 *
 * Frontend:
 *
 *   ws://<dashboard>/api/websocket
 *
 * Backend:
 *
 *   ws://supervisor/core/websocket
 *
 * El token permanece únicamente en el backend.
 * ------------------------------------------------------------
 */

const websocketServer = new WebSocketServer({
  noServer: true
});

server.on("upgrade", (request, socket, head) => {
  const requestUrl = new URL(
    request.url,
    `http://${request.headers.host}`
  );

  if (requestUrl.pathname !== "/api/websocket") {
    socket.destroy();
    return;
  }

  websocketServer.handleUpgrade(
    request,
    socket,
    head,
    (clientSocket) => {
      websocketServer.emit(
        "connection",
        clientSocket,
        request
      );
    }
  );
});

websocketServer.on(
  "connection",
  (clientSocket) => {
    const homeAssistantSocket =
      new WebSocket(SUPERVISOR_CORE_WS);

    let closed = false;

    const closeBoth = () => {
      if (closed) {
        return;
      }

      closed = true;

      try {
        clientSocket.close();
      } catch {}

      try {
        homeAssistantSocket.close();
      } catch {}
    };

    homeAssistantSocket.on("open", () => {
      /*
       * El proxy WebSocket del Supervisor acepta
       * SUPERVISOR_TOKEN como contraseña.
       */
      homeAssistantSocket.send(
        JSON.stringify({
          type: "auth",
          access_token: SUPERVISOR_TOKEN
        })
      );
    });

    homeAssistantSocket.on("message", (data) => {
      if (clientSocket.readyState === WebSocket.OPEN) {
        clientSocket.send(data);
      }
    });

    clientSocket.on("message", (data) => {
      if (
        homeAssistantSocket.readyState ===
        WebSocket.OPEN
      ) {
        homeAssistantSocket.send(data);
      }
    });

    homeAssistantSocket.on("close", closeBoth);
    clientSocket.on("close", closeBoth);

    homeAssistantSocket.on(
      "error",
      (error) => {
        console.error(
          "WebSocket Home Assistant:",
          error
        );

        closeBoth();
      }
    );

    clientSocket.on("error", (error) => {
      console.error(
        "WebSocket cliente:",
        error
      );

      closeBoth();
    });
  }
);

/*
 * ------------------------------------------------------------
 * Inicio
 * ------------------------------------------------------------
 */

server.listen(PORT, "0.0.0.0", () => {
  console.log(
    `Dashboard Casa escuchando en ${PORT}`
  );

  console.log(
    "Home Assistant Core:",
    SUPERVISOR_CORE_API
  );

  console.log(
    "WebSocket Home Assistant:",
    SUPERVISOR_CORE_WS
  );
});
