import { createBudgetService, requireBudgetScope, storedQuantity, type BudgetConfig } from "./runtime.js";
export type SettleBudgetConfig = BudgetConfig;
export interface SettleBudgetInput { reservationId: string; actualTokens: number; actualCostMicroUsd: number; tenantId: string; proof?: Record<string,unknown> }
export async function settleBudget(config: SettleBudgetConfig,input: SettleBudgetInput): Promise<void> {
 if(requireBudgetScope(config).tenantId!==input.tenantId)throw new Error("Budget tenant mismatch");
 await (await createBudgetService(config)).settleBudget(input.reservationId,input.actualTokens,input.actualCostMicroUsd,input.proof);
}
export type ReleaseBudgetConfig = BudgetConfig;
export interface ReleaseBudgetInput { reservationId: string; tenantId: string; reason: string }
export async function releaseBudget(config: ReleaseBudgetConfig,input: ReleaseBudgetInput): Promise<void> {
 if(requireBudgetScope(config).tenantId!==input.tenantId)throw new Error("Budget tenant mismatch");
 await (await createBudgetService(config)).releaseBudget(input.reservationId,input.reason);
}
export type GetSettledConfig = BudgetConfig;
export interface GetSettledInput { runId: string; tenantId: string }
export interface SettledReservation { reservationId: string; runId: string; actualTokens: number; actualCostMicroUsd: number; settledAt: Date }
export async function getSettledForRun(config: GetSettledConfig,input: GetSettledInput): Promise<SettledReservation[]> {
 const scope=requireBudgetScope(config);
 if(scope.tenantId!==input.tenantId||scope.context.runId!==input.runId)throw new Error("Budget scope mismatch");
 const snapshot=await (await createBudgetService(config)).snapshot();
 return snapshot.reservations.filter(row=>row['status']==='settled'&&row['run_id']===input.runId).map(row=>({reservationId:String(row['reservation_id']),runId:input.runId,actualTokens:storedQuantity(row['settled_tokens']),actualCostMicroUsd:storedQuantity(row['settled_cost_micro_usd']),settledAt:new Date(String(row['settled_at']))}));
}
