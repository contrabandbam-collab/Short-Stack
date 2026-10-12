import { createClient, SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabasePublishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || '';

export const isSupabaseClientConfigured = (): boolean => {
  return Boolean(supabaseUrl && supabasePublishableKey && supabaseUrl.startsWith('http'));
};

export const supabase: SupabaseClient | null = isSupabaseClientConfigured()
  ? createClient(supabaseUrl, supabasePublishableKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  : null;

export async function getSupabaseAccessToken(): Promise<string | null> {
  if (!supabase) return null;
  try {
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token || null;
  } catch (err) {
    console.error('Failed to get Supabase session token', err);
    return null;
  }
}

export async function getAuthenticatorAssuranceLevel(): Promise<{
  currentLevel: 'aal1' | 'aal2' | null;
  nextLevel: 'aal1' | 'aal2' | null;
} | null> {
  if (!supabase) return null;
  try {
    const { data, error } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (error || !data) return null;
    return {
      currentLevel: data.currentLevel as 'aal1' | 'aal2',
      nextLevel: data.nextLevel as 'aal1' | 'aal2',
    };
  } catch (err) {
    console.error('Failed to get MFA assurance level', err);
    return null;
  }
}
