import { supabase } from './supabase';

export function getUserGeminiKey(userId?: string): string {
  if (userId) {
    const key = localStorage.getItem(`gemini_key_${userId}`) || localStorage.getItem(`gemini_api_key_${userId}`);
    if (key && key.trim()) return key.trim();
  }
  const globalUserKey = (localStorage.getItem('gemini_api_key') || '').trim();
  if (globalUserKey) return globalUserKey;

  // Fallback sur la clé d'entreprise configurée sur OnRender (VITE_GEMINI_API_KEY)
  const envKey = (import.meta.env.VITE_GEMINI_API_KEY as string || '').trim();
  return envKey;
}

export function setUserGeminiKey(userId: string, key: string): void {
  const cleanKey = key.trim();
  if (userId) {
    localStorage.setItem(`gemini_key_${userId}`, cleanKey);
    localStorage.setItem(`gemini_api_key_${userId}`, cleanKey);
    // Synchro avec Supabase pour persistance multi-appareils et après déconnexion
    supabase
      .from('profiles')
      .update({ gemini_api_key: cleanKey })
      .eq('id', userId)
      .then(({ error }) => {
        if (error) console.warn('[GeminiKey] Erreur synchro clé vers Supabase :', error.message);
      });
  }
  localStorage.setItem('gemini_api_key', cleanKey);
}

export async function testGeminiApiKey(apiKey: string): Promise<{ success: boolean; message: string }> {
  const key = apiKey.trim();
  if (!key) {
    return { success: false, message: 'Veuillez saisir une clé API avant de tester.' };
  }

  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${encodeURIComponent(key)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: "Ping test. Reponds simplement par 'OK'." }] }]
      })
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      const errorMsg = errData?.error?.message || `Erreur HTTP ${res.status}`;
      return { success: false, message: `Clé invalide : ${errorMsg}` };
    }

    const data = await res.json();
    const candidateText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (candidateText) {
      return { success: true, message: 'Connexion à Google Gemini réussie avec succès ! Votre clé est valide.' };
    }

    return { success: true, message: 'Clé API validée par Google Gemini.' };
  } catch (error: any) {
    return { success: false, message: `Impossible de joindre les serveurs Google : ${error.message || 'Vérifiez votre connexion internet.'}` };
  }
}

