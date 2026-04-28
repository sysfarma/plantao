# Issue 2: Dados Estruturados (Schema Markup)

## Descrição
Injetar marcações de dados estruturados (JSON-LD) nos resultados de busca para que o Google entenda que se tratam de farmácias locais.

## Tarefas
- [ ] Criar um novo componente `PharmacySchema`.
- [ ] O componente deve aceitar os dados de uma farmácia e gerar um bloco `<script type="application/ld+json">`.
- [ ] O tipo do schema deve ser `Pharmacy` (ou `LocalBusiness` se genérico).
- [ ] Incluir campos: `name`, `address` (rua, número, bairro, cidade, uf, cep), `telephone`, `url`.
- [ ] Se disponível, incluir geolocalização (`geo`).
- [ ] Renderizar o schema para cada farmácia exibida na lista de plantão.
