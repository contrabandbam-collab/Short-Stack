import React, { useEffect } from 'react';
import { Phone, Mail, X } from 'lucide-react';

interface ContactModalProps {
  businessName: string;
  phone?: string | null;
  email?: string | null;
  isOpen: boolean;
  onClose: () => void;
}

/**
 * Sanitizes and validates a phone number for safe tel: URI scheme
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

/**
 * Sanitizes email for mailto: link
 */
function getSafeEmail(rawEmail?: string | null): string | null {
  if (!rawEmail) return null;
  const trimmed = rawEmail.trim();
  if (!trimmed || !trimmed.includes('@') || trimmed.includes(' ')) return null;
  return trimmed;
}

export const ContactModal: React.FC<ContactModalProps> = ({
  businessName,
  phone,
  email,
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
  const emailData = getSafeEmail(email);
  const hasAnyContactMethod = Boolean(phoneData || emailData);

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
            Connect directly with this local business via phone call or email.
          </p>
        </div>

        {/* The Contact Options: Exactly CALL and EMAIL */}
        <div className="py-6 space-y-3">
          {phoneData && (
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
          )}

          {emailData && (
            <a
              href={`mailto:${emailData}`}
              className="w-full group flex items-center justify-between p-4 bg-neutral-50 hover:bg-neutral-900 text-neutral-900 hover:text-white border border-neutral-200 hover:border-neutral-900 rounded-xl transition-all duration-150 shadow-xs focus:outline-none focus:ring-2 focus:ring-neutral-900 focus:ring-offset-2"
            >
              <div className="flex items-center gap-3.5">
                <div className="w-10 h-10 rounded-lg bg-white group-hover:bg-neutral-800 flex items-center justify-center text-neutral-900 group-hover:text-white border border-neutral-200 group-hover:border-neutral-700 transition-colors">
                  <Mail className="w-5 h-5" />
                </div>
                <div className="text-left">
                  <span className="block text-sm font-bold font-display tracking-wide uppercase">
                    Email
                  </span>
                  <span className="block text-xs text-neutral-500 group-hover:text-neutral-300 font-mono mt-0.5 truncate max-w-[200px]">
                    {emailData}
                  </span>
                </div>
              </div>
              <span className="text-xs font-semibold px-2.5 py-1 bg-white group-hover:bg-neutral-800 text-neutral-700 group-hover:text-neutral-200 rounded-md border border-neutral-200 group-hover:border-neutral-700 transition-colors">
                Send Email
              </span>
            </a>
          )}

          {!hasAnyContactMethod && (
            <div
              className="w-full p-4 bg-neutral-50 text-neutral-500 border border-neutral-200 rounded-xl text-center text-xs"
              role="status"
            >
              No direct phone or email contact methods published for this listing.
            </div>
          )}
        </div>

        {/* Footer: Close */}
        <div className="pt-4 border-t border-neutral-100 flex items-center justify-between text-xs text-neutral-500">
          <span>Direct to business. No middleman fees.</span>
          <button
            type="button"
            onClick={onClose}
            className="py-2 px-4 text-xs font-semibold text-neutral-700 hover:text-neutral-900 bg-neutral-100 hover:bg-neutral-200 rounded-lg transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
