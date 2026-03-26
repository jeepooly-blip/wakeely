'use client';

import { useEffect, useState, useCallback } from 'react';
import { createClient }    from '@/lib/supabase/client';
import { identifyUser, resetAnalytics } from '@/components/analytics-provider';
import type { User }       from '@supabase/supabase-js';
import type { WakeelaUser } from '@/types';

interface UseUserReturn {
  user:       User | null;
  profile:    WakeelaUser | null;
  loading:    boolean;
  signOut:    () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

export function useUser(): UseUserReturn {
  const supabase = createClient();
  const [user,    setUser]    = useState<User | null>(null);
  const [profile, setProfile] = useState<WakeelaUser | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchProfile = useCallback(async (userId: string) => {
    const { data } = await supabase
      .from('users')
      .select('*')
      .eq('id', userId)
      .maybeSingle();
    if (data) {
      setProfile(data as WakeelaUser);
      // Identify user in PostHog after profile loads
      identifyUser({
        userId:      userId,
        role:        data.role,
        tier:        data.subscription_tier,
        locale:      data.locale,
        data_region: data.data_region,
      });
    }
  }, [supabase]);

  const refreshProfile = useCallback(async () => {
    if (user) await fetchProfile(user.id);
  }, [user, fetchProfile]);

  useEffect(() => {
    // Get initial session
    supabase.auth.getUser().then(({ data: { user } }) => {
      setUser(user);
      if (user) fetchProfile(user.id);
      setLoading(false);
    });

    // Listen for auth state changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        const currentUser = session?.user ?? null;
        setUser(currentUser);
        if (currentUser) {
          await fetchProfile(currentUser.id);
        } else {
          setProfile(null);
        }
        setLoading(false);
      }
    );

    return () => subscription.unsubscribe();
  }, [supabase, fetchProfile]);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setUser(null);
    setProfile(null);
    resetAnalytics();
  }, [supabase]);

  return { user, profile, loading, signOut, refreshProfile };
}
