export class BillingError extends Error {}
export class BillingUnauthenticatedError extends BillingError {}
export class BillingProviderConfigError extends BillingError {}
export class BillingProviderUnavailableError extends BillingError {}
export class BillingInvalidWebhookSignatureError extends BillingError {}
export class BillingUnknownPlanError extends BillingError {}
