import { supabase } from "@/integrations/supabase/client";
import { runLearningPipeline } from "@/services/learningPipeline";

/**
 * Generates and inserts realistic South African FMCG demo data
 * into sell_out_data and campaign_data_v2 for immediate dashboard demo.
 */

const RETAILERS = ["Pick n Pay", "Checkers", "Woolworths", "Spar", "Makro", "Clicks", "Dis-Chem", "Game"];
const STORES: Record<string, string[]> = {
  "Pick n Pay": ["PnP - Sandton City", "PnP - V&A Waterfront", "PnP - Gateway", "PnP - Menlyn"],
  "Checkers": ["Checkers - Rosebank", "Checkers - Canal Walk", "Checkers - Pavilion", "Checkers - Centurion"],
  "Woolworths": ["Woolworths - Hyde Park", "Woolworths - Cavendish", "Woolworths - uMhlanga"],
  "Spar": ["Spar - Bryanston", "Spar - Green Point", "Spar - Ballito"],
  "Makro": ["Makro - Silver Lakes", "Makro - Strubens Valley", "Makro - Springfield"],
  "Clicks": ["Clicks - Sandton", "Clicks - Century City", "Clicks - La Lucia"],
  "Dis-Chem": ["Dis-Chem - Clearwater", "Dis-Chem - Tygervalley", "Dis-Chem - Midlands"],
  "Game": ["Game - Menlyn", "Game - Canal Walk"],
};
const REGIONS: Record<string, string> = {
  "Sandton City": "Gauteng", "Rosebank": "Gauteng", "Hyde Park": "Gauteng", "Bryanston": "Gauteng",
  "Silver Lakes": "Gauteng", "Strubens Valley": "Gauteng", "Clearwater": "Gauteng", "Menlyn": "Gauteng",
  "Centurion": "Gauteng",
  "V&A Waterfront": "Western Cape", "Canal Walk": "Western Cape", "Cavendish": "Western Cape",
  "Green Point": "Western Cape", "Century City": "Western Cape", "Tygervalley": "Western Cape",
  "Gateway": "KwaZulu-Natal", "Pavilion": "KwaZulu-Natal", "uMhlanga": "KwaZulu-Natal",
  "Ballito": "KwaZulu-Natal", "La Lucia": "KwaZulu-Natal", "Springfield": "KwaZulu-Natal",
  "Midlands": "KwaZulu-Natal",
};
const BRANDS = [
  { brand: "Cadbury", products: ["Cadbury Dairy Milk 80g", "Cadbury Top Deck 80g", "Cadbury Lunch Bar 48g"], category: "Confectionery" },
  { brand: "Simba", products: ["Simba Chips Original 120g", "Simba Chips Salt & Vinegar 120g", "Simba Nik Naks 135g"], category: "Snacks" },
  { brand: "Clover", products: ["Clover Fresh Milk 2L", "Clover Tropika 1L", "Clover Cream 250ml"], category: "Dairy" },
  { brand: "Sunlight", products: ["Sunlight Dishwash 750ml", "Sunlight 2-in-1 2kg", "Sunlight Auto 2kg"], category: "Home Care" },
  { brand: "Dove", products: ["Dove Beauty Bar 100g", "Dove Body Wash 400ml", "Dove Shampoo 400ml"], category: "Personal Care" },
  { brand: "Coca-Cola", products: ["Coca-Cola 2L", "Coca-Cola 330ml Can", "Fanta Orange 2L"], category: "Beverages" },
  { brand: "Tiger Brands", products: ["Tastic Rice 2kg", "KOO Baked Beans 410g", "Albany Bread 700g"], category: "Grocery" },
  { brand: "Unilever", products: ["Rama Original 500g", "Knorr Cup-a-Soup 4s", "Omo Auto 2kg"], category: "Home Care" },
];
const CAMPAIGNS = [
  { name: "Summer Snacking Push", platform: "Meta", channel: "Instagram Feed" },
  { name: "Back-to-School Essentials", platform: "Google", channel: "Search" },
  { name: "Festive Gifting Campaign", platform: "Meta", channel: "Facebook Feed" },
  { name: "Health & Wellness Wave", platform: "TikTok", channel: "In-Feed Ads" },
  { name: "Weekend Braai Specials", platform: "Google", channel: "YouTube" },
  { name: "Easter Family Treats", platform: "Meta", channel: "Instagram Stories" },
  { name: "Winter Warmers Promo", platform: "Google", channel: "Display" },
  { name: "DStv Sponsorship", platform: "DStv", channel: "TV" },
];

