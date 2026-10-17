import { useState, useEffect, useRef } from 'react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Sparkles, Mic, MicOff, Loader2, Plus, AlertCircle, Package, Volume2, Trash2, Radio } from 'lucide-react';
import { parseNaturalLanguageOrder, parseAudioVoiceOrder, type ParsedOrderItem } from '../../features/pos/services/PosAiService';
import type { PosProduct } from '../../context/AppContext';
import { getUserGeminiKey, setUserGeminiKey, testGeminiApiKey } from '../../lib/geminiKey';
import { formatVoiceTranscription } from '../../lib/searchUtils';
import { toast } from 'react-hot-toast';
import { Key, CheckCircle, Settings as SettingsIcon } from 'lucide-react';

interface PosVoiceAiModalProps {
  open: boolean;
  onClose: () => void;
  posProducts: PosProduct[];
  userId?: string;
  onAddItemsToCart: (items: { product: PosProduct; quantity: number }[], replace?: boolean) => void;
}

export default function PosVoiceAiModal({
  open,
  onClose,
  posProducts,
  userId,
  onAddItemsToCart
}: PosVoiceAiModalProps) {
  const [transcript, setTranscript] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [audioLevel, setAudioLevel] = useState(0); // 0 to 100
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [parsedItems, setParsedItems] = useState<ParsedOrderItem[]>([]);
  const [unmatched, setUnmatched] = useState<string[]>([]);
  const [interpretation, setInterpretation] = useState('');
  const [hasSearched, setHasSearched] = useState(false);
  const [permissionError, setPermissionError] = useState<string | null>(null);

  // Gemini API Key config state
  const [showKeyConfig, setShowKeyConfig] = useState(false);
  const [apiKeyInput, setApiKeyInput] = useState(() => getUserGeminiKey(userId));
  const [isTestingKey, setIsTestingKey] = useState(false);
  const [keyTestSuccess, setKeyTestSuccess] = useState<boolean | null>(null);

  useEffect(() => {
    setApiKeyInput(getUserGeminiKey(userId));
  }, [userId, open]);

  // Audio recording refs
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);

  // WebSpeech fallback ref
  const speechRecognitionRef = useRef<any>(null);

  // Cleanup audio tracks on unmount or close
  const cleanupAudio = () => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try {
        mediaRecorderRef.current.stop();
      } catch {}
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(track => track.stop());
      mediaStreamRef.current = null;
    }
    if (audioContextRef.current) {
      try {
        audioContextRef.current.close();
      } catch {}
      audioContextRef.current = null;
    }
    if (speechRecognitionRef.current) {
      try {
        speechRecognitionRef.current.stop();
      } catch {}
    }
    setIsRecording(false);
    setAudioLevel(0);
  };

  useEffect(() => {
    return () => {
      cleanupAudio();
    };
  }, []);

  // Démarre l'enregistrement audio avec visualiseur de volume
  const startRecording = async () => {
    cleanupAudio();
    setPermissionError(null);
    audioChunksRef.current = [];

    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error("L'accès au microphone n'est pas pris en charge par ce navigateur.");
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      });
      mediaStreamRef.current = stream;

      // Configuration AudioContext pour visualiseur de son en direct
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtx) {
        const audioCtx = new AudioCtx();
        audioContextRef.current = audioCtx;
        const source = audioCtx.createMediaStreamSource(stream);
        const analyser = audioCtx.createAnalyser();
        analyser.fftSize = 256;
        source.connect(analyser);
        analyserRef.current = analyser;

        const dataArray = new Uint8Array(analyser.frequencyBinCount);
        const updateLevel = () => {
          if (analyserRef.current) {
            analyserRef.current.getByteFrequencyData(dataArray);
            let sum = 0;
            for (let i = 0; i < dataArray.length; i++) {
              sum += dataArray[i];
            }
            const avg = sum / dataArray.length;
            // Normaliser à 0-100%
            setAudioLevel(Math.min(100, Math.round((avg / 128) * 100)));
            animationFrameRef.current = requestAnimationFrame(updateLevel);
          }
        };
        updateLevel();
      }

      // Configuration MediaRecorder
      let mimeType = 'audio/webm';
      if (typeof MediaRecorder.isTypeSupported === 'function') {
        if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) {
          mimeType = 'audio/webm;codecs=opus';
        } else if (MediaRecorder.isTypeSupported('audio/mp4')) {
          mimeType = 'audio/mp4';
        } else if (MediaRecorder.isTypeSupported('audio/ogg')) {
          mimeType = 'audio/ogg';
        }
      }

      const recorder = new MediaRecorder(stream, { mimeType });
      recorder.ondataavailable = (event: BlobEvent) => {
        if (event.data && event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      recorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: mimeType });
        if (audioBlob.size > 2000) { // Si audio non vide (> 2KB)
          processAudioWithGemini(audioBlob);
        }
      };

      recorder.start(250); // morceaux toutes les 250ms
      mediaRecorderRef.current = recorder;
      setIsRecording(true);
      toast.success('Micro activé ! Parlez maintenant...', { icon: '🎙️' });

      // Lancer également la reconnaissance texte navigateur en parallèle si supportée
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (SpeechRecognition) {
        try {
          const sr = new SpeechRecognition();
          sr.continuous = true;
          sr.interimResults = true;
          sr.lang = 'fr-FR';
          sr.onresult = (e: any) => {
            let resText = '';
            for (let i = 0; i < e.results.length; i++) {
              resText += e.results[i][0].transcript + ' ';
            }
            const clean = formatVoiceTranscription(resText);
            if (clean) {
              setTranscript(clean);
            }
          };
          sr.start();
          speechRecognitionRef.current = sr;
        } catch {}
      }
    } catch (err: any) {
      console.error('[AudioRecord] Error:', err);
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        setPermissionError("Accès au micro refusé. Veuillez autoriser le microphone dans les paramètres de votre navigateur.");
      } else {
        setPermissionError("Impossible d'activer le microphone : " + (err.message || err));
      }
      setIsRecording(false);
    }
  };

  // Arrête l'enregistrement et déclenche l'analyse
  const stopRecordingAndAnalyze = () => {
    if (!isRecording) return;
    setIsRecording(false);

    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    setAudioLevel(0);

    if (speechRecognitionRef.current) {
      try {
        speechRecognitionRef.current.stop();
      } catch {}
    }

    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try {
        mediaRecorderRef.current.stop();
      } catch {}
    }

    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(t => t.stop());
      mediaStreamRef.current = null;
    }

    toast('Traitement de votre enregistrement...', { icon: '⏳' });
  };

  // Envoi du flux audio directement à Gemini Multimodal
  const processAudioWithGemini = async (blob: Blob) => {
    setIsAnalyzing(true);
    setHasSearched(true);

    try {
      const res = await parseAudioVoiceOrder(blob, posProducts, userId);
      if (res.transcriptDetected) {
        setTranscript(res.transcriptDetected);
      }
      setParsedItems(res.items);
      setUnmatched(res.unmatchedPhrases);
      setInterpretation(res.rawInterpretation);

      if (res.items.length > 0) {
        toast.success(`${res.items.length} article(s) détecté(s) avec succès !`);
      } else if (res.transcriptDetected) {
        toast(`Texte entendu : "${res.transcriptDetected}". Aucun article correspondant trouvé.`, { icon: 'ℹ️' });
      } else {
        // Si l'audio n'a rien donné, tenter avec le transcript texte existant
        if (transcript.trim()) {
          handleTextAnalyze();
        } else {
          toast.error("Aucune voix audible n'a été détectée. Veuillez reparler plus près du micro.");
        }
      }
    } catch (err: any) {
      toast.error("Erreur d'analyse audio : " + (err.message || err));
    } finally {
      setIsAnalyzing(false);
    }
  };

  // Analyse manuelle du texte écrit
  const handleTextAnalyze = async () => {
    if (!transcript.trim()) {
      toast.error('Veuillez saisir ou dicter une commande.');
      return;
    }

    setIsAnalyzing(true);
    setHasSearched(true);

    try {
      const res = await parseNaturalLanguageOrder(transcript, posProducts, userId);
      setParsedItems(res.items);
      setUnmatched(res.unmatchedPhrases);
      setInterpretation(res.rawInterpretation);

      if (res.items.length === 0) {
        toast('Aucun article correspondant trouvé.', { icon: 'ℹ️' });
      } else {
        toast.success(`${res.items.length} article(s) trouvé(s) !`);
      }
    } catch (error: any) {
      toast.error('Erreur lors de l’analyse : ' + (error.message || error));
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleApplyToCart = (replace = false) => {
    if (parsedItems.length === 0) return;

    const itemsToAdd = parsedItems.map(item => {
      const prod = posProducts.find(p => p.id === item.productId);
      return {
        product: prod!,
        quantity: item.quantity
      };
    }).filter(i => !!i.product);

    onAddItemsToCart(itemsToAdd, replace);
    toast.success(`${itemsToAdd.length} article(s) ajouté(s) au panier !`);
    handleClose();
  };

  const handleClose = () => {
    cleanupAudio();
    setTranscript('');
    setParsedItems([]);
    setUnmatched([]);
    setInterpretation('');
    setHasSearched(false);
    onClose();
  };

  const updateItemQty = (productId: string, newQty: number) => {
    if (newQty < 1) return;
    setParsedItems(prev => prev.map(item => item.productId === productId ? { ...item, quantity: newQty } : item));
  };

  const removeItem = (productId: string) => {
    setParsedItems(prev => prev.filter(item => item.productId !== productId));
  };

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Commande Express IA (Dictée Vocale Intelligente & Texte)"
      width={580}
      footer={
        <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', alignItems: 'center' }}>
          <Button variant="ghost" onClick={handleClose}>
            Fermer
          </Button>

          {parsedItems.length > 0 && (
            <Button
              variant="primary"
              onClick={() => handleApplyToCart(false)}
              style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
            >
              <Plus size={16} /> Ajouter au panier ({parsedItems.reduce((acc, i) => acc + i.quantity, 0)} articles)
            </Button>
          )}
        </div>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

        {/* Gemini API Key Configuration Helper */}
        <div style={{
          padding: '10px 14px',
          borderRadius: 'var(--radius-md)',
          background: apiKeyInput ? 'var(--color-primary-tint)' : '#fffbeb',
          border: apiKeyInput ? '1px solid var(--color-primary)' : '1px solid #fde68a',
          fontSize: '13px',
          display: 'flex',
          flexDirection: 'column',
          gap: '8px'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 600, color: apiKeyInput ? 'var(--color-primary-strong)' : '#b45309' }}>
              <Key size={15} />
              <span>{apiKeyInput ? 'Clé API Gemini Caissier configurée' : '⚠️ Aucune clé API Gemini configurée pour le caissier'}</span>
            </div>
            <button
              type="button"
              onClick={() => setShowKeyConfig(!showKeyConfig)}
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--color-primary)',
                cursor: 'pointer',
                fontWeight: 600,
                fontSize: '12px',
                textDecoration: 'underline'
              }}
            >
              {showKeyConfig ? 'Masquer' : 'Modifier la clé'}
            </button>
          </div>

          {showKeyConfig && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', paddingTop: '6px', borderTop: '1px dashed var(--color-border)' }}>
              <div style={{ display: 'flex', gap: '8px' }}>
                <input
                  type="password"
                  placeholder="Collez votre clé API Gemini (ex: AIzaSy...)"
                  value={apiKeyInput}
                  onChange={e => {
                    setApiKeyInput(e.target.value);
                    setKeyTestSuccess(null);
                  }}
                  style={{
                    flex: 1,
                    padding: '6px 10px',
                    borderRadius: 'var(--radius-sm)',
                    border: '1px solid var(--color-border)',
                    fontSize: '13px',
                    fontFamily: 'monospace'
                  }}
                />
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={isTestingKey || !apiKeyInput.trim()}
                  onClick={async () => {
                    setIsTestingKey(true);
                    try {
                      const res = await testGeminiApiKey(apiKeyInput);
                      if (res.success) {
                        toast.success('Clé API valide !');
                        setKeyTestSuccess(true);
                      } else {
                        toast.error(res.message);
                        setKeyTestSuccess(false);
                      }
                    } catch (e: any) {
                      toast.error('Erreur test : ' + (e.message || e));
                      setKeyTestSuccess(false);
                    } finally {
                      setIsTestingKey(false);
                    }
                  }}
                >
                  {isTestingKey ? 'Test...' : 'Tester'}
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  disabled={!apiKeyInput.trim()}
                  onClick={() => {
                    if (userId) {
                      setUserGeminiKey(userId, apiKeyInput);
                    }
                    toast.success('Clé API enregistrée avec succès !');
                    setShowKeyConfig(false);
                  }}
                >
                  Enregistrer
                </Button>
              </div>
              <div style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>
                Obtenez une clé gratuite sur <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--color-primary)', textDecoration: 'underline' }}>Google AI Studio</a>.
              </div>
            </div>
          )}
        </div>

        {/* Permission / Support Warning */}
        {permissionError && (
          <div style={{ padding: '10px 14px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 'var(--radius-md)', color: '#b91c1c', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <AlertCircle size={18} />
            <span>{permissionError}</span>
          </div>
        )}

        {/* Big Interactive Audio Recording & Volume Section */}
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '20px 16px',
          borderRadius: 'var(--radius-lg)',
          background: isRecording ? 'linear-gradient(180deg, #f0fdf4 0%, #dcfce7 100%)' : 'var(--color-surface-alt)',
          border: isRecording ? '2px solid #22c55e' : '1px solid var(--color-border)',
          transition: 'all 0.2s',
          gap: '12px'
        }}>
          {/* Central Pulsing Mic Button */}
          <button
            type="button"
            onClick={isRecording ? stopRecordingAndAnalyze : startRecording}
            disabled={isAnalyzing}
            style={{
              width: '72px',
              height: '72px',
              borderRadius: '50%',
              background: isRecording ? '#ef4444' : 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)',
              color: 'white',
              border: 'none',
              cursor: isAnalyzing ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: isRecording
                ? `0 0 0 ${8 + audioLevel / 6}px rgba(239, 68, 68, 0.3)`
                : '0 4px 12px rgba(79, 70, 229, 0.3)',
              transition: 'all 0.15s ease-out'
            }}
            title={isRecording ? "Cliquez pour terminer et envoyer à l'IA" : "Cliquez pour commencer à parler"}
          >
            {isAnalyzing ? (
              <Loader2 size={32} className="animate-spin" />
            ) : isRecording ? (
              <MicOff size={32} />
            ) : (
              <Mic size={32} />
            )}
          </button>

          <div style={{ textAlign: 'center' }}>
            <div style={{ fontWeight: 700, fontSize: '15px', color: isRecording ? '#15803d' : 'var(--color-text)' }}>
              {isRecording ? '🎙️ Enregistrement en cours... Parlez !' : 'Cliquez sur le micro pour dicter votre commande'}
            </div>
            <div style={{ fontSize: '12px', color: 'var(--color-text-muted)', marginTop: '2px' }}>
              {isRecording
                ? 'Cliquez à nouveau quand vous avez terminé pour lancer l’analyse'
                : 'Ex: "3 cahiers 200 pages et 2 stylos bleus bic"'}
            </div>
          </div>

          {/* Live Sound Wave / Audio Level Meter */}
          {isRecording && (
            <div style={{ width: '80%', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px' }}>
              <div style={{ width: '100%', height: '8px', background: '#bbf7d0', borderRadius: '4px', overflow: 'hidden' }}>
                <div
                  style={{
                    height: '100%',
                    width: `${Math.max(5, audioLevel)}%`,
                    background: audioLevel > 50 ? '#16a34a' : '#22c55e',
                    borderRadius: '4px',
                    transition: 'width 0.05s ease-out'
                  }}
                />
              </div>
              <div style={{ fontSize: '11px', fontWeight: 600, color: audioLevel > 10 ? '#15803d' : '#94a3b8' }}>
                {audioLevel > 10 ? `🟢 Niveau vocal capté : ${audioLevel}%` : '⚪ En attente de votre voix...'}
              </div>
            </div>
          )}
        </div>

        {/* Text / Live transcript Area */}
        <div style={{ position: 'relative' }}>
          <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--color-text-muted)', marginBottom: '4px', display: 'block' }}>
            Texte transcrit ou saisie directe :
          </label>
          <textarea
            rows={3}
            value={transcript}
            onChange={e => setTranscript(e.target.value)}
            placeholder='Vous pouvez aussi modifier ou taper le texte ici directement...'
            style={{
              width: '100%',
              padding: '10px 14px',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--color-border)',
              fontSize: '14px',
              lineHeight: '1.4',
              resize: 'none',
              outline: 'none',
              background: 'white'
            }}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleTextAnalyze();
              }
            }}
          />

          {transcript && (
            <button
              type="button"
              onClick={() => setTranscript('')}
              style={{
                position: 'absolute',
                right: '10px',
                bottom: '10px',
                background: 'var(--color-surface-alt)',
                border: '1px solid var(--color-border)',
                borderRadius: 'var(--radius-sm)',
                padding: '3px 6px',
                fontSize: '11px',
                color: 'var(--color-text-muted)',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '4px'
              }}
              title="Effacer le texte"
            >
              <Trash2 size={11} /> Effacer
            </button>
          )}
        </div>

        {/* Quick action buttons & examples */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '12px', color: 'var(--color-text-muted)', alignSelf: 'center' }}>Exemples :</span>
            <button
              type="button"
              onClick={() => {
                setTranscript('3 cahiers 200 pages et 2 bics bleus');
              }}
              style={{ fontSize: '11px', padding: '4px 8px', borderRadius: 'var(--radius-full)', border: '1px solid var(--color-border)', background: 'var(--color-surface-alt)', cursor: 'pointer' }}
            >
              3 cahiers + 2 bics
            </button>
            <button
              type="button"
              onClick={() => {
                setTranscript('1 roman et 1 paquet de rame');
              }}
              style={{ fontSize: '11px', padding: '4px 8px', borderRadius: 'var(--radius-full)', border: '1px solid var(--color-border)', background: 'var(--color-surface-alt)', cursor: 'pointer' }}
            >
              1 roman + 1 paquet
            </button>
          </div>

          <Button
            variant="primary"
            onClick={handleTextAnalyze}
            disabled={isAnalyzing || !transcript.trim()}
            style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            {isAnalyzing ? (
              <>
                <Loader2 size={16} className="animate-spin" /> Analyse IA...
              </>
            ) : (
              <>
                <Sparkles size={16} /> Analyser le texte
              </>
            )}
          </Button>
        </div>

        {/* Interpretation / AI notes */}
        {interpretation && (
          <div style={{ fontSize: '13px', padding: '10px 12px', background: 'var(--color-primary-tint)', borderRadius: 'var(--radius-md)', color: 'var(--color-primary-strong)', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Sparkles size={16} />
            <span>{interpretation}</span>
          </div>
        )}

        {/* Unmatched alerts */}
        {unmatched.length > 0 && (
          <div style={{ fontSize: '13px', padding: '8px 12px', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 'var(--radius-md)', color: '#b45309', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <AlertCircle size={16} />
            <span>Articles non trouvés dans le catalogue : <b>{unmatched.join(', ')}</b></span>
          </div>
        )}

        {/* Parsed Items List */}
        {hasSearched && (
          <div style={{ borderTop: '1px solid var(--color-border)', paddingTop: '12px' }}>
            <div style={{ fontSize: '14px', fontWeight: 600, marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Package size={16} /> Articles identifiés ({parsedItems.length})
            </div>

            {parsedItems.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '20px 0', color: 'var(--color-text-muted)', fontSize: '13px' }}>
                Aucun produit du catalogue n'a pu être identifié formellement. Essayez de reformuler avec le nom exact des articles.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '200px', overflowY: 'auto' }}>
                {parsedItems.map(item => (
                  <div
                    key={item.productId}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '8px 12px',
                      background: 'var(--color-surface-alt)',
                      borderRadius: 'var(--radius-md)',
                      fontSize: '13px'
                    }}
                  >
                    <div style={{ flex: 1, marginRight: '12px' }}>
                      <div style={{ fontWeight: 600 }}>{item.productName}</div>
                      <div style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>
                        Réf: {item.reference} • Prix : {item.unitPrice.toLocaleString()} FCFA • Stock : {item.stockAvailable}
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <input
                        type="number"
                        min="1"
                        value={item.quantity}
                        onChange={e => updateItemQty(item.productId, parseInt(e.target.value) || 1)}
                        style={{
                          width: '54px',
                          padding: '4px 6px',
                          textAlign: 'center',
                          borderRadius: 'var(--radius-sm)',
                          border: '1px solid var(--color-border)',
                          fontWeight: 600
                        }}
                      />
                      <button
                        type="button"
                        onClick={() => removeItem(item.productId)}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: 'var(--color-error)',
                          cursor: 'pointer',
                          padding: '4px',
                          fontSize: '13px'
                        }}
                        title="Supprimer"
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}
