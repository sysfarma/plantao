import React from 'react';
import { Lock } from 'lucide-react';

export default function Privacy() {
  return (
    <div className="max-w-4xl mx-auto py-12 px-4 sm:px-6 lg:px-8">
      <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-8 md:p-12">
        <div className="flex items-center gap-4 mb-8">
          <div className="p-3 bg-emerald-100 rounded-2xl text-emerald-600">
            <Lock className="w-8 h-8" />
          </div>
          <h1 className="text-3xl font-bold text-gray-900">Política de Privacidade</h1>
        </div>

        <div className="prose prose-emerald max-w-none text-gray-600 space-y-6">
          <section>
            <h2 className="text-xl font-bold text-gray-900 mb-4">1. Coleta de Dados</h2>
            <p>
              Coletamos informações mínimas necessárias para o funcionamento do serviço:
            </p>
            <ul className="list-disc pl-5 space-y-2">
              <li><strong>Usuários Comuns:</strong> Não coletamos dados pessoais para consulta de plantões. Podemos solicitar localização geográfica (GPS) apenas com seu consentimento para mostrar farmácias mais próximas.</li>
              <li><strong>Farmácias:</strong> Coletamos dados cadastrais como Nome, CNPJ (implícito), Endereço, Telefone, WhatsApp e E-mail para exibição pública e gestão da conta.</li>
              <li><strong>Dados de Acesso:</strong> Registramos cliques anônimos em botões de "Ligar" ou "WhatsApp" para fornecer métricas de desempenho aos nossos parceiros.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-bold text-gray-900 mb-4">2. Uso das Informações</h2>
            <p>
              As informações coletadas são utilizadas para:
            </p>
            <ul className="list-disc pl-5 space-y-2">
              <li>Exibir farmácias de plantão para os cidadãos.</li>
              <li>Processar pagamentos de planos Premium via parceiros (Mercado Pago).</li>
              <li>Melhorar continuamente a interface e usabilidade do sistema.</li>
              <li>Enviar notificações importantes sobre a conta (apenas para farmácias cadastradas).</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-bold text-gray-900 mb-4">3. Compartilhamento de Dados</h2>
            <p>
              Não vendemos, alugamos ou compartilhamos seus dados pessoais com terceiros para fins de marketing. Os dados das farmácias (endereço, telefone) são públicos por natureza dentro do propósito da plataforma.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-gray-900 mb-4">4. Segurança</h2>
            <p>
              Utilizamos tecnologias modernas de criptografia (HTTPS/SSL) e armazenamento seguro em nuvem (Firebase) para garantir a integridade de todos os dados processados em nossa plataforma.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-gray-900 mb-4">5. Cookies e PWA</h2>
            <p>
              Utilizamos cookies e armazenamento local para manter sua sessão ativa (quando logado) e para que o Progressive Web App (PWA) funcione corretamente em modo offline.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-gray-900 mb-4">6. Seus Direitos</h2>
            <p>
              De acordo com a Lei Geral de Proteção de Dados (LGPD), você tem o direito de solicitar o acesso, retificação ou exclusão de seus dados pessoais a qualquer momento através de nossos canais de suporte.
            </p>
          </section>
        </div>
        
        <div className="mt-12 pt-8 border-t border-gray-100 text-sm text-gray-400">
          Última atualização: {new Date().toLocaleDateString('pt-BR')}
        </div>
      </div>
    </div>
  );
}
