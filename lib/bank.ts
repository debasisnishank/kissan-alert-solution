/**
 * Bank Portal Library
 * CRUD operations for customers, loans, and assessments
 */

import { execute, query, queryOne } from "$db/client.ts";

// Types
export interface BankCustomer {
  id: string;
  tenantId: string;
  userId: string;
  bankOfficerId: string | null;
  customerCode: string | null;
  kycStatus: "pending" | "verified" | "rejected";
  kycVerifiedAt: Date | null;
  creditScore: number | null;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
  // Joined user data
  name: string;
  phone: string;
  email: string | null;
  // Computed data
  farmCount?: number;
  totalArea?: number;
  avgAgriScore?: number;
  activeLoanAmount?: number;
}

export interface LoanApplication {
  id: string;
  tenantId: string;
  customerId: string;
  farmId: string | null;
  applicationNumber: string | null;
  loanType: string;
  loanPurpose: string | null;
  requestedAmount: number;
  approvedAmount: number | null;
  interestRate: number | null;
  tenureMonths: number | null;
  status:
    | "draft"
    | "submitted"
    | "under_review"
    | "approved"
    | "rejected"
    | "disbursed"
    | "closed";
  agriScore: number | null;
  agriScoreBreakdown: Record<string, number> | null;
  riskCategory: "low" | "medium" | "high" | null;
  assessmentNotes: string | null;
  submittedAt: Date | null;
  assessedAt: Date | null;
  assessedBy: string | null;
  approvedAt: Date | null;
  approvedBy: string | null;
  disbursedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  // Joined data
  customerName?: string;
  customerPhone?: string;
  farmName?: string;
}

export interface BankStats {
  totalCustomers: number;
  totalFarms: number;
  totalLoanAmount: number;
  averageAgriScore: number;
  pendingAssessments: number;
  approvedThisMonth: number;
  riskDistribution: { low: number; medium: number; high: number };
}

// Customer CRUD

export async function searchUserByPhone(
  phone: string,
  tenantId: string,
): Promise<
  {
    id: string;
    name: string;
    phone: string;
    email: string | null;
    role: string;
    isCustomer: boolean;
  } | null
> {
  const result = await queryOne<{
    id: string;
    name: string;
    phone: string;
    email: string | null;
    role: string;
    customer_id: string | null;
  }>(
    `SELECT u.id, u.name, u.phone, u.email, u.role, bc.id as customer_id
     FROM users u
     LEFT JOIN bank_customers bc ON bc.user_id = u.id AND bc.tenant_id = $2
     WHERE u.phone = $1 AND u.tenant_id = $2`,
    [phone, tenantId],
  );
  if (!result) return null;
  return {
    id: result.id,
    name: result.name,
    phone: result.phone,
    email: result.email,
    role: result.role,
    isCustomer: !!result.customer_id,
  };
}

export async function createBankCustomer(params: {
  tenantId: string;
  userId: string;
  bankOfficerId: string;
  customerCode?: string;
  notes?: string;
}): Promise<BankCustomer | null> {
  const { tenantId, userId, bankOfficerId, customerCode, notes } = params;

  // Generate customer code if not provided
  const code = customerCode || `CUS${Date.now().toString(36).toUpperCase()}`;

  const result = await queryOne<{ id: string }>(
    `INSERT INTO bank_customers (tenant_id, user_id, bank_officer_id, customer_code, notes)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (tenant_id, user_id) DO UPDATE SET
       bank_officer_id = EXCLUDED.bank_officer_id,
       updated_at = NOW()
     RETURNING id`,
    [tenantId, userId, bankOfficerId, code, notes || null],
  );

  if (!result) return null;
  return getBankCustomerById(result.id, tenantId);
}

export async function getBankCustomerById(
  id: string,
  tenantId: string,
): Promise<BankCustomer | null> {
  const result = await queryOne<{
    id: string;
    tenant_id: string;
    user_id: string;
    bank_officer_id: string | null;
    customer_code: string | null;
    kyc_status: string;
    kyc_verified_at: Date | null;
    credit_score: number | null;
    notes: string | null;
    created_at: Date;
    updated_at: Date;
    name: string;
    phone: string;
    email: string | null;
    farm_count: number;
    total_area: number;
    avg_score: number;
    active_loan: number;
  }>(
    `SELECT bc.*, u.name, u.phone, u.email,
       (SELECT COUNT(*) FROM farms f WHERE f.farmer_id = bc.user_id)::int as farm_count,
       (SELECT COALESCE(SUM(f.area_hectares), 0) FROM farms f WHERE f.farmer_id = bc.user_id)::float as total_area,
       COALESCE((SELECT (o.ndvi * 100)::int FROM farm_observations o
        JOIN farms f ON f.id = o.farm_id
        WHERE f.farmer_id = bc.user_id AND o.ndvi IS NOT NULL
        ORDER BY o.observation_date DESC LIMIT 1), 60) as avg_score,
       (SELECT COALESCE(SUM(la.approved_amount), 0)
        FROM loan_applications la
        WHERE la.customer_id = bc.id AND la.status IN ('approved', 'disbursed'))::float as active_loan
     FROM bank_customers bc
     JOIN users u ON u.id = bc.user_id
     WHERE bc.id = $1 AND bc.tenant_id = $2`,
    [id, tenantId],
  );

  if (!result) return null;
  return mapCustomerRow(result);
}

