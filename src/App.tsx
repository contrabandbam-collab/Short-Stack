import React, { useState, useEffect } from 'react';
import type {
  Business,
  Category,
  UserAccount,
} from './types/pipsqueak.ts';
import { Navbar } from './components/Navbar.tsx';
import { LocationAutocomplete } from './components/LocationAutocomplete.tsx';
import { BusinessCard } from './components/BusinessCard.tsx';
import { PublicProfileView } from './components/PublicProfileView.tsx';
import { OwnerDashboard } from './components/OwnerDashboard.tsx';
import { StaffDashboard } from './components/StaffDashboard.tsx';
import { AdminDashboard } from './components/AdminDashboard.tsx';
import { QRCodeModal } from './components/QRCodeModal.tsx';
import { AuthModal } from './components/AuthModal.tsx';
import { ContactModal } from './components/ContactModal.tsx';
import { ShortStackLogo } from './components/ShortStackLogo.tsx';
import { BusinessHighlight } from './components/BusinessHighlight.tsx';
import { LocalPromotionsSection } from './components/LocalPromotionsSection.tsx';
import { QuickCategoryTiles } from './components/QuickCategoryTiles.tsx';
import { TermsModal } from './components/TermsModal.tsx';
import {
  matchBusinessSmartSearch,
  getSearchCommentary,
  calculateDistanceMiles,
} from './utils/smartSearch.ts';
import {
  Search,
  MapPin,
  Utensils,
  Wrench,
  Home,
  Dog,
  ArrowRight,
  ShieldCheck,
  QrCode,
  Sparkles,
  ChevronRight,
  Lock,
  Mic,
  MicOff,
  Navigation,
  Scissors,
  Cake,
  Car,
  Tag,
  SlidersHorizontal,
} from 'lucide-react';

