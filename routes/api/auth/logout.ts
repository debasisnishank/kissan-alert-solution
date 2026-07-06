import { Handlers } from "$fresh/server.ts";
import { invalidateSession } from "$lib/auth.ts";
import {
  clearSessionCookie,
  getSessionToken,
} from "../../../middlewares/auth.ts";

export const handler: Handlers = {
  async POST(req) {
    const token = getSessionToken(req);

    if (token) {
      await invalidateSession(token);
    }

    // Redirect to login page after logout
    const response = new Response(null, {
      status: 302,
      headers: { Location: "/login" },
    });

    clearSessionCookie(response.headers);
    return response;
  },

  // Also support GET for direct link logout
  async GET(req) {
    const token = getSessionToken(req);

    if (token) {
      await invalidateSession(token);
    }

    const response = new Response(null, {
      status: 302,
      headers: { Location: "/login" },
    });

    clearSessionCookie(response.headers);
    return response;
  },
};
