# Relatório de Análise do Sistema de Cadastro de Farmácias
**Data de Geração:** 08/05/2026, 10:54:04 (Horário de Brasília)

## 1. Status Atual
O sistema de cadastro de farmácias possui funcionalidades básicas de CRUD (Criar, Ler, Atualizar, Deletar) operacionais, incluindo:
- Integração com Firebase Auth para login exclusivo por farmácia.
- Sincronização automática entre as coleções `pharmacies` e `users`.
- Busca automática de endereço via CEP (ViaCEP).
- Gestão de status (Ativo/Inativo) e exclusão permanente pelo Admin Master.
- Campos básicos: Nome, E-mail, Telefone, WhatsApp, Endereço Completo, Website, Descrição e URL da Logo.

## 2. Pendências e Lacunas (O que falta terminar)

### 2.1. Funcionalidades de Dados e Validação
- **CNPJ**: Ausência do campo CNPJ tanto no banco de dados quanto na interface. É essencial para a validação fiscal das farmácias.
- **Validação de Duplicidade**: O sistema não impede o cadastro de múltiplas farmácias com o mesmo CNPJ ou Nome Fantasia.
- **Geolocalização**: Não existem campos para Latitude e Longitude, o que impedirá a plotagem correta em mapas ou cálculos de proximidade no futuro.
- **Horário de Funcionamento Regular**: Atualmente o sistema foca em "Plantões". Falta uma estrutura para definir o horário comercial padrão (ex: Seg-Sex 08h-22h).

### 2.2. Interface e UX (Dashboard Admin)
- **Upload de Logo**: O campo atual aceita apenas uma URL de texto. Falta integração com Firebase Storage para upload direto de arquivos de imagem.
- **Ações em Massa**: Não é possível selecionar várias farmácias para ativar/desativar ou excluir de uma vez.
- **Logs de Auditoria na UI**: Embora os logs sejam salvos no servidor, o administrador não consegue visualizar o histórico de alterações de uma farmácia específica diretamente no dashboard.
- **Reset de Senha**: Falta um botão no dashboard para disparar o e-mail de recuperação de senha oficial do Firebase para o responsável pela farmácia.

### 2.3. Segurança e Robustez
- **Validação Server-side de Campos**: Falta validação mais rigorosa no `server.ts` para formatos de Telefone, WhatsApp e URLs.
- **Confirmação de E-mail**: Não há bloqueio para farmácias que não verificaram o e-mail (opcional, mas recomendado).

---
*Relatório gerado automaticamente para fins de especificação técnica e acompanhamento de projeto.*
