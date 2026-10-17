export const DEFAULT_THEME_COLOR = '#0D9488'; // Sarcelle Hinov

export interface ThemePreset {
  name: string;
  hex: string;
  mood: string;
  category: 'Bleus & Cyans' | 'Violets & Magentas' | 'Verts & Nature' | 'Chauds & Énergiques' | 'Neutres & Élégants';
}

export const THEME_PRESETS: ThemePreset[] = [
  // 1. Bleus & Cyans (Confiance, Sécurité, Digital)
  { name: 'Sarcelle Hinov (Défaut)', hex: '#0D9488', mood: 'Moderne & Professionnel', category: 'Bleus & Cyans' },
  { name: 'Bleu Océan', hex: '#2563EB', mood: 'Corporate & Technologique', category: 'Bleus & Cyans' },
  { name: 'Bleu Nuit Classique', hex: '#3C7DAF', mood: 'Sobre & Institutionnel', category: 'Bleus & Cyans' },
  { name: 'Bleu Cobalt', hex: '#1D4ED8', mood: 'Autorité & Clarté', category: 'Bleus & Cyans' },
  { name: 'Bleu Azur', hex: '#0284C7', mood: 'Aérien & Lumineux', category: 'Bleus & Cyans' },
  { name: 'Cyan Lagon', hex: '#06B6D4', mood: 'Frais & Innovant', category: 'Bleus & Cyans' },

  // 2. Violets & Magentas (Créativité, IA, Prestige)
  { name: 'Violet Royal', hex: '#7C3AED', mood: 'Créatif & Élégant', category: 'Violets & Magentas' },
  { name: 'Indigo Électrique', hex: '#4F46E5', mood: 'Dynamique & Moderne', category: 'Violets & Magentas' },
  { name: 'Pourpre Impérial', hex: '#6D28D9', mood: 'Noble & Distingué', category: 'Violets & Magentas' },
  { name: 'Lavande Profonde', hex: '#8B5CF6', mood: 'Doux & Inspirant', category: 'Violets & Magentas' },
  { name: 'Fuchsia / Magenta IA', hex: '#D946EF', mood: 'Futuriste & Vibrant', category: 'Violets & Magentas' },
  { name: 'Rose Pivoine', hex: '#EC4899', mood: 'Pétillant & Audacieux', category: 'Violets & Magentas' },

  // 3. Verts & Nature (Croissance, Succès, Clarté)
  { name: 'Vert Émeraude', hex: '#059669', mood: 'Confiance & Stabilité', category: 'Verts & Nature' },
  { name: 'Vert Forêt Boréale', hex: '#047857', mood: 'Solide & Écologique', category: 'Verts & Nature' },
  { name: 'Vert Menthe Fraîche', hex: '#10B981', mood: 'Énergisant & Pur', category: 'Verts & Nature' },
  { name: 'Vert Jade', hex: '#16A34A', mood: 'Équilibré & Naturel', category: 'Verts & Nature' },
  { name: 'Vert Olive Moderne', hex: '#65A30D', mood: 'Organique & Terroir', category: 'Verts & Nature' },

  // 4. Chauds & Énergiques (Performance, Vente, Dynamisme)
  { name: 'Rose Rubis', hex: '#E11D48', mood: 'Audacieux & Percutant', category: 'Chauds & Énergiques' },
  { name: 'Rouge Écarlate', hex: '#DC2626', mood: 'Passion & Détermination', category: 'Chauds & Énergiques' },
  { name: 'Ambre Doré', hex: '#D97706', mood: 'Chaleureux & Premium', category: 'Chauds & Énergiques' },
  { name: 'Orange Sunset', hex: '#EA580C', mood: 'Énergique & Commercial', category: 'Chauds & Énergiques' },
  { name: 'Tangerine Vif', hex: '#F97316', mood: 'Convivial & Actif', category: 'Chauds & Énergiques' },
  { name: 'Or Solaire', hex: '#CA8A04', mood: 'Richesse & Réussite', category: 'Chauds & Énergiques' },

  // 5. Neutres & Élégants (Minimalisme, Luxe, Discrétion)
  { name: 'Ardoise Anthracite', hex: '#334155', mood: 'Minimaliste & Épuré', category: 'Neutres & Élégants' },
  { name: 'Noir Minéral (Onyx)', hex: '#1E293B', mood: 'Ultra Moderne & Luxe', category: 'Neutres & Élégants' },
  { name: 'Titane Satiné', hex: '#475569', mood: 'Sobre & Résistant', category: 'Neutres & Élégants' },
  { name: 'Moka / Chocolat', hex: '#78350F', mood: 'Authentique & Cosy', category: 'Neutres & Élégants' },
];

