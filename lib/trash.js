import { supabase } from './supabase';

export const TRASH_TABLES = {
  defect: 'defect_reports',
  fives: 'fives_reports',
  doc: 'ocr_results',
};

export async function moveToTrash(table, ids) {
  if (!ids.length) return;
  const { error } = await supabase
    .from(table)
    .update({
      is_deleted: true,
      deleted_at: new Date().toISOString(),
    })
    .in('id', ids);
  if (error) throw error;
}

export async function restoreFromTrash(table, ids) {
  if (!ids.length) return;
  const { error } = await supabase
    .from(table)
    .update({
      is_deleted: false,
      deleted_at: null,
    })
    .in('id', ids);
  if (error) throw error;
}

export async function permanentlyDelete(table, ids) {
  if (!ids.length) return;
  const { error } = await supabase.from(table).delete().in('id', ids);
  if (error) throw error;
}
