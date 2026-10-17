export interface AiDailyActivity {
  id: string;
  user_id: string;
  week_id: string; // Format: '2026-W34'
  date: string;
  day: string; // 'Lundi', 'Mardi', etc.
  activity_description: string | null;
  created_at: string;
  updated_at: string;
}

export interface AiWeeklyReportContent {
  introduction: string;
  activities: string;
  achievements: string;
  difficulties: string;
  summary: string;
  perspectives: string;
}

export interface AiWeeklyReport {
  id: string;
  user_id: string;
  week_id: string;
  start_date: string;
  end_date: string;
  report_content: AiWeeklyReportContent;
  status: 'DRAFT' | 'SENT';
  created_at: string;
  updated_at: string;
}
