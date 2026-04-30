import React, { useEffect, useState } from 'react';
import { useToast } from './Toast';
import { WifiOff, Wifi } from 'lucide-react';

export const StabilityToast: React.FC = () => {
  const { showToast } = useToast();
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      showToast('Conexão restabelecida. O sistema está estável.', 'success');
    };

    const handleOffline = () => {
      setIsOnline(false);
      showToast('Você parece estar offline. Algumas funcionalidades podem não funcionar.', 'warning');
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [showToast]);

  // This component doesn't render anything itself, it just uses the toast system
  return null;
};
