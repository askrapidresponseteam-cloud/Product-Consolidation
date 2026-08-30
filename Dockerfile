FROM node:22-alpine
WORKDIR /app
COPY package.json ./
COPY server ./server
COPY public ./public
COPY tools ./tools
ENV PORT=8080 DATA_DIR=/data
VOLUME ["/data"]
EXPOSE 8080
USER node
CMD ["node", "server/index.mjs"]
