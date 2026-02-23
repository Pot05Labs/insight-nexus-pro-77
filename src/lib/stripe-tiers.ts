export const TIERS = {
  essentials: {
    name: "Essentials",
    price: "$2,999",
    priceId: "price_1T2M94DjBG1hb5oFWTFpRije",
    productId: "prod_U0Msn18H2oKpk0",
    description: "Descriptive reporting & data harmonisation",
    features: [
      "Sell-out data harmonisation",
      "Up to 10 data sources",
      "10,000 rows / month",
      "Dashboard KPIs & charts",
      "CSV & PDF export",
      "Email support",
    ],
  },
  growth: {
    name: "Growth",
    price: "$7,499",
    priceId: "price_1T2MB1DjBG1hb5oFsz5lS3vV",
    productId: "prod_U0Mu3eio9LBqAT",
    description: "Comparative analysis & campaign attribution",
    features: [
      "Everything in Essentials",
      "Unlimited data sources",
      "100,000 rows / month",
      "Campaign overlay & attribution",
      "Cross-retailer benchmarking",
      "AI insights & chat",
      "Priority support",
    ],
  },
  scale: {
    name: "Scale",
    price: "$14,999",
    priceId: "",
    productId: "prod_U0MvyYj3WaVoIQ",
    description: "Scenario simulation & budget optimisation",
    features: [
      "Everything in Growth",
      "Media Mix Modelling (MMM)",
      "What-if scenario simulator",
      "Budget optimisation engine",
      "1M+ rows / month",
      "Dedicated account manager",
    ],
  },
  enterprise: {
    name: "Enterprise",
    price: "Custom",
    priceId: "",
    productId: "",
    description: "Continuous optimisation & real-time intelligence",
    features: [
      "Everything in Scale",
      "Real-time data ingestion",
      "Auto-optimisation engine",
      "Multi-brand orchestration",
      "Custom integrations & SSO",
      "SLA & dedicated support",
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
