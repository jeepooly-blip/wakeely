'use server';

import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import type { CaseType } from '@/types';

export interface DeadlineInput {
  title: string;
  due_date: string;
  type: 'court' | 'submission' | 'internal';
}

export interface CreateCaseInput {
  title:            string;
  case_type:        CaseType;
  jurisdiction:     string;
  city?:            string;
  description?:     string;
  lawyer_name?:     string;
  lawyer_bar_number?: string;
  lawyer_phone?:    string;
  lawyer_email?:    string;
  deadlines?:       DeadlineInput[];
}

export interface DraftInput {
  draft_data:  Record<string, unknown>;
  draft_step:  number;
  title?:      string;
  case_type?:  CaseType;
}

// ── Create a full case from wizard data ────────────────────────
export async function createCase(input: CreateCaseInput): Promise<{ id: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/en/login');

  // 1. Insert the case
  const { data: newCase, error: caseError } = await supabase
    .from('cases')
    .insert({
      client_id:         user.id,
      title:             input.title,
      case_type:         input.case_type,
      jurisdiction:      input.jurisdiction,
      city:              input.city ?? null,
      description:       input.description ?? null,
      lawyer_name:       input.lawyer_name ?? null,
      lawyer_bar_number: input.lawyer_bar_number ?? null,
      lawyer_phone:      input.lawyer_phone ?? null,
      lawyer_email:      input.lawyer_email ?? null,
      status:            'active',
      health_score:      100,
    })
    .select('id')
    .single();

  if (caseError || !newCase) {
    throw new Error(caseError?.message ?? 'Failed to create case');
  }

  // 2. Insert deadlines if any
  if (input.deadlines?.length) {
    const deadlineRows = input.deadlines
      .filter((d) => d.title && d.due_date)
      .map((d) => ({
        case_id:    newCase.id,
        title:      d.title,
        due_date:   d.due_date,
        type:       d.type,
        status:     'pending' as const,
        created_by: user.id,
      }));

    if (deadlineRows.length > 0) {
      await supabase.from('deadlines').insert(deadlineRows);
    }
  }

  // 3. Write case_created timeline event
  await supabase.from('timeline_events').insert({
    case_id:             newCase.id,
    actor_id:            user.id,
    event_type:          'case_created',
    payload: {
      title:        input.title,
      case_type:    input.case_type,
      jurisdiction: input.jurisdiction,
    },
    is_system_generated: false,
  });

  return { id: newCase.id };
}

// ── Save / update a wizard draft ───────────────────────────────
export async function saveDraft(
  caseId: string | null,
  input: DraftInput
): Promise<{ id: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  if (caseId) {
    // Update existing draft
    const { error } = await supabase
      .from('cases')
      .update({
        draft_data:  input.draft_data,
        draft_step:  input.draft_step,
        title:       input.title ?? 'Untitled case',
        case_type:   input.case_type ?? 'other',
      })
      .eq('id', caseId)
      .eq('client_id', user.id);

    if (error) throw new Error(error.message);
    return { id: caseId };
  } else {
    // Create new draft row
    const { data, error } = await supabase
      .from('cases')
      .insert({
        client_id:   user.id,
        title:       input.title ?? 'Untitled case',
        case_type:   input.case_type ?? 'other',
        draft_data:  input.draft_data,
        draft_step:  input.draft_step,
        status:      'archived', // Draft cases are 'archived' until wizard completes
        health_score: 50,
      })
      .select('id')
      .single();

    if (error || !data) throw new Error(error?.message ?? 'Failed to save draft');
    return { id: data.id };
  }
}

// ── Promote draft → active case ────────────────────────────────
export async function activateDraft(caseId: string): Promise<void> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  await supabase
    .from('cases')
    .update({ status: 'active', draft_data: null, draft_step: null })
    .eq('id', caseId)
    .eq('client_id', user.id);
}

// ── Get cases for current user ─────────────────────────────────
export async function getMyCases() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const { data } = await supabase
    .from('cases')
    .select(`
      id, title, case_type, jurisdiction, city, status,
      health_score, lawyer_name, created_at, updated_at,
      deadlines(id, due_date, status),
      nde_flags(id, severity, resolved_at),
      documents(id)
    `)
    .eq('client_id', user.id)
    .eq('status', 'active')
    .order('updated_at', { ascending: false });

  return data ?? [];
}
