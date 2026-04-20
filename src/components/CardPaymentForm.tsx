import React, { useState, useEffect, useRef } from 'react';
import { CreditCard, Shield, Lock, AlertCircle, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface CardPaymentFormProps {
  amount: number;
  onSuccess: (token: string, paymentData: any) => void;
  loading?: boolean;
  isUpdate?: boolean;
}

declare global {
  interface Window {
    MercadoPago: any;
  }
}

export default function CardPaymentForm({ amount, onSuccess, loading: externalLoading, isUpdate = false }: CardPaymentFormProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mpRef = useRef<any>(null);
  
  // Form states (non-sensitive data can be in state)
  const [cardholderName, setCardholderName] = useState('');
  const [cardholderEmail, setCardholderEmail] = useState('');
  const [docType, setDocType] = useState('CPF');
  const [docNumber, setDocNumber] = useState('');

  useEffect(() => {
    const initMP = async () => {
      try {
        const res = await fetch('/api/public/mercadopago-config');
        const data = await res.json();
        const publicKey = data.public_key;
        
        if (window.MercadoPago && publicKey) {
          mpRef.current = new window.MercadoPago(publicKey, {
            locale: 'pt-BR'
          });
        } else {
          console.warn('Mercado Pago SDK not found or Public Key missing');
        }
      } catch (err) {
        console.error('Error fetching MP public key:', err);
      }
    };
    initMP();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!mpRef.current) {
      setError('Erro ao inicializar sistema de pagamentos. Recarregue a página.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const form = e.currentTarget as HTMLFormElement;
      
      // We use the MP SDK to create the token from the form
      // The SDK finds the inputs by data-checkout attributes
      const cardTokenResponse = await mpRef.current.createCardToken({
        cardholderName: cardholderName,
        identificationType: docType,
        identificationNumber: docNumber,
        cardNumber: form.querySelector('[data-checkout="cardNumber"]')?.getAttribute('value') || (form.querySelector('[data-checkout="cardNumber"]') as HTMLInputElement).value,
        securityCode: (form.querySelector('[data-checkout="securityCode"]') as HTMLInputElement).value,
        cardExpirationMonth: (form.querySelector('[data-checkout="cardExpirationMonth"]') as HTMLInputElement).value,
        cardExpirationYear: (form.querySelector('[data-checkout="cardExpirationYear"]') as HTMLInputElement).value,
      });

      console.log('Card Token Response:', cardTokenResponse);

      if (cardTokenResponse.id) {
        onSuccess(cardTokenResponse.id, {
          cardholderEmail,
          docType,
          docNumber
        });
      } else {
        const errorMsg = cardTokenResponse.cause?.[0]?.description || 'Erro ao validar cartão. Verifique os dados.';
        setError(errorMsg);
      }
    } catch (err: any) {
      console.error('Payment Error:', err);
      setError('Ocorreu um erro ao processar o pagamento. Tente novamente.');
    } finally {
      setLoading(false);
    }
  };

  const isLoading = loading || externalLoading;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 text-emerald-700 bg-emerald-50 p-3 rounded-xl border border-emerald-100">
        <Shield className="w-5 h-5" />
        <span className="text-xs font-medium">Pagamento 100% Seguro via Mercado Pago</span>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Cardholder Info */}
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">
              Nome como no Cartão
            </label>
            <input
              type="text"
              required
              placeholder="JOÃO S SILVA"
              value={cardholderName}
              onChange={(e) => setCardholderName(e.target.value.toUpperCase())}
              className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none transition-all text-sm uppercase"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">
              E-mail para Recibo
            </label>
            <input
              type="email"
              required
              placeholder="exemplo@email.com"
              value={cardholderEmail}
              onChange={(e) => setCardholderEmail(e.target.value)}
              className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none transition-all text-sm"
            />
          </div>
        </div>

        {/* Card Details */}
        <div className="p-4 bg-gray-50 rounded-2xl border border-gray-200 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">
              Número do Cartão
            </label>
            <div className="relative">
              <input
                type="text"
                required
                data-checkout="cardNumber"
                placeholder="0000 0000 0000 0000"
                className="w-full pl-10 pr-4 py-3 bg-white border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none transition-all text-sm"
              />
              <CreditCard className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">
                Validade
              </label>
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="text"
                  required
                  data-checkout="cardExpirationMonth"
                  placeholder="MM"
                  maxLength={2}
                  className="w-full px-3 py-3 bg-white border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none transition-all text-sm text-center"
                />
                <input
                  type="text"
                  required
                  data-checkout="cardExpirationYear"
                  placeholder="AA"
                  maxLength={2}
                  className="w-full px-3 py-3 bg-white border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none transition-all text-sm text-center"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">
                CVV
              </label>
              <div className="relative">
                <input
                  type="text"
                  required
                  data-checkout="securityCode"
                  placeholder="123"
                  maxLength={4}
                  className="w-full pl-10 pr-4 py-3 bg-white border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none transition-all text-sm"
                />
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              </div>
            </div>
          </div>
        </div>

        {/* Identification */}
        <div className="grid grid-cols-3 gap-4">
          <div className="col-span-1">
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">
              Tipo
            </label>
            <select
              value={docType}
              onChange={(e) => setDocType(e.target.value)}
              className="w-full px-3 py-3 bg-white border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none text-sm appearance-none"
            >
              <option value="CPF">CPF</option>
              <option value="CNPJ">CNPJ</option>
            </select>
          </div>
          <div className="col-span-2">
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">
              Número do Documento
            </label>
            <input
              type="text"
              required
              placeholder="000.000.000-00"
              value={docNumber}
              onChange={(e) => setDocNumber(e.target.value)}
              className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none text-sm"
            />
          </div>
        </div>

        <AnimatePresence>
          {error && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="flex items-center gap-2 p-3 bg-red-50 text-red-700 rounded-xl border border-red-100 text-xs italic"
            >
              <AlertCircle className="w-4 h-4" />
              {error}
            </motion.div>
          )}
        </AnimatePresence>

        <button
          type="submit"
          disabled={isLoading}
          className="w-full py-4 bg-emerald-600 text-white font-bold rounded-2xl hover:bg-emerald-700 focus:ring-4 focus:ring-emerald-200 transition-all flex items-center justify-center gap-3 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-emerald-200"
        >
          {isLoading ? (
            <Loader2 className="w-5 h-5 animate-spin" />
          ) : (
            <CreditCard className="w-5 h-5" />
          )}
          {isUpdate ? 'Confirmar Troca de Plano' : 'Assinar Plano Premium'}
        </button>
      </form>
    </div>
  );
}
