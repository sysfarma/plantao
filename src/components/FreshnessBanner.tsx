import React from 'react';
import { RefreshCw } from 'lucide-react';

interface FreshnessBannerProps {
  lastUpdated: Date | null;
}

const FreshnessBanner: React.FC<FreshnessBannerProps> = ({ lastUpdated }) => {
  if (!lastUpdated) return null;

  const formattedDate = lastUpdated.toLocaleDateString('pt-BR');
  const formattedTime = lastUpdated.toLocaleTimeString('pt-BR', { 
    hour: '2-digit', 
    minute: '2-digit' 
  });

  return (
    <div className="bg-emerald-50 border border-emerald-100 rounded-lg p-3 mb-6 flex items-center justify-center gap-2 text-emerald-700 text-sm font-medium shadow-sm animate-in fade-in slide-in-from-top-1 duration-500">
      <RefreshCw className="w-4 h-4 animate-spin-slow" />
      <span>
        Informações em tempo real. Atualizado em: <strong>{formattedDate}</strong> às <strong>{formattedTime}</strong>
      </span>
    </div>
  );
};

export default FreshnessBanner;
