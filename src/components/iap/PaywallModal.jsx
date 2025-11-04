import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, Sparkles, Check } from "lucide-react";
import { IAP_PRODUCTS, TRIAL_DAYS } from "@/components/utils/iapConstants";
import { NativeBilling } from "./NativeBilling";
import { base44 } from "@/api/base44Client";
import { useEntitlements } from "@/components/hooks/useEntitlements";

export default function PaywallModal({ isOpen, onClose, theme }) {
  const [products, setProducts] = useState([]);
  const [selectedPlan, setSelectedPlan] = useState('monthly');
  const [isLoading, setIsLoading] = useState(false);
  const [isPurchasing, setIsPurchasing] = useState(false);
  const { refresh } = useEntitlements();

  useEffect(() => {
    if (isOpen) {
      loadProducts();
    }
  }, [isOpen]);

  const loadProducts = async () => {
    setIsLoading(true);
    try {
      const isSupported = await NativeBilling.isSupported();
      
      if (!isSupported) {
        // Fallback for web
        setProducts([
          { id: IAP_PRODUCTS.MONTHLY, title: 'Monthly', price: '$5.99', period: 'month' },
          { id: IAP_PRODUCTS.YEARLY, title: 'Yearly', price: '$59.99', period: 'year' },
        ]);
      } else {
        const prods = await NativeBilling.getProducts([
          IAP_PRODUCTS.MONTHLY,
          IAP_PRODUCTS.YEARLY
        ]);
        setProducts(prods);
      }
    } catch (error) {
      console.error('Failed to load products:', error);
    }
    setIsLoading(false);
  };

  const handlePurchase = async () => {
    setIsPurchasing(true);
    
    try {
      const productId = selectedPlan === 'monthly' ? IAP_PRODUCTS.MONTHLY : IAP_PRODUCTS.YEARLY;
      const user = await base44.auth.me();
      
      // Make purchase via native bridge
      const result = await NativeBilling.purchase(productId, user.id);
      
      // Verify with backend
      if (result.platform === 'apple') {
        await base44.functions.invoke('iap/appleVerify', {
          transactionReceipt: result.receipt,
          productId,
          appAccountToken: user.id
        });
      } else if (result.platform === 'google') {
        await base44.functions.invoke('iap/googleVerify', {
          purchaseToken: result.purchaseToken,
          productId
        });
      }
      
      // Refresh entitlements
      await refresh();
      
      onClose();
    } catch (error) {
      console.error('Purchase failed:', error);
      alert('Purchase failed. Please try again.');
    }
    
    setIsPurchasing(false);
  };

  const handleRestore = async () => {
    setIsPurchasing(true);
    
    try {
      await NativeBilling.restore();
      await refresh();
      alert('Purchases restored successfully!');
      onClose();
    } catch (error) {
      console.error('Restore failed:', error);
      alert('Failed to restore purchases.');
    }
    
    setIsPurchasing(false);
  };

  const monthlyProduct = products.find(p => p.id === IAP_PRODUCTS.MONTHLY);
  const yearlyProduct = products.find(p => p.id === IAP_PRODUCTS.YEARLY);

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className={`max-w-2xl ${
        theme === 'dark' ? 'bg-gray-800 border-gray-700' : ''
      }`}>
        <DialogHeader>
          <DialogTitle className={`text-2xl flex items-center gap-2 ${
            theme === 'dark' ? 'text-white' : 'text-gray-900'
          }`}>
            <Sparkles className="w-6 h-6 text-purple-600" />
            Unlock ADHDone Premium
          </DialogTitle>
        </DialogHeader>

        {isLoading ? (
          <div className="py-12 text-center">
            <Loader2 className="w-8 h-8 animate-spin mx-auto text-purple-600" />
          </div>
        ) : (
          <div className="space-y-6 py-4">
            <div className={`p-4 rounded-lg ${
              theme === 'minimalist' 
                ? 'bg-purple-50 border border-purple-200' 
                : theme === 'dark'
                  ? 'bg-purple-900/20 border border-purple-800'
                  : 'bg-gradient-to-r from-purple-100 to-pink-100 border border-purple-200'
            }`}>
              <p className={`text-center font-semibold ${
                theme === 'dark' ? 'text-gray-100' : 'text-gray-900'
              }`}>
                🎉 Start with {TRIAL_DAYS} days free!
              </p>
            </div>

            <div className="grid md:grid-cols-2 gap-4">
              {monthlyProduct && (
                <div
                  onClick={() => setSelectedPlan('monthly')}
                  className={`p-6 rounded-xl border-2 cursor-pointer transition-all ${
                    selectedPlan === 'monthly'
                      ? 'border-purple-600 bg-purple-50 scale-105'
                      : theme === 'dark'
                        ? 'border-gray-700 hover:border-gray-600'
                        : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <h3 className="text-lg font-semibold mb-2">Monthly</h3>
                  <div className="text-3xl font-bold mb-2">{monthlyProduct.price}</div>
                  <p className="text-sm text-gray-600">per month</p>
                  <Badge className="mt-3">Flexible</Badge>
                </div>
              )}

              {yearlyProduct && (
                <div
                  onClick={() => setSelectedPlan('yearly')}
                  className={`p-6 rounded-xl border-2 cursor-pointer transition-all relative ${
                    selectedPlan === 'yearly'
                      ? 'border-purple-600 bg-purple-50 scale-105'
                      : theme === 'dark'
                        ? 'border-gray-700 hover:border-gray-600'
                        : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <Badge className="absolute -top-3 left-1/2 transform -translate-x-1/2 bg-green-600">
                    Best Value
                  </Badge>
                  <h3 className="text-lg font-semibold mb-2">Yearly</h3>
                  <div className="text-3xl font-bold mb-2">{yearlyProduct.price}</div>
                  <p className="text-sm text-gray-600">per year</p>
                  <Badge className="mt-3">Save 17%</Badge>
                </div>
              )}
            </div>

            <div className="space-y-2">
              {[
                'Smart push reminders',
                'AI task breakdown',
                'Focus timer & analytics',
                'Accountability partners',
                'Unlimited tasks & features'
              ].map((feature, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Check className="w-5 h-5 text-green-600" />
                  <span className={theme === 'dark' ? 'text-gray-200' : 'text-gray-700'}>
                    {feature}
                  </span>
                </div>
              ))}
            </div>

            <div className="space-y-3">
              <Button
                onClick={handlePurchase}
                disabled={isPurchasing}
                className={`w-full ${
                  theme === 'minimalist' 
                    ? 'bg-purple-600 hover:bg-purple-700' 
                    : 'bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700'
                }`}
              >
                {isPurchasing ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Processing...
                  </>
                ) : (
                  `Start ${TRIAL_DAYS}-Day Free Trial`
                )}
              </Button>

              <Button
                onClick={handleRestore}
                disabled={isPurchasing}
                variant="ghost"
                className="w-full"
              >
                Restore Purchases
              </Button>
            </div>

            <p className="text-xs text-center text-gray-500">
              Trial starts today. Cancel anytime before day {TRIAL_DAYS} to avoid charges.
              Manages via App Store or Play Store.
            </p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}