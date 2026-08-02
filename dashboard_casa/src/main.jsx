import React, { useEffect, useState } from "react";
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
  Minimize
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
            }

            return;
          }

          if (msg.id === 2 && msg.success) {
            console.log("Suscripción a cambios activa");
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
        ws?.close();
      } catch {}
    };
  }, [url, token]);

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
    ["Domótica", House],
    ["Tareas", CheckSquare],
    ["Compra", ShoppingCart],
    ["Calendario", CalendarDays],
    ["Ajustes", Settings]
  ];

  return (
    <div
      className="app"
      style={
        fullscreen
          ? {
              gridTemplateColumns: "1fr",
              width: "100vw",
              minHeight: "100vh"
            }
          : undefined
      }
    >
      <aside
        className="sidebar"
        style={fullscreen ? { display: "none" } : undefined}
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

        <nav>
          {nav.map(([name, Icon]) => (
            <button
              key={name}
              className={
                page === name
                  ? "nav active"
                  : "nav"
              }
              onClick={() => setPage(name)}
            >
              <Icon size={20} />
              <span>{name}</span>
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

      <main
        style={
          fullscreen
            ? {
                width: "100%",
                minHeight: "100vh",
                margin: 0
              }
            : undefined
        }
      >
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
            borderRadius: 12,
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

        <header style={fullscreen ? { display: "none" } : undefined}>
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
          <section className="grid">

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

            <section className="card">
              <CardHead
                icon={<Lightbulb />}
                title="Lámpara"
              />

              <div className="control-row">
                <div
                  className={
                    lampOn
                      ? "state-dot on"
                      : "state-dot"
                  }
                />

                <strong>
                  {lampOn
                    ? "Encendida"
                    : "Apagada"}
                </strong>

                <button
                  className={
                    lampOn
                      ? "lamp-toggle on"
                      : "lamp-toggle"
                  }
                  onClick={() =>
                    callService(
                      "switch",
                      lampOn
                        ? "turn_off"
                        : "turn_on",
                      ENTITIES.lamp
                    )
                  }
                >
                  <Power size={14} />
                  <span>
                    {lampOn ? "Apagar" : "Encender"}
                  </span>
                </button>
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
          <Placeholder
            icon={<CalendarDays />}
            title="Calendario"
            text="Preparado para integrar tus calendarios de Home Assistant."
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
