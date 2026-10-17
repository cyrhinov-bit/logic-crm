import { useState, useRef, useCallback, useEffect } from 'react';
import { toast } from 'react-hot-toast';

export function useProductCamera(onCapture: (dataUrl: string) => void) {
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const [isCameraActive, setIsCameraActive] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const cameraStreamRef = useRef<MediaStream | null>(null);

  const stopCameraStream = useCallback(() => {
    if (cameraStreamRef.current) {
      cameraStreamRef.current.getTracks().forEach((track) => track.stop());
      cameraStreamRef.current = null;
    }
    setIsCameraActive(false);
  }, []);

  const startCamera = useCallback(async (desiredFacing = facingMode) => {
    try {
      stopCameraStream();
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: desiredFacing },
          width: { ideal: 1280 },
          height: { ideal: 1280 }
        },
        audio: false
      });
      cameraStreamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
      setIsCameraActive(true);
    } catch (err) {
      console.error('Erreur accès caméra:', err);
      toast.error("Impossible d'accéder à la caméra. Vérifiez les autorisations du navigateur.");
      setIsCameraActive(false);
    }
  }, [facingMode, stopCameraStream]);

  const toggleFacingMode = useCallback(() => {
    const nextFacing = facingMode === 'environment' ? 'user' : 'environment';
    setFacingMode(nextFacing);
    startCamera(nextFacing);
  }, [facingMode, startCamera]);

  const capturePhoto = useCallback(() => {
    if (!videoRef.current) return;
    const video = videoRef.current;
    const canvas = document.createElement('canvas');
    const size = Math.min(video.videoWidth || 640, video.videoHeight || 640);
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      const startX = (video.videoWidth - size) / 2;
      const startY = (video.videoHeight - size) / 2;
      ctx.drawImage(video, startX, startY, size, size, 0, 0, size, size);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.95);
      stopCameraStream();
      onCapture(dataUrl);
    }
  }, [onCapture, stopCameraStream]);

  useEffect(() => {
    return () => {
      stopCameraStream();
    };
  }, [stopCameraStream]);

  return {
    videoRef,
    facingMode,
    isCameraActive,
    startCamera,
    stopCameraStream,
    toggleFacingMode,
    capturePhoto
  };
}
