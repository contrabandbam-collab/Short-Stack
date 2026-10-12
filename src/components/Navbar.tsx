import React, { useState } from 'react';
import type { UserAccount } from '../types/pipsqueak.ts';
import { LogOut, LogIn, User, Menu, X } from 'lucide-react';
import { ShortStackLogo } from './ShortStackLogo.tsx';

interface NavbarProps {
  currentView: string;
  onNavigate: (view: string, param?: string) => void;
  currentUser: UserAccount;
  onOpenAuth: (tab?: 'signin' | 'signup' | 'recover') => void;
  onLogout: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  currentView,
  onNavigate,
  currentUser,
  onOpenAuth,
  onLogout,
}) => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const isAuthenticated = currentUser.role !== 'visitor';

  const handleNavClick = (view: string) => {
    setMobileMenuOpen(false);
    onNavigate(view);
  };

  return (
    <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-xs border-b border-neutral-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        {/* Zone 1: Official Short Stack Logo */}
        <div className="flex items-center gap-3">
          {/* Mobile hamburger button */}
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="md:hidden p-1.5 text-neutral-600 hover:text-neutral-900 rounded-lg hover:bg-neutral-100 transition-colors"
            aria-label="Toggle navigation menu"
          >
            {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>

          <button
            onClick={() => handleNavClick('home')}
            className="hover:opacity-90 transition-opacity focus:outline-none flex items-center"
            title="Short Stack — Small Businesses. Big Deal."
          >
            <ShortStackLogo size="md" variant="horizontal" showTagline={false} />
          </button>
        </div>

        {/* Zone 2: Navigation Links (Clean: Home, Search, Protected Portals) */}
        <nav className="hidden md:flex items-center gap-7 text-sm font-medium text-neutral-600">
          <button
            onClick={() => handleNavClick('home')}
            className={`hover:text-neutral-900 transition-colors ${
              currentView === 'home' ? 'text-neutral-900 font-semibold' : ''
            }`}
          >
            Home
          </button>
          <button
            onClick={() => handleNavClick('search')}
            className={`hover:text-neutral-900 transition-colors ${
              currentView === 'search' ? 'text-neutral-900 font-semibold' : ''
            }`}
          >
            Search
          </button>

          {currentUser.role === 'admin' ? (
            <button
              onClick={() => handleNavClick('admin')}
              className={`hover:text-neutral-900 transition-colors ${
                currentView === 'admin' ? 'text-neutral-900 font-semibold' : ''
              }`}
            >
              Admin Panel
            </button>
          ) : currentUser.role === 'staff' ? (
            <button
              onClick={() => handleNavClick('staff')}
              className={`hover:text-neutral-900 transition-colors ${
                currentView === 'staff' ? 'text-neutral-900 font-semibold' : ''
              }`}
            >
              Staff Portal
            </button>
          ) : currentUser.role === 'owner' ? (
            <button
              onClick={() => handleNavClick('owner')}
              className={`hover:text-neutral-900 transition-colors ${
                currentView === 'owner' ? 'text-neutral-900 font-semibold' : ''
              }`}
            >
              Owner Dashboard
            </button>
          ) : null}
        </nav>

        {/* Zone 3: 1-2 primary actions */}
        <div className="flex items-center gap-3">
          {isAuthenticated ? (
            <div className="flex items-center gap-2.5">
              {/* Signed-in identity label */}
              <div className="hidden sm:flex items-center gap-1.5 py-1.5 px-3 text-xs font-medium text-neutral-800 bg-neutral-100 rounded-lg border border-neutral-200">
                <User className="w-3.5 h-3.5 text-neutral-500" />
                <span>{currentUser.name}</span>
              </div>

              {/* Clearly labeled Log out action */}
              <button
                onClick={() => {
                  setMobileMenuOpen(false);
                  onLogout();
                }}
                className="inline-flex items-center gap-1.5 py-2 px-3 text-xs font-semibold text-neutral-700 bg-neutral-100 hover:bg-neutral-200 hover:text-red-700 rounded-lg transition-colors border border-neutral-200 whitespace-nowrap"
                title="End current session and log out"
                aria-label="Log out"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>Log out</span>
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  setMobileMenuOpen(false);
                  onOpenAuth('signin');
                }}
                className="inline-flex items-center gap-1 py-2 px-3 text-xs font-semibold text-neutral-800 bg-neutral-100 hover:bg-neutral-200 rounded-lg transition-colors border border-neutral-300"
                title="Business Owner Sign-In & Dashboard Access"
              >
                <LogIn className="w-3.5 h-3.5" />
                <span>Your Stacks</span>
              </button>

              <button
                onClick={() => {
                  setMobileMenuOpen(false);
                  onOpenAuth('signup');
                }}
                className="inline-flex items-center justify-center py-2 px-3.5 text-xs font-semibold text-white bg-neutral-900 hover:bg-neutral-800 rounded-lg transition-colors whitespace-nowrap"
              >
                List a Business
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Mobile Drawer Menu */}
      {mobileMenuOpen && (
        <div className="md:hidden border-t border-neutral-200 bg-white px-4 py-3 space-y-2 shadow-lg">
          <button
            onClick={() => handleNavClick('home')}
            className={`w-full text-left py-2 px-3 rounded-lg text-sm font-medium ${
              currentView === 'home' ? 'bg-neutral-100 text-neutral-900 font-semibold' : 'text-neutral-700'
            }`}
          >
            Home
          </button>
          <button
            onClick={() => handleNavClick('search')}
            className={`w-full text-left py-2 px-3 rounded-lg text-sm font-medium ${
              currentView === 'search' ? 'bg-neutral-100 text-neutral-900 font-semibold' : 'text-neutral-700'
            }`}
          >
            Search
          </button>

          {currentUser.role === 'admin' ? (
            <button
              onClick={() => handleNavClick('admin')}
              className={`w-full text-left py-2 px-3 rounded-lg text-sm font-medium ${
                currentView === 'admin' ? 'bg-neutral-100 text-neutral-900 font-semibold' : 'text-neutral-700'
              }`}
            >
              Admin Panel
            </button>
          ) : currentUser.role === 'staff' ? (
            <button
              onClick={() => handleNavClick('staff')}
              className={`w-full text-left py-2 px-3 rounded-lg text-sm font-medium ${
                currentView === 'staff' ? 'bg-neutral-100 text-neutral-900 font-semibold' : 'text-neutral-700'
              }`}
            >
              Staff Portal
            </button>
          ) : currentUser.role === 'owner' ? (
            <button
              onClick={() => handleNavClick('owner')}
              className={`w-full text-left py-2 px-3 rounded-lg text-sm font-medium ${
                currentView === 'owner' ? 'bg-neutral-100 text-neutral-900 font-semibold' : 'text-neutral-700'
              }`}
            >
              Owner Dashboard
            </button>
          ) : (
            <button
              onClick={() => {
                setMobileMenuOpen(false);
                onOpenAuth('signup');
              }}
              className="w-full text-left py-2 px-3 rounded-lg text-sm font-medium text-neutral-700"
            >
              List a Business ($19.99 initial enrollment)
            </button>
          )}

          {isAuthenticated && (
            <div className="pt-2 border-t border-neutral-100 text-xs text-neutral-500 px-3">
              Signed in as: <strong className="text-neutral-800">{currentUser.name}</strong> ({currentUser.role})
            </div>
          )}
        </div>
      )}
    </header>
  );
};
