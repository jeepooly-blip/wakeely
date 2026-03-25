import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// GET /api/cases/[id]/lawyers — list assigned lawyers for client
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: caseId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Only case owner can list lawyers
  const { data: c } = await supabase
    .from('cases')
    .select('id')
    .eq('id', caseId)
    .eq('client_id', user.id)
    .maybeSingle();
  if (!c) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { data: lawyers } = await supabase
    .from('case_lawyers')
    .select(`
      id, status, permissions, created_at, revoked_at,
      users!case_lawyers_lawyer_id_fkey(id, full_name, email, bar_number, jurisdiction)
    `)
    .eq('case_id', caseId)
    .order('created_at', { ascending: false });

  return NextResponse.json(lawyers ?? []);
}
