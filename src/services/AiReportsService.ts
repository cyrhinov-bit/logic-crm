import { supabase } from '../lib/supabase';
import type { AiDailyActivity, AiWeeklyReport, AiWeeklyReportContent } from '../types/reports';
import { format, startOfWeek, endOfWeek, parseISO, isValid } from 'date-fns';
import { fr } from 'date-fns/locale';

export const getWeekId = (date: Date): string => {
  const start = startOfWeek(date, { weekStartsOn: 1 });
  const year = format(start, 'yyyy');
  const week = format(start, 'w');
  return `${year}-W${week}`;
};

export const getDayName = (date: Date): string => {
  return format(date, 'EEEE', { locale: fr });
};

export const AiReportsService = {
  // DAILY ACTIVITIES
  async getDailyActivitiesForWeek(userId: string, date: Date): Promise<AiDailyActivity[]> {
    const weekId = getWeekId(date);
    const { data, error } = await supabase
      .from('ai_daily_activities')
      .select('*')
      .eq('user_id', userId)
      .eq('week_id', weekId);

    if (error) throw error;
    return data || [];
  },

  async saveDailyActivity(
    userId: string,
    date: Date,
    description: string
  ): Promise<AiDailyActivity> {
    const weekId = getWeekId(date);
    const dateStr = format(date, 'yyyy-MM-dd');
    const dayName = getDayName(date);
    // Capitalize first letter
    const formattedDay = dayName.charAt(0).toUpperCase() + dayName.slice(1);

    const { data, error } = await supabase
      .from('ai_daily_activities')
      .upsert(
        {
          user_id: userId,
          week_id: weekId,
          date: dateStr,
          day: formattedDay,
          activity_description: description
        },
        { onConflict: 'user_id, date' }
      )
      .select()
      .maybeSingle();

    if (error) throw error;
    if (!data) throw new Error('Sauvegarde activité sans retour (vérifier RLS ai_daily_activities)');
    return data;
  },

  // WEEKLY REPORTS
  async getWeeklyReport(userId: string, date: Date): Promise<AiWeeklyReport | null> {
    const weekId = getWeekId(date);
    const { data, error } = await supabase
      .from('ai_weekly_reports')
      .select('*')
      .eq('user_id', userId)
      .eq('week_id', weekId)
      .maybeSingle();

    if (error) throw error;
    return data;
  },

  async getAllReports(userId: string): Promise<AiWeeklyReport[]> {
    const { data, error } = await supabase
      .from('ai_weekly_reports')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data || [];
  },
  
  async getReportsForDirector(): Promise<AiWeeklyReport[]> {
    // Relying on RLS to only allow directors to see 'SENT' reports
    const { data, error } = await supabase
      .from('ai_weekly_reports')
      .select('*, profiles:user_id(id, name, email, role, photo)')
      .eq('status', 'SENT')
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data || [];
  },

  async saveWeeklyReport(
    userId: string,
    date: Date,
    content: AiWeeklyReportContent,
    status: 'DRAFT' | 'SENT' = 'DRAFT'
  ): Promise<AiWeeklyReport> {
    const weekId = getWeekId(date);
    const start = startOfWeek(date, { weekStartsOn: 1 });
    const end = endOfWeek(date, { weekStartsOn: 1 });

    const { data, error } = await supabase
      .from('ai_weekly_reports')
      .upsert(
        {
          user_id: userId,
          week_id: weekId,
          start_date: format(start, 'yyyy-MM-dd'),
          end_date: format(end, 'yyyy-MM-dd'),
          report_content: content,
          status
        },
        { onConflict: 'user_id, week_id' }
      )
      .select()
      .maybeSingle();

    if (error) throw error;
    if (!data) throw new Error('Sauvegarde rapport sans retour (vérifier RLS ai_weekly_reports)');
    return data;
  },

  async generateReportFromChat(chatHistory: string, userName: string, period: string, userApiKey?: string): Promise<AiWeeklyReportContent> {
    const { data, error } = await supabase.functions.invoke('generate-weekly-report', {
      body: {
        chatHistory,
        userName,
        period,
        userApiKey
      }
    });

    if (error) throw new Error(error.message || 'Erreur lors de la génération du rapport');
    
    return data as AiWeeklyReportContent;
  }
};
