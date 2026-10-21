import { UiOperationSchema, UiCapabilitiesSchema } from '@asi/contracts';
export async function readCapabilities(provider) { return UiCapabilitiesSchema.parse(provider ? await provider.read() : { schemaVersion: 1, revision: 0, operations: UiOperationSchema.options.map(operation => ({ operation, state: 'unconfigured' })) }); }
