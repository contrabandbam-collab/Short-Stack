import React, { useEffect } from 'react';
import { X, ShieldCheck, Scale, AlertCircle, FileText, CheckCircle2 } from 'lucide-react';

interface TermsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const TermsModal: React.FC<TermsModalProps> = ({ isOpen, onClose }) => {
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150"
      role="dialog"
      aria-modal="true"
      aria-labelledby="terms-modal-title"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-3xl max-h-[85vh] bg-white rounded-2xl shadow-2xl border border-neutral-200 overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-6 border-b border-neutral-200 flex items-center justify-between bg-neutral-50/80">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-lg bg-neutral-900 text-white flex items-center justify-center">
              <Scale className="w-5 h-5 text-emerald-400" />
            </div>
            <div>
              <h2 id="terms-modal-title" className="text-lg font-bold font-display text-neutral-900">
                Short Stack Terms & Policies
              </h2>
              <p className="text-xs text-neutral-500">
                Updated October 2026 · Small Businesses. Big Deal.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close dialog"
            className="p-2 text-neutral-400 hover:text-neutral-700 hover:bg-neutral-200 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="p-6 overflow-y-auto space-y-6 text-xs text-neutral-700 leading-relaxed">
          {/* Section 1: Consumer Terms & Responsibilities */}
          <div className="space-y-2">
            <h3 className="text-sm font-bold text-neutral-900 font-display flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-emerald-600" />
              1. Consumer Discovery & Directory Terms
            </h3>
            <p>
              Short Stack is an independent, non-transactional discovery directory. We connect consumers directly with local businesses without middleman booking fees, markups, or payment escrow.
            </p>
            <div className="p-3 bg-neutral-50 rounded-xl border border-neutral-200 space-y-1.5">
              <p className="font-semibold text-neutral-900">Independent Business Responsibility:</p>
              <p>
                Each business listed on Short Stack operates as an independent commercial entity and is solely responsible for its own listings, advertisements, descriptions, pricing, products, services, availability, claims, transactions, warranties, refunds, customer disputes, and professional conduct.
              </p>
              <p className="pt-1 text-neutral-600">
                A Short Stack listing, badge, verification, or daily highlight <strong>does not constitute an endorsement, guarantee, or warranty</strong> by Short Stack. Consumers are advised and encouraged to verify important details, licenses, insurance, and service scope directly with each business prior to engaging services or completing transactions.
              </p>
            </div>
          </div>

          {/* Section 2: Business Owner Representation & Conduct */}
          <div className="space-y-2">
            <h3 className="text-sm font-bold text-neutral-900 font-display flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              2. Business Owner Truthfulness & Content Standards
            </h3>
            <p>
              Business owners represent and warrant that all information, photographs, storefront details, operating hours, prices, menu items, and promotional offers submitted to Short Stack are:
            </p>
            <ul className="list-disc pl-5 space-y-1 text-neutral-600">
              <li>Truthful, accurate, current, lawful, and non-misleading.</li>
              <li>Free from stolen intellectual property, unauthorized media, fraudulent claims, or deceptive pricing.</li>
              <li>Fully compliant with applicable local, state, and federal laws and commercial regulations.</li>
              <li>Directly representative of the owner's active business operations in their specified city and state.</li>
            </ul>
          </div>

          {/* Section 3: Platform Moderation & Oversight */}
          <div className="space-y-2">
            <h3 className="text-sm font-bold text-neutral-900 font-display flex items-center gap-1.5">
              <AlertCircle className="w-4 h-4 text-amber-600" />
              3. Platform Oversight & Moderation Authority
            </h3>
            <p>
              To maintain the integrity and trustworthiness of the directory, Short Stack reserves the unconditional right to review, investigate, restrict, suspend, hide, reject, or permanently remove any business listing, review, promotion, or account that involves:
            </p>
            <ul className="list-disc pl-5 space-y-1 text-neutral-600">
              <li>Fraud, deceptive advertising, or impersonation.</li>
              <li>Unlawful commercial activity, safety hazards, or unlicensed trade operations.</li>
              <li>Manipulated or fake customer reviews and ratings.</li>
              <li>Repeated unaddressed consumer grievances or policy breaches.</li>
            </ul>
          </div>

          {/* Section 4: Transparent Pricing & Manual Renewals */}
          <div className="space-y-2">
            <h3 className="text-sm font-bold text-neutral-900 font-display flex items-center gap-1.5">
              <FileText className="w-4 h-4 text-neutral-900" />
              4. Transparent Listing Fees & No Auto-Enrollment
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
              <div className="p-3 bg-neutral-50 rounded-xl border border-neutral-200">
                <span className="block font-bold text-neutral-900 text-sm">$19.99 Initial Enrollment</span>
                <span className="text-[11px] text-neutral-600">
                  Activates your verified listing with permanent public URL, QR code, promotional flyer studio, and initial 2-month advertising term.
                </span>
              </div>
              <div className="p-3 bg-neutral-50 rounded-xl border border-neutral-200">
                <span className="block font-bold text-neutral-900 text-sm">$25 Bimonthly Renewal (Manual Only)</span>
                <span className="text-[11px] text-neutral-600">
                  Renewals are strictly voluntary and manual every 2 months. Short Stack <strong>never enables automatic renewal</strong> or auto-charges.
                </span>
              </div>
            </div>
            <p className="pt-1">
              <strong>Referral Program:</strong> When a referred business completes its $19.99 initial enrollment, the referring owner receives 50% off their next renewal only ($12.50). Subsequent renewals return to standard $25. Referral discounts do not stack or apply more than once to the same qualifying referral.
            </p>
          </div>

          {/* Section 5: Direct Contact Scheme */}
          <div className="space-y-2">
            <h3 className="text-sm font-bold text-neutral-900 font-display">
              5. Direct Communication
            </h3>
            <p>
              Short Stack provides direct Call (`tel:`) and Text (`sms:`) links using each business's confirmed public contact number. Short Stack never displays or exposes an owner's private administrative account credentials or personal email address.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 bg-neutral-50 border-t border-neutral-200 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="py-2 px-5 text-xs font-semibold text-white bg-neutral-900 hover:bg-neutral-800 rounded-lg transition-colors"
          >
            Close Terms & Policies
          </button>
        </div>
      </div>
    </div>
  );
};
