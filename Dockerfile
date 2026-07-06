FROM denoland/deno:2.1.4

WORKDIR /app

# Cache dependencies
COPY deno.json .
RUN deno cache --reload deno.json

# Copy application code
COPY . .

# Cache application dependencies
RUN deno cache main.ts dev.ts workers/main.ts

# denoland/deno base images already ship a non-root `deno` user; just
# make sure it owns the app directory.
RUN chown -R deno:deno /app

USER deno

EXPOSE 8000

CMD ["deno", "task", "start"]
