FROM denoland/deno:2.1.4

WORKDIR /app

# Cache dependencies
COPY deno.json .
RUN deno cache --reload deno.json

# Copy application code
COPY . .

# Cache application dependencies
RUN deno cache main.ts dev.ts workers/main.ts

# Build static assets (compiles Tailwind CSS, generates the Fresh
# snapshot). dev.ts's dotenv loader would otherwise fail validating
# unset optional env vars during this build-only step — no real env
# vars exist yet at image build time — so fake a deployment id to
# skip it, matching the same check main.ts uses at runtime.
RUN DENO_DEPLOYMENT_ID=docker-build deno task build

# denoland/deno base images already ship a non-root `deno` user; just
# make sure it owns the app directory.
RUN chown -R deno:deno /app

USER deno

EXPOSE 8000

CMD ["deno", "task", "start"]
