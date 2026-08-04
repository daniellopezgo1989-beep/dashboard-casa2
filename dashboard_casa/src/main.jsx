import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  House,
  Lightbulb,
  Tv,
  Snowflake,
  Blinds,
  Zap,
  CheckSquare,
  ShoppingCart,
  CalendarDays,
  Settings,
  ChevronRight,
  Power,
  Film,
  Wifi,
  WifiOff,
  Lock,
  AlertTriangle,
  Sun,
  Moon,
  Maximize,
  Minimize,
  ChevronLeft,
  ChevronDown,
  Plus,
  X
} from "lucide-react";
import "./styles.css";

const DEFAULT_URL = "http://100.67.184.82:8123";
const DEFAULT_PRICE = 0.216;

const ENTITIES = {
  lamp: "switch.lampara",

  movie: "script.modo_cine",
  tvOff: "script.tv_apagar",
  tvOn: "script.tv_encender",

  netflix: "script.tv_netflix",
  hboMax: "script.tv_hbo_max",
  primeVideo: "script.tv_prime_video",
  movistarHdmi: "script.tv_movistar_hdmi",
  maxPlayer: "script.tv_max_player",

  freezer: "binary_sensor.sensor_congelador_contact",

  power: "sensor.lampara_power",
  energy: "sensor.lampara_energy"
};

const ICON_BG = {
  netflix: { background: "#e50914" },
  hbo: { background: "linear-gradient(135deg,#7b2ff7,#1a0b2e)" },
  prime: { background: "linear-gradient(135deg,#00a8e1,#00415f)" },
  movistar: { background: "linear-gradient(135deg,#0193f4,#014a8f)" },
  maxplayer: { background: "linear-gradient(135deg,#5b5b66,#232329)" },
  cine: { background: "linear-gradient(135deg,#0af0ff,#0a6fbf)" },
  tvon: { background: "linear-gradient(135deg,#34e5b9,#0a8f6e)" },
  tvoff: { background: "linear-gradient(135deg,#ff6b5e,#8f1f16)" }
};

// Slugs de la librería pública "simple-icons" (logos oficiales de marca).
// Si algún logo no existe con ese nombre, el componente cae solo en la letra.
const ICON_SLUGS = {
  netflix: "netflix",
  hbo: "hbomax",
  prime: "primevideo",
  movistar: "movistarplus"
  // cine, tvon, tvoff y maxplayer no tienen app real -> sin slug
};

function loadConfig() {
  try {
    return {
      ...JSON.parse(localStorage.getItem("casa_config") || "{}")
    };
  } catch {
    return {};
  }
}

// Convierte un color hex (#rrggbb) en un rgba(...) con la opacidad indicada.
// Se usa para pintar el fondo translúcido de las tiles del menú
// (estilo "burbuja" del Centro de Control de iOS) sin depender de
// color-mix(), que no todos los WebViews soportan igual.
function hexToRgba(hex, alpha) {
  const clean = hex.replace("#", "");
  const bigint = parseInt(clean, 16);
  const r = (bigint >> 16) & 255;
  const g = (bigint >> 8) & 255;
  const b = bigint & 255;

  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function formatElapsed(ms) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  const pad = (n) => String(n).padStart(2, "0");

  return h > 0
    ? `${pad(h)}:${pad(m)}:${pad(s)}`
    : `${pad(m)}:${pad(s)}`;
}

