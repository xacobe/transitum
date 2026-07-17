FROM node:24-alpine
WORKDIR /app
COPY package.json .
RUN npm install --production
COPY *.js .
ENV PORT=3001
EXPOSE 3001
HEALTHCHECK --interval=10s --timeout=3s --retries=10 --start-period=15s \
  CMD wget -qO- http://127.0.0.1:3001/health || exit 1
CMD ["node", "index.js"]
