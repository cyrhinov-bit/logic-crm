/**
 * Smart Image Enhancer pour Produits de Catalogue E-Commerce (Hinov Group)
 * Algorithmes de traitement d'image haute performance sur Canvas 2D
 */

export interface EnhanceOptions {
  preset?: 'auto' | 'studio' | 'vibrant' | 'sharp' | 'none';
  brightness?: number; // -100 à 100 (défaut: 0)
  contrast?: number;   // -100 à 100 (défaut: 0)
  saturation?: number; // -100 à 100 (défaut: 0)
  sharpen?: number;    // 0 à 10 (défaut: 0)
  whiteBoost?: number; // 0 à 100 (défaut: 0, éclaircit les fonds clairs pour effet studio)
  rotation?: number;   // 0, 90, 180, 270
  targetSize?: number; // Largeur/Hauteur du carré 1:1 en pixels (défaut: 800)
  quality?: number;    // Qualité de compression 0.1 à 1.0 (défaut: 0.88)
}

export const PRESET_CONFIGS: Record<string, Required<Omit<EnhanceOptions, 'preset' | 'rotation' | 'targetSize' | 'quality'>>> = {
  auto: {
    brightness: 8,
    contrast: 15,
    saturation: 10,
    sharpen: 3,
    whiteBoost: 20
  },
  studio: {
    brightness: 12,
    contrast: 22,
    saturation: 8,
    sharpen: 4,
    whiteBoost: 45 // Fond blanc ultra propre
  },
  vibrant: {
    brightness: 6,
    contrast: 18,
    saturation: 30, // Couleurs éclatantes (livres, fournitures)
    sharpen: 3,
    whiteBoost: 15
  },
  sharp: {
    brightness: 5,
    contrast: 14,
    saturation: 5,
    sharpen: 7, // Accentuation maximale pour textes et codes
    whiteBoost: 15
  },
  none: {
    brightness: 0,
    contrast: 0,
    saturation: 0,
    sharpen: 0,
    whiteBoost: 0
  }
};

/**
 * Charge une source image (File, Blob, string URL/base64) en objet HTMLImageElement
 */
export function loadImageElement(source: File | Blob | string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';

    img.onload = () => resolve(img);
    img.onerror = (err) => reject(new Error("Impossible de charger l'image: " + err));

    if (typeof source === 'string') {
      img.src = source;
    } else {
      const url = URL.createObjectURL(source);
      img.src = url;
      img.onload = () => {
        URL.revokeObjectURL(url);
        resolve(img);
      };
    }
  });
}

/**
 * Recadre, redresse, améliore et optimise une photo de produit
 */
