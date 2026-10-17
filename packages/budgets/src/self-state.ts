import type { RunContext, BudgetRef } from "@asi/contracts";
import { createBudgetService, requireBudgetScope, storedQuantity, type BudgetConfig, type SelfState } from "./runtime.js";
export type SelfStateConfig = BudgetConfig;
export type SelfStateResult = SelfState;
export async function getSelfState(config: SelfStateConfig,context: RunContext): Promise<SelfStateResult> {
 return (await createBudgetService(config)).getSelfState(context);
}
export type GetBudgetSnapshotConfig = BudgetConfig;
export interface BudgetSnapshot {
 accountId: string; tenantId: string; accountName: string; monthlyLimitMicroUsd: number; currentSpendMicroUsd: number; periodStart: Date;
 activeReservations: Array<{reservationId:string;runId:string;reservedTokens:number;reservedCostMicroUsd:number;status:string}>;
 settledReservations: Array<{reservationId:string;runId:string;settledTokens:number;settledCostMicroUsd:number;settledAt:Date}>;
}
export async function getBudgetSnapshot(config: GetBudgetSnapshotConfig,ref: BudgetRef): Promise<BudgetSnapshot> {
 const scope=requireBudgetScope(config);
 if(ref.tenantId!==scope.tenantId||ref.accountId!==scope.context.budgetRef.accountId||ref.rootRunId!==scope.context.budgetRef.rootRunId)throw new Error("Budget reference mismatch");
 const state=await (await createBudgetService(config)).snapshot();const account=state.account;
 return {accountId:String(account['account_id']),tenantId:scope.tenantId,accountName:String(account['account_name']),monthlyLimitMicroUsd:storedQuantity(account['monthly_limit_micro_usd']),currentSpendMicroUsd:storedQuantity(account['current_spend_micro_usd']),periodStart:new Date(String(account['period_start'])),activeReservations:state.reservations.filter(row=>['reserved','dispatched','unknown'].includes(String(row['status']))).map(row=>({reservationId:String(row['reservation_id']),runId:String(row['run_id']),reservedTokens:storedQuantity(row['reserved_tokens']),reservedCostMicroUsd:storedQuantity(row['reserved_cost_micro_usd']),status:String(row['status'])})),settledReservations:state.reservations.filter(row=>row['status']==='settled').map(row=>({reservationId:String(row['reservation_id']),runId:String(row['run_id']),settledTokens:storedQuantity(row['settled_tokens']),settledCostMicroUsd:storedQuantity(row['settled_cost_micro_usd']),settledAt:new Date(String(row['settled_at']))}))};
}
