# The engine image: the release archive unpacked onto the path. The archive is
# copied at build time only and is never in git (bin/fetch-engine.sh gets it
# from the OptimalMatch/peer-to-peer-db releases). This release carries DuckDB
# inside every binary, so nothing else is installed.
FROM debian:bookworm-slim
ARG UNIDATUM_VERSION
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates curl \
 && rm -rf /var/lib/apt/lists/*
COPY unidatum-${UNIDATUM_VERSION}-linux-amd64.tar.gz /tmp/unidatum.tar.gz
RUN mkdir -p /opt/unidatum \
 && tar xzf /tmp/unidatum.tar.gz -C /opt/unidatum --strip-components=1 \
 && rm /tmp/unidatum.tar.gz \
 && ln -s /opt/unidatum/unidatum /usr/local/bin/unidatum \
 && ln -s /opt/unidatum/unidatum-sqld /usr/local/bin/unidatum-sqld \
 && unidatum version
COPY entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh
WORKDIR /data
ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
