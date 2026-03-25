import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { Bell, CheckCheck, ExternalLink } from 'lucide-react';
import { cn } from '@/lib/utils';

const TYPE_ICONS: Record<string, string> = {
  nde_flag: '⚠️', deadline_reminder: '📅', lawyer_joined: '👤',
  lawyer_action: '📋', chat_message: '💬', escalation_sent: '📨',
  subscription_updated: '⭐', system: 'ℹ️',
};

export default async function NotificationsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;          // ✅ locale from URL
  const supabase = await createClient();
  const isRTL    = locale === 'ar';

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/${locale}/login`);

  const { data: notifs } = await supabase
    .from('notifications')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(100);

  const all = notifs ?? [];
  const unread = all.filter((n) => !n.read_at);

  const fmtDateTime = (d: string) =>
    new Date(d).toLocaleString(isRTL ? 'ar-AE' : 'en-AE', {
      day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
    });

  return (
    <div className="max-w-2xl mx-auto space-y-5 pb-10">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black text-foreground">
            {isRTL ? 'الإشعارات' : 'Notifications'}
          </h1>
          {unread.length > 0 && (
            <p className="text-sm text-muted-foreground mt-0.5">
              {isRTL ? `${unread.length} غير مقروء` : `${unread.length} unread`}
            </p>
          )}
        </div>
        {unread.length > 0 && (
          <form action={async () => {
            'use server';
            const sb = await createClient();
            const { data: { user: u } } = await sb.auth.getUser();
            if (u) await sb.from('notifications').update({ read_at: new Date().toISOString() })
              .eq('user_id', u.id).is('read_at', null);
          }}>
            <button type="submit"
              className="flex items-center gap-1.5 rounded-xl border border-border px-4 py-2 text-xs font-medium text-muted-foreground hover:bg-muted transition">
              <CheckCheck className="h-3.5 w-3.5" />
              {isRTL ? 'تحديد الكل كمقروء' : 'Mark all read'}
            </button>
          </form>
        )}
      </div>

      {all.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-border py-20 text-center">
          <Bell className="h-12 w-12 text-muted-foreground/20 mb-3" />
          <p className="text-base font-semibold text-foreground">
            {isRTL ? 'لا توجد إشعارات' : 'No notifications yet'}
          </p>
        </div>
      ) : (
        <div className="rounded-2xl border border-border bg-card overflow-hidden divide-y divide-border">
          {all.map((n) => (
            <div key={n.id}
              className={cn('flex items-start gap-4 px-5 py-4', !n.read_at && 'bg-[#1A3557]/5 dark:bg-[#1A3557]/10')}>
              <span className="text-xl shrink-0 mt-0.5">{TYPE_ICONS[n.type] ?? 'ℹ️'}</span>
              <div className="min-w-0 flex-1">
                <p className={cn('text-sm font-semibold text-foreground', !n.read_at && 'text-[#1A3557] dark:text-blue-300')}>
                  {n.title}
                </p>
                {n.body && <p className="text-xs text-muted-foreground mt-0.5">{n.body}</p>}
                <p className="text-[10px] text-muted-foreground/60 mt-1">{fmtDateTime(n.created_at)}</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {!n.read_at && <div className="h-2 w-2 rounded-full bg-[#1A3557]" />}
                {n.action_url && (
                  <a href={`/${locale}${n.action_url}`}
                    className="rounded-lg p-1.5 hover:bg-muted transition text-muted-foreground hover:text-foreground">
                    <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
