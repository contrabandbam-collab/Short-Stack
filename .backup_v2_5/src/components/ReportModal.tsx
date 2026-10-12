import React, { useState } from 'react';
import { X, AlertTriangle, CheckCircle2 } from 'lucide-react';

interface ReportModalProps {
  businessId: string;
  businessName: string;
  isOpen: boolean;
  onClose: () => void;
}

export const ReportModal: React.FC<ReportModalProps> = ({
  businessId,
  businessName,
  isOpen,
  onClose,
}) => {
  const [reason, setReason] = useState('Incorrect business information');
  const [details, setDetails] = useState('');
  const [email, setEmail] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      const res = await fetch('/api/reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          businessId,
          reason,
          details,
          reporterEmail: email,
        }),
      });
      if (res.ok) {
        setSubmitted(true);
      }
    } catch (err) {
      console.error('Error submitting report', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-neutral-900/60 backdrop-blur-xs">
      <div className="relative w-full max-w-md bg-white rounded-xl shadow-xl border border-neutral-200 p-6">
        <div className="flex items-center justify-between pb-4 border-b border-neutral-100">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-amber-600" />
            <h3 className="text-base font-semibold text-neutral-900 font-display">Report Listing</h3>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-neutral-400 hover:text-neutral-700 rounded-md transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {submitted ? (
          <div className="py-8 text-center">
            <CheckCircle2 className="w-10 h-10 text-emerald-600 mx-auto mb-3" />
            <h4 className="text-sm font-semibold text-neutral-900">Report Submitted</h4>
            <p className="text-xs text-neutral-500 mt-1 max-w-xs mx-auto">
              Thank you for keeping Short Stack accurate and trusted. Our moderation team reviews all flagged listings.
            </p>
            <button
              onClick={onClose}
              className="mt-6 py-2 px-4 text-xs font-semibold text-neutral-800 bg-neutral-100 hover:bg-neutral-200 rounded-lg transition-colors"
            >
              Close
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="py-4 space-y-4">
            <p className="text-xs text-neutral-500">
              Reporting: <strong className="text-neutral-800">{businessName}</strong> ({businessId})
            </p>

            <div>
              <label className="block text-xs font-medium text-neutral-700 mb-1">Reason</label>
              <select
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className="w-full text-xs p-2.5 bg-neutral-50 border border-neutral-200 rounded-lg text-neutral-800 focus:outline-none focus:ring-1 focus:ring-neutral-900"
              >
                <option value="Incorrect business information">Incorrect business information or hours</option>
                <option value="Closed or ceased operations">Business is closed or moved</option>
                <option value="Misleading promotional flyer or offer">Misleading promotional flyer or offer</option>
                <option value="Inappropriate or copyrighted media">Inappropriate or copyrighted media</option>
                <option value="Other concern">Other policy concern</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-neutral-700 mb-1">Details (Optional)</label>
              <textarea
                value={details}
                onChange={(e) => setDetails(e.target.value)}
                rows={3}
                placeholder="Describe the issue with this listing..."
                className="w-full text-xs p-2.5 bg-white border border-neutral-200 rounded-lg text-neutral-800 focus:outline-none focus:ring-1 focus:ring-neutral-900"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-neutral-700 mb-1">Your Email (for updates)</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full text-xs p-2.5 bg-white border border-neutral-200 rounded-lg text-neutral-800 focus:outline-none focus:ring-1 focus:ring-neutral-900"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="py-2 px-3 text-xs font-medium text-neutral-600 hover:text-neutral-800"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="py-2 px-4 text-xs font-semibold text-white bg-neutral-900 hover:bg-neutral-800 rounded-lg disabled:opacity-50 transition-colors"
              >
                {isSubmitting ? 'Submitting...' : 'Submit Report'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
