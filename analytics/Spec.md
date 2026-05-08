# Especificação Técnica: Implementações Pendentes (Cadastro de Farmácias)
**Data de Geração:** 08/05/2026, 10:54:35 (Horário de Brasília)

Esta especificação detalha os componentes e comportamentos que ainda precisam ser implementados no sistema de gestão de farmácias.

## 1. Campos e Modelagem de Dados (Firestore)
- **Campo `cnpj`**: Adicionar string com máscara (00.000.000/0000-00) na coleção `pharmacies`.
- **Campos `coordinates`**: Objeto contendo `lat` (number) e `lng` (number) para integração com mapas.
- **Campo `operating_hours`**: Array de objetos ou mapa para definir horários padrão por dia da semana.
- **Validação de Unicidade**: Lógica no `server.ts` para verificar se o CNPJ já existe antes de criar/atualizar.

## 2. Componentes de UI (Dashboard Admin - Dashboard.tsx)
- **Componente `ImageUpload`**: Substituir o input de texto `logo_url` por um seletor de arquivos com preview e integração com Firebase Storage.
- **Botão `Reset Password`**: Adicionar botão na linha da farmácia que chama `/api/admin/pharmacies/:id/reset-password`.
- **Checkbox de Seleção Multipla**: Implementar checkboxes na tabela para permitir ações em massa.
- **Modal de Auditoria**: Novo modal para exibir a lista de `admin_logs` filtrada pelo ID da farmácia selecionada.

## 3. Comportamentos e Backend (server.ts)
- **Rota `POST /api/admin/pharmacies/:id/reset-password`**: Endpoint para chamar `auth.generatePasswordResetLink(email)`.
- **Integração Geocoding**: No momento de salvar o endereço (ou via botão de sincronização), buscar automaticamente as coordenadas via API do Google Maps ou similar.
- **Validação de CNPJ**: Middleware ou helper no servidor para validar o dígito verificador do CNPJ.
- **Endpoint de Ações em Massa**: `POST /api/admin/pharmacies/batch-action` para processar múltiplos IDs simultaneamente.

## 4. Página Pública / Perfil da Farmácia
- **Página `src/pages/pharmacy/View.tsx`**: Criar visualização pública completa da farmácia para os usuários finais, exibindo:
    - Logo e descrição.
    - Status atual (Aberto/Fechado/De Plantão).
    - Botão direto para WhatsApp.
    - Mapa de localização.

---
*Apenas itens não implementados até a data desta especificação.*