export async function enhanceProductImage(
  source: File | Blob | string,
  options: EnhanceOptions = {}
): Promise<{ dataUrl: string; blob: Blob; width: number; height: number }> {
  const img = await loadImageElement(source);

  const presetKey = options.preset || 'auto';
  const preset = PRESET_CONFIGS[presetKey] || PRESET_CONFIGS.auto;

  const brightness = options.brightness !== undefined ? options.brightness : preset.brightness;
  const contrast = options.contrast !== undefined ? options.contrast : preset.contrast;
  const saturation = options.saturation !== undefined ? options.saturation : preset.saturation;
  const sharpen = options.sharpen !== undefined ? options.sharpen : preset.sharpen;
  const whiteBoost = options.whiteBoost !== undefined ? options.whiteBoost : preset.whiteBoost;
  const rotation = (options.rotation || 0) % 360;
  const targetSize = options.targetSize || 800;
  const quality = options.quality || 0.88;

  // Création du canvas de travail
  const canvas = document.createElement('canvas');
  canvas.width = targetSize;
  canvas.height = targetSize;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error("Impossible d'initialiser le contexte Canvas 2D");

  // Remplissage fond blanc pur de base
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, targetSize, targetSize);

  ctx.save();
  // Gestion de la rotation et centrage
  ctx.translate(targetSize / 2, targetSize / 2);
  if (rotation !== 0) {
    ctx.rotate((rotation * Math.PI) / 180);
  }

  // Calcul du ratio pour ajuster l'image dans le carré 1:1 avec une marge esthétique de 4%
  const padding = targetSize * 0.04;
  const usableSize = targetSize - padding * 2;

  let drawWidth = img.naturalWidth || img.width;
  let drawHeight = img.naturalHeight || img.height;

  if (rotation === 90 || rotation === 270) {
    const temp = drawWidth;
    drawWidth = drawHeight;
    drawHeight = temp;
  }

  const scale = Math.min(usableSize / drawWidth, usableSize / drawHeight);
  const finalW = (img.naturalWidth || img.width) * scale;
  const finalH = (img.naturalHeight || img.height) * scale;

  ctx.drawImage(img, -finalW / 2, -finalH / 2, finalW, finalH);
  ctx.restore();

  // Traitement direct des pixels (Pixel Manipulation)
  let imageData = ctx.getImageData(0, 0, targetSize, targetSize);
  const data = imageData.data;

  // 1. Correction Luminosité, Contraste, Saturation & Éclaircissement du fond blanc
  const contrastFactor = (259 * (contrast + 255)) / (255 * (259 - contrast));
  const brightAdd = (brightness / 100) * 128;
  const satFactor = 1 + saturation / 100;

  for (let i = 0; i < data.length; i += 4) {
    let r = data[i];
    let g = data[i + 1];
    let b = data[i + 2];

    // A. Luminosité
    r += brightAdd;
    g += brightAdd;
    b += brightAdd;

    // B. Contraste
    r = contrastFactor * (r - 128) + 128;
    g = contrastFactor * (g - 128) + 128;
    b = contrastFactor * (b - 128) + 128;

    // C. Saturation
    const gray = 0.2989 * r + 0.587 * g + 0.114 * b;
    r = gray + (r - gray) * satFactor;
    g = gray + (g - gray) * satFactor;
    b = gray + (b - gray) * satFactor;

    // D. Éclaircissement sélectif du fond (White Boost)
    // Si le pixel est déjà proche du blanc/gris clair (> 195), on le pousse vers 255
    if (whiteBoost > 0 && r > 185 && g > 185 && b > 185) {
      const boostAmount = (whiteBoost / 100) * 45;
      r += boostAmount;
      g += boostAmount;
      b += boostAmount;
    }

    data[i] = Math.min(255, Math.max(0, r));
    data[i + 1] = Math.min(255, Math.max(0, g));
    data[i + 2] = Math.min(255, Math.max(0, b));
  }

  ctx.putImageData(imageData, 0, 0);

  // 2. Convolution Sharpening (Netteté des détails / textes de livres)
  if (sharpen > 0) {
    imageData = applySharpenConvolution(ctx, targetSize, targetSize, sharpen);
    ctx.putImageData(imageData, 0, 0);
  }

  // Exportation optimisée WebP / JPEG
  const isWebpSupported = canvas.toDataURL('image/webp').indexOf('data:image/webp') === 0;
  const mimeType = isWebpSupported ? 'image/webp' : 'image/jpeg';
  const dataUrl = canvas.toDataURL(mimeType, quality);

  const blob = await new Promise<Blob>((resolve) => {
    canvas.toBlob((b) => resolve(b || new Blob()), mimeType, quality);
  });

  return {
    dataUrl,
    blob,
    width: targetSize,
    height: targetSize
  };
}

/**
 * Filtre de netteté par matrice de convolution spatiale (Sharpen Matrix)
 */
function applySharpenConvolution(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  intensity: number
): ImageData {
  const srcData = ctx.getImageData(0, 0, w, h);
  const src = srcData.data;
  const output = ctx.createImageData(w, h);
  const dst = output.data;

  // Poids du filtre de netteté proportionnel à l'intensité
  const weight = (intensity / 10) * 0.8;
  const center = 1 + 4 * weight;
  const edge = -weight;

  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const idx = (y * w + x) * 4;

      for (let c = 0; c < 3; c++) {
        const top = ((y - 1) * w + x) * 4 + c;
        const bottom = ((y + 1) * w + x) * 4 + c;
        const left = (y * w + (x - 1)) * 4 + c;
        const right = (y * w + (x + 1)) * 4 + c;

        const val =
          src[idx + c] * center +
          (src[top] + src[bottom] + src[left] + src[right]) * edge;

        dst[idx + c] = Math.min(255, Math.max(0, val));
      }
      dst[idx + 3] = src[idx + 3]; // Alpha
    }
  }

  return output;
}

/**
 * Redimensionne et compresse une photo de profil pour obtenir un avatar léger (< 40 Ko) en JPEG/WebP
 */
export async function compressProfileAvatar(source: File | Blob | string, maxDim = 256): Promise<string> {
  const img = await loadImageElement(source);
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D context non disponible');

  let width = img.naturalWidth || img.width;
  let height = img.naturalHeight || img.height;

  // Calcul du cadrage centré carré (1:1)
  const minDim = Math.min(width, height);
  const srcX = (width - minDim) / 2;
  const srcY = (height - minDim) / 2;

  canvas.width = maxDim;
  canvas.height = maxDim;

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  ctx.drawImage(img, srcX, srcY, minDim, minDim, 0, 0, maxDim, maxDim);

  return canvas.toDataURL('image/jpeg', 0.85);
}