function App() {
  const [config, setConfig] = useState(loadConfig());
  const [page, setPage] = useState("Domótica");
  const [dark, setDark] = useState(
    localStorage.getItem("casa_dark") === "1"
  );
  const [connected, setConnected] = useState(false);
  const [states, setStates] = useState({});
  const [message, setMessage] = useState("");

  const [freezerOpenSince, setFreezerOpenSince] = useState(null);
  const [nowTick, setNowTick] = useState(Date.now());
  const [fullscreen, setFullscreen] = useState(false);
  const wsRef = useRef(null);
  const [calendarEntities, setCalendarEntities] = useState([]);
  const [calendarEntity, setCalendarEntity] = useState("");
  const [calendarEvents, setCalendarEvents] = useState([]);
  const [calendarMonth, setCalendarMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const [calendarLoading, setCalendarLoading] = useState(false);
  const [calendarModal, setCalendarModal] = useState(false);

  const url = config.url || DEFAULT_URL;
  const token = config.token || "";

  useEffect(() => {
    document.documentElement.dataset.theme = dark ? "dark" : "light";
    localStorage.setItem("casa_dark", dark ? "1" : "0");
  }, [dark]);

  // Modo pantalla completa del dashboard.
  // Se usa la Fullscreen API del navegador para que el dashboard
  // ocupe toda la pantalla y, además, ocultamos el menú y cabecera.
  useEffect(() => {
    const handleFullscreenChange = () => {
      setFullscreen(Boolean(document.fullscreenElement));
    };

    document.addEventListener("fullscreenchange", handleFullscreenChange);

    return () => {
      document.removeEventListener(
        "fullscreenchange",
        handleFullscreenChange
      );
    };
  }, []);

  async function toggleFullscreen() {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else {
        await document.documentElement.requestFullscreen();
      }
    } catch (error) {
      console.error("No se pudo cambiar a pantalla completa:", error);
      setMessage("El navegador no permite pantalla completa");
      setTimeout(() => {
        setMessage("");
      }, 2000);
    }
  }

  useEffect(() => {
    if (!token) {
      setConnected(false);
      setStates({});
      return;
    }

    let ws = null;
    let alive = true;

    try {
      const wsUrl = url.replace(/^http/, "ws") + "/api/websocket";
      ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log("WebSocket conectado");
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);

          if (msg.type === "auth_required") {
            ws.send(
              JSON.stringify({
                type: "auth",
                access_token: token
              })
            );
            return;
          }

          if (msg.type === "auth_ok") {
            console.log("Home Assistant autenticado");

            if (alive) {
              setConnected(true);
            }

            ws.send(
              JSON.stringify({
                id: 1,
                type: "get_states"
              })
            );

            ws.send(
              JSON.stringify({
                id: 2,
                type: "subscribe_events",
                event_type: "state_changed"
              })
            );

            return;
          }

          if (msg.id === 1 && msg.success) {
            const map = Object.fromEntries(
              msg.result.map((entity) => [
                entity.entity_id,
                entity
              ])
            );

            if (alive) {
              setStates(map);
              const calendars = msg.result
                .filter((entity) => entity.entity_id.startsWith("calendar."))
                .map((entity) => ({
                  entity_id: entity.entity_id,
                  name: entity.attributes?.friendly_name || entity.entity_id.replace("calendar.", "")
                }))
                .sort((a, b) => a.name.localeCompare(b.name, "es"));
              setCalendarEntities(calendars);
              setCalendarEntity((current) => current || calendars[0]?.entity_id || "");
            }

            return;
          }

          if (msg.id === 2 && msg.success) {
            console.log("Suscripción a cambios activa");
            return;
          }

          if (msg.type === "result" && msg.success && msg.result?.events) {
            setCalendarEvents(msg.result.events);
            setCalendarLoading(false);
            return;
          }

          if (
            msg.type === "event" &&
            msg.event &&
            msg.event.event_type === "state_changed"
          ) {
            const eventData = msg.event.data;

            if (!eventData || !eventData.entity_id) {
              return;
            }

            const entityId = eventData.entity_id;
            const newState = eventData.new_state;

            if (!newState || !alive) {
              return;
            }

            setStates((previous) => ({
              ...previous,
              [entityId]: newState
            }));

            console.log(
              "Estado actualizado:",
              entityId,
              newState.state
            );
          }
        } catch (error) {
          console.error(
            "Error procesando WebSocket:",
            error
          );
        }
      };

      ws.onclose = () => {
        if (wsRef.current === ws) wsRef.current = null;
        console.log("WebSocket cerrado");

        if (alive) {
          setConnected(false);
        }
      };

      ws.onerror = (error) => {
        console.error("Error WebSocket:", error);

        if (alive) {
          setConnected(false);
        }
      };
    } catch (error) {
      console.error(
        "No se pudo conectar con Home Assistant:",
        error
      );

      setConnected(false);
    }

    return () => {
      alive = false;

      try {
        if (wsRef.current === ws) wsRef.current = null;
        ws?.close();
      } catch {}
    };
  }, [url, token]);

  useEffect(() => {
    if (!connected || !calendarEntity || !wsRef.current) return;
    const start = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth(), 1);
    const end = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 1);
    setCalendarLoading(true);
    setCalendarEvents([]);
    wsRef.current.send(JSON.stringify({
      id: 1000,
      type: "calendar/event/subscribe",
      entity_id: calendarEntity,
      start: start.toISOString(),
      end: end.toISOString()
    }));
  }, [connected, calendarEntity, calendarMonth]);

  async function createCalendarEvent(data) {
    if (!token || !calendarEntity) return false;
    try {
      const response = await fetch(`${url}/api/services/google/create_event`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          entity_id: calendarEntity,
          ...data
        })
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      setMessage("Evento creado en Google Calendar");
      setCalendarModal(false);
      setTimeout(() => setMessage(""), 2200);
      setTimeout(() => {
        if (wsRef.current) {
          const start = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth(), 1);
          const end = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 1);
          wsRef.current.send(JSON.stringify({ id: 1001, type: "calendar/event/subscribe", entity_id: calendarEntity, start: start.toISOString(), end: end.toISOString() }));
        }
      }, 1200);
      return true;
    } catch (error) {
      console.error("Error creando evento:", error);
      setMessage("No se pudo crear el evento");
      setTimeout(() => setMessage(""), 2500);
      return false;
    }
  }

  const state = (entityId) => {
    return states[entityId]?.state;
  };

  const lampOn = state(ENTITIES.lamp) === "on";

  const freezerOpen =
    state(ENTITIES.freezer) === "on";

  const power = state(ENTITIES.power);

  const energy = Number(state(ENTITIES.energy));

  const price = Number(
    config.price ?? DEFAULT_PRICE
  );

  const yesterdayKwh = Number(
    config.yesterdayKwh ?? 0
  );

  const yesterdayCost = yesterdayKwh * price;

  // Cronómetro del congelador:
  // guarda el momento en que se abrió
  // y lo resetea en cuanto se detecta que está cerrado.
  useEffect(() => {
    if (freezerOpen) {
      setFreezerOpenSince(
        (previous) => previous ?? Date.now()
      );
    } else {
      setFreezerOpenSince(null);
    }
  }, [freezerOpen]);

  useEffect(() => {
    if (!freezerOpen) {
      return;
    }

    const id = setInterval(() => {
      setNowTick(Date.now());
    }, 1000);

    return () => clearInterval(id);
  }, [freezerOpen]);

  const freezerElapsedMs = freezerOpenSince
    ? nowTick - freezerOpenSince
    : 0;

  async function callService(
    domain,
    service,
    entity_id
  ) {
    if (!token) {
      setMessage(
        "Añade tu token en ⚙️ Ajustes."
      );

      return;
    }

    try {
      const response = await fetch(
        `${url}/api/services/${domain}/${service}`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            entity_id
          })
        }
      );

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      setMessage("Acción enviada");

      setTimeout(() => {
        setMessage("");
      }, 1600);
    } catch (error) {
      console.error(
        "Error ejecutando servicio:",
        error
      );

      setMessage(
        "No se pudo conectar con Home Assistant"
      );

      setTimeout(() => {
        setMessage("");
      }, 2000);
    }
  }

  const nav = [
    ["Domótica", House, "#0a84ff"],
    ["Tareas", CheckSquare, "#30d158"],
    ["Compra", ShoppingCart, "#ff9f0a"],
    ["Calendario", CalendarDays, "#ff375f"],
    ["Ajustes", Settings, "#8e8e93"]
  ];

  return (
    <div className={fullscreen ? "app fullscreen-app" : "app"}>
      <aside
        className="sidebar"
      >
        <div className="brand">
          <div className="brand-icon">
            <House size={22} />
          </div>

          <div>
            <b>Mi Casa</b>
            <span>Dashboard</span>
          </div>
        </div>

        <nav className="cc-nav">
          {nav.map(([name, Icon, color]) => (
            <button
              key={name}
              className={
                page === name
                  ? "cc-tile active"
                  : "cc-tile"
              }
              style={
                page === name
                  ? {
                      "--tile-color": color,
                      "--tile-bg": hexToRgba(color, 0.22)
                    }
                  : undefined
              }
              onClick={() => setPage(name)}
            >
              <span className="cc-tile-icon">
                <Icon size={20} />
              </span>
              <span className="cc-tile-label">{name}</span>
            </button>
          ))}
        </nav>

        <div className="sidebar-bottom">
          <button
            className="theme-btn"
            onClick={() => setDark(!dark)}
          >
            {dark ? (
              <Sun size={19} />
            ) : (
              <Moon size={19} />
            )}

            {dark ? "Modo claro" : "Modo oscuro"}
          </button>

          <div
            className={
              connected
                ? "connection ok"
                : "connection"
            }
          >
            {connected ? (
              <Wifi size={16} />
            ) : (
              <WifiOff size={16} />
            )}

            {connected
              ? "Conectado"
              : "Sin conexión"}
          </div>
        </div>
      </aside>

      <main className={fullscreen ? "fullscreen-main" : ""}>
        <button
          type="button"
          onClick={toggleFullscreen}
          aria-label={
            fullscreen
              ? "Salir de pantalla completa"
              : "Entrar en pantalla completa"
          }
          title={
            fullscreen
              ? "Salir de pantalla completa"
              : "Pantalla completa"
          }
          style={{
            position: "fixed",
            top: 16,
            right: 16,
            zIndex: 9999,
            width: 44,
            height: 44,
            border: "none",
            borderRadius: 16,
            display: "grid",
            placeItems: "center",
            cursor: "pointer",
            background: "var(--card, rgba(20,20,25,.92))",
            color: "var(--text, currentColor)",
            boxShadow: "0 8px 24px rgba(0,0,0,.25)",
            backdropFilter: "blur(10px)"
          }}
        >
          {fullscreen ? <Minimize size={20} /> : <Maximize size={20} />}
        </button>

        <header>
          <div>
            <div className="eyebrow">MI CASA</div>
            <h1>{page}</h1>
          </div>

          <div className="status-pill">
            {connected ? (
              <>
                <Wifi size={15} />
                Home Assistant
              </>
            ) : (
              <>
                <WifiOff size={15} />
                Configura HA
              </>
            )}
          </div>
        </header>

        {message && (
          <div className="toast">
            {message}
          </div>
        )}

        {page === "Domótica" && (
          <section
            className={fullscreen ? "grid fullscreen-grid" : "grid"}
          >

            {/* =========================
                FILA 1: cuatro tarjetas
            ========================= */}

            <Card
              title="Temperatura"
              icon={
                <span className="emoji">🌡️</span>
              }
              muted
              value="—"
              sub="Sin sensor todavía"
            />

            <Card
              title="Humedad"
              icon={
                <span className="emoji">💧</span>
              }
              muted
              value="—"
              sub="Sin sensor todavía"
            />

            <section className="card cc-toggle-card">
              <CardHead
                icon={<Lightbulb />}
                title="Lámpara"
              />

              <button
                type="button"
                className={
                  lampOn ? "cc-bubble on" : "cc-bubble"
                }
                aria-pressed={lampOn}
                aria-label={
                  lampOn ? "Apagar lámpara" : "Encender lámpara"
                }
                onClick={() =>
                  callService(
                    "switch",
                    lampOn ? "turn_off" : "turn_on",
                    ENTITIES.lamp
                  )
                }
              >
                <Lightbulb size={24} />
              </button>

              <div className="control-row">
                <div
                  className={
                    lampOn
                      ? "state-dot on"
                      : "state-dot"
                  }
                />

                <strong>
                  {lampOn ? "Encendida" : "Apagada"}
                </strong>

                <span className="cc-tap-hint">
                  <Power size={13} />
                  {lampOn ? "Toca para apagar" : "Toca para encender"}
                </span>
              </div>
            </section>

            {/* =========================
                CONGELADOR
            ========================= */}

            <section
              className={
                freezerOpen
                  ? "card freezer-card open"
                  : "card freezer-card"
              }
            >
              <CardHead
                icon={<Snowflake />}
                title="Congelador"
                right={
                  freezerOpen
                    ? "ATENCIÓN"
                    : undefined
                }
              />

              <div
                className={
                  freezerOpen
                    ? "big-status danger"
                    : "big-status"
                }
              >
                {freezerOpen ? (
                  <>
                    <AlertTriangle />
                    Abierto
                  </>
                ) : (
                  <>
                    <Lock />
                    Cerrado
                  </>
                )}
              </div>

              {freezerOpen && (
                <>
                  <div className="freezer-alert">
                    <span className="alert-pulse" />
                    Puerta abierta
                  </div>

                  <div className="freezer-timer">
                    {formatElapsed(
                      freezerElapsedMs
                    )}
                  </div>
                </>
              )}
            </section>

            {/* =========================
                FILA 2: TV SALÓN
            ========================= */}

            <section className="card wide">
              <CardHead
                icon={<Tv />}
                title="TV salón"
              />

              <div className="button-grid">

                <ActionButton
                  className="app-tv cine"
                  icon={
                    <AppIcon
                      slug={ICON_SLUGS.cine}
                      name="Modo Cine"
                      bg={ICON_BG.cine}
                      fallback={
                        <Film
                          size={20}
                          color="#fff"
                        />
                      }
                    />
                  }
                  text="Modo Cine"
                  on={() =>
                    callService(
                      "script",
                      "turn_on",
                      ENTITIES.movie
                    )
                  }
                />

                <ActionButton
                  className="app-tv tvon"
                  icon={
                    <AppIcon
                      slug={ICON_SLUGS.tvon}
                      name="TV Encender"
                      bg={ICON_BG.tvon}
                      fallback={
                        <Power
                          size={20}
                          color="#fff"
                        />
                      }
                    />
                  }
                  text="TV Encender"
                  on={() =>
                    callService(
                      "script",
                      "turn_on",
                      ENTITIES.tvOn
                    )
                  }
                />

                <ActionButton
                  className="app-tv tvoff"
                  icon={
                    <AppIcon
                      slug={ICON_SLUGS.tvoff}
                      name="TV Apagar"
                      bg={ICON_BG.tvoff}
                      fallback={
                        <Power
                          size={20}
                          color="#fff"
                        />
                      }
                    />
                  }
                  text="TV Apagar"
                  on={() =>
                    callService(
                      "script",
                      "turn_on",
                      ENTITIES.tvOff
                    )
                  }
                />

                {/* NETFLIX */}

                <ActionButton
                  className="app-tv netflix"
                  icon={
                    <AppIcon
                      slug={ICON_SLUGS.netflix}
                      name="Netflix"
                      bg={ICON_BG.netflix}
                      fallback="N"
                    />
                  }
                  text="Netflix"
                  on={() =>
                    callService(
                      "script",
                      "turn_on",
                      ENTITIES.netflix
                    )
                  }
                />

                {/* HBO MAX */}

                <ActionButton
                  className="app-tv hbo"
                  icon={
                    <AppIcon
                      slug={ICON_SLUGS.hbo}
                      name="HBO Max"
                      bg={ICON_BG.hbo}
                      fallback="H"
                    />
                  }
                  text="HBO Max"
                  on={() =>
                    callService(
                      "script",
                      "turn_on",
                      ENTITIES.hboMax
                    )
                  }
                />

                {/* PRIME VIDEO */}

                <ActionButton
                  className="app-tv prime"
                  icon={
                    <AppIcon
                      slug={ICON_SLUGS.prime}
                      name="Prime Video"
                      bg={ICON_BG.prime}
                      fallback="P"
                    />
                  }
                  text="Prime Video"
                  on={() =>
                    callService(
                      "script",
                      "turn_on",
                      ENTITIES.primeVideo
                    )
                  }
                />

                {/* MOVISTAR HDMI */}

                <ActionButton
                  className="app-tv movistar"
                  icon={
                    <AppIcon
                      slug={ICON_SLUGS.movistar}
                      name="Movistar HDMI"
                      bg={ICON_BG.movistar}
                      fallback="M"
                    />
                  }
                  text="Movistar HDMI"
                  on={() =>
                    callService(
                      "script",
                      "turn_on",
                      ENTITIES.movistarHdmi
                    )
                  }
                />

                {/* MAX PLAYER */}

                <ActionButton
                  className="app-tv maxplayer"
                  icon={
                    <AppIcon
                      slug={ICON_SLUGS.maxplayer}
                      name="Max Player"
                      bg={ICON_BG.maxplayer}
                      fallback={
                        <Tv
                          size={20}
                          color="#fff"
                        />
                      }
                    />
                  }
                  text="Max Player"
                  on={() =>
                    callService(
                      "script",
                      "turn_on",
                      ENTITIES.maxPlayer
                    )
                  }
                />

              </div>
            </section>

            {/* =========================
                FILA 3: Persianas + Consumo
            ========================= */}

            <section className="card half">
              <CardHead
                icon={<Blinds />}
                title="Persianas"
                right="Próximamente"
              />

              <div className="blind">
                <div>
                  <b>Salón</b>
                  <span>
                    Sin entidad todavía
                  </span>
                </div>

                <div className="blind-buttons">
                  <button disabled>↑</button>
                  <button disabled>■</button>
                  <button disabled>↓</button>
                </div>
              </div>

              <div className="blind">
                <div>
                  <b>
                    Habitación principal
                  </b>
                  <span>
                    Sin entidad todavía
                  </span>
                </div>

                <div className="blind-buttons">
                  <button disabled>↑</button>
                  <button disabled>■</button>
                  <button disabled>↓</button>
                </div>
              </div>
            </section>

            <section className="card half">
              <CardHead
                icon={<Zap />}
                title="Consumo lámpara"
                right={`${price.toFixed(3)} €/kWh`}
              />

              <div className="stats">
                <Stat
                  label="Ahora"
                  value={
                    power
                      ? `${power} W`
                      : "—"
                  }
                />

                <Stat
                  label="Energía acumulada"
                  value={
                    Number.isFinite(energy)
                      ? `${energy.toFixed(2)} kWh`
                      : "—"
                  }
                />

                <Stat
                  label="Ayer"
                  value={
                    yesterdayKwh
                      ? `${yesterdayKwh.toFixed(2)} kWh`
                      : "Configurar"
                  }
                />

                <Stat
                  label="Coste ayer"
                  value={
                    yesterdayKwh
                      ? `${yesterdayCost.toFixed(3)} €`
                      : "—"
                  }
                />
              </div>

              <div className="mini-chart">
                <span style={{ height: "28%" }} />
                <span style={{ height: "44%" }} />
                <span style={{ height: "35%" }} />
                <span style={{ height: "65%" }} />
                <span style={{ height: "48%" }} />
                <span style={{ height: "30%" }} />
                <span style={{ height: "52%" }} />
              </div>

              <div className="chart-labels">
                <span>L</span>
                <span>M</span>
                <span>X</span>
                <span>J</span>
                <span>V</span>
                <span>S</span>
                <span>D</span>
              </div>

              <p className="hint">
                El histórico de ayer se añadirá
                usando las estadísticas de
                Home Assistant.
              </p>
            </section>

            {/* =========================
                FILA 4: Tareas + Calendario
            ========================= */}

            <section className="card half">
              <CardHead
                icon={<CheckSquare />}
                title="Tareas"
              />

              <p className="muted">
                Próximamente aquí verás tus
                tareas pendientes.
              </p>
            </section>

            <section className="card half">
              <CardHead
                icon={<CalendarDays />}
                title="Calendario"
              />

              <p className="muted">
                Próximamente aquí verás tus
                próximos eventos.
              </p>
            </section>

          </section>
        )}

        {page === "Tareas" && (
          <Placeholder
            icon={<CheckSquare />}
            title="Tareas / Recordatorios"
            text="Preparado para integrar tus listas todo de Home Assistant."
          />
        )}

        {page === "Compra" && (
          <Placeholder
            icon={<ShoppingCart />}
            title="Lista de la compra"
            text="Preparado para integrar tu lista de compra de Home Assistant."
          />
        )}

        {page === "Calendario" && (
          <CalendarPage
            connected={connected}
            calendarEntities={calendarEntities}
            calendarEntity={calendarEntity}
            setCalendarEntity={setCalendarEntity}
            calendarMonth={calendarMonth}
            setCalendarMonth={setCalendarMonth}
            calendarEvents={calendarEvents}
            calendarLoading={calendarLoading}
            onAdd={() => setCalendarModal(true)}
            calendarModal={calendarModal}
            setCalendarModal={setCalendarModal}
            onCreate={createCalendarEvent}
          />
        )}

        {page === "Ajustes" && (
          <SettingsPage
            config={config}
            setConfig={setConfig}
          />
        )}
      </main>
    </div>
  );
}