export async function getBankCustomerByUserId(
  userId: string,
  tenantId: string,
): Promise<BankCustomer | null> {
  const result = await queryOne<{ id: string }>(
    `SELECT id FROM bank_customers WHERE user_id = $1 AND tenant_id = $2`,
    [userId, tenantId],
  );
  if (!result) return null;
  return getBankCustomerById(result.id, tenantId);
}

export async function listBankCustomers(
  tenantId: string,
  options: {
    bankOfficerId?: string;
    search?: string;
    kycStatus?: string;
    limit?: number;
    offset?: number;
  } = {},
): Promise<{ customers: BankCustomer[]; total: number }> {
  const { bankOfficerId, search, kycStatus, limit = 50, offset = 0 } = options;

  let whereClause = "bc.tenant_id = $1";
  const params: unknown[] = [tenantId];

  if (bankOfficerId) {
    params.push(bankOfficerId);
    whereClause += ` AND bc.bank_officer_id = $${params.length}`;
  }

  if (search) {
    params.push(`%${search}%`);
    whereClause +=
      ` AND (u.name ILIKE $${params.length} OR u.phone LIKE $${params.length})`;
  }

  if (kycStatus) {
    params.push(kycStatus);
    whereClause += ` AND bc.kyc_status = $${params.length}`;
  }

  // Get total count
  const countResult = await queryOne<{ count: number }>(
    `SELECT COUNT(*)::int as count FROM bank_customers bc
     JOIN users u ON u.id = bc.user_id
     WHERE ${whereClause}`,
    params,
  );
  const total = countResult?.count || 0;

  // Get customers with stats
  params.push(limit, offset);
  const results = await query<{
    id: string;
    tenant_id: string;
    user_id: string;
    bank_officer_id: string | null;
    customer_code: string | null;
    kyc_status: string;
    kyc_verified_at: Date | null;
    credit_score: number | null;
    notes: string | null;
    created_at: Date;
    updated_at: Date;
    name: string;
    phone: string;
    email: string | null;
    farm_count: number;
    total_area: number;
    avg_score: number;
    active_loan: number;
  }>(
    `SELECT bc.*, u.name, u.phone, u.email,
       (SELECT COUNT(*) FROM farms f WHERE f.farmer_id = bc.user_id)::int as farm_count,
       (SELECT COALESCE(SUM(f.area_hectares), 0) FROM farms f WHERE f.farmer_id = bc.user_id)::float as total_area,
       60 as avg_score,
       (SELECT COALESCE(SUM(la.approved_amount), 0)
        FROM loan_applications la
        WHERE la.customer_id = bc.id AND la.status IN ('approved', 'disbursed'))::float as active_loan
     FROM bank_customers bc
     JOIN users u ON u.id = bc.user_id
     WHERE ${whereClause}
     ORDER BY bc.created_at DESC
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params,
  );

  return {
    customers: results.map(mapCustomerRow),
    total,
  };
}

export async function updateBankCustomer(
  id: string,
  tenantId: string,
  updates: {
    kycStatus?: string;
    creditScore?: number;
    notes?: string;
    bankOfficerId?: string;
  },
): Promise<BankCustomer | null> {
  const setClauses: string[] = [];
  const params: unknown[] = [];

  if (updates.kycStatus !== undefined) {
    params.push(updates.kycStatus);
    setClauses.push(`kyc_status = $${params.length}`);
    if (updates.kycStatus === "verified") {
      setClauses.push(`kyc_verified_at = NOW()`);
    }
  }
  if (updates.creditScore !== undefined) {
    params.push(updates.creditScore);
    setClauses.push(`credit_score = $${params.length}`);
  }
  if (updates.notes !== undefined) {
    params.push(updates.notes);
    setClauses.push(`notes = $${params.length}`);
  }
  if (updates.bankOfficerId !== undefined) {
    params.push(updates.bankOfficerId);
    setClauses.push(`bank_officer_id = $${params.length}`);
  }

  if (setClauses.length === 0) return getBankCustomerById(id, tenantId);

  setClauses.push(`updated_at = NOW()`);
  params.push(id, tenantId);

  await execute(
    `UPDATE bank_customers SET ${setClauses.join(", ")}
     WHERE id = $${params.length - 1} AND tenant_id = $${params.length}`,
    params,
  );

  return getBankCustomerById(id, tenantId);
}

export async function deleteBankCustomer(
  id: string,
  tenantId: string,
): Promise<boolean> {
  const result = await execute(
    `DELETE FROM bank_customers WHERE id = $1 AND tenant_id = $2`,
    [id, tenantId],
  );
  return result > 0;
}

// Loan CRUD

export async function createLoanApplication(params: {
  tenantId: string;
  customerId: string;
  farmId?: string;
  loanType: string;
  loanPurpose?: string;
  requestedAmount: number;
  tenureMonths?: number;
}): Promise<LoanApplication | null> {
  const appNumber = `LOAN${Date.now().toString(36).toUpperCase()}`;

  const result = await queryOne<{ id: string }>(
    `INSERT INTO loan_applications
     (tenant_id, customer_id, farm_id, application_number, loan_type, loan_purpose, requested_amount, tenure_months)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING id`,
    [
      params.tenantId,
      params.customerId,
      params.farmId || null,
      appNumber,
      params.loanType,
      params.loanPurpose || null,
      params.requestedAmount,
      params.tenureMonths || 12,
    ],
  );

  if (!result) return null;
  return getLoanById(result.id, params.tenantId);
}

export async function getLoanById(
  id: string,
  tenantId: string,
): Promise<LoanApplication | null> {
  const result = await queryOne<{
    id: string;
    tenant_id: string;
    customer_id: string;
    farm_id: string | null;
    application_number: string | null;
    loan_type: string;
    loan_purpose: string | null;
    requested_amount: number;
    approved_amount: number | null;
    interest_rate: number | null;
    tenure_months: number | null;
    status: string;
    agri_score: number | null;
    agri_score_breakdown: Record<string, number> | null;
    risk_category: string | null;
    assessment_notes: string | null;
    submitted_at: Date | null;
    assessed_at: Date | null;
    assessed_by: string | null;
    approved_at: Date | null;
    approved_by: string | null;
    disbursed_at: Date | null;
    created_at: Date;
    updated_at: Date;
    customer_name: string;
    customer_phone: string;
    farm_name: string | null;
  }>(
    `SELECT la.*, u.name as customer_name, u.phone as customer_phone, f.name as farm_name
     FROM loan_applications la
     JOIN bank_customers bc ON bc.id = la.customer_id
     JOIN users u ON u.id = bc.user_id
     LEFT JOIN farms f ON f.id = la.farm_id
     WHERE la.id = $1 AND la.tenant_id = $2`,
    [id, tenantId],
  );

  if (!result) return null;
  return mapLoanRow(result);
}

export async function listLoans(
  tenantId: string,
  options: {
    customerId?: string;
    status?: string;
    bankOfficerId?: string;
    limit?: number;
    offset?: number;
  } = {},
): Promise<{ loans: LoanApplication[]; total: number }> {
  const { customerId, status, bankOfficerId, limit = 50, offset = 0 } = options;

  let whereClause = "la.tenant_id = $1";
  const params: unknown[] = [tenantId];

  if (customerId) {
    params.push(customerId);
    whereClause += ` AND la.customer_id = $${params.length}`;
  }

  if (status) {
    params.push(status);
    whereClause += ` AND la.status = $${params.length}`;
  }

  if (bankOfficerId) {
    params.push(bankOfficerId);
    whereClause += ` AND bc.bank_officer_id = $${params.length}`;
  }

  const countResult = await queryOne<{ count: number }>(
    `SELECT COUNT(*)::int as count
     FROM loan_applications la
     JOIN bank_customers bc ON bc.id = la.customer_id
     WHERE ${whereClause}`,
    params,
  );
  const total = countResult?.count || 0;

  params.push(limit, offset);
  const results = await query<{
    id: string;
    tenant_id: string;
    customer_id: string;
    farm_id: string | null;
    application_number: string | null;
    loan_type: string;
    loan_purpose: string | null;
    requested_amount: number;
    approved_amount: number | null;
    interest_rate: number | null;
    tenure_months: number | null;
    status: string;
    agri_score: number | null;
    agri_score_breakdown: Record<string, number> | null;
    risk_category: string | null;
    assessment_notes: string | null;
    submitted_at: Date | null;
    assessed_at: Date | null;
    assessed_by: string | null;
    approved_at: Date | null;
    approved_by: string | null;
    disbursed_at: Date | null;
    created_at: Date;
    updated_at: Date;
    customer_name: string;
    customer_phone: string;
    farm_name: string | null;
  }>(
    `SELECT la.*, u.name as customer_name, u.phone as customer_phone, f.name as farm_name
     FROM loan_applications la
     JOIN bank_customers bc ON bc.id = la.customer_id
     JOIN users u ON u.id = bc.user_id
     LEFT JOIN farms f ON f.id = la.farm_id
     WHERE ${whereClause}
     ORDER BY la.created_at DESC
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params,
  );

  return {
    loans: results.map(mapLoanRow),
    total,
  };
}

