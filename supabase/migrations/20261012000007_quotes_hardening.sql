-- Hardening module Devis : coût de revient, numérotation serveur, upsert atomique
-- Date: 2026-10-06

-- 1. Persistance du coût de revient (marge réelle, plus de remise à zéro en facturation)
ALTER TABLE public.quote_lines ADD COLUMN IF NOT EXISTS cost_price NUMERIC NOT NULL DEFAULT 0;

-- 2. Unicité déjà garantie par UNIQUE(quote_number) sur quotes (init_schema).
-- Fonction serveur : prochain numéro séquentiel DV-YYYY-XXXX (anti-doublon multi-poste).
CREATE OR REPLACE FUNCTION public.next_quote_number(p_year INT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_prefix TEXT := 'DV-' || p_year || '-';
  v_max INT := 0;
BEGIN
  SELECT COALESCE(MAX((regexp_match(quote_number, '^DV-\d{4}-(\d+)$'))[1]::INT), 0)
    INTO v_max
  FROM public.quotes
  WHERE quote_number LIKE v_prefix || '%';
  RETURN v_prefix || lpad((v_max + 1)::TEXT, 4, '0');
END;
$$;

-- 3. Upsert atomique quote + lignes (une seule transaction).
-- Remplace le delete+insert non transactionnel côté client.
CREATE OR REPLACE FUNCTION public.upsert_quote_with_lines(p_quote JSONB, p_lines JSONB)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_quote_id UUID := (p_quote->>'id')::UUID;
  v_kept_ids UUID[];
BEGIN
  INSERT INTO public.quotes (
    id, quote_number, client_id, commercial_id, service_id, affaire_id,
    subject, subtotal, vat, total, status, date,
    valid_until, payment_terms, notes, signatory_name, signatory_role,
    style, accent_color, discount_percent, discount_amount, client_comment
  ) VALUES (
    v_quote_id,
    p_quote->>'quote_number',
    NULLIF(p_quote->>'client_id', '')::UUID,
    NULLIF(p_quote->>'commercial_id', '')::UUID,
    NULLIF(p_quote->>'service_id', '')::UUID,
    NULLIF(p_quote->>'affaire_id', '')::UUID,
    p_quote->>'subject',
    COALESCE((p_quote->>'subtotal')::NUMERIC, 0),
    COALESCE((p_quote->>'vat')::NUMERIC, 0),
    COALESCE((p_quote->>'total')::NUMERIC, 0),
    COALESCE(p_quote->>'status', 'Brouillon'),
    (p_quote->>'date')::DATE,
    NULLIF(p_quote->>'valid_until', '')::DATE,
    p_quote->>'payment_terms',
    p_quote->>'notes',
    p_quote->>'signatory_name',
    p_quote->>'signatory_role',
    p_quote->>'style',
    p_quote->>'accent_color',
    COALESCE((p_quote->>'discount_percent')::NUMERIC, 0),
    COALESCE((p_quote->>'discount_amount')::NUMERIC, 0),
    p_quote->>'client_comment'
  )
  ON CONFLICT (id) DO UPDATE SET
    quote_number = EXCLUDED.quote_number,
    client_id = EXCLUDED.client_id,
    commercial_id = EXCLUDED.commercial_id,
    service_id = EXCLUDED.service_id,
    affaire_id = EXCLUDED.affaire_id,
    subject = EXCLUDED.subject,
    subtotal = EXCLUDED.subtotal,
    vat = EXCLUDED.vat,
    total = EXCLUDED.total,
    status = EXCLUDED.status,
    date = EXCLUDED.date,
    valid_until = EXCLUDED.valid_until,
    payment_terms = EXCLUDED.payment_terms,
    notes = EXCLUDED.notes,
    signatory_name = EXCLUDED.signatory_name,
    signatory_role = EXCLUDED.signatory_role,
    style = EXCLUDED.style,
    accent_color = EXCLUDED.accent_color,
    discount_percent = EXCLUDED.discount_percent,
    discount_amount = EXCLUDED.discount_amount,
    client_comment = EXCLUDED.client_comment;

  -- Lignes : upsert puis suppression des lignes retirées (jamais de devis vide par échec partiel)
  SELECT COALESCE(array_agg((value->>'id')::UUID), '{}')
    INTO v_kept_ids
  FROM jsonb_array_elements(COALESCE(p_lines, '[]'::JSONB)) AS value
  WHERE value->>'id' IS NOT NULL AND value->>'id' <> '';

  INSERT INTO public.quote_lines (
    id, quote_id, prestation_id, description, quantity,
    unit, unit_price, discount_percent, cost_price, total
  )
  SELECT
    (value->>'id')::UUID,
    v_quote_id,
    NULLIF(value->>'prestation_id', '')::UUID,
    COALESCE(value->>'description', ''),
    COALESCE((value->>'quantity')::NUMERIC, 0),
    value->>'unit',
    COALESCE((value->>'unit_price')::NUMERIC, 0),
    COALESCE((value->>'discount_percent')::NUMERIC, 0),
    COALESCE((value->>'cost_price')::NUMERIC, 0),
    COALESCE((value->>'total')::NUMERIC, 0)
  FROM jsonb_array_elements(COALESCE(p_lines, '[]'::JSONB)) AS value
  ON CONFLICT (id) DO UPDATE SET
    quote_id = EXCLUDED.quote_id,
    prestation_id = EXCLUDED.prestation_id,
    description = EXCLUDED.description,
    quantity = EXCLUDED.quantity,
    unit = EXCLUDED.unit,
    unit_price = EXCLUDED.unit_price,
    discount_percent = EXCLUDED.discount_percent,
    cost_price = EXCLUDED.cost_price,
    total = EXCLUDED.total;

  DELETE FROM public.quote_lines
  WHERE quote_id = v_quote_id
    AND NOT (id = ANY (v_kept_ids));
END;
$$;

-- NOTE RLS : les policies actuelles restent "authenticated full access" (TO authenticated USING(true)).
-- Un durcissement par commercial/service (auth.uid() = commercial_id) nécessite une migration
-- des rôles profiles (Commercial/SuperAdmin/Directeur adjoint absents du CHECK d'origine)
-- et est volontairement exclu de cette migration pour ne pas casser la production.
-- Le contrôle d'accès est appliqué côté applicatif (Devis.tsx canManageQuote/canTransition
-- + garde deleteQuote si facture liée).
