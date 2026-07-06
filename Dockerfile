FROM denoland/deno:2.1.4

WORKDIR /app

# Cache dependencies
COPY deno.json .
RUN deno cache --reload deno.json

# Copy application code
COPY . .

# Cache application dependencies
RUN deno cache main.ts dev.ts workers/main.ts

# Create non-root user
RUN addgroup --system --gid 1001 deno && \
    adduser --system --uid 1001 --gid 1001 deno && \
    chown -R deno:deno /app

USER deno

EXPOSE 8000

CMD ["deno", "task", "start"]
