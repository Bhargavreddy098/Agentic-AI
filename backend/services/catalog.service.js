export function unavailableCatalog() { return { items: [], revision: 0, availability: 'unavailable', reason: 'Service is not configured.' }; }
export function unavailableSettings() { return { revision: 0, allowedActions: [], availability: 'unavailable', privacyMode: 'unavailable', spendLimitMicroUsd: null, retentionDays: null, notifications: false, scheduleEnabled: false }; }
