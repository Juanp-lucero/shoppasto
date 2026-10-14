FROM node:24.13.0-alpine
WORKDIR /app
ARG NPM_CONFIG_REGISTRY=https://registry.npmjs.org/
RUN npm install --global pnpm@10.26.1 --registry="${NPM_CONFIG_REGISTRY}"
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --registry="${NPM_CONFIG_REGISTRY}"
COPY . .
EXPOSE 4200
CMD ["pnpm", "exec", "ng", "serve", "--host", "0.0.0.0", "--proxy-config", "proxy.conf.json"]
