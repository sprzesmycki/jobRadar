# Receives GitHub push webhooks and queues a sibling-container deploy.
FROM debian:bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
      webhook git ca-certificates curl gnupg openssh-client && \
    install -m 0755 -d /etc/apt/keyrings && \
    curl -fsSL https://download.docker.com/linux/debian/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg && \
    chmod a+r /etc/apt/keyrings/docker.gpg && \
    echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/debian bookworm stable" > /etc/apt/sources.list.d/docker.list && \
    apt-get update && apt-get install -y --no-install-recommends \
      docker-ce-cli docker-compose-plugin && \
    rm -rf /var/lib/apt/lists/*

COPY hooks.json /etc/webhook/hooks.json
COPY deploy.sh /opt/jobradar/infra/webhook/deploy.sh
RUN chmod +x /opt/jobradar/infra/webhook/deploy.sh

EXPOSE 9000

CMD ["webhook", "-hooks", "/etc/webhook/hooks.json", "-port", "9000", "-template", "-verbose"]
