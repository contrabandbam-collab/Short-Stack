import React, { useEffect } from 'react';
import { Phone, MessageSquare, X } from 'lucide-react';

interface ContactModalProps {
  businessName: string;
  phone?: string | null;
  smsCapable?: boolean;
  isOpen: boolean;
  onClose: () => void;
}

/**
 * Sanitizes and validates a phone number for safe tel: and sms: URI schemes
 */
function getSafePhone(rawPhone?: string | null): { display: string; dialable: string } | null {
  if (!rawPhone) return null;
  const trimmed = rawPhone.trim();
  if (!trimmed) return null;

  // Extract digits and optional leading plus
  const dialable = trimmed.replace(/[^0-9+]/g, '');
  const digitsOnly = dialable.replace(/\D/g, '');
  if (digitsOnly.length < 7 || dialable.length > 20) {
    return null;
  }

  return {
    display: trimmed,
    dialable,
  };
}

export const ContactModal: React.FC<ContactModalProps> = ({
  businessName,
  phone,
  smsCapable = true,
  isOpen,
  onClose,
}) => {
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const phoneData = getSafePhone(phone);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-in fade-in duration-150"
      role="dialog"
      aria-modal="true"
      aria-labelledby="contact-modal-title"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-md bg-white rounded-2xl shadow-2xl border border-neutral-200 p-6 sm:p-7 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close Button */}
        <button
          onClick={onClose}
          aria-label="Close dialog"
          className="absolute top-4 right-4 p-2 text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100 rounded-full transition-colors"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Modal Header */}
        <div className="text-center pb-5 border-b border-neutral-100">
          <p className="text-[11px] font-mono uppercase tracking-wider text-emerald-600 mb-1 font-semibold">
            Direct Contact
          </p>
          <h2
            id="contact-modal-title"
            className="text-xl sm:text-2xl font-bold font-display text-neutral-900 tracking-tight truncate px-4"
          >
            Contact {businessName}
          </h2>
          <p className="text-xs text-neutral-500 mt-1.5">
            Connect directly via your device's phone dialer or SMS messaging.
          </p>
        </div>

        {/* The Two Contact Options: CALL and TEXT Only using the same public business number */}
        <div className="py-6 space-y-3">
          {/* CALL Option */}
          {phoneData ? (
            <a
              href={`tel:${phoneData.dialable}`}
              className="w-full group flex items-center justify-between p-4 bg-neutral-50 hover:bg-neutral-900 text-neutral-900 hover:text-white border border-neutral-200 hover:border-neutral-900 rounded-xl transition-all duration-150 shadow-xs focus:outline-none focus:ring-2 focus:ring-neutral-900 focus:ring-offset-2"
            >
              <div className="flex items-center gap-3.5">
                <div className="w-10 h-10 rounded-lg bg-white group-hover:bg-neutral-800 flex items-center justify-center text-neutral-900 group-hover:text-white border border-neutral-200 group-hover:border-neutral-700 transition-colors">
                  <Phone className="w-5 h-5" />
                </div>
                <div className="text-left">
                  <span className="block text-sm font-bold font-display tracking-wide uppercase">
                    Call
                  </span>
                  <span className="block text-xs text-neutral-500 group-hover:text-neutral-300 font-mono mt-0.5">
                    {phoneData.display}
                  </span>
                </div>
              </div>
              <span className="text-xs font-semibold px-2.5 py-1 bg-white group-hover:bg-neutral-800 text-neutral-700 group-hover:text-neutral-200 rounded-md border border-neutral-200 group-hover:border-neutral-700 transition-colors">
                Open Dialer
              </span>
            </a>
          ) : (
            <div
              className="w-full flex items-center justify-between p-4 bg-neutral-100 text-neutral-400 border border-neutral-200 rounded-xl cursor-not-allowed select-none opacity-75"
              aria-disabled="true"
            >
              <div className="flex items-center gap-3.5">
                <div className="w-10 h-10 rounded-lg bg-neutral-200/70 flex items-center justify-center text-neutral-400">
                  <Phone className="w-5 h-5" />
                </div>
                <div className="text-left">
                  <span className="block text-sm font-bold font-display tracking-wide uppercase">
                    Call
                  </span>
                  <span className="block text-xs text-neutral-400 mt-0.5">
                    No phone number provided
                  </span>
                </div>
              </div>
              <span className="text-[11px] font-medium text-neutral-400 bg-neutral-200/60 px-2 py-0.5 rounded">
                Unavailable
              </span>
            </div>
          )}

          {/* TEXT (SMS) Option */}
          {phoneData && smsCapable ? (
            <a
              href={`sms:${phoneData.dialable}`}
              className="w-full group flex items-center justify-between p-4 bg-neutral-50 hover:bg-neutral-900 text-neutral-900 hover:text-white border border-neutral-200 hover:border-neutral-900 rounded-xl transition-all duration-150 shadow-xs focus:outline-none focus:ring-2 focus:ring-neutral-900 focus:ring-offset-2"
            >
              <div className="flex items-center gap-3.5">
                <div className="w-10 h-10 rounded-lg bg-white group-hover:bg-neutral-800 flex items-center justify-center text-neutral-900 group-hover:text-white border border-neutral-200 group-hover:border-neutral-700 transition-colors">
                  <MessageSquare className="w-5 h-5" />
                </div>
                <div className="text-left">
                  <span className="block text-sm font-bold font-display tracking-wide uppercase">
                    Text (SMS)
                  </span>
                  <span className="block text-xs text-neutral-500 group-hover:text-neutral-300 font-mono mt-0.5">
                    {phoneData.display}
                  </span>
                </div>
              </div>
              <span className="text-xs font-semibold px-2.5 py-1 bg-white group-hover:bg-neutral-800 text-neutral-700 group-hover:text-neutral-200 rounded-md border border-neutral-200 group-hover:border-neutral-700 transition-colors">
                Send Text
              </span>
            </a>
          ) : phoneData && !smsCapable ? (
            <div
              className="w-full flex items-center justify-between p-4 bg-neutral-100 text-neutral-400 border border-neutral-200 rounded-xl cursor-not-allowed select-none opacity-75"
              aria-disabled="true"
            >
              <div className="flex items-center gap-3.5">
                <div className="w-10 h-10 rounded-lg bg-neutral-200/70 flex items-center justify-center text-neutral-400">
                  <MessageSquare className="w-5 h-5" />
                </div>
                <div className="text-left">
                  <span className="block text-sm font-bold font-display tracking-wide uppercase">
                    Text
                  </span>
                  <span className="block text-xs text-neutral-400 mt-0.5">
                    Landline / Voice calls only
                  </span>
                </div>
              </div>
              <span className="text-[11px] font-medium text-neutral-400 bg-neutral-200/60 px-2 py-0.5 rounded">
                Voice only
              </span>
            </div>
          ) : null}
        </div>

        {/* Footer: Close */}
        <div className="pt-4 border-t border-neutral-100 flex items-center justify-between text-xs text-neutral-500">
          <span>Direct to business. No middleman fees.</span>
          <button
            type="button"
            onClick={onClose}
            className="py-2 px-4 text-xs font-semibold text-neutral-700 hover:text-neutral-900 bg-neutral-100 hover:bg-neutral-200 rounded-lg transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
};
