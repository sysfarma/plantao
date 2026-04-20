import React, { useState } from 'react';
import { QrCode, CreditCard, CheckCircle2, Loader2, AlertCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { safeJsonFetch } from '../lib/api';
import PixPaymentManager from './PixPaymentManager';
import CardPaymentForm from './CardPaymentForm';

import { getAuthToken } from '../lib/firebase';

interface PaymentMethodSelectorProps {
  onSuccess: () => void;
  planType?: string;
  planPrice?: number;
  isUpdate?: boolean;
}

export default function PaymentMethodSelector({ onSuccess, planType = 'annual', planPrice = 69.96, isUpdate = false }: PaymentMethodSelectorProps) {
  const [method, setMethod] = useState<'pix' | 'card'>('pix');
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFreeActivation = async () => {
    setLoading(true);
    setError(null);
    try {
      const authToken = await getAuthToken();
      if (!authToken) throw new Error('Usuário não autenticado');

      const endpoint = isUpdate ? '/api/subscriptions/update' : '/api/subscriptions/create';
      const method = isUpdate ? 'PUT' : 'POST';

      const result = await safeJsonFetch(endpoint, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`
        },
        body: JSON.stringify({ planType })
      });

      if (result.success) {
        setSuccess(true);
        setTimeout(() => {
          onSuccess();
        }, 2000);
      } else {
        throw new Error(result.error || 'Erro ao ativar plano');
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleCardSuccess = async (token: string, paymentData: any) => {
    setLoading(true);
    setError(null);
    try {
      const authToken = await getAuthToken();
      if (!authToken) throw new Error('Usuário não autenticado');

      const endpoint = isUpdate ? '/api/subscriptions/update' : '/api/subscriptions/create';
      const method = isUpdate ? 'PUT' : 'POST';

      const result = await safeJsonFetch(endpoint, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`
        },
        body: JSON.stringify({
          card_token: token,
          email: paymentData.cardholderEmail,
          identificationType: paymentData.docType,
          identificationNumber: paymentData.docNumber,
          planType
        })
      });

      if (result.success) {
        setSuccess(true);
        setTimeout(() => {
          onSuccess();
        }, 3000);
      } else {
        throw new Error(result.error || 'Erro ao processar assinatura');
      }
    } catch (err: any) {
      console.error('Subscription error:', err);
      setError(err.message || 'Erro ao processar assinatura com cartão');
    } finally {
      setLoading(false);
    }
  };

  const handlePixSuccess = () => {
    setSuccess(true);
    setTimeout(() => {
      onSuccess();
    }, 2000);
  };

  if (success) {
    return (
      <motion.div 
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        className="flex flex-col items-center justify-center py-12 text-center"
      >
        <div className="relative mb-6">
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: 'spring', damping: 12, stiffness: 200 }}
            className="w-24 h-24 bg-emerald-100 rounded-full flex items-center justify-center text-emerald-600"
          >
            <CheckCircle2 className="w-14 h-14" />
          </motion.div>
          <motion.div
            animate={{ scale: [1, 1.2, 1], opacity: [0, 0.5, 0] }}
            transition={{ repeat: Infinity, duration: 2 }}
            className="absolute inset-0 bg-emerald-400 rounded-full"
          />
        </div>
        
        <motion.h3 
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="text-2xl font-bold text-gray-900 mb-2"
        >
          ¡Assinatura Ativada!
        </motion.h3>
        
        <motion.p 
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="text-gray-500 max-w-xs mx-auto text-sm leading-relaxed"
        >
          {planPrice === 0 
            ? 'Seu plano gratuito foi ativado. Sua farmácia já está visível para os clientes.' 
            : 'Obrigado por escolher o Premium! Sua visibilidade foi impulsionada com sucesso.'}
        </motion.p>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
          className="mt-8 flex items-center gap-2 text-emerald-600 font-medium text-sm animate-pulse"
        >
          <Loader2 className="w-4 h-4 animate-spin" />
          Redirecionando para o painel...
        </motion.div>
      </motion.div>
    );
  }

  if (planPrice === 0) {
    return (
      <div className="text-center py-8">
        <div className="w-20 h-20 bg-emerald-50 rounded-3xl flex items-center justify-center mx-auto mb-6 transform rotate-3">
          <CheckCircle2 className="w-10 h-10 text-emerald-600" />
        </div>
        <h4 className="text-2xl font-extrabold text-gray-900 mb-2">Plano Gratuito</h4>
        <p className="text-gray-500 mb-8 max-w-[280px] mx-auto text-sm leading-relaxed">
          Comece agora mesmo com as funcionalidades fundamentais sem nenhum custo mensal.
        </p>
        
        <AnimatePresence>
          {error && (
            <motion.div 
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="mb-8 p-4 bg-red-50 text-red-700 rounded-2xl border border-red-100 text-xs flex items-start gap-3 text-left"
            >
              <AlertCircle className="w-5 h-5 flex-shrink-0" />
              <div className="flex-1">
                <p className="font-bold mb-1">Ops! Ocorreu um erro</p>
                <p className="opacity-80 italic">{error}</p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <button
          onClick={handleFreeActivation}
          disabled={loading}
          className="w-full py-4 bg-emerald-600 text-white font-bold rounded-2xl hover:bg-emerald-700 transition-all flex items-center justify-center gap-2 shadow-xl hover:shadow-emerald-200 disabled:opacity-50 group"
        >
          {loading ? (
            <Loader2 className="w-5 h-5 animate-spin" />
          ) : (
            <>
              Confirmar Plano Grátis
              <motion.span
                animate={{ x: [0, 5, 0] }}
                transition={{ repeat: Infinity, duration: 1.5 }}
              >
                →
              </motion.span>
            </>
          )}
        </button>
      </div>
    );
  }

  return (
    <div className="w-full max-w-md mx-auto">
      {/* Tabs */}
      <div className="flex bg-gray-100 p-1.5 rounded-2xl mb-8">
        <button
          onClick={() => setMethod('pix')}
          className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-bold transition-all ${
            method === 'pix' 
              ? 'bg-white text-emerald-600 shadow-sm' 
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          <QrCode className="w-4 h-4" />
          Pix
        </button>
        <button
          onClick={() => setMethod('card')}
          className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-bold transition-all ${
            method === 'card' 
              ? 'bg-white text-emerald-600 shadow-sm' 
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          <CreditCard className="w-4 h-4" />
          Cartão
        </button>
      </div>

      {/* Forms */}
      <div className="relative overflow-hidden">
        <AnimatePresence mode="wait">
          {method === 'pix' ? (
            <motion.div
              key="pix"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              transition={{ duration: 0.2 }}
            >
              <h4 className="font-bold text-center mb-6 text-gray-800">Pague com Pix</h4>
              <PixPaymentManager onPaymentSuccess={handlePixSuccess} planType={planType} isUpdate={isUpdate} />
            </motion.div>
          ) : (
            <motion.div
              key="card"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.2 }}
            >
              <h4 className="font-bold text-center mb-6 text-gray-800">Pague com Cartão</h4>
              
              {error && (
                <div className="mb-4 flex items-center gap-2 p-3 bg-red-50 text-red-700 rounded-xl border border-red-100 text-xs italic">
                  <AlertCircle className="w-4 h-4" />
                  {error}
                </div>
              )}

              <CardPaymentForm 
                amount={planPrice} 
                onSuccess={handleCardSuccess}
                loading={loading}
                isUpdate={isUpdate}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
