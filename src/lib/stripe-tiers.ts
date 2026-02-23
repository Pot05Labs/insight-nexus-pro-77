export const TIERS = {
  starter: {
    name: "Starter",
    price: "$999",
    priceId: "price_1T2M94DjBG1hb5oFWTFpRije",
    productId: "prod_U0Msn18H2oKpk0",
    features: [
      "Sell-out data harmonisation",
      "Up to 5 data sources",
      "1,000 rows / month",
      "Basic dashboards",
      "Email support",
    ],
  },
  professional: {
    name: "Professional",
    price: "$2,999",
    priceId: "price_1T2MB1DjBG1hb5oFsz5lS3vV",
    productId: "prod_U0Mu3eio9LBqAT",
    features: [
      "Everything in Starter",
      "Unlimited data sources",
      "50,000 rows / month",
      "Campaign overlay & attribution",
      "AI insights & chat",
      "PDF report export",
      "Priority support",
    ],
  },
  enterprise: {
    name: "Enterprise",
    price: "Contact Us",
    priceId: "",
    productId: "prod_U0MvyYj3WaVoIQ",
    features: [
      "Everything in Professional",
      "Multi-tenant workspaces",
      "Custom integrations",
      "Dedicated account manager",
      "SLA & SSO",
    ],
  },
} as const;

export type TierKey = keyof typeof TIERS;

export function getTierByProductId(productId: string): TierKey | null {
  for (const [key, tier] of Object.entries(TIERS)) {
    if (tier.productId === productId) return key as TierKey;
  }
  return null;
}
