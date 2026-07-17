FROM alpine:3.21
ARG PB_VERSION=0.27.1

RUN apk add --no-cache unzip ca-certificates && \
    wget -qO /tmp/pb.zip \
      "https://github.com/pocketbase/pocketbase/releases/download/v${PB_VERSION}/pocketbase_${PB_VERSION}_linux_amd64.zip" && \
    unzip /tmp/pb.zip -d /pb && \
    rm /tmp/pb.zip && \
    chmod +x /pb/pocketbase

COPY pb_migrations/ /pb/pb_migrations/

EXPOSE 8090

CMD ["/pb/pocketbase", "serve", "--http=0.0.0.0:8090", "--dir=/pb/pb_data", "--migrationsDir=/pb/pb_migrations"]