function rand(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randFloat(min: number, max: number): number {
  return Math.random() * (max - min) + min;
}

function getRegion(store: string): string {
  for (const [area, province] of Object.entries(REGIONS)) {
    if (store.includes(area)) return province;
  }
  return "Gauteng";
}

function generateDateRange(startDate: string, endDate: string): string[] {
  const dates: string[] = [];
  const current = new Date(startDate);
  const end = new Date(endDate);
  while (current <= end) {
    dates.push(current.toISOString().split("T")[0]);
    current.setDate(current.getDate() + 1);
  }
  return dates;
}

export async function seedDemoData(): Promise<{ sellOutRows: number; campaignRows: number }> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error("Not authenticated");

  const userId = session.user.id;

  // Get or create project
  const { data: projects } = await supabase.from("projects").select("id").limit(1);
  let projectId = projects?.[0]?.id;
  if (!projectId) {
    const { data: newProject } = await supabase.from("projects").insert({
      name: "SignalStack Demo",
      user_id: userId,
    }).select("id").single();
    projectId = newProject?.id;
  }
  if (!projectId) throw new Error("Could not create project");

  // Create upload record for demo data
  const { data: upload } = await supabase.from("data_uploads").insert({
    user_id: userId,
    file_name: "demo-dataset.csv",
    file_type: "csv",
    file_size: 0,
    storage_path: `${userId}/demo-dataset`,
    source_name: "SignalStack Demo",
    source_type: "retailer",
    status: "ready",
    row_count: 0,
  }).select("id").single();
  const uploadId = upload?.id;
  if (!uploadId) throw new Error("Could not create upload record");

  // Generate 6 months of sell-out data (Sep 2025 - Feb 2026)
  const dates = generateDateRange("2025-09-01", "2026-02-28");
  const sellOutRecords: Record<string, unknown>[] = [];

  for (const date of dates) {
    const dayOfWeek = new Date(date).getDay();
    const month = parseInt(date.slice(5, 7));
    // Seasonal multiplier: Nov-Jan festive boost, Feb back-to-school
    const seasonal = [11, 12, 1].includes(month) ? 1.4 : month === 2 ? 1.15 : 1.0;
    // Weekend boost
    const weekendMult = (dayOfWeek === 0 || dayOfWeek === 6) ? 1.25 : 1.0;

    // Each day: sample 3-5 brands × 1-2 retailers × 1 product
    const brandCount = rand(3, 5);
    const selectedBrands = [...BRANDS].sort(() => Math.random() - 0.5).slice(0, brandCount);

    for (const brandInfo of selectedBrands) {
      const retailerCount = rand(1, 3);
      const selectedRetailers = [...RETAILERS].sort(() => Math.random() - 0.5).slice(0, retailerCount);

      for (const retailer of selectedRetailers) {
        const product = brandInfo.products[rand(0, brandInfo.products.length - 1)];
        const stores = STORES[retailer] ?? [`${retailer} - Main`];
        const store = stores[rand(0, stores.length - 1)];
        const basePrice = randFloat(15, 250);
        const units = Math.round(rand(5, 80) * seasonal * weekendMult);
        const revenue = Math.round(units * basePrice * 100) / 100;

        sellOutRecords.push({
          user_id: userId,
          project_id: projectId,
          upload_id: uploadId,
          product_name_raw: product,
          brand: brandInfo.brand,
          category: brandInfo.category,
          retailer,
          store_location: store,
          region: getRegion(store),
          date,
          revenue,
          units_sold: units,
          cost: Math.round(revenue * randFloat(0.55, 0.75) * 100) / 100,
          sku: `${brandInfo.brand.slice(0, 3).toUpperCase()}-${rand(1000, 9999)}`,
        });
      }
    }
  }

  // Insert sell-out data in batches
  let totalSellOut = 0;
  const batchSize = 500;
  for (let i = 0; i < sellOutRecords.length; i += batchSize) {
    const batch = sellOutRecords.slice(i, i + batchSize);
    const { error } = await supabase.from("sell_out_data").insert(batch);
    if (!error) totalSellOut += batch.length;
    else console.error("[DemoSeeder] sell_out_data batch error:", error.message);
  }

  // Generate campaign data across the same period
  const campaignRecords: Record<string, unknown>[] = [];
  for (const campaign of CAMPAIGNS) {
    // Each campaign runs for 2-6 weeks
    const startOffset = rand(0, 140);
    const duration = rand(14, 42);
    const startDate = new Date("2025-09-01");
    startDate.setDate(startDate.getDate() + startOffset);
    const endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + duration);

    // Generate weekly aggregates for the campaign
    const current = new Date(startDate);
    while (current <= endDate) {
      const weekEnd = new Date(current);
      weekEnd.setDate(weekEnd.getDate() + 6);

      const weekSpend = rand(5000, 45000);
      const impressions = Math.round(weekSpend * randFloat(8, 25));
      const clicks = Math.round(impressions * randFloat(0.01, 0.06));
      const conversions = Math.round(clicks * randFloat(0.02, 0.12));
      const revenue = Math.round(conversions * randFloat(80, 350));

      campaignRecords.push({
        user_id: userId,
        project_id: projectId,
        upload_id: uploadId,
        campaign_name: campaign.name,
        platform: campaign.platform,
        channel: campaign.channel,
        flight_start: current.toISOString().split("T")[0],
        flight_end: (weekEnd > endDate ? endDate : weekEnd).toISOString().split("T")[0],
        spend: weekSpend,
        impressions,
        clicks,
        conversions,
        revenue,
      });

      current.setDate(current.getDate() + 7);
    }
  }

  // Insert campaign data
  let totalCampaign = 0;
  for (let i = 0; i < campaignRecords.length; i += batchSize) {
    const batch = campaignRecords.slice(i, i + batchSize);
    const { error } = await supabase.from("campaign_data_v2").insert(batch);
    if (!error) totalCampaign += batch.length;
    else console.error("[DemoSeeder] campaign_data_v2 batch error:", error.message);
  }

  // Update upload record with row count
  await supabase.from("data_uploads").update({
    row_count: totalSellOut + totalCampaign,
    status: "ready",
  }).eq("id", uploadId);

  // Trigger learning pipeline (non-blocking)
  runLearningPipeline(projectId, userId).catch(() => {});

  return { sellOutRows: totalSellOut, campaignRows: totalCampaign };
}

export async function hasDemoData(): Promise<boolean> {
  const { data } = await supabase
    .from("data_uploads")
    .select("id")
    .eq("source_name", "SignalStack Demo")
    .neq("status", "archived")
    .limit(1);
  return (data?.length ?? 0) > 0;
}
