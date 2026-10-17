import React from 'react';
import { 
  Sparkles, TrendingUp, DollarSign, ShoppingBag, Package, ShieldAlert, 
  Lightbulb, AlertTriangle, CheckCircle2, ChevronRight, ArrowUpRight, 
  Wallet, ShieldCheck, Tag
} from 'lucide-react';
import './DirectorAiResponseViewer.css';

interface DirectorAiResponseViewerProps {
  content: string;
}

/**
 * Analyseur intelligent et composant de rendu visuel moderne pour les réponses de l'IA Direction POS
 */
export const DirectorAiResponseViewer: React.FC<DirectorAiResponseViewerProps> = ({ content }) => {
  if (!content) return null;

  // Découper la réponse en blocs par lignes
  const lines = content.split('\n');
  const blocks: React.ReactNode[] = [];

  let currentAdviceItems: string[] = [];
  let currentListItems: string[] = [];
  let isInsideAdviceSection = false;

  const flushListItems = (keyPrefix: string) => {
    if (currentListItems.length > 0) {
      const items = [...currentListItems];
      currentListItems = [];
      blocks.push(
        <div key={`${keyPrefix}-list`} className="ai-styled-list">
          {items.map((it, idx) => (
            <div key={idx} className="ai-styled-list-item">
              <span className="ai-styled-bullet" />
              <div>{renderFormattedText(it)}</div>
            </div>
          ))}
        </div>
      );
    }
  };

  const flushAdviceItems = (keyPrefix: string) => {
    if (currentAdviceItems.length > 0) {
      const items = [...currentAdviceItems];
      currentAdviceItems = [];
      blocks.push(
        <div key={`${keyPrefix}-advice`} className="ai-advice-card">
          <div className="ai-advice-header">
            <div className="ai-advice-icon-wrap">
              <Lightbulb size={16} />
            </div>
            <span>Conseils & Recommandations Stratégiques</span>
          </div>
          <div className="ai-advice-list">
            {items.map((adv, idx) => (
              <div key={idx} className="ai-advice-item">
                <div className="ai-advice-badge">{idx + 1}</div>
                <div>{renderFormattedText(adv)}</div>
              </div>
            ))}
          </div>
        </div>
      );
    }
  };

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i].trim();
    if (!rawLine) continue;

    // 1. Titres et En-têtes (###, ##, ####)
    if (rawLine.startsWith('#')) {
      flushListItems(`h-${i}`);
      flushAdviceItems(`h-${i}`);
      isInsideAdviceSection = false;

      const titleText = rawLine.replace(/^#+\s*/, '').trim();
      const isAdviceHeader = titleText.toLowerCase().includes('conseil') || titleText.toLowerCase().includes('recommandation') || titleText.toLowerCase().includes('plan d');
      const isAlertHeader = titleText.toLowerCase().includes('alerte') || titleText.toLowerCase().includes('rupture') || titleText.toLowerCase().includes('sécurité');
      const isFinanceHeader = titleText.toLowerCase().includes('financ') || titleText.toLowerCase().includes('chiffre') || titleText.toLowerCase().includes('bilan');

      if (isAdviceHeader) {
        isInsideAdviceSection = true;
        continue;
      }

      blocks.push(
        <div key={`title-${i}`} className="ai-section-title">
          {isAlertHeader ? (
            <AlertTriangle size={18} color="#EF4444" />
          ) : isFinanceHeader ? (
            <TrendingUp size={18} color="#4F46E5" />
          ) : (
            <Sparkles size={18} color="#8B5CF6" />
          )}
          <span>{titleText}</span>
        </div>
      );
      continue;
    }

    // 2. Éléments de la section Conseils
    if (isInsideAdviceSection) {
      if (rawLine.match(/^(\d+\.|\-|\*|•)/)) {
        const itemText = rawLine.replace(/^(\d+\.|\-|\*|•)\s*/, '').trim();
        currentAdviceItems.push(itemText);
        continue;
      } else {
        currentAdviceItems.push(rawLine);
        continue;
      }
    }

    // 3. Alertes Critiques / Ruptures de stock (❌, ⚠️, 🚨)
    if (rawLine.startsWith('- ❌') || rawLine.startsWith('❌') || rawLine.startsWith('• ❌')) {
      flushListItems(`crit-${i}`);
      const text = rawLine.replace(/^[-•*]?\s*❌\s*/, '').trim();
      blocks.push(
        <div key={`crit-${i}`} className="ai-alert-banner critical">
          <AlertTriangle size={18} style={{ flexShrink: 0, marginTop: '2px' }} />
          <div>{renderFormattedText(text)}</div>
        </div>
      );
      continue;
    }

    if (rawLine.startsWith('- ⚠️') || rawLine.startsWith('⚠️') || rawLine.startsWith('• ⚠️')) {
      flushListItems(`warn-${i}`);
      const text = rawLine.replace(/^[-•*]?\s*⚠️\s*/, '').trim();
      blocks.push(
        <div key={`warn-${i}`} className="ai-alert-banner warning">
          <ShieldAlert size={18} style={{ flexShrink: 0, marginTop: '2px' }} />
          <div>{renderFormattedText(text)}</div>
        </div>
      );
      continue;
    }

    if (rawLine.startsWith('- ✅') || rawLine.startsWith('✅') || rawLine.startsWith('• ✅')) {
      flushListItems(`succ-${i}`);
      const text = rawLine.replace(/^[-•*]?\s*✅\s*/, '').trim();
      blocks.push(
        <div key={`succ-${i}`} className="ai-alert-banner success">
          <CheckCircle2 size={18} style={{ flexShrink: 0, marginTop: '2px' }} />
          <div>{renderFormattedText(text)}</div>
        </div>
      );
      continue;
    }

    // 4. Lignes à puces standards (- ou •)
    if (rawLine.startsWith('-') || rawLine.startsWith('•') || rawLine.startsWith('*')) {
      const itemText = rawLine.replace(/^[-•*]\s*/, '').trim();
      currentListItems.push(itemText);
      continue;
    }

    // 5. Paragraphe régulier
    flushListItems(`p-${i}`);
    blocks.push(
      <p key={`p-${i}`} style={{ margin: '4px 0', lineHeight: '1.6', fontSize: '0.93rem', color: '#1e293b' }}>
        {renderFormattedText(rawLine)}
      </p>
    );
  }

  // Vider les résidus
  flushListItems('end');
  flushAdviceItems('end');

  return (
    <div className="ai-response-container">
      {blocks}
    </div>
  );
};

/**
 * Formate le texte markdown brut avec mise en valeur des montants FCFA, pourcentages et gras
 */
function renderFormattedText(text: string): React.ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);

  return parts.map((part, index) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      const inner = part.slice(2, -2);
      const isAmount = inner.includes('FCFA') || inner.includes('%');

      if (isAmount) {
        return (
          <span 
            key={index} 
            style={{ 
              fontWeight: 800, 
              color: '#0f172a',
              background: '#ede9fe',
              padding: '1px 6px',
              borderRadius: '6px',
              border: '1px solid #ddd6fe',
              display: 'inline-block',
              margin: '0 2px'
            }}
          >
            {inner}
          </span>
        );
      }

      return <strong key={index} style={{ fontWeight: 700, color: '#1e1b4b' }}>{inner}</strong>;
    }

    return part;
  });
}