export async function updateLoanApplication(
  id: string,
  tenantId: string,
  updates: {
    status?: string;
    approvedAmount?: number;
    interestRate?: number;
    agriScore?: number;
    agriScoreBreakdown?: Record<string, number>;
    riskCategory?: string;
    assessmentNotes?: string;
    assessedBy?: string;
    approvedBy?: string;
  },
): Promise<LoanApplication | null> {
  const setClauses: string[] = [];
  const params: unknown[] = [];

  if (updates.status !== undefined) {
    params.push(updates.status);
    setClauses.push(`status = $${params.length}`);
    if (updates.status === "submitted") {
      setClauses.push(`submitted_at = NOW()`);
    } else if (updates.status === "approved") {
      setClauses.push(`approved_at = NOW()`);
    } else if (updates.status === "disbursed") {
      setClauses.push(`disbursed_at = NOW()`);
    }
  }
  if (updates.approvedAmount !== undefined) {
    params.push(updates.approvedAmount);
    setClauses.push(`approved_amount = $${params.length}`);
  }
  if (updates.interestRate !== undefined) {
    params.push(updates.interestRate);
    setClauses.push(`interest_rate = $${params.length}`);
  }
  if (updates.agriScore !== undefined) {
    params.push(updates.agriScore);
    setClauses.push(`agri_score = $${params.length}`);
    setClauses.push(`assessed_at = NOW()`);
  }
  if (updates.agriScoreBreakdown !== undefined) {
    params.push(JSON.stringify(updates.agriScoreBreakdown));
    setClauses.push(`agri_score_breakdown = $${params.length}::jsonb`);
  }
  if (updates.riskCategory !== undefined) {
    params.push(updates.riskCategory);
    setClauses.push(`risk_category = $${params.length}`);
  }
  if (updates.assessmentNotes !== undefined) {
    params.push(updates.assessmentNotes);
    setClauses.push(`assessment_notes = $${params.length}`);
  }
  if (updates.assessedBy !== undefined) {
    params.push(updates.assessedBy);
    setClauses.push(`assessed_by = $${params.length}`);
  }
  if (updates.approvedBy !== undefined) {
    params.push(updates.approvedBy);
    setClauses.push(`approved_by = $${params.length}`);
  }

  if (setClauses.length === 0) return getLoanById(id, tenantId);

  setClauses.push(`updated_at = NOW()`);
  params.push(id, tenantId);

  await execute(
    `UPDATE loan_applications SET ${setClauses.join(", ")}
     WHERE id = $${params.length - 1} AND tenant_id = $${params.length}`,
    params,
  );

  return getLoanById(id, tenantId);
}

