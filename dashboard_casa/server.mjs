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
 * ============================================================
 * HEALTH
 * ============================================================
 */

app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    service: "dashboard-casa",
    version: "1.1.1"
  });
});

/*
 * ============================================================
 * PROXY REST HACIA HOME ASSISTANT
 * ============================================================
 *
 * El navegador llama:
 *
 *   /api/states
 *   /api/services/switch/turn_on
 *   /api/services/script/turn_on
 *
 * El servidor convierte esas peticiones en:
 *
 *   http://supervisor/core/api/...
 *
 * El SUPERVISOR_TOKEN NUNCA sale del servidor.
 *
 * ============================================================
 */

async function proxyHomeAssistant(req, res) {
  try {
    /*
     * req.originalUrl contiene /api/...
     *
     * Necesitamos quitar el primer /api porque
     * SUPERVISOR_CORE_API ya termina en /api.
     */
    const apiPath = req.originalUrl.replace(/^\/api/, "");

    const targetUrl =
      `${SUPERVISOR_CORE_API}${apiPath}`;

    console.log(
      `[REST] ${req.method} ${req.originalUrl} -> ${targetUrl}`
    );

    const headers = {
      Authorization: `Bearer ${SUPERVISOR_TOKEN}`,
      Accept:
        req.headers.accept ||
        "application/json"
    };

    if (req.headers["content-type"]) {
      headers["Content-Type"] =
        req.headers["content-type"];
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
      options.body = JSON.stringify(
        req.body ?? {}
      );

      options.headers["Content-Type"] =
        "application/json";
    }

    const response = await fetch(
      targetUrl,
      options
    );

    const contentType =
      response.headers.get(
        "content-type"
      );

    if (contentType) {
      res.setHeader(
        "Content-Type",
        contentType
      );
    }

    res.status(response.status);

    const body =
      await response.arrayBuffer();

    res.send(
      Buffer.from(body)
    );
  } catch (error) {
    console.error(
      "[REST] Error comunicando con Home Assistant:",
      error
    );

    if (!res.headersSent) {
      res.status(502).json({
        error:
          "No se pudo comunicar con Home Assistant",
        details:
          error?.message || String(error)
      });
    }
  }
}

/*
 * Todas las peticiones /api/*
 * pasan por nuestro proxy.
 */
app.use(
  "/api",
  proxyHomeAssistant
);

/*
 * ============================================================
 * ARCHIVOS ESTÁTICOS
 * ============================================================
 */

const distPath =
  path.join(
    __dirname,
    "dist"
  );

app.use(
  express.static(
    distPath,
    {
      index: "index.html",
      extensions: ["html"]
    }
  )
);

/*
 * ============================================================
 * SPA FALLBACK
 * ============================================================
 *
 * IMPORTANTE:
 *
 * Express 5 no acepta:
 *
 *   app.get("*")
 *
 * Utilizamos:
 *
 *   /{*splat}
 *
 * ============================================================
 */

app.get(
  "/{*splat}",
  (req, res, next) => {
    if (
      req.path.startsWith("/api/") ||
      req.path === "/health"
    ) {
      return next();
    }

    res.sendFile(
      path.join(
        distPath,
        "index.html"
      )
    );
  }
);

/*
 * ============================================================
 * WEBSOCKET PROXY
 * ============================================================
 *
 * Navegador:
 *
 *   ws://dashboard/api/websocket
 *
 * Servidor:
 *
 *   ws://supervisor/core/websocket
 *
 * El token solamente existe en este servidor.
 *
 * ============================================================
 */

const websocketServer =
  new WebSocketServer({
    noServer: true
  });

