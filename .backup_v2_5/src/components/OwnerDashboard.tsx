import React, { useState, useEffect } from 'react';
import {
  Business,
  Category,
  PlacePrediction,
  StaffPermission,
  StaffMember,
  MenuItem,
  ServiceItem,
  CustomerReview,
} from '../types/seeker.ts';
import { QRCodeModal } from './QRCodeModal.tsx';
import { PaymentModal } from './PaymentModal.tsx';
import { FlyerBuilder } from './FlyerBuilder.tsx';
import { LocationAutocomplete } from './LocationAutocomplete.tsx';
import { ShortStackLogo } from './ShortStackLogo.tsx';
import { normalizeKeyword, deduplicateKeywords } from '../utils/formatters.ts';
import {
  Store,
  Plus,
  QrCode,
  Share2,
  Calendar,
  AlertCircle,
  CheckCircle2,
  Clock,
  MapPin,
  Utensils,
  Wrench,
  Users,
  Shield,
  CreditCard,
  Sparkles,
  ExternalLink,
  ChevronRight,
  Trash2,
  Play,
  Pause,
  AlertTriangle,
  RefreshCw,
  Copy,
  Check,
  LogOut,
  MessageSquare,
  Star,
  Flag,
  X,
  Upload,
  Camera,
} from 'lucide-react';

interface OwnerDashboardProps {
  businesses: Business[];
  categories: Category[];
  currentUserId: string;
  onRefreshData: () => Promise<void>;
  onOpenProfile: (id: string) => void;
  onLogout: () => void;
}