// Bank Stats

export async function getBankStats(
  tenantId: string,
  bankOfficerId?: string,
): Promise<BankStats> {
  const officerFilter = bankOfficerId ? "AND bc.bank_officer_id = $2" : "";
  const params: unknown[] = bankOfficerId
    ? [tenantId, bankOfficerId]
    : [tenantId];

  // Total customers
  const customersResult = await queryOne<{ count: number }>(
    `SELECT COUNT(*)::int as count FROM bank_customers bc WHERE bc.tenant_id = $1 ${officerFilter}`,
    params,
  );
  const totalCustomers = customersResult?.count || 0;

  // Total farms for these customers
  const farmsResult = await queryOne<{ count: number }>(
    `SELECT COUNT(*)::int as count FROM farms f
     JOIN bank_customers bc ON bc.user_id = f.farmer_id
     WHERE bc.tenant_id = $1 ${officerFilter}`,
    params,
  );
  const totalFarms = farmsResult?.count || 0;

  // Total loan amount (approved + disbursed)
  const loanResult = await queryOne<{ total: number }>(
    `SELECT COALESCE(SUM(la.approved_amount), 0)::float as total
     FROM loan_applications la
     JOIN bank_customers bc ON bc.id = la.customer_id
     WHERE la.tenant_id = $1 AND la.status IN ('approved', 'disbursed') ${officerFilter}`,
    params,
  );
  const totalLoanAmount = loanResult?.total || 0;

  // Average Agri Score (from recent assessments)
  const avgResult = await queryOne<{ avg: number }>(
    `SELECT COALESCE(AVG(la.agri_score), 65)::int as avg
     FROM loan_applications la
     JOIN bank_customers bc ON bc.id = la.customer_id
     WHERE la.tenant_id = $1 AND la.agri_score IS NOT NULL ${officerFilter}`,
    params,
  );
  const averageAgriScore = avgResult?.avg || 65;

  // Pending assessments
  const pendingResult = await queryOne<{ count: number }>(
    `SELECT COUNT(*)::int as count
     FROM loan_applications la
     JOIN bank_customers bc ON bc.id = la.customer_id
     WHERE la.tenant_id = $1 AND la.status IN ('submitted', 'under_review') ${officerFilter}`,
    params,
  );
  const pendingAssessments = pendingResult?.count || 0;

  // Approved this month
  const approvedResult = await queryOne<{ count: number }>(
    `SELECT COUNT(*)::int as count
     FROM loan_applications la
     JOIN bank_customers bc ON bc.id = la.customer_id
     WHERE la.tenant_id = $1 AND la.status = 'approved'
       AND la.approved_at >= date_trunc('month', CURRENT_DATE) ${officerFilter}`,
    params,
  );
  const approvedThisMonth = approvedResult?.count || 0;

  // Risk distribution
  const riskResult = await query<{ risk_category: string; count: number }>(
    `SELECT COALESCE(la.risk_category, 'medium') as risk_category, COUNT(*)::int as count
     FROM loan_applications la
     JOIN bank_customers bc ON bc.id = la.customer_id
     WHERE la.tenant_id = $1 AND la.status NOT IN ('draft', 'rejected', 'closed') ${officerFilter}
     GROUP BY COALESCE(la.risk_category, 'medium')`,
    params,
  );

  const riskCounts = { low: 0, medium: 0, high: 0 };
  let totalRisk = 0;
  for (const r of riskResult) {
    const cat = r.risk_category as keyof typeof riskCounts;
    if (cat in riskCounts) {
      riskCounts[cat] = r.count;
      totalRisk += r.count;
    }
  }

  const riskDistribution = totalRisk > 0
    ? {
      low: Math.round((riskCounts.low / totalRisk) * 100),
      medium: Math.round((riskCounts.medium / totalRisk) * 100),
      high: Math.round((riskCounts.high / totalRisk) * 100),
    }
    : { low: 40, medium: 40, high: 20 };

  return {
    totalCustomers,
    totalFarms,
    totalLoanAmount,
    averageAgriScore,
    pendingAssessments,
    approvedThisMonth,
    riskDistribution,
  };
}

