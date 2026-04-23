# Arquitetura do Sistema - Farmácias de Plantão

Este documento detalha a arquitetura técnica, os padrões de design e a infraestrutura do sistema **Farmácias de Plantão**. Como um engenheiro com mais de 20 anos de experiência, analisei os componentes para garantir escalabilidade, segurança e manutenibilidade.

---

## 1. Visão Geral da Pilha Tecnológica (Tech Stack)

O sistema utiliza uma arquitetura full-stack moderna, baseada em TypeScript, focada em performance e facilidade de deploy.

- **Frontend**: React 18 (Vite) + Tailwind CSS + Lucide Icons.
- **Backend**: Express (Node.js) operando em modo híbrido (API + Middleware de Assets).
- **Banco de Dados**: Google Cloud Firestore (NoSQL).
- **Autenticação**: Firebase Authentication (ID Tokens JWT).
- **Processamento de Pagamentos**: Mercado Pago (Transparente e Webhooks).
- **Infraestrutura**: Projetado para Cloud Run ou similares (Stateless e Escalável).

---

## 2. Arquitetura de Camadas

### 2.1 Camada de Apresentação (Frontend)
Localizada em `/src`, segue um padrão modular:
- **Pages**: Componentes de rota (Ex: `Dashboard.tsx`, `Home.tsx`).
- **Components**: UI reutilizável e componentes atômicos.
- **Lib**: Abstração de serviços.
  - `api.ts`: Wrapper para chamadas `fetch` com tratamento de erro global.
  - `firebase.ts`: Inicialização do SDK cliente.
  - `geocoding.ts`: Integração com serviços de mapas.
- **Hooks**: Lógica de estado compartilhada (ex: `useAuth`).

### 2.2 Camada de Aplicação (Backend/API)
O `server.ts` atua como o orquestrador central:
- **Middleware de Autenticação**: Valida tokens Firebase em rotas `/api/*`.
- **Integrations**:
  - **Mercado Pago**: Lógica de idempotência e simulação (isMock) para ambiente de desenvolvimento.
  - **Audit Logs**: Sistema de interceptação para registrar ações administrativas críticas.
- **Schedulers**: Uso de `node-cron` para tarefas de segundo plano (ex: limpeza de dados temporários).

### 2.3 Camada de Dados (Firestore)
A modelagem é documento-orientada, otimizada para leituras rápidas:
- **Estrutura Denormalizada**: Algumas contagens são calculadas via `updateDashboardStats` para evitar contagens de agregação custosas no Firestore.
- **Blueprint**: Uso de `firebase-blueprint.json` para definir o contrato de dados.

---

## 3. Fluxos Críticos e Design Patterns

### 3.1 Processamento de Pagamento e Assinatura
O sistema utiliza um padrão de **Relational Sync**:
1. **Webhook Trigger**: O Mercado Pago notifica o servidor.
2. **Verification**: O servidor valida a transação direto na API do provedor.
3. **Atomic Update**: O servidor atualiza a assinatura e o status da farmácia em uma série de operações coordenadas.
4. **Notification**: Disparo imediato via `emailService`.

### 3.2 Segurança e Auditoria
- **Defesa em Profundidade**:
  1. Firestore Rules bloqueando acessos diretos indevidos.
  2. Middleware de API validando permissões de Role (admin/pharmacy).
  3. `logAdminAction`: Helper que injeta trilhas de auditoria em operações de mutação (`PUT`, `DELETE`).

---

## 4. Estrátégia de Escalabilidade e DevOps

- **Stateless Backend**: O servidor não armazena estado em memória (usa Firestore), permitindo auto-scaling horizontal.
- **Vite Integration**: No desenvolvimento, o Express encapsula o Vite. Em produção, ele serve os arquivos estáticos da pasta `dist/`, reduzindo a latência.
- **Environment Driven Config**: Configurações sensíveis (Access Tokens, Firebase Keys) são gerenciadas estritamente via variáveis de ambiente, seguindo o padrâo *Twelve-Factor App*.

---

## 5. Pontos de Evolução Sugeridos (Roadmap Arquitetural)

1. **Caching**: Implementar Redis para as métricas de dashboard se o volume de leitura do Firestore disparar.
2. **Cloud Functions**: Mover os Webhooks para funções isoladas para aumentar a resiliência a picos de tráfego.
3. **Global State**: Considerar `Zustand` ou `Context API` mais robusto se a complexidade de UI do Admin Master aumentar.

---
*Análise técnica realizada em Abril de 2026. Documento de referência para manutenção e evolução do projeto.*