function Card({
  title,
  icon,
  value,
  sub,
  muted
}) {
  return (
    <section className="card">
      <CardHead
        icon={icon}
        title={title}
      />

      <div
        className={
          muted
            ? "big-number muted"
            : "big-number"
        }
      >
        {value}
      </div>

      <p className="muted">{sub}</p>
    </section>
  );
}

function CardHead({
  icon,
  title,
  right
}) {
  return (
    <div className="card-head">
      <div className="card-title">
        {icon}
        <b>{title}</b>
      </div>

      {right && (
        <span className="badge">
          {right}
        </span>
      )}
    </div>
  );
}

// Icono de app: intenta cargar el logo real (simple-icons).
// Si no existe ese slug o falla la carga, muestra el "fallback"
// (una letra o un icono de lucide) sobre el mismo fondo de color.
function AppIcon({
  slug,
  name,
  bg,
  fallback
}) {
  const [failed, setFailed] = useState(false);

  const showImage = Boolean(slug) && !failed;

  return (
    <div
      className="app-icon-tile"
      style={{
        width: 44,
        height: 44,
        minWidth: 44,
        borderRadius: 12,
        display: "grid",
        placeItems: "center",
        flex: "none",
        boxShadow:
          "0 4px 12px rgba(0,0,0,.28), inset 0 0 0 1px rgba(255,255,255,.14)",
        ...bg
      }}
    >
      {showImage ? (
        <img
          src={`https://cdn.jsdelivr.net/npm/simple-icons@v13/icons/${slug}.svg`}
          alt={name}
          onError={() => setFailed(true)}
          style={{
            width: 22,
            height: 22,
            filter: "brightness(0) invert(1)",
            display: "block"
          }}
        />
      ) : typeof fallback === "string" ? (
        <span
          style={{
            color: "#fff",
            fontWeight: 800,
            fontSize: 18
          }}
        >
          {fallback}
        </span>
      ) : (
        fallback
      )}
    </div>
  );
}

