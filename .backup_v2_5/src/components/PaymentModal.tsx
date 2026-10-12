import React, { useState } from 'react';
import { X, ShieldCheck, CheckCircle2, AlertCircle, CreditCard, Lock, Calendar, ExternalLink } from 'lucide-react';
import { Business } from '../types/pipsqueak.ts';

interface PaymentModalProps {
  business: Business;
  isOpen: boolean;
  onClose: () => void;
  onPaymentSuccess: (updatedBusiness: Business) => void;
}

export const PaymentModal: React.FC<PaymentModalProps> = ({
  business,
  isOpen,
  onClose,
  onPaymentSuccess,
}) => {
  const isInitialSignUp = !business.billing?.isInitialSignUpPaid;
  const hasReferralDiscount = !isInitialSignUp && Boolean(business.billing?.hasReferralDiscount);
  const feeAmount = isInitialSignUp ? 19.99 : hasReferralDiscount ? 12.5 : 25;

  const [affirmativeAgreed, setAffirmativeAgreed] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [paymentSuccessData, setPaymentSuccessData] = useState<{
    receiptNumber: string;
    paidThroughDate: string;
    providerReference: string;
    amount: number;
    isInitialSignUp: boolean;
  } | null>(null);

  if (!isOpen) return null;

  const handleManualPayment = async () => {
    if (!affirmativeAgreed) {
      setErrorMsg(`Please confirm affirmative agreement for this single 2-month $${feeAmount.toFixed(2)} payment.`);
      return;
    }

    setIsProcessing(true);
    setErrorMsg(null);

    try {
      // Step 1: Create session with provider integration boundary
      const sessionRes = await fetch('/api/billing/checkout-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ businessId: business.id }),
      });

      if (!sessionRes.ok) {
        throw new Error('Could not initiate billing checkout session');
      }

      const session = await sessionRes.json();

      // Step 2: Server-side payment verification (simulating hosted provider callback / webhook)
      const verifyRes = await fetch('/api/billing/verify-payment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          businessId: business.id,
          sessionId: session.sessionId,
          providerReference: `ch_verified_${Date.now()}`,
        }),
      });

      if (!verifyRes.ok) {
        throw new Error('Payment verification failed on the server');
      }

      const verified = await verifyRes.json();
      setPaymentSuccessData({
        receiptNumber: verified.business.billing.receiptNumber || 'REC-2026-0099',
        paidThroughDate: verified.business.billing.paidThroughDate,
        providerReference: verified.business.billing.providerReference || 'ch_provider_ref',
        amount: verified.amount || feeAmount,
        isInitialSignUp: verified.isInitialSignUp ?? isInitialSignUp,
      });
      onPaymentSuccess(verified.business);
    } catch (err: any) {
      setErrorMsg(err.message || 'Payment processing error');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-neutral-900/60 backdrop-blur-xs">
      <div className="relative w-full max-w-lg bg-white rounded-xl shadow-xl border border-neutral-200 p-6">
        <div className="flex items-center justify-between pb-4 border-b border-neutral-100">
          <div>
            <h3 className="text-base font-semibold text-neutral-900 font-display">
              {isInitialSignUp
                ? 'Initial Listing Enrollment Fee'
                : hasReferralDiscount
                ? 'Bimonthly Renewal (50% Referral Discount)'
                : 'Bimonthly Advertising Renewal'}
            </h3>
            <p className="text-xs text-neutral-500 mt-0.5">
              Listing: {business.name} (Permanent ID: {business.id})
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-neutral-400 hover:text-neutral-700 rounded-md transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {paymentSuccessData ? (
          <div className="py-6 text-center space-y-4">
            <div className="w-12 h-12 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-6 h-6" />
            </div>
            <div>
              <h4 className="text-base font-semibold text-neutral-900 font-display">
                ${paymentSuccessData.amount.toFixed(2)} Advertising Fee Verified
              </h4>
              <p className="text-xs text-neutral-500 mt-1 max-w-sm mx-auto">
                {paymentSuccessData.isInitialSignUp
                  ? 'Your initial 2-month advertising period is active. All permanent links, profile URL, and QR codes are live.'
                  : 'Your bimonthly listing renewal is active for 2 additional months. All permanent links, profile URL, and QR codes are preserved.'}
              </p>
            </div>

            <div className="bg-neutral-50 border border-neutral-200 rounded-lg p-3 text-xs text-left space-y-2">
              <div className="flex justify-between">
                <span className="text-neutral-500">Transaction Type</span>
                <span className="font-medium text-neutral-900">
                  {paymentSuccessData.isInitialSignUp
                    ? 'One-Time Initial Enrollment ($19.99)'
                    : hasReferralDiscount
                    ? 'Bimonthly Renewal with 50% Referral Discount ($12.50)'
                    : 'Bimonthly 2-Month Renewal ($25.00)'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-neutral-500">Receipt Number</span>
                <span className="font-mono text-neutral-900">{paymentSuccessData.receiptNumber}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-neutral-500">Paid-Through Date</span>
                <span className="font-medium text-neutral-900">
                  {new Date(paymentSuccessData.paidThroughDate).toLocaleDateString('en-US', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                  })}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-neutral-500">Provider Reference</span>
                <span className="font-mono text-neutral-600 truncate max-w-[200px]">
                  {paymentSuccessData.providerReference}
                </span>
              </div>
            </div>

            <button
              onClick={onClose}
              className="w-full py-2.5 px-4 text-xs font-semibold text-white bg-neutral-900 hover:bg-neutral-800 rounded-lg transition-colors"
            >
              Return to Dashboard
            </button>
          </div>
        ) : (
          <div className="py-4 space-y-4">
            {/* Fee Breakdown & Term Terms */}
            <div className="p-4 bg-neutral-50 border border-neutral-200 rounded-lg space-y-3">
              <div className="flex items-baseline justify-between">
                <div>
                  <span className="text-sm font-semibold text-neutral-900 block">
                    {isInitialSignUp
                      ? 'Initial 2-Month Advertising Period'
                      : hasReferralDiscount
                      ? 'Bimonthly Renewal (50% Off Qualified Referral)'
                      : 'Bimonthly 2-Month Advertising Extension'}
                  </span>
                  <span className="text-[11px] text-neutral-500">
                    {isInitialSignUp
                      ? 'One-time $19.99 enrollment fee activates the listing'
                      : hasReferralDiscount
                      ? '50% referral discount applied: $12.50 for this renewal'
                      : 'Bimonthly $25 fee extends visibility by 2 months'}
                  </span>
                </div>
                <span className="text-2xl font-bold font-display text-neutral-900 tabular-nums">
                  ${feeAmount.toFixed(2)}
                </span>
              </div>

              <div className="text-xs text-neutral-600 space-y-1.5 border-t border-neutral-200 pt-2.5">
                <div className="flex items-center gap-2">
                  <Calendar className="w-3.5 h-3.5 text-neutral-500 shrink-0" />
                  <span>2-month advertising period with immediate active directory visibility</span>
                </div>
                <div className="flex items-center gap-2">
                  <Lock className="w-3.5 h-3.5 text-neutral-500 shrink-0" />
                  <span>Strictly manual renewal. No auto-enrollment, recurring charges, or card saving</span>
                </div>
                <div className="flex items-center gap-2">
                  <ShieldCheck className="w-3.5 h-3.5 text-neutral-500 shrink-0" />
                  <span>Renewal reminder sent before period ends with manual renewal action</span>
                </div>
              </div>
            </div>

            {/* Platform Pricing Transparency */}
            <div className="p-3 bg-neutral-50 border border-neutral-200 rounded-lg text-xs space-y-1">
              <div className="flex justify-between text-neutral-700">
                <span>Initial Enrollment (one-time):</span>
                <span className="font-mono font-medium">$19.99 (Includes first 2 months)</span>
              </div>
              <div className="flex justify-between text-neutral-700">
                <span>Subsequent Renewal:</span>
                <span className="font-mono font-medium">$25.00 every 2 months</span>
              </div>
              <div className="flex justify-between text-neutral-700">
                <span>Referral Incentive:</span>
                <span className="font-mono font-medium text-emerald-700">50% off first renewal ($12.50)</span>
              </div>
              <div className="flex justify-between text-neutral-500 pt-1 border-t border-neutral-200/60 text-[11px]">
                <span>Optional $1 App Fee:</span>
                <span className="font-mono">Disabled & Separate (Not billed)</span>
              </div>
            </div>

            {/* Platform Integration Boundary Notice */}
            <div className="p-3 bg-neutral-50 border border-neutral-200 rounded-lg text-[11px] text-neutral-600">
              <span className="font-semibold text-neutral-800">Integration Boundary: </span>
              Payment gateway operates in verified sandbox mode. Live credit card processing connects to production Stripe upon injection of owner keys. No real card is billed in this preview.
            </div>

            {/* Affirmative Confirmation Checkbox */}
            <div className="pt-2 border-t border-neutral-100">
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={affirmativeAgreed}
                  onChange={(e) => setAffirmativeAgreed(e.target.checked)}
                  className="mt-0.5 w-4 h-4 text-neutral-900 rounded border-neutral-300 focus:ring-neutral-900"
                />
                <span className="text-xs text-neutral-700 leading-snug">
                  I understand this is a single manual payment of <strong>${feeAmount.toFixed(2)}</strong> for a 2-month period.
                  Short Stack will never automatically charge my card or auto-renew my listing.
                </span>
              </label>
            </div>

            {errorMsg && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2 text-xs text-red-700">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{errorMsg}</span>
              </div>
            )}

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="py-2 px-3 text-xs font-medium text-neutral-600 hover:text-neutral-900"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleManualPayment}
                disabled={isProcessing || !affirmativeAgreed}
                className="inline-flex items-center gap-2 py-2 px-4 text-xs font-semibold text-white bg-neutral-900 hover:bg-neutral-800 disabled:opacity-50 rounded-lg transition-colors"
              >
                <CreditCard className="w-3.5 h-3.5" />
                {isProcessing ? 'Verifying with Server...' : `Confirm & Pay $${feeAmount.toFixed(2)}`}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
