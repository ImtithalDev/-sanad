import type { PaymentProvider } from "./types";
import { MoyasarProvider } from "./providers/moyasar";
import { BillingProviderConfigError } from "./errors";

export function getPaymentProvider(): PaymentProvider {
  const providerName = process.env.PAYMENT_PROVIDER || "moyasar";

  switch (providerName) {
    case "moyasar":
      return new MoyasarProvider();
    default:
      throw new BillingProviderConfigError(`Unknown PAYMENT_PROVIDER: "${providerName}"`);
  }
}