function ActionButton({
  icon,
  text,
  on,
  danger,
  className = ""
}) {
  return (
    <button
      className={[
        "action",
        className,
        danger ? "danger" : ""
      ]
        .filter(Boolean)
        .join(" ")}
      onClick={on}
    >
      <div className="action-icon">
        {icon}
      </div>

      <span className="app-name">
        {text}
      </span>

      <ChevronRight
        className="app-arrow"
        size={17}
      />
    </button>
  );
}

function Stat({
  label,
  value
}) {
  return (
    <div>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}


function CalendarPage({
  connected,
  calendarEntities,
  calendarEntity,
  setCalendarEntity,
  calendarMonth,
  setCalendarMonth,
  calendarEvents,
  calendarLoading,
  onAdd,
  calendarModal,
  setCalendarModal,
  onCreate
}) {
  const year = calendarMonth.getFullYear();
  const month = calendarMonth.getMonth();
  const firstDay = new Date(year, month, 1);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const mondayOffset = (firstDay.getDay() + 6) % 7;
  const totalCells = Math.ceil((mondayOffset + daysInMonth) / 7) * 7;
  const cells = Array.from({ length: totalCells }, (_, index) => {
    const day = index - mondayOffset + 1;
    return day >= 1 && day <= daysInMonth ? new Date(year, month, day) : null;
  });

  const monthName = calendarMonth.toLocaleDateString("es-ES", { month: "long", year: "numeric" });
  const eventDate = (value) => {
    if (!value) return null;
    const d = value.length === 10 ? new Date(`${value}T00:00:00`) : new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  };
  const eventsForDay = (date) => calendarEvents.filter((event) => {
    const start = eventDate(event.start);
    const end = eventDate(event.end);
    if (!start || !end) return false;
    const dayStart = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const dayEnd = new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1);
    return start < dayEnd && end > dayStart;
  });
  const formatEventTime = (event) => {
    const start = eventDate(event.start);
    if (!start || event.start?.length === 10) return "Todo el día";
    return start.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
  };

  return (
    <section className="calendar-page">
      <div className="calendar-toolbar">
        <div>
          <div className="eyebrow">GOOGLE CALENDAR</div>
          <h2 className="calendar-title">{monthName.charAt(0).toUpperCase() + monthName.slice(1)}</h2>
        </div>
        <div className="calendar-actions">
          {calendarEntities.length > 0 && (
            <label className="calendar-select-wrap">
              <CalendarDays size={17} />
              <select value={calendarEntity} onChange={(e) => setCalendarEntity(e.target.value)}>
                {calendarEntities.map((calendar) => <option key={calendar.entity_id} value={calendar.entity_id}>{calendar.name}</option>)}
              </select>
              <ChevronDown size={15} />
            </label>
          )}
          <button className="calendar-nav-btn" onClick={() => setCalendarMonth(new Date(year, month - 1, 1))} title="Mes anterior"><ChevronLeft size={19} /></button>
          <button className="calendar-today" onClick={() => setCalendarMonth(new Date(new Date().getFullYear(), new Date().getMonth(), 1))}>Hoy</button>
          <button className="calendar-nav-btn" onClick={() => setCalendarMonth(new Date(year, month + 1, 1))} title="Mes siguiente"><ChevronRight size={19} /></button>
          <button className="calendar-add" onClick={onAdd} disabled={!connected || !calendarEntity}><Plus size={17} /> Nuevo evento</button>
        </div>
      </div>

      {!connected && <div className="calendar-empty">Conecta Home Assistant para cargar tus calendarios de Google.</div>}
      {connected && calendarEntities.length === 0 && <div className="calendar-empty">No se ha encontrado ningún calendario de Google.</div>}

      {connected && calendarEntities.length > 0 && (
        <div className="calendar-shell">
          <div className="calendar-weekdays">{["L", "M", "X", "J", "V", "S", "D"].map((day) => <div key={day}>{day}</div>)}</div>
          <div className="calendar-grid">
            {cells.map((date, index) => {
              const events = date ? eventsForDay(date) : [];
              const today = date && new Date().toDateString() === date.toDateString();
              return (
                <div className={date ? `calendar-day${today ? " today" : ""}` : "calendar-day outside"} key={index}>
                  {date && <div className="calendar-day-number">{date.getDate()}</div>}
                  <div className="calendar-events">
                    {events.slice(0, 4).map((event, eventIndex) => (
                      <div className="calendar-event" key={`${event.summary}-${event.start}-${eventIndex}`} title={event.description || event.summary}>
                        <span className="calendar-event-dot" />
                        <span className="calendar-event-time">{formatEventTime(event)}</span>
                        <span className="calendar-event-title">{event.summary}</span>
                      </div>
                    ))}
                    {events.length > 4 && <div className="calendar-more">+{events.length - 4} más</div>}
                  </div>
                </div>
              );
            })}
          </div>
          {calendarLoading && <div className="calendar-loading">Cargando eventos…</div>}
        </div>
      )}

      <div className="calendar-note">
        <CalendarDays size={16} /> Los eventos se leen directamente desde Home Assistant/Google Calendar.
      </div>

      {calendarModal && <CreateEventModal onClose={() => setCalendarModal(false)} onCreate={onCreate} />}
    </section>
  );
}

