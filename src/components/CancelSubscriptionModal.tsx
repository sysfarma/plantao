import React, { useState } from 'react';
import { AlertTriangle, X, Loader2 } from 'lucide-react';
import { getAuthToken } from '../lib/firebase';
import { safeJsonFetch } from '../lib/api';

interface CancelSubscriptionModalProps {
  onClose: () => void;
  onSuccess: () => void;
  pharmacyName: string;
}

export default function CancelSubscriptionModal({ onClose, onSuccess, pharmacyName }: CancelSubscriptionModalProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmText, setConfirmText] = useState('');

  const handleCancel = async () => {
    if (confirmText !== pharmacyName) {
      setError(`Digite "${pharmacyName}" para confirmar.`);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const authToken = await getAuthToken();
      if (!authToken) throw new Error('Usuário não autenticado');

      const result = await safeJsonFetch('/api/subscriptions/cancel', {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${authToken}`
        }
      });

      if (result.success) {
        onSuccess();
      } else {
        throw new Error(result.error || 'Erro ao cancelar assinatura');
      }
    } catch (err: any) {
      setError(err.message || 'Erro ao processar cancelamento, tente novamente.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black bg-opacity-70 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden relative border-t-4 border-red-600">
        <button 
          onClick={onClose}
          disabled={loading}
          className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 z-10 disabled:opacity-50"
        >
          <X className="w-6 h-6" />
        </button>
        <div className="p-6">
          <div className="flex items-center justify-center w-16 h-16 rounded-full bg-red-100 mx-auto mb-4">
            <AlertTriangle className="w-8 h-8 text-red-600" />
          </div>
          
          <h2 className="text-xl font-bold text-gray-900 text-center mb-2">Cancelar Assinatura?</h2>
          
          <div className="space-y-4 my-6 text-sm text-gray-600 bg-red-50 p-4 rounded-lg">
            <p><strong>Atenção:</strong> Ao confirmar o cancelamento, sua farmácia perderá:</p>
            <ul className="list-disc pl-5 space-y-1">
              <li>Exibição prioritária no mapa</li>
              <li>Divulgação de próximos plantões</li>
              <li>Acesso a links diretos para seu WhatsApp</li>
            </ul>
            <p className="font-semibold text-red-800 mt-2">
              Esta ação entra em vigor imediatamente e é irreversível.
            </p>
          </div>

          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Digite <span className="font-bold text-gray-900">"{pharmacyName}"</span> para confirmar:
            </label>
            <input
              type="text"
              value={confirmText}
              onChange={(e) => {
                setConfirmText(e.target.value);
                setError(null);
              }}
              className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-red-500 focus:border-red-500 sm:text-sm"
              placeholder={pharmacyName}
            />
            {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
          </div>

          <div className="flex gap-3">
            <button
              onClick={onClose}
              disabled={loading}
              className="flex-1 py-2 px-4 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-emerald-500"
            >
              Manter Assinatura
            </button>
            <button
              onClick={handleCancel}
              disabled={loading || confirmText !== pharmacyName}
              className="flex-1 py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-red-600 hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 disabled:opacity-50 flex justify-center items-center gap-2"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Processando...
                </>
              ) : (
                'Sim, Quero Cancelar'
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
