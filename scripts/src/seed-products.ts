import { getUncachableStripeClient } from "./stripeClient";

/**
 * Creates the Lovers Calling App subscription plan in Stripe.
 * Run with: pnpm --filter @workspace/scripts exec tsx src/seed-products.ts
 */
async function createProducts() {
  try {
    const stripe = await getUncachableStripeClient();
    console.log("Creating Lovers Calling App subscription plan...");

    // Check if already exists
    const existing = await stripe.products.search({
      query: "name:'Lovers Calling Premium' AND active:'true'",
    });

    if (existing.data.length > 0) {
      console.log("Product already exists:", existing.data[0].id);
      const prices = await stripe.prices.list({
        product: existing.data[0].id,
        active: true,
      });
      prices.data.forEach((p) => {
        console.log(
          `  Price: ${p.id} — $${(p.unit_amount ?? 0) / 100}/${p.recurring?.interval}`,
        );
      });
      return;
    }

    const product = await stripe.products.create({
      name: "Lovers Calling Premium",
      description:
        "Unlimited private audio calls with AI voice transformation. Generate one-time call links and switch your voice between male and female in real-time.",
      metadata: { app: "lovers-calling" },
    });
    console.log("Created product:", product.id);

    const monthlyPrice = await stripe.prices.create({
      product: product.id,
      unit_amount: 999, // $9.99/month
      currency: "usd",
      recurring: { interval: "month" },
    });
    console.log("Monthly price:", monthlyPrice.id, "— $9.99/month");

    const yearlyPrice = await stripe.prices.create({
      product: product.id,
      unit_amount: 7999, // $79.99/year
      currency: "usd",
      recurring: { interval: "year" },
    });
    console.log("Yearly price:", yearlyPrice.id, "— $79.99/year");

    console.log("\n✓ Done! Webhooks will sync to your database automatically.");
    console.log(
      "\nShare these price IDs with the frontend checkout flow:",
    );
    console.log("  Monthly:", monthlyPrice.id);
    console.log("  Yearly:", yearlyPrice.id);
  } catch (err: any) {
    console.error("Error:", err.message);
    process.exit(1);
  }
}

createProducts();
