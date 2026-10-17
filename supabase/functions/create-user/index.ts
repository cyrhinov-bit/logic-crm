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
      serviceId?: string;
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

    const { email, pin, name, role, serviceId, crmPrestationsEnabled, crmCaisseEnabled, crmMaintenanceEnabled, crmStocksEnabled, crmTiersEnabled, crmCommerciauxEnabled, crmCommissionsEnabled, crmFacturationEnabled, crmSupFacturesEnabled, crmReportsEnabled, crmTeamReportsEnabled } = await req.json() as CreateUserPayload

    // Autorisations
    const ALLOWED_ROLES = ['Directeur', 'Directeur adjoint', 'Responsable', 'Commercial']
    if (!ALLOWED_ROLES.includes(role)) {
      throw new Error('Rôle invalide')
    }
    if (role === 'Directeur' && callerRole !== 'SuperAdmin') {
      throw new Error('Seul un SuperAdmin peut créer un Directeur')
    }
    if (callerRole !== 'SuperAdmin' && callerRole !== 'Directeur') {
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
        service_id: serviceId || null,
        active: true,
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
      JSON.stringify({ id: newUserId, name, email, role, serviceId, crmPrestationsEnabled, crmCaisseEnabled, crmMaintenanceEnabled, crmStocksEnabled, crmTiersEnabled, crmCommerciauxEnabled, crmCommissionsEnabled, crmFacturationEnabled, crmSupFacturesEnabled, crmReportsEnabled, crmTeamReportsEnabled }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error: any) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
    )
  }
})
