export interface PrintJob {
  id: string;
  date: string;
  type: 'html' | 'pdf' | 'escpos';
  printerName?: string;
  status: 'pending' | 'printing' | 'completed' | 'failed' | 'cancelled';
  progress: number;
  error?: string;
}
