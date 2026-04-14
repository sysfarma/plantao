import React, { useState, useEffect } from 'react';
import { QrCode, Copy, CheckCircle, RefreshCw } from 'lucide-react';

interface PixPaymentManagerProps {
  onPaymentSuccess: () => void;
}

export default function PixPaymentManager({ onPaymentSuccess }: PixPaymentManagerProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [pixData, setPixData] = useState<{ payment_id: string; qr_code: string; qr_code_base64: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [status, setStatus] = useState<'pending' | 'approved'>('pending');

  const generatePix = async () => {
    setLoading(true);
    setError('');
    try {
      const token = localStorage.getItem('token');
      const res = await fetch('/api/payments/pix', {
        method: 'POST',
        headers: { 
          'Authorization': `Bearer ${token}`,
          'X-App-Token': `Bearer ${token}` 
        }
      });
      
      if (!res.ok) throw new Error('Falha ao gerar Pix');
      
      const data = await res.json();
      setPixData(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    generatePix();
  }, []);

  // Polling for payment status
  useEffect(() => {
    if (!pixData || status === 'approved') return;

    const intervalId = setInterval(async () => {
      try {
        const token = localStorage.getItem('token');
        const res = await fetch('/api/pharmacy/profile', {
          headers: { 
            'Authorization': `Bearer ${token}`,
            'X-App-Token': `Bearer ${token}` 
          }
        });
        if (res.ok) {
          const profile = await res.json();
          if (profile.subscription?.status === 'active') {
            setStatus('approved');
            clearInterval(intervalId);
            onPaymentSuccess();
          }
        }
      } catch (err) {
        console.error('Polling error', err);
      }
    }, 5000); // Check every 5 seconds

    return () => clearInterval(intervalId);
  }, [pixData, status, onPaymentSuccess]);

  const handleCopy = () => {
    if (pixData?.qr_code) {
      navigator.clipboard.writeText(pixData.qr_code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleSimulatePayment = async () => {
    if (!pixData) return;
    try {
      const token = localStorage.getItem('token');
      await fetch('/api/dev/simulate-payment', {
        method: 'POST',
        headers: { 
          'Authorization': `Bearer ${token}`,
          'X-App-Token': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ payment_id: pixData.payment_id })
      });
      // The polling will catch the update shortly, or we could manually trigger it here.
    } catch (err) {
      console.error('Simulation error', err);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center p-8">
        <RefreshCw className="w-8 h-8 text-emerald-600 animate-spin mb-4" />
        <p className="text-gray-600">Gerando código Pix...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center p-6 bg-red-50 rounded-lg">
        <p className="text-red-600 mb-4">{error}</p>
        <button onClick={generatePix} className="px-4 py-2 bg-red-100 text-red-700 rounded hover:bg-red-200 font-medium">
          Tentar Novamente
        </button>
      </div>
    );
  }

  if (status === 'approved') {
    return (
      <div className="flex flex-col items-center justify-center p-8 bg-emerald-50 rounded-lg border border-emerald-200">
        <CheckCircle className="w-16 h-16 text-emerald-500 mb-4" />
        <h3 className="text-xl font-bold text-emerald-800 mb-2">Pagamento Aprovado!</h3>
        <p className="text-emerald-600 text-center">Sua assinatura foi ativada com sucesso.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center">
      <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200 mb-6">
        {pixData?.qr_code_base64 && pixData.qr_code_base64.length > 100 ? (
          <img src={`data:image/png;base64,${pixData.qr_code_base64}`} alt="QR Code Pix" className="w-48 h-48" />
        ) : (
          <div className="w-48 h-48 bg-gray-100 flex items-center justify-center rounded border-2 border-dashed border-gray-300">
            <QrCode className="w-16 h-16 text-gray-400" />
          </div>
        )}
      </div>
      
      <p className="text-sm text-gray-500 mb-4 text-center max-w-sm">
        Escaneie o QR Code acima no app do seu banco ou copie o código abaixo.
      </p>
      
      <button 
        onClick={handleCopy}
        className="flex items-center gap-2 bg-emerald-600 text-white px-6 py-3 rounded-md font-medium hover:bg-emerald-700 transition-colors w-full max-w-xs justify-center"
      >
        {copied ? (
          <>
            <CheckCircle className="w-5 h-5" /> Copiado!
          </>
        ) : (
          <>
            <Copy className="w-5 h-5" /> Copiar Código Pix
          </>
        )}
      </button>

      {/* Dev Only Button */}
      {process.env.NODE_ENV !== 'production' && (
        <button 
          onClick={handleSimulatePayment}
          className="mt-8 text-xs text-gray-400 hover:text-emerald-600 underline"
        >
          [Dev] Simular Pagamento Aprovado
        </button>
      )}
    </div>
  );
}
