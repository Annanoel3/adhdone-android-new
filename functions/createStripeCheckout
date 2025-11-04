import { createClientFromRequest } from 'npm:@base44/sdk@0.7.1';
import Stripe from 'npm:stripe@17.5.0';

Deno.serve(async (req) => {
    try {
        const apiKey = Deno.env.get("STRIPE_API_KEY");
        const monthlyPriceId = Deno.env.get("STRIPE_PRICE_ID");
        const yearlyPriceId = Deno.env.get("STRIPE_YEARLY_PRICE_ID");

        if (!apiKey) {
            return Response.json({ error: 'Stripe API key not configured' }, { status: 500 });
        }

        const stripe = new Stripe(apiKey, {
            apiVersion: '2024-11-20.acacia'
        });

        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { plan } = await req.json();
        
        // Default to monthly if no plan specified
        let priceId = monthlyPriceId;
        if (plan === 'yearly' && yearlyPriceId) {
            priceId = yearlyPriceId;
        }

        if (!priceId) {
            return Response.json({ error: 'Stripe Price ID not configured' }, { status: 500 });
        }

        // Create Stripe checkout session
        const session = await stripe.checkout.sessions.create({
            mode: 'subscription',
            payment_method_types: ['card'],
            line_items: [{
                price: priceId,
                quantity: 1,
            }],
            success_url: 'https://adhdone.space/PaymentSuccess?session_id={CHECKOUT_SESSION_ID}',
            cancel_url: 'https://adhdone.space/TrialEnded',
            customer_email: user.email,
            client_reference_id: user.id,
            metadata: {
                user_id: user.id,
                user_email: user.email
            }
        });

        return Response.json({ url: session.url });
    } catch (error) {
        console.error('Stripe checkout error:', error);
        return Response.json({ error: error.message }, { status: 500 });
    }
});