export default function App() {
  const [currentView, setCurrentView] = useState<string>('home');
  const [selectedBusinessId, setSelectedBusinessId] = useState<string | null>(null);
  const [directBusiness, setDirectBusiness] = useState<Business | null>(null);
  const [inactiveNotice, setInactiveNotice] = useState<{ status: string; businessId: string } | null>(null);

  // Auth & Terms modal state
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [authModalTab, setAuthModalTab] = useState<'signin' | 'signup' | 'recover' | 'mfa'>('signin');
  const [isTermsModalOpen, setIsTermsModalOpen] = useState(false);
  const [activeContactBusiness, setActiveContactBusiness] = useState<Business | null>(null);
  const [isListening, setIsListening] = useState(false);
  const [isLocating, setIsLocating] = useState(false);
  const [userCoords, setUserCoords] = useState<{ lat: number; lng: number } | null>(null);

  // Data state
  const [categories, setCategories] = useState<Category[]>([]);
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [allOwnerBusinesses, setAllOwnerBusinesses] = useState<Business[]>([]);
  // At every fresh app launch, start signed out for all authenticated roles
  const [currentUser, setCurrentUser] = useState<UserAccount>({
    id: 'guest-visitor',
    email: '',
    name: 'Visitor',
    role: 'visitor',
    createdAt: '',
  });

  // Search filter states
  const [searchQuery, setSearchQuery] = useState('');
  const [locationQuery, setLocationQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [distanceFilter, setDistanceFilter] = useState<'all' | '5' | '10' | '25' | '50'>('all');

  // QR Modal State
  const [activeQRBusiness, setActiveQRBusiness] = useState<Business | null>(null);

  // Clear cached authenticated state on fresh app launch
  useEffect(() => {
    try {
      sessionStorage.clear();
      localStorage.removeItem('pipsqueak_session');
      localStorage.removeItem('seeker_session');
    } catch {
      // ignore
    }
  }, []);

  // 10-minute inactivity sign-out for all authenticated roles (owner, staff, admin)
  useEffect(() => {
    if (currentUser.role === 'visitor') return;

    const INACTIVITY_TIMEOUT_MS = 10 * 60 * 1000; // Exactly 10 consecutive minutes (600,000 ms)
    let timeoutId: NodeJS.Timeout;

    const handleInactivityTimeout = () => {
      handleLogout();
      handleOpenAuth('signin');
    };

    const resetTimer = () => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(handleInactivityTimeout, INACTIVITY_TIMEOUT_MS);
    };

    // Treat pointer/mouse, keyboard, touch, and scroll input as activity and reset the timer
    const activityEvents = ['pointerdown', 'mousemove', 'keydown', 'touchstart', 'scroll', 'click'];
    activityEvents.forEach((evt) => {
      window.addEventListener(evt, resetTimer, { passive: true });
    });

    // Start timer
    resetTimer();

    return () => {
      clearTimeout(timeoutId);
      activityEvents.forEach((evt) => {
        window.removeEventListener(evt, resetTimer);
      });
    };
  }, [currentUser.role]);

  // Check URL query parameters and support browser navigation
  useEffect(() => {
    const syncFromUrl = () => {
      const params = new URLSearchParams(window.location.search);
      const refParam = params.get('ref');
      if (refParam) {
        try {
          sessionStorage.setItem('shortstack_ref', refParam.trim().toUpperCase());
        } catch {
          // ignore
        }
      }

      const bizParam = params.get('biz');
      if (bizParam) {
        handleOpenProfile(bizParam, false);
      } else {
        const viewParam = params.get('view');
        if (viewParam && ['home', 'search', 'owner', 'staff', 'admin'].includes(viewParam)) {
          setCurrentView(viewParam);
        }
      }
    };

    syncFromUrl();
    window.addEventListener('popstate', syncFromUrl);
    return () => window.removeEventListener('popstate', syncFromUrl);
  }, []);

  // Fetch initial data
  useEffect(() => {
    fetchInitialData();
  }, [currentUser.role]);

  const fetchInitialData = async () => {
    try {
      // Fetch categories
      const catRes = await fetch('/api/categories');
      if (catRes.ok) {
        const catData = await catRes.json();
        setCategories(catData.categories || []);
      }

      // Fetch public active businesses
      const bizRes = await fetch('/api/businesses');
      if (bizRes.ok) {
        const bizData = await bizRes.json();
        setBusinesses(bizData.businesses || []);
      }

      // Fetch owner/admin listings if signed in as owner or admin
      if (currentUser.role === 'owner' || currentUser.role === 'staff') {
        const ownRes = await fetch('/api/businesses?ownerOnly=true');
        if (ownRes.ok) {
          const ownData = await ownRes.json();
          setAllOwnerBusinesses(ownData.businesses || []);
        }
      } else if (currentUser.role === 'admin') {
        const admRes = await fetch('/api/businesses?ownerOnly=all');
        if (admRes.ok) {
          const admData = await admRes.json();
          setAllOwnerBusinesses(admData.businesses || []);
        }
      }
    } catch (err) {
      console.error('Error fetching data', err);
    }
  };

  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } catch (e) {
      console.error('Logout error', e);
    } finally {
      // End session, clear user-scoped client state, redirect to public home
      setCurrentUser({
        id: 'guest-visitor',
        email: '',
        name: 'Visitor',
        role: 'visitor',
        createdAt: '',
      });
      setAllOwnerBusinesses([]);
      setSelectedBusinessId(null);
      handleNavigate('home');
    }
  };

  const handleAuthSuccess = (user: UserAccount) => {
    setCurrentUser(user);
    if (user.role === 'owner') {
      handleNavigate('owner');
    } else if (user.role === 'staff') {
      handleNavigate('staff');
    } else if (user.role === 'admin') {
      handleNavigate('admin');
    } else {
      handleNavigate('home');
    }
  };

  const handleOpenAuth = (defaultTabChoice: 'signin' | 'signup' | 'recover' | 'mfa' = 'signin') => {
    setAuthModalTab(defaultTabChoice);
    setIsAuthModalOpen(true);
  };

  const handleOpenProfile = async (id: string, updateHistory = true) => {
    setSelectedBusinessId(id);
    setInactiveNotice(null);

    // Update browser URL query param for permanent profile link sharing
    if (updateHistory) {
      const newUrl = `${window.location.pathname}?biz=${id}`;
      window.history.pushState({ biz: id, view: 'profile' }, '', newUrl);
    }

    try {
      const res = await fetch(`/api/businesses/${id}`);
      if (res.ok) {
        const data = await res.json();
        setDirectBusiness(data.business);
      } else if (res.status === 404) {
        const err = await res.json();
        setDirectBusiness(null);
        setInactiveNotice({
          status: err.status || 'inactive',
          businessId: id,
        });
      }
    } catch (e) {
      console.error(e);
    }

    setCurrentView('profile');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleNavigate = (view: string, param?: string) => {
    if (view !== 'profile') {
      // Clear URL parameter when navigating away from profile
      const newUrl = window.location.pathname;
      window.history.pushState({ path: newUrl }, '', newUrl);
    }

    // Access control: if unauthenticated visitor attempts to navigate to owner/staff/admin, prompt sign-in
    if (currentUser.role === 'visitor' && (view === 'owner' || view === 'staff' || view === 'admin')) {
      handleOpenAuth('signin');
      return;
    }

    setCurrentView(view);
    if (param) {
      setSelectedCategory(param);
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleVoiceSearch = () => {
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert('Voice search is not supported in this browser. Please type your search inquiry.');
      return;
    }
    if (isListening) return;

    try {
      const recognition = new SpeechRecognition();
      recognition.continuous = false;
      recognition.interimResults = false;
      recognition.lang = 'en-US';

      recognition.onstart = () => setIsListening(true);
      recognition.onresult = (event: any) => {
        const transcript = event.results[0][0].transcript;
        setSearchQuery(transcript);
        setIsListening(false);
        handleNavigate('search');
      };
      recognition.onerror = () => setIsListening(false);
      recognition.onend = () => setIsListening(false);

      recognition.start();
    } catch {
      setIsListening(false);
    }
  };

  const handleUseMyLocation = () => {
    if (!navigator.geolocation) {
      setLocationQuery('Miami, FL');
      return;
    }
    setIsLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setIsLocating(false);
        setUserCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setLocationQuery('Current Location');
      },
      () => {
        setIsLocating(false);
        // Default community seed city
        setLocationQuery('Miami, FL');
      },
      { timeout: 8000 }
    );
  };

  // Perform smart search query filtering & distance scoping
  const filteredBusinesses = businesses
    .filter((b) => {
      // Exclude inactive, hidden, unpaid, or suspended listings from public consumer discovery
      if (b.status !== 'active') return false;
      if (b.billing && b.billing.status !== 'paid') {
        return false;
      }

      if (selectedCategory !== 'all') {
        if (selectedCategory === 'other') {
          if (b.category !== 'other' && !b.customCategory) {
            return false;
          }
        } else if (b.category !== selectedCategory) {
          return false;
        }
      }

      // Check distance filter if enabled and user coordinates are available
      if (distanceFilter !== 'all' && userCoords && b.lat && b.lng) {
        const dist = calculateDistanceMiles(userCoords.lat, userCoords.lng, b.lat, b.lng);
        if (dist !== null && dist > parseInt(distanceFilter, 10)) {
          return false;
        }
      }

      return matchBusinessSmartSearch(b, searchQuery, locationQuery);
    })
    .sort((a, b) => {
      // Default sorting: nearest relevant results first, without paid placement or boosts
      if (userCoords && a.lat && a.lng && b.lat && b.lng) {
        const distA = calculateDistanceMiles(userCoords.lat, userCoords.lng, a.lat, a.lng) ?? 999;
        const distB = calculateDistanceMiles(userCoords.lat, userCoords.lng, b.lat, b.lng) ?? 999;
        return distA - distB;
      }
      return 0;
    });

  const activeSelectedBusiness =
    directBusiness?.id === selectedBusinessId
      ? directBusiness
      : businesses.find((b) => b.id === selectedBusinessId) ||
        allOwnerBusinesses.find((b) => b.id === selectedBusinessId) ||
        null;

  return (
    <div className="min-h-screen flex flex-col bg-neutral-50 text-neutral-900 font-sans">
      {/* 3-Zone Navigation Header */}
      <Navbar
        currentView={currentView}
        onNavigate={handleNavigate}
        currentUser={currentUser}
        onOpenAuth={(tab) => handleOpenAuth(tab || 'signin')}
        onLogout={handleLogout}
      />

      <main className="flex-1">
        {/* VIEW 1: HOME PAGE */}
        {currentView === 'home' && (
          <div className="space-y-16 pb-16">
            {/* Consumer Hero Section with Blurred Miami Sunset Skyline Background */}
            <section
              className="relative pt-12 pb-16 px-4 sm:px-6 lg:px-8 border-b border-neutral-300 bg-neutral-900 bg-cover bg-center overflow-hidden"
              style={{
                backgroundImage: `url('/images/wide_cinematic_blurred_city_skyline_at_sunset_su.png')`,
              }}
            >
              {/* Dark Overlay & Subtle Backdrop Blur for Flawless Readability & Contrast */}
              <div className="absolute inset-0 bg-neutral-950/65 backdrop-blur-[2px]" />

              <div className="relative max-w-4xl mx-auto text-center space-y-7">
                {/* Brand Header Bar with Official Logo */}
                <div className="flex items-center justify-center">
                  <div className="p-2.5 rounded-2xl bg-white/95 backdrop-blur-md shadow-md border border-white/40">
                    <ShortStackLogo size="lg" variant="horizontal" showTagline={false} />
                  </div>
                </div>

                <div className="space-y-2">
                  <h1 className="text-3xl sm:text-5xl font-extrabold font-display tracking-tight text-white drop-shadow-md leading-tight">
                    Small Businesses. Big Deal.
                  </h1>
                  <p className="text-sm sm:text-base text-neutral-100 max-w-2xl mx-auto leading-relaxed drop-shadow-sm font-medium">
                    Connect directly with independent local shops, home specialists, dining, and neighborhood services. No middleman fees, commissions, or booking markups.
                  </p>
                </div>

                {/* “Tell me what you need” Smart Search Container */}
                <div className="bg-white p-2.5 rounded-2xl shadow-2xl border border-neutral-200/90 grid grid-cols-1 md:grid-cols-12 gap-2 text-left">
                  {/* Conversational input with voice toggle */}
                  <div className="md:col-span-6 relative flex items-center">
                    <Search className="absolute left-3.5 w-4 h-4 text-neutral-400 pointer-events-none" />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleNavigate('search');
                      }}
                      placeholder="Tell me what you need (e.g. fix my brakes, barber near me)..."
                      className="w-full pl-10 pr-10 py-3 text-sm bg-transparent rounded-xl text-neutral-900 placeholder:text-neutral-400 focus:outline-none"
                    />
                    {/* Voice Input Button */}
                    <button
                      type="button"
                      onClick={handleVoiceSearch}
                      title={isListening ? 'Listening... Speak now' : 'Search by voice'}
                      className={`absolute right-2 p-1.5 rounded-lg transition-colors ${
                        isListening
                          ? 'bg-red-500 text-white animate-pulse'
                          : 'text-neutral-400 hover:text-neutral-900 hover:bg-neutral-100'
                      }`}
                    >
                      {isListening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                    </button>
                  </div>

                  {/* Location Autocomplete with "Use My Location" quick button */}
                  <div className="md:col-span-4 border-t md:border-t-0 md:border-l border-neutral-200/80 pt-2 md:pt-0 md:pl-2 flex items-center gap-1.5">
                    <div className="flex-1">
                      <LocationAutocomplete
                        value={locationQuery}
                        onChange={setLocationQuery}
                        placeholder="City and State, ZIP, or address..."
                      />
                    </div>
                    <button
                      type="button"
                      onClick={handleUseMyLocation}
                      disabled={isLocating}
                      title="Use My Location"
                      className="p-2 text-neutral-500 hover:text-neutral-900 hover:bg-neutral-100 rounded-lg transition-colors border border-neutral-200 shrink-0"
                    >
                      <Navigation className={`w-3.5 h-3.5 ${isLocating ? 'animate-spin' : ''}`} />
                    </button>
                  </div>

                  {/* Submit Button */}
                  <div className="md:col-span-2">
                    <button
                      onClick={() => handleNavigate('search')}
                      className="w-full h-full py-3 px-4 text-xs font-bold uppercase tracking-wider text-white bg-neutral-900 hover:bg-neutral-800 rounded-xl transition-colors flex items-center justify-center gap-1.5 shadow-xs"
                    >
                      <Search className="w-3.5 h-3.5" />
                      <span>Search</span>
                    </button>
                  </div>
                </div>

                {/* Exactly FOUR quick category photo tiles rotating every 24 hours */}
                <QuickCategoryTiles
                  categories={categories}
                  businesses={businesses}
                  onSelectCategory={(categoryId) => {
                    setSelectedCategory(categoryId);
                    setSearchQuery('');
                    handleNavigate('search');
                  }}
                />
              </div>
            </section>

            {/* Free 24-Hour Business Highlight (Replaces old Browse by Category) */}
            <BusinessHighlight
              businesses={businesses}
              locationQuery={locationQuery}
              onOpenProfile={handleOpenProfile}
              onContact={(b) => setActiveContactBusiness(b)}
            />

            {/* Local Promotions & Offers */}
            <LocalPromotionsSection
              businesses={businesses}
              userCoords={userCoords}
              onOpenProfile={handleOpenProfile}
              onContact={(b) => setActiveContactBusiness(b)}
            />

            {/* Featured Active Businesses Grid */}
            <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-6">
              <div className="flex items-baseline justify-between border-b border-neutral-200 pb-3">
                <div>
                  <h2 className="text-xl font-bold font-display text-neutral-900">Featured Active Directory Listings</h2>
                  <p className="text-xs text-neutral-500 mt-0.5">
                    Independent local businesses with permanent profile addresses and direct contact options.
                  </p>
                </div>
                <button
                  onClick={() => handleNavigate('search')}
                  className="text-xs font-semibold text-neutral-900 hover:text-neutral-600 transition-colors flex items-center gap-1"
                >
                  View All ({businesses.length})
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>

              {businesses.length > 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                  {businesses.slice(0, 4).map((biz) => {
                    const cat = categories.find((c) => c.id === biz.category);
                    return (
                      <BusinessCard
                        key={biz.id}
                        business={biz}
                        category={cat}
                        onOpenProfile={handleOpenProfile}
                        onShowQR={(b) => setActiveQRBusiness(b)}
                      />
                    );
                  })}
                </div>
              ) : (
                <div className="bg-white rounded-xl border border-neutral-200 p-8 sm:p-12 text-center space-y-3">
                  <div className="w-12 h-12 rounded-full bg-neutral-100 flex items-center justify-center mx-auto text-neutral-400">
                    <Search className="w-6 h-6" />
                  </div>
                  <h3 className="text-base font-semibold text-neutral-900 font-display">
                    No active community listings published yet
                  </h3>
                  <p className="text-xs text-neutral-500 max-w-md mx-auto leading-relaxed">
                    Short Stack connects consumers directly with independent local businesses with permanent profile addresses and direct contact options.
                  </p>
                </div>
              )}
            </section>

            {/* Platform Mechanism & Transparency Section */}
            <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
              <div className="bg-white rounded-2xl border border-neutral-200 p-8 sm:p-12">
                <div className="max-w-2xl space-y-4">
                  <div className="flex items-center gap-2">
                    <ShortStackLogo size="sm" variant="mark" />
                    <span className="text-xs font-bold uppercase tracking-wider text-emerald-600 font-mono">
                      Independent Directory
                    </span>
                  </div>
                  <h2 className="text-2xl font-bold font-display text-neutral-900">
                    A permanent directory built for local independence.
                  </h2>
                  <p className="text-sm text-neutral-600 leading-relaxed">
                    Short Stack provides businesses a stable public profile URL, permanent non-changing QR code, and promotional flyer studio. We don't take commissions, middleman transactions, or consumer booking fees.
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-8 mt-8 border-t border-neutral-100">
                  <div className="space-y-2">
                    <h3 className="text-sm font-semibold text-neutral-900 font-display">Permanent QR & Profile URL</h3>
                    <p className="text-xs text-neutral-600 leading-relaxed">
                      Every business receives a stable public ID that never changes across edits or bimonthly renewals.
                    </p>
                  </div>
                  <div className="space-y-2">
                    <h3 className="text-sm font-semibold text-neutral-900 font-display">Initial $19.99 Enrollment & $25/2-Mo</h3>
                    <p className="text-xs text-neutral-600 leading-relaxed">
                      $19.99 initial enrollment activates your listing for 2 months. Manual $25 renewals extend visibility ($12.50 with referral discount). Never auto-billed.
                    </p>
                  </div>
                  <div className="space-y-2">
                    <h3 className="text-sm font-semibold text-neutral-900 font-display">Direct Consumer Contact</h3>
                    <p className="text-xs text-neutral-600 leading-relaxed">
                      Customers connect directly by phone call or email. In-person visits are available only when the business welcomes visitors.
                    </p>
                  </div>
                </div>
              </div>
            </section>
          </div>
        )}

        {/* VIEW 2: SEARCH RESULTS PAGE */}
        {currentView === 'search' && (
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
            {/* Search Filter Header */}
            <div className="bg-white rounded-xl border border-neutral-200 p-4 sm:p-6 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
                <div className="md:col-span-6 relative flex items-center">
                  <Search className="absolute left-3 w-4 h-4 text-neutral-400 pointer-events-none" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Tell me what you need (e.g. fix my brakes, barber near me)..."
                    className="w-full pl-9 pr-9 py-2 text-sm bg-neutral-50 border border-neutral-200 rounded-lg text-neutral-900 focus:outline-none focus:ring-1 focus:ring-neutral-900"
                  />
                  <button
                    type="button"
                    onClick={handleVoiceSearch}
                    title={isListening ? 'Listening...' : 'Search by voice'}
                    className={`absolute right-2 p-1 rounded-md transition-colors ${
                      isListening ? 'bg-red-500 text-white animate-pulse' : 'text-neutral-400 hover:text-neutral-800'
                    }`}
                  >
                    {isListening ? <MicOff className="w-3.5 h-3.5" /> : <Mic className="w-3.5 h-3.5" />}
                  </button>
                </div>

                <div className="md:col-span-4 flex items-center gap-1.5">
                  <div className="flex-1">
                    <LocationAutocomplete
                      value={locationQuery}
                      onChange={setLocationQuery}
                      placeholder="Filter by city, ZIP, or address..."
                    />
                  </div>
                  <button
                    type="button"
                    onClick={handleUseMyLocation}
                    disabled={isLocating}
                    title="Use My Location"
                    className="p-2 text-neutral-500 hover:text-neutral-900 hover:bg-neutral-100 rounded-lg transition-colors border border-neutral-200 shrink-0"
                  >
                    <Navigation className={`w-3.5 h-3.5 ${isLocating ? 'animate-spin' : ''}`} />
                  </button>
                </div>

                <div className="md:col-span-2 flex gap-2">
                  <button
                    onClick={() => {
                      setSearchQuery('');
                      setLocationQuery('');
                      setSelectedCategory('all');
                    }}
                    className="w-full py-2 px-3 text-xs font-medium text-neutral-600 hover:text-neutral-900 bg-neutral-100 hover:bg-neutral-200 rounded-lg transition-colors"
                  >
                    Clear Filters
                  </button>
                </div>
              </div>

              {/* Category & Distance Filter Row */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2 border-t border-neutral-100">
                {/* Category Filter Tabs */}
                <div className="flex items-center gap-1.5 overflow-x-auto">
                  <button
                    onClick={() => setSelectedCategory('all')}
                    className={`py-1.5 px-3 text-xs rounded-lg transition-colors whitespace-nowrap ${
                      selectedCategory === 'all'
                        ? 'bg-neutral-900 text-white font-medium'
                        : 'bg-neutral-100 text-neutral-700 hover:bg-neutral-200'
                    }`}
                  >
                    All Categories
                  </button>
                  {categories.map((c) => (
                    <button
                      key={c.id}
                      onClick={() => setSelectedCategory(c.id)}
                      className={`py-1.5 px-3 text-xs rounded-lg transition-colors whitespace-nowrap ${
                        selectedCategory === c.id
                          ? 'bg-neutral-900 text-white font-medium'
                          : 'bg-neutral-100 text-neutral-700 hover:bg-neutral-200'
                      }`}
                    >
                      {c.name}
                    </button>
                  ))}
                </div>

                {/* Distance Filter (5, 10, 25, 50 miles) */}
                <div className="flex items-center gap-1.5 shrink-0 self-start sm:self-auto">
                  <span className="text-[11px] font-medium text-neutral-500">Radius:</span>
                  {(['all', '5', '10', '25', '50'] as const).map((dist) => (
                    <button
                      key={dist}
                      onClick={() => setDistanceFilter(dist)}
                      className={`py-1 px-2.5 text-xs rounded-md transition-colors ${
                        distanceFilter === dist
                          ? 'bg-emerald-600 text-white font-semibold shadow-2xs'
                          : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
                      }`}
                    >
                      {dist === 'all' ? 'Any' : `${dist}mi`}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Contextual On-Screen Search Commentary */}
            {searchQuery.trim() && (
              <div className="p-3.5 bg-emerald-50/70 border border-emerald-200/80 rounded-xl flex items-center gap-2.5 text-xs text-neutral-800">
                <Sparkles className="w-4 h-4 text-emerald-600 shrink-0" />
                <p className="font-medium">
                  {getSearchCommentary(searchQuery, filteredBusinesses.length)}
                </p>
              </div>
            )}

            {/* Results Count & Status */}
            <div className="flex items-center justify-between text-xs text-neutral-500">
              <span>
                Showing <strong className="font-mono text-neutral-900">{filteredBusinesses.length}</strong> active listings
                {selectedCategory !== 'all' && ` in ${categories.find((c) => c.id === selectedCategory)?.name}`}
                {locationQuery && ` near "${locationQuery}"`}
                {distanceFilter !== 'all' && ` (within ${distanceFilter} miles)`}
              </span>
              <span className="font-mono text-[11px] text-neutral-400">Directory listings</span>
            </div>

            {/* Results Grid */}
            {filteredBusinesses.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                {filteredBusinesses.map((b) => {
                  const cat = categories.find((c) => c.id === b.category);
                  const distMiles =
                    userCoords && b.lat && b.lng
                      ? calculateDistanceMiles(userCoords.lat, userCoords.lng, b.lat, b.lng) ?? undefined
                      : undefined;
                  return (
                    <BusinessCard
                      key={b.id}
                      business={b}
                      category={cat}
                      distanceMiles={distMiles}
                      onOpenProfile={handleOpenProfile}
                      onShowQR={(biz) => setActiveQRBusiness(biz)}
                    />
                  );
                })}
              </div>
            ) : (
              <div className="bg-white rounded-xl border border-neutral-200 p-12 text-center space-y-4">
                <Search className="w-10 h-10 text-neutral-300 mx-auto" />
                <div className="space-y-1">
                  <h3 className="text-base font-semibold text-neutral-900 font-display">
                    No matching listings found
                  </h3>
                  <p className="text-xs text-neutral-500 max-w-md mx-auto">
                    We didn't find active local listings matching "{searchQuery || locationQuery || 'these filters'}". Try broadening your search or expanding the radius.
                  </p>
                </div>
                <div className="flex flex-wrap items-center justify-center gap-2.5 pt-2">
                  <button
                    onClick={() => {
                      setDistanceFilter('25');
                      setLocationQuery('');
                    }}
                    className="py-2 px-4 text-xs font-semibold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-300 rounded-lg transition-colors"
                  >
                    Broaden to 25-Mile Radius
                  </button>
                  <button
                    onClick={() => {
                      setSearchQuery('');
                      setLocationQuery('');
                      setSelectedCategory('all');
                      setDistanceFilter('all');
                    }}
                    className="py-2 px-4 text-xs font-semibold text-white bg-neutral-900 hover:bg-neutral-800 rounded-lg transition-colors"
                  >
                    Reset All Filters
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* VIEW 3: CATEGORIES BROWSER */}
        {currentView === 'categories' && (
          <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
            <div>
              <h1 className="text-2xl font-bold font-display text-neutral-900 tracking-tight">Business Categories</h1>
              <p className="text-xs text-neutral-500 mt-1">
                Explore local businesses organized by primary industry specializations and search tags.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {categories.map((c) => {
                const count = businesses.filter((b) => b.category === c.id).length;
                return (
                  <div
                    key={c.id}
                    className="bg-white rounded-xl border border-neutral-200 p-6 flex flex-col justify-between hover:border-neutral-300 transition-colors"
                  >
                    <div>
                      <div className="flex items-center justify-between">
                        <h2 className="text-lg font-bold font-display text-neutral-900">{c.name}</h2>
                        <span className="text-xs font-mono text-neutral-500">{count} active</span>
                      </div>
                      <p className="text-xs text-neutral-600 mt-2">{c.description}</p>

                      <div className="mt-4 pt-3 border-t border-neutral-100">
                        <span className="text-[11px] font-medium text-neutral-500 block mb-1.5">
                          Suggested Search Keywords:
                        </span>
                        <div className="flex flex-wrap gap-1.5">
                          {c.suggestedKeywords.map((sk) => (
                            <button
                              key={sk}
                              onClick={() => {
                                setSearchQuery(sk);
                                setSelectedCategory(c.id);
                                handleNavigate('search');
                              }}
                              className="text-[11px] bg-neutral-50 hover:bg-neutral-100 border border-neutral-200 px-2 py-0.5 rounded text-neutral-700 transition-colors"
                            >
                              #{sk}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>

                    <div className="pt-4 mt-4 border-t border-neutral-100">
                      <button
                        onClick={() => {
                          setSelectedCategory(c.id);
                          handleNavigate('search');
                        }}
                        className="inline-flex items-center gap-1.5 text-xs font-semibold text-neutral-900 hover:text-neutral-600"
                      >
                        <span>Browse {c.name} Listings</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* VIEW 4: PUBLIC PROFILE VIEW */}
        {currentView === 'profile' && (
          <PublicProfileView
            business={activeSelectedBusiness}
            inactiveNotice={inactiveNotice}
            category={categories.find((c) => c.id === activeSelectedBusiness?.category)}
            onBackToSearch={() => handleNavigate('search')}
            onStartSearch={(q) => {
              setSearchQuery(q);
              handleNavigate('search');
            }}
          />
        )}

        {/* VIEW 5: OWNER DASHBOARD */}
        {currentView === 'owner' && (
          currentUser.role === 'visitor' ? (
            <div className="max-w-md mx-auto px-4 py-20 text-center space-y-4">
              <div className="w-12 h-12 rounded-full bg-neutral-100 flex items-center justify-center mx-auto text-neutral-500">
                <Lock className="w-6 h-6" />
              </div>
              <h2 className="text-xl font-bold font-display text-neutral-900">Sign In Required</h2>
              <p className="text-xs text-neutral-500 leading-relaxed">
                You have logged out of your session. Business owner accounts and listings are private and protected. Please sign in to access your dashboard.
              </p>
              <button
                onClick={() => handleOpenAuth('signin')}
                className="py-2.5 px-5 text-xs font-semibold text-white bg-neutral-900 hover:bg-neutral-800 rounded-lg transition-colors"
              >
                Sign In as Business Owner
              </button>
            </div>
          ) : currentUser.aal === 'aal1' ? (
            <div className="max-w-md mx-auto px-4 py-20 text-center space-y-4">
              <div className="w-12 h-12 rounded-full bg-amber-50 flex items-center justify-center mx-auto text-amber-600">
                <ShieldCheck className="w-6 h-6" />
              </div>
              <h2 className="text-xl font-bold font-display text-neutral-900">MFA Verification Required (AAL2)</h2>
              <p className="text-xs text-neutral-500 leading-relaxed">
                Multi-Factor Authentication (AAL2) is required to access privileged business owner tools. Please verify your authenticator app code.
              </p>
              <button
                onClick={() => handleOpenAuth('mfa')}
                className="py-2.5 px-5 text-xs font-semibold text-white bg-amber-600 hover:bg-amber-700 rounded-lg transition-colors"
              >
                Complete MFA Verification
              </button>
            </div>
          ) : (
            <OwnerDashboard
              businesses={allOwnerBusinesses}
              categories={categories}
              currentUserId={currentUser.id}
              onRefreshData={fetchInitialData}
              onOpenProfile={handleOpenProfile}
              onLogout={handleLogout}
            />
          )
        )}

        {/* VIEW 6: STAFF PORTAL */}
        {currentView === 'staff' && (
          currentUser.role === 'visitor' ? (
            <div className="max-w-md mx-auto px-4 py-20 text-center space-y-4">
              <div className="w-12 h-12 rounded-full bg-neutral-100 flex items-center justify-center mx-auto text-neutral-500">
                <Lock className="w-6 h-6" />
              </div>
              <h2 className="text-xl font-bold font-display text-neutral-900">Staff Authentication Required</h2>
              <p className="text-xs text-neutral-500 leading-relaxed">
                Please sign in with your staff account to access business operational tools.
              </p>
              <button
                onClick={() => handleOpenAuth('signin')}
                className="py-2.5 px-5 text-xs font-semibold text-white bg-neutral-900 hover:bg-neutral-800 rounded-lg transition-colors"
              >
                Sign In as Staff
              </button>
            </div>
          ) : currentUser.aal === 'aal1' ? (
            <div className="max-w-md mx-auto px-4 py-20 text-center space-y-4">
              <div className="w-12 h-12 rounded-full bg-amber-50 flex items-center justify-center mx-auto text-amber-600">
                <ShieldCheck className="w-6 h-6" />
              </div>
              <h2 className="text-xl font-bold font-display text-neutral-900">MFA Verification Required (AAL2)</h2>
              <p className="text-xs text-neutral-500 leading-relaxed">
                Multi-Factor Authentication (AAL2) is required to access privileged staff operational tools. Please verify your authenticator app code.
              </p>
              <button
                onClick={() => handleOpenAuth('mfa')}
                className="py-2.5 px-5 text-xs font-semibold text-white bg-amber-600 hover:bg-amber-700 rounded-lg transition-colors"
              >
                Complete MFA Verification
              </button>
            </div>
          ) : (
            <StaffDashboard
              businesses={allOwnerBusinesses.length > 0 ? allOwnerBusinesses : businesses}
              currentUserId={currentUser.id}
              onRefreshData={fetchInitialData}
              onOpenProfile={handleOpenProfile}
            />
          )
        )}

        {/* VIEW 7: ADMIN CONSOLE */}
        {currentView === 'admin' && (
          currentUser.role !== 'admin' ? (
            <div className="max-w-md mx-auto px-4 py-20 text-center space-y-4">
              <div className="w-12 h-12 rounded-full bg-neutral-100 flex items-center justify-center mx-auto text-neutral-500">
                <Lock className="w-6 h-6" />
              </div>
              <h2 className="text-xl font-bold font-display text-neutral-900">Administrator Access Required</h2>
              <p className="text-xs text-neutral-500 leading-relaxed">
                This console is restricted to directory administrators.
              </p>
              <button
                onClick={() => handleOpenAuth('signin')}
                className="py-2.5 px-5 text-xs font-semibold text-white bg-neutral-900 hover:bg-neutral-800 rounded-lg transition-colors"
              >
                Sign In as Admin
              </button>
            </div>
          ) : currentUser.aal === 'aal1' ? (
            <div className="max-w-md mx-auto px-4 py-20 text-center space-y-4">
              <div className="w-12 h-12 rounded-full bg-amber-50 flex items-center justify-center mx-auto text-amber-600">
                <ShieldCheck className="w-6 h-6" />
              </div>
              <h2 className="text-xl font-bold font-display text-neutral-900">MFA Verification Required (AAL2)</h2>
              <p className="text-xs text-neutral-500 leading-relaxed">
                Multi-Factor Authentication (AAL2) is mandatory for directory administrative operations.
              </p>
              <button
                onClick={() => handleOpenAuth('mfa')}
                className="py-2.5 px-5 text-xs font-semibold text-white bg-amber-600 hover:bg-amber-700 rounded-lg transition-colors"
              >
                Complete Admin MFA
              </button>
            </div>
          ) : (
            <AdminDashboard
              categories={categories}
              businesses={allOwnerBusinesses.length > 0 ? allOwnerBusinesses : businesses}
              onRefreshData={fetchInitialData}
              onOpenProfile={handleOpenProfile}
            />
          )
        )}
      </main>

      {/* Footer */}
      <footer className="bg-white border-t border-neutral-200 py-8 text-xs text-neutral-500">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <ShortStackLogo size="sm" variant="horizontal" showTagline={true} />
          </div>

          <div className="flex items-center gap-6">
            <button onClick={() => handleNavigate('home')} className="hover:text-neutral-900 transition-colors">
              Home
            </button>
            <button onClick={() => handleNavigate('search')} className="hover:text-neutral-900 transition-colors">
              Search
            </button>
            <button
              onClick={() => setIsTermsModalOpen(true)}
              className="hover:text-neutral-900 transition-colors font-medium text-emerald-700"
            >
              Terms & Conditions
            </button>
            <button
              onClick={() => {
                if (currentUser.role === 'owner') {
                  handleNavigate('owner');
                } else {
                  handleOpenAuth('signup');
                }
              }}
              className="hover:text-neutral-900 transition-colors"
            >
              List a Business ($19.99 initial enrollment)
            </button>
          </div>

          <div className="font-mono text-[11px] text-neutral-400">
            $19.99 Initial Enrollment · $25/2-Month Renewal · Manual Renewals Only · Permanent IDs
          </div>
        </div>
      </footer>

      {/* Global Contact Modal (Call and Email Only) */}
      {activeContactBusiness && (
        <ContactModal
          businessName={activeContactBusiness.name}
          phone={activeContactBusiness.phone}
          email={activeContactBusiness.email}
          isOpen={Boolean(activeContactBusiness)}
          onClose={() => setActiveContactBusiness(null)}
        />
      )}

      {/* Global QR Code Modal */}
      {activeQRBusiness && (
        <QRCodeModal
          url={`${window.location.origin}/?biz=${activeQRBusiness.id}`}
          title={activeQRBusiness.name}
          businessId={activeQRBusiness.id}
          isOpen={!!activeQRBusiness}
          onClose={() => setActiveQRBusiness(null)}
        />
      )}

      {/* Auth Modal (Sign In / Register / Recover) */}
      <AuthModal
        isOpen={isAuthModalOpen}
        onClose={() => setIsAuthModalOpen(false)}
        onAuthSuccess={handleAuthSuccess}
        defaultTab={authModalTab}
      />

      {/* Short Stack Terms & Policies Modal */}
      <TermsModal
        isOpen={isTermsModalOpen}
        onClose={() => setIsTermsModalOpen(false)}
      />
    </div>
  );
}