function CreateEventModal({ onClose, onCreate }) {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  const dateValue = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  const [summary, setSummary] = useState("");
  const [date, setDate] = useState(dateValue);
  const [start, setStart] = useState("10:00");
  const [end, setEnd] = useState("11:00");
  const [allDay, setAllDay] = useState(false);
  const [description, setDescription] = useState("");
  const [location, setLocation] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit(e) {
    e.preventDefault();
    if (!summary.trim()) return;
    setSaving(true);
    const result = allDay
      ? await onCreate({ summary: summary.trim(), description, location, start_date: date, end_date: addOneDay(date) })
      : await onCreate({ summary: summary.trim(), description, location, start_date_time: `${date} ${start}:00`, end_date_time: `${date} ${end}:00` });
    setSaving(false);
    if (!result) return;
  }

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <form className="event-modal" onSubmit={submit}>
        <div className="event-modal-head"><div><div className="eyebrow">GOOGLE CALENDAR</div><h3>Nuevo evento</h3></div><button type="button" className="modal-close" onClick={onClose}><X size={19} /></button></div>
        <label>Título<input autoFocus value={summary} onChange={(e) => setSummary(e.target.value)} placeholder="Título del evento" /></label>
        <div className="event-form-row"><label>Fecha<input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></label><label className="all-day-label"><span>Todo el día</span><input type="checkbox" checked={allDay} onChange={(e) => setAllDay(e.target.checked)} /></label></div>
        {!allDay && <div className="event-form-row"><label>Inicio<input type="time" value={start} onChange={(e) => setStart(e.target.value)} /></label><label>Fin<input type="time" value={end} onChange={(e) => setEnd(e.target.value)} /></label></div>}
        <label>Ubicación<input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Opcional" /></label>
        <label>Descripción<textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Opcional" rows="3" /></label>
        <div className="event-modal-actions"><button type="button" className="modal-cancel" onClick={onClose}>Cancelar</button><button type="submit" className="calendar-add" disabled={saving || !summary.trim()}>{saving ? "Guardando…" : "Guardar evento"}</button></div>
      </form>
    </div>
  );
}

