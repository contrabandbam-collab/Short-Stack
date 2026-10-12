import React, { useState, useEffect } from 'react';
import { X, Lock, Mail, User, CheckCircle2, AlertCircle } from 'lucide-react';
import { UserAccount } from '../types/pipsqueak.ts';
import { ShortStackLogo } from './ShortStackLogo.tsx';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAuthSuccess: (user: UserAccount) => void;
  defaultTab?: 'signin' | 'signup' | 'recover';
}

export const AuthModal: React.FC<AuthModalProps> = ({
  isOpen,
  onClose,
  onAuthSuccess,
  defaultTab = 'signin',
}) => {
  const [tab, setTab] = useState<'signin' | 'signup' | 'recover'>(defaultTab);

  // Sync tab with defaultTab whenever modal opens
  useEffect(() => {
    if (isOpen) {
      setTab(defaultTab);
      setErrorMsg(null);
      setRecoverySuccessMsg(null);
    }
  }, [isOpen, defaultTab]);

  // Sign In fields
  const [signInEmail, setSignInEmail] = useState('');
  const [signInPassword, setSignInPassword] = useState('');

  // Sign Up fields (Business Owner Registration)
  const [signUpName, setSignUpName] = useState('');
  const [signUpEmail, setSignUpEmail] = useState('');
  const [signUpPassword, setSignUpPassword] = useState('');

  // Recovery fields
  const [recoveryEmail, setRecoveryEmail] = useState('');
  const [recoverySuccessMsg, setRecoverySuccessMsg] = useState<string | null>(null);

  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!signInEmail.trim()) {
      setErrorMsg('Please enter your email address.');
      return;
    }

    setIsLoading(true);
    setErrorMsg(null);

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: signInEmail.trim(),
          password: signInPassword,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        onAuthSuccess(data.user);
        onClose();
      } else {
        const err = await res.json();
        setErrorMsg(err.error || 'Failed to sign in. Please verify your credentials.');
      }
    } catch {
      setErrorMsg('Network error connecting to authentication service.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!signUpName.trim() || !signUpEmail.trim()) {
      setErrorMsg('Please enter your full name and business email.');
      return;
    }

    setIsLoading(true);
    setErrorMsg(null);

    try {
      // Business-owner role is automatically assigned through registration
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: signUpName.trim(),
          email: signUpEmail.trim(),
          password: signUpPassword,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        onAuthSuccess(data.user);
        onClose();
      } else {
        const err = await res.json();
        setErrorMsg(err.error || 'Registration failed.');
      }
    } catch {
      setErrorMsg('Network error creating business account.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleRecover = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!recoveryEmail.trim()) {
      setErrorMsg('Please enter your registered email address.');
      return;
    }

    setIsLoading(true);
    setErrorMsg(null);
    setRecoverySuccessMsg(null);

    try {
      const res = await fetch('/api/auth/recover', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: recoveryEmail.trim() }),
      });

      if (res.ok) {
        const data = await res.json();
        setRecoverySuccessMsg(data.message);
      } else {
        const err = await res.json();
        setErrorMsg(err.error || 'Account recovery failed.');
      }
    } catch {
      setErrorMsg('Network error requesting recovery.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-neutral-900/60 backdrop-blur-xs">
      <div className="relative w-full max-w-md bg-white rounded-xl shadow-xl border border-neutral-200 p-6">
        <div className="flex items-center justify-between pb-3 border-b border-neutral-100">
          <div>
            <div className="mb-2">
              <ShortStackLogo size="sm" variant="horizontal" showTagline={false} />
            </div>
            <h3 className="text-base font-semibold text-neutral-900 font-display">
              {tab === 'signin'
                ? 'Sign In'
                : tab === 'signup'
                ? 'Register Business Account'
                : 'Account Recovery'}
            </h3>
            <p className="text-xs text-neutral-500 mt-0.5">
              {tab === 'signin'
                ? 'Access your listings, flyer studio, and billing'
                : tab === 'signup'
                ? 'Create an account to publish your directory listing'
                : 'Reset your credentials'}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-neutral-400 hover:text-neutral-700 rounded-md transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab switchers: Sign In vs Create Account vs Recover */}
        <div className="flex items-center gap-1 p-1 bg-neutral-100 rounded-lg my-4 text-xs font-medium">
          <button
            type="button"
            onClick={() => {
              setTab('signin');
              setErrorMsg(null);
            }}
            className={`flex-1 py-1.5 rounded-md transition-colors ${
              tab === 'signin' ? 'bg-white text-neutral-900 shadow-xs font-semibold' : 'text-neutral-600 hover:text-neutral-900'
            }`}
          >
            Sign In
          </button>
          <button
            type="button"
            onClick={() => {
              setTab('signup');
              setErrorMsg(null);
            }}
            className={`flex-1 py-1.5 rounded-md transition-colors ${
              tab === 'signup' ? 'bg-white text-neutral-900 shadow-xs font-semibold' : 'text-neutral-600 hover:text-neutral-900'
            }`}
          >
            Create Account
          </button>
          <button
            type="button"
            onClick={() => {
              setTab('recover');
              setErrorMsg(null);
            }}
            className={`flex-1 py-1.5 rounded-md transition-colors ${
              tab === 'recover' ? 'bg-white text-neutral-900 shadow-xs font-semibold' : 'text-neutral-600 hover:text-neutral-900'
            }`}
          >
            Recover
          </button>
        </div>

        {errorMsg && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2 text-xs text-red-700">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* TAB 1: STRAIGHTFORWARD SIGN IN */}
        {tab === 'signin' && (
          <form onSubmit={handleSignIn} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-neutral-700 mb-1">Email Address</label>
              <div className="relative flex items-center">
                <Mail className="absolute left-3 w-4 h-4 text-neutral-400" />
                <input
                  type="email"
                  required
                  value={signInEmail}
                  onChange={(e) => setSignInEmail(e.target.value)}
                  placeholder="name@business.com"
                  className="w-full pl-9 pr-3 py-2 text-xs bg-white border border-neutral-200 rounded-lg text-neutral-900 focus:outline-none focus:ring-1 focus:ring-neutral-900"
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-xs font-medium text-neutral-700">Password</label>
                <button
                  type="button"
                  onClick={() => setTab('recover')}
                  className="text-[11px] text-neutral-500 hover:text-neutral-800"
                >
                  Forgot password?
                </button>
              </div>
              <div className="relative flex items-center">
                <Lock className="absolute left-3 w-4 h-4 text-neutral-400" />
                <input
                  type="password"
                  required
                  value={signInPassword}
                  onChange={(e) => setSignInPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full pl-9 pr-3 py-2 text-xs bg-white border border-neutral-200 rounded-lg text-neutral-900 focus:outline-none focus:ring-1 focus:ring-neutral-900"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-2.5 px-4 text-xs font-semibold text-white bg-neutral-900 hover:bg-neutral-800 rounded-lg disabled:opacity-50 transition-colors"
            >
              {isLoading ? 'Signing In...' : 'Sign In'}
            </button>

            <div className="text-center pt-2 text-xs text-neutral-500">
              Need a business account?{' '}
              <button
                type="button"
                onClick={() => setTab('signup')}
                className="text-neutral-900 font-semibold hover:underline"
              >
                Register here
              </button>
            </div>
          </form>
        )}

        {/* TAB 2: BUSINESS OWNER SIGN UP */}
        {tab === 'signup' && (
          <form onSubmit={handleSignUp} className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-neutral-700 mb-1">Full Name *</label>
              <div className="relative flex items-center">
                <User className="absolute left-3 w-4 h-4 text-neutral-400" />
                <input
                  type="text"
                  required
                  value={signUpName}
                  onChange={(e) => setSignUpName(e.target.value)}
                  placeholder="e.g. Jordan Miller"
                  className="w-full pl-9 pr-3 py-2 text-xs bg-white border border-neutral-200 rounded-lg text-neutral-900 focus:outline-none focus:ring-1 focus:ring-neutral-900"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-neutral-700 mb-1">Business Email Address *</label>
              <div className="relative flex items-center">
                <Mail className="absolute left-3 w-4 h-4 text-neutral-400" />
                <input
                  type="email"
                  required
                  value={signUpEmail}
                  onChange={(e) => setSignUpEmail(e.target.value)}
                  placeholder="jordan@craftbakery.local"
                  className="w-full pl-9 pr-3 py-2 text-xs bg-white border border-neutral-200 rounded-lg text-neutral-900 focus:outline-none focus:ring-1 focus:ring-neutral-900"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-neutral-700 mb-1">Create Password *</label>
              <div className="relative flex items-center">
                <Lock className="absolute left-3 w-4 h-4 text-neutral-400" />
                <input
                  type="password"
                  required
                  value={signUpPassword}
                  onChange={(e) => setSignUpPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full pl-9 pr-3 py-2 text-xs bg-white border border-neutral-200 rounded-lg text-neutral-900 focus:outline-none focus:ring-1 focus:ring-neutral-900"
                />
              </div>
            </div>

            <div className="p-2.5 bg-neutral-50 border border-neutral-200 rounded-lg text-[11px] text-neutral-600">
              Registration assigns your <strong>business-owner</strong> account to create and manage listings. Initial enrollment is $19.99, followed by manual renewals of $25 every 2 months ($12.50 with referral discount). Never auto-billed.
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-2.5 px-4 text-xs font-semibold text-white bg-neutral-900 hover:bg-neutral-800 rounded-lg disabled:opacity-50 transition-colors"
            >
              {isLoading ? 'Creating Account...' : 'Create Business Owner Account'}
            </button>

            <div className="text-center pt-1 text-xs text-neutral-500">
              Already have an account?{' '}
              <button
                type="button"
                onClick={() => setTab('signin')}
                className="text-neutral-900 font-semibold hover:underline"
              >
                Sign in
              </button>
            </div>
          </form>
        )}

        {/* TAB 3: ACCOUNT RECOVERY */}
        {tab === 'recover' && (
          <div className="space-y-4">
            {recoverySuccessMsg ? (
              <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-lg text-center space-y-2">
                <CheckCircle2 className="w-8 h-8 text-emerald-600 mx-auto" />
                <h4 className="text-xs font-semibold text-neutral-900">Recovery Instructions Dispatched</h4>
                <p className="text-[11px] text-neutral-600 leading-relaxed">{recoverySuccessMsg}</p>
                <button
                  type="button"
                  onClick={() => setTab('signin')}
                  className="mt-2 py-1.5 px-3 text-xs font-medium bg-white border border-neutral-200 rounded-lg text-neutral-800"
                >
                  Return to Sign In
                </button>
              </div>
            ) : (
              <form onSubmit={handleRecover} className="space-y-3">
                <p className="text-xs text-neutral-600">
                  Enter your registered business email and we will send instructions to restore access.
                </p>
                <div>
                  <label className="block text-xs font-medium text-neutral-700 mb-1">Email Address</label>
                  <div className="relative flex items-center">
                    <Mail className="absolute left-3 w-4 h-4 text-neutral-400" />
                    <input
                      type="email"
                      required
                      value={recoveryEmail}
                      onChange={(e) => setRecoveryEmail(e.target.value)}
                      placeholder="you@yourbusiness.com"
                      className="w-full pl-9 pr-3 py-2 text-xs bg-white border border-neutral-200 rounded-lg text-neutral-900 focus:outline-none focus:ring-1 focus:ring-neutral-900"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full py-2.5 px-4 text-xs font-semibold text-white bg-neutral-900 hover:bg-neutral-800 rounded-lg disabled:opacity-50 transition-colors"
                >
                  {isLoading ? 'Sending Instructions...' : 'Send Recovery Instructions'}
                </button>

                <div className="text-center pt-1 text-xs text-neutral-500">
                  <button
                    type="button"
                    onClick={() => setTab('signin')}
                    className="text-neutral-700 hover:text-neutral-900"
                  >
                    Back to Sign In
                  </button>
                </div>
              </form>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
