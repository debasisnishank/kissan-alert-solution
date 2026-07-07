/**
 * Pure EMI math -- no DB/env imports, so it's safe to import from
 * client-side islands (importing lib/bank.ts here pulled in db/client.ts
 * and utils/env.ts, which throw on `Deno.env.get` once bundled for the
 * browser, silently killing hydration for anything importing this).
 */

export interface EMISchedule {
  emiAmount: number;
  totalPayable: number;
  totalInterest: number;
  schedule: Array<{
    month: number;
    emiAmount: number;
    principal: number;
    interest: number;
    balance: number;
  }>;
}

export function calculateEMI(
  principal: number,
  annualRate: number,
  tenureMonths: number,
): EMISchedule {
  const monthlyRate = annualRate / 12 / 100;

  // EMI = P * r * (1+r)^n / ((1+r)^n - 1)
  const emi = monthlyRate > 0
    ? (principal * monthlyRate * Math.pow(1 + monthlyRate, tenureMonths)) /
      (Math.pow(1 + monthlyRate, tenureMonths) - 1)
    : principal / tenureMonths;

  const schedule: EMISchedule["schedule"] = [];
  let balance = principal;

  for (let month = 1; month <= tenureMonths; month++) {
    const interestPayment = balance * monthlyRate;
    const principalPayment = emi - interestPayment;
    balance -= principalPayment;

    schedule.push({
      month,
      emiAmount: Math.round(emi * 100) / 100,
      principal: Math.round(principalPayment * 100) / 100,
      interest: Math.round(interestPayment * 100) / 100,
      balance: Math.max(0, Math.round(balance * 100) / 100),
    });
  }

  const totalPayable = emi * tenureMonths;
  const totalInterest = totalPayable - principal;

  return {
    emiAmount: Math.round(emi * 100) / 100,
    totalPayable: Math.round(totalPayable * 100) / 100,
    totalInterest: Math.round(totalInterest * 100) / 100,
    schedule,
  };
}
