/**
 * Access token for the runtime's own GCP identity, shared by every Google
 * Cloud API call that authenticates via IAM instead of an API key (Vertex AI,
 * Cloud Speech-to-Text, ...).
 */

const METADATA_TOKEN_URL =
  "http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token";

let cachedToken: { value: string; expiresAt: number } | null = null;

/**
 * On Cloud Run/Compute Engine this comes from the metadata server (the
 * attached service account); for local development it falls back to
 * `gcloud auth application-default print-access-token` (run
 * `gcloud auth application-default login` once).
 */
export async function getAccessToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 30_000) {
    return cachedToken.value;
  }

  const isDeployed = !!Deno.env.get("K_SERVICE") ||
    !!Deno.env.get("DENO_DEPLOYMENT_ID");

  if (isDeployed) {
    const response = await fetch(METADATA_TOKEN_URL, {
      headers: { "Metadata-Flavor": "Google" },
    });
    if (!response.ok) {
      throw new Error(
        `Failed to get access token from metadata server: ${response.status}`,
      );
    }
    const data = await response.json();
    cachedToken = {
      value: data.access_token,
      expiresAt: Date.now() + (data.expires_in - 30) * 1000,
    };
    return cachedToken.value;
  }

  const command = new Deno.Command("gcloud", {
    args: ["auth", "application-default", "print-access-token"],
    stdout: "piped",
    stderr: "piped",
  });
  const { success, stdout, stderr } = await command.output();
  if (!success) {
    throw new Error(
      `Failed to get local access token (run "gcloud auth application-default login"): ${
        new TextDecoder().decode(stderr)
      }`,
    );
  }
  const token = new TextDecoder().decode(stdout).trim();
  cachedToken = { value: token, expiresAt: Date.now() + 25 * 60 * 1000 };
  return token;
}
