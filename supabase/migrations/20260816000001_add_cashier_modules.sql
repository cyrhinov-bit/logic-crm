-- Migration pour ajouter les permissions Approvisionnement, Inventaire, Stock aux caissiers
ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS pos_supply_enabled BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS pos_inventory_enabled BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS pos_stock_enabled BOOLEAN DEFAULT FALSE;
