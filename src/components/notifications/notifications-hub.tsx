'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Bell, Check, CheckCheck, X, ExternalLink, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { createClient } from '@/lib/supabase/client';
import type { AppNotification } from '@/types';

interface NotificationsHubProps {
  locale: string;
}

const TYPE_ICONS: Record<string, string> = {
  nde_flag:             '⚠️',
  deadline_reminder:    '📅',
  lawyer_joined:        '👤',
  lawyer_action:        '📋',
  chat_message:         '💬',
  escalation_sent:      '📨',
  subscription_updated: '⭐',
  system:               'ℹ️',
};

export function NotificationsHub({ locale }: NotificationsHubProps) {
  const isRTL   = locale === 'ar';
  const supabase = createClient();

  const [open,     setOpen]     = useState(false);
  const [notifs,   setNotifs]   = useState<AppNotification[]>([]);
  const [loading,  setLoading]  = useState(false);
  const [userId,   setUserId]   = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const unreadCount = notifs.filter((n) => !n.read_at).length;

  const fetch = useCallback(async () => {
    setLoading(true);
    try {
      const res = await window.fetch('/api/notifications?limit=25');
      if (res.ok) setNotifs(await res.json());
    } finally {
      setLoading(false);
    }
  }, []);

  // Get user id for realtime subscription
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUserId(data.user?.id ?? null));
  }, [supabase]);

  // Realtime subscription for new notifications
  useEffect(() => {
    if (!userId) return;
    fetch();

    const channel = supabase
      .channel(`notifications:${userId}`)
      .on('postgres_changes', {
        event:  'INSERT',
        schema: 'public',
        table:  'notifications',
        filter: `user_id=eq.${userId}`,
      }, (payload) => {
        setNotifs((prev) => [payload.new as AppNotification, ...prev]);
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [userId, supabase, fetch]);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const markAllRead = async () => {
    await window.fetch('/api/notifications', { method: 'PATCH' });
    setNotifs((prev) => prev.map((n) => ({ ...n, read_at: n.read_at ?? new Date().toISOString() })));
  };

  const markRead = async (id: string) => {
    await window.fetch(`/api/notifications/${id}`, { method: 'PATCH' });
    setNotifs((prev) => prev.map((n) => n.id === id ? { ...n, read_at: new Date().toISOString() } : n));
  };

  const fmtTime = (d: string) => {
    const diff = Date.now() - new Date(d).getTime();
    const mins  = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days  = Math.floor(diff / 86400000);
    if (mins < 1)  return isRTL ? 'الآن' : 'now';
    if (mins < 60) return isRTL ? `${mins} د` : `${mins}m`;
    if (hours < 24) return isRTL ? `${hours} س` : `${hours}h`;
    return isRTL ? `${days} ي` : `${days}d`;
  };

  return (
    <div className="relative" ref={panelRef}>
      {/* Bell button */}
      <button
        onClick={() => { setOpen((v) => !v); if (!open) fetch(); }}
        className="relative flex h-9 w-9 items-center justify-center rounded-xl hover:bg-muted transition"
        aria-label={isRTL ? 'الإشعارات' : 'Notifications'}
      >
        <Bell className="h-5 w-5 text-muted-foreground" />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -end-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[9px] font-bold text-white">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {/* Panel */}
      {open && (
        <div className={cn(
          'absolute top-11 z-50 w-80 rounded-2xl border border-border bg-card shadow-2xl',
          isRTL ? 'left-0' : 'right-0'
        )}>
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
            <h3 className="text-sm font-bold text-foreground">
              {isRTL ? 'الإشعارات' : 'Notifications'}
              {unreadCount > 0 && (
                <span className="ms-2 rounded-full bg-red-100 text-red-700 px-2 py-0.5 text-[10px] font-bold">
                  {unreadCount}
                </span>
              )}
            </h3>
            <div className="flex items-center gap-1">
              {unreadCount > 0 && (
                <button onClick={markAllRead}
                  className="flex items-center gap-1 rounded-lg px-2 py-1 text-[10px] font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition"
                  title={isRTL ? 'تحديد الكل كمقروء' : 'Mark all read'}>
                  <CheckCheck className="h-3 w-3" />
                  {isRTL ? 'الكل مقروء' : 'All read'}
                </button>
              )}
              <button onClick={() => setOpen(false)} className="rounded-lg p-1 hover:bg-muted transition">
                <X className="h-3.5 w-3.5 text-muted-foreground" />
              </button>
            </div>
          </div>

          {/* List */}
          <div className="max-h-80 overflow-y-auto divide-y divide-border">
            {loading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : notifs.length === 0 ? (
              <div className="py-10 text-center">
                <Bell className="mx-auto h-8 w-8 text-muted-foreground/20 mb-2" />
                <p className="text-xs text-muted-foreground">
                  {isRTL ? 'لا توجد إشعارات' : 'No notifications yet'}
                </p>
              </div>
            ) : (
              notifs.map((n) => (
                <div
                  key={n.id}
                  className={cn(
                    'flex items-start gap-3 px-4 py-3 hover:bg-muted/50 transition cursor-pointer',
                    !n.read_at && 'bg-[#1A3557]/5 dark:bg-[#1A3557]/10'
                  )}
                  onClick={() => {
                    if (!n.read_at) markRead(n.id);
                    if (n.action_url) window.location.href = `/${locale}${n.action_url}`;
                  }}
                >
                  <span className="text-lg shrink-0 mt-0.5">{TYPE_ICONS[n.type] ?? 'ℹ️'}</span>
                  <div className="min-w-0 flex-1">
                    <p className={cn('text-xs font-semibold text-foreground leading-snug', !n.read_at && 'text-[#1A3557] dark:text-blue-300')}>
                      {n.title}
                    </p>
                    {n.body && (
                      <p className="text-[10px] text-muted-foreground mt-0.5 leading-snug">{n.body}</p>
                    )}
                    <p className="text-[10px] text-muted-foreground/60 mt-1">{fmtTime(n.created_at)}</p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {!n.read_at && (
                      <div className="h-2 w-2 rounded-full bg-[#1A3557]" />
                    )}
                    {n.action_url && (
                      <ExternalLink className="h-3 w-3 text-muted-foreground/40" />
                    )}
                  </div>
                </div>
              ))
            )}
          </div>

          {notifs.length > 0 && (
            <div className="border-t border-border px-4 py-2.5 text-center">
              <a href={`/${locale}/notifications`}
                className="text-xs text-[#1A3557] dark:text-blue-400 hover:underline font-medium">
                {isRTL ? 'عرض جميع الإشعارات' : 'View all notifications'}
              </a>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
