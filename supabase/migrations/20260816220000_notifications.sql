-- Migration: Création de la table notifications

CREATE TABLE IF NOT EXISTS notifications (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    type TEXT NOT NULL DEFAULT 'info',
    is_read BOOLEAN NOT NULL DEFAULT false,
    link TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW())
);

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- Les utilisateurs peuvent voir et modifier (marquer comme lu) uniquement leurs propres notifications
CREATE POLICY "Les utilisateurs peuvent voir leurs notifications"
    ON notifications FOR SELECT
    TO authenticated
    USING (auth.uid() = user_id);

CREATE POLICY "Les utilisateurs peuvent modifier leurs notifications"
    ON notifications FOR UPDATE
    TO authenticated
    USING (auth.uid() = user_id);

CREATE POLICY "Le système peut insérer des notifications"
    ON notifications FOR INSERT
    TO authenticated
    WITH CHECK (true); -- On autorise l'insertion (ex: un chef assigne un prospect à un autre)

CREATE POLICY "Les utilisateurs peuvent supprimer leurs notifications"
    ON notifications FOR DELETE
    TO authenticated
    USING (auth.uid() = user_id);

-- Index pour accélérer les requêtes
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_is_read ON notifications(is_read);
