# FlowTwin — static build of the frontend served by nginx on :8000
# (Koyeb service expects HTTP on port 8000; SPA fallback to index.html)

FROM node:22-alpine AS build
# keep the repo layout: the @seed alias resolves to ../data/seed
WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
COPY data/seed/ /app/data/seed/
RUN npm run build

FROM nginx:alpine
# live-plane proxies render from the template at boot: set
# FLOWTWIN_GEMINI_KEY / FLOWTWIN_NVIDIA_KEY in the service env to go live;
# without them /api/live-status reports both planes off (deterministic build)
COPY deploy/nginx.conf.template /etc/nginx/templates/default.conf.template
COPY deploy/15-flowtwin-env.sh /docker-entrypoint.d/15-flowtwin-env.sh
RUN chmod +x /docker-entrypoint.d/15-flowtwin-env.sh && rm -f /etc/nginx/conf.d/default.conf
COPY --from=build /app/frontend/dist /usr/share/nginx/html
EXPOSE 8000