// Helper functions

function mapCustomerRow(row: {
  id: string;
  tenant_id: string;
  user_id: string;
  bank_officer_id: string | null;
  customer_code: string | null;
  kyc_status: string;
  kyc_verified_at: Date | null;
  credit_score: number | null;
  notes: string | null;
  created_at: Date;
  updated_at: Date;
  name: string;
  phone: string;
  email: string | null;
  farm_count?: number;
  total_area?: number;
  avg_score?: number;
  active_loan?: number;
}): BankCustomer {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    userId: row.user_id,
    bankOfficerId: row.bank_officer_id,
    customerCode: row.customer_code,
    kycStatus: row.kyc_status as BankCustomer["kycStatus"],
    kycVerifiedAt: row.kyc_verified_at,
    creditScore: row.credit_score,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    name: row.name,
    phone: row.phone,
    email: row.email,
    farmCount: row.farm_count || 0,
    totalArea: Number(row.total_area) || 0,
    avgAgriScore: row.avg_score || 60,
    activeLoanAmount: Number(row.active_loan) || 0,
  };
}

function mapLoanRow(row: {
  id: string;
  tenant_id: string;
  customer_id: string;
  farm_id: string | null;
  application_number: string | null;
  loan_type: string;
  loan_purpose: string | null;
  requested_amount: number;
  approved_amount: number | null;
  interest_rate: number | null;
  tenure_months: number | null;
  status: string;
  agri_score: number | null;
  agri_score_breakdown: Record<string, number> | null;
  risk_category: string | null;
  assessment_notes: string | null;
  submitted_at: Date | null;
  assessed_at: Date | null;
  assessed_by: string | null;
  approved_at: Date | null;
  approved_by: string | null;
  disbursed_at: Date | null;
  created_at: Date;
  updated_at: Date;
  customer_name?: string;
  customer_phone?: string;
  farm_name?: string | null;
}): LoanApplication {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    customerId: row.customer_id,
    farmId: row.farm_id,
    applicationNumber: row.application_number,
    loanType: row.loan_type,
    loanPurpose: row.loan_purpose,
    requestedAmount: Number(row.requested_amount),
    approvedAmount: row.approved_amount ? Number(row.approved_amount) : null,
    interestRate: row.interest_rate ? Number(row.interest_rate) : null,
    tenureMonths: row.tenure_months,
    status: row.status as LoanApplication["status"],
    agriScore: row.agri_score,
    agriScoreBreakdown: row.agri_score_breakdown,
    riskCategory: row.risk_category as LoanApplication["riskCategory"],
    assessmentNotes: row.assessment_notes,
    submittedAt: row.submitted_at,
    assessedAt: row.assessed_at,
    assessedBy: row.assessed_by,
    approvedAt: row.approved_at,
    approvedBy: row.approved_by,
    disbursedAt: row.disbursed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    customerName: row.customer_name,
    customerPhone: row.customer_phone,
    farmName: row.farm_name || undefined,
  };
}

