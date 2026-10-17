import { useEffect, useState } from 'react';
import { Mail, Save, PlugZap, Send, CheckCircle2, AlertTriangle, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { platform } from '../platform';
import type { SmtpStatus } from '../platform';
import { useAppContext } from '../context/AppContext';
import { useAuth } from '../context/AuthContext';

/** Déduit le serveur SMTP depuis le domaine de l'adresse (mail.exemple.com). */
function deriveSmtpHost(email?: string): string {
  const domain = (email || '').split('@')[1]?.trim();
  return domain ? `mail.${domain}` : 'mail.hinovgroup.com';
}

/**
 * Réglages d'envoi des devis par e-mail (SMTP).
 *
 * Adaptés aux boîtes IMAP/SMTP classiques (hébergement mutualisé, ex. LWS) :
 * l'application envoie le devis directement, PDF joint, sans dépendre d'Outlook
 * ni d'un compte Microsoft 365.
 */
export function MailSmtpSettings() {
  const { settings } = useAppContext();
  const { currentUser } = useAuth();
  const [status, setStatus] = useState<SmtpStatus>({ configured: false });
  const [host, setHost] = useState('mail.hinovgroup.com');
  const [port, setPort] = useState('465');
  const [secure, setSecure] = useState(true);
  const [user, setUser] = useState('');
  const [fromName, setFromName] = useState('');
  const [replyTo, setReplyTo] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [testTo, setTestTo] = useState('');
  const [showHelp, setShowHelp] = useState(false);
  const [prefilled, setPrefilled] = useState(false);

  const refresh = async () => {
    try {
      const s = await platform.mail.smtp.getStatus();
      setStatus(s);
      return s;
    } catch {
      return { configured: false } as SmtpStatus;
    }
  };

  useEffect(() => {
    (async () => {
      const s = await refresh();
      if (!prefilled) {
        const myEmail = s.user || currentUser?.email || settings?.companyEmail || '';
        setHost(s.host || deriveSmtpHost(myEmail));
        setPort(String(s.port || 465));
        setSecure(s.secure !== false);
        setUser(myEmail);
        setFromName(s.fromName || currentUser?.name || settings?.companyName || '');
        setReplyTo(s.replyTo || myEmail);
        setTestTo(myEmail);
        setPrefilled(true);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const saveConfig = async (): Promise<boolean> => {
    if (!host.trim() || !user.trim()) {
      toast.error('Renseignez le serveur SMTP et l’adresse e-mail.');
      return false;
    }
    if (!status.configured && !password) {
      toast.error('Saisissez le mot de passe de la boîte pour le premier enregistrement.');
      return false;
    }
    setBusy(true);
    try {
      const s = await platform.mail.smtp.setConfig({
        host: host.trim(),
        port: Number(port) || 465,
        secure,
        user: user.trim(),
        fromName: fromName.trim(),
        replyTo: replyTo.trim(),
        password: password || undefined, // vide = conserve l'ancien mot de passe
      });
      setStatus(s);
      setPassword('');
      toast.success('Configuration enregistrée.');
      return true;
    } catch (e: any) {
      toast.error(e?.message || "Impossible d'enregistrer la configuration.");
      return false;
    } finally {
      setBusy(false);
    }
  };

  const handleVerify = async () => {
    setBusy(true);
    try {
      // On enregistre d'abord (pour tester les valeurs saisies), puis on vérifie la connexion.
      const ok = password ? await saveConfig() : true;
      if (!ok && password) return;
      const res = await platform.mail.smtp.verify();
      if (res.ok) toast.success('Connexion au serveur SMTP réussie. Les identifiants sont valides.');
      else toast.error(res.error || 'Échec de la connexion au serveur SMTP.', { duration: 9000 });
    } catch (e: any) {
      toast.error(e?.message || 'Échec du test.');
    } finally {
      setBusy(false);
    }
  };

  const handleSendTest = async () => {
    if (!testTo.trim()) {
      toast.error('Indiquez une adresse de destination pour le test.');
      return;
    }
    setBusy(true);
    try {
      if (password) {
        const ok = await saveConfig();
        if (!ok) return;
      }
      const res = await platform.mail.smtp.sendTest(testTo.trim());
      if (res.ok) toast.success(`E-mail de test envoyé à ${testTo.trim()}. Vérifiez la réception.`, { duration: 9000 });
      else toast.error(res.error || "L'envoi de test a échoué.", { duration: 9000 });
    } catch (e: any) {
      toast.error(e?.message || 'Échec du test.');
    } finally {
      setBusy(false);
    }
  };

  const handleClear = async () => {
    setBusy(true);
    try {
      await platform.mail.smtp.clear();
      setStatus({ configured: false });
      setPassword('');
      await refresh();
      toast.success('Configuration SMTP effacée.');
    } catch {
      toast.error("Échec de l'effacement.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section style={{ marginBottom: '32px' }}>
      <h3 style={{ color: 'var(--color-primary)', borderBottom: '1px solid var(--color-border)', paddingBottom: '8px', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
        <Mail size={20} /> Envoi des devis par e-mail (SMTP)
      </h3>

      <p style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)', marginBottom: '12px' }}>
        Renseignez <strong>votre boîte</strong> pour que vos devis partent de
        <strong> votre propre adresse</strong>, <strong>avec le PDF déjà joint</strong>.
        Tant que ce n'est pas fait, l'application vous invitera à la configurer lors de l'envoi.
      </p>

      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px', fontSize: '0.9rem' }}>
        {status.configured ? (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', color: 'var(--color-success, #16a34a)' }}>
            <CheckCircle2 size={16} /> Configuré{status.user ? ` : ${status.user}` : ''}
          </span>
        ) : (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', color: 'var(--color-text-muted)' }}>
            <AlertTriangle size={16} /> Non configuré — mode simplifié (ouverture de la messagerie) actif
          </span>
        )}
      </div>

      <div className="responsive-form-grid">
        <div className="form-group">
          <label>Serveur SMTP (envoi)</label>
          <input className="table-input" placeholder="mail.votre-domaine.com" value={host} onChange={e => setHost(e.target.value)} />
        </div>
        <div className="form-group">
          <label>Port</label>
          <input className="table-input" placeholder="465" value={port} onChange={e => setPort(e.target.value.replace(/[^0-9]/g, ''))} />
        </div>
        <div className="form-group">
          <label>Sécurité</label>
          <select className="table-input" value={secure ? 'ssl' : 'starttls'} onChange={e => { const ssl = e.target.value === 'ssl'; setSecure(ssl); setPort(ssl ? '465' : '587'); }}>
            <option value="ssl">SSL/TLS (port 465)</option>
            <option value="starttls">STARTTLS (port 587)</option>
          </select>
        </div>
        <div className="form-group" style={{ gridColumn: 'span 2' }}>
          <label>Votre adresse d'envoi (les devis partiront de cette adresse)</label>
          <input className="table-input" placeholder="prenom.nom@votre-domaine.com" value={user} onChange={e => setUser(e.target.value)} />
        </div>
        <div className="form-group" style={{ gridColumn: 'span 2' }}>
          <label>Mot de passe de la boîte {status.configured ? <span style={{ color: 'var(--color-text-muted)' }}>(laisser vide pour conserver l'actuel)</span> : null}</label>
          <input className="table-input" type="password" placeholder="••••••••" value={password} onChange={e => setPassword(e.target.value)} autoComplete="new-password" />
        </div>
        <div className="form-group">
          <label>Nom de l'expéditeur</label>
          <input className="table-input" placeholder={settings?.companyName || 'Votre entreprise'} value={fromName} onChange={e => setFromName(e.target.value)} />
        </div>
        <div className="form-group">
          <label>Adresse de réponse (optionnel)</label>
          <input className="table-input" placeholder="(même adresse si vide)" value={replyTo} onChange={e => setReplyTo(e.target.value)} />
        </div>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '12px' }}>
        <button type="button" className="btn btn-primary" onClick={saveConfig} disabled={busy}>
          <Save size={16} /> Enregistrer
        </button>
        <button type="button" className="btn btn-secondary" onClick={handleVerify} disabled={busy || !status.configured}>
          <PlugZap size={16} /> Tester la connexion
        </button>
        <button type="button" className="btn btn-secondary" onClick={() => setShowHelp(v => !v)}>
          {showHelp ? 'Masquer l’aide' : 'Où trouver ces informations ?'}
        </button>
        {status.configured && (
          <button type="button" className="btn btn-secondary" onClick={handleClear} disabled={busy}>
            <Trash2 size={16} /> Effacer
          </button>
        )}
      </div>

      {/* Test d'envoi */}
      <div style={{ marginTop: '16px', paddingTop: '16px', borderTop: '1px dashed var(--color-border)' }}>
        <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold', fontSize: '0.9rem' }}>E-mail de test</label>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <input
            className="table-input"
            style={{ flex: '1 1 260px' }}
            placeholder="adresse@exemple.com"
            value={testTo}
            onChange={e => setTestTo(e.target.value)}
          />
          <button type="button" className="btn btn-secondary" onClick={handleSendTest} disabled={busy || !status.configured}>
            <Send size={16} /> Envoyer un test
          </button>
        </div>
      </div>

      {/* Aide */}
      {showHelp && (
        <div style={{ marginTop: '16px', padding: '16px', border: '1px solid var(--color-border)', borderRadius: '8px', fontSize: '0.85rem', lineHeight: 1.6 }}>
          <p style={{ marginBottom: '8px' }}><strong>Ces informations viennent de votre hébergeur / fournisseur de messagerie :</strong></p>
          <ul style={{ paddingLeft: '20px' }}>
            <li><strong>Serveur SMTP</strong> : souvent <code>mail.votre-domaine.com</code> (ex. <code>mail.hinovgroup.com</code>).</li>
            <li><strong>Port</strong> : <code>465</code> (SSL) ou <code>587</code> (STARTTLS).</li>
            <li><strong>Identifiant</strong> : votre adresse e-mail complète.</li>
            <li><strong>Mot de passe</strong> : celui de la boîte (celui utilisé dans le webmail), pas le mot de passe du poste Windows.</li>
          </ul>
          <p style={{ marginTop: '8px', color: 'var(--color-text-muted)' }}>
            Sur un hébergement mutualisé (LWS, cPanel, OVH…), ces valeurs figurent dans le panneau de
            gestion, rubrique « Comptes e-mail » / « Configuration client de messagerie ».
          </p>
        </div>
      )}
    </section>
  );
}
