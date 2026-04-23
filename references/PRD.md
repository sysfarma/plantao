# Product Requirements Document (PRD) - Farmácias de Plantão

## 1. Visão Geral do Produto
O **Farmácias de Plantão** é uma plataforma SaaS (Software as a Service) híbrida que atua como um catálogo digital voltado para o cidadão e, ao mesmo tempo, um painel de gestão e marketing para proprietários de farmácias. O objetivo principal do sistema é solucionar o problema recorrente da população em encontrar estabelecimentos abertos fora do horário comercial (plantões), permitindo que farmácias ativas destaquem seus horários, aumentando seu tráfego de clientes diretos via WhatsApp e rotas do GPS (Google Maps).

## 2. Atores e Perfis de Usuário
O sistema é gerido através de 3 camadas de permissão (Roles):

1. **Cliente Final (Cidadão - Público):** Acessa a plataforma sem necessidade de login. Procura por farmácias em sua localidade.
2. **Proprietário da Farmácia (Lojista):** Assinante da plataforma. Necessita de conta e pagamento de plano (Mensal/Anual) para exibir sua farmácia nas buscas e registrar os dias/horários em que estará de plantão.
3. **Administrador Master (SysAdmin):** Proprietário/Operador do SaaS. Tem acesso absoluto à plataforma para configurações globais, moderação, gestão financeira e gerenciamento de permissões.

---

## 3. Arquitetura e Stack Tecnológico
- **Frontend / UI:** React 18+ com Vite, TypeScript, Tailwind CSS para estilização, Lucide React (ícones), Recharts (visualização de dados/gráficos).
- **Backend / API:** Node.js com ambiente Express (Express + Vite Proxy), arquitetura REST fluida de API nativa (CJS/ESM).
- **Banco de Dados (NoSQL):** Google Cloud Firestore (via `firebase-admin` no backend e `firebase/firestore` no frontend).
- **Autenticação e Permissões:** Firebase Authentication (Módulo Email/Password).
- **Gateway de Pagamento:** Mercado Pago (Checkout Pro e APIs transparentes, processamento de Pix e Assinaturas Recorrentes por Cartão).
- **Disparos e Comunicação:** Serviço de envio de e-mails parametrizado (`emailService`).

---

## 4. Escopo de Funcionalidades por Módulo

### 4.1. Portal Público (End-User)
- **Busca e Filtros:** Pesquisa geográfica e indexada de farmácias ativas da região.
- **Card de Exibição:** Demonstração visual do status em tempo real (Aberto/Fechado) com base na relação do relógio/calendário com os *Shifts* (plantões) da farmácia.
- **Interatividade:** Botões de conversão integrados: "Chamar no WhatsApp" e "Como Chegar" (Google Maps).
- **Vitrine de Destaques:** Espaços para "Farmácias em Destaque", promovidas na região do usuário.

### 4.2. Módulo Proprietário (Farmácia)
- **Painel de Assinatura:** Status transparente do plano vigente, data de faturamento, opção de Upgrade/Downgrade e métodos de transação direta.
- **Setup de Estabelecimento:** Formulários de personalização dos contatos, CEP, endereço e razão.
- **Gestão de Plantões (Shifts):** Calendário base para indicar as datas e as faixas de horas (ou plantão 24h) de operação extracurrícular.
- **Métricas:** Relatório básico analítico indicando "Cliques no Whatsapp" e "Cliques no Mapa".

### 4.3. Módulo Administrativo Master
- **Dashboard Global (Estatísticas):** Gráficos complexos com receita total, MRR (Receita Recorrente Mensal), conversões de pagamentos PIX vs Cartão, status populacional das farmácias.
- **Gerenciamento de Entidades:** Tabela CRUD expansível para Assinaturas, Plantões, Pagamentos, etc.
- **Ferramentas de Suporte:** Acesso rápido a painéis de "Exportação CSV" e rastreabilidade de pagamentos com detalhe do identificador/estorno.
- **Configurações Dinâmicas (SysConfig):** Tela para rotacionar Chaves e Access Tokens do Mercado Pago, gerenciar valores dos pacotes de Assinatura na página de _Pricing_ de vendas, telefones de suporte e validação/teste seguro da API.
- **Auditoria de Segurança:** Aba dedicada de "Logs de Auditoria" mapeando alterações (quem editou, o que deletou, horas exatas) garantindo compliance do provedor SaaS.

---

## 5. Modelagem Base de Negócios (Database Entities)
As entidades principais do sistema hospedadas na `firestore` de acordo com os blueprints:
- **`users`:** Dados primários de autenticação vinculados ao ID do Firebase Auth (Role, Informações complementares).
- **`pharmacies`:** Entidade mestre atrelada às buscas. Contém flag visual de ativação e localização geoespacial (Lat/Lng).
- **`subscriptions` e `payments`:** Cuidam da camada de faturamento controlando a data de validade de um usuário no sistema (`expires_at`, `status`).
- **`shifts`:** Bloqueios de tempo (plantão) geridos iterativamente.
- **`clicks` e `audit_logs`:** Entidades isoladas para registro de eventos sequenciais escaláveis sem degradar as leituras das coleções primárias.

---

## 6. Fluxos de Eventos (Event-driven / Webhooks)
- **Integração MP (Mercado Pago):** A plataforma depende estritamente do `POST /api/webhooks/payment` para computar estornos (`charged_back` / `refunded` / `cancelled`), bem como os encerramentos nativos ativando ou inativando a *tag* `subscription_active` da respectiva farmácia e bloqueando-a em inadimplência quase em tempo real, sem necessidade de ações burocráticas. Em todos os encerramentos, o `emailService` garante transparência institucional com o contratante.

---
*Relatório gerado dinamicamente com base no código-fonte, arquitetura serveless e arquivos da plataforma em 2026.*
