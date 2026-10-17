import { useState, useRef, useCallback } from 'react';
import { Camera, X, Check, RefreshCw } from 'lucide-react';

interface CameraCaptureProps {
  onCapture: (file: File) => void;
  onCancel: () => void;
}

export default function CameraCapture({ onCapture, onCancel }: CameraCaptureProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);

  const startCamera = useCallback(async () => {
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      setStream(mediaStream);
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
      }
      setError(null);
    } catch (err) {
      console.error('Erreur caméra:', err);
      setError('Impossible d\'accéder à la caméra. Vérifiez les permissions.');
    }
  }, []);

  const stopCamera = useCallback(() => {
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
      setStream(null);
    }
  }, [stream]);

  // Start on mount, stop on unmount
  useState(() => {
    startCamera();
    return stopCamera;
  });

  const handleCapture = () => {
    if (videoRef.current && canvasRef.current) {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL('image/jpeg');
        setCapturedImage(dataUrl);
        stopCamera();
      }
    }
  };

  const handleRetake = () => {
    setCapturedImage(null);
    startCamera();
  };

  const handleConfirm = () => {
    if (capturedImage) {
      // Convert base64 to File
      fetch(capturedImage)
        .then(res => res.blob())
        .then(blob => {
          const file = new File([blob], `capture_${Date.now()}.jpg`, { type: 'image/jpeg' });
          onCapture(file);
        });
    }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px' }}>
      <div style={{ background: 'white', borderRadius: 'var(--radius-lg)', overflow: 'hidden', width: '100%', maxWidth: '500px', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--color-border)' }}>
          <h3 style={{ fontSize: '16px', fontWeight: 600 }}>Prendre une photo</h3>
          <button onClick={() => { stopCamera(); onCancel(); }} style={{ background: 'none', border: 'none', cursor: 'pointer' }}>
            <X size={20} />
          </button>
        </div>

        <div style={{ position: 'relative', background: '#000', minHeight: '300px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {error ? (
            <div style={{ color: 'var(--color-error)', padding: '20px', textAlign: 'center' }}>{error}</div>
          ) : capturedImage ? (
            <img src={capturedImage} alt="Capture" style={{ width: '100%', height: 'auto', display: 'block' }} />
          ) : (
            <video ref={videoRef} autoPlay playsInline style={{ width: '100%', height: 'auto', display: 'block' }} />
          )}
          <canvas ref={canvasRef} style={{ display: 'none' }} />
        </div>

        <div style={{ padding: '16px', display: 'flex', justifyContent: 'center', gap: '16px' }}>
          {capturedImage ? (
            <>
              <button className="btn btn-secondary" onClick={handleRetake}>
                <RefreshCw size={16} style={{ marginRight: '8px' }} /> Reprendre
              </button>
              <button className="btn btn-primary" onClick={handleConfirm}>
                <Check size={16} style={{ marginRight: '8px' }} /> Valider
              </button>
            </>
          ) : (
            <button className="btn btn-primary" onClick={handleCapture} disabled={!!error} style={{ width: '100%' }}>
              <Camera size={16} style={{ marginRight: '8px' }} /> Prendre la photo
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
