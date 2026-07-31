# SPEC-L — Camada LLM

Roteamento, tiers, orçamento, validação, cassetes e custo. É a camada que fica entre o resto do sistema e qualquer modelo de qualquer provedor.

A visão de conjunto e os números do catálogo estão em [03-CAMADA-LLM.md](../03-CAMADA-LLM.md); aqui ficam os requisitos verificáveis.

---

## A tese

Nenhum modelo é mencionado em código nem em arquivo de prompt. O prompt declara o que precisa; a configuração diz com o quê; o roteador resolve na hora.

Trocar o modelo de todos os pensamentos corriqueiros tem de ser editar um campo — não tocar em nenhum prompt. E o gargalo real deste projeto não é dólar, é token e taxa de requisição, então tudo aqui é desenhado para gastar menos chamadas antes de gastar menos por chamada.

---

## Roteamento

### L-001 — Agnosticismo de provedor
`P0` · `V0` · decisão · dep: —

O roteador fala com OpenRouter e com APIs diretas pela mesma interface. Trocar de provedor não altera nenhum prompt nem nenhuma chamada do resto do sistema.

**Aceite:** o mesmo prompt roda contra OpenRouter e contra uma API direta sem alteração de arquivo de prompt.

### L-002 — Prompt declara tier e capacidades
`P0` · `V0` · decisão · dep: L-001

Cada entrada do registro declara tier, capacidades exigidas e, opcionalmente, temperatura, teto de tokens e esforço de raciocínio. Nunca declara modelo.

**Aceite:** nenhum arquivo de prompt nem entrada de registro contém nome de modelo.

### L-003 — Três tiers
`P0` · `V0` · decisão · dep: L-002

`compact` para classificadores e pensamento instintivo; `narrative` para pensamento corriqueiro, social e GM; `longform` para sumarização e construção do mundo.

Tier é **qual modelo**. Parâmetros de amostragem são do prompt, não do tier — foi a confusão entre as duas dimensões que produziu oito tiers colapsando em três modelos.

**Aceite:** os três tiers cobrem todos os prompts do registro, e nenhum preset precisa de um quarto.

### L-004 — Resolução de binding
`P0` · `V0` · decisão · dep: L-003

Três níveis, do mais específico ao mais geral: exceção por prompt, vínculo do preset ativo para aquele tier, e erro de configuração se nenhum resolver.

Operações irreversíveis — decepar, destruir parte vital, transmutar — exigem o tier alto independentemente do que o gatilho pediria.

**Aceite:** um prompt com exceção configurada ignora o preset; um tier sem vínculo falha na inicialização, não em tempo de execução.

### L-005 — Presets
`P1` · `V0` · decisão · dep: L-004

Conjuntos nomeados de vínculos que alternam a simulação inteira entre configurações — teste barato, equilibrado, qualidade — num clique.

**Aceite:** trocar de preset altera os três tiers de uma vez e passa a valer na próxima chamada.

### L-006 — Orçamento e degradação
`P0` · `V0` · decisão · dep: L-004

Teto de chamadas por agente por dia simulado e teto de gasto diário. Ao estourar, o agente degrada para rotina e affordances sem LLM.

A degradação é **sempre visível**: agente coerente mas inerte, sem aviso, é o pior modo de falha possível para este projeto, porque parece que está funcionando.

**Aceite:** um agente que atinge o teto aparece marcado como degradado no painel, com a hora simulada em que isso começou.

### L-007 — Validação e reparo
`P0` · `V0` · decisão · dep: L-004

Toda resposta é validada contra o schema declarado. Inválida, passa por até duas tentativas de reparo com a mensagem do validador. Persistindo, o chamador recebe falha explícita e resolve por caminho degradado.

**Aceite:** uma resposta malformada nunca é entregue ao chamador como se fosse válida, e a contagem de reparos aparece na telemetria.

### L-008 — Renderização de prompt
`P0` · `V0` · decisão · dep: L-002

O renderizador resolve inclusões de fragmentos compartilhados, substitui variáveis e injeta o trecho relevante do schema de saída. Variável declarada e não fornecida é erro, não string vazia.

**Aceite:** renderizar um prompt sem uma variável declarada falha com mensagem que nomeia a variável.

### L-009 — Fragmentos de regra por tipo
`P1` · `V0` · decisão · dep: L-008

As regras compartilhadas são fatiadas em universal, agente e GM. Cada prompt recebe apenas o que lhe cabe: classificadores recebem só idioma e disciplina de JSON.

Injetar as oito regras do GM na frente de uma tarefa de classificação de três linhas é o que faz modelo pequeno errar, e este projeto declara que vai testar em modelo pequeno.

**Aceite:** um prompt utilitário renderizado não contém nenhuma regra de GM nem de persona.

---

## Catálogo e seleção

### L-010 — Catálogo dinâmico
`P1` · `V0` · decisão · dep: L-001