// ============================================
// LOAN REPAYMENT FUNCTIONS
// ============================================

export interface LoanRepayment {
  id: string;
  loanId: string;
  amount: number;
  principal: number | null;
  interest: number | null;
  paymentDate: Date;
  paymentMethod: string | null;
  referenceNumber: string | null;
  status: "pending" | "completed" | "failed";
  notes: string | null;
  createdAt: Date;
}

export async function createRepayment(data: {
  loanId: string;
  amount: number;
  principal?: number;
  interest?: number;
  paymentDate: string;
  paymentMethod?: string;
  referenceNumber?: string;
  notes?: string;
}): Promise<LoanRepayment | null> {
  const result = await queryOne<{ id: string }>(
    `INSERT INTO loan_repayments (
      loan_id, amount, principal, interest, payment_date,
      payment_method, reference_number, notes, status
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'completed')
    RETURNING id`,
    [
      data.loanId,
      data.amount,
      data.principal || null,
      data.interest || null,
      data.paymentDate,
      data.paymentMethod || null,
      data.referenceNumber || null,
      data.notes || null,
    ],
  );

  if (!result) return null;
  return getRepaymentById(result.id);
}

export async function getRepaymentById(
  id: string,
): Promise<LoanRepayment | null> {
  const result = await queryOne<{
    id: string;
    loan_id: string;
    amount: number;
    principal: number | null;
    interest: number | null;
    payment_date: Date;
    payment_method: string | null;
    reference_number: string | null;
    status: string;
    notes: string | null;
    created_at: Date;
  }>(
    `SELECT * FROM loan_repayments WHERE id = $1`,
    [id],
  );

  if (!result) return null;
  return {
    id: result.id,
    loanId: result.loan_id,
    amount: Number(result.amount),
    principal: result.principal ? Number(result.principal) : null,
    interest: result.interest ? Number(result.interest) : null,
    paymentDate: result.payment_date,
    paymentMethod: result.payment_method,
    referenceNumber: result.reference_number,
    status: result.status as LoanRepayment["status"],
    notes: result.notes,
    createdAt: result.created_at,
  };
}

export async function listRepaymentsByLoan(
  loanId: string,
): Promise<LoanRepayment[]> {
  const results = await query<{
    id: string;
    loan_id: string;
    amount: number;
    principal: number | null;
    interest: number | null;
    payment_date: Date;
    payment_method: string | null;
    reference_number: string | null;
    status: string;
    notes: string | null;
    created_at: Date;
  }>(
    `SELECT * FROM loan_repayments WHERE loan_id = $1 ORDER BY payment_date DESC`,
    [loanId],
  );

  return results.map((r) => ({
    id: r.id,
    loanId: r.loan_id,
    amount: Number(r.amount),
    principal: r.principal ? Number(r.principal) : null,
    interest: r.interest ? Number(r.interest) : null,
    paymentDate: r.payment_date,
    paymentMethod: r.payment_method,
    referenceNumber: r.reference_number,
    status: r.status as LoanRepayment["status"],
    notes: r.notes,
    createdAt: r.created_at,
  }));
}

export async function getLoanRepaymentSummary(loanId: string): Promise<{
  totalPaid: number;
  totalPrincipal: number;
  totalInterest: number;
  paymentCount: number;
  lastPaymentDate: Date | null;
}> {
  const result = await queryOne<{
    total_paid: number;
    total_principal: number;
    total_interest: number;
    payment_count: number;
    last_payment: Date | null;
  }>(
    `SELECT 
      COALESCE(SUM(amount), 0)::float as total_paid,
      COALESCE(SUM(principal), 0)::float as total_principal,
      COALESCE(SUM(interest), 0)::float as total_interest,
      COUNT(*)::int as payment_count,
      MAX(payment_date) as last_payment
    FROM loan_repayments
    WHERE loan_id = $1 AND status = 'completed'`,
    [loanId],
  );

  return {
    totalPaid: result?.total_paid || 0,
    totalPrincipal: result?.total_principal || 0,
    totalInterest: result?.total_interest || 0,
    paymentCount: result?.payment_count || 0,
    lastPaymentDate: result?.last_payment || null,
  };
}

// ============================================
// PORTFOLIO ANALYTICS
// ============================================

export interface PortfolioAnalytics {
  totalDisbursed: number;
  totalOutstanding: number;
  totalCollected: number;
  npaAmount: number;
  npaPercentage: number;
  loansByType: Record<string, { count: number; amount: number }>;
  loansByStatus: Record<string, number>;
  monthlyDisbursement: Array<{ month: string; amount: number }>;
  riskBreakdown: { low: number; medium: number; high: number };
  averageLoanSize: number;
  averageTenure: number;
}

