FROM ghcr.io/home-assistant/base:latest

ARG BUILD_VERSION
ARG BUILD_ARCH

LABEL \
    io.hass.version="${BUILD_VERSION}" \
    io.hass.type="app" \
    io.hass.arch="${BUILD_ARCH}"

WORKDIR /app

RUN apk add --no-cache \
    nodejs \
    npm

COPY package*.json ./

RUN npm install

COPY . .

RUN npm run build

COPY run.sh /run.sh

RUN chmod +x /run.sh

ENV NODE_ENV=production
ENV PORT=8099

EXPOSE 8099

COPY run.sh /run.sh
RUN chmod +x /run.sh

CMD ["/run.sh"]
