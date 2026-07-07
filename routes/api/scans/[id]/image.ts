import { Handlers } from "$fresh/server.ts";
import { queryOne } from "$db/client.ts";
import type { AuthState } from "../../../../middlewares/auth.ts";

export const handler: Handlers<unknown, AuthState> = {
  async GET(_req, ctx) {
    if (!ctx.state.session) {
      return new Response("Unauthorized", { status: 401 });
    }

    const row = await queryOne<{ image_data: string }>(
      `SELECT image_data FROM crop_scans WHERE id = $1 AND farmer_id = $2`,
      [ctx.params.id, ctx.state.session.userId],
    );

    if (!row) return new Response("Not found", { status: 404 });

    const match = row.image_data.match(/^data:(image\/[\w+.-]+);base64,(.+)$/);
    if (!match) return new Response("Invalid image", { status: 500 });

    const [, mimeType, base64] = match;
    const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));

    return new Response(bytes, {
      headers: {
        "Content-Type": mimeType,
        "Cache-Control": "private, max-age=86400",
      },
    });
  },
};
