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
  Moon
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

function loadConfig() {
  try {
    return {
      ...JSON.parse(
        localStorage.getItem("casa_config") || "{}"
      )
    };
  } catch {
    return {};
  }
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

  const url = config.url || DEFAULT_URL;

  const token = config.token || "";

  /*
   * TEMA
   */

  useEffect(() => {
    document.documentElement.dataset.theme =
      dark ? "dark" : "light";

    localStorage.setItem(
      "casa_dark",
      dark ? "1" : "0"
    );
  }, [dark]);

  /*
   * CONEXIÓN EN TIEMPO REAL CON HOME ASSISTANT
   */

  useEffect(() => {
    if (!token) {
      setConnected(false);
      setStates({});
      return;
    }

    let ws = null;
    let alive = true;

    try {
      const wsUrl =
        url.replace(/^http/, "ws") +
        "/api/websocket";

      ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        console.log(
          "WebSocket conectado"
        );
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(
            event.data
          );

          /*
           * AUTENTICACIÓN
           */

          if (
            msg.type ===
            "auth_required"
          ) {
            ws.send(
              JSON.stringify({
                type: "auth",
                access_token: token
              })
            );

            return;
          }

          /*
           * AUTENTICACIÓN CORRECTA
           */

          if (
            msg.type ===
            "auth_ok"
          ) {
            console.log(
              "Home Assistant autenticado"
            );

            if (alive) {
              setConnected(true);
            }

            /*
             * ESTADOS INICIALES
             */

            ws.send(
              JSON.stringify({
                id: 1,
                type: "get_states"
              })
            );

            /*
             * SUSCRIPCIÓN A CAMBIOS
             */

            ws.send(
              JSON.stringify({
                id: 2,
                type: "subscribe_events",
                event_type:
                  "state_changed"
              })
            );

            return;
          }

          /*
           * ESTADOS INICIALES
           */

          if (
            msg.id === 1 &&
            msg.success
          ) {
            const map =
              Object.fromEntries(
                msg.result.map(
                  (entity) => [
                    entity.entity_id,
                    entity
                  ]
                )
              );

            if (alive) {
              setStates(map);
            }

            return;
          }

          /*
           * SUSCRIPCIÓN CORRECTA
           */

          if (
            msg.id === 2 &&
            msg.success
          ) {
            console.log(
              "Suscripción a cambios activa"
            );

            return;
          }

          /*
           * CAMBIO DE ESTADO EN TIEMPO REAL
           */

          if (
            msg.type === "event" &&
            msg.event &&
            msg.event.event_type ===
              "state_changed"
          ) {
            const eventData =
              msg.event.data;

            if (
              !eventData ||
              !eventData.entity_id
            ) {
              return;
            }

            const entityId =
              eventData.entity_id;

            const newState =
              eventData.new_state;

            if (
              !newState ||
              !alive
            ) {
              return;
            }

            setStates(
              (previous) => ({
                ...previous,
                [entityId]:
                  newState
              })
            );

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
        console.log(
          "WebSocket cerrado"
        );

        if (alive) {
          setConnected(false);
        }
      };

      ws.onerror = (error) => {
        console.error(
          "Error WebSocket:",
          error
        );

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

  /*
   * OBTENER ESTADO
   */

  const state = (entityId) => {
    return states[entityId]?.state;
  };

  /*
   * OBTENER ATRIBUTO
   */

  const attr = (
    entityId,
    key
  ) => {
    return states[entityId]
      ?.attributes?.[key];
  };

  /*
   * EJECUTAR SERVICIO
   */

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
      const response =
        await fetch(
          `${url}/api/services/${domain}/${service}`,
          {
            method: "POST",

            headers: {
              Authorization:
                `Bearer ${token}`,

              "Content-Type":
                "application/json"
            },

            body: JSON.stringify({
              entity_id
            })
          }
        );

      if (!response.ok) {
        throw new Error(
          `HTTP ${response.status}`
        );
      }

      setMessage(
        "Acción enviada"
      );

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

  /*
   * LÁMPARA
   */

  const lampOn =
    state(ENTITIES.lamp) ===
    "on";

  /*
   * CONGELADOR
   *
   * on  = abierto
   * off = cerrado
   */

  const freezerOpen =
    state(
      ENTITIES.freezer
    ) === "on";

  /*
   * CONSUMO
   */

  const power =
    state(ENTITIES.power);

  const energy =
    Number(
      state(ENTITIES.energy)
    );

  const price =
    Number(
      config.price ??
        DEFAULT_PRICE
    );

  const yesterdayKwh =
    Number(
      config.yesterdayKwh ?? 0
    );

  const yesterdayCost =
    yesterdayKwh * price;

  /*
   * NAVEGACIÓN
   */

  const nav = [
    ["Domótica", House],
    ["Tareas", CheckSquare],
    ["Compra", ShoppingCart],
    ["Calendario", CalendarDays],
    ["Ajustes", Settings]
  ];

  return (
    <div className="app">

      {/* SIDEBAR */}

      <aside className="sidebar">

        <div className="brand">

          <div className="brand-icon">
            <House size={22} />
          </div>

          <div>
            <b>Mi Casa</b>
            <span>
              Dashboard
            </span>
          </div>

        </div>

        <nav>

          {nav.map(
            ([name, Icon]) => (
              <button
                key={name}
                className={
                  page === name
                    ? "nav active"
                    : "nav"
                }
                onClick={() =>
                  setPage(name)
                }
              >
                <Icon size={20} />

                <span>
                  {name}
                </span>
              </button>
            )
          )}

        </nav>

        <div className="sidebar-bottom">

          <button
            className="theme-btn"
            onClick={() =>
              setDark(!dark)
            }
          >

            {dark ? (
              <Sun size={19} />
            ) : (
              <Moon size={19} />
            )}

            {dark
              ? "Modo claro"
              : "Modo oscuro"}

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

      {/* CONTENIDO */}

      <main>

        <header>

          <div>

            <div className="eyebrow">
              MI CASA
            </div>

            <h1>
              {page}
            </h1>

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

        {/* =========================
            DOMÓTICA
        ========================= */}

        {page === "Domótica" && (

          <section className="grid">

            {/* TEMPERATURA */}

            <Card
              title="Temperatura"
              icon={
                <span className="emoji">
                  🌡️
                </span>
              }
              muted
              value="—"
              sub="Sin sensor todavía"
            />

            {/* HUMEDAD */}

            <Card
              title="Humedad"
              icon={
                <span className="emoji">
                  💧
                </span>
              }
              muted
              value="—"
              sub="Sin sensor todavía"
            />

            {/* =========================
                LÁMPARA
            ========================= */}

            <section className="card wide">

              <CardHead
                icon={<Lightbulb />}
                title="Lámpara salón"
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
                  className="ios-button"
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

                  <Power size={17} />

                  {lampOn
                    ? "Apagar"
                    : "Encender"}

                </button>

              </div>

            </section>

            {/* =========================
                TV SALÓN
            ========================= */}

            <section className="card wide">

              <CardHead
                icon={<Tv />}
                title="TV salón"
              />

              <div className="button-grid">

                {/* MODO CINE */}

                <ActionButton
                  icon={
                    <Film />
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

                {/* TV ENCENDER */}

                <ActionButton
                  icon={
                    <Power />
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

                {/* TV APAGAR */}

                <ActionButton
                  icon={
                    <Power />
                  }
                  text="TV Apagar"
                  danger
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
                  icon={
                    <img
                      src="/apps/netflix.png"
                      className="app-icon"
                      alt="Netflix"
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
                  icon={
                    <img
                      src="/apps/hbo-max.png"
                      className="app-icon"
                      alt="HBO Max"
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
                  icon={
                    <img
                      src="/apps/prime-video.png"
                      className="app-icon"
                      alt="Prime Video"
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

                {/* MOVISTAR */}

                <ActionButton
                  icon={
                    <img
                      src="/apps/movistar.png"
                      className="app-icon"
                      alt="Movistar"
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

                {/* MAX */}

                <ActionButton
                  icon={
                    <img
                      src="/apps/max.png"
                      className="app-icon"
                      alt="Max"
                    />
                  }
                  text="Max"
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
                CONGELADOR
            ========================= */}

            <section className="card">

              <CardHead
                icon={
                  <Snowflake />
                }
                title="Congelador"
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

              <p className="muted">

                {freezerOpen
                  ? "La puerta está abierta"
                  : "Puerta cerrada correctamente"}

              </p>

            </section>

            {/* =========================
                PERSIANAS
            ========================= */}

            <section className="card">

              <CardHead
                icon={
                  <Blinds />
                }
                title="Persianas"
                right="Próximamente"
              />

              <div className="blind">

                <div>

                  <b>
                    Salón
                  </b>

                  <span>
                    Sin entidad todavía
                  </span>

                </div>

                <div className="blind-buttons">

                  <button disabled>
                    ↑
                  </button>

                  <button disabled>
                    ■
                  </button>

                  <button disabled>
                    ↓
                  </button>

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

                  <button disabled>
                    ↑
                  </button>

                  <button disabled>
                    ■
                  </button>

                  <button disabled>
                    ↓
                  </button>

                </div>

              </div>

            </section>

            {/* =========================
                CONSUMO
            ========================= */}

            <section className="card wide">

              <CardHead
                icon={
                  <Zap />
                }
                title="Consumo lámpara"
                right={`${price.toFixed(
                  3
                )} €/kWh`}
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
                    Number.isFinite(
                      energy
                    )
                      ? `${energy.toFixed(
                          2
                        )} kWh`
                      : "—"
                  }
                />

                <Stat
                  label="Ayer"
                  value={
                    yesterdayKwh
                      ? `${yesterdayKwh.toFixed(
                          2
                        )} kWh`
                      : "Configurar"
                  }
                />

                <Stat
                  label="Coste ayer"
                  value={
                    yesterdayKwh
                      ? `${yesterdayCost.toFixed(
                          3
                        )} €`
                      : "—"
                  }
                />

              </div>

              <div className="mini-chart">

                <span
                  style={{
                    height: "28%"
                  }}
                />

                <span
                  style={{
                    height: "44%"
                  }}
                />

                <span
                  style={{
                    height: "35%"
                  }}
                />

                <span
                  style={{
                    height: "65%"
                  }}
                />

                <span
                  style={{
                    height: "48%"
                  }}
                />

                <span
                  style={{
                    height: "30%"
                  }}
                />

                <span
                  style={{
                    height: "52%"
                  }}
                />

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

          </section>

        )}

        {/* TAREAS */}

        {page === "Tareas" && (
          <Placeholder
            icon={
              <CheckSquare />
            }
            title="Tareas / Recordatorios"
            text="Preparado para integrar tus listas todo de Home Assistant."
          />
        )}

        {/* COMPRA */}

        {page === "Compra" && (
          <Placeholder
            icon={
              <ShoppingCart />
            }
            title="Lista de la compra"
            text="Preparado para integrar tu lista de compra de Home Assistant."
          />
        )}

        {/* CALENDARIO */}

        {page === "Calendario" && (
          <Placeholder
            icon={
              <CalendarDays />
            }
            title="Calendario"
            text="Preparado para integrar tus calendarios de Home Assistant."
          />
        )}

        {/* AJUSTES */}

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


/*
 * =========================
 * CARD
 * =========================
 */

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

      <p className="muted">
        {sub}
      </p>

    </section>
  );
}


/*
 * =========================
 * CABECERA CARD
 * =========================
 */

function CardHead({
  icon,
  title,
  right
}) {
  return (
    <div className="card-head">

      <div className="card-title">

        {icon}

        <b>
          {title}
        </b>

      </div>

      {right && (
        <span className="badge">
          {right}
        </span>
      )}

    </div>
  );
}


/*
 * =========================
 * BOTÓN ACCIÓN
 * =========================
 */

function ActionButton({
  icon,
  text,
  on,
  danger
}) {
  return (
    <button
      className={
        danger
          ? "action danger"
          : "action"
      }
      onClick={on}
    >

      {icon}

      <span>
        {text}
      </span>

      <ChevronRight
        size={17}
      />

    </button>
  );
}


/*
 * =========================
 * ESTADÍSTICA
 * =========================
 */

function Stat({
  label,
  value
}) {
  return (
    <div>

      <span>
        {label}
      </span>

      <strong>
        {value}
      </strong>

    </div>
  );
}


/*
 * =========================
 * PÁGINAS VACÍAS
 * =========================
 */

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

      <h2>
        {title}
      </h2>

      <p>
        {text}
      </p>

    </section>
  );
}


/*
 * =========================
 * AJUSTES
 * =========================
 */

function SettingsPage({
  config,
  setConfig
}) {
  const [url, setUrl] =
    useState(
      config.url ||
        DEFAULT_URL
    );

  const [token, setToken] =
    useState(
      config.token || ""
    );

  const [price, setPrice] =
    useState(
      config.price ??
        DEFAULT_PRICE
    );

  const [yesterday, setYesterday] =
    useState(
      config.yesterdayKwh ??
        ""
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
      JSON.stringify(
        newConfig
      )
    );

    setConfig(newConfig);
  }

  return (
    <section className="settings card">

      <h2>
        Configuración
      </h2>

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
          placeholder={
            DEFAULT_URL
          }
        />

      </label>

      <label>

        Token de acceso

        <input
          type="password"
          value={token}
          onChange={(e) =>
            setToken(
              e.target.value
            )
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
            setPrice(
              e.target.value
            )
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
            setYesterday(
              e.target.value
            )
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
  document.getElementById(
    "root"
  )
).render(
  <App />
);
