import { execute, queryOne } from "$db/client.ts";
import { ROLE_PERMISSIONS } from "$utils/constants.ts";
import type { Session, User } from "$utils/types.ts";
import { encodeHex } from "https://deno.land/std@0.224.0/encoding/hex.ts";

const SESSION_DURATION_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

// In-memory session cache (TTL 60s) to avoid 2 DB queries on every request
const SESSION_CACHE = new Map<
  string,
  { session: Session; user: User; expiresAt: number }
>();
const SESSION_CACHE_TTL = 60_000; // 60 seconds
const SESSION_CACHE_MAX = 10_000;

function getCachedSession(
  tokenHash: string,
): { session: Session; user: User } | null {
  const entry = SESSION_CACHE.get(tokenHash);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    SESSION_CACHE.delete(tokenHash);
    return null;
  }
  return { session: entry.session, user: entry.user };
}

function setCachedSession(
  tokenHash: string,
  session: Session,
  user: User,
): void {
  // Evict oldest entries if cache is full
  if (SESSION_CACHE.size >= SESSION_CACHE_MAX) {
    const firstKey = SESSION_CACHE.keys().next().value;
    if (firstKey) SESSION_CACHE.delete(firstKey);
  }
  SESSION_CACHE.set(tokenHash, {
    session,
    user,
    expiresAt: Date.now() + SESSION_CACHE_TTL,
  });
}

export function invalidateSessionCache(tokenHash: string): void {
  SESSION_CACHE.delete(tokenHash);
}

export async function hashToken(token: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(token);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

// Password hashing using PBKDF2 (native to Deno, no external deps)
export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    encoder.encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt: salt,
      iterations: 100000,
      hash: "SHA-256",
    },
    keyMaterial,
    256,
  );
  const hashArray = new Uint8Array(derivedBits);
  const saltHex = encodeHex(salt);
  const hashHex = encodeHex(hashArray);
  return `pbkdf2:100000:${saltHex}:${hashHex}`;
}

export async function verifyPassword(
  password: string,
  storedHash: string,
): Promise<boolean> {
  const parts = storedHash.split(":");
  if (parts[0] !== "pbkdf2" || parts.length !== 4) {
    // Legacy: if the stored hash equals the plaintext phone (old migration default),
    // allow login but flag for change
    return password === storedHash;
  }
  const iterations = parseInt(parts[1]);
  const saltHex = parts[2];
  const expectedHashHex = parts[3];

  const salt = new Uint8Array(
    saltHex.match(/.{2}/g)!.map((b) => parseInt(b, 16)),
  );
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    encoder.encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt: salt,
      iterations: iterations,
      hash: "SHA-256",
    },
    keyMaterial,
    256,
  );
  const hashHex = encodeHex(new Uint8Array(derivedBits));
  return hashHex === expectedHashHex;
}

export function generateToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function createSession(userId: string): Promise<string> {
  const token = generateToken();
  const tokenHash = await hashToken(token);
  const expiresAt = new Date(Date.now() + SESSION_DURATION_MS);

  await execute(
    `INSERT INTO sessions (user_id, token_hash, expires_at) VALUES ($1, $2, $3)`,
    [userId, tokenHash, expiresAt],
  );

  return token;
}

export async function validateSession(token: string): Promise<Session | null> {
  const tokenHash = await hashToken(token);

  const result = await queryOne<{
    user_id: string;
    tenant_id: string;
    role: string;
    expires_at: Date;
  }>(
    `SELECT s.user_id, u.tenant_id, u.role, s.expires_at
     FROM sessions s
     JOIN users u ON s.user_id = u.id
     WHERE s.token_hash = $1 AND s.expires_at > NOW() AND u.is_active = true`,
    [tokenHash],
  );

  if (!result) return null;

  const permissions = ROLE_PERMISSIONS[result.role] || [];

  return {
    userId: result.user_id,
    tenantId: result.tenant_id,
    role: result.role,
    permissions,
    expiresAt: result.expires_at,
  };
}

