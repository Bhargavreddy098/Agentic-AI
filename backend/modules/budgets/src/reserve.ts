import type { BudgetRef, BudgetReservation } from "@asi/contracts";
import { createBudgetService, requireBudgetScope, type BudgetConfig } from "./runtime.js";
export type ReserveBudgetConfig = BudgetConfig;
export interface ReserveBudgetInput { budgetRef: BudgetRef; tokens: number; maxCostMicroUsd: number; runId: string }
export interface ReserveBudgetResult { reservation: BudgetReservation }
export async function reserveBudget(config: ReserveBudgetConfig,input: ReserveBudgetInput): Promise<ReserveBudgetResult> {
 const scope=requireBudgetScope(config);
 if(input.runId!==scope.context.runId)throw new Error("Budget run mismatch");
 return {reservation:await (await createBudgetService(config)).reserveBudget(input.budgetRef,input.tokens,input.maxCostMicroUsd)};
}
export type GetReservationConfig = BudgetConfig;
export interface GetReservationInput { reservationId: string; tenantId: string }
export async function getReservation(config: GetReservationConfig,input: GetReservationInput): Promise<BudgetReservation|null> {
 if(requireBudgetScope(config).tenantId!==input.tenantId)throw new Error("Budget tenant mismatch");
 return (await createBudgetService(config)).getReservation(input.reservationId);
}
