import React, { useState, useEffect } from 'react';
import { Key, Eye, EyeOff, CheckCircle2, AlertCircle, Sparkles, ExternalLink, Save, Bot } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { getUserGeminiKey, setUserGeminiKey, testGeminiApiKey } from '../lib/geminiKey';
import './GeminiSettings.css';

export function GeminiSettings() {
  const { currentUser, updateCurrentUser } = useAuth();
  const [apiKey, setApiKey] = useState(() => currentUser?.geminiApiKey || getUserGeminiKey(currentUser?.id));
  const [showKey, setShowKey] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

  useEffect(() => {
    if (currentUser?.id) {
      const savedKey = currentUser.geminiApiKey || getUserGeminiKey(currentUser.id);
      setApiKey(savedKey);
    }
  }, [currentUser]);

  const handleTest = async () => {
    if (!apiKey.trim()) {
      setTestResult({ success: false, message: 'Veuillez saisir votre clé API Gemini avant de lancer le test.' });
      return;
    }

    setIsTesting(true);
    setTestResult(null);
    setSaveSuccess(false);

    try {
      const res = await testGeminiApiKey(apiKey);
      setTestResult(res);
    } catch (err: any) {
      setTestResult({ success: false, message: err.message || 'Erreur lors du test de la clé.' });
    } finally {
      setIsTesting(false);
    }
  };

  const handleSave = () => {
    if (!currentUser?.id) return;
    setUserGeminiKey(currentUser.id, apiKey);
    updateCurrentUser({ geminiApiKey: apiKey.trim() });
    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 4000);
  };

  return (
    <div className="dashboard">
      <div style={{ marginBottom: '24px' }}>
        <h2 style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Sparkles size={24} color="#0D9488" />
          Paramètres Gemini IA (Personnel)
        </h2>
        <p style={{ color: 'var(--color-text-muted)', margin: '4px 0 0' }}>
          Configurez votre propre clé API Google Gemini pour alimenter vos synthèses hebdomadaires et fonctionnalités d'assistance IA.
        </p>
      </div>

      <div className="gemini-settings-card">
        {/* User Identity Info */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', background: '#F8FAFC', padding: '12px 16px', borderRadius: '8px', border: '1px solid #E2E8F0', marginBottom: '20px' }}>
          <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: '#0D9488', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700 }}>
            {(currentUser?.name || '?').slice(0, 2).toUpperCase()}
          </div>
          <div>
            <div style={{ fontWeight: 700, fontSize: '0.95rem' }}>{currentUser?.name}</div>
            <div style={{ fontSize: '0.8rem', color: '#64748B' }}>
              Compte : {currentUser?.role} • Stockage isolé et sécurisé par utilisateur
            </div>
          </div>
        </div>

        {/* API Key Form */}
        <div style={{ marginBottom: '20px' }}>
          <label style={{ display: 'block', fontWeight: 600, fontSize: '0.9rem', color: '#1E293B', marginBottom: '8px' }}>
            Votre Clé API Google Gemini Personnelle
          </label>

          <div style={{ display: 'flex', gap: '8px', position: 'relative' }}>
            <div style={{ position: 'relative', flex: 1 }}>
              <input
                type={showKey ? 'text' : 'password'}
                className="table-input"
                style={{ width: '100%', paddingRight: '40px', fontFamily: 'monospace' }}
                placeholder="Collez votre clé API ici (ex: AIzaSy...)"
                value={apiKey}
                onChange={e => {
                  setApiKey(e.target.value);
                  setTestResult(null);
                  setSaveSuccess(false);
                }}
              />
              <button
                type="button"
                className="icon-button"
                onClick={() => setShowKey(!showKey)}
                style={{ position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)', border: 'none', background: 'transparent' }}
                title={showKey ? 'Masquer la clé' : 'Afficher la clé'}
              >
                {showKey ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>

            <button
              type="button"
              className="btn btn-secondary"
              onClick={handleTest}
              disabled={isTesting || !apiKey.trim()}
              style={{ whiteSpace: 'nowrap' }}
            >
              {isTesting ? 'Test en cours...' : 'Tester la clé'}
            </button>

            <button
              type="button"
              className="btn btn-primary"
              onClick={handleSave}
              style={{ display: 'flex', alignItems: 'center', gap: '6px', whiteSpace: 'nowrap' }}
            >
              <Save size={16} /> Enregistrer
            </button>
          </div>

          <p style={{ fontSize: '0.8rem', color: '#64748B', marginTop: '6px' }}>
            🔒 Votre clé est stockée uniquement sur cet appareil. Chaque collaborateur utilise son propre quota Gemini.
          </p>
        </div>

        {/* Live Test Result */}
        {testResult && (
          <div className={`gemini-status-badge ${testResult.success ? 'success' : 'error'}`}>
            {testResult.success ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}
            <span>{testResult.message}</span>
          </div>
        )}

        {/* Save confirmation */}
        {saveSuccess && (
          <div className="gemini-status-badge success">
            <CheckCircle2 size={18} />
            <span>Votre clé API Gemini a été enregistrée avec succès pour votre compte !</span>
          </div>
        )}

        {/* How to get a key guide */}
        <div className="gemini-guide-box">
          <div style={{ fontWeight: 700, fontSize: '0.9rem', color: '#0F172A', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Key size={16} color="#0D9488" />
            Comment obtenir gratuitement une clé API Gemini ?
          </div>

          <div className="gemini-guide-step">
            <div className="gemini-step-num">1</div>
            <div>
              Rendez-vous sur la console officielle <strong>Google AI Studio</strong> :{' '}
              <a
                href="https://aistudio.google.com/app/apikey"
                target="_blank"
                rel="noreferrer"
                style={{ color: '#0D9488', fontWeight: 600, textDecoration: 'underline', display: 'inline-flex', alignItems: 'center', gap: '3px' }}
              >
                aistudio.google.com/app/apikey <ExternalLink size={12} />
              </a>
            </div>
          </div>

          <div className="gemini-guide-step">
            <div className="gemini-step-num">2</div>
            <div>
              Connectez-vous avec votre compte Google, puis cliquez sur le bouton bleu <strong>« Create API Key »</strong>.
            </div>
          </div>

          <div className="gemini-guide-step">
            <div className="gemini-step-num">3</div>
            <div>
              Copiez la clé générée (commençant par <code>AIzaSy...</code>), collez-la dans le champ ci-dessus et cliquez sur <strong>Enregistrer</strong>.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