server.on(
  "upgrade",
  (request, socket, head) => {
    try {
      const requestUrl =
        new URL(
          request.url,
          `http://${request.headers.host}`
        );

      console.log(
        `[WS] Upgrade solicitado: ${requestUrl.pathname}`
      );

      if (
        requestUrl.pathname !==
        "/api/websocket"
      ) {
        console.log(
          "[WS] Ruta WebSocket rechazada:",
          requestUrl.pathname
        );

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
    } catch (error) {
      console.error(
        "[WS] Error durante upgrade:",
        error
      );

      socket.destroy();
    }
  }
);

websocketServer.on(
  "connection",
  (clientSocket) => {
    console.log(
      "[WS] Cliente conectado al dashboard"
    );

    let closed = false;

    const homeAssistantSocket =
      new WebSocket(
        SUPERVISOR_CORE_WS,
        {
          headers: {
            Authorization:
              `Bearer ${SUPERVISOR_TOKEN}`
          }
        }
      );

    const closeBoth =
      (code = 1000) => {
        if (closed) {
          return;
        }

        closed = true;

        try {
          if (
            clientSocket.readyState ===
            WebSocket.OPEN
          ) {
            clientSocket.close(code);
          }
        } catch {}

        try {
          if (
            homeAssistantSocket.readyState ===
              WebSocket.OPEN ||
            homeAssistantSocket.readyState ===
              WebSocket.CONNECTING
          ) {
            homeAssistantSocket.close();
          }
        } catch {}
      };

    /*
     * ========================================================
     * HOME ASSISTANT WS ABIERTO
     * ========================================================
     */

    homeAssistantSocket.on(
      "open",
      () => {
        console.log(
          "[WS] Conectado con Home Assistant"
        );

        /*
         * El proxy WebSocket de Home Assistant
         * necesita recibir auth.
         *
         * El token NO se envía al navegador.
         */

        homeAssistantSocket.send(
          JSON.stringify({
            type: "auth",
            access_token:
              SUPERVISOR_TOKEN
          })
        );

        console.log(
          "[WS] Autenticación enviada a Home Assistant"
        );
      }
    );

    /*
     * ========================================================
     * MENSAJES HOME ASSISTANT -> NAVEGADOR
     * ========================================================
     */

    homeAssistantSocket.on(
      "message",
      (data) => {
        try {
          const text =
            data.toString();

          console.log(
            "[WS] HA -> navegador:",
            text.substring(0, 300)
          );

          if (
            clientSocket.readyState ===
            WebSocket.OPEN
          ) {
            clientSocket.send(data);
          }
        } catch (error) {
          console.error(
            "[WS] Error enviando datos al navegador:",
            error
          );
        }
      }
    );

    /*
     * ========================================================
     * MENSAJES NAVEGADOR -> HOME ASSISTANT
     * ========================================================
     */

    clientSocket.on(
      "message",
      (data) => {
        try {
          const text =
            data.toString();

          console.log(
            "[WS] navegador -> HA:",
            text.substring(0, 300)
          );

          if (
            homeAssistantSocket.readyState ===
            WebSocket.OPEN
          ) {
            homeAssistantSocket.send(
              data
            );
          } else {
            console.warn(
              "[WS] Home Assistant todavía no está conectado"
            );
          }
        } catch (error) {
          console.error(
            "[WS] Error enviando datos a Home Assistant:",
            error
          );
        }
      }
    );

    /*
     * ========================================================
     * CIERRES
     * ========================================================
     */

    homeAssistantSocket.on(
      "close",
      (code, reason) => {
        console.log(
          "[WS] Home Assistant cerró conexión:",
          code,
          reason?.toString()
        );

        closeBoth();
      }
    );

    clientSocket.on(
      "close",
      () => {
        console.log(
          "[WS] Cliente cerró conexión"
        );

        closeBoth();
      }
    );

    /*
     * ========================================================
     * ERRORES
     * ========================================================
     */

    homeAssistantSocket.on(
      "error",
      (error) => {
        console.error(
          "[WS] Error Home Assistant:",
          error
        );

        closeBoth(1011);
      }
    );

    clientSocket.on(
      "error",
      (error) => {
        console.error(
          "[WS] Error cliente:",
          error
        );

        closeBoth(1011);
      }
    );
  }
);

/*
 * ============================================================
 * SERVIDOR
 * ============================================================
 */

server.listen(
  PORT,
  "0.0.0.0",
  () => {
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

    console.log(
      "Proxy REST: /api/*"
    );

    console.log(
      "Proxy WebSocket: /api/websocket"
    );
  }
);
