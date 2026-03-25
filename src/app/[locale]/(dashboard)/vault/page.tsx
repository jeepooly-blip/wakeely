import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { Link } from '@/i18n/navigation';
import { Lock, FileText, FolderOpen, Calendar, Hash, Scale } from 'lucide-react';
import { cn } from '@/lib/utils';

export default async function VaultPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;          // ✅ locale from URL
  const supabase = await createClient();
  const isRTL    = locale === 'ar';

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/${locale}/login`);

  // Fetch all documents across user's cases
  const { data: cases } = await supabase
    .from('cases')
    .select('id, title')
    .eq('client_id', user.id)
    .eq('status', 'active');

  const caseIds  = (cases ?? []).map((c) => c.id);
  const caseMap  = Object.fromEntries((cases ?? []).map((c) => [c.id, c.title]));

  const { data: docs } = caseIds.length
    ? await supabase
        .from('documents')
        .select('id, file_name, file_size, file_hash, version, created_at, case_id, mime_type')
        .in('case_id', caseIds)
        .order('created_at', { ascending: false })
    : { data: [] };

  const allDocs = docs ?? [];
  const totalSize = allDocs.reduce((sum, d) => sum + (d.file_size ?? 0), 0);

  const fmtSize = (bytes: number) => {
    if (bytes < 1024)       return `${bytes} B`;
    if (bytes < 1024*1024)  return `${(bytes/1024).toFixed(1)} KB`;
    return `${(bytes/(1024*1024)).toFixed(1)} MB`;
  };

  const fmtDate = (d: string) => new Date(d).toLocaleDateString(isRTL ? 'ar-AE' : 'en-AE', {
    day: 'numeric', month: 'short', year: 'numeric',
  });

  const getFileIcon = (mime: string) => {
    if (mime?.includes('pdf'))   return '📄';
    if (mime?.includes('image')) return '🖼️';
    if (mime?.includes('word'))  return '📝';
    return '📎';
  };

  return (
    <div className="space-y-6 pb-10">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black text-foreground flex items-center gap-2">
            <Lock className="h-6 w-6 text-[#1A3557]" />
            {isRTL ? 'خزنة المستندات' : 'Evidence Vault'}
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {isRTL
              ? `${allDocs.length} مستند · إجمالي الحجم: ${fmtSize(totalSize)}`
              : `${allDocs.length} document${allDocs.length !== 1 ? 's' : ''} · ${fmtSize(totalSize)} total`}
          </p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: isRTL ? 'إجمالي المستندات' : 'Total Documents', value: allDocs.length,          icon: FileText, color: 'text-[#1A3557] bg-[#1A3557]/10' },
          { label: isRTL ? 'إجمالي الحجم'     : 'Total Size',       value: fmtSize(totalSize),      icon: Lock,     color: 'text-[#0E7490] bg-[#0E7490]/10' },
          { label: isRTL ? 'القضايا المحمية'  : 'Protected Cases',  value: caseIds.length,          icon: Scale,    color: 'text-emerald-600 bg-emerald-100 dark:bg-emerald-900/20' },
        ].map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="rounded-2xl border border-border bg-card p-5">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-medium text-muted-foreground">{label}</p>
              <div className={cn('flex h-7 w-7 items-center justify-center rounded-lg', color)}>
                <Icon className="h-3.5 w-3.5" />
              </div>
            </div>
            <p className="text-2xl font-black text-foreground">{value}</p>
          </div>
        ))}
      </div>

      {/* Document list */}
      {allDocs.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-border bg-card py-20 text-center">
          <Lock className="mx-auto h-14 w-14 text-muted-foreground/20 mb-4" />
          <p className="text-lg font-semibold text-foreground mb-1">
            {isRTL ? 'الخزنة فارغة' : 'Vault is empty'}
          </p>
          <p className="text-sm text-muted-foreground max-w-xs leading-relaxed mb-5">
            {isRTL
              ? 'أضف مستندات عند إنشاء أو تعديل قضية لتُحفظ هنا بأمان.'
              : 'Add documents when creating or editing a case and they will be stored here securely.'}
          </p>
          <Link href="/cases/new"
            className="flex items-center gap-2 rounded-xl bg-[#1A3557] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#1e4a7a] transition">
            {isRTL ? 'إنشاء قضية جديدة' : 'Create a Case'}
          </Link>
        </div>
      ) : (
        <div className="rounded-2xl border border-border bg-card overflow-hidden">
          <div className="px-5 py-4 border-b border-border flex items-center justify-between">
            <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
              <FileText className="h-4 w-4 text-[#1A3557]" />
              {isRTL ? 'جميع المستندات' : 'All Documents'}
              <span className="rounded-full bg-muted px-2 py-0.5 text-xs">{allDocs.length}</span>
            </h2>
            <p className="text-xs text-muted-foreground">
              {isRTL ? 'مُؤمَّنة بـ SHA-256' : 'SHA-256 fingerprinted'}
            </p>
          </div>

          <div className="divide-y divide-border">
            {allDocs.map((doc) => (
              <div key={doc.id} className="flex items-center gap-4 px-5 py-4 hover:bg-muted/30 transition">
                <span className="text-2xl shrink-0">{getFileIcon(doc.mime_type ?? '')}</span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-foreground truncate">{doc.file_name}</p>
                  <div className="flex items-center gap-3 mt-0.5 text-[10px] text-muted-foreground flex-wrap">
                    <span className="flex items-center gap-1">
                      <FolderOpen className="h-3 w-3" />
                      {caseMap[doc.case_id] ?? doc.case_id.slice(0, 8)}
                    </span>
                    <span className="flex items-center gap-1" dir="ltr">
                      <Hash className="h-3 w-3" />
                      {doc.file_hash?.slice(0, 12)}…
                    </span>
                    <span>v{doc.version}</span>
                    <span>{fmtSize(doc.file_size ?? 0)}</span>
                    <span className="flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      {fmtDate(doc.created_at)}
                    </span>
                  </div>
                </div>
                <Link href={`/cases/${doc.case_id}`}
                  className="shrink-0 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition">
                  {isRTL ? 'القضية' : 'Case'}
                </Link>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Security note */}
      <div className="rounded-2xl border border-[#1A3557]/20 bg-[#1A3557]/5 dark:bg-[#1A3557]/10 px-5 py-4">
        <p className="text-xs text-[#1A3557] dark:text-blue-300 leading-relaxed flex items-start gap-2">
          <Lock className="h-3.5 w-3.5 shrink-0 mt-0.5" />
          {isRTL
            ? 'جميع المستندات مشفّرة بمعيار AES-256 ومُؤمَّنة بـ SHA-256. لا أحد غيرك يستطيع الوصول إليها.'
            : 'All documents are AES-256 encrypted at rest and SHA-256 fingerprinted for integrity verification. Only you can access them.'}
        </p>
      </div>
    </div>
  );
}
