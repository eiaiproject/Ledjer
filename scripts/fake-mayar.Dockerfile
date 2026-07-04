FROM node:22-alpine

WORKDIR /app
COPY --chown=node:node scripts/fake-mayar-server.mjs ./server.mjs

USER node

EXPOSE 4567

HEALTHCHECK --interval=5s --timeout=3s --retries=12 CMD \
  node -e "fetch('http://127.0.0.1:4567/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "/app/server.mjs"]