export const THEME_CATEGORIES = [
  'Tous',
  'Bleus & Cyans',
  'Violets & Magentas',
  'Verts & Nature',
  'Chauds & Énergiques',
  'Neutres & Élégants'
] as const;

/**
 * Convertit un code hex (#RRGGBB ou #RGB) en composantes RGB
 */
export function hexToRgb(hex: string): { r: number; g: number; b: number } {
  let cleanHex = hex.replace('#', '').trim();
  if (cleanHex.length === 3) {
    cleanHex = cleanHex.split('').map(c => c + c).join('');
  }
  const num = parseInt(cleanHex, 16);
  return {
    r: (num >> 16) & 255,
    g: (num >> 8) & 255,
    b: num & 255,
  };
}

/**
 * Éclaircit ou assombrit une couleur hexadécimale d'un pourcentage donné
 */
export function shadeColor(color: string, percent: number): string {
  const { r, g, b } = hexToRgb(color);
  const adjust = (val: number) => {
    const res = Math.round(val + (val * percent) / 100);
    return Math.min(255, Math.max(0, res));
  };
  const toHex = (n: number) => n.toString(16).padStart(2, '0');
  return `#${toHex(adjust(r))}${toHex(adjust(g))}${toHex(adjust(b))}`;
}

/**
 * Applique les variables CSS sur :root en direct
 */
export function applyTheme(hexColor: string = DEFAULT_THEME_COLOR): void {
  if (typeof document === 'undefined') return;

  const validHex = /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/.test(hexColor) ? hexColor : DEFAULT_THEME_COLOR;
  const { r, g, b } = hexToRgb(validHex);
  const root = document.documentElement;

  root.style.setProperty('--color-primary', validHex);
  root.style.setProperty('--color-primary-tint', `rgba(${r}, ${g}, ${b}, 0.12)`);
  root.style.setProperty('--color-primary-strong', shadeColor(validHex, -25));
  root.style.setProperty('--color-primary-hover', shadeColor(validHex, -12));
}

/**
 * Récupère la couleur de thème enregistrée pour un utilisateur
 */
export function getUserThemeColor(userId?: string): string {
  if (!userId) {
    return localStorage.getItem('app_theme_primary') || DEFAULT_THEME_COLOR;
  }
  return localStorage.getItem(`user_theme_primary_${userId}`) || localStorage.getItem('app_theme_primary') || DEFAULT_THEME_COLOR;
}

/**
 * Enregistre et applique la couleur de thème pour un utilisateur
 */
export function setUserThemeColor(userId: string, hexColor: string): void {
  const validHex = /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/.test(hexColor) ? hexColor : DEFAULT_THEME_COLOR;
  if (userId) {
    localStorage.setItem(`user_theme_primary_${userId}`, validHex);
  }
  localStorage.setItem('app_theme_primary', validHex);
  applyTheme(validHex);
}

/**
 * Récupère la couleur du thème définie par le Directeur pour le catalogue public
 */
export function getDirectorThemeColor(posSettings?: any, users?: any[]): string {
  // 1. Depuis les paramètres POS synchronisés en base de données
  if (posSettings?.themeColor && /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/.test(posSettings.themeColor)) {
    return posSettings.themeColor;
  }

  // 2. Depuis le profil du Directeur s'il a une préférence enregistrée
  if (users && users.length > 0) {
    const director = users.find(u => u.role === 'Directeur' || u.role === 'SuperAdmin');
    if (director?.id) {
      const dirColor = localStorage.getItem(`user_theme_primary_${director.id}`);
      if (dirColor && /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/.test(dirColor)) {
        return dirColor;
      }
    }
  }

  // 3. Depuis le localStorage global
  const globalColor = localStorage.getItem('app_theme_primary');
  if (globalColor && /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/.test(globalColor)) {
    return globalColor;
  }

  return DEFAULT_THEME_COLOR;
}