export async function validateSessionWithUser(
  token: string,
): Promise<{ session: Session; user: User } | null> {
  const tokenHash = await hashToken(token);

  // Check cache first
  const cached = getCachedSession(tokenHash);
  if (cached) return cached;

  // Single query: session + user data in one round-trip
  const result = await queryOne<{
    user_id: string;
    tenant_id: string;
    role: string;
    expires_at: Date;
    phone: string;
    name: string;
    email: string | null;
    language: string;
    is_active: boolean;
    avatar_url: string | null;
    username: string | null;
    force_password_change: boolean;
    created_at: Date;
    updated_at: Date;
  }>(
    `SELECT s.user_id, u.tenant_id, u.role, s.expires_at,
            u.phone, u.name, u.email, u.language, u.is_active,
            u.avatar_url, u.username, u.force_password_change,
            u.created_at, u.updated_at
     FROM sessions s
     JOIN users u ON s.user_id = u.id
     WHERE s.token_hash = $1 AND s.expires_at > NOW() AND u.is_active = true`,
    [tokenHash],
  );

  if (!result) return null;

  const permissions = ROLE_PERMISSIONS[result.role] || [];
  const session: Session = {
    userId: result.user_id,
    tenantId: result.tenant_id,
    role: result.role,
    permissions,
    expiresAt: result.expires_at,
  };
  const user: User = {
    id: result.user_id,
    tenantId: result.tenant_id,
    phone: result.phone,
    name: result.name,
    email: result.email ?? undefined,
    role: result.role as User["role"],
    language: result.language,
    isActive: result.is_active,
    avatarUrl: result.avatar_url ?? undefined,
    username: result.username ?? undefined,
    forcePasswordChange: result.force_password_change,
    createdAt: result.created_at,
    updatedAt: result.updated_at,
  };

  setCachedSession(tokenHash, session, user);
  return { session, user };
}

export async function invalidateSession(token: string): Promise<void> {
  const tokenHash = await hashToken(token);
  invalidateSessionCache(tokenHash);
  await execute(`DELETE FROM sessions WHERE token_hash = $1`, [tokenHash]);
}

export async function invalidateAllUserSessions(userId: string): Promise<void> {
  await execute(`DELETE FROM sessions WHERE user_id = $1`, [userId]);
}

export async function getUserById(id: string): Promise<User | null> {
  const result = await queryOne<{
    id: string;
    tenant_id: string;
    phone: string;
    name: string;
    email: string | null;
    role: string;
    language: string;
    is_active: boolean;
    avatar_url: string | null;
    username: string | null;
    force_password_change: boolean;
    created_at: Date;
    updated_at: Date;
  }>(
    `SELECT id, tenant_id, phone, name, email, role, language, is_active, avatar_url, username, force_password_change, created_at, updated_at
     FROM users WHERE id = $1`,
    [id],
  );

  if (!result) return null;

  return {
    id: result.id,
    tenantId: result.tenant_id,
    phone: result.phone,
    name: result.name,
    email: result.email ?? undefined,
    role: result.role as User["role"],
    language: result.language,
    isActive: result.is_active,
    avatarUrl: result.avatar_url ?? undefined,
    username: result.username ?? undefined,
    forcePasswordChange: result.force_password_change,
    createdAt: result.created_at,
    updatedAt: result.updated_at,
  };
}

export async function getUserByPhone(phone: string): Promise<User | null> {
  const result = await queryOne<{
    id: string;
    tenant_id: string;
    phone: string;
    name: string;
    email: string | null;
    role: string;
    language: string;
    is_active: boolean;
    avatar_url: string | null;
    username: string | null;
    force_password_change: boolean;
    created_at: Date;
    updated_at: Date;
  }>(
    `SELECT id, tenant_id, phone, name, email, role, language, is_active, avatar_url, username, force_password_change, created_at, updated_at
     FROM users WHERE phone = $1`,
    [phone],
  );

  if (!result) return null;

  return {
    id: result.id,
    tenantId: result.tenant_id,
    phone: result.phone,
    name: result.name,
    email: result.email ?? undefined,
    role: result.role as User["role"],
    language: result.language,
    isActive: result.is_active,
    avatarUrl: result.avatar_url ?? undefined,
    username: result.username ?? undefined,
    forcePasswordChange: result.force_password_change,
    createdAt: result.created_at,
    updatedAt: result.updated_at,
  };
}

