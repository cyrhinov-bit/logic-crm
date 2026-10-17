export interface Device {
  id: string;
  type: 'scanner' | 'cashdrawer' | 'display' | 'scale' | 'payment' | 'printer' | 'unknown';
  manufacturer?: string;
  model?: string;
  status: 'connected' | 'disconnected' | 'error';
  capabilities: string[];
  driverLoaded: boolean;
}
