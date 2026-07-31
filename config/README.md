# config/

Os dados do simulador. Quase toda regra de comportamento vive aqui, não em código.

Os arquivos `*.example.json` são referência comentada e são versionados. Os arquivos reais — sem `.example` — são carregados em execução e ficam fora do versionamento.

| Arquivo | O que define | Especificação |
|---------|--------------|---------------|
| `materials.example.json` | **o catálogo único de matéria** | [W-011](../docs/spec/SPEC-W-mundo.md), [R-001](../docs/spec/SPEC-R-substrato.md), [B-003](../docs/spec/SPEC-B-corpo.md) |
| `reactions.example.json` | matriz de reação e vocabulário de efeitos | [SPEC-R](../docs/spec/SPEC-R-substrato.md) |
| `body.example.json` | árvore de partes do corpo | [SPEC-B](../docs/spec/SPEC-B-corpo.md) |
| `conditions.example.json` | condições e matriz de lesão | [SPEC-B](../docs/spec/SPEC-B-corpo.md) |
| `models.example.json` | provedor e modelo por tier (`compact` / `narrative` / `longform`) | [03-CAMADA-LLM](../docs/03-CAMADA-LLM.md) |
| `tuning.example.json` | todos os números ajustáveis | [SPEC-X](../docs/spec/SPEC-X-transversal.md) |

Tudo é validado contra [`schemas/domain.schema.json`](../schemas/domain.schema.json) no carregamento. Chaves iniciadas por `_` são comentário e a engine ignora.

## O catálogo é um só

`materials.example.json` é o arquivo do qual os outros dependem, e a decisão de desenho mais consequente do projeto está nele: **não existe tabela de tecidos**.

Pele, músculo, osso, órgão e nervo são entradas do mesmo catálogo que descreve carvalho, ferro e vidro, no mesmo formato, com as mesmas propriedades, etiquetas, limiares térmicos e resistências. `osso` é uma entrada única, e serve tanto para um porrete quanto para um fêmur.

Três coisas caem no colo por causa disso:

A matriz de lesão passa a ser escrita em propriedade, e não em nome de tecido — `contusão + #frágil → fratura` cobre osso, vidro e cerâmica com uma linha só.

A matriz de reação já vale para o corpo sem nenhuma linha adicional. Carne queima porque é inflamável; nervo conduz porque é condutivo.

E o GM pode transmutar o material de uma parte do corpo, com todas as consequências emergindo sozinhas. Osso virado vidro para de cicatrizar porque perdeu a etiqueta `living`, e estilhaça porque a resistência a impacto do vidro é zero.

## Etiquetas biológicas

| Etiqueta | O que habilita |
|----------|----------------|
| `tissue` | pode compor uma parte do corpo por padrão |
| `living` | cicatriza, apodrece, adoece. Sem ela, a parte se comporta como objeto: perde integridade e pronto |
| `vascular` | sangra quando ferida, e aceita o vetor de injeção |

## Regras que o validador cobra

Toda entrada declara `category`: **material** é matéria estável, **elemento** é condição instável. A matriz de reação só admite elemento sobre material e elemento sobre elemento — material sobre material é rejeitado com erro nomeado, porque é o que faria o espaço de regras crescer ao quadrado.

Nenhuma regra, em nenhum arquivo, referencia um material pelo identificador. Sempre por etiqueta. É o que faz um material inventado em tempo de execução participar de todos os sistemas no instante em que recebe suas etiquetas.

Toda regra carrega um campo `porque`. Ele não é comentário: é dele que se gera o resumo em linguagem natural entregue ao GM, que é como o GM sabe quando **não** agir.

## Compressão de representação

- **Odor:** `odorDescriptor` (1–5 palavras), não grid de difusão (R-036).
- **Poça:** `dominantMaterialId` + `descriptor` opcional; volumes internos só para simulação (R-021).
- **Integridade:** campo único absorve desgaste (R-028); `wear` aposentado.
- **Gatilhos de lesão:** `injuryTriggers` separados do vocabulário R-015 (`damage`/`fall` não são efeitos de substrato).

Validação: `node scripts/validate-contracts.mjs` na raiz do projeto.
