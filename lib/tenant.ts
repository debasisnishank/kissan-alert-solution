import { execute, query, queryOne } from "$db/client.ts";
import type { Tenant } from "$utils/types.ts";

export async function getTenantById(id: string): Promise<Tenant | null> {
  const result = await queryOne<{
    id: string;
    name: string;
    slug: string;
    description: string | null;
    logo_url: string | null;
    config: Record<string, unknown>;
    is_active: boolean;
    created_at: Date;
    updated_at: Date;
  }>(
    `SELECT id, name, slug, description, logo_url, config, is_active, created_at, updated_at
     FROM tenants WHERE id = $1`,
    [id],
  );

  if (!result) return null;

  return {
    id: result.id,
    name: result.name,
    slug: result.slug,
    description: result.description ?? undefined,
    logoUrl: result.logo_url ?? undefined,
    config: result.config,
    isActive: result.is_active,
    createdAt: result.created_at,
    updatedAt: result.updated_at,
  };
}

export async function getTenantBySlug(slug: string): Promise<Tenant | null> {
  const result = await queryOne<{
    id: string;
    name: string;
    slug: string;
    description: string | null;
    logo_url: string | null;
    config: Record<string, unknown>;
    is_active: boolean;
    created_at: Date;
    updated_at: Date;
  }>(
    `SELECT id, name, slug, description, logo_url, config, is_active, created_at, updated_at
     FROM tenants WHERE slug = $1`,
    [slug],
  );

  if (!result) return null;

  return {
    id: result.id,
    name: result.name,
    slug: result.slug,
    description: result.description ?? undefined,
    logoUrl: result.logo_url ?? undefined,
    config: result.config,
    isActive: result.is_active,
    createdAt: result.created_at,
    updatedAt: result.updated_at,
  };
}

export async function listTenants(): Promise<Tenant[]> {
  const results = await query<{
    id: string;
    name: string;
    slug: string;
    description: string | null;
    logo_url: string | null;
    config: Record<string, unknown>;
    is_active: boolean;
    created_at: Date;
    updated_at: Date;
  }>(
    `SELECT id, name, slug, description, logo_url, config, is_active, created_at, updated_at
     FROM tenants WHERE is_active = true ORDER BY name`,
  );

  return results.map((r) => ({
    id: r.id,
    name: r.name,
    slug: r.slug,
    description: r.description ?? undefined,
    logoUrl: r.logo_url ?? undefined,
    config: r.config,
    isActive: r.is_active,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }));
}

export async function createTenant(data: {
  id: string;
  name: string;
  slug: string;
  description?: string;
  logoUrl?: string;
  config?: Record<string, unknown>;
}): Promise<Tenant> {
  await execute(
    `INSERT INTO tenants (id, name, slug, description, logo_url, config)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [
      data.id,
      data.name,
      data.slug,
      data.description || null,
      data.logoUrl || null,
      data.config ? JSON.stringify(data.config) : "{}",
    ],
  );

  const tenant = await getTenantById(data.id);
  if (!tenant) throw new Error("Failed to create tenant");

  return tenant;
}

export async function updateTenant(
  id: string,
  data: Partial<
    Pick<Tenant, "name" | "description" | "logoUrl" | "config" | "isActive">
  >,
): Promise<Tenant | null> {
  const updates: string[] = [];
  const values: unknown[] = [];
  let paramIndex = 1;

  if (data.name !== undefined) {
    updates.push(`name = $${paramIndex++}`);
    values.push(data.name);
  }
  if (data.description !== undefined) {
    updates.push(`description = $${paramIndex++}`);
    values.push(data.description);
  }
  if (data.logoUrl !== undefined) {
    updates.push(`logo_url = $${paramIndex++}`);
    values.push(data.logoUrl);
  }
  if (data.config !== undefined) {
    updates.push(`config = $${paramIndex++}`);
    values.push(JSON.stringify(data.config));
  }
  if (data.isActive !== undefined) {
    updates.push(`is_active = $${paramIndex++}`);
    values.push(data.isActive);
  }

  if (updates.length === 0) return getTenantById(id);

  updates.push(`updated_at = NOW()`);
  values.push(id);

  await execute(
    `UPDATE tenants SET ${updates.join(", ")} WHERE id = $${paramIndex}`,
    values,
  );

  return getTenantById(id);
}

// Tenant scoping helper for queries
export function withTenantScope(tenantId: string): { tenantId: string } {
  return { tenantId };
}
