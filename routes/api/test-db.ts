import { Handlers } from "$fresh/server.ts";
import { queryOne } from "$db/client.ts";

export const handler: Handlers = {
  async GET() {
    try {
      const result = await queryOne<{ now: Date }>("SELECT NOW() as now");

      return new Response(
        JSON.stringify({
          success: true,
          message: "Database connection successful",
          timestamp: result?.now,
        }),
        {
          headers: { "Content-Type": "application/json" },
        },
      );
    } catch (error) {
      console.error("Database test error:", error);

      return new Response(
        JSON.stringify({
          success: false,
          error: error instanceof Error ? error.message : String(error),
          type: error instanceof Error ? error.name : "Unknown",
        }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" },
        },
      );
    }
  },
};
