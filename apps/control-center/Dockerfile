FROM node:22-alpine

WORKDIR /app

COPY apps/control-center ./

EXPOSE 80

ENV CONTROL_CENTER_PORT=80

CMD ["node", "server.js"]
