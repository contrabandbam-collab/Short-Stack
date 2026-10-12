import React, { useState, useEffect } from 'react';
import { X, Lock, Mail, User, CheckCircle2, AlertCircle, ShieldCheck } from 'lucide-react';
import type { UserAccount } from '../types/pipsqueak.ts';
import { ShortStackLogo } from './ShortStackLogo.tsx';
import { supabase, isSupabaseClientConfigured } from '../utils/supabaseClient.ts';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAuthSuccess: (user: UserAccount) => void;
  defaultTab?: 'signin' | 'signup' | 'recover' | 'mfa';
}

export const AuthModal: React.FC<AuthModalProps> = ({
  isOpen,
  onClose,
  onAuthSuccess,
  defaultTab = 'signin',
}) => {
  const [tab, setTab] = useState<'signin' | 'signup' | 'recover' | 'mfa'>(defaultTab);

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

  // MFA fields
  const [mfaCode, setMfaCode] = useState('');
  const [pendingAccessToken, setPendingAccessToken] = useState<string | null>(null);

  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const verifyTokenWithServer = async (accessToken: string): Promise<boolean> => {
    const res = await fetch('/api/auth/verify-token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ accessToken }),
    });

    if (res.ok) {
      const data = await res.json();
      onAuthSuccess(data.user);
      onClose();
      return true;
    } else {
      const err = await res.json();
      setErrorMsg(err.error || 'Server rejected authentication token.');
      return false;
    }
  };

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!signInEmail.trim()) {
      setErrorMsg('Please enter your email address.');
      return;
    }

    setIsLoading(true);
    setErrorMsg(null);

    try {
      if (isSupabaseClientConfigured() && supabase) {
        // Authenticate directly with Supabase Auth authority
        const { data, error } = await supabase.auth.signInWithPassword({
          email: signInEmail.trim(),
          password: signInPassword,
        });

        if (error) {
          setErrorMsg(error.message || 'Invalid email or password.');
          setIsLoading(false);
          return;
        }

        if (data.session) {
          // Check if MFA challenge is needed
          const aal = (data.session.user.app_metadata?.aal as string) || 'aal1';
          const factors = await supabase.auth.mfa.listFactors();
          const verifiedFactors = factors.data?.totp?.filter((f) => f.status === 'verified') || [];

          if (verifiedFactors.length > 0 && aal !== 'aal2') {
            setPendingAccessToken(data.session.access_token);
            setTab('mfa');
            setIsLoading(false);
            return;
          }

          const success = await verifyTokenWithServer(data.session.access_token);
          if (!success) {
            setIsLoading(false);
            return;
          }
        }
      } else {
        // Local/server authentication fallback when Supabase client env is unconfigured
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
      if (isSupabaseClientConfigured() && supabase) {
        const { data, error } = await supabase.auth.signUp({
          email: signUpEmail.trim(),
          password: signUpPassword,
          options: {
            data: { name: signUpName.trim() },
          },
        });

        if (error) {
          setErrorMsg(error.message || 'Registration failed.');
          setIsLoading(false);
          return;
        }

        if (data.session) {
          await verifyTokenWithServer(data.session.access_token);
        } else {
          setRecoverySuccessMsg('Account created. Please check your inbox for an email confirmation link before signing in.');
          setTab('recover');
        }
      } else {
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
      }
    } catch {
      setErrorMsg('Network error creating business account.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleMfaVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!mfaCode.trim() || mfaCode.trim().length !== 6) {
      setErrorMsg('Please enter your 6-digit verification code.');
      return;
    }

    setIsLoading(true);
    setErrorMsg(null);

    try {
      if (isSupabaseClientConfigured() && supabase) {
        const factors = await supabase.auth.mfa.listFactors();
        const factor = factors.data?.totp?.[0];
        if (factor) {
          const challenge = await supabase.auth.mfa.challenge({ factorId: factor.id });
          if (challenge.error) {
            setErrorMsg(challenge.error.message);
            setIsLoading(false);
            return;
          }
          const verify = await supabase.auth.mfa.verify({
            factorId: factor.id,
            challengeId: challenge.data.id,
            code: mfaCode.trim(),
          });
          if (verify.error) {
            setErrorMsg(verify.error.message || 'Invalid MFA verification code.');
            setIsLoading(false);
            return;
          }
          if (verify.data.access_token) {
            await verifyTokenWithServer(verify.data.access_token);
            return;
          }
        }
      }

      if (pendingAccessToken) {
        await verifyTokenWithServer(pendingAccessToken);
      }
    } catch {
      setErrorMsg('Failed to verify MFA code.');
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
      if (isSupabaseClientConfigured() && supabase) {
        const { error } = await supabase.auth.resetPasswordForEmail(recoveryEmail.trim());
        if (error) {
          setErrorMsg(error.message || 'Failed to dispatch recovery instructions.');
        } else {
          setRecoverySuccessMsg(`Password reset instructions have been dispatched to ${recoveryEmail.trim()}.`);
        }
      } else {
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
                : tab === 'mfa'
                ? 'Two-Factor Authentication'
                : 'Account Recovery'}
            </h3>
            <p className="text-xs text-neutral-500 mt-0.5">
              {tab === 'signin'
                ? 'Access your listings, flyer studio, and billing'
                : tab === 'signup'
                ? 'Create an account to publish your directory listing'
                : tab === 'mfa'
                ? 'Enter your authenticator security code'
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
        {tab !== 'mfa' && (
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
        )}

        {errorMsg && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2 text-xs text-red-700">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* TAB MFA: TWO FACTOR AUTHENTICATION */}
        {tab === 'mfa' && (
          <form onSubmit={handleMfaVerify} className="space-y-4 my-2">
            <div className="p-3 bg-neutral-50 border border-neutral-200 rounded-lg flex items-start gap-2.5 text-xs text-neutral-700">
              <ShieldCheck className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-neutral-900">Privileged Security (AAL2)</p>
                <p className="text-neutral-600 mt-0.5">
                  Enter the 6-digit verification code from your authenticator app (Google Authenticator, 1Password, or Authy).
                </p>
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-neutral-700 mb-1">6-Digit Security Code</label>
              <input
                type="text"
                required
                maxLength={6}
                value={mfaCode}
                onChange={(e) => setMfaCode(e.target.value.replace(/\D/g, ''))}
                placeholder="123456"
                className="w-full text-center tracking-widest text-lg font-mono py-2.5 bg-white border border-neutral-200 rounded-lg text-neutral-900 focus:outline-none focus:ring-1 focus:ring-neutral-900"
              />
            </div>

            <button
              type="submit"
              disabled={isLoading || mfaCode.length !== 6}
              className="w-full py-2.5 px-4 text-xs font-semibold text-white bg-neutral-900 hover:bg-neutral-800 rounded-lg disabled:opacity-50 transition-colors"
            >
              {isLoading ? 'Verifying Code...' : 'Verify & Continue'}
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
              New accounts start with a visitor profile. Verified business ownership or staff privileges are granted via authorized assignment or administrator approval.
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-2.5 px-4 text-xs font-semibold text-white bg-neutral-900 hover:bg-neutral-800 rounded-lg disabled:opacity-50 transition-colors"
            >
              {isLoading ? 'Creating Account...' : 'Create Account'}
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
