import React from 'react';
import { AlertCircle, X } from 'lucide-react';

interface AlertProps {
  title?: string;
  message: string;
  variant?: 'error' | 'warning' | 'info';
  onClose?: () => void;
}

export function Alert({ title, message, variant = 'error', onClose }: AlertProps) {
  const variants = {
    error: 'bg-red-50 text-red-800 border-red-200',
    warning: 'bg-amber-50 text-amber-800 border-amber-200',
    info: 'bg-blue-50 text-blue-800 border-blue-200',
  };

  const icons = {
    error: <AlertCircle className="w-5 h-5 text-red-500" />,
    warning: <AlertCircle className="w-5 h-5 text-amber-500" />,
    info: <AlertCircle className="w-5 h-5 text-blue-500" />,
  };

  return (
    <div className={`p-4 rounded-lg border flex gap-3 ${variants[variant]}`}>
      <div className="flex-shrink-0">{icons[variant]}</div>
      <div className="flex-1">
        {title && <h3 className="text-sm font-bold mb-1">{title}</h3>}
        <p className="text-sm">{message}</p>
      </div>
      {onClose && (
        <button 
          onClick={onClose}
          className="flex-shrink-0 h-fit"
        >
          <X className="w-4 h-4 opacity-50 hover:opacity-100 transition-opacity" />
        </button>
      )}
    </div>
  );
}