export async function getPortfolioAnalytics(
  tenantId: string,
  bankOfficerId?: string,
): Promise<PortfolioAnalytics> {
  const officerFilter = bankOfficerId ? "AND bc.bank_officer_id = $2" : "";
  const params: unknown[] = [tenantId];
  if (bankOfficerId) params.push(bankOfficerId);

  // Total disbursed
  const disbursedResult = await queryOne<{ total: number; count: number }>(
    `SELECT COALESCE(SUM(la.approved_amount), 0)::float as total, COUNT(*)::int as count
     FROM loan_applications la
     JOIN bank_customers bc ON bc.id = la.customer_id
     WHERE la.tenant_id = $1 AND la.status = 'disbursed' ${officerFilter}`,
    params,
  );

  // Total collected (from repayments)
  const collectedResult = await queryOne<{ total: number }>(
    `SELECT COALESCE(SUM(lr.amount), 0)::float as total
     FROM loan_repayments lr
     JOIN loan_applications la ON la.id = lr.loan_id
     JOIN bank_customers bc ON bc.id = la.customer_id
     WHERE la.tenant_id = $1 AND lr.status = 'completed' ${officerFilter}`,
    params,
  );

  // Loans by type
  const typeResults = await query<{
    loan_type: string;
    count: number;
    total: number;
  }>(
    `SELECT la.loan_type, COUNT(*)::int as count, COALESCE(SUM(la.approved_amount), 0)::float as total
     FROM loan_applications la
     JOIN bank_customers bc ON bc.id = la.customer_id
     WHERE la.tenant_id = $1 AND la.status = 'disbursed' ${officerFilter}
     GROUP BY la.loan_type`,
    params,
  );

  // Loans by status
  const statusResults = await query<{ status: string; count: number }>(
    `SELECT la.status, COUNT(*)::int as count
     FROM loan_applications la
     JOIN bank_customers bc ON bc.id = la.customer_id
     WHERE la.tenant_id = $1 ${officerFilter}
     GROUP BY la.status`,
    params,
  );

  // Monthly disbursement (last 6 months)
  const monthlyResults = await query<{ month: string; amount: number }>(
    `SELECT TO_CHAR(la.disbursed_at, 'YYYY-MM') as month, 
            COALESCE(SUM(la.approved_amount), 0)::float as amount
     FROM loan_applications la
     JOIN bank_customers bc ON bc.id = la.customer_id
     WHERE la.tenant_id = $1 AND la.status = 'disbursed' 
       AND la.disbursed_at >= NOW() - INTERVAL '6 months' ${officerFilter}
     GROUP BY TO_CHAR(la.disbursed_at, 'YYYY-MM')
     ORDER BY month`,
    params,
  );

  // Risk breakdown
  const riskResults = await query<{ risk_category: string; count: number }>(
    `SELECT la.risk_category, COUNT(*)::int as count
     FROM loan_applications la
     JOIN bank_customers bc ON bc.id = la.customer_id
     WHERE la.tenant_id = $1 AND la.risk_category IS NOT NULL ${officerFilter}
     GROUP BY la.risk_category`,
    params,
  );

  // Average loan size and tenure
  const avgResult = await queryOne<{ avg_size: number; avg_tenure: number }>(
    `SELECT COALESCE(AVG(la.approved_amount), 0)::float as avg_size,
            COALESCE(AVG(la.tenure_months), 12)::float as avg_tenure
     FROM loan_applications la
     JOIN bank_customers bc ON bc.id = la.customer_id
     WHERE la.tenant_id = $1 AND la.status = 'disbursed' ${officerFilter}`,
    params,
  );

  const totalDisbursed = disbursedResult?.total || 0;
  const totalCollected = collectedResult?.total || 0;
  const totalOutstanding = totalDisbursed - totalCollected;

  // NPA calculation (simplified: loans overdue by 90+ days)
  const npaAmount = 0; // Would need more complex calculation based on due dates
  const npaPercentage = totalOutstanding > 0
    ? (npaAmount / totalOutstanding) * 100
    : 0;

  const loansByType: Record<string, { count: number; amount: number }> = {};
  typeResults.forEach((r) => {
    loansByType[r.loan_type] = { count: r.count, amount: r.total };
  });

  const loansByStatus: Record<string, number> = {};
  statusResults.forEach((r) => {
    loansByStatus[r.status] = r.count;
  });

  const riskBreakdown = { low: 0, medium: 0, high: 0 };
  riskResults.forEach((r) => {
    if (r.risk_category in riskBreakdown) {
      riskBreakdown[r.risk_category as keyof typeof riskBreakdown] = r.count;
    }
  });

  return {
    totalDisbursed,
    totalOutstanding,
    totalCollected,
    npaAmount,
    npaPercentage,
    loansByType,
    loansByStatus,
    monthlyDisbursement: monthlyResults,
    riskBreakdown,
    averageLoanSize: avgResult?.avg_size || 0,
    averageTenure: avgResult?.avg_tenure || 12,
  };
}

