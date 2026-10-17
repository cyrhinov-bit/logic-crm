// @ts-ignore
import { serve } from "https://deno.land/std@0.177.0/http/server.ts"
// @ts-ignore
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

declare var Deno: any;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
    )

    // Verify caller
    const { data: { user }, error: authError } = await supabaseClient.auth.getUser()
    if (authError || !user) throw new Error('Non autorisé')

    // Get caller role
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()

    const callerRole = profile?.role || 'Inconnu'

    interface CreateUserPayload {
      email: string;
      pin: string;
      name: string;
      role: string;
      posRole?: string;
      serviceId?: string;
      posReturnsEnabled?: boolean;
      posCatalogueEnabled?: boolean;
      posSupplyEnabled?: boolean;
      posInventoryEnabled?: boolean;
      posStockEnabled?: boolean;
      crmPrestationsEnabled?: boolean;
      crmCaisseEnabled?: boolean;
      crmMaintenanceEnabled?: boolean;
      crmStocksEnabled?: boolean;
      crmTiersEnabled?: boolean;
      crmCommerciauxEnabled?: boolean;
      crmCommissionsEnabled?: boolean;
      crmFacturationEnabled?: boolean;
      crmSupFacturesEnabled?: boolean;
      crmReportsEnabled?: boolean;
      crmTeamReportsEnabled?: boolean;
    }

    const { email, pin, name, role, posRole, serviceId, posReturnsEnabled, posCatalogueEnabled, posSupplyEnabled, posInventoryEnabled, posStockEnabled, crmPrestationsEnabled, crmCaisseEnabled, crmMaintenanceEnabled, crmStocksEnabled, crmTiersEnabled, crmCommerciauxEnabled, crmCommissionsEnabled, crmFacturationEnabled, crmSupFacturesEnabled, crmReportsEnabled, crmTeamReportsEnabled } = await req.json() as CreateUserPayload

    // Autorisations
    if (role === 'SuperAdmin') throw new Error('Impossible de créer un SuperAdmin')
    if (role === 'Directeur' && callerRole !== 'SuperAdmin') {
      throw new Error('Seul un SuperAdmin peut créer un Directeur')
    }
    if (role === 'Encaisseur' && callerRole !== 'SuperAdmin' && callerRole !== 'Directeur') {
      throw new Error('Seul le Directeur ou le SuperAdmin peut créer un Encaisseur')
    }
    if (callerRole === 'Gerant' && role !== 'Caissier') {
      throw new Error('Un Gérant ne peut créer que des Caissiers')
    }
    if (callerRole !== 'SuperAdmin' && callerRole !== 'Directeur' && callerRole !== 'Gerant') {
      throw new Error('Vous n\'avez pas les droits pour créer un utilisateur')
    }

    // 1. Create auth user
    const { data: authData, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email: email,
      password: pin,
      email_confirm: true,
      user_metadata: { name, role }
    })

    if (createError) throw createError
    const newUserId = authData.user.id

    // 2. Insert into profiles
    const { error: profileError } = await supabaseAdmin
      .from('profiles')
      .insert([{
        id: newUserId,
        email,
        name,
        role,
        pin,
        pos_role: posRole || null,
        service_id: serviceId || null,
        active: true,
        pos_returns_enabled: posReturnsEnabled === true,
        pos_catalogue_enabled: posCatalogueEnabled === true,
        pos_supply_enabled: posSupplyEnabled === true,
        pos_inventory_enabled: posInventoryEnabled === true,
        pos_stock_enabled: posStockEnabled === true,
        crm_prestations_enabled: crmPrestationsEnabled === true,
        crm_caisse_enabled: crmCaisseEnabled === true,
        crm_maintenance_enabled: crmMaintenanceEnabled === true,
        crm_stocks_enabled: crmStocksEnabled === true,
        crm_tiers_enabled: crmTiersEnabled === true,
        crm_commerciaux_enabled: crmCommerciauxEnabled === true,
        crm_commissions_enabled: crmCommissionsEnabled === true,
        crm_facturation_enabled: crmFacturationEnabled === true,
        crm_sup_factures_enabled: crmSupFacturesEnabled === true,
        crm_reports_enabled: crmReportsEnabled === true,
        crm_team_reports_enabled: crmTeamReportsEnabled === true
      }])

    if (profileError) {
      // Rollback
      await supabaseAdmin.auth.admin.deleteUser(newUserId)
      throw profileError
    }

    return new Response(
      JSON.stringify({ id: newUserId, name, email, role, posRole, serviceId, posReturnsEnabled, posCatalogueEnabled, posSupplyEnabled, posInventoryEnabled, posStockEnabled, crmPrestationsEnabled, crmCaisseEnabled, crmMaintenanceEnabled, crmStocksEnabled, crmTiersEnabled, crmCommerciauxEnabled, crmCommissionsEnabled, crmFacturationEnabled, crmSupFacturesEnabled, crmReportsEnabled, crmTeamReportsEnabled }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error: any) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
    )
  }
})
