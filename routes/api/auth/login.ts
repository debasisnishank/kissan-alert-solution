import { Handlers } from "$fresh/server.ts";
import { z } from "zod";
import {
  createSession,
  createUser,
  getUserByUsername,
  updatePassword,
  verifyPassword,
} from "$lib/auth.ts";
import { setSessionCookie } from "../../../middlewares/auth.ts";
import { env } from "$utils/env.ts";

const LoginInput = z.object({
  action: z.literal("login"),
  username: z.string().min(1, "Username is required"),
  password: z.string().min(1, "Password is required"),
});

const RegisterInput = z.object({
  action: z.literal("register"),
  username: z.string().min(3).max(50).regex(
    /^[a-zA-Z0-9_]+$/,
    "Username can only contain letters, numbers, and underscores",
  ),
  password: z.string().min(6, "Password must be at least 6 characters"),
  name: z.string().min(2).max(100),
  email: z.string().email().optional().or(z.literal("")),
});

const ChangePasswordInput = z.object({
  action: z.literal("change_password"),
  username: z.string().min(1),
  currentPassword: z.string().min(1),
  newPassword: z.string().min(6, "New password must be at least 6 characters"),
});

export const handler: Handlers = {
  async POST(req) {
    try {
      const body = await req.json();
      const action = body.action;

      // --- LOGIN ---
      if (action === "login") {
        const input = LoginInput.parse(body);
        const user = await getUserByUsername(input.username);

        if (!user || !user.isActive) {
          return Response.json(
            { error: "Invalid username or password" },
            { status: 401 },
          );
        }

        // Check password
        if (!user.passwordHash) {
          // Old user with no password: their default password is their username (old phone without +91)
          if (input.password !== input.username) {
            return Response.json(
              { error: "Invalid username or password" },
              { status: 401 },
            );
          }
        } else {
          const valid = await verifyPassword(input.password, user.passwordHash);
          if (!valid) {
            return Response.json(
              { error: "Invalid username or password" },
              { status: 401 },
            );
          }
        }

        // Create session
        const token = await createSession(user.id);

        const responseData: Record<string, unknown> = {
          success: true,
          user: {
            id: user.id,
            name: user.name,
            username: user.username,
            phone: user.phone,
            role: user.role,
            language: user.language,
          },
          forcePasswordChange: user.forcePasswordChange,
        };

        const response = Response.json(responseData);
        setSessionCookie(response.headers, token);
        return response;
      }

      // --- REGISTER ---
      if (action === "register") {
        const input = RegisterInput.parse(body);

        // Check if username already taken
        const existing = await getUserByUsername(input.username);
        if (existing) {
          return Response.json(
            { error: "Username already taken" },
            { status: 409 },
          );
        }

        const user = await createUser({
          tenantId: env.DEFAULT_TENANT_ID,
          username: input.username,
          password: input.password,
          name: input.name,
          email: input.email || undefined,
        });

        const token = await createSession(user.id);

        const response = Response.json({
          success: true,
          user: {
            id: user.id,
            name: user.name,
            username: user.username,
            phone: user.phone,
            role: user.role,
            language: user.language,
          },
        });

        setSessionCookie(response.headers, token);
        return response;
      }

      // --- CHANGE PASSWORD ---
      if (action === "change_password") {
        const input = ChangePasswordInput.parse(body);
        const user = await getUserByUsername(input.username);

        if (!user || !user.isActive) {
          return Response.json(
            { error: "Invalid credentials" },
            { status: 401 },
          );
        }

        // Verify current password
        if (!user.passwordHash) {
          if (input.currentPassword !== input.username) {
            return Response.json(
              { error: "Current password is incorrect" },
              { status: 401 },
            );
          }
        } else {
          const valid = await verifyPassword(
            input.currentPassword,
            user.passwordHash,
          );
          if (!valid) {
            return Response.json(
              { error: "Current password is incorrect" },
              { status: 401 },
            );
          }
        }

        // Cannot reuse the same password
        if (input.newPassword === input.currentPassword) {
          return Response.json(
            { error: "New password must be different from current password" },
            { status: 400 },
          );
        }

        await updatePassword(user.id, input.newPassword);

        // Create fresh session
        const token = await createSession(user.id);
        const response = Response.json({
          success: true,
          message: "Password changed successfully",
          user: { role: user.role },
        });
        setSessionCookie(response.headers, token);
        return response;
      }

      return Response.json({ error: "Invalid action" }, { status: 400 });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return Response.json(
          { error: "Validation error", details: error.errors },
          { status: 400 },
        );
      }

      console.error("Login error:", error);
      return Response.json(
        { error: "Internal server error" },
        { status: 500 },
      );
    }
  },
};
