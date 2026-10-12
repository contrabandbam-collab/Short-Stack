import React, { useState, useEffect, useRef } from 'react';
import { X, ShieldCheck, CheckCircle2, AlertCircle, CreditCard, Lock, Calendar, Loader2 } from 'lucide-react';
import type { Business } from '../types/pipsqueak.ts';

declare global {
  interface Window {
    Square?: {
      payments: (appId: string, locationId: string) => {
        card: (options?: any) => Promise<{
          attach: (selectorOrElement: string | HTMLElement) => Promise<void>;
          tokenize: () => Promise<{
            status: string;
            token?: string;
            errors?: Array<{ message: string; type?: string; field?: string }>;
          }>;
          destroy: () => Promise<boolean>;
        }>;
      };
    };
  }
}

interface SquareConfig {
  configured: boolean;
  applicationId: string;
  locationId: string;
  environment: 'sandbox' | 'production';
  liveBlocked: boolean;
  simulatorEnabled: boolean;
}

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

  const [configLoading, setConfigLoading] = useState(true);
  const [squareConfig, setSquareConfig] = useState<SquareConfig | null>(null);
  const [sdkLoading, setSdkLoading] = useState(false);
  const [cardReady, setCardReady] = useState(false);
  const [sdkError, setSdkError] = useState<string | null>(null);

  const cardInstanceRef = useRef<any>(null);

  const [paymentSuccessData, setPaymentSuccessData] = useState<{
    receiptNumber: string;
    paidThroughDate: string;
    providerReference: string;
    amount: number;
    isInitialSignUp: boolean;
  } | null>(null);

  // Initialize and load Square Web Payments SDK configuration
  useEffect(() => {
    let isMounted = true;

    async function initSquare() {
      if (!isOpen) return;

      setConfigLoading(true);
      setSdkError(null);
      setCardReady(false);

      try {
        const res = await fetch('/api/billing/square-config');
        if (!res.ok) throw new Error('Failed to retrieve payment configuration');
        const config: SquareConfig = await res.json();
        if (!isMounted) return;
        setSquareConfig(config);
        setConfigLoading(false);

        if (config.configured && config.applicationId && config.locationId) {
          setSdkLoading(true);

          // Dynamically load official Square.js from official host
          const scriptSrc = config.environment === 'production'
            ? 'https://web.squarecdn.com/v1/square.js'
            : 'https://sandbox.web.squarecdn.com/v1/square.js';

          await new Promise<void>((resolve, reject) => {
            const existingScript = document.getElementById('square-web-payments-sdk') as HTMLScriptElement | null;
            if (existingScript) {
              if (existingScript.src === scriptSrc && window.Square) {
                return resolve();
              }
              existingScript.remove();
            }

            const script = document.createElement('script');
            script.id = 'square-web-payments-sdk';
            script.src = scriptSrc;
            script.async = true;
            script.onload = () => {
              if (window.Square) resolve();
              else reject(new Error('Square SDK loaded but window.Square is unavailable'));
            };
            script.onerror = () => reject(new Error(`Failed to load Square Web Payments SDK from ${scriptSrc}`));
            document.head.appendChild(script);
          });

          if (!isMounted) return;

          // Destroy any previous card instance
          if (cardInstanceRef.current) {
            try {
              await cardInstanceRef.current.destroy();
            } catch (_) {}
            cardInstanceRef.current = null;
          }

          // Small delay for DOM node rendering
          setTimeout(async () => {
            if (!isMounted) return;
            try {
              const payments = window.Square!.payments(config.applicationId, config.locationId);
              const card = await payments.card();
              const container = document.getElementById('square-card-container');
              if (container && isMounted) {
                await card.attach('#square-card-container');
                cardInstanceRef.current = card;
                setCardReady(true);
              }
            } catch (cardErr: any) {
              console.error('Square card initialization error:', cardErr);
              if (isMounted) {
                setSdkError(cardErr.message || 'Unable to attach Square card component');
              }
            } finally {
              if (isMounted) setSdkLoading(false);
            }
          }, 100);
        } else {
          setSdkLoading(false);
        }
      } catch (err: any) {
        if (isMounted) {
          console.error('Square config initialization error:', err);
          setSdkError(err.message || 'Payment system initialization failed');
          setConfigLoading(false);
          setSdkLoading(false);
        }
      }
    }

    if (isOpen) {
      initSquare();
    }

    return () => {
      isMounted = false;
      if (cardInstanceRef.current) {
        cardInstanceRef.current.destroy().catch(() => {});
        cardInstanceRef.current = null;
      }
      setCardReady(false);
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const handlePaymentSubmit = async () => {
    if (!affirmativeAgreed) {
      setErrorMsg(`Please confirm affirmative agreement for this single 2-month $${feeAmount.toFixed(2)} payment.`);
      return;
    }

    if (isProcessing) return;

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
        const errData = await sessionRes.json().catch(() => ({}));
        throw new Error(errData.error || 'Could not initiate billing checkout session');
      }

      const session = await sessionRes.json();

      let payData: any;

      if (squareConfig?.configured && cardInstanceRef.current) {
        // Step 2: Tokenize card using Square Web Payments SDK (No raw card data stored or sent)
        const tokenResult = await cardInstanceRef.current.tokenize();
        if (tokenResult.status !== 'OK' || !tokenResult.token) {
          const detail = tokenResult.errors?.[0]?.message || 'Card verification failed. Please check the entered card numbers.';
          throw new Error(detail);
        }

        // Step 3: Process payment on server using official Square Payments API CreatePayment
        const idempotencyKey = `sq_cli_${business.id}_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
        const processRes = await fetch('/api/billing/process-square-payment', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            businessId: business.id,
            sessionId: session.sessionId,
            sourceId: tokenResult.token,
            idempotencyKey,
          }),
        });

        if (!processRes.ok) {
          const errData = await processRes.json().catch(() => ({}));
          throw new Error(errData.error || 'Square payment processing failed on server');
        }

        payData = await processRes.json();
      } else if (squareConfig?.simulatorEnabled) {
        // Dev-only fallback simulation when explicitly enabled
        const verifyRes = await fetch('/api/billing/verify-payment', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            businessId: business.id,
            sessionId: session.sessionId,
            providerReference: `sq_sim_${Date.now()}`,
          }),
        });

        if (!verifyRes.ok) {
          const errData = await verifyRes.json().catch(() => ({}));
          throw new Error(errData.error || 'Simulated payment verification failed on server');
        }

        payData = await verifyRes.json();
      } else {
        throw new Error('Square payment gateway is pending server configuration. Live checkout is locked.');
      }

      setPaymentSuccessData({
        receiptNumber: payData.business?.billing?.receiptNumber || 'REC-2026-0099',
        paidThroughDate: payData.business?.billing?.paidThroughDate || '',
        providerReference: payData.business?.billing?.providerReference || 'sq_payment_ref',
        amount: payData.amount || feeAmount,
        isInitialSignUp: payData.isInitialSignUp ?? isInitialSignUp,
      });

      onPaymentSuccess(payData.business);
    } catch (err: any) {
      setErrorMsg(err.message || 'Payment processing error');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-neutral-900/60 backdrop-blur-xs">
      <div className="relative w-full max-w-lg bg-white rounded-xl shadow-xl border border-neutral-200 p-6 max-h-[90vh] overflow-y-auto">
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
            type="button"
            onClick={onClose}
            className="p-1.5 text-neutral-400 hover:text-neutral-700 rounded-md transition-colors"
            aria-label="Close payment modal"
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
              type="button"
              onClick={onClose}
              className="w-full py-2.5 px-4 text-xs font-semibold text-white bg-neutral-900 hover:bg-neutral-800 rounded-lg transition-colors cursor-pointer"
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

            {/* Square Payment Method Input Section */}
            <div className="space-y-2">
              <label className="text-xs font-semibold text-neutral-800 flex items-center justify-between">
                <span>Payment Details (Square Web Payments)</span>
                {squareConfig && (
                  <span className="font-mono text-[10px] text-neutral-400">
                    Mode: {squareConfig.environment.toUpperCase()}
                  </span>
                )}
              </label>

              {configLoading || sdkLoading ? (
                <div className="p-4 border border-neutral-200 rounded-lg bg-neutral-50 flex items-center justify-center gap-2 text-xs text-neutral-600">
                  <Loader2 className="w-4 h-4 animate-spin text-neutral-700" />
                  <span>Initializing Square payment fields...</span>
                </div>
              ) : squareConfig?.configured ? (
                <div className="space-y-1.5">
                  <div
                    id="square-card-container"
                    className="min-h-[96px] border border-neutral-200 rounded-lg p-2.5 bg-white transition-all focus-within:border-neutral-900"
                  />
                  <p className="text-[11px] text-neutral-500">
                    Card details are securely tokenized by Square Web Payments SDK. Never stored on our servers.
                  </p>
                </div>
              ) : squareConfig?.simulatorEnabled ? (
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800 space-y-1">
                  <div className="font-semibold flex items-center gap-1.5">
                    <ShieldCheck className="w-3.5 h-3.5" />
                    <span>Developer Simulator Active (Dev Mode Flag)</span>
                  </div>
                  <p className="text-[11px] text-amber-700">
                    Square API credentials are not yet configured. The payment simulator is currently permitted in this development preview.
                  </p>
                </div>
              ) : (
                <div className="p-3 bg-neutral-50 border border-neutral-200 rounded-lg text-xs text-neutral-600 space-y-1">
                  <div className="font-semibold text-neutral-800 flex items-center gap-1.5">
                    <Lock className="w-3.5 h-3.5 text-neutral-500" />
                    <span>Square Sandbox Gateway Unconfigured</span>
                  </div>
                  <p className="text-[11px] text-neutral-600">
                    To process Sandbox payments, configure <code className="font-mono text-[10px] bg-neutral-200/60 px-1 py-0.5 rounded">SQUARE_APPLICATION_ID</code>, <code className="font-mono text-[10px] bg-neutral-200/60 px-1 py-0.5 rounded">SQUARE_LOCATION_ID</code>, and <code className="font-mono text-[10px] bg-neutral-200/60 px-1 py-0.5 rounded">SQUARE_ACCESS_TOKEN</code> in your environment secrets.
                  </p>
                </div>
              )}

              {sdkError && (
                <div className="p-2.5 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800">
                  {sdkError}
                </div>
              )}
            </div>

            {/* Platform Integration Boundary Notice */}
            <div className="p-3 bg-neutral-50 border border-neutral-200 rounded-lg text-[11px] text-neutral-600">
              <span className="font-semibold text-neutral-800">Integration Boundary: </span>
              Payment processing is powered by Square Web Payments SDK in Sandbox mode. Real cards are never charged in Sandbox.
            </div>

            {/* Affirmative Confirmation Checkbox */}
            <div className="pt-2 border-t border-neutral-100">
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={affirmativeAgreed}
                  onChange={(e) => setAffirmativeAgreed(e.target.checked)}
                  className="mt-0.5 w-4 h-4 text-neutral-900 rounded border-neutral-300 focus:ring-neutral-900 cursor-pointer"
                />
                <span className="text-xs text-neutral-700 leading-snug">
                  I understand this is a single manual payment of <strong>${feeAmount.toFixed(2)}</strong> for a 2-month period.
                  Short Stack will never automatically charge my card or auto-renew my listing.
                </span>
              </label>
            </div>

            {errorMsg && (
              <div role="alert" className="p-3 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2 text-xs text-red-700">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{errorMsg}</span>
              </div>
            )}

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="py-2 px-3 text-xs font-medium text-neutral-600 hover:text-neutral-900 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handlePaymentSubmit}
                disabled={
                  isProcessing ||
                  !affirmativeAgreed ||
                  (!squareConfig?.configured && !squareConfig?.simulatorEnabled) ||
                  (Boolean(squareConfig?.configured) && (!cardReady || sdkLoading))
                }
                className="inline-flex items-center gap-2 py-2 px-4 text-xs font-semibold text-white bg-neutral-900 hover:bg-neutral-800 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition-colors cursor-pointer"
                aria-busy={isProcessing}
              >
                {isProcessing ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Processing with Square...</span>
                  </>
                ) : (
                  <>
                    <CreditCard className="w-3.5 h-3.5" />
                    <span>Confirm & Pay ${feeAmount.toFixed(2)}</span>
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

