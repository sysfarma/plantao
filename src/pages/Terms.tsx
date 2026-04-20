import React from 'react';
import { ShieldCheck } from 'lucide-react';

export default function Terms() {
  return (
    <div className="max-w-4xl mx-auto py-12 px-4 sm:px-6 lg:px-8">
      <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-8 md:p-12">
        <div className="flex items-center gap-4 mb-8">
          <div className="p-3 bg-emerald-100 rounded-2xl text-emerald-600">
            <ShieldCheck className="w-8 h-8" />
          </div>
          <h1 className="text-3xl font-bold text-gray-900">Termos de Uso</h1>
        </div>

        <div className="prose prose-emerald max-w-none text-gray-600 space-y-6">
          <section>
            <h2 className="text-xl font-bold text-gray-900 mb-4">1. Aceitação dos Termos</h2>
            <p>
              Ao acessar e utilizar o aplicativo Farmácias de Plantão, você concorda em cumprir e estar vinculado aos seguintes termos e condições de uso. Se você não concordar com qualquer parte destes termos, não deverá utilizar nossos serviços.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-gray-900 mb-4">2. Descrição do Serviço</h2>
            <p>
              O Farmácias de Plantão é uma plataforma que agrega e disponibiliza informações sobre escalas de plantão de farmácias em diversas cidades do Brasil. Nosso objetivo é facilitar a localização de estabelecimentos abertos fora do horário comercial convencional.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-gray-900 mb-4">3. Precisão das Informações</h2>
            <p>
              Embora nos esforcemos para manter as informações atualizadas e precisas, não garantimos a exatidão total dos dados. As escalas de plantão são fornecidas por terceiros, órgãos municipais ou pelas próprias farmácias. Recomendamos sempre confirmar via telefone antes de se deslocar ao estabelecimento.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-gray-900 mb-4">4. Assinaturas para Farmácias</h2>
            <p>
              Farmácias que desejam maior visibilidade podem contratar planos Premium. Estes planos oferecem benefícios de destaque no mapa e nos resultados de busca, além de métricas de acesso. O não pagamento resultará na suspensão dos benefícios Premium, mas não na exclusão da farmácia da base de dados pública se ela estiver em escala de plantão oficial.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-gray-900 mb-4">5. Limitação de Responsabilidade</h2>
            <p>
              O Farmácias de Plantão não se responsabiliza por eventuais danos resultantes do uso das informações contidas na plataforma, incluindo atrasos no atendimento médico ou indisponibilidade de medicamentos em estabelecimentos listados como "de plantão".
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-gray-900 mb-4">6. Alterações nos Termos</h2>
            <p>
              Reservamo-nos o direito de modificar estes termos a qualquer momento. O uso contínuo da plataforma após tais mudanças constitui sua aceitação dos novos termos.
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
