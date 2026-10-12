import React, { useState } from 'react';
import {
  Business,
  Category,
  PlacePrediction,
  MenuItem,
  ServiceItem,
  BusinessHours,
} from '../types/pipsqueak.ts';
import { LocationAutocomplete } from './LocationAutocomplete.tsx';
import { normalizeKeyword, deduplicateKeywords } from '../utils/formatters.ts';
import {
  Store,
  MapPin,
  Clock,
  Phone,
  Mail,
  Globe,
  Utensils,
  Wrench,
  Camera,
  Plus,
  Trash2,
  AlertCircle,
  CheckCircle2,
  ChevronLeft,
  DollarSign,
  FileText,
  Shield,
  HelpCircle,
  ExternalLink,
  Upload,
} from 'lucide-react';

interface BusinessProfileFormProps {
  initialBusiness?: Partial<Business> | null;
  categories: Category[];
  ownerId: string;
  ownerEmail: string;
  onSave: (businessData: Partial<Business>) => Promise<Business | null>;
  onCancel: () => void;
  onProceedToPayment?: (savedBusiness: Business) => void;
}

export const BusinessProfileForm: React.FC<BusinessProfileFormProps> = ({
  initialBusiness,
  categories,
  ownerId,
  ownerEmail,
  onSave,
  onCancel,
  onProceedToPayment,
}) => {
  // Safe default initialization
  const isEditing = Boolean(initialBusiness?.id);

  const [name, setName] = useState(initialBusiness?.name ?? '');
  const [entityType, setEntityType] = useState<'Sole Proprietor' | 'LLC' | 'Corporation' | 'Partnership' | 'Other'>(
    (initialBusiness?.entityType as any) ?? 'Sole Proprietor'
  );
  const [category, setCategory] = useState(initialBusiness?.category ?? categories[0]?.id ?? 'restaurants-food');
  const [customCategory, setCustomCategory] = useState(initialBusiness?.customCategory ?? '');
  const [subcategory, setSubcategory] = useState(initialBusiness?.subcategory ?? '');
  const [customSubcategory, setCustomSubcategory] = useState(initialBusiness?.customSubcategory ?? '');
  const [shortDescription, setShortDescription] = useState(initialBusiness?.shortDescription ?? '');
  const [logoUrl, setLogoUrl] = useState(initialBusiness?.logoUrl ?? '');
  const [photos, setPhotos] = useState<string[]>(initialBusiness?.photos ?? []);
  const [newPhotoInput, setNewPhotoInput] = useState('');
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement | null>(null);
  const [referredByCode, setReferredByCode] = useState(initialBusiness?.referredBy || '');

  // Location / Service Area
  const [isServiceAreaOnly, setIsServiceAreaOnly] = useState(initialBusiness?.isServiceAreaOnly ?? false);
  const [address, setAddress] = useState(initialBusiness?.address ?? '');
  const [city, setCity] = useState(initialBusiness?.city ?? '');
  const [state, setState] = useState(initialBusiness?.state ?? 'WA');
  const [zipCode, setZipCode] = useState(initialBusiness?.zipCode ?? '');
  const [serviceArea, setServiceArea] = useState(initialBusiness?.serviceArea ?? '');

  // Contact
  const [phone, setPhone] = useState(initialBusiness?.phone ?? '');
  const [email, setEmail] = useState(initialBusiness?.email ?? ownerEmail ?? '');
  const [website, setWebsite] = useState(initialBusiness?.website ?? '');
  const [orderOnlineUrl, setOrderOnlineUrl] = useState(initialBusiness?.orderOnlineUrl ?? '');
  const [bookingUrl, setBookingUrl] = useState(initialBusiness?.bookingUrl ?? '');
  const [directionsUrl, setDirectionsUrl] = useState(initialBusiness?.directionsUrl ?? '');

  // Hours
  const defaultHours: BusinessHours = {
    monday: '9:00 AM – 5:00 PM',
    tuesday: '9:00 AM – 5:00 PM',
    wednesday: '9:00 AM – 5:00 PM',
    thursday: '9:00 AM – 5:00 PM',
    friday: '9:00 AM – 5:00 PM',
    saturday: '10:00 AM – 4:00 PM',
    sunday: 'Closed',
  };
  const [hours, setHours] = useState<BusinessHours>(initialBusiness?.hours ?? defaultHours);

  // Business Details (Informational only, non-blocking)
  const [ein, setEin] = useState(initialBusiness?.ein ?? '');
  const [hasInsurance, setHasInsurance] = useState(initialBusiness?.hasInsurance ?? false);
  const [insuranceDetails, setInsuranceDetails] = useState(initialBusiness?.insuranceDetails ?? '');

  // Keywords
  const [keywords, setKeywords] = useState<string[]>(initialBusiness?.keywords ?? []);
  const [customKeywordInput, setCustomKeywordInput] = useState('');
  const [keywordError, setKeywordError] = useState<string | null>(null);

  // Category search filter
  const [categorySearchQuery, setCategorySearchQuery] = useState('');

  // Category-specific items
  const [menuPhotos, setMenuPhotos] = useState<string[]>(initialBusiness?.menuPhotos ?? []);
  const [newMenuPhotoInput, setNewMenuPhotoInput] = useState('');
  const [menuItems, setMenuItems] = useState<MenuItem[]>(initialBusiness?.menuItems ?? []);
  const [services, setServices] = useState<ServiceItem[]>(initialBusiness?.services ?? []);

  // Item builder fields
  const [itemTitle, setItemTitle] = useState('');
  const [itemDesc, setItemDesc] = useState('');
  const [itemPrice, setItemPrice] = useState('');

  // UI state
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const availableCategories: Category[] = categories.some((c) => c.id === 'other')
    ? categories
    : [
        ...categories,
        {
          id: 'other',
          name: 'Other / Not Listed',
          description: 'Custom, specialized, or unique independent small business.',
          suggestedKeywords: ['specialty service', 'independent business', 'local specialist'],
          requiresMenu: false,
          isCustom: true,
        },
      ];

  const selectedCategoryObj = availableCategories.find((c) => c.id === category);
  const isOtherCategory = category === 'other';
  const isRestaurant = category === 'restaurants-food' || category === 'catering';

  // Filtered categories for category selector
  const filteredCategories = availableCategories.filter((c) => {
    if (c.id === 'other') return true; // Always allow Other / Not Listed
    if (!categorySearchQuery.trim()) return true;
    const q = categorySearchQuery.toLowerCase();
    return c.name.toLowerCase().includes(q) || c.description.toLowerCase().includes(q);
  });

  // Handle Autocomplete prediction
  const handleSelectPrediction = (p: PlacePrediction) => {
    if (p.streetAddress) setAddress(p.streetAddress);
    if (p.city) setCity(p.city);
    if (p.state) setState(p.state);
    if (p.zipCode) setZipCode(p.zipCode);
  };

  // Keyword manipulation
  const handleToggleSuggestedKeyword = (kw: string) => {
    const norm = normalizeKeyword(kw);
    if (keywords.includes(norm)) {
      setKeywords(keywords.filter((k) => k !== norm));
    } else {
      setKeywords(deduplicateKeywords([...keywords, norm]));
    }
  };

  const handleAddCustomKeyword = () => {
    setKeywordError(null);
    const norm = normalizeKeyword(customKeywordInput);
    if (!norm) return;
    if (keywords.includes(norm)) {
      setKeywordError(`Tag "${norm}" is already added.`);
      return;
    }
    setKeywords(deduplicateKeywords([...keywords, norm]));
    setCustomKeywordInput('');
  };

  const handleRemoveKeyword = (kw: string) => {
    setKeywords(keywords.filter((k) => k !== kw));
  };

  // Hours manipulation
  const handleHourChange = (day: keyof BusinessHours, value: string) => {
    setHours({ ...hours, [day]: value });
  };

  const handleToggleDayClosed = (day: keyof BusinessHours) => {
    setHours({
      ...hours,
      [day]: hours[day] === 'Closed' ? '9:00 AM – 5:00 PM' : 'Closed',
    });
  };

  // Item manipulation (menu item or service)
  const handleAddItem = () => {
    if (!itemTitle.trim()) return;
    if (isRestaurant) {
      const newItem: MenuItem = {
        id: `mi-${Date.now()}`,
        name: itemTitle.trim(),
        description: itemDesc.trim(),
        price: itemPrice.trim() || '$0.00',
      };
      setMenuItems([...menuItems, newItem]);
    } else {
      const newSvc: ServiceItem = {
        id: `svc-${Date.now()}`,
        name: itemTitle.trim(),
        description: itemDesc.trim(),
        price: itemPrice.trim() || undefined,
      };
      setServices([...services, newSvc]);
    }
    setItemTitle('');
    setItemDesc('');
    setItemPrice('');
  };

  const handleRemoveItem = (id: string) => {
    if (isRestaurant) {
      setMenuItems(menuItems.filter((m) => m.id !== id));
    } else {
      setServices(services.filter((s) => s.id !== id));
    }
  };

  // Photo helpers
  const handleDevicePhotoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setPhotoPreview(reader.result);
      }
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleConfirmAddPhoto = () => {
    if (!photoPreview) return;
    setPhotos([...photos, photoPreview]);
    setPhotoPreview(null);
  };

  const handleCancelPhotoPreview = () => {
    setPhotoPreview(null);
  };

  const handleRemovePhoto = (idx: number) => {
    setPhotos(photos.filter((_, i) => i !== idx));
  };

  const handleAddMenuPhoto = () => {
    if (!newMenuPhotoInput.trim()) return;
    setMenuPhotos([...menuPhotos, newMenuPhotoInput.trim()]);
    setNewMenuPhotoInput('');
  };

  const handleRemoveMenuPhoto = (idx: number) => {
    setMenuPhotos(menuPhotos.filter((_, i) => i !== idx));
  };

  // Submit Handler
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    // Validation
    if (!name.trim()) {
      setErrorMessage('Please enter a business name.');
      return;
    }
    if (isOtherCategory && !customCategory.trim()) {
      setErrorMessage('Please specify your custom business category.');
      return;
    }
    if (!city.trim() && !serviceArea.trim()) {
      setErrorMessage('Please provide a city or service area for local discovery.');
      return;
    }

    setIsSubmitting(true);

    try {
      const payload: Partial<Business> = {
        name: name.trim(),
        entityType,
        category,
        customCategory: isOtherCategory ? customCategory.trim() : undefined,
        subcategory: isOtherCategory ? (customSubcategory.trim() || undefined) : (subcategory.trim() || undefined),
        customSubcategory: isOtherCategory ? (customSubcategory.trim() || undefined) : undefined,
        shortDescription: shortDescription.trim(),
        referredBy: referredByCode.trim() ? referredByCode.trim().toUpperCase() : undefined,
        logoUrl: logoUrl.trim() || undefined,
        photos,
        isServiceAreaOnly,
        address: address.trim(),
        city: city.trim(),
        state: state.trim() || 'WA',
        zipCode: zipCode.trim(),
        serviceArea: serviceArea.trim(),
        phone: phone.trim(),
        email: email.trim() || ownerEmail,
        website: website.trim(),
        orderOnlineUrl: orderOnlineUrl.trim() || undefined,
        bookingUrl: bookingUrl.trim() || undefined,
        directionsUrl: directionsUrl.trim() || undefined,
        hours,
        ein: ein.trim() || undefined,
        hasInsurance,
        insuranceDetails: insuranceDetails.trim() || undefined,
        keywords,
        menuPhotos,
        menuItems,
        services,
        ownerId,
        ownerEmail,
      };

      const result = await onSave(payload);

      if (result) {
        setSuccessMessage('Business profile saved successfully!');
        if (!isEditing && onProceedToPayment) {
          onProceedToPayment(result);
        }
      }
    } catch (err: any) {
      console.error('Failed to save business profile', err);
      setErrorMessage(
        err?.message || "We couldn't create your business profile. Please check your information and try again."
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Top Navigation Bar */}
      <div className="flex items-center justify-between pb-6 mb-6 border-b border-neutral-200">
        <button
          type="button"
          onClick={onCancel}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-neutral-600 hover:text-neutral-900 transition-colors"
        >
          <ChevronLeft className="w-4 h-4" />
          <span>Back to Dashboard</span>
        </button>

        <div className="text-right">
          <span className="text-xs font-mono text-neutral-400">
            {isEditing ? `Listing ID: ${initialBusiness?.id}` : 'New Business Registration'}
          </span>
        </div>
      </div>

      <div className="space-y-2 mb-8">
        <h1 className="text-2xl sm:text-3xl font-bold font-display text-neutral-900 tracking-tight">
          {isEditing ? 'Edit Business Profile' : 'Register Your Business Profile'}
        </h1>
        <p className="text-sm text-neutral-600">
          Complete your business information to establish your permanent profile, discovery keywords, and promotional tools.
        </p>
      </div>

      {errorMessage && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl flex items-center justify-between text-xs text-red-800">
          <div className="flex items-center gap-2.5">
            <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
            <span>{errorMessage}</span>
          </div>
          <button
            type="button"
            onClick={() => setErrorMessage(null)}
            className="text-red-600 hover:text-red-900 font-semibold ml-4"
          >
            Dismiss
          </button>
        </div>
      )}

      {successMessage && (
        <div className="mb-6 p-4 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center gap-2.5 text-xs text-emerald-800">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{successMessage}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-8">
        {/* SECTION 1: BUSINESS INFORMATION */}
        <section className="bg-white rounded-xl border border-neutral-200 p-6 space-y-6">
          <div className="flex items-center gap-2 pb-3 border-b border-neutral-100">
            <Store className="w-5 h-5 text-neutral-900" />
            <h2 className="text-base font-semibold font-display text-neutral-900">
              1. Business Information
            </h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-neutral-700 mb-1">
                Business Name *
              </label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Laurel & Olive Osteria or Precision Mobile Detailing"
                className="w-full text-xs p-2.5 bg-white border border-neutral-200 rounded-lg text-neutral-900 focus:outline-none focus:ring-1 focus:ring-neutral-900"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-neutral-700 mb-1">
                Business Entity Type
              </label>
              <select
                value={entityType}
                onChange={(e) => setEntityType(e.target.value as any)}
                className="w-full text-xs p-2.5 bg-white border border-neutral-200 rounded-lg text-neutral-900 focus:outline-none focus:ring-1 focus:ring-neutral-900"
              >
                <option value="Sole Proprietor">Sole Proprietor</option>
                <option value="LLC">LLC (Limited Liability Company)</option>
                <option value="Corporation">Corporation (C-Corp / S-Corp)</option>
                <option value="Partnership">Partnership</option>
                <option value="Other">Other Independent Enterprise</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-neutral-700 mb-1">
                Business Logo / Avatar Image URL (Optional)
              </label>
              <input
                type="url"
                value={logoUrl}
                onChange={(e) => setLogoUrl(e.target.value)}
                placeholder="https://example.com/logo.jpg or /images/logo.png"
                className="w-full text-xs p-2.5 bg-white border border-neutral-200 rounded-lg text-neutral-900 focus:outline-none focus:ring-1 focus:ring-neutral-900"
              />
            </div>

            {/* SECTION: FLEXIBLE CATEGORY SELECTION (Build v1.7) */}
            <div className="sm:col-span-2 space-y-3 pt-2 border-t border-neutral-100">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <label className="block text-xs font-medium text-neutral-900">
                    Business Category *
                  </label>
                  <p className="text-[11px] text-neutral-500">
                    Select from standard categories or select "Other / Not Listed" to enter your own.
                  </p>
                </div>
                <input
                  type="text"
                  value={categorySearchQuery}
                  onChange={(e) => setCategorySearchQuery(e.target.value)}
                  placeholder="Filter categories..."
                  className="text-xs p-1.5 px-2.5 bg-neutral-50 border border-neutral-200 rounded-lg w-full sm:w-48 text-neutral-800"
                />
              </div>

              <select
                value={category}
                onChange={(e) => {
                  setCategory(e.target.value);
                  const newCat = categories.find((c) => c.id === e.target.value);
                  if (newCat?.subcategories && newCat.subcategories.length > 0) {
                    setSubcategory(newCat.subcategories[0]);
                  }
                }}
                className="w-full text-xs p-2.5 bg-white border border-neutral-200 rounded-lg text-neutral-900 font-medium focus:outline-none focus:ring-1 focus:ring-neutral-900"
              >
                {filteredCategories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} {c.id === 'other' ? '✨' : ''}
                  </option>
                ))}
              </select>

              {/* Informational callout for other categories */}
              <div className="p-3 bg-neutral-50 border border-neutral-200 rounded-lg text-xs text-neutral-600 flex items-start gap-2">
                <HelpCircle className="w-4 h-4 text-neutral-400 shrink-0 mt-0.5" />
                <span>
                  Don't see your exact business type? Select <strong>Other / Not Listed</strong> and specify your own custom category and service type.
                </span>
              </div>

              {/* IF "OTHER / NOT LISTED" IS SELECTED */}
              {isOtherCategory && (
                <div className="p-4 bg-amber-50/60 border border-amber-200 rounded-xl space-y-3">
                  <h4 className="text-xs font-semibold text-amber-900 font-display">
                    Custom Business Type Details
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-neutral-800 mb-1">
                        Custom Business Category *
                      </label>
                      <input
                        type="text"
                        required
                        value={customCategory}
                        onChange={(e) => setCustomCategory(e.target.value)}
                        placeholder="e.g. Specialty Knife Sharpening, Floral Architecture"
                        className="w-full text-xs p-2.5 bg-white border border-amber-300 rounded-lg text-neutral-900 focus:outline-none focus:ring-1 focus:ring-amber-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-neutral-800 mb-1">
                        Custom Subcategory / Service Type (Optional)
                      </label>
                      <input
                        type="text"
                        value={customSubcategory}
                        onChange={(e) => setCustomSubcategory(e.target.value)}
                        placeholder="e.g. Mobile Blade Restoration"
                        className="w-full text-xs p-2.5 bg-white border border-amber-300 rounded-lg text-neutral-900 focus:outline-none focus:ring-1 focus:ring-amber-500"
                      />
                    </div>
                  </div>
                  <p className="text-[11px] text-amber-800">
                    Your custom business category is fully indexed and searchable in the public Short Stack directory.
                  </p>
                </div>
              )}

              {/* STANDARD SUBCATEGORY SELECTION & CUSTOM SERVICE TYPE */}
              {!isOtherCategory && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {selectedCategoryObj?.subcategories && selectedCategoryObj.subcategories.length > 0 && (
                    <div>
                      <label className="block text-xs font-medium text-neutral-700 mb-1">
                        Suggested Subcategory (Optional)
                      </label>
                      <select
                        value={subcategory}
                        onChange={(e) => setSubcategory(e.target.value)}
                        className="w-full text-xs p-2.5 bg-white border border-neutral-200 rounded-lg text-neutral-900 focus:outline-none focus:ring-1 focus:ring-neutral-900"
                      >
                        <option value="">Select a subcategory (optional)...</option>
                        {selectedCategoryObj.subcategories.map((sc) => (
                          <option key={sc} value={sc}>
                            {sc}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                  <div className={selectedCategoryObj?.subcategories && selectedCategoryObj.subcategories.length > 0 ? '' : 'sm:col-span-2'}>
                    <label className="block text-xs font-medium text-neutral-700 mb-1">
                      Custom Subcategory / Service Type (Optional)
                    </label>
                    <input
                      type="text"
                      value={customSubcategory}
                      onChange={(e) => setCustomSubcategory(e.target.value)}
                      placeholder="e.g. Specialty Service, Mobile Unit, Bespoke Craft"
                      className="w-full text-xs p-2.5 bg-white border border-neutral-200 rounded-lg text-neutral-900 focus:outline-none focus:ring-1 focus:ring-neutral-900"
                    />
                  </div>
                </div>
              )}
            </div>

            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-neutral-700 mb-1">
                Business Description *
              </label>
              <textarea
                required
                rows={3}
                value={shortDescription}
                onChange={(e) => setShortDescription(e.target.value)}
                placeholder="Describe your craft, specialty offerings, quality philosophy, and community history..."
                className="w-full text-xs p-2.5 bg-white border border-neutral-200 rounded-lg text-neutral-900 focus:outline-none focus:ring-1 focus:ring-neutral-900"
              />
            </div>

            {/* Photos Manager */}
            <div className="sm:col-span-2 space-y-2">
              <label className="block text-xs font-medium text-neutral-700">
                Additional Business Photos
              </label>

              {/* Direct Device Photo Upload with Preview */}
              <input
                type="file"
                ref={fileInputRef}
                accept="image/*"
                onChange={handleDevicePhotoSelect}
                className="hidden"
              />

              {photoPreview ? (
                <div className="p-3 bg-neutral-50 border border-neutral-200 rounded-xl space-y-3 max-w-md">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-neutral-800">Photo Preview</span>
                    <span className="text-[10px] text-neutral-500">Ready to save</span>
                  </div>
                  <div className="aspect-16/9 rounded-lg overflow-hidden bg-neutral-200 border border-neutral-300 max-h-48">
                    <img src={photoPreview} alt="Selected preview" className="w-full h-full object-cover" />
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleConfirmAddPhoto}
                      className="py-2 px-3 text-xs font-semibold text-white bg-neutral-900 hover:bg-neutral-800 rounded-lg transition-colors flex items-center gap-1.5"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />
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
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="py-2 px-3.5 text-xs font-semibold text-neutral-800 bg-neutral-100 hover:bg-neutral-200 border border-neutral-300 rounded-lg transition-colors flex items-center gap-1.5"
                  >
                    <Upload className="w-3.5 h-3.5" />
                    <span>Upload Photo from Device</span>
                  </button>
                  <span className="text-[11px] text-neutral-400">
                    Camera or photo library on mobile/tablet, or file picker on computer.
                  </span>
                </div>
              )}

              {photos.length > 0 && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2">
                  {photos.map((url, idx) => (
                    <div key={idx} className="relative group rounded-lg overflow-hidden border border-neutral-200 h-20 bg-neutral-100">
                      <img src={url} alt={`Business photo ${idx + 1}`} className="w-full h-full object-cover" />
                      <button
                        type="button"
                        onClick={() => handleRemovePhoto(idx)}
                        className="absolute top-1 right-1 p-1 bg-black/60 text-white rounded hover:bg-red-600 transition-colors"
                        title="Remove photo"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </section>

        {/* SECTION 2: LOCATION & SERVICE AREA */}
        <section className="bg-white rounded-xl border border-neutral-200 p-6 space-y-6">
          <div className="flex items-center gap-2 pb-3 border-b border-neutral-100">
            <MapPin className="w-5 h-5 text-neutral-900" />
            <h2 className="text-base font-semibold font-display text-neutral-900">
              2. Location & Service Area
            </h2>
          </div>

          <div className="p-3 bg-neutral-50 border border-neutral-200 rounded-lg flex items-center justify-between">
            <div>
              <span className="text-xs font-semibold text-neutral-900 block">Service-Area Only Business</span>
              <span className="text-[11px] text-neutral-500">
                Check this if you serve customers at their location and do not operate a public customer storefront.
              </span>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={isServiceAreaOnly}
                onChange={(e) => setIsServiceAreaOnly(e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-9 h-5 bg-neutral-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-neutral-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-neutral-900"></div>
            </label>
          </div>

          {/* Autocomplete Street Address */}
          <div>
            <label className="block text-xs font-medium text-neutral-700 mb-1">
              {isServiceAreaOnly ? 'Base of Operations Street Address (Optional)' : 'Street Address *'}
            </label>
            <LocationAutocomplete
              value={address}
              onChange={setAddress}
              onSelectPrediction={handleSelectPrediction}
              placeholder="Search or enter street address..."
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-neutral-700 mb-1">City *</label>
              <input
                type="text"
                required
                value={city}
                onChange={(e) => setCity(e.target.value)}
                placeholder="e.g. Seattle"
                className="w-full text-xs p-2.5 bg-white border border-neutral-200 rounded-lg text-neutral-900 focus:outline-none focus:ring-1 focus:ring-neutral-900"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-neutral-700 mb-1">State *</label>
              <input
                type="text"
                required
                value={state}
                onChange={(e) => setState(e.target.value)}
                placeholder="WA"
                className="w-full text-xs p-2.5 bg-white border border-neutral-200 rounded-lg text-neutral-900 focus:outline-none focus:ring-1 focus:ring-neutral-900"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-neutral-700 mb-1">ZIP / Postal Code</label>
              <input
                type="text"
                value={zipCode}
                onChange={(e) => setZipCode(e.target.value)}
                placeholder="98107"
                className="w-full text-xs p-2.5 bg-white border border-neutral-200 rounded-lg text-neutral-900 focus:outline-none focus:ring-1 focus:ring-neutral-900"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-neutral-700 mb-1">
              Service Area / Radius Description (Optional)
            </label>
            <input
              type="text"
              value={serviceArea}
              onChange={(e) => setServiceArea(e.target.value)}
              placeholder="e.g. Greater Seattle, King County, or 25-mile radius"
              className="w-full text-xs p-2.5 bg-white border border-neutral-200 rounded-lg text-neutral-900 focus:outline-none focus:ring-1 focus:ring-neutral-900"
            />
          </div>
        </section>

        {/* SECTION 3: BUSINESS CONTACT INFORMATION */}
        <section className="bg-white rounded-xl border border-neutral-200 p-6 space-y-6">
          <div className="flex items-center gap-2 pb-3 border-b border-neutral-100">
            <Phone className="w-5 h-5 text-neutral-900" />
            <h2 className="text-base font-semibold font-display text-neutral-900">
              3. Public Contact Information
            </h2>
          </div>

          <p className="text-xs text-neutral-500 -mt-2">
            These fields are displayed publicly to customers on your permanent directory profile. Personal account data remains private.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-neutral-700 mb-1">Public Phone</label>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="(206) 555-0142"
                className="w-full text-xs p-2.5 bg-white border border-neutral-200 rounded-lg text-neutral-900 focus:outline-none focus:ring-1 focus:ring-neutral-900"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-neutral-700 mb-1">Public Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="contact@mybusiness.local"
                className="w-full text-xs p-2.5 bg-white border border-neutral-200 rounded-lg text-neutral-900 focus:outline-none focus:ring-1 focus:ring-neutral-900"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-neutral-700 mb-1">Website URL</label>
              <input
                type="url"
                value={website}
                onChange={(e) => setWebsite(e.target.value)}
                placeholder="https://mybusiness.local"
                className="w-full text-xs p-2.5 bg-white border border-neutral-200 rounded-lg text-neutral-900 focus:outline-none focus:ring-1 focus:ring-neutral-900"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-neutral-700 mb-1">Order Online Link</label>
              <input
                type="url"
                value={orderOnlineUrl}
                onChange={(e) => setOrderOnlineUrl(e.target.value)}
                placeholder="https://order.mybusiness.local"
                className="w-full text-xs p-2.5 bg-white border border-neutral-200 rounded-lg text-neutral-900 focus:outline-none focus:ring-1 focus:ring-neutral-900"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-neutral-700 mb-1">Booking / Appointment Link</label>
              <input
                type="url"
                value={bookingUrl}
                onChange={(e) => setBookingUrl(e.target.value)}
                placeholder="https://booking.mybusiness.local"
                className="w-full text-xs p-2.5 bg-white border border-neutral-200 rounded-lg text-neutral-900 focus:outline-none focus:ring-1 focus:ring-neutral-900"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-neutral-700 mb-1">Directions / Map URL</label>
              <input
                type="url"
                value={directionsUrl}
                onChange={(e) => setDirectionsUrl(e.target.value)}
                placeholder="https://maps.google.com/..."
                className="w-full text-xs p-2.5 bg-white border border-neutral-200 rounded-lg text-neutral-900 focus:outline-none focus:ring-1 focus:ring-neutral-900"
              />
            </div>
          </div>
        </section>

        {/* SECTION 4: OPERATING HOURS */}
        <section className="bg-white rounded-xl border border-neutral-200 p-6 space-y-6">
          <div className="flex items-center gap-2 pb-3 border-b border-neutral-100">
            <Clock className="w-5 h-5 text-neutral-900" />
            <h2 className="text-base font-semibold font-display text-neutral-900">
              4. Operating Hours
            </h2>
          </div>

          <div className="space-y-3">
            {(['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'] as const).map((day) => (
              <div key={day} className="flex items-center justify-between gap-4 py-1.5 border-b border-neutral-100 text-xs">
                <span className="capitalize font-semibold text-neutral-800 w-28">
                  {day}
                </span>

                <div className="flex items-center gap-2 flex-1 max-w-sm">
                  <input
                    type="text"
                    disabled={hours[day] === 'Closed'}
                    value={hours[day] === 'Closed' ? '' : hours[day]}
                    onChange={(e) => handleHourChange(day, e.target.value)}
                    placeholder="e.g. 9:00 AM – 5:00 PM"
                    className="flex-1 text-xs p-1.5 bg-white border border-neutral-200 rounded text-neutral-900 disabled:bg-neutral-100 disabled:text-neutral-400"
                  />
                  <button
                    type="button"
                    onClick={() => handleToggleDayClosed(day)}
                    className={`py-1 px-2.5 rounded text-[11px] font-medium transition-colors ${
                      hours[day] === 'Closed'
                        ? 'bg-neutral-900 text-white'
                        : 'bg-neutral-100 text-neutral-700 hover:bg-neutral-200'
                    }`}
                  >
                    {hours[day] === 'Closed' ? 'Closed' : 'Mark Closed'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* SECTION 5: BUSINESS DETAILS (INFORMATIONAL & NON-BLOCKING) */}
        <section className="bg-white rounded-xl border border-neutral-200 p-6 space-y-4">
          <div className="flex items-center gap-2 pb-3 border-b border-neutral-100">
            <Shield className="w-5 h-5 text-neutral-900" />
            <div>
              <h2 className="text-base font-semibold font-display text-neutral-900">
                5. Business Verification Details
              </h2>
              <span className="text-[11px] text-neutral-500">
                Informational only · Does NOT block registration or directory publication
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-neutral-700 mb-1">
                Employer Identification Number (EIN) (Optional)
              </label>
              <input
                type="text"
                value={ein}
                onChange={(e) => setEin(e.target.value)}
                placeholder="XX-XXXXXXX"
                className="w-full text-xs p-2.5 bg-white border border-neutral-200 rounded-lg text-neutral-900"
              />
            </div>

            <div className="space-y-2">
              <label className="flex items-center gap-2 text-xs font-medium text-neutral-800 pt-2">
                <input
                  type="checkbox"
                  checked={hasInsurance}
                  onChange={(e) => setHasInsurance(e.target.checked)}
                  className="rounded text-neutral-900 focus:ring-0"
                />
                <span>Business is General Liability Insured or Bonded</span>
              </label>

              {hasInsurance && (
                <input
                  type="text"
                  value={insuranceDetails}
                  onChange={(e) => setInsuranceDetails(e.target.value)}
                  placeholder="Optional insurance policy or underwriter name"
                  className="w-full text-xs p-2 bg-white border border-neutral-200 rounded-lg text-neutral-900"
                />
              )}
            </div>
          </div>
        </section>

        {/* SECTION 6: CATEGORY-SPECIFIC & SERVICES / PRODUCTS OFFERINGS */}
        <section className="bg-white rounded-xl border border-neutral-200 p-6 space-y-6">
          <div className="flex items-center gap-2 pb-3 border-b border-neutral-100">
            {isRestaurant ? (
              <Utensils className="w-5 h-5 text-neutral-900" />
            ) : (
              <Wrench className="w-5 h-5 text-neutral-900" />
            )}
            <h2 className="text-base font-semibold font-display text-neutral-900">
              6. {isRestaurant ? 'Restaurant Menu & Offerings' : 'Services & Product Offerings'}
            </h2>
          </div>

          {/* Restaurant Menu Photo Upload */}
          {isRestaurant && (
            <div className="p-4 bg-neutral-50 rounded-xl border border-neutral-200 space-y-3">
              <div>
                <span className="text-xs font-semibold text-neutral-900 block">Restaurant Menu Photo / Document</span>
                <span className="text-[11px] text-neutral-500">
                  Upload or attach your restaurant menu photos for diner transparency.
                </span>
              </div>

              <div className="flex gap-2">
                <input
                  type="url"
                  value={newMenuPhotoInput}
                  onChange={(e) => setNewMenuPhotoInput(e.target.value)}
                  placeholder="Paste menu photo URL or sample path"
                  className="flex-1 text-xs p-2 bg-white border border-neutral-200 rounded-lg text-neutral-900"
                />
                <button
                  type="button"
                  onClick={handleAddMenuPhoto}
                  className="py-2 px-3 text-xs font-semibold text-neutral-800 bg-white border border-neutral-200 hover:bg-neutral-100 rounded-lg"
                >
                  Add Menu Photo
                </button>
              </div>

              {menuPhotos.length > 0 && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1">
                  {menuPhotos.map((url, idx) => (
                    <div key={idx} className="relative group rounded-lg overflow-hidden border border-neutral-200 h-20 bg-neutral-100">
                      <img src={url} alt={`Menu ${idx + 1}`} className="w-full h-full object-cover" />
                      <button
                        type="button"
                        onClick={() => handleRemoveMenuPhoto(idx)}
                        className="absolute top-1 right-1 p-1 bg-black/60 text-white rounded hover:bg-red-600 transition-colors"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Service / Menu Items Builder */}
          <div className="space-y-4">
            <h4 className="text-xs font-semibold text-neutral-800 font-display">
              {isRestaurant ? 'Highlighted Menu Items' : 'Services & Pricing Offered'}
            </h4>

            {/* Input Builder */}
            <div className="p-3 bg-neutral-50 rounded-xl border border-neutral-200 grid grid-cols-1 sm:grid-cols-12 gap-2 text-xs">
              <div className="sm:col-span-5">
                <input
                  type="text"
                  value={itemTitle}
                  onChange={(e) => setItemTitle(e.target.value)}
                  placeholder={isRestaurant ? 'Item name (e.g. Handmade Ravioli)' : 'Service name (e.g. Oil Change, Brake Inspection)'}
                  className="w-full p-2 bg-white border border-neutral-200 rounded text-neutral-900"
                />
              </div>
              <div className="sm:col-span-4">
                <input
                  type="text"
                  value={itemDesc}
                  onChange={(e) => setItemDesc(e.target.value)}
                  placeholder="Optional details / description"
                  className="w-full p-2 bg-white border border-neutral-200 rounded text-neutral-900"
                />
              </div>
              <div className="sm:col-span-2">
                <input
                  type="text"
                  value={itemPrice}
                  onChange={(e) => setItemPrice(e.target.value)}
                  placeholder="Price (e.g. $18 or $85/hr)"
                  className="w-full p-2 bg-white border border-neutral-200 rounded text-neutral-900"
                />
              </div>
              <div className="sm:col-span-1">
                <button
                  type="button"
                  onClick={handleAddItem}
                  className="w-full h-full p-2 bg-neutral-900 text-white rounded font-medium flex items-center justify-center hover:bg-neutral-800"
                  title="Add Item"
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* List of items */}
            {isRestaurant ? (
              menuItems.length > 0 ? (
                <div className="divide-y divide-neutral-100 text-xs">
                  {menuItems.map((m) => (
                    <div key={m.id} className="py-2.5 flex items-center justify-between gap-4">
                      <div>
                        <span className="font-semibold text-neutral-900">{m.name}</span>
                        {m.description && <span className="text-neutral-500 ml-2">· {m.description}</span>}
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="font-semibold text-neutral-800 font-mono">{m.price}</span>
                        <button
                          type="button"
                          onClick={() => handleRemoveItem(m.id)}
                          className="text-neutral-400 hover:text-red-600"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-neutral-400 italic">No menu items added yet.</p>
              )
            ) : services.length > 0 ? (
              <div className="divide-y divide-neutral-100 text-xs">
                {services.map((s) => (
                  <div key={s.id} className="py-2.5 flex items-center justify-between gap-4">
                    <div>
                      <span className="font-semibold text-neutral-900">{s.name}</span>
                      {s.description && <span className="text-neutral-500 ml-2">· {s.description}</span>}
                    </div>
                    <div className="flex items-center gap-3">
                      {s.price && <span className="font-semibold text-neutral-800 font-mono">{s.price}</span>}
                      <button
                        type="button"
                        onClick={() => handleRemoveItem(s.id)}
                        className="text-neutral-400 hover:text-red-600"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-neutral-400 italic">No services or products added yet.</p>
            )}
          </div>
        </section>

        {/* SECTION 7: SEARCHABLE KEYWORDS & TAGS (Build v1.7) */}
        <section className="bg-white rounded-xl border border-neutral-200 p-6 space-y-4">
          <div className="flex items-center gap-2 pb-3 border-b border-neutral-100">
            <FileText className="w-5 h-5 text-neutral-900" />
            <h2 className="text-base font-semibold font-display text-neutral-900">
              7. Searchable Discovery Keywords
            </h2>
          </div>

          <p className="text-xs text-neutral-500">
            Keywords help nearby customers discover your business in directory searches. Select suggested keywords below or add your own custom search terms.
          </p>

          {/* Suggested keywords from chosen category */}
          {selectedCategoryObj?.suggestedKeywords && selectedCategoryObj.suggestedKeywords.length > 0 && (
            <div>
              <span className="text-[11px] font-semibold text-neutral-600 block mb-1.5">
                Suggested for {selectedCategoryObj.name}:
              </span>
              <div className="flex flex-wrap gap-1.5">
                {selectedCategoryObj.suggestedKeywords.map((kw) => {
                  const norm = normalizeKeyword(kw);
                  const isSelected = keywords.includes(norm);
                  return (
                    <button
                      key={kw}
                      type="button"
                      onClick={() => handleToggleSuggestedKeyword(kw)}
                      className={`text-xs px-2.5 py-1 rounded transition-colors ${
                        isSelected
                          ? 'bg-neutral-900 text-white font-medium'
                          : 'bg-neutral-100 text-neutral-700 hover:bg-neutral-200'
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

          {/* Custom keyword input */}
          <div className="space-y-2 pt-2">
            <label className="block text-xs font-medium text-neutral-700">Add Custom Keyword</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={customKeywordInput}
                onChange={(e) => setCustomKeywordInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAddCustomKeyword();
                  }
                }}
                placeholder="e.g. mobile mechanic, custom cakes, sourdough, tire repair..."
                className="flex-1 text-xs p-2.5 bg-white border border-neutral-200 rounded-lg text-neutral-900 focus:outline-none focus:ring-1 focus:ring-neutral-900"
              />
              <button
                type="button"
                onClick={handleAddCustomKeyword}
                className="py-2.5 px-4 text-xs font-semibold text-neutral-800 bg-neutral-100 hover:bg-neutral-200 rounded-lg transition-colors"
              >
                Add Tag
              </button>
            </div>
            {keywordError && <p className="text-xs text-red-600">{keywordError}</p>}
          </div>

          {/* Currently selected keywords */}
          <div className="pt-2">
            <span className="text-xs font-semibold text-neutral-800 block mb-1">
              Active Search Keywords ({keywords.length}):
            </span>
            {keywords.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {keywords.map((kw) => (
                  <span
                    key={kw}
                    className="inline-flex items-center gap-1 bg-neutral-100 text-neutral-800 text-xs px-2.5 py-1 rounded border border-neutral-200"
                  >
                    #{kw}
                    <button
                      type="button"
                      onClick={() => handleRemoveKeyword(kw)}
                      className="hover:text-red-600 ml-1"
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-xs text-neutral-400 italic">No keywords assigned yet.</p>
            )}
          </div>
        </section>

        {/* BOTTOM ACTION BAR */}
        <div className="sticky bottom-4 z-20 bg-white/95 backdrop-blur-xs p-4 rounded-xl border border-neutral-200 shadow-lg flex flex-col sm:flex-row items-center justify-between gap-4">
          <button
            type="button"
            onClick={onCancel}
            className="w-full sm:w-auto py-2.5 px-4 text-xs font-semibold text-neutral-700 bg-neutral-100 hover:bg-neutral-200 rounded-lg transition-colors"
          >
            Cancel & Return
          </button>

          <div className="flex items-center gap-3 w-full sm:w-auto justify-end">
            <span className="text-xs text-neutral-500 hidden sm:inline">
              {!isEditing ? 'Next: Review & $19.99 2-Month Activation' : 'Changes apply immediately'}
            </span>

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full sm:w-auto py-2.5 px-6 text-xs font-semibold text-white bg-neutral-900 hover:bg-neutral-800 rounded-lg transition-colors disabled:opacity-50"
            >
              {isSubmitting
                ? 'Saving Profile...'
                : isEditing
                ? 'Save Profile Changes'
                : 'Save & Continue to Payment'}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
};
