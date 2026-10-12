import React, { useState, useRef } from 'react';
import { Business, Flyer } from '../types/pipsqueak.ts';
import { Download, Check, Upload, Camera } from 'lucide-react';

interface FlyerBuilderProps {
  business: Business;
  onSaveFlyer: (flyerData: Partial<Flyer> & { publish: boolean }) => Promise<void>;
  onClose?: () => void;
}

export const FlyerBuilder: React.FC<FlyerBuilderProps> = ({
  business,
  onSaveFlyer,
  onClose,
}) => {
  const existing = business.flyer;
  const [headline, setHeadline] = useState(existing?.headline || 'Special Community Offer');
  const [offerDetails, setOfferDetails] = useState(
    existing?.offerDetails || 'Mention this Short Stack profile card on your visit. Valid this month only.'
  );
  const [photoUrl, setPhotoUrl] = useState(existing?.photoUrl || business.photos[0] || '');
  const [accentColor, setAccentColor] = useState(existing?.accentColor || '#16a34a');
  const [template, setTemplate] = useState<'modern' | 'bold' | 'minimal' | 'craft'>(
    existing?.template || 'modern'
  );
  const [isPublishing, setIsPublishing] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const flyerContainerRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setPhotoUrl(reader.result);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleSave = async (publish: boolean) => {
    setIsPublishing(true);
    try {
      await onSaveFlyer({
        headline,
        offerDetails,
        photoUrl,
        accentColor,
        template,
        publish,
      });
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2500);
    } finally {
      setIsPublishing(false);
    }
  };

  const handleDownload = () => {
    window.print();
  };

  return (
    <div className="bg-white rounded-xl border border-neutral-200 overflow-hidden">
      <div className="p-6 border-b border-neutral-100 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-neutral-900 font-display">Promotional Flyer & Card Studio</h2>
          <p className="text-xs text-neutral-500 mt-0.5">
            Design an elegant promotional card for your public profile, counter displays, or local handouts.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {saveSuccess && (
            <span className="text-xs text-emerald-600 flex items-center gap-1 font-medium">
              <Check className="w-3.5 h-3.5" /> Saved
            </span>
          )}
          <button
            type="button"
            onClick={handleDownload}
            className="inline-flex items-center gap-1.5 py-2 px-3 text-xs font-medium text-neutral-700 bg-neutral-100 hover:bg-neutral-200 rounded-lg transition-colors"
          >
            <Download className="w-3.5 h-3.5" />
            Print / Save PDF
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 p-6">
        {/* Left: Controls */}
        <div className="lg:col-span-5 space-y-5">
          <div>
            <label className="block text-xs font-semibold text-neutral-800 mb-1.5">Template Style</label>
            <div className="grid grid-cols-2 gap-2">
              {(['modern', 'bold', 'minimal', 'craft'] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTemplate(t)}
                  className={`py-2 px-3 text-xs rounded-lg border text-left capitalize transition-colors ${
                    template === t
                      ? 'border-neutral-900 bg-neutral-900 text-white font-medium'
                      : 'border-neutral-200 text-neutral-700 hover:bg-neutral-50'
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-neutral-800 mb-1.5">Headline / Marquee Offer</label>
            <input
              type="text"
              value={headline}
              onChange={(e) => setHeadline(e.target.value)}
              placeholder="e.g. 15% Off Your First Visit"
              className="w-full text-xs p-2.5 bg-white border border-neutral-200 rounded-lg text-neutral-900 focus:outline-none focus:ring-1 focus:ring-neutral-900"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-neutral-800 mb-1.5">Offer Details & Terms</label>
            <textarea
              value={offerDetails}
              onChange={(e) => setOfferDetails(e.target.value)}
              rows={3}
              placeholder="Explain the offer, redemption instructions, or dates..."
              className="w-full text-xs p-2.5 bg-white border border-neutral-200 rounded-lg text-neutral-900 focus:outline-none focus:ring-1 focus:ring-neutral-900"
            />
          </div>

          {/* Photo Upload from Device (Product, Storefront, Promotion) */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="block text-xs font-semibold text-neutral-800">
                Featured Promotion Photo
              </label>
              <span className="text-[11px] text-neutral-500">From device or showroom</span>
            </div>

            <input
              type="file"
              ref={fileInputRef}
              accept="image/*"
              onChange={handleFileUpload}
              className="hidden"
            />

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="py-2 px-3 text-xs font-medium text-neutral-800 bg-neutral-100 hover:bg-neutral-200 border border-neutral-300 rounded-lg transition-colors flex items-center gap-1.5 shrink-0"
              >
                <Upload className="w-3.5 h-3.5" />
                <span>Upload from Device</span>
              </button>

              {photoUrl ? (
                <button
                  type="button"
                  onClick={() => setPhotoUrl('')}
                  className="py-1.5 px-2 text-xs text-neutral-500 hover:text-red-600 transition-colors"
                >
                  Clear Photo
                </button>
              ) : null}
            </div>

            {business.photos && business.photos.length > 0 && (
              <div className="pt-2">
                <span className="text-[11px] text-neutral-500 block mb-1">Or choose an existing showroom photo:</span>
                <div className="flex items-center gap-2 overflow-x-auto pb-1">
                  {business.photos.map((ph, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => setPhotoUrl(ph)}
                      className={`relative w-14 h-11 rounded-md overflow-hidden shrink-0 border-2 transition-all ${
                        photoUrl === ph ? 'border-neutral-900 ring-1 ring-neutral-900' : 'border-transparent opacity-60 hover:opacity-100'
                      }`}
                    >
                      <img src={ph} alt={`photo-${idx}`} className="w-full h-full object-cover" />
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div>
            <label className="block text-xs font-semibold text-neutral-800 mb-1.5">Accent Color</label>
            <div className="flex items-center gap-3">
              {['#16a34a', '#2563eb', '#d97706', '#dc2626', '#171717'].map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setAccentColor(c)}
                  className={`w-7 h-7 rounded-full transition-transform ${
                    accentColor === c ? 'scale-115 ring-2 ring-offset-2 ring-neutral-400' : 'hover:scale-105'
                  }`}
                  style={{ backgroundColor: c }}
                  aria-label={`Color ${c}`}
                />
              ))}
            </div>
          </div>

          <div className="pt-4 border-t border-neutral-100 flex items-center gap-3">
            <button
              type="button"
              onClick={() => handleSave(false)}
              disabled={isPublishing}
              className="flex-1 py-2 px-3 text-xs font-medium text-neutral-700 bg-neutral-100 hover:bg-neutral-200 rounded-lg transition-colors"
            >
              Save as Draft
            </button>
            <button
              type="button"
              onClick={() => handleSave(true)}
              disabled={isPublishing}
              className="flex-1 py-2 px-3 text-xs font-semibold text-white bg-neutral-900 hover:bg-neutral-800 rounded-lg transition-colors"
            >
              Publish to Profile
            </button>
          </div>
        </div>

        {/* Right: Live Interactive Card Preview */}
        <div className="lg:col-span-7 flex flex-col items-center justify-center p-6 bg-neutral-50 rounded-xl border border-neutral-200">
          <div className="text-[11px] font-mono text-neutral-400 mb-3 uppercase tracking-wider">
            Live Preview · {template} template
          </div>

          <div
            ref={flyerContainerRef}
            className={`w-full max-w-sm bg-white rounded-xl shadow-md border border-neutral-200 overflow-hidden transition-all ${
              template === 'bold' ? 'ring-2' : ''
            }`}
            style={{ borderColor: template === 'bold' ? accentColor : undefined }}
          >
            {/* Flyer Header Banner */}
            <div
              className="py-3 px-4 text-white text-xs font-semibold flex items-center justify-between"
              style={{ backgroundColor: accentColor }}
            >
              <span className="font-display tracking-tight text-sm uppercase">Community Special</span>
              <span className="font-mono text-[10px] bg-black/20 px-2 py-0.5 rounded">ID: {business.id}</span>
            </div>

            {/* Flyer Photo */}
            {photoUrl ? (
              <div className="aspect-16/9 bg-neutral-100 overflow-hidden">
                <img src={photoUrl} alt="Flyer banner" className="w-full h-full object-cover" />
              </div>
            ) : null}

            {/* Flyer Body */}
            <div className="p-5 text-center space-y-3">
              <h3 className="text-xl font-bold font-display text-neutral-900 tracking-tight leading-snug">
                {headline}
              </h3>

              <p className="text-xs text-neutral-600 leading-relaxed max-w-xs mx-auto">
                {offerDetails}
              </p>

              <div className="pt-3 border-t border-neutral-100 flex items-center justify-center gap-4 text-left">
                {/* Photo-upload placeholder / promotional badge (Replacing previous QR code) */}
                <div
                  onClick={() => fileInputRef.current?.click()}
                  className="w-20 h-20 rounded-lg border-2 border-dashed border-neutral-300 bg-neutral-50 hover:bg-neutral-100 flex flex-col items-center justify-center p-1 cursor-pointer text-center group transition-colors shrink-0 overflow-hidden shadow-2xs"
                  title="Click to choose or change promotional photo from device"
                >
                  {photoUrl ? (
                    <img src={photoUrl} alt="Offer promotional preview" className="w-full h-full object-cover rounded" />
                  ) : (
                    <div className="flex flex-col items-center justify-center text-neutral-400 group-hover:text-neutral-700">
                      <Camera className="w-5 h-5 mb-0.5 text-neutral-500" />
                      <span className="text-[9px] font-semibold text-neutral-600 leading-tight">Add Photo</span>
                      <span className="text-[7px] text-neutral-400 leading-tight">From Device</span>
                    </div>
                  )}
                </div>

                <div className="text-xs space-y-1 text-neutral-600">
                  <p className="font-bold text-neutral-900 font-display text-sm">{business.name}</p>
                  <p className="text-[11px] text-neutral-500">{business.address || business.city}</p>
                  <p className="text-[11px] text-neutral-500">{business.phone}</p>
                  <span className="inline-block text-[10px] font-mono bg-emerald-50 text-emerald-700 px-1.5 py-0.5 rounded mt-0.5">
                    Verified Short Stack Special
                  </span>
                </div>
              </div>
            </div>

            {/* Flyer Footer */}
            <div className="py-2.5 px-4 bg-neutral-50 border-t border-neutral-100 flex items-center justify-between text-[10px] text-neutral-400">
              <span>shortstack.local/biz/{business.id}</span>
              <span>Short Stack Directory</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
