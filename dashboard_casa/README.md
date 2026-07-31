# Dashboard Casa

Dashboard estilo iOS/iPadOS para Home Assistant OS.

## Instalación rápida para probar

1. Instala Node.js 20+ en un equipo de desarrollo.
2. En esta carpeta ejecuta `npm install`.
3. Ejecuta `npm run dev`.
4. Abre la dirección que indique Vite.
5. En `Ajustes` introduce:
   - URL: `http://100.67.184.82:8123`
   - Tu token de Home Assistant (no lo compartas).
   - Precio: `0.216 €/kWh`.

## Entidades iniciales

- `switch.lampara`
- `script.modo_cine`
- `script.tv_apagar`
- `script.tv_encender`
- `script.tv_netflix`
- `binary_sensor.sensor_congelador_contact`
- `sensor.lampara_power`
- `sensor.lampara_energy`

## Importante

Esta primera versión guarda el token en localStorage del navegador. Para una instalación definitiva como add-on de Home Assistant se recomienda mover el secreto al backend/add-on y no exponerlo al navegador.

El histórico de "ayer" y el coste diario se conectarán a las estadísticas de Home Assistant en la siguiente iteración.