// ============================================
// CUSTOMER CREDIT HISTORY
// ============================================

export interface CreditHistoryItem {
  loanId: string;
  applicationNumber: string | null;
  loanType: string;
  amount: number;
  status: string;
  repaymentPercentage: number;
  onTimePayments: number;
  latePayments: number;
  disbursedAt: Date | null;
  closedAt: Date | null;
}

export async function getCustomerCreditHistory(
  customerId: string,
): Promise<CreditHistoryItem[]> {
  const loans = await query<{
    id: string;
    application_number: string | null;
    loan_type: string;
    approved_amount: number;
    status: string;
    disbursed_at: Date | null;
    total_repaid: number;
  }>(
    `SELECT la.id, la.application_number, la.loan_type, 
            COALESCE(la.approved_amount, la.requested_amount)::float as approved_amount,
            la.status, la.disbursed_at,
            COALESCE((SELECT SUM(amount) FROM loan_repayments WHERE loan_id = la.id AND status = 'completed'), 0)::float as total_repaid
     FROM loan_applications la
     WHERE la.customer_id = $1
     ORDER BY la.created_at DESC`,
    [customerId],
  );

  return loans.map((l) => ({
    loanId: l.id,
    applicationNumber: l.application_number,
    loanType: l.loan_type,
    amount: l.approved_amount,
    status: l.status,
    repaymentPercentage: l.approved_amount > 0
      ? Math.min(100, (l.total_repaid / l.approved_amount) * 100)
      : 0,
    onTimePayments: 0, // Would need due date tracking
    latePayments: 0,
    disbursedAt: l.disbursed_at,
    closedAt: null,
  }));
}

// ============================================
// BANK AUDIT LOGGING
// ============================================

export async function logBankAudit(data: {
  tenantId: string;
  userId: string;
  entityType: "customer" | "loan" | "repayment";
  entityId: string;
  action: string;
  oldValues?: Record<string, unknown>;
  newValues?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
}): Promise<void> {
  await execute(
    `INSERT INTO bank_audit_logs (
      tenant_id, user_id, entity_type, entity_id, action,
      old_values, new_values, ip_address, user_agent
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [
      data.tenantId,
      data.userId,
      data.entityType,
      data.entityId,
      data.action,
      data.oldValues ? JSON.stringify(data.oldValues) : null,
      data.newValues ? JSON.stringify(data.newValues) : null,
      data.ipAddress || null,
      data.userAgent || null,
    ],
  );
}

export async function getBankAuditLogs(
  tenantId: string,
  filters: {
    entityType?: string;
    entityId?: string;
    userId?: string;
    limit?: number;
    offset?: number;
  } = {},
): Promise<
  Array<{
    id: string;
    userId: string;
    userName: string | null;
    entityType: string;
    entityId: string;
    action: string;
    oldValues: Record<string, unknown> | null;
    newValues: Record<string, unknown> | null;
    createdAt: Date;
  }>
> {
  let whereClause = "bal.tenant_id = $1";
  const params: unknown[] = [tenantId];
  let paramCount = 1;

  if (filters.entityType) {
    paramCount++;
    whereClause += ` AND bal.entity_type = $${paramCount}`;
    params.push(filters.entityType);
  }

  if (filters.entityId) {
    paramCount++;
    whereClause += ` AND bal.entity_id = $${paramCount}`;
    params.push(filters.entityId);
  }

  if (filters.userId) {
    paramCount++;
    whereClause += ` AND bal.user_id = $${paramCount}`;
    params.push(filters.userId);
  }

  const limit = filters.limit || 50;
  const offset = filters.offset || 0;

  const results = await query<{
    id: string;
    user_id: string;
    user_name: string | null;
    entity_type: string;
    entity_id: string;
    action: string;
    old_values: Record<string, unknown> | null;
    new_values: Record<string, unknown> | null;
    created_at: Date;
  }>(
    `SELECT bal.*, u.name as user_name
     FROM bank_audit_logs bal
     LEFT JOIN users u ON u.id = bal.user_id
     WHERE ${whereClause}
     ORDER BY bal.created_at DESC
     LIMIT ${limit} OFFSET ${offset}`,
    params,
  );

  return results.map((r) => ({
    id: r.id,
    userId: r.user_id,
    userName: r.user_name,
    entityType: r.entity_type,
    entityId: r.entity_id,
    action: r.action,
    oldValues: r.old_values,
    newValues: r.new_values,
    createdAt: r.created_at,
  }));
}