export const OwnerDashboard: React.FC<OwnerDashboardProps> = ({
  businesses,
  categories,
  currentUserId,
  onRefreshData,
  onOpenProfile,
  onLogout,
}) => {
  const [selectedBusinessId, setSelectedBusinessId] = useState<string>(
    businesses[0]?.id || ''
  );
  const [activeTab, setActiveTab] = useState<'editor' | 'flyer' | 'billing' | 'staff' | 'reviews'>('editor');
  const [ownerReviews, setOwnerReviews] = useState<CustomerReview[]>([]);
  const [isLoadingOwnerReviews, setIsLoadingOwnerReviews] = useState(false);
  const [flagModalReviewId, setFlagModalReviewId] = useState<string | null>(null);
  const [flagReasonText, setFlagReasonText] = useState('');
  const [isFlagging, setIsFlagging] = useState(false);
  const [showQRModal, setShowQRModal] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [isCreatingNew, setIsCreatingNew] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // New listing form state
  const [newBizName, setNewBizName] = useState('');
  const [newBizCategory, setNewBizCategory] = useState(categories[0]?.id || 'restaurants-food');
  const [newBizCity, setNewBizCity] = useState('');
  const [newBizReferralCode, setNewBizReferralCode] = useState('');

  // Selected business
  const selectedBusiness = businesses.find((b) => b.id === selectedBusinessId) || businesses[0];

  // Editor form state for selected business
  const [editForm, setEditForm] = useState<Partial<Business>>({});
  const [customTagInput, setCustomTagInput] = useState('');
  const [tagError, setTagError] = useState<string | null>(null);

  // Structured menu item builder state
  const [newMenuName, setNewMenuName] = useState('');
  const [newMenuDesc, setNewMenuDesc] = useState('');
  const [newMenuPrice, setNewMenuPrice] = useState('');
  const [newMenuCategory, setNewMenuCategory] = useState('');

  // Structured service item builder state
  const [newServiceName, setNewServiceName] = useState('');
  const [newServiceDesc, setNewServiceDesc] = useState('');
  const [newServicePrice, setNewServicePrice] = useState('');

  // Gallery photo device upload state
  const [showroomPhotoPreview, setShowroomPhotoPreview] = useState<string | null>(null);
  const showroomFileInputRef = React.useRef<HTMLInputElement | null>(null);
  const [copiedReferral, setCopiedReferral] = useState(false);

  const handleAddMenuItem = () => {
    if (!newMenuName.trim()) return;
    const newItem: MenuItem = {
      id: `m-${Date.now()}`,
      name: newMenuName.trim(),
      description: newMenuDesc.trim(),
      price: newMenuPrice.trim() || '$0.00',
      category: newMenuCategory.trim() || 'General',
    };
    setEditForm({
      ...editForm,
      menuItems: [...(editForm.menuItems || []), newItem],
    });
    setNewMenuName('');
    setNewMenuDesc('');
    setNewMenuPrice('');
    setNewMenuCategory('');
  };

  const handleRemoveMenuItem = (id: string) => {
    setEditForm({
      ...editForm,
      menuItems: (editForm.menuItems || []).filter((m) => m.id !== id),
    });
  };

  const handleAddService = () => {
    if (!newServiceName.trim()) return;
    const newSvc: ServiceItem = {
      id: `s-${Date.now()}`,
      name: newServiceName.trim(),
      description: newServiceDesc.trim(),
      price: newServicePrice.trim() || undefined,
    };
    setEditForm({
      ...editForm,
      services: [...(editForm.services || []), newSvc],
    });
    setNewServiceName('');
    setNewServiceDesc('');
    setNewServicePrice('');
  };

  const handleRemoveService = (id: string) => {
    setEditForm({
      ...editForm,
      services: (editForm.services || []).filter((s) => s.id !== id),
    });
  };

  const handleShowroomFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setShowroomPhotoPreview(reader.result);
      }
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleConfirmAddPhoto = () => {
    if (!showroomPhotoPreview) return;
    setEditForm({
      ...editForm,
      photos: [...(editForm.photos || []), showroomPhotoPreview],
    });
    setShowroomPhotoPreview(null);
  };

  const handleCancelPhotoPreview = () => {
    setShowroomPhotoPreview(null);
  };

  const handleRemovePhoto = (idx: number) => {
    setEditForm({
      ...editForm,
      photos: (editForm.photos || []).filter((_, i) => i !== idx),
    });
  };

  // Sync edit form when selected business changes
  React.useEffect(() => {
    if (selectedBusiness) {
      setEditForm({ ...selectedBusiness });
    }
  }, [selectedBusiness?.id]);

  const fetchOwnerReviews = async () => {
    if (!selectedBusinessId) return;
    setIsLoadingOwnerReviews(true);
    try {
      const res = await fetch(`/api/businesses/${selectedBusinessId}/reviews`);
      if (res.ok) {
        const data = await res.json();
        setOwnerReviews(data.reviews || []);
      }
    } catch (e) {
      console.error('Failed to load owner reviews', e);
    } finally {
      setIsLoadingOwnerReviews(false);
    }
  };

  useEffect(() => {
    if (selectedBusinessId) {
      fetchOwnerReviews();
    }
  }, [selectedBusinessId]);

  if (!selectedBusiness && !isCreatingNew) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-16 text-center">
        <Store className="w-12 h-12 text-neutral-300 mx-auto mb-4" />
        <h2 className="text-xl font-bold font-display text-neutral-900">No Business Listings Found</h2>
        <p className="text-xs text-neutral-500 mt-1 max-w-sm mx-auto">
          Create your first listing to gain a permanent profile, permanent QR code, and advertising directory placement.
        </p>
        <button
          onClick={() => setIsCreatingNew(true)}
          className="mt-6 inline-flex items-center gap-2 py-2 px-4 text-xs font-semibold text-white bg-neutral-900 hover:bg-neutral-800 rounded-lg transition-colors"
        >
          <Plus className="w-4 h-4" />
          Create Business Listing
        </button>
      </div>
    );
  }

  const profileUrl = selectedBusiness
    ? `${window.location.origin}/?biz=${selectedBusiness.id}`
    : '';

  const handleCopyLink = async () => {
    if (!profileUrl) return;
    try {
      await navigator.clipboard.writeText(profileUrl);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    } catch {
      // Fallback
    }
  };

  const handleCreateBusiness = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newBizName.trim()) return;

    try {
      const res = await fetch('/api/businesses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newBizName.trim(),
          category: newBizCategory,
          city: newBizCity.trim() || 'Seattle',
          state: 'WA',
          referredBy: newBizReferralCode.trim() || undefined,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        await onRefreshData();
        setSelectedBusinessId(data.business.id);
        setIsCreatingNew(false);
        setNewBizName('');
        setNewBizReferralCode('');
        setActionMessage(`Draft listing "${data.business.name}" created with Permanent ID ${data.business.id}`);
        setTimeout(() => setActionMessage(null), 4000);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleSaveListing = async () => {
    if (!selectedBusiness) return;
    setIsSaving(true);
    try {
      const res = await fetch(`/api/businesses/${selectedBusiness.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editForm),
      });

      if (res.ok) {
        await onRefreshData();
        setActionMessage('Listing updates saved successfully.');
        setTimeout(() => setActionMessage(null), 3000);
      } else {
        const err = await res.json();
        setErrorMessage(err.error || 'Failed to save changes');
        setTimeout(() => setErrorMessage(null), 5000);
      }
    } catch (err) {
      console.error(err);
      setErrorMessage('Network error while saving changes.');
      setTimeout(() => setErrorMessage(null), 5000);
    } finally {
      setIsSaving(false);
    }
  };

  const handlePublishListing = async () => {
    if (!selectedBusiness) return;
    try {
      const res = await fetch(`/api/businesses/${selectedBusiness.id}/publish`, {
        method: 'POST',
      });
      const data = await res.json();
      await onRefreshData();

      if (!res.ok) {
        setErrorMessage(data.error || 'Publication requirements not met');
        setTimeout(() => setErrorMessage(null), 5000);
      } else if (data.requiresPayment) {
        setShowPaymentModal(true);
      } else {
        setActionMessage('Congratulations! Your listing is now ACTIVE and discoverable in the directory.');
        setTimeout(() => setActionMessage(null), 4000);
      }
    } catch (err) {
      console.error(err);
      setErrorMessage('Network error attempting to publish listing.');
      setTimeout(() => setErrorMessage(null), 5000);
    }
  };

  const handlePauseResume = async (action: 'pause' | 'resume') => {
    if (!selectedBusiness) return;
    try {
      const res = await fetch(`/api/businesses/${selectedBusiness.id}/${action}`, {
        method: 'POST',
      });
      if (res.ok) {
        await onRefreshData();
        setActionMessage(`Listing successfully ${action === 'pause' ? 'paused' : 'resumed'}.`);
        setTimeout(() => setActionMessage(null), 3000);
      } else {
        const data = await res.json();
        setErrorMessage(data.error || `Failed to ${action} listing`);
        setTimeout(() => setErrorMessage(null), 5000);
      }
    } catch (err) {
      console.error(err);
      setErrorMessage(`Network error attempting to ${action} listing.`);
      setTimeout(() => setErrorMessage(null), 5000);
    }
  };

  const handleSimulateExpiration = async (state: 'expired' | 'approaching_notice' | 'active') => {
    if (!selectedBusiness) return;
    try {
      const res = await fetch('/api/billing/simulate-expiration', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          businessId: selectedBusiness.id,
          state,
        }),
      });
      if (res.ok) {
        await onRefreshData();
        setActionMessage(
          state === 'expired'
            ? 'Simulated expired term: Listing transitioned to hidden_unpaid while preserving permanent ID & data.'
            : state === 'approaching_notice'
            ? 'Simulated approaching 30-day notice: Expiration reminder logged.'
            : 'Restored active 1-year paid term.'
        );
        setTimeout(() => setActionMessage(null), 4000);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleOwnerFlagReview = async () => {
    if (!flagModalReviewId) return;
    setIsFlagging(true);
    try {
      const res = await fetch(`/api/reviews/${flagModalReviewId}/flag`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reason: flagReasonText.trim() || 'Flagged by business owner for administrator review',
        }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setActionMessage('Review flagged for administrator investigation. Owners cannot alter or delete customer reviews.');
        setFlagModalReviewId(null);
        setFlagReasonText('');
        await fetchOwnerReviews();
        setTimeout(() => setActionMessage(null), 5000);
      } else {
        setErrorMessage(data.error || 'Failed to flag review.');
        setTimeout(() => setErrorMessage(null), 5000);
      }
    } catch {
      setErrorMessage('Network error while flagging review.');
      setTimeout(() => setErrorMessage(null), 5000);
    } finally {
      setIsFlagging(false);
    }
  };

  // Keyword manipulation
  const currentCategory = categories.find((c) => c.id === editForm.category);
  const currentKeywords = editForm.keywords || [];

  const handleToggleSuggestedKeyword = (kw: string) => {
    const norm = normalizeKeyword(kw);
    if (currentKeywords.includes(norm)) {
      setEditForm({
        ...editForm,
        keywords: currentKeywords.filter((k) => k !== norm),
      });
    } else {
      setEditForm({
        ...editForm,
        keywords: deduplicateKeywords([...currentKeywords, norm]),
      });
    }
  };

  const handleAddCustomTag = () => {
    setTagError(null);
    const norm = normalizeKeyword(customTagInput);
    if (!norm) return;

    if (currentKeywords.includes(norm)) {
      setTagError(`Tag "${norm}" is already added.`);
      return;
    }

    setEditForm({
      ...editForm,
      keywords: deduplicateKeywords([...currentKeywords, norm]),
    });
    setCustomTagInput('');
  };

  const handleRemoveKeyword = (kw: string) => {
    setEditForm({
      ...editForm,
      keywords: currentKeywords.filter((k) => k !== kw),
    });
  };

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* Header with Listing Selector */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-neutral-200">
        <div>
          <div className="mb-2">
            <ShortStackLogo size="sm" variant="horizontal" showTagline={false} />
          </div>
          <h1 className="text-2xl font-bold font-display text-neutral-900 tracking-tight">
            Owner Management Dashboard
          </h1>
          <p className="text-xs text-neutral-500 mt-1">
            Manage your permanent listings, flyer studio, bimonthly advertising terms, and staff permissions.
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* Listing Picker */}
          <select
            value={selectedBusiness?.id || ''}
            onChange={(e) => setSelectedBusinessId(e.target.value)}
            className="text-xs py-2 px-3 bg-white border border-neutral-200 rounded-lg text-neutral-900 font-medium focus:ring-1 focus:ring-neutral-900"
          >
            {businesses.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name} ({b.status})
              </option>
            ))}
          </select>

          <button
            onClick={() => setIsCreatingNew(true)}
            className="inline-flex items-center gap-1.5 py-2 px-3 text-xs font-semibold text-white bg-neutral-900 hover:bg-neutral-800 rounded-lg transition-colors shrink-0"
          >
            <Plus className="w-3.5 h-3.5" />
            New Listing
          </button>

          <button
            onClick={onLogout}
            className="inline-flex items-center gap-1.5 py-2 px-3 text-xs font-semibold text-neutral-700 bg-neutral-100 hover:bg-neutral-200 hover:text-red-700 rounded-lg transition-colors border border-neutral-200 shrink-0"
            title="Log out of Owner Account"
            aria-label="Log out"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Log out</span>
          </button>
        </div>
      </div>

      {actionMessage && (
        <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-lg flex items-center justify-between text-xs text-emerald-800">
          <span>{actionMessage}</span>
          <button onClick={() => setActionMessage(null)} className="text-emerald-600 hover:text-emerald-900 font-medium">
            Dismiss
          </button>
        </div>
      )}

      {errorMessage && (
        <div className="p-3.5 bg-red-50 border border-red-200 rounded-lg flex items-center justify-between text-xs text-red-800">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />
            <span>{errorMessage}</span>
          </div>
          <button onClick={() => setErrorMessage(null)} className="text-red-600 hover:text-red-900 font-medium">
            Dismiss
          </button>
        </div>
      )}

      {/* Modal for Creating New Listing */}
      {isCreatingNew && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-neutral-900/60 backdrop-blur-xs">
          <div className="relative w-full max-w-md bg-white rounded-xl shadow-xl border border-neutral-200 p-6">
            <h3 className="text-base font-semibold text-neutral-900 font-display">Create New Business Listing</h3>
            <p className="text-xs text-neutral-500 mt-1">
              Your listing will be assigned a permanent, unique public business ID and stable profile URL.
            </p>

            <form onSubmit={handleCreateBusiness} className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-medium text-neutral-700 mb-1">Business Name *</label>
                <input
                  type="text"
                  required
                  value={newBizName}
                  onChange={(e) => setNewBizName(e.target.value)}
                  placeholder="e.g. Cascade Handcrafted Bakery"
                  className="w-full text-xs p-2.5 bg-white border border-neutral-200 rounded-lg text-neutral-900 focus:outline-none focus:ring-1 focus:ring-neutral-900"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-neutral-700 mb-1">Primary Category *</label>
                <select
                  value={newBizCategory}
                  onChange={(e) => setNewBizCategory(e.target.value)}
                  className="w-full text-xs p-2.5 bg-white border border-neutral-200 rounded-lg text-neutral-900 focus:outline-none focus:ring-1 focus:ring-neutral-900"
                >
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-neutral-700 mb-1">City and State *</label>
                <input
                  type="text"
                  value={newBizCity}
                  onChange={(e) => setNewBizCity(e.target.value)}
                  placeholder="e.g. Seattle, WA"
                  className="w-full text-xs p-2.5 bg-white border border-neutral-200 rounded-lg text-neutral-900 focus:outline-none focus:ring-1 focus:ring-neutral-900"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-neutral-700 mb-1">Referral Code (Optional)</label>
                <input
                  type="text"
                  value={newBizReferralCode}
                  onChange={(e) => setNewBizReferralCode(e.target.value.toUpperCase())}
                  placeholder="e.g. REF-XXXXXXXX"
                  className="w-full text-xs p-2.5 bg-white border border-neutral-200 rounded-lg text-neutral-900 uppercase focus:outline-none focus:ring-1 focus:ring-neutral-900 font-mono"
                />
                <p className="text-[10px] text-neutral-500 mt-0.5">
                  Referred by another business? Enter their code so they get 50% off their next renewal.
                </p>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsCreatingNew(false)}
                  className="py-2 px-3 text-xs font-medium text-neutral-600 hover:text-neutral-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="py-2 px-4 text-xs font-semibold text-white bg-neutral-900 hover:bg-neutral-800 rounded-lg transition-colors"
                >
                  Create Draft Listing
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {selectedBusiness && (
        <>
          {/* Status Bar & Permanent Identity Ribbon */}
          <div className="bg-white rounded-xl border border-neutral-200 p-5 flex flex-wrap items-center justify-between gap-4">
            <div className="flex flex-wrap items-center gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-lg font-bold font-display text-neutral-900">{selectedBusiness.name}</h2>
                  <span className="font-mono text-xs px-2 py-0.5 rounded bg-neutral-100 text-neutral-700 border border-neutral-200">
                    {selectedBusiness.id}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-xs text-neutral-500 mt-1">
                  <span>Status: <strong className="capitalize text-neutral-800">{selectedBusiness.status.replace('_', ' ')}</strong></span>
                  <span aria-hidden="true">·</span>
                  <span>Enrollment: <strong className="text-neutral-800">${selectedBusiness.billing?.initialSignUpFee || 19.99}</strong></span>
                  <span aria-hidden="true">·</span>
                  <span>
                    Renewal Fee:{' '}
                    <strong className="text-neutral-800">
                      ${selectedBusiness.billing?.hasReferralDiscount ? '12.50 (50% Off)' : `${selectedBusiness.billing?.renewalFee || 25}/2-mo`}
                    </strong>
                  </span>
                  <span aria-hidden="true">·</span>
                  <span>
                    Paid Through: <strong className="text-neutral-800">
                      {selectedBusiness.billing?.paidThroughDate
                        ? new Date(selectedBusiness.billing.paidThroughDate).toLocaleDateString()
                        : 'Unpaid'}
                    </strong>
                  </span>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={() => onOpenProfile(selectedBusiness.id)}
                className="inline-flex items-center gap-1.5 py-1.5 px-3 text-xs font-medium text-neutral-700 bg-neutral-100 hover:bg-neutral-200 rounded-lg transition-colors"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                View Profile
              </button>

              <button
                onClick={() => setShowQRModal(true)}
                className="inline-flex items-center gap-1.5 py-1.5 px-3 text-xs font-medium text-neutral-700 bg-neutral-100 hover:bg-neutral-200 rounded-lg transition-colors"
              >
                <QrCode className="w-3.5 h-3.5" />
                QR Code
              </button>

              <button
                onClick={handleCopyLink}
                className="inline-flex items-center gap-1.5 py-1.5 px-3 text-xs font-medium text-neutral-700 bg-neutral-100 hover:bg-neutral-200 rounded-lg transition-colors"
              >
                {copiedLink ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                {copiedLink ? 'Copied' : 'Copy URL'}
              </button>

              {selectedBusiness.status === 'active' ? (
                <button
                  onClick={() => handlePauseResume('pause')}
                  className="inline-flex items-center gap-1 py-1.5 px-3 text-xs font-medium text-neutral-700 bg-neutral-100 hover:bg-neutral-200 rounded-lg transition-colors"
                >
                  <Pause className="w-3.5 h-3.5" />
                  Pause
                </button>
              ) : selectedBusiness.status === 'paused' ? (
                <button
                  onClick={() => handlePauseResume('resume')}
                  className="inline-flex items-center gap-1 py-1.5 px-3 text-xs font-semibold text-white bg-neutral-900 hover:bg-neutral-800 rounded-lg transition-colors"
                >
                  <Play className="w-3.5 h-3.5" />
                  Resume
                </button>
              ) : (
                <button
                  onClick={handlePublishListing}
                  className="inline-flex items-center gap-1.5 py-1.5 px-3.5 text-xs font-semibold text-white bg-neutral-900 hover:bg-neutral-800 rounded-lg transition-colors"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  Publish Listing
                </button>
              )}
            </div>
          </div>

          {/* Navigation Tabs (Functional Buttons / Segmented Controls) */}
          <div className="flex items-center gap-1 p-1 bg-neutral-100 rounded-lg w-fit border border-neutral-200">
            <button
              onClick={() => setActiveTab('editor')}
              className={`py-1.5 px-3.5 text-xs font-medium rounded-md transition-colors ${
                activeTab === 'editor'
                  ? 'bg-white text-neutral-900 shadow-xs'
                  : 'text-neutral-600 hover:text-neutral-900'
              }`}
            >
              Listing Details & Media
            </button>
            <button
              onClick={() => setActiveTab('flyer')}
              className={`py-1.5 px-3.5 text-xs font-medium rounded-md transition-colors ${
                activeTab === 'flyer'
                  ? 'bg-white text-neutral-900 shadow-xs'
                  : 'text-neutral-600 hover:text-neutral-900'
              }`}
            >
              Promotional Flyer Studio
            </button>
            <button
              onClick={() => setActiveTab('billing')}
              className={`py-1.5 px-3.5 text-xs font-medium rounded-md transition-colors ${
                activeTab === 'billing'
                  ? 'bg-white text-neutral-900 shadow-xs'
                  : 'text-neutral-600 hover:text-neutral-900'
              }`}
            >
              Advertising Fee & Term ($19.99 / $25)
            </button>
            <button
              onClick={() => setActiveTab('staff')}
              className={`py-1.5 px-3.5 text-xs font-medium rounded-md transition-colors ${
                activeTab === 'staff'
                  ? 'bg-white text-neutral-900 shadow-xs'
                  : 'text-neutral-600 hover:text-neutral-900'
              }`}
            >
              Staff Access & Permissions
            </button>
            <button
              onClick={() => setActiveTab('reviews')}
              className={`py-1.5 px-3.5 text-xs font-medium rounded-md transition-colors ${
                activeTab === 'reviews'
                  ? 'bg-white text-neutral-900 shadow-xs'
                  : 'text-neutral-600 hover:text-neutral-900'
              }`}
            >
              Customer Reviews ({ownerReviews.length})
            </button>
          </div>

          {/* TAB 1: LISTING EDITOR */}
          {activeTab === 'editor' && (
            <div className="bg-white rounded-xl border border-neutral-200 p-6 space-y-6">
              <div className="flex items-center justify-between pb-4 border-b border-neutral-100">
                <div>
                  <h3 className="text-base font-semibold text-neutral-900 font-display">Listing Content & Media</h3>
                  <p className="text-xs text-neutral-500 mt-0.5">
                    Changes here update your permanent profile. Category requirements must be fulfilled before publishing.
                  </p>
                </div>
                <button
                  onClick={handleSaveListing}
                  disabled={isSaving}
                  className="py-2 px-4 text-xs font-semibold text-white bg-neutral-900 hover:bg-neutral-800 disabled:opacity-50 rounded-lg transition-colors"
                >
                  {isSaving ? 'Saving...' : 'Save Changes'}
                </button>
              </div>

              {/* Basic Fields */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-xs font-semibold text-neutral-800 mb-1">Business Name</label>
                  <input
                    type="text"
                    value={editForm.name || ''}
                    onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                    className="w-full text-xs p-2.5 bg-white border border-neutral-200 rounded-lg text-neutral-900 focus:outline-none focus:ring-1 focus:ring-neutral-900"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-neutral-800 mb-1">Category</label>
                  <select
                    value={editForm.category || ''}
                    onChange={(e) => setEditForm({ ...editForm, category: e.target.value })}
                    className="w-full text-xs p-2.5 bg-white border border-neutral-200 rounded-lg text-neutral-900 focus:outline-none focus:ring-1 focus:ring-neutral-900"
                  >
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="md:col-span-2">
                  <label className="block text-xs font-semibold text-neutral-800 mb-1">Short Description</label>
                  <textarea
                    value={editForm.shortDescription || ''}
                    onChange={(e) => setEditForm({ ...editForm, shortDescription: e.target.value })}
                    rows={3}
                    className="w-full text-xs p-2.5 bg-white border border-neutral-200 rounded-lg text-neutral-900 focus:outline-none focus:ring-1 focus:ring-neutral-900"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-xs font-semibold text-neutral-800">
                      Street Address (with Address Suggestions)
                    </label>
                    <span className="text-[10px] text-neutral-500">
                      Select suggestion to auto-populate fields or type manually
                    </span>
                  </div>
                  <LocationAutocomplete
                    value={editForm.address || ''}
                    onChange={(val) => setEditForm({ ...editForm, address: val })}
                    onSelectPrediction={(pred: PlacePrediction) => {
                      setEditForm((prev) => ({
                        ...prev,
                        address: pred.streetAddress || pred.text,
                        city: pred.city || prev.city,
                        state: pred.state || prev.state,
                        zipCode: pred.zipCode || prev.zipCode,
                        lat: pred.lat !== undefined ? pred.lat : prev.lat,
                        lng: pred.lng !== undefined ? pred.lng : prev.lng,
                      }));
                      setActionMessage('Address populated from place suggestion. Review and edit fields before saving.');
                      setTimeout(() => setActionMessage(null), 4000);
                    }}
                    placeholder="Type business street address (e.g. 428 Mill Creek Way)..."
                    showProviderStatus={true}
                  />
                  <p className="text-[11px] text-neutral-500 mt-1">
                    Selecting an address suggestion automatically populates the street address, city, state, and ZIP below. You can review and edit all fields before saving.
                  </p>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-neutral-800 mb-1">City and State, ZIP Code</label>
                  <div className="grid grid-cols-3 gap-2">
                    <input
                      type="text"
                      placeholder="City"
                      value={editForm.city || ''}
                      onChange={(e) => setEditForm({ ...editForm, city: e.target.value })}
                      className="text-xs p-2.5 bg-white border border-neutral-200 rounded-lg text-neutral-900 focus:outline-none focus:ring-1 focus:ring-neutral-900"
                    />
                    <input
                      type="text"
                      placeholder="State"
                      value={editForm.state || ''}
                      onChange={(e) => setEditForm({ ...editForm, state: e.target.value })}
                      className="text-xs p-2.5 bg-white border border-neutral-200 rounded-lg text-neutral-900 focus:outline-none focus:ring-1 focus:ring-neutral-900"
                    />
                    <input
                      type="text"
                      placeholder="ZIP Code"
                      value={editForm.zipCode || ''}
                      onChange={(e) => setEditForm({ ...editForm, zipCode: e.target.value })}
                      className="text-xs p-2.5 bg-white border border-neutral-200 rounded-lg text-neutral-900 focus:outline-none focus:ring-1 focus:ring-neutral-900"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-neutral-800 mb-1">Service Area / Neighborhoods</label>
                  <input
                    type="text"
                    value={editForm.serviceArea || ''}
                    onChange={(e) => setEditForm({ ...editForm, serviceArea: e.target.value })}
                    placeholder="e.g. Downtown, Capitol Hill, Greater Seattle"
                    className="w-full text-xs p-2.5 bg-white border border-neutral-200 rounded-lg text-neutral-900 focus:outline-none focus:ring-1 focus:ring-neutral-900"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-xs font-semibold text-neutral-800">Public Business Phone</label>
                    <span className="text-[10px] text-neutral-400">Used for public CONTACT button (CALL)</span>
                  </div>
                  <input
                    type="text"
                    value={editForm.phone || ''}
                    onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
                    placeholder="(206) 555-0199"
                    className="w-full text-xs p-2.5 bg-white border border-neutral-200 rounded-lg text-neutral-900 focus:outline-none focus:ring-1 focus:ring-neutral-900"
                  />
                  <p className="text-[11px] text-neutral-500 mt-1">
                    Separate from private account phone. Only this public phone is dialed when consumers click CONTACT.
                  </p>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-xs font-semibold text-neutral-800">Public Business Email</label>
                    <span className="text-[10px] text-neutral-400">Used for public CONTACT button (EMAIL)</span>
                  </div>
                  <input
                    type="email"
                    value={editForm.email || ''}
                    onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                    placeholder="contact@yourbusiness.com"
                    className="w-full text-xs p-2.5 bg-white border border-neutral-200 rounded-lg text-neutral-900 focus:outline-none focus:ring-1 focus:ring-neutral-900"
                  />
                  <p className="text-[11px] text-neutral-500 mt-1">
                    Separate from private login email. Only this address receives inquiries when consumers click CONTACT.
                  </p>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-neutral-800 mb-1">Website URL</label>
                  <input
                    type="text"
                    value={editForm.website || ''}
                    onChange={(e) => setEditForm({ ...editForm, website: e.target.value })}
                    placeholder="https://yourbusiness.com"
                    className="w-full text-xs p-2.5 bg-white border border-neutral-200 rounded-lg text-neutral-900 focus:outline-none focus:ring-1 focus:ring-neutral-900"
                  />
                </div>
              </div>

              {/* Keywords & Tags Section (Anti-Pill & Deduplication enforcement) */}
              <div className="pt-4 border-t border-neutral-100 space-y-4">
                <div>
                  <h4 className="text-xs font-semibold text-neutral-800 font-display">
                    Search Keywords & Service Tags
                  </h4>
                  <p className="text-[11px] text-neutral-500 mt-0.5">
                    Select suggested keywords for your category or add custom keywords. Tags are normalized and deduplicated.
                  </p>
                </div>

                {/* Suggested Category Keywords */}
                {currentCategory && currentCategory.suggestedKeywords && (
                  <div className="space-y-1.5">
                    <span className="text-[11px] font-medium text-neutral-600">
                      Suggested for {currentCategory.name}:
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                      {currentCategory.suggestedKeywords.map((kw) => {
                        const isSelected = currentKeywords.includes(normalizeKeyword(kw));
                        return (
                          <button
                            key={kw}
                            type="button"
                            onClick={() => handleToggleSuggestedKeyword(kw)}
                            className={`py-1 px-2.5 text-xs rounded border transition-colors ${
                              isSelected
                                ? 'bg-neutral-900 border-neutral-900 text-white font-medium'
                                : 'bg-neutral-50 border-neutral-200 text-neutral-700 hover:bg-neutral-100'
                            }`}
                          >
                            {isSelected ? '✓ ' : '+ '}
                            {kw}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Custom Tag Input */}
                <div className="space-y-1.5">
                  <span className="text-[11px] font-medium text-neutral-600">Add Custom Tag:</span>
                  <div className="flex items-center gap-2 max-w-md">
                    <input
                      type="text"
                      value={customTagInput}
                      onChange={(e) => setCustomTagInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleAddCustomTag();
                        }
                      }}
                      placeholder="e.g. dog walking, oil change..."
                      className="flex-1 text-xs p-2 bg-white border border-neutral-200 rounded-lg text-neutral-900"
                    />
                    <button
                      type="button"
                      onClick={handleAddCustomTag}
                      className="py-2 px-3 text-xs font-semibold text-neutral-800 bg-neutral-100 hover:bg-neutral-200 rounded-lg transition-colors"
                    >
                      Add Tag
                    </button>
                  </div>
                  {tagError && <p className="text-[11px] text-red-600">{tagError}</p>}
                </div>

                {/* Selected Keywords List */}
                <div className="pt-2">
                  <span className="text-[11px] font-medium text-neutral-600 block mb-1">
                    Currently Selected Keywords ({currentKeywords.length}):
                  </span>
                  <div className="flex flex-wrap gap-2 text-xs">
                    {currentKeywords.map((kw) => (
                      <span
                        key={kw}
                        className="inline-flex items-center gap-1.5 py-1 px-2.5 bg-neutral-100 border border-neutral-200 rounded text-neutral-800"
                      >
                        #{kw}
                        <button
                          type="button"
                          onClick={() => handleRemoveKeyword(kw)}
                          className="text-neutral-400 hover:text-neutral-800 font-bold"
                        >
                          ×
                        </button>
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              {/* Category-Specific Section: Restaurant Menu Photo Requirement */}
              {editForm.category === 'restaurants-food' && (
                <div className="pt-4 border-t border-neutral-100 space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="text-xs font-semibold text-neutral-800 font-display flex items-center gap-1.5">
                        <Utensils className="w-3.5 h-3.5 text-neutral-700" />
                        Restaurant Menu (Publication Requirement)
                      </h4>
                      <p className="text-[11px] text-neutral-500 mt-0.5">
                        Restaurants and Food listings require at least one menu photo or menu file before publication.
                      </p>
                    </div>
                    {(!editForm.menuPhotos || editForm.menuPhotos.length === 0) && !editForm.menuFileUrl && (
                      <span className="text-[11px] text-amber-700 font-medium bg-amber-50 border border-amber-200 px-2 py-0.5 rounded">
                        Menu required to publish
                      </span>
                    )}
                  </div>

                  <div className="space-y-2">
                    <label className="block text-[11px] font-medium text-neutral-700">
                      Menu Photos / Scanned Cards
                    </label>
                    <div className="flex items-center gap-3 overflow-x-auto pb-2">
                      {(editForm.menuPhotos || []).map((mPhoto, idx) => (
                        <div key={idx} className="relative w-20 h-28 rounded-lg overflow-hidden border border-neutral-200 shrink-0">
                          <img src={mPhoto} alt={`Menu ${idx}`} className="w-full h-full object-cover" />
                          <button
                            type="button"
                            onClick={() => {
                              const filtered = (editForm.menuPhotos || []).filter((_, i) => i !== idx);
                              setEditForm({ ...editForm, menuPhotos: filtered });
                            }}
                            className="absolute top-1 right-1 p-1 bg-black/60 text-white rounded hover:bg-black"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      ))}

                      {/* Sample default menu adder */}
                      <button
                        type="button"
                        onClick={() => {
                          const existingPhotos = editForm.menuPhotos || [];
                          setEditForm({
                            ...editForm,
                            menuPhotos: [...existingPhotos, '/src/assets/images/seeker_restaurant_menu_1791171631325.jpg'],
                          });
                        }}
                        className="w-20 h-28 border-2 border-dashed border-neutral-300 hover:border-neutral-900 rounded-lg flex flex-col items-center justify-center text-neutral-500 hover:text-neutral-900 shrink-0 text-center p-2 transition-colors"
                      >
                        <Plus className="w-4 h-4 mb-1" />
                        <span className="text-[10px]">Add Menu Photo</span>
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Structured Menu Items (For Restaurants / Food) */}
              {editForm.category === 'restaurants-food' && (
                <div className="pt-4 border-t border-neutral-100 space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="text-xs font-semibold text-neutral-800 font-display">
                        Menu Items & Dishes
                      </h4>
                      <p className="text-[11px] text-neutral-500 mt-0.5">
                        Add structured menu items with course category, descriptions, and prices.
                      </p>
                    </div>
                  </div>

                  {/* List of current menu items */}
                  {editForm.menuItems && editForm.menuItems.length > 0 && (
                    <div className="divide-y divide-neutral-100 border border-neutral-200 rounded-lg overflow-hidden bg-neutral-50/50">
                      {editForm.menuItems.map((item) => (
                        <div key={item.id} className="p-3 flex items-start justify-between gap-4 text-xs bg-white">
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-semibold text-neutral-900">{item.name}</span>
                              {item.category && (
                                <span className="text-[10px] bg-neutral-100 text-neutral-600 px-1.5 py-0.5 rounded font-mono">
                                  {item.category}
                                </span>
                              )}
                            </div>
                            <p className="text-neutral-500 text-[11px] mt-0.5">{item.description}</p>
                          </div>
                          <div className="flex items-center gap-3 shrink-0">
                            <span className="font-mono font-medium text-neutral-900">{item.price}</span>
                            <button
                              type="button"
                              onClick={() => handleRemoveMenuItem(item.id)}
                              className="text-neutral-400 hover:text-red-600 p-1"
                              title="Delete item"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Add Menu Item form */}
                  <div className="p-3.5 bg-neutral-50 border border-neutral-200 rounded-lg space-y-3">
                    <span className="text-xs font-semibold text-neutral-800 block">Add Menu Item</span>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                      <input
                        type="text"
                        value={newMenuName}
                        onChange={(e) => setNewMenuName(e.target.value)}
                        placeholder="Item name (e.g. Truffle Gnocchi)"
                        className="text-xs p-2 bg-white border border-neutral-200 rounded-lg text-neutral-900"
                      />
                      <input
                        type="text"
                        value={newMenuPrice}
                        onChange={(e) => setNewMenuPrice(e.target.value)}
                        placeholder="Price (e.g. $24.00)"
                        className="text-xs p-2 bg-white border border-neutral-200 rounded-lg text-neutral-900"
                      />
                      <input
                        type="text"
                        value={newMenuCategory}
                        onChange={(e) => setNewMenuCategory(e.target.value)}
                        placeholder="Section (e.g. Pasta, Starters)"
                        className="text-xs p-2 bg-white border border-neutral-200 rounded-lg text-neutral-900"
                      />
                      <div className="sm:col-span-3 flex gap-2">
                        <input
                          type="text"
                          value={newMenuDesc}
                          onChange={(e) => setNewMenuDesc(e.target.value)}
                          placeholder="Brief description & ingredients..."
                          className="flex-1 text-xs p-2 bg-white border border-neutral-200 rounded-lg text-neutral-900"
                        />
                        <button
                          type="button"
                          onClick={handleAddMenuItem}
                          className="py-2 px-3 text-xs font-semibold text-neutral-800 bg-white border border-neutral-200 rounded-lg hover:bg-neutral-100 transition-colors shrink-0"
                        >
                          Add Dish
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Services & Offerings (Automotive, Home Repair, Pet Services, etc.) */}
              <div className="pt-4 border-t border-neutral-100 space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-xs font-semibold text-neutral-800 font-display flex items-center gap-1.5">
                      <Wrench className="w-3.5 h-3.5 text-neutral-700" />
                      Services, Products & Specializations
                    </h4>
                    <p className="text-[11px] text-neutral-500 mt-0.5">
                      List mechanic work, repairs, dog walking, painting, or core service packages with optional pricing.
                    </p>
                  </div>
                </div>

                {/* Existing services */}
                {editForm.services && editForm.services.length > 0 && (
                  <div className="divide-y divide-neutral-100 border border-neutral-200 rounded-lg overflow-hidden bg-neutral-50/50">
                    {editForm.services.map((svc) => (
                      <div key={svc.id} className="p-3 flex items-start justify-between gap-4 text-xs bg-white">
                        <div>
                          <span className="font-semibold text-neutral-900">{svc.name}</span>
                          <p className="text-neutral-500 text-[11px] mt-0.5">{svc.description}</p>
                        </div>
                        <div className="flex items-center gap-3 shrink-0">
                          {svc.price && <span className="font-mono font-medium text-neutral-900">{svc.price}</span>}
                          <button
                            type="button"
                            onClick={() => handleRemoveService(svc.id)}
                            className="text-neutral-400 hover:text-red-600 p-1"
                            title="Delete service"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Add Service form */}
                <div className="p-3.5 bg-neutral-50 border border-neutral-200 rounded-lg space-y-3">
                  <span className="text-xs font-semibold text-neutral-800 block">Add Service or Product</span>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <input
                      type="text"
                      value={newServiceName}
                      onChange={(e) => setNewServiceName(e.target.value)}
                      placeholder="Service name (e.g. Brake Replacement)"
                      className="text-xs p-2 bg-white border border-neutral-200 rounded-lg text-neutral-900 sm:col-span-2"
                    />
                    <input
                      type="text"
                      value={newServicePrice}
                      onChange={(e) => setNewServicePrice(e.target.value)}
                      placeholder="Price / Rate (e.g. $85/hr or $120)"
                      className="text-xs p-2 bg-white border border-neutral-200 rounded-lg text-neutral-900"
                    />
                    <div className="sm:col-span-3 flex gap-2">
                      <input
                        type="text"
                        value={newServiceDesc}
                        onChange={(e) => setNewServiceDesc(e.target.value)}
                        placeholder="Brief scope, inclusions, or timeline..."
                        className="flex-1 text-xs p-2 bg-white border border-neutral-200 rounded-lg text-neutral-900"
                      />
                      <button
                        type="button"
                        onClick={handleAddService}
                        className="py-2 px-3 text-xs font-semibold text-neutral-800 bg-white border border-neutral-200 rounded-lg hover:bg-neutral-100 transition-colors shrink-0"
                      >
                        Add Service
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Operating Hours Editor */}
              <div className="pt-4 border-t border-neutral-100 space-y-4">
                <div>
                  <h4 className="text-xs font-semibold text-neutral-800 font-display flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 text-neutral-700" />
                    Operating Hours
                  </h4>
                  <p className="text-[11px] text-neutral-500 mt-0.5">
                    Update daily schedules for customer discovery (e.g. "9:00 AM – 5:00 PM" or "Closed").
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  {['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'].map((day) => {
                    const currentHours = editForm.hours || ({} as any);
                    return (
                      <div key={day} className="flex items-center justify-between gap-3 p-2 bg-neutral-50 rounded-lg border border-neutral-200">
                        <span className="capitalize font-medium text-neutral-700 w-24">{day}</span>
                        <input
                          type="text"
                          value={(currentHours as any)[day] || ''}
                          onChange={(e) => {
                            setEditForm({
                              ...editForm,
                              hours: {
                                ...currentHours,
                                [day]: e.target.value,
                              } as any,
                            });
                          }}
                          placeholder="e.g. 9:00 AM – 5:00 PM"
                          className="flex-1 text-xs p-1.5 bg-white border border-neutral-200 rounded text-neutral-900 font-mono"
                        />
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Photo Gallery Manager */}
              <div className="pt-4 border-t border-neutral-100 space-y-4">
                <div>
                  <h4 className="text-xs font-semibold text-neutral-800 font-display">
                    Business Photos & Showroom
                  </h4>
                  <p className="text-[11px] text-neutral-500 mt-0.5">
                    Images displayed on your directory profile and searchable cards. Upload directly from your device library, camera, or file picker.
                  </p>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {(editForm.photos || []).map((ph, idx) => (
                    <div key={idx} className="relative aspect-16/9 rounded-lg overflow-hidden border border-neutral-200 group bg-neutral-100">
                      <img src={ph} alt={`Photo ${idx}`} className="w-full h-full object-cover" />
                      <button
                        type="button"
                        onClick={() => handleRemovePhoto(idx)}
                        className="absolute top-1.5 right-1.5 p-1 bg-black/60 text-white rounded hover:bg-black transition-colors"
                        title="Remove photo"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>

                {/* Direct Device Photo Upload with Preview */}
                <input
                  type="file"
                  ref={showroomFileInputRef}
                  accept="image/*"
                  onChange={handleShowroomFileSelect}
                  className="hidden"
                />

                {showroomPhotoPreview ? (
                  <div className="p-3 bg-neutral-50 border border-neutral-200 rounded-xl space-y-3 max-w-md">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-neutral-800">Photo Preview</span>
                      <span className="text-[10px] text-neutral-500">Ready to save</span>
                    </div>
                    <div className="aspect-16/9 rounded-lg overflow-hidden bg-neutral-200 border border-neutral-300 max-h-48">
                      <img src={showroomPhotoPreview} alt="Selected preview" className="w-full h-full object-cover" />
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={handleConfirmAddPhoto}
                        className="py-2 px-3 text-xs font-semibold text-white bg-neutral-900 hover:bg-neutral-800 rounded-lg transition-colors flex items-center gap-1.5"
                      >
                        <Check className="w-3.5 h-3.5" />
                        <span>Add Photo to Showroom</span>
                      </button>
                      <button
                        type="button"
                        onClick={handleCancelPhotoPreview}
                        className="py-2 px-3 text-xs font-medium text-neutral-600 hover:text-neutral-800 rounded-lg transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="pt-1">
                    <button
                      type="button"
                      onClick={() => showroomFileInputRef.current?.click()}
                      className="inline-flex items-center gap-2 py-2 px-3.5 text-xs font-semibold text-neutral-800 bg-neutral-100 hover:bg-neutral-200 border border-neutral-300 rounded-lg transition-colors"
                    >
                      <Upload className="w-3.5 h-3.5" />
                      <span>Upload Photo from Device</span>
                    </button>
                    <p className="text-[11px] text-neutral-400 mt-1">
                      Choose a photo from your photo library or camera on mobile/tablet, or select a file from your computer.
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 2: PROMOTIONAL FLYER STUDIO */}
          {activeTab === 'flyer' && (
            <FlyerBuilder
              business={selectedBusiness}
              onSaveFlyer={async (flyerData) => {
                const res = await fetch(`/api/businesses/${selectedBusiness.id}/flyer`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify(flyerData),
                });
                if (res.ok) {
                  await onRefreshData();
                }
              }}
            />
          )}

          {/* TAB 3: BUSINESS ADVERTISING FEE & BILLING */}
          {activeTab === 'billing' && (
            <div className="bg-white rounded-xl border border-neutral-200 p-6 space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-neutral-100">
                <div>
                  <h3 className="text-base font-semibold text-neutral-900 font-display">
                    Business Advertising Fee & Manual Renewal
                  </h3>
                  <p className="text-xs text-neutral-500 mt-0.5">
                    Short Stack maintains an initial enrollment fee of $19.99, followed by a $25 renewal fee every 2 months. Manual renewals only (never auto-billed).
                  </p>
                </div>
                <button
                  onClick={() => setShowPaymentModal(true)}
                  className="py-2 px-4 text-xs font-semibold text-white bg-neutral-900 hover:bg-neutral-800 rounded-lg transition-colors flex items-center gap-1.5 shrink-0"
                >
                  <CreditCard className="w-3.5 h-3.5" />
                  <span>
                    {!selectedBusiness.billing?.isInitialSignUpPaid
                      ? 'Manual $19.99 Enrollment Payment'
                      : selectedBusiness.billing?.hasReferralDiscount
                      ? 'Manual $12.50 Renewal (50% Off)'
                      : 'Manual $25 Bimonthly Renewal'}
                  </span>
                </button>
              </div>

              {/* Status Metric Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                <div className="p-4 bg-neutral-50 border border-neutral-200 rounded-lg">
                  <span className="text-[11px] font-medium text-neutral-500 block">Initial Enrollment Fee</span>
                  <span className="text-2xl font-bold font-display text-neutral-900 tabular-nums">
                    ${selectedBusiness.billing?.initialSignUpFee || 19.99}
                  </span>
                  <span className="text-[11px] text-neutral-500 block mt-1">
                    {selectedBusiness.billing?.isInitialSignUpPaid ? '✓ Verified (One-time)' : 'Unpaid (Listing Inactive)'}
                  </span>
                </div>

                <div className="p-4 bg-neutral-50 border border-neutral-200 rounded-lg">
                  <span className="text-[11px] font-medium text-neutral-500 block">Renewal Fee</span>
                  <span className="text-2xl font-bold font-display text-neutral-900 tabular-nums">
                    ${selectedBusiness.billing?.hasReferralDiscount ? '12.50' : `${selectedBusiness.billing?.renewalFee || 25}.00`}
                  </span>
                  <span className="text-[11px] text-neutral-500 block mt-1">
                    {selectedBusiness.billing?.hasReferralDiscount ? '50% referral discount active' : 'Every 2-month period'}
                  </span>
                </div>

                <div className="p-4 bg-neutral-50 border border-neutral-200 rounded-lg">
                  <span className="text-[11px] font-medium text-neutral-500 block">Current Payment Status</span>
                  <span className="text-lg font-bold font-display capitalize text-neutral-900">
                    {selectedBusiness.billing?.status || 'unpaid'}
                  </span>
                  <span className="text-[11px] text-neutral-500 block mt-1 truncate">
                    {selectedBusiness.billing?.receiptNumber
                      ? `Receipt ${selectedBusiness.billing.receiptNumber}`
                      : 'No receipt on file'}
                  </span>
                </div>

                <div className="p-4 bg-neutral-50 border border-neutral-200 rounded-lg">
                  <span className="text-[11px] font-medium text-neutral-500 block">Paid Through / Expiration</span>
                  <span className="text-lg font-bold font-display text-neutral-900">
                    {selectedBusiness.billing?.paidThroughDate
                      ? new Date(selectedBusiness.billing.paidThroughDate).toLocaleDateString()
                      : 'Not active'}
                  </span>
                  <span className="text-[11px] text-neutral-500 block mt-1">
                    {selectedBusiness.billing?.reminderSent
                      ? 'Expiration notice sent'
                      : 'Scheduled before period ends'}
                  </span>
                </div>
              </div>

              {/* Referral Incentive Program Section */}
              <div className="p-4 bg-emerald-50/60 border border-emerald-200 rounded-xl space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <h4 className="text-sm font-bold text-neutral-900 font-display flex items-center gap-2">
                      <Sparkles className="w-4 h-4 text-emerald-600" />
                      <span>Referral Incentive Program (50% Off Renewal)</span>
                    </h4>
                    <p className="text-xs text-neutral-600 mt-1 max-w-xl">
                      When a fellow business signs up with your referral code and completes their $19.99 enrollment, you receive 50% off your next renewal ($12.50 instead of $25.00).
                    </p>
                  </div>
                  {selectedBusiness.billing?.hasReferralDiscount && (
                    <span className="px-3 py-1 bg-emerald-600 text-white font-semibold text-xs rounded-full shrink-0 animate-pulse">
                      50% Discount Ready to Apply!
                    </span>
                  )}
                </div>

                <div className="pt-2 border-t border-emerald-200/60 flex flex-wrap items-center gap-3">
                  <div>
                    <span className="text-[11px] text-neutral-500 block mb-0.5">Your Referral Code:</span>
                    <span className="font-mono text-xs font-bold text-neutral-900 bg-white border border-emerald-300 px-2.5 py-1 rounded">
                      {selectedBusiness.referralCode || selectedBusiness.billing?.referralCode || `REF-${selectedBusiness.id.replace('sk-', '').toUpperCase()}`}
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      const code = selectedBusiness.referralCode || selectedBusiness.billing?.referralCode || `REF-${selectedBusiness.id.replace('sk-', '').toUpperCase()}`;
                      const shareUrl = `${window.location.origin}/?ref=${code}`;
                      navigator.clipboard.writeText(shareUrl);
                      setCopiedReferral(true);
                      setTimeout(() => setCopiedReferral(false), 2500);
                    }}
                    className="inline-flex items-center gap-1.5 py-1.5 px-3 text-xs font-semibold text-neutral-800 bg-white hover:bg-neutral-50 border border-neutral-300 rounded-lg transition-colors mt-auto"
                  >
                    {copiedReferral ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedReferral ? 'Referral Link Copied!' : 'Copy Referral Link'}</span>
                  </button>

                  <span className="text-[11px] text-neutral-500 mt-auto">
                    {selectedBusiness.billing?.referralsCount
                      ? `${selectedBusiness.billing.referralsCount} qualifying referral(s) recorded`
                      : 'Share with neighboring businesses to earn renewal savings'}
                  </span>
                </div>
              </div>

              {/* Policy & Auto-charge Ban Guarantee */}
              <div className="p-4 bg-neutral-50 border border-neutral-200 rounded-lg text-xs space-y-2">
                <h4 className="font-semibold text-neutral-900">Short Stack Guaranteed Protection Policy</h4>
                <ul className="list-disc pl-4 space-y-1 text-neutral-600 text-[11px]">
                  <li>Short Stack will NEVER auto-enroll businesses, auto-renew terms, or automatically charge a payment method.</li>
                  <li>Initial enrollment is $19.99 for a 2-month advertising term.</li>
                  <li>The owner must choose to renew and manually complete each $25 renewal every 2 months (or $12.50 with single qualifying referral discount).</li>
                  <li>Before the term expires, an expiration notice is sent with expiration date and manual renewal action; the notice never triggers an automatic charge.</li>
                  <li>The listing remains publicly visible through its paid-through date. If unpaid at the end of the period, it immediately transitions to <strong>hidden-unpaid</strong>. All content, photos, menu items, services, keywords, flyers, business ID, URL, and QR codes remain preserved.</li>
                  <li>A verified manual renewal immediately restores public visibility for the same listing.</li>
                  <li>Referral discounts do not stack; each qualifying referral applies 50% off to a single renewal ($12.50), after which renewals return to $25.</li>
                  <li>The optional $1 app fee is completely disabled and separate.</li>
                </ul>
              </div>

              {/* Developer / Acceptance Test Simulator Controls */}
              <div className="pt-4 border-t border-neutral-100 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-neutral-900 font-display">
                    Acceptance Test Simulator (Verify Workflow)
                  </span>
                  <span className="text-[11px] font-mono text-neutral-400">Sandbox controls</span>
                </div>
                <p className="text-[11px] text-neutral-500">
                  Quickly test the lifecycle transitions required in Section 14 of the specification without waiting 12 months:
                </p>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => handleSimulateExpiration('expired')}
                    className="py-1.5 px-3 text-xs bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 rounded-lg transition-colors"
                  >
                    Simulate Expiration (Lapsed)
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSimulateExpiration('approaching_notice')}
                    className="py-1.5 px-3 text-xs bg-blue-50 hover:bg-blue-100 text-blue-800 border border-blue-200 rounded-lg transition-colors"
                  >
                    Simulate Notice Window (Reminder Scheduled)
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSimulateExpiration('active')}
                    className="py-1.5 px-3 text-xs bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 rounded-lg transition-colors"
                  >
                    Simulate Active 2-Month Term
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: STAFF ACCESS & PERMISSIONS */}
          {activeTab === 'staff' && (
            <div className="bg-white rounded-xl border border-neutral-200 p-6 space-y-6">
              <div className="flex items-center justify-between pb-4 border-b border-neutral-100">
                <div>
                  <h3 className="text-base font-semibold text-neutral-900 font-display">
                    Staff Delegation & Permissions
                  </h3>
                  <p className="text-xs text-neutral-500 mt-0.5">
                    Invite team members to assist with updating menu, photos, hours, or flyers. Billing and ownership remain restricted to the owner.
                  </p>
                </div>
              </div>

              {/* Current Staff List */}
              <div className="space-y-3">
                <h4 className="text-xs font-semibold text-neutral-800">Assigned Staff Members</h4>
                {selectedBusiness.staff && selectedBusiness.staff.length > 0 ? (
                  <div className="divide-y divide-neutral-100 border border-neutral-200 rounded-lg overflow-hidden">
                    {selectedBusiness.staff.map((s) => (
                      <div key={s.id} className="p-3.5 flex items-center justify-between text-xs bg-white">
                        <div>
                          <p className="font-semibold text-neutral-900">{s.name}</p>
                          <p className="text-neutral-500">{s.email}</p>
                          <div className="flex flex-wrap gap-1 mt-1.5">
                            {s.permissions.map((p) => (
                              <span key={p} className="text-[10px] bg-neutral-100 text-neutral-700 px-2 py-0.5 rounded font-mono">
                                {p}
                              </span>
                            ))}
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={async () => {
                            await fetch(`/api/businesses/${selectedBusiness.id}/staff/${s.id}`, {
                              method: 'DELETE',
                            });
                            await onRefreshData();
                          }}
                          className="p-1.5 text-neutral-400 hover:text-red-600 transition-colors"
                          title="Revoke access"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-neutral-500 bg-neutral-50 p-4 rounded-lg border border-neutral-200">
                    No staff members invited yet. Use the invite form below to grant access to an employee.
                  </p>
                )}
              </div>

              {/* Invite Staff Form */}
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  const form = e.target as HTMLFormElement;
                  const email = (form.elements.namedItem('email') as HTMLInputElement).value;
                  const name = (form.elements.namedItem('name') as HTMLInputElement).value;
                  const checkedPerms: StaffPermission[] = [];
                  ['edit_profile', 'edit_photos', 'edit_menu', 'edit_services', 'edit_flyer'].forEach((p) => {
                    const el = form.elements.namedItem(p) as HTMLInputElement;
                    if (el && el.checked) checkedPerms.push(p as StaffPermission);
                  });

                  if (!email || checkedPerms.length === 0) {
                    setErrorMessage('Please enter staff email and select at least one permission.');
                    setTimeout(() => setErrorMessage(null), 5000);
                    return;
                  }

                  const res = await fetch(`/api/businesses/${selectedBusiness.id}/staff`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email, name, permissions: checkedPerms }),
                  });

                  if (res.ok) {
                    form.reset();
                    await onRefreshData();
                    setActionMessage(`Invited ${email} with granted editing privileges.`);
                    setTimeout(() => setActionMessage(null), 3000);
                  }
                }}
                className="pt-4 border-t border-neutral-100 space-y-4"
              >
                <h4 className="text-xs font-semibold text-neutral-800">Invite New Staff Member</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[11px] font-medium text-neutral-700 mb-1">Staff Member Name</label>
                    <input
                      type="text"
                      name="name"
                      placeholder="e.g. Alex Rivera"
                      className="w-full text-xs p-2 bg-white border border-neutral-200 rounded-lg text-neutral-900"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium text-neutral-700 mb-1">Staff Email</label>
                    <input
                      type="email"
                      name="email"
                      required
                      placeholder="alex@bistro.local"
                      className="w-full text-xs p-2 bg-white border border-neutral-200 rounded-lg text-neutral-900"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-medium text-neutral-700 mb-1.5">
                    Granted Permissions (Billing & Ownership are excluded by default)
                  </label>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
                    <label className="flex items-center gap-2">
                      <input type="checkbox" name="edit_profile" defaultChecked className="rounded text-neutral-900" />
                      <span>Edit Business Profile & Hours</span>
                    </label>
                    <label className="flex items-center gap-2">
                      <input type="checkbox" name="edit_menu" defaultChecked className="rounded text-neutral-900" />
                      <span>Edit Restaurant Menu</span>
                    </label>
                    <label className="flex items-center gap-2">
                      <input type="checkbox" name="edit_photos" defaultChecked className="rounded text-neutral-900" />
                      <span>Upload & Edit Photos</span>
                    </label>
                    <label className="flex items-center gap-2">
                      <input type="checkbox" name="edit_services" defaultChecked className="rounded text-neutral-900" />
                      <span>Manage Services / Pricing</span>
                    </label>
                    <label className="flex items-center gap-2">
                      <input type="checkbox" name="edit_flyer" defaultChecked className="rounded text-neutral-900" />
                      <span>Manage Promotional Flyer</span>
                    </label>
                  </div>
                </div>

                <div className="pt-2">
                  <button
                    type="submit"
                    className="py-2 px-4 text-xs font-semibold text-white bg-neutral-900 hover:bg-neutral-800 rounded-lg transition-colors"
                  >
                    Grant Staff Permissions
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* TAB 5: CUSTOMER REVIEWS & RATINGS */}
          {activeTab === 'reviews' && (
            <div className="bg-white rounded-xl border border-neutral-200 p-6 space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-neutral-100">
                <div>
                  <div className="flex items-center gap-2">
                    <MessageSquare className="w-5 h-5 text-neutral-800" />
                    <h3 className="text-base font-semibold text-neutral-900 font-display">
                      Customer Reviews & Automatic Ratings
                    </h3>
                  </div>
                  <p className="text-xs text-neutral-500 mt-0.5">
                    Reviews submitted by customers on your public profile. Ratings are computed automatically.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => onOpenProfile(selectedBusiness.id)}
                  className="py-1.5 px-3 text-xs font-semibold text-neutral-800 bg-neutral-100 hover:bg-neutral-200 rounded-lg transition-colors flex items-center gap-1.5 shrink-0"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span>View Public Profile</span>
                </button>
              </div>

              {/* Automatic Rating Calculation Overview */}
              <div className="p-4 bg-neutral-50 rounded-xl border border-neutral-200 flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                  {selectedBusiness.ratingCount && selectedBusiness.ratingCount > 0 && selectedBusiness.averageRating ? (
                    <>
                      <div className="text-3xl font-bold font-display text-neutral-900">
                        {selectedBusiness.averageRating.toFixed(1)}
                      </div>
                      <div>
                        <div className="flex items-center text-amber-500">
                          {[1, 2, 3, 4, 5].map((s) => (
                            <Star
                              key={s}
                              className={`w-4 h-4 ${
                                s <= Math.round(selectedBusiness.averageRating!)
                                  ? 'fill-amber-400 text-amber-400'
                                  : 'text-neutral-300'
                              }`}
                            />
                          ))}
                        </div>
                        <span className="text-xs text-neutral-600 font-medium">
                          {selectedBusiness.ratingCount} published {selectedBusiness.ratingCount === 1 ? 'rating' : 'ratings'}
                        </span>
                      </div>
                    </>
                  ) : (
                    <div className="flex items-center gap-2 text-neutral-500 text-sm">
                      <Star className="w-5 h-5 text-neutral-300" />
                      <span className="italic">No reviews yet</span>
                    </div>
                  )}
                </div>

                {/* Rating Integrity Notice */}
                <div className="text-[11px] text-neutral-500 bg-white p-3 rounded-lg border border-neutral-200 max-w-md">
                  <span className="font-semibold text-neutral-800 block mb-0.5">Rating Integrity Policy</span>
                  Displayed ratings and counts are calculated automatically from published customer star ratings. Business owners do not have controls to set, edit, or inflate ratings. You may flag a review for administrator investigation, but cannot alter or delete customer reviews.
                </div>
              </div>

              {/* Reviews List */}
              <div className="space-y-4">
                <div className="flex items-center justify-between text-xs text-neutral-500 pb-2 border-b border-neutral-100">
                  <span className="font-semibold text-neutral-900 font-display">
                    Published Customer Submissions ({ownerReviews.length})
                  </span>
                  <span className="text-[11px]">Sorted newest first</span>
                </div>

                {isLoadingOwnerReviews ? (
                  <div className="py-8 text-center text-xs text-neutral-500">
                    Loading customer reviews...
                  </div>
                ) : ownerReviews.length === 0 ? (
                  <div className="py-10 text-center bg-neutral-50 rounded-xl border border-neutral-100 p-6 space-y-2">
                    <Star className="w-8 h-8 text-neutral-300 mx-auto" />
                    <h4 className="text-sm font-semibold text-neutral-800">No reviews yet</h4>
                    <p className="text-xs text-neutral-500 max-w-sm mx-auto">
                      Customer reviews and ratings submitted on your public profile will appear here automatically.
                    </p>
                  </div>
                ) : (
                  <div className="divide-y divide-neutral-100">
                    {ownerReviews.map((rev) => (
                      <div key={rev.id} className="py-4 space-y-2">
                        <div className="flex items-start justify-between gap-4">
                          <div className="space-y-1">
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

                            {rev.comment && (
                              <p className="text-xs sm:text-sm text-neutral-700 leading-relaxed">
                                {rev.comment}
                              </p>
                            )}
                          </div>

                          <div className="shrink-0">
                            {rev.flaggedByOwner ? (
                              <span className="text-[10px] px-2 py-1 bg-amber-50 text-amber-800 rounded font-medium flex items-center gap-1 border border-amber-200">
                                <Flag className="w-3 h-3 text-amber-600" />
                                <span>Flagged for Admin Review</span>
                              </span>
                            ) : (
                              <button
                                type="button"
                                onClick={() => {
                                  setFlagModalReviewId(rev.id);
                                  setFlagReasonText('');
                                }}
                                className="py-1 px-2.5 text-xs text-neutral-500 hover:text-neutral-800 hover:bg-neutral-100 rounded-md transition-colors flex items-center gap-1 border border-neutral-200"
                                title="Flag for administrator review"
                              >
                                <Flag className="w-3 h-3" />
                                <span>Flag for Admin</span>
                              </button>
                            )}
                          </div>
                        </div>

                        {rev.flagReason && (
                          <div className="text-[11px] text-amber-800 bg-amber-50/70 rounded p-2 border border-amber-100">
                            <strong>Flagged reason:</strong> {rev.flagReason}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </>
      )}

      {/* Flag Review Modal for Owner */}
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
              Business owners cannot alter or delete customer reviews directly. If this review violates Short Stack guidelines (e.g., spam, abusive language, non-customer competitor attack), please provide the reason below. App administrators will review and take moderation action.
            </p>

            <div>
              <label className="block text-xs font-medium text-neutral-700 mb-1">Reason for Flagging *</label>
              <textarea
                value={flagReasonText}
                onChange={(e) => setFlagReasonText(e.target.value)}
                placeholder="Explain why this review should be investigated by administrators..."
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
                onClick={handleOwnerFlagReview}
                disabled={isFlagging}
                className="py-1.5 px-4 text-xs font-semibold text-white bg-neutral-900 hover:bg-neutral-800 rounded-lg transition-colors disabled:opacity-50"
              >
                {isFlagging ? 'Submitting...' : 'Submit Flag'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modals */}
      {selectedBusiness && (
        <>
          <QRCodeModal
            url={profileUrl}
            title={selectedBusiness.name}
            businessId={selectedBusiness.id}
            isOpen={showQRModal}
            onClose={() => setShowQRModal(false)}
          />

          <PaymentModal
            business={selectedBusiness}
            isOpen={showPaymentModal}
            onClose={() => setShowPaymentModal(false)}
            onPaymentSuccess={async () => {
              await onRefreshData();
            }}
          />
        </>
      )}
    </div>
  );
};