export async function getUserByUsername(
  username: string,
): Promise<(User & { passwordHash: string | null }) | null> {
  const result = await queryOne<{
    id: string;
    tenant_id: string;
    phone: string;
    name: string;
    email: string | null;
    role: string;
    language: string;
    is_active: boolean;
    avatar_url: string | null;
    username: string | null;
    password_hash: string | null;
    force_password_change: boolean;
    created_at: Date;
    updated_at: Date;
  }>(
    `SELECT id, tenant_id, phone, name, email, role, language, is_active, avatar_url, username, password_hash, force_password_change, created_at, updated_at
     FROM users WHERE username = $1`,
    [username],
  );

  if (!result) return null;

  return {
    id: result.id,
    tenantId: result.tenant_id,
    phone: result.phone,
    name: result.name,
    email: result.email ?? undefined,
    role: result.role as User["role"],
    language: result.language,
    isActive: result.is_active,
    avatarUrl: result.avatar_url ?? undefined,
    username: result.username ?? undefined,
    forcePasswordChange: result.force_password_change,
    passwordHash: result.password_hash,
    createdAt: result.created_at,
    updatedAt: result.updated_at,
  };
}

export async function updatePassword(
  userId: string,
  newPassword: string,
): Promise<void> {
  const hash = await hashPassword(newPassword);
  await execute(
    `UPDATE users SET password_hash = $1, force_password_change = false, updated_at = NOW() WHERE id = $2`,
    [hash, userId],
  );
}

export async function createUser(data: {
  tenantId: string;
  phone?: string;
  username: string;
  password: string;
  name: string;
  email?: string;
  role?: string;
  language?: string;
}): Promise<User> {
  const passwordHash = await hashPassword(data.password);
  const phone = data.phone || data.username;

  const result = await queryOne<{ id: string }>(
    `INSERT INTO users (tenant_id, phone, username, password_hash, name, email, role, language, force_password_change)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, false)
     RETURNING id`,
    [
      data.tenantId,
      phone,
      data.username,
      passwordHash,
      data.name,
      data.email || null,
      data.role || "farmer",
      data.language || "en",
    ],
  );

  if (!result) throw new Error("Failed to create user");

  const user = await getUserById(result.id);
  if (!user) throw new Error("Failed to fetch created user");

  return user;
}

export function hasPermission(session: Session, permission: string): boolean {
  return session.permissions.includes(permission);
}

export function requirePermission(
  session: Session | null,
  permission: string,
): void {
  if (!session) {
    throw new Error("Unauthorized: No session");
  }
  if (!hasPermission(session, permission)) {
    throw new Error(`Forbidden: Missing permission ${permission}`);
  }
}

export async function logAudit(data: {
  tenantId?: string;
  userId?: string;
  action: string;
  entityType?: string;
  entityId?: string;
  beforeData?: unknown;
  afterData?: unknown;
  ipAddress?: string;
  userAgent?: string;
}): Promise<void> {
  await execute(
    `INSERT INTO audit_log (tenant_id, user_id, action, entity_type, entity_id, before_data, after_data, ip_address, user_agent)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [
      data.tenantId || null,
      data.userId || null,
      data.action,
      data.entityType || null,
      data.entityId || null,
      data.beforeData ? JSON.stringify(data.beforeData) : null,
      data.afterData ? JSON.stringify(data.afterData) : null,
      data.ipAddress || null,
      data.userAgent || null,
    ],
  );
}

// OTP placeholder functions (for SMS OTP flow)
const otpStore = new Map<string, { otp: string; expiresAt: number }>();

export function generateOTP(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

export function sendOTP(
  phone: string,
): Promise<{ success: boolean; message: string }> {
  const otp = generateOTP();
  otpStore.set(phone, { otp, expiresAt: Date.now() + 5 * 60 * 1000 }); // 5 min expiry

  // In production, integrate with SMS provider (MSG91, Twilio, etc.)
  console.log(`[DEV] OTP for ${phone}: ${otp}`);

  return Promise.resolve({ success: true, message: "OTP sent successfully" });
}

export function verifyOTP(phone: string, otp: string): boolean {
  const stored = otpStore.get(phone);
  if (!stored) return false;
  if (Date.now() > stored.expiresAt) {
    otpStore.delete(phone);
    return false;
  }
  if (stored.otp !== otp) return false;
  otpStore.delete(phone);
  return true;
}
