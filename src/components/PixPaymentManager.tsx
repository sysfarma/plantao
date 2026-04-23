import React, { useState, useEffect } from 'react';
import { QrCode, Copy, CheckCircle, RefreshCw, Clock, ExternalLink, Loader2, AlertCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { safeJsonFetch } from '../lib/api';
import { collection, addDoc, updateDoc, doc, getDocs, query, where, onSnapshot } from 'firebase/firestore';
import { db, auth, getAuthToken } from '../lib/firebase';

interface PixPaymentManagerProps {
  onPaymentSuccess: () => void;
  planType?: string;
  isUpdate?: boolean;
}

export default function PixPaymentManager({ onPaymentSuccess, planType = 'annual', isUpdate = false }: PixPaymentManagerProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [pixData, setPixData] = useState<{ payment_id: string; qr_code: string; qr_code_base64: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [status, setStatus] = useState<'pending' | 'approved'>('pending');
  const [timeLeft, setTimeLeft] = useState(1800); // 30 minutes in seconds

  const generatePix = async () => {
    setLoading(true);
    setError('');
    setPixData(null);
    try {
      const token = await getAuthToken();
      if (!token) throw new Error('Usuário não autenticado');

      const data = await safeJsonFetch('/api/payments/pix', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ planType, isUpdate })
      });

      setPixData(data);
      setTimeLeft(1800); // Reset timer
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    generatePix();
  }, [planType]);

  // Timer logic
  useEffect(() => {
    if (!pixData || timeLeft <= 0) return;
    const interval = setInterval(() => {
      setTimeLeft(prev => prev - 1);
    }, 1000);
    return () => clearInterval(interval);
  }, [pixData, timeLeft]);

  // Listen for payment status
  useEffect(() => {
    if (!pixData || !pixData.payment_id || !auth.currentUser?.uid) return;

    const paymentsQuery = query(collection(db, 'payments'), 
      where('user_id', '==', auth.currentUser.uid),
      where('mp_payment_id', '==', pixData.payment_id.toString())
    );
    const unsubscribe = onSnapshot(paymentsQuery, (snapshot) => {
      if (!snapshot.empty) {
        const paymentDoc = snapshot.docs[0];
        if (paymentDoc.data().status === 'approved') {
          setStatus('approved');
          setTimeout(() => onPaymentSuccess(), 2000);
        }
      }
    });

    return () => unsubscribe();
  }, [pixData, onPaymentSuccess]);

  const handleCopy = () => {
    if (pixData?.qr_code) {
      navigator.clipboard.writeText(pixData.qr_code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-center">
        <div className="relative">
          <RefreshCw className="w-12 h-12 text-emerald-600 animate-spin mb-4" />
          <motion.div 
            animate={{ scale: [1, 1.2, 1] }} 
            transition={{ repeat: Infinity, duration: 2 }}
            className="absolute inset-0 bg-emerald-100 rounded-full -z-10 blur-xl opacity-50"
          />
        </div>
        <p className="text-gray-900 font-bold text-lg">Gerando código Pix...</p>
        <p className="text-gray-500 text-sm mt-1">Isso levará apenas alguns segundos.</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center p-8 bg-red-50 rounded-3xl border border-red-100">
        <div className="w-12 h-12 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto mb-4">
          <AlertCircle className="w-6 h-6" />
        </div>
        <h3 className="font-bold text-red-900 mb-2">Erro ao gerar Pix</h3>
        <p className="text-red-700/80 text-sm mb-6">{error}</p>
        <button 
          onClick={generatePix} 
          className="px-6 py-2.5 bg-red-600 text-white rounded-xl hover:bg-red-700 font-bold transition-shadow shadow-lg shadow-red-200"
        >
          Tentar Novamente
        </button>
      </div>
    );
  }

  if (status === 'approved') {
    return (
      <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-gray-900/60 backdrop-blur-sm">
        <motion.div 
          initial={{ opacity: 0, scale: 0.8, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          className="w-full max-w-sm flex flex-col items-center justify-center p-10 bg-white rounded-3xl shadow-2xl relative overflow-hidden"
        >
          <div className="absolute inset-0 bg-gradient-to-br from-emerald-50 to-white -z-10" />
          <motion.div 
            initial={{ scale: 0 }}
            animate={{ scale: 1.2, transition: { type: 'spring', bounce: 0.6, duration: 0.8 } }}
            className="w-24 h-24 bg-emerald-500 text-white rounded-full flex items-center justify-center mb-8 shadow-xl shadow-emerald-200"
          >
            <CheckCircle className="w-14 h-14" />
          </motion.div>
          
          <motion.h3 
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0, transition: { delay: 0.2 } }}
            className="text-2xl font-black text-gray-900 mb-3 text-center"
          >
            Pagamento Aprovado!
          </motion.h3>
          
          <motion.p 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1, transition: { delay: 0.4 } }}
            className="text-gray-500 font-medium text-center mb-6"
          >
            Sua assinatura foi ativada com sucesso. Redirecionando...
          </motion.p>
          
          <motion.div 
             initial={{ opacity: 0 }}
             animate={{ opacity: 1, transition: { delay: 0.6 } }}
             className="flex items-center gap-2 text-xs font-bold text-emerald-600 uppercase tracking-widest"
          >
            <RefreshCw className="w-3.5 h-3.5 animate-spin" />
            Aguarde
          </motion.div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center">
      <div className="relative group">
        <motion.div 
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          className="bg-white p-6 rounded-3xl shadow-xl border border-gray-100 mb-6 bg-gradient-to-b from-white to-gray-50/50"
        >
          {pixData?.qr_code_base64 && pixData.qr_code_base64.length > 100 ? (
            <img 
              src={`data:image/png;base64,${pixData.qr_code_base64}`} 
              alt="QR Code Pix" 
              className="w-56 h-56 transition-transform group-hover:scale-105 duration-500" 
            />
          ) : (
            <div className="w-56 h-56 bg-gray-50 flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-gray-200 group-hover:border-emerald-200 transition-colors">
              <QrCode className="w-16 h-16 text-gray-300 group-hover:text-emerald-300 transition-colors mb-2" />
              <span className="text-xs text-gray-400 font-medium italic">QR Code Indisponível</span>
            </div>
          )}
        </motion.div>

        {/* Status indicator on top corner of QR code container */}
        <div className="absolute -top-3 -right-3 bg-white px-3 py-1.5 rounded-full shadow-lg border border-gray-100 flex items-center gap-2">
          <div className="w-2 h-2 bg-amber-500 rounded-full animate-pulse" />
          <span className="text-[10px] font-bold text-gray-600 uppercase tracking-wider">Aguardando...</span>
        </div>
      </div>
      
      <div className="flex items-center gap-4 text-sm font-medium mb-6">
        <div className="flex items-center gap-2 px-3 py-1.5 bg-amber-50 text-amber-700 rounded-full border border-amber-100">
          <Clock className="w-4 h-4" />
          <span>Expira em: <span className="font-bold tabular-nums">{formatTime(timeLeft)}</span></span>
        </div>
        {timeLeft <= 0 && (
          <button onClick={generatePix} className="text-emerald-600 text-xs font-bold underline">
            Renovar Código
          </button>
        )}
      </div>

      <p className="text-xs text-gray-500 mb-8 text-center max-w-[280px] leading-relaxed">
        Escaneie o QR Code com seu app do banco ou copie a chave PIX no botão abaixo.
      </p>
      
      <div className="w-full space-y-3 max-w-xs">
        <button 
          onClick={handleCopy}
          className={`flex items-center gap-3 w-full py-4 rounded-2xl font-bold transition-all shadow-lg active:scale-[0.98] ${
            copied 
              ? 'bg-emerald-100 text-emerald-700 border border-emerald-200' 
              : 'bg-emerald-600 text-white hover:bg-emerald-700 shadow-emerald-200'
          }`}
        >
          <div className="flex-1 flex items-center justify-center gap-2">
            {copied ? (
              <>
                <CheckCircle className="w-5 h-5 animate-bounce" /> Copiado com Sucesso!
              </>
            ) : (
              <>
                <Copy className="w-5 h-5" /> Copiar Código Pix
              </>
            )}
          </div>
        </button>
      </div>

      <div className="mt-8 flex items-center gap-2 px-4 py-2 bg-gray-50 rounded-full border border-gray-100 text-[10px] text-gray-400 font-bold uppercase tracking-widest">
        <Loader2 className="w-3 h-3 animate-spin" />
        Sincronização em Tempo Real
      </div>
    </div>
  );
}