A lista de modelos, provedores e preços vem da API ao vivo, com cache curto e atualização manual. Nunca de tabela fixa no código.

**Aceite:** o preço exibido para um modelo corresponde ao preço corrente da API, não a um valor embutido.

### L-011 — Filtro de capacidade
`P0` · `V0` · decisão · dep: L-010, L-003

Todo prompt do projeto retorna JSON, então modelos sem saída estruturada ficam escondidos por padrão. O tier `longform` filtra também por contexto mínimo.

**Aceite:** o seletor do tier `longform` não oferece modelo abaixo do contexto mínimo declarado.

### L-012 — Seleção de provedor
`P2` · `V0` · derivado · dep: L-010

Um mesmo modelo é servido por vários provedores com preço e latência distintos. A configuração aceita automático, provedor fixo ou lista ordenada com reserva.

**Aceite:** fixar um provedor faz a requisição citá-lo, e a lista ordenada cai para o seguinte quando o primeiro falha.

---

## Determinismo e custo

### L-013 — Cassetes
`P0` · `V0` · decisão · dep: L-004, X-002

Toda chamada grava requisição, resposta e metadados, indexadas por hash de identificador do prompt, variáveis renderizadas e vínculo.

**Aceite:** uma execução gravada roda inteira em replay sem tocar a rede.

### L-014 — Modos de execução
`P0` · `V0` · decisão · dep: L-013

Três modos: ao vivo, híbrido — usa cassete quando existe, chama quando não existe — e replay estrito, que falha se faltar cassete.

**Aceite:** o modo replay estrito falha explicitamente diante de uma chamada não gravada, em vez de chamar a rede em silêncio.

### L-015 — Escopo do replay
`P1` · `V0` · decisão · dep: L-013

O replay reproduz fielmente **a mesma execução**, que é o que serve para depurar o dia 7. Ele não sustenta trocar um prompt e ver só aquilo mudar: a primeira divergência altera todas as variáveis a jusante e invalida os hashes seguintes.

Registrar a limitação é mais barato que perseguir a promessa.

**Aceite:** a documentação do modo replay declara essa limitação, e a UI não oferece comparação de prompts como se fosse controlada.

### L-016 — Contabilidade de custo
`P0` · `V0` · decisão · dep: L-004

Cada chamada registra tokens de entrada e saída, custo em dólar, latência, tentativas de reparo e origem em cassete. Agregado por sessão, por dia simulado e por agente.

**Aceite:** o custo acumulado da sessão bate com a soma das chamadas individuais.

### L-017 — Limite de requisições
`P1` · `V0` · derivado · dep: L-016

O roteador respeita o limite de requisições por minuto do provedor, com fila e recuo progressivo. Modelos gratuitos costumam ser limitados por taxa, não por preço.

Uma rodada noturna de trinta dias simulados exige sustentar dezenas de chamadas por minuto. Se o preset gratuito não alcançar, isso precisa aparecer antes da rodada, não durante.

**Aceite:** estourar o limite do provedor produz enfileiramento e recuo, nunca erro que interrompa a simulação.

### L-018 — Segredo de API
`P0` · `V0` · derivado · dep: L-001

Chaves vêm de variável de ambiente, nunca de arquivo versionado. A configuração referencia o nome da variável, não o valor.

**Aceite:** nenhum arquivo versionado contém chave, e a ausência da variável falha na inicialização com mensagem clara.

---

## Qualidade

### L-019 — Escrito para o modelo mais fraco
`P1` · `V0` · decisão · dep: L-003

Prompts são escritos para o tier mais fraco em que vão rodar: system curto, poucos campos, exemplo de saída embutido, limite explícito de extensão.

**Aceite:** cada prompt registra o modelo mais fraco em que já se comprovou funcional.

### L-020 — Validação de contratos
`P0` · `V0` · decisão · dep: L-002, X-011

Um verificador confere que todo schema referenciado existe, que todo arquivo de prompt declarado existe, e que todo campo citado na prosa de um prompt existe no schema associado.

Trinta linhas de verificação substituem uma disciplina manual que já falhou repetidamente num corpo de trinta documentos.

**Aceite:** o verificador falha com mensagem nomeando arquivo e campo quando qualquer das três condições é violada.

### L-021 — Trace inspecionável
`P1` · `V0` · derivado · dep: L-016

Cada chamada guarda prompt renderizado, resposta bruta e resultado da validação, acessíveis na UI a partir do evento que a originou.

**Aceite:** qualquer decisão de agente pode ser aberta até o texto exato enviado ao modelo.

---

## Não-objetivos

**Treinar ou afinar modelo.** O projeto usa modelos como estão.

**Roteamento automático por qualidade.** A escolha de modelo é do usuário, por preset. Nada de heurística que troca de modelo sozinha.

**Cache semântico.** Reaproveitar resposta de prompt parecido introduz não-determinismo difícil de depurar. Cassete é por hash exato, e é o suficiente.
