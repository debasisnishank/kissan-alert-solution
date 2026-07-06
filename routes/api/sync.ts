import { Handlers } from "$fresh/server.ts";
import { query, queryOne } from "../../db/client.ts";

export const handler: Handlers = {
  async POST(req, ctx) {
    try {
      const user = ctx.state.user;
      if (!user) {
        return Response.json({ error: "Unauthorized" }, { status: 401 });
      }

      const { observations } = await req.json();

      if (!observations || !Array.isArray(observations)) {
        return Response.json(
          { error: "Observations array is required" },
          { status: 400 },
        );
      }

      let synced = 0;

      for (const obs of observations) {
        // Verify farm belongs to user
        const farmCheck = await queryOne<{ id: string }>(
          `SELECT id FROM farms WHERE id = $1 AND user_id = $2`,
          [obs.farmId, user.id],
        );

        if (!farmCheck) {
          continue;
        }

        // Insert observation
        await query(
          `INSERT INTO field_observations (
            id, farm_id, observation_type, observation_value, observed_at, created_at
          ) VALUES (
            gen_random_uuid(), $1, $2, $3, $4::timestamp, NOW()
          )
          ON CONFLICT DO NOTHING`,
          [obs.farmId, obs.type, obs.value, obs.timestamp],
        );

        synced++;
      }

      return Response.json({ synced });
    } catch (error) {
      console.error("Sync error:", error);
      return Response.json({ error: "Sync failed" }, { status: 500 });
    }
  },
};
