import React, { useState, useEffect } from 'react';
import { Mail, Phone, MessageSquare, Clock, MapPin } from 'lucide-react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';

export default function Contact() {
  const [config, setConfig] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchConfig = async () => {
      try {
        const docSnap = await getDoc(doc(db, 'config', 'general'));
        if (docSnap.exists()) {
          setConfig(docSnap.data());
        }
      } catch (error) {
        console.error('Error fetching support config:', error);
      } finally {
        setLoading(false);
      }
    };
    fetchConfig();
  }, []);

  return (
    <div className="max-w-4xl mx-auto py-12 px-4 sm:px-6 lg:px-8">
      <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-8 md:p-12">
        <div className="text-center mb-12">
          <h1 className="text-4xl font-black text-gray-900 mb-4">Fale Conosco</h1>
          <p className="text-gray-500 text-lg max-w-2xl mx-auto font-medium">
            Tem alguma dúvida, sugestão ou encontrou algum erro? Nossa equipe está pronta para te atender.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {/* Contact Methods */}
          <div className="space-y-6">
            <div className="bg-emerald-50 p-6 rounded-2xl border border-emerald-100">
              <h2 className="text-xl font-bold text-gray-900 mb-4 flex items-center gap-2">
                <MessageSquare className="w-5 h-5 text-emerald-600" />
                Canais de Atendimento
              </h2>
              
              <div className="space-y-4">
                {(config?.email_support_active !== false) && (
                  <div className="flex items-start gap-4">
                    <div className="p-2 bg-white rounded-lg shadow-sm">
                      <Mail className="w-5 h-5 text-emerald-600" />
                    </div>
                    <div>
                      <p className="text-sm text-gray-500 font-medium">E-mail de Suporte</p>
                      <p className="text-gray-900 font-bold">{config?.support_email || 'suporte@farmaciasdeplantao.app.br'}</p>
                    </div>
                  </div>
                )}

                <div className="flex items-start gap-4">
                  <div className="p-2 bg-white rounded-lg shadow-sm">
                    <Phone className="w-5 h-5 text-emerald-600" />
                  </div>
                  <div>
                    <p className="text-sm text-gray-500 font-medium">Telefone / WhatsApp</p>
                    <p className="text-gray-900 font-bold">{config?.support_phone || '(00) 00000-0000'}</p>
                  </div>
                </div>

                <div className="flex items-start gap-4">
                  <div className="p-2 bg-white rounded-lg shadow-sm">
                    <Clock className="w-5 h-5 text-emerald-600" />
                  </div>
                  <div>
                    <p className="text-sm text-gray-500 font-medium">Horário de Atendimento</p>
                    <p className="text-gray-900 font-bold">Segunda à Sexta, das 09h às 18h</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-gray-50 p-6 rounded-2xl border border-gray-100">
              <h2 className="text-xl font-bold text-gray-900 mb-4">Perguntas Frequentes</h2>
              <div className="space-y-4 text-sm">
                <div>
                  <p className="font-bold text-gray-800">Minha farmácia não aparece no mapa.</p>
                  <p className="text-gray-600">Verifique se você cadastrou os plantões corretamente no seu painel.</p>
                </div>
                <div>
                  <p className="font-bold text-gray-800">Como viro um membro Premium?</p>
                  <p className="text-gray-600">Acesse a aba 'Premium' no seu painel e escolha um plano.</p>
                </div>
              </div>
            </div>
          </div>

          {/* Map/Office Info */}
          <div className="bg-emerald-900 rounded-3xl p-8 text-white flex flex-col justify-between relative overflow-hidden">
             <div className="relative z-10">
               <h2 className="text-2xl font-bold mb-6">Nossa Missão</h2>
               <p className="text-emerald-100/80 mb-8 leading-relaxed font-medium">
                 Garantir que nenhum brasileiro fique sem assistência farmacêutica no momento de maior necessidade, unindo tecnologia e utilidade pública.
               </p>
               <div className="space-y-4">
                 <div className="flex items-center gap-3">
                   <div className="p-2 bg-white/10 rounded-lg backdrop-blur-sm">
                     <MapPin className="w-5 h-5" />
                   </div>
                   <span className="font-medium">Brasil</span>
                 </div>
               </div>
             </div>
             
             {/* Decorative pill element */}
             <div className="absolute -bottom-10 -right-10 w-40 h-40 bg-white/5 rounded-full blur-3xl"></div>
          </div>
        </div>
      </div>
    </div>
  );
}
