import type { SupabaseClient } from '@supabase/supabase-js';

export class SharedServiceFacade {
  private readonly client: SupabaseClient;

  constructor(client: SupabaseClient) {
    this.client = client;
  }

  async getProfiles() {
    return this.client.from('profiles').select('*');
  }

  async getClients() {
    return this.client.from('clients').select('*');
  }

  async getServices() {
    return this.client.from('services').select('*');
  }

  async getPrestations() {
    return this.client.from('prestations').select('*');
  }

  async getQuotes() {
    return this.client.from('quotes').select('*, quote_lines(*)');
  }

  async getSales() {
    return this.client.from('ventes').select('*, vente_lines(*)');
  }

  async getCommissions() {
    return this.client.from('commissions').select('*');
  }

  async getProspects() {
    return this.client.from('prospects').select('*');
  }

  async getSettings() {
    return this.client.from('settings').select('*').single();
  }
}

export function createSharedServiceFacade(client: SupabaseClient) {
  return new SharedServiceFacade(client);
}
