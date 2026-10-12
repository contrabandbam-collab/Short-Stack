import React, { useState, useEffect } from 'react';
import { Business, Category, CustomerReview } from '../types/pipsqueak.ts';
import { QRCodeModal } from './QRCodeModal.tsx';
import { ReportModal } from './ReportModal.tsx';
import { ContactModal } from './ContactModal.tsx';
import {
  MapPin,
  Phone,
  Mail,
  Globe,
  Navigation,
  Clock,
  QrCode,
  Share2,
  AlertTriangle,
  ChevronRight,
  ExternalLink,
  Utensils,
  Wrench,
  Sparkles,
  FileText,
  Image as ImageIcon,
  Check,
  Star,
  Flag,
  MessageSquare,
  Send,
  CheckCircle2,
  AlertCircle,
  X,
  Search,
} from 'lucide-react';

interface PublicProfileViewProps {
  business: Business | null;
  inactiveNotice?: {
    status: string;
    businessId: string;
  } | null;
  category?: Category;
  onBackToSearch: () => void;
  onOpenBusiness?: (id: string) => void;
  onStartSearch?: (query: string) => void;
}

export const PublicProfileView: React.FC<PublicProfileViewProps> = ({
  business,
  inactiveNotice,
  category,
  onBackToSearch,
  onOpenBusiness,
  onStartSearch,
}) => {
  const [profileSearchQuery, setProfileSearchQuery] = useState('');
  const [showContactModal, setShowContactModal] = useState(false);
  const [showQR, setShowQR] = useState(false);
  const [showReport, setShowReport] = useState(false);
  const [selectedPhoto, setSelectedPhoto] = useState<string | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);

  // Customer Reviews & Automatic Ratings State
  const [reviews, setReviews] = useState<CustomerReview[]>([]);
  const [isLoadingReviews, setIsLoadingReviews] = useState(false);
  const [currentAverageRating, setCurrentAverageRating] = useState<number | null>(
    business?.averageRating ?? null
  );
  const [currentRatingCount, setCurrentRatingCount] = useState<number>(
    business?.ratingCount ?? 0
  );

  // New review submission form state
  const [newRating, setNewRating] = useState<number>(5);
  const [hoverRating, setHoverRating] = useState<number>(0);
  const [newComment, setNewComment] = useState('');
  const [newReviewerName, setNewReviewerName] = useState('');
  const [isSubmittingReview, setIsSubmittingReview] = useState(false);
  const [reviewSuccessMsg, setReviewSuccessMsg] = useState<string | null>(null);
  const [reviewErrorMsg, setReviewErrorMsg] = useState<string | null>(null);

  // Flag review modal state
  const [flagModalReviewId, setFlagModalReviewId] = useState<string | null>(null);
  const [flagReasonText, setFlagReasonText] = useState('');
  const [isFlagging, setIsFlagging] = useState(false);
  const [flagSuccessMsg, setFlagSuccessMsg] = useState<string | null>(null);

  // Fetch reviews whenever business changes
  useEffect(() => {
    if (business?.id && business.status === 'active') {
      fetchReviews();
    }
  }, [business?.id]);

  const fetchReviews = async () => {
    if (!business?.id) return;
    setIsLoadingReviews(true);
    try {
      const res = await fetch(`/api/businesses/${business.id}/reviews`);
      if (res.ok) {
        const data = await res.json();
        setReviews(data.reviews || []);
        if (data.averageRating !== undefined) {
          setCurrentAverageRating(data.averageRating);
          setCurrentRatingCount(data.ratingCount ?? 0);
        }
      }
    } catch (e) {
      console.error('Failed to fetch reviews', e);
    } finally {
      setIsLoadingReviews(false);
    }
  };

  const handleSubmitReview = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!business?.id) return;
    if (newRating < 1 || newRating > 5) {
      setReviewErrorMsg('Please select a star rating between 1 and 5 stars.');
      return;
    }

    setIsSubmittingReview(true);
    setReviewErrorMsg(null);
    setReviewSuccessMsg(null);

    try {
      const res = await fetch(`/api/businesses/${business.id}/reviews`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rating: newRating,
          comment: newComment.trim() || undefined,
          reviewerName: newReviewerName.trim() || undefined,
        }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setReviewSuccessMsg('Your review has been published. Thank you for your feedback!');
        setNewComment('');
        setNewReviewerName('');
        setNewRating(5);
        if (data.averageRating !== undefined) {
          setCurrentAverageRating(data.averageRating);
          setCurrentRatingCount(data.ratingCount ?? 0);
        }
        await fetchReviews();
        setTimeout(() => setReviewSuccessMsg(null), 5000);
      } else {
        setReviewErrorMsg(data.error || 'Failed to submit review.');
      }
    } catch {
      setReviewErrorMsg('Network error while submitting review.');
    } finally {
      setIsSubmittingReview(false);
    }
  };

  const handleFlagReview = async () => {
    if (!flagModalReviewId) return;
    setIsFlagging(true);
    try {
      const res = await fetch(`/api/reviews/${flagModalReviewId}/flag`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reason: flagReasonText.trim() || 'Reported by user for administrator investigation',
        }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setFlagSuccessMsg('Review flagged for administrator investigation.');
        setFlagModalReviewId(null);
        setFlagReasonText('');
        await fetchReviews();
        setTimeout(() => setFlagSuccessMsg(null), 4000);
      } else {
        alert(data.error || 'Unable to flag review.');
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsFlagging(false);
    }
  };

  // If listing is inactive or suspended
  if (inactiveNotice || !business || business.status !== 'active') {
    return (
      <div className="max-w-3xl mx-auto px-4 py-16 text-center">
        <div className="w-12 h-12 rounded-full bg-amber-50 text-amber-600 flex items-center justify-center mx-auto mb-4">
          <AlertTriangle className="w-6 h-6" />
        </div>
        <h2 className="text-xl font-bold font-display text-neutral-900">
          Listing Temporarily Unavailable
        </h2>
        <p className="text-sm text-neutral-600 mt-2 max-w-md mx-auto">
          This local business profile is currently undergoing scheduled renewal or maintenance and is not visible to the public.
        </p>
        <p className="text-xs font-mono text-neutral-400 mt-2">
          Permanent ID: {inactiveNotice?.businessId || business?.id || '—'}
        </p>
        <div className="mt-8">
          <button
            onClick={onBackToSearch}
            className="py-2.5 px-5 text-xs font-semibold text-white bg-neutral-900 hover:bg-neutral-800 rounded-lg transition-colors"
          >
            Return to Directory Search
          </button>
        </div>
      </div>
    );
  }

  const profileUrl = `${window.location.origin}/?biz=${business.id}`;

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(profileUrl);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    } catch {
      // Fallback
    }
  };

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* Sticky "Tell me what you need" Search Header & Actions */}
      <div className="sticky top-16 z-30 -mx-4 sm:-mx-6 lg:-mx-8 px-4 sm:px-6 lg:px-8 py-3 bg-white/95 backdrop-blur-md border-b border-neutral-200/90 shadow-2xs">
        <div className="max-w-5xl mx-auto flex flex-wrap items-center justify-between gap-3 text-xs">
          {/* Breadcrumb Navigation */}
          <div className="flex items-center gap-1.5 flex-wrap text-neutral-500">
            <button onClick={onBackToSearch} className="hover:text-neutral-900 transition-colors font-medium">
              Directory
            </button>
            <ChevronRight className="w-3.5 h-3.5 text-neutral-400" />
            <span>{category?.name || business.category}</span>
            <ChevronRight className="w-3.5 h-3.5 text-neutral-400" />
            <span className="text-neutral-900 font-semibold truncate max-w-xs">{business.name}</span>
          </div>

          {/* Sticky "Tell me what you need" Search Field */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (profileSearchQuery.trim() && onStartSearch) {
                onStartSearch(profileSearchQuery.trim());
              } else {
                onBackToSearch();
              }
            }}
            className="relative flex items-center w-full sm:w-72 order-last sm:order-none"
          >
            <Search className="absolute left-3 w-3.5 h-3.5 text-neutral-400 pointer-events-none" />
            <input
              type="text"
              value={profileSearchQuery}
              onChange={(e) => setProfileSearchQuery(e.target.value)}
              placeholder="Tell me what you need..."
              className="w-full pl-8 pr-3 py-1.5 text-xs bg-neutral-100 hover:bg-neutral-200/70 focus:bg-white border border-neutral-200 focus:border-neutral-900 rounded-lg text-neutral-900 focus:outline-none transition-colors shadow-2xs"
            />
          </form>

          {/* Quick Actions */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowContactModal(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-neutral-900 hover:bg-neutral-800 rounded-md transition-colors shadow-xs"
            >
              <Phone className="w-3.5 h-3.5" />
              <span>Contact</span>
            </button>
            <button
              onClick={() => setShowQR(true)}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-neutral-700 bg-neutral-100 hover:bg-neutral-200 rounded-md transition-colors"
            >
              <QrCode className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">QR</span>
            </button>
            <button
              onClick={handleCopyLink}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-neutral-700 bg-neutral-100 hover:bg-neutral-200 rounded-md transition-colors"
            >
              {copiedLink ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Share2 className="w-3.5 h-3.5" />}
              <span>{copiedLink ? 'Copied' : 'Share'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Hero Header Block */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Main Info */}
        <div className="lg:col-span-8 space-y-4">
          <div>
            <div className="flex items-center gap-2 text-xs text-neutral-500 mb-2">
              <span className="font-medium text-neutral-800">{category?.name || business.category}</span>
              <span aria-hidden="true">·</span>
              <span>{business.city}, {business.state}</span>
            </div>

            <h1 className="text-3xl sm:text-4xl font-extrabold font-display text-neutral-900 tracking-tight leading-tight">
              {business.name}
            </h1>

            {/* Customer Rating Summary Header */}
            <div className="flex items-center gap-2 mt-2 text-xs">
              {currentRatingCount && currentRatingCount > 0 && currentAverageRating ? (
                <div className="flex items-center gap-1.5">
                  <div className="flex items-center text-amber-500">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <Star
                        key={star}
                        className={`w-3.5 h-3.5 ${
                          star <= Math.round(currentAverageRating)
                            ? 'fill-amber-400 text-amber-400'
                            : 'text-neutral-300'
                        }`}
                      />
                    ))}
                  </div>
                  <span className="font-bold text-neutral-900">{currentAverageRating.toFixed(1)}</span>
                  <span className="text-neutral-500">
                    ({currentRatingCount} {currentRatingCount === 1 ? 'customer rating' : 'customer ratings'})
                  </span>
                  <span aria-hidden="true" className="text-neutral-300">·</span>
                  <a href="#customer-reviews" className="text-neutral-700 hover:text-neutral-900 font-medium hover:underline">
                    Read reviews
                  </a>
                </div>
              ) : (
                <div className="flex items-center gap-1.5 text-neutral-500 text-xs">
                  <span className="italic">No reviews yet</span>
                  <span aria-hidden="true" className="text-neutral-300">·</span>
                  <a href="#customer-reviews" className="text-neutral-700 hover:text-neutral-900 font-medium hover:underline">
                    Write first review
                  </a>
                </div>
              )}
            </div>
          </div>

          <p className="text-sm sm:text-base text-neutral-700 leading-relaxed max-w-3xl">
            {business.shortDescription}
          </p>

          {/* Keywords / Tags (Unboxed Text with Separators, Anti-Pill) */}
          {business.keywords && business.keywords.length > 0 && (
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-neutral-500 pt-1">
              {business.keywords.map((kw, idx) => (
                <span key={idx}>
                  #{kw}
                </span>
              ))}
            </div>
          )}

          {/* Contact Bar */}
          <div className="pt-4 flex flex-wrap items-center gap-3 text-xs text-neutral-600">
            <button
              onClick={() => setShowContactModal(true)}
              className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-bold text-white bg-neutral-900 hover:bg-neutral-800 rounded-lg transition-colors shadow-xs"
            >
              <Phone className="w-3.5 h-3.5" />
              <span>CONTACT</span>
            </button>

            {business.phone && (
              <a
                href={`tel:${business.phone}`}
                className="inline-flex items-center gap-1.5 font-medium text-neutral-900 hover:underline py-1"
              >
                <Phone className="w-3.5 h-3.5 text-neutral-500" />
                {business.phone}
              </a>
            )}

            {business.email && (
              <a
                href={`mailto:${business.email}`}
                className="inline-flex items-center gap-1.5 font-medium text-neutral-900 hover:underline py-1"
              >
                <Mail className="w-3.5 h-3.5 text-neutral-500" />
                {business.email}
              </a>
            )}

            {business.website && (
              <a
                href={business.website}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 font-medium text-neutral-900 hover:underline"
              >
                <Globe className="w-3.5 h-3.5 text-neutral-500" />
                Website
                <ExternalLink className="w-3 h-3 text-neutral-400" />
              </a>
            )}

            {business.directionsUrl && (
              <a
                href={business.directionsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 font-medium text-neutral-900 hover:underline"
              >
                <Navigation className="w-3.5 h-3.5 text-neutral-500" />
                Get Directions
              </a>
            )}
          </div>
        </div>

        {/* Quick Action / Hours Card */}
        <div className="lg:col-span-4 bg-white rounded-xl border border-neutral-200 p-5 space-y-4">
          <button
            onClick={() => setShowContactModal(true)}
            className="w-full flex items-center justify-center gap-2 py-2.5 px-4 text-xs font-bold text-white bg-neutral-900 hover:bg-neutral-800 rounded-lg transition-colors shadow-xs uppercase tracking-wider"
          >
            <Phone className="w-3.5 h-3.5" />
            <span>CONTACT</span>
          </button>

          <div className="flex items-center justify-between pb-3 border-b border-neutral-100">
            <span className="text-xs font-semibold text-neutral-900 font-display">Location & Hours</span>
            <span className="text-[11px] font-mono text-neutral-500">{business.zipCode}</span>
          </div>

          <div className="text-xs space-y-1.5 text-neutral-600">
            <div className="flex items-start gap-2">
              <MapPin className="w-4 h-4 text-neutral-400 shrink-0 mt-0.5" />
              <div>
                <p className="font-medium text-neutral-900">{business.address}</p>
                <p>{business.city}, {business.state} {business.zipCode}</p>
                {business.serviceArea && (
                  <p className="text-[11px] text-neutral-500 mt-0.5">Service Area: {business.serviceArea}</p>
                )}
              </div>
            </div>
          </div>

          <div className="pt-3 border-t border-neutral-100 text-xs">
            <div className="flex items-center gap-1.5 text-neutral-900 font-medium mb-2">
              <Clock className="w-3.5 h-3.5 text-neutral-500" />
              <span>Operating Hours</span>
            </div>
            <dl className="space-y-1 text-[11px]">
              {Object.entries(business.hours || {}).map(([day, hrs]) => (
                <div key={day} className="flex justify-between py-0.5">
                  <dt className="capitalize text-neutral-500">{day}</dt>
                  <dd className="font-mono text-neutral-800 text-right">{hrs}</dd>
                </div>
              ))}
            </dl>
          </div>

          <div className="pt-2">
            <button
              onClick={() => setShowReport(true)}
              className="w-full text-center text-[11px] text-neutral-400 hover:text-neutral-700 transition-colors"
            >
              Report listing issue
            </button>
          </div>
        </div>
      </div>

      {/* Promotional Flyer Banner (If Published by Owner) */}
      {business.flyer && business.flyer.status === 'published' && (
        <section className="bg-white rounded-xl border border-neutral-200 overflow-hidden p-6 sm:p-8">
          <div className="text-[11px] font-mono uppercase tracking-wider text-neutral-400 mb-2">
            Featured Promotional Offer
          </div>
          <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-center">
            {business.flyer.photoUrl ? (
              <div className="md:col-span-4 aspect-16/9 rounded-lg overflow-hidden bg-neutral-100">
                <img
                  src={business.flyer.photoUrl}
                  alt={business.flyer.headline}
                  className="w-full h-full object-cover"
                />
              </div>
            ) : null}
            <div className={business.flyer.photoUrl ? 'md:col-span-8' : 'md:col-span-12'}>
              <h3 className="text-xl sm:text-2xl font-bold font-display text-neutral-900 tracking-tight">
                {business.flyer.headline}
              </h3>
              <p className="text-sm text-neutral-600 mt-2 leading-relaxed">
                {business.flyer.offerDetails}
              </p>
              <div className="mt-4 flex items-center gap-3">
                <button
                  onClick={() => setShowQR(true)}
                  className="inline-flex items-center gap-1.5 py-2 px-3 text-xs font-semibold text-white bg-neutral-900 hover:bg-neutral-800 rounded-lg transition-colors"
                >
                  <QrCode className="w-3.5 h-3.5" />
                  Save or Scan Offer QR
                </button>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* Category Specific Sections: Restaurant Menu */}
      {business.category === 'restaurants-food' && (
        <section className="bg-white rounded-xl border border-neutral-200 p-6 sm:p-8 space-y-6">
          <div className="flex items-center justify-between pb-4 border-b border-neutral-100">
            <div className="flex items-center gap-2">
              <Utensils className="w-5 h-5 text-neutral-800" />
              <h2 className="text-xl font-bold font-display text-neutral-900">Restaurant Menu</h2>
            </div>
            {business.menuFileUrl && (
              <a
                href={business.menuFileUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs font-medium text-neutral-700 hover:text-neutral-900"
              >
                <FileText className="w-4 h-4" />
                View Full PDF Menu
              </a>
            )}
          </div>

          {/* Menu Photos / Scanned Menus */}
          {business.menuPhotos && business.menuPhotos.length > 0 && (
            <div className="space-y-3">
              <h4 className="text-xs font-semibold text-neutral-700 font-display">Printed Menu Showcase</h4>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                {business.menuPhotos.map((mPhoto, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => setSelectedPhoto(mPhoto)}
                    className="relative aspect-3/4 rounded-lg overflow-hidden border border-neutral-200 group bg-neutral-100"
                  >
                    <img
                      src={mPhoto}
                      alt={`Menu page ${idx + 1}`}
                      className="w-full h-full object-cover group-hover:scale-103 transition-transform"
                    />
                    <div className="absolute inset-0 bg-neutral-900/0 group-hover:bg-neutral-900/30 transition-colors flex items-center justify-center">
                      <span className="opacity-0 group-hover:opacity-100 text-white text-xs font-medium px-2 py-1 bg-black/60 rounded">
                        View Page
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Structured Menu Items */}
          {business.menuItems && business.menuItems.length > 0 && (
            <div className="space-y-6 pt-4 border-t border-neutral-100">
              <h4 className="text-xs font-semibold text-neutral-700 font-display">Current Offerings & Prices</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4">
                {business.menuItems.map((item) => (
                  <div key={item.id} className="pb-3 border-b border-neutral-100 flex items-start justify-between gap-4">
                    <div>
                      <h5 className="text-sm font-semibold text-neutral-900">{item.name}</h5>
                      <p className="text-xs text-neutral-600 mt-0.5">{item.description}</p>
                      {item.category && (
                        <span className="text-[10px] text-neutral-400 mt-1 block">{item.category}</span>
                      )}
                    </div>
                    <span className="text-xs font-mono font-bold text-neutral-900 shrink-0">
                      {item.price}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>
      )}

      {/* Services / Products Section (For Automotive, Home Services, Pet Services, etc.) */}
      {business.services && business.services.length > 0 && (
        <section className="bg-white rounded-xl border border-neutral-200 p-6 sm:p-8 space-y-6">
          <div className="flex items-center justify-between pb-4 border-b border-neutral-100">
            <div className="flex items-center gap-2">
              <Wrench className="w-5 h-5 text-neutral-800" />
              <h2 className="text-xl font-bold font-display text-neutral-900">
                Services & Specializations
              </h2>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4">
            {business.services.map((svc) => (
              <div key={svc.id} className="pb-3 border-b border-neutral-100 flex items-start justify-between gap-4">
                <div>
                  <h5 className="text-sm font-semibold text-neutral-900">{svc.name}</h5>
                  <p className="text-xs text-neutral-600 mt-0.5 leading-relaxed">{svc.description}</p>
                </div>
                {svc.price && (
                  <span className="text-xs font-mono font-medium text-neutral-900 shrink-0">
                    {svc.price}
                  </span>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Customer Reviews & Automatic Business Ratings Section */}
      <section id="customer-reviews" className="bg-white rounded-xl border border-neutral-200 p-6 sm:p-8 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-neutral-100">
          <div>
            <div className="flex items-center gap-2">
              <MessageSquare className="w-5 h-5 text-neutral-800" />
              <h2 className="text-xl font-bold font-display text-neutral-900">Customer Reviews</h2>
            </div>
            <p className="text-xs text-neutral-500 mt-0.5">
              Customer star ratings and written comments. Displayed average and count are calculated automatically.
            </p>
          </div>

          {/* Average Rating Score Box */}
          <div className="flex items-center gap-3 bg-neutral-50 px-3.5 py-2 rounded-lg border border-neutral-200 shrink-0">
            {currentRatingCount > 0 && currentAverageRating ? (
              <>
                <div className="text-2xl font-bold font-display text-neutral-900 leading-none">
                  {currentAverageRating.toFixed(1)}
                </div>
                <div>
                  <div className="flex items-center text-amber-500">
                    {[1, 2, 3, 4, 5].map((s) => (
                      <Star
                        key={s}
                        className={`w-3.5 h-3.5 ${
                          s <= Math.round(currentAverageRating)
                            ? 'fill-amber-400 text-amber-400'
                            : 'text-neutral-300'
                        }`}
                      />
                    ))}
                  </div>
                  <span className="text-[11px] text-neutral-500 block">
                    {currentRatingCount} published {currentRatingCount === 1 ? 'rating' : 'ratings'}
                  </span>
                </div>
              </>
            ) : (
              <span className="text-xs text-neutral-500 italic">No reviews yet</span>
            )}
          </div>
        </div>

        {/* Review Submission Form */}
        <div className="bg-neutral-50 rounded-xl border border-neutral-200 p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-neutral-900 font-display">
              Leave a Customer Review
            </h3>
            <span className="text-[11px] text-neutral-500">
              Star rating required · Comment optional
            </span>
          </div>

          {reviewSuccessMsg && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg flex items-center gap-2 text-xs text-emerald-800">
              <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
              <span>{reviewSuccessMsg}</span>
            </div>
          )}

          {reviewErrorMsg && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2 text-xs text-red-800">
              <AlertCircle className="w-4 h-4 shrink-0 text-red-600" />
              <span>{reviewErrorMsg}</span>
            </div>
          )}

          <form onSubmit={handleSubmitReview} className="space-y-3">
            {/* Interactive Star Picker */}
            <div>
              <label className="block text-xs font-medium text-neutral-700 mb-1">
                Your Rating *
              </label>
              <div className="flex items-center gap-1.5">
                {[1, 2, 3, 4, 5].map((star) => (
                  <button
                    key={star}
                    type="button"
                    onClick={() => setNewRating(star)}
                    onMouseEnter={() => setHoverRating(star)}
                    onMouseLeave={() => setHoverRating(0)}
                    className="p-1 text-neutral-300 hover:text-amber-400 transition-colors focus:outline-none"
                    aria-label={`Rate ${star} star${star > 1 ? 's' : ''}`}
                  >
                    <Star
                      className={`w-6 h-6 transition-transform hover:scale-110 ${
                        star <= (hoverRating || newRating)
                          ? 'fill-amber-400 text-amber-400'
                          : 'text-neutral-300'
                      }`}
                    />
                  </button>
                ))}
                <span className="text-xs font-semibold text-neutral-700 ml-2">
                  {hoverRating || newRating} / 5 Stars
                </span>
              </div>
            </div>

            {/* Optional Reviewer Display Name */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-neutral-700 mb-1">
                  Your Display Name (Optional)
                </label>
                <input
                  type="text"
                  value={newReviewerName}
                  onChange={(e) => setNewReviewerName(e.target.value)}
                  placeholder="e.g. Jordan M. or Local Customer"
                  maxLength={50}
                  className="w-full text-xs p-2.5 bg-white border border-neutral-200 rounded-lg text-neutral-900 focus:outline-none focus:ring-1 focus:ring-neutral-900"
                />
              </div>
              <div className="flex items-end">
                <p className="text-[11px] text-neutral-500 pb-1">
                  Display name only. Personal account and contact information are never public.
                </p>
              </div>
            </div>

            {/* Optional Written Comment */}
            <div>
              <label className="block text-xs font-medium text-neutral-700 mb-1">
                Written Comment (Optional)
              </label>
              <textarea
                value={newComment}
                onChange={(e) => setNewComment(e.target.value)}
                placeholder="Share details about your experience, food, craftsmanship, customer service..."
                rows={3}
                maxLength={1000}
                className="w-full text-xs p-2.5 bg-white border border-neutral-200 rounded-lg text-neutral-900 focus:outline-none focus:ring-1 focus:ring-neutral-900"
              />
              <div className="flex justify-between text-[10px] text-neutral-400 mt-0.5">
                <span>Basic anti-spam safeguards active · Max 1000 characters</span>
                <span>{newComment.length}/1000</span>
              </div>
            </div>

            <div className="flex justify-end pt-1">
              <button
                type="submit"
                disabled={isSubmittingReview}
                className="py-2 px-4 text-xs font-semibold text-white bg-neutral-900 hover:bg-neutral-800 rounded-lg transition-colors flex items-center gap-1.5 disabled:opacity-50"
              >
                <Send className="w-3.5 h-3.5" />
                <span>{isSubmittingReview ? 'Submitting...' : 'Post Customer Review'}</span>
              </button>
            </div>
          </form>
        </div>

        {/* Flag feedback notice */}
        {flagSuccessMsg && (
          <div className="p-3 bg-neutral-100 border border-neutral-300 rounded-lg text-xs text-neutral-800 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-neutral-700" />
            <span>{flagSuccessMsg}</span>
          </div>
        )}

        {/* List of Published Reviews */}
        <div className="space-y-4 pt-2">
          <div className="flex items-center justify-between text-xs text-neutral-500 pb-2 border-b border-neutral-100">
            <span className="font-semibold text-neutral-900 font-display">
              Published Community Reviews ({reviews.length})
            </span>
            <span className="text-[11px]">Ranked newest first</span>
          </div>

          {isLoadingReviews ? (
            <div className="py-6 text-center text-xs text-neutral-500">
              Loading customer reviews...
            </div>
          ) : reviews.length === 0 ? (
            <div className="py-8 text-center bg-neutral-50 rounded-xl border border-neutral-100 p-6 space-y-2">
              <Star className="w-8 h-8 text-neutral-300 mx-auto" />
              <h4 className="text-sm font-semibold text-neutral-800">No reviews yet</h4>
              <p className="text-xs text-neutral-500 max-w-sm mx-auto">
                Be the first customer to share your experience with {business.name}!
              </p>
            </div>
          ) : (
            <div className="divide-y divide-neutral-100">
              {reviews.map((rev) => (
                <div key={rev.id} className="py-4 space-y-2">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-center gap-2">
                      <div className="flex items-center text-amber-500">
                        {[1, 2, 3, 4, 5].map((s) => (
                          <Star
                            key={s}
                            className={`w-3.5 h-3.5 ${
                              s <= rev.rating ? 'fill-amber-400 text-amber-400' : 'text-neutral-200'
                            }`}
                          />
                        ))}
                      </div>
                      <span className="text-xs font-semibold text-neutral-900">
                        {rev.reviewerName}
                      </span>
                      <span className="text-[11px] text-neutral-400">
                        · {new Date(rev.createdAt).toLocaleDateString('en-US', {
                          year: 'numeric',
                          month: 'short',
                          day: 'numeric',
                        })}
                      </span>
                    </div>

                    <button
                      onClick={() => {
                        setFlagModalReviewId(rev.id);
                        setFlagReasonText('');
                      }}
                      className="text-[11px] text-neutral-400 hover:text-neutral-700 flex items-center gap-1 transition-colors"
                      title="Flag review for administrator review"
                    >
                      <Flag className="w-3 h-3" />
                      <span>Report</span>
                    </button>
                  </div>

                  {rev.comment && (
                    <p className="text-xs sm:text-sm text-neutral-700 leading-relaxed pl-0.5">
                      {rev.comment}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Flag Review Modal */}
      {flagModalReviewId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-neutral-900/60 backdrop-blur-xs">
          <div className="relative w-full max-w-md bg-white rounded-xl shadow-xl border border-neutral-200 p-6 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-neutral-100">
              <h3 className="text-sm font-semibold text-neutral-900 font-display">
                Flag Review for Administrator Investigation
              </h3>
              <button
                onClick={() => setFlagModalReviewId(null)}
                className="p-1 text-neutral-400 hover:text-neutral-700 rounded-md"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-neutral-600">
              Please describe why this review violates Short Stack directory rules (e.g. spam, abusive language, off-topic). Administrators will review and take appropriate action.
            </p>

            <div>
              <label className="block text-xs font-medium text-neutral-700 mb-1">Reason for Flagging *</label>
              <textarea
                value={flagReasonText}
                onChange={(e) => setFlagReasonText(e.target.value)}
                placeholder="Explain the issue with this review..."
                rows={3}
                className="w-full text-xs p-2.5 bg-white border border-neutral-200 rounded-lg text-neutral-900 focus:outline-none focus:ring-1 focus:ring-neutral-900"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setFlagModalReviewId(null)}
                className="py-1.5 px-3 text-xs font-medium text-neutral-600 hover:text-neutral-800"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleFlagReview}
                disabled={isFlagging}
                className="py-1.5 px-4 text-xs font-semibold text-white bg-neutral-900 hover:bg-neutral-800 rounded-lg transition-colors disabled:opacity-50"
              >
                {isFlagging ? 'Submitting...' : 'Submit Flag'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Photo Gallery */}
      {business.photos && business.photos.length > 0 && (
        <section className="space-y-4">
          <h3 className="text-lg font-bold font-display text-neutral-900">Photos & Atmosphere</h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {business.photos.map((ph, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => setSelectedPhoto(ph)}
                className="aspect-16/9 rounded-xl overflow-hidden border border-neutral-200 bg-neutral-100 group focus:outline-none"
              >
                <img
                  src={ph}
                  alt={`${business.name} photo ${idx + 1}`}
                  className="w-full h-full object-cover group-hover:scale-102 transition-transform duration-300"
                />
              </button>
            ))}
          </div>
        </section>
      )}

      {/* Photo Lightbox Modal */}
      {selectedPhoto && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-xs"
          onClick={() => setSelectedPhoto(null)}
        >
          <div className="relative max-w-4xl max-h-[90vh] overflow-hidden rounded-xl">
            <img src={selectedPhoto} alt="Full view" className="max-w-full max-h-[85vh] object-contain" />
          </div>
        </div>
      )}

      {/* Modals */}
      <ContactModal
        businessName={business.name}
        phone={business.phone}
        smsCapable={business.smsCapable !== false}
        isOpen={showContactModal}
        onClose={() => setShowContactModal(false)}
      />

      <QRCodeModal
        url={profileUrl}
        title={business.name}
        businessId={business.id}
        isOpen={showQR}
        onClose={() => setShowQR(false)}
      />

      <ReportModal
        businessId={business.id}
        businessName={business.name}
        isOpen={showReport}
        onClose={() => setShowReport(false)}
      />
    </div>
  );
};
