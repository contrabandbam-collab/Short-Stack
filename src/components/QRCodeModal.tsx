import React, { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { X, Copy, Check, Download, ExternalLink } from 'lucide-react';

interface QRCodeModalProps {
  url: string;
  title: string;
  businessId: string;
  isOpen: boolean;
  onClose: () => void;
}

export const QRCodeModal: React.FC<QRCodeModalProps> = ({
  url,
  title,
  businessId,
  isOpen,
  onClose,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (isOpen && canvasRef.current && url) {
      QRCode.toCanvas(canvasRef.current, url, {
        width: 256,
        margin: 2,
        color: {
          dark: '#171717',
          light: '#ffffff',
        },
      }).catch((err) => console.error('QR code generation error', err));
    }
  }, [isOpen, url]);

  if (!isOpen) return null;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback
    }
  };

  const handleDownload = () => {
    if (!canvasRef.current) return;
    const link = document.createElement('a');
    link.download = `shortstack-${businessId}-qr.png`;
    link.href = canvasRef.current.toDataURL('image/png');
    link.click();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-neutral-900/60 backdrop-blur-xs">
      <div className="relative w-full max-w-md bg-white rounded-xl shadow-xl border border-neutral-200 p-6">
        <div className="flex items-center justify-between pb-4 border-b border-neutral-100">
          <div>
            <h3 className="text-base font-semibold text-neutral-900 font-display">Permanent Profile QR Code</h3>
            <p className="text-xs text-neutral-500 mt-0.5">Permanent ID: {businessId}</p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-neutral-400 hover:text-neutral-700 rounded-md transition-colors"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex flex-col items-center py-6 text-center">
          <div className="p-3 bg-white border border-neutral-200 rounded-lg shadow-xs mb-4">
            <canvas ref={canvasRef} className="w-52 h-52 block" />
          </div>
          <h4 className="text-sm font-semibold text-neutral-900">{title}</h4>
          <p className="text-xs text-neutral-500 mt-1 max-w-xs">
            This QR code connects directly to your permanent Short Stack directory profile. It remains stable across renewals and updates.
          </p>
        </div>

        <div className="space-y-3 pt-2 border-t border-neutral-100">
          <div className="flex items-center gap-2 p-2.5 bg-neutral-50 border border-neutral-200 rounded-lg text-xs font-mono text-neutral-700 break-all">
            <span className="flex-1 truncate">{url}</span>
            <button
              onClick={handleCopy}
              className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-sans font-medium text-neutral-800 bg-white border border-neutral-200 rounded hover:bg-neutral-100 transition-colors shrink-0"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
              {copied ? 'Copied' : 'Copy'}
            </button>
          </div>

          <div className="flex gap-2">
            <button
              onClick={handleDownload}
              className="flex-1 inline-flex items-center justify-center gap-2 py-2 px-3 text-xs font-semibold text-white bg-neutral-900 rounded-lg hover:bg-neutral-800 transition-colors"
            >
              <Download className="w-4 h-4" />
              Download PNG
            </button>
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-1.5 py-2 px-3 text-xs font-medium text-neutral-700 bg-white border border-neutral-200 rounded-lg hover:bg-neutral-50 transition-colors"
            >
              <ExternalLink className="w-4 h-4" />
              Open Link
            </a>
          </div>
        </div>
      </div>
    </div>
  );
};
