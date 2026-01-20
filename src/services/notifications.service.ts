import { supabase } from '@/lib/supabaseClient';

export interface NotificationItem {
  id: string;
  type: 'general' | 'exercise';
  title: string;
  content: string;
  reference_id: string;
  created_at: string;
  is_read: boolean;
}

export const fetchNotifications = async (): Promise<NotificationItem[]> => {
  const { data, error } = await supabase.rpc('get_student_notifications');
  if (error) throw error;
  return data || [];
};

export const markAsRead = async (id: string, type: 'general' | 'exercise') => {
  const { error } = await supabase.rpc('mark_notification_read', {
    p_id: id,
    p_type: type
  });
  if (error) throw error;
};

export const markAllAsRead = async (ids: {id: string, type: string}[]) => {
  // Loop simples para MVP, idealmente seria uma query em batch no SQL
  for (const n of ids) {
    await markAsRead(n.id, n.type as any);
  }
};