function addOneDay(dateString) {
  const d = new Date(`${dateString}T00:00:00`);
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

function Placeholder({
  icon,
  title,
  text
}) {
  return (
    <section className="empty-page">
      <div className="empty-icon">
        {icon}
      </div>

      <h2>{title}</h2>
      <p>{text}</p>
    </section>
  );
}

function SettingsPage({
  config,
  setConfig
}) {
  const [url, setUrl] = useState(
    config.url || DEFAULT_URL
  );

  const [token, setToken] = useState(
    config.token || ""
  );

  const [price, setPrice] = useState(
    config.price ?? DEFAULT_PRICE
  );

  const [yesterday, setYesterday] =
    useState(
      config.yesterdayKwh ?? ""
    );

  function save() {
    const newConfig = {
      url,
      token,
      price: Number(price),
      yesterdayKwh:
        Number(yesterday) || 0
    };

    localStorage.setItem(
      "casa_config",
      JSON.stringify(newConfig)
    );

    setConfig(newConfig);
  }

  return (
    <section className="settings card">
      <h2>Configuración</h2>

      <p className="muted">
        Los datos se guardan localmente
        en este navegador.
      </p>

      <label>
        URL de Home Assistant

        <input
          value={url}
          onChange={(e) =>
            setUrl(e.target.value)
          }
          placeholder={DEFAULT_URL}
        />
      </label>

      <label>
        Token de acceso

        <input
          type="password"
          value={token}
          onChange={(e) =>
            setToken(e.target.value)
          }
          placeholder="Pega aquí tu token, sin compartirlo"
        />
      </label>

      <label>
        Precio de energía
        (€/kWh)

        <input
          type="number"
          step="0.001"
          value={price}
          onChange={(e) =>
            setPrice(e.target.value)
          }
        />
      </label>

      <label>
        Consumo de ayer
        (kWh)

        <input
          type="number"
          step="0.01"
          value={yesterday}
          onChange={(e) =>
            setYesterday(e.target.value)
          }
          placeholder="Se automatizará en la siguiente versión"
        />
      </label>

      <button
        className="save"
        onClick={save}
      >
        Guardar configuración
      </button>

      <div className="security">
        <Lock size={17} />

        <span>
          No incluyas tu token en mensajes
          ni lo publiques. Esta V1 lo guarda
          en el almacenamiento local del
          navegador.
        </span>
      </div>
    </section>
  );
}

createRoot(
  document.getElementById("root")
).render(
  <App />
);
