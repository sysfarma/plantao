import React, { useState, useEffect } from 'react';
import { QrCode, Copy, CheckCircle, RefreshCw } from 'lucide-react';
import { collection, addDoc, updateDoc, doc, getDocs, query, where, onSnapshot } from 'firebase/firestore';
import { db, auth } from '../lib/firebase';

interface PixPaymentManagerProps {
  onPaymentSuccess: () => void;
}

export default function PixPaymentManager({ onPaymentSuccess }: PixPaymentManagerProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [pixData, setPixData] = useState<{ payment_id: string; qr_code: string; qr_code_base64: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [status, setStatus] = useState<'pending' | 'approved'>('pending');
  const [pharmacyId, setPharmacyId] = useState<string | null>(null);
  const [subscriptionId, setSubscriptionId] = useState<string | null>(null);

  const generatePix = async () => {
    setLoading(true);
    setError('');
    try {
      const user = auth.currentUser;
      if (!user) throw new Error('Usuário não autenticado');

      // Find pharmacy
      const pharmQuery = query(collection(db, 'pharmacies'), where('user_id', '==', user.uid));
      const pharmSnapshot = await getDocs(pharmQuery);
      if (pharmSnapshot.empty) throw new Error('Farmácia não encontrada');
      const pId = pharmSnapshot.docs[0].id;
      setPharmacyId(pId);

      // Find subscription
      const subsQuery = query(collection(db, 'subscriptions'), where('pharmacy_id', '==', pId));
      const subsSnapshot = await getDocs(subsQuery);
      if (!subsSnapshot.empty) {
        setSubscriptionId(subsSnapshot.docs[0].id);
      }

      // Create a dummy payment
      const paymentRef = await addDoc(collection(db, 'payments'), {
        pharmacy_id: pId,
        user_id: user.uid,
        amount: 97.00,
        status: 'pending',
        payment_method: 'pix',
        created_at: new Date().toISOString()
      });

      setPixData({
        payment_id: paymentRef.id,
        qr_code: '00020126580014br.gov.bcb.pix0136123e4567-e89b-12d3-a456-426655440000520400005303986540597.005802BR5913Test Pharmacy6008BRASILIA62070503***63041D3D', // Dummy QR code string
        qr_code_base64: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==' // Dummy 1x1 image
      });
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    generatePix();
  }, []);

  // Listen for payment status
  useEffect(() => {
    if (!pixData || !subscriptionId) return;

    const unsubscribe = onSnapshot(doc(db, 'subscriptions', subscriptionId), (docSnap) => {
      if (docSnap.exists() && docSnap.data().status === 'active') {
        setStatus('approved');
        onPaymentSuccess();
      }
    });

    return () => unsubscribe();
  }, [pixData, subscriptionId, onPaymentSuccess]);

  const handleCopy = () => {
    if (pixData?.qr_code) {
      navigator.clipboard.writeText(pixData.qr_code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleSimulatePayment = async () => {
    if (!pixData || !pharmacyId || !subscriptionId) return;
    try {
      // Update payment
      await updateDoc(doc(db, 'payments', pixData.payment_id), {
        status: 'approved',
        updated_at: new Date().toISOString()
      });

      // Update subscription
      const expiresAt = new Date();
      expiresAt.setMonth(expiresAt.getMonth() + 1);

      await updateDoc(doc(db, 'subscriptions', subscriptionId), {
        status: 'active',
        expires_at: expiresAt.toISOString(),
        updated_at: new Date().toISOString()
      });
      
      // Update pharmacy active status
      await updateDoc(doc(db, 'pharmacies', pharmacyId), {
        is_active: 1,
        updated_at: new Date().toISOString()
      });

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
