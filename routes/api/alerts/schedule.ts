import { Handlers } from "$fresh/server.ts";
import { execute, query } from "$db/client.ts";
import type { AuthState } from "../../../middlewares/auth.ts";

interface ScheduleAlertRequest {
  farmId: string;
  type: "weather" | "pest" | "irrigation" | "fertilizer" | "harvest" | "custom";
  interval: "daily" | "weekly" | "biweekly" | "monthly";
  message?: string;
  enabled: boolean;
}

export const handler: Handlers<unknown, AuthState> = {
  // Get scheduled alerts for a farm
  async GET(req, ctx) {
    if (!ctx.state.session) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    const url = new URL(req.url);
    const farmId = url.searchParams.get("farmId");

    if (!farmId) {
      return new Response(JSON.stringify({ error: "farmId required" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    try {
      const schedules = await query<{
        id: string;
        farm_id: string;
        type: string;
        interval: string;
        message: string;
        enabled: boolean;
        next_run: Date;
        last_run: Date | null;
      }>(
        `SELECT id, farm_id, type, interval, message, enabled, next_run, last_run
         FROM alert_schedules
         WHERE farm_id = $1
         ORDER BY created_at DESC`,
        [farmId],
      );

      return new Response(
        JSON.stringify({
          schedules: schedules.map((s) => ({
            id: s.id,
            farmId: s.farm_id,
            type: s.type,
            interval: s.interval,
            message: s.message,
            enabled: s.enabled,
            nextRun: s.next_run,
            lastRun: s.last_run,
          })),
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      );
    } catch {
      // Table might not exist, return empty
      return new Response(
        JSON.stringify({ schedules: [] }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      );
    }
  },

  // Create or update scheduled alert
  async POST(req, ctx) {
    if (!ctx.state.session) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    const body: ScheduleAlertRequest = await req.json();
    const { farmId, type, interval, message, enabled } = body;

    if (!farmId || !type || !interval) {
      return new Response(
        JSON.stringify({ error: "Missing required fields" }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    // Calculate next run time based on interval
    const nextRun = new Date();

    switch (interval) {
      case "daily":
        nextRun.setDate(nextRun.getDate() + 1);
        nextRun.setHours(6, 0, 0, 0); // 6 AM
        break;
      case "weekly":
        nextRun.setDate(nextRun.getDate() + 7);
        nextRun.setHours(6, 0, 0, 0);
        break;
      case "biweekly":
        nextRun.setDate(nextRun.getDate() + 14);
        nextRun.setHours(6, 0, 0, 0);
        break;
      case "monthly":
        nextRun.setMonth(nextRun.getMonth() + 1);
        nextRun.setHours(6, 0, 0, 0);
        break;
    }

    try {
      // Check if schedule exists
      const existing = await query<{ id: string }>(
        `SELECT id FROM alert_schedules WHERE farm_id = $1 AND type = $2`,
        [farmId, type],
      );

      if (existing.length > 0) {
        // Update existing
        await execute(
          `UPDATE alert_schedules
           SET interval = $1, message = $2, enabled = $3, next_run = $4, updated_at = NOW()
           WHERE farm_id = $5 AND type = $6`,
          [interval, message || "", enabled, nextRun, farmId, type],
        );
      } else {
        // Create new
        await execute(
          `INSERT INTO alert_schedules (id, farm_id, type, interval, message, enabled, next_run, created_at)
           VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, NOW())`,
          [farmId, type, interval, message || "", enabled, nextRun],
        );
      }

      return new Response(
        JSON.stringify({
          success: true,
          message: `Alert schedule ${
            existing.length > 0 ? "updated" : "created"
          }`,
          nextRun: nextRun.toISOString(),
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      );
    } catch (e) {
      console.error("Error scheduling alert:", e);
      return new Response(
        JSON.stringify({ error: "Failed to schedule alert" }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" },
        },
      );
    }
  },

  // Delete scheduled alert
  async DELETE(req, ctx) {
    if (!ctx.state.session) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    const url = new URL(req.url);
    const scheduleId = url.searchParams.get("id");

    if (!scheduleId) {
      return new Response(JSON.stringify({ error: "id required" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    try {
      await execute(`DELETE FROM alert_schedules WHERE id = $1`, [scheduleId]);

      return new Response(
        JSON.stringify({ success: true, message: "Schedule deleted" }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      );
    } catch (e) {
      console.error("Error deleting schedule:", e);
      return new Response(
        JSON.stringify({ error: "Failed to delete schedule" }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" },
        },
      );
    }
  },
};
