import type { Pool, PoolClient } from "pg";
import { BudgetRefSchema, BudgetReservationSchema, OpaqueIdSchema, RunContextSchema, boundedJsonObjectSchema } from "@asi/contracts";
import type { BudgetRef, BudgetReservation, RunContext } from "@asi/contracts";

export interface BudgetQuotas { accountTokens: number; accountCostMicroUsd: number; tenantTokens: number; tenantCostMicroUsd: number }
export interface TrustedBudgetScope { tenantId: string; ownerId: string; context: RunContext; operationKey: string; quotas: BudgetQuotas }
export interface BudgetConfig { pool: Pool; trustedScope?: TrustedBudgetScope }
export interface SelfState { remainingTokens: number; remainingCostMicroUsd: number; degradedCapabilities: string[] }
export interface BudgetService {
 reserveBudget(ref: BudgetRef,tokens: number,maxCostMicroUsd: number): Promise<BudgetReservation>;
 settleBudget(id: string,actualTokens: number,actualCostMicroUsd: number,proof?: Record<string,unknown>): Promise<void>;
 releaseBudget(id: string,reason: string): Promise<void>;
 markDispatched(id: string): Promise<void>;
 markUnknown(id: string): Promise<void>;
 getReservation(id: string): Promise<BudgetReservation|null>;
 getSelfState(context: RunContext): Promise<SelfState>;
 snapshot(): Promise<StoredSnapshot>;
}
export interface BudgetReconciler {
 settleBudget(id: string,actualTokens: number,actualCostMicroUsd: number,proof: Record<string,unknown>): Promise<void>;
 releaseBudget(id: string,reason: string): Promise<void>;
}
export interface BillingConfig { pool: Pool; tenantId: string; ownerId: string }
type Row = Record<string,unknown>;
export interface StoredSnapshot { account: Row; tenant: Row; reservations: Row[] }
export function safeQuantity(value: unknown): number {
 if(typeof value!=="number"||!Number.isSafeInteger(value)||value<0)throw new Error("Invalid budget quantity");
 return value;
}
export function storedQuantity(value: unknown): number {
 if(typeof value!=="number"&&!(typeof value==="string"&&/^\d+$/.test(value)))throw new Error("Invalid stored budget quantity");
 return safeQuantity(Number(value));
}
function record(value: unknown): Row {
 if(value===null||typeof value!=="object"||Array.isArray(value))throw new Error("Invalid stored budget record");
 return value as Row;
}
export function requireBudgetScope(config: BudgetConfig): TrustedBudgetScope {
 const scope=config.trustedScope;
 if(!scope)throw new Error("Missing trusted budget scope");
 OpaqueIdSchema.parse(scope.tenantId);OpaqueIdSchema.parse(scope.ownerId);OpaqueIdSchema.parse(scope.operationKey);
 const context=RunContextSchema.parse(scope.context);
 if(context.budgetRef.tenantId!==scope.tenantId)throw new Error("Trusted budget tenant mismatch");
 if(!scope.quotas)throw new Error("Missing deployment budget quotas");
 const quotas={...scope.quotas};
 for(const name of ["accountTokens","accountCostMicroUsd","tenantTokens","tenantCostMicroUsd"] as const)safeQuantity(quotas[name]);
 return {...scope,context,quotas};
}
async function transaction<T>(pool: Pool,tenant: string,owner: string,work: (client: PoolClient)=>Promise<T>): Promise<T> {
 const client=await pool.connect();
 try {
  await client.query("BEGIN");
  await client.query("SELECT set_config('asi.tenant_id',$1,true),set_config('asi.owner_id',$2,true)",[tenant,owner]);
  const result=await work(client);await client.query("COMMIT");return result;
 }catch(error){await client.query("ROLLBACK").catch(()=>undefined);throw error;}finally{client.release();}
}
function reservation(row: Row): BudgetReservation|null {
 if(row['status']==="released")return null;
 const phase=row['status'];if(!["reserved","dispatched","unknown","settled"].includes(String(phase)))throw new Error("Invalid stored budget phase");
 return BudgetReservationSchema.parse({reservationId:row['reservation_id'],budgetRef:{tenantId:row['tenant_id'],accountId:row['account_id'],rootRunId:row['root_run_id']},reservedTokens:storedQuantity(row['reserved_tokens']),reservedCostMicroUsd:storedQuantity(row['reserved_cost_micro_usd']),status:phase==="dispatched"?"reserved":phase});
}
function sameRef(a: BudgetRef,b: BudgetRef): boolean {return a.tenantId===b.tenantId&&a.accountId===b.accountId&&a.rootRunId===b.rootRunId;}
function sameContext(a: RunContext,b: RunContext): boolean {
 return a.runId===b.runId&&a.sessionId===b.sessionId&&a.writerEpoch===b.writerEpoch&&a.mode===b.mode&&a.deadlineAt===b.deadlineAt&&a.parentRunId===b.parentRunId&&sameRef(a.budgetRef,b.budgetRef);
}
function remaining(limit: unknown,charged: unknown): number {
 const max=BigInt(storedQuantity(limit));
 if(typeof charged!=="string"&&typeof charged!=="number")throw new Error("Invalid charged quantity");
 if(!/^\d+$/.test(String(charged)))throw new Error("Invalid charged quantity");
 const balance=max-BigInt(charged);return Number(balance<0n?0n:balance);
}
export async function createBudgetService(config: BudgetConfig): Promise<BudgetService> {
 const scope=requireBudgetScope(config);
 const tx=<T>(work:(client:PoolClient)=>Promise<T>)=>transaction(config.pool,scope.tenantId,scope.ownerId,work);
 const rawSnapshot=(history=false)=>tx(async client=>{
  const result=await client.query<{value:unknown}>(history?"SELECT b06_history($1::jsonb) AS value":"SELECT b06_state($1::jsonb) AS value",[JSON.stringify(scope.context)]);
  const value=record(result.rows[0]?.value),account=record(value['account']),tenant=record(value['tenant']),rows=value['reservations']??[];
  if(!Array.isArray(rows))throw new Error("Invalid budget history");
  return {account,tenant,reservations:rows.map(record)};
 });
 const initial=await rawSnapshot();
 if(storedQuantity(initial.account['token_limit'])!==scope.quotas.accountTokens||storedQuantity(initial.account['monthly_limit_micro_usd'])!==scope.quotas.accountCostMicroUsd||storedQuantity(initial.tenant['token_limit'])!==scope.quotas.tenantTokens||storedQuantity(initial.tenant['cost_limit_micro_usd'])!==scope.quotas.tenantCostMicroUsd)throw new Error("Deployment budget quota mismatch");
 const write=async(id:string,action:string,tokens:number|null=null,cost:number|null=null,proof:Record<string,unknown>|null=null)=>{
  OpaqueIdSchema.parse(id);if(tokens!==null)safeQuantity(tokens);if(cost!==null)safeQuantity(cost);
  const usage=proof===null?null:boundedJsonObjectSchema(65536).parse(proof);
  return tx(async client=>{await client.query("SELECT b06_write($1::jsonb,$2,$3,$4,$5,$6::jsonb)",[JSON.stringify(scope.context),id,action,tokens,cost,usage===null?null:JSON.stringify(usage)]);});
 };
 return {
  reserveBudget:async(ref,tokens,cost)=>{
   if(!sameRef(BudgetRefSchema.parse(ref),scope.context.budgetRef))throw new Error("Budget reference mismatch");safeQuantity(tokens);safeQuantity(cost);
   const row=await tx(async client=>{const result=await client.query<{value:unknown}>("SELECT b06_reserve($1::jsonb,$2,$3,$4) AS value",[JSON.stringify(scope.context),scope.operationKey,tokens,cost]);return record(result.rows[0]?.value);});
   const value=reservation(row);if(!value)throw new Error("Released reservation cannot confer authority");return value;
  },
  settleBudget:(id,tokens,cost,proof={source:"trusted-writer"})=>write(id,"settle",tokens,cost,proof),
  releaseBudget:async(id,reason)=>{if(typeof reason!=="string"||reason.length<1||reason.length>1024)throw new Error("Invalid release reason");return write(id,"release");},
  markDispatched:id=>write(id,"dispatch"),markUnknown:id=>write(id,"unknown"),
  getReservation:async id=>{OpaqueIdSchema.parse(id);return tx(async client=>{const result=await client.query<{value:unknown}>("SELECT b06_lookup($1::jsonb,$2) AS value",[JSON.stringify(scope.context),id]);const row=result.rows[0]?.value;return row==null?null:reservation(record(row));});},
  getSelfState:async context=>{
   if(!sameContext(RunContextSchema.parse(context),scope.context))throw new Error("Budget context mismatch");
   const state=await rawSnapshot();const suspended=state.account['suspended']===true||state.tenant['suspended']===true;
   const remainingTokens=suspended?0:Math.min(remaining(state.account['token_limit'],state.account['charged_tokens']),remaining(state.tenant['token_limit'],state.tenant['charged_tokens']));
   const remainingCostMicroUsd=suspended?0:Math.min(remaining(state.account['monthly_limit_micro_usd'],state.account['current_spend_micro_usd']),remaining(state.tenant['cost_limit_micro_usd'],state.tenant['charged_cost_micro_usd']));
   const degradedCapabilities=suspended?["budget-suspended"]:[...(remainingCostMicroUsd<1000?["cost-intensive-operations"]:[]),...(remainingTokens<10000?["token-intensive-operations"]:[])];
   return {remainingTokens,remainingCostMicroUsd,degradedCapabilities};
  },snapshot:()=>rawSnapshot(true)
 };
}
export async function createBudgetReconciler(config: BillingConfig): Promise<BudgetReconciler> {
 const tenant=OpaqueIdSchema.parse(config.tenantId),owner=OpaqueIdSchema.parse(config.ownerId);
 await transaction(config.pool,tenant,owner,async client=>{
  const result=await client.query<{allowed:boolean}>("SELECT has_function_privilege(current_user,'b06_reconcile(text,text,bigint,bigint,jsonb)','EXECUTE') AS allowed");
  if(result.rows[0]?.allowed!==true)throw new Error("Trusted billing reconciliation access required");
 });
 const change=async(id:string,action:string,tokens:number|null,cost:number|null,proof:Record<string,unknown>|null)=>{
  OpaqueIdSchema.parse(id);if(tokens!==null)safeQuantity(tokens);if(cost!==null)safeQuantity(cost);
  const usage=proof===null?null:boundedJsonObjectSchema(65536).parse(proof);
  return transaction(config.pool,tenant,owner,async client=>{await client.query("SELECT b06_reconcile($1,$2,$3,$4,$5::jsonb)",[id,action,tokens,cost,usage===null?null:JSON.stringify(usage)]);});
 };
 return {settleBudget:(id,tokens,cost,proof)=>change(id,"settle",tokens,cost,proof),releaseBudget:async(id,reason)=>{if(typeof reason!=="string"||reason.length<1||reason.length>1024)throw new Error("Invalid release reason");return change(id,"release",null,null,null);}};
}
