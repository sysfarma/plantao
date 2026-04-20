# Issue 04: Validador de Credenciais Mercado Pago

## Descrição
Prevenir erros de checkout por chaves inválidas adicionando um botão de teste nas configurações.

## Tarefas
- [x] Criar o componente `MercadoPagoTester`.
- [x] Implementar rota backend `GET /api/admin/config/test`.
- [x] backend: Tentar instanciar `MercadoPagoConfig` e chamar `customerClient.search` (ou similar) para validar o `access_token`.
- [x] Frontend: Exibir feedback de "Sucesso" ou "Erro de Chave" com a mensagem do MP.

## Critérios de Aceite
- O Admin recebe confirmação visual de que as chaves estão funcionais antes de fechar as configurações.
