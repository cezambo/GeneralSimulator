# SPEC-X — Transversal

Estrutura do projeto, persistência, determinismo, observabilidade, testes e configuração. É o que sustenta todos os outros domínios sem pertencer a nenhum.

---

## A tese

Duas decisões aqui decidem se o projeto é depurável ou não: **o núcleo roda sem render** e **a mesma semente produz a mesma partida**. Tudo o mais neste documento existe para preservar essas duas.

Um simulador movido a LLM sem replay é um sistema em que nenhum bug é reproduzível. Esse é o modo de falha que mata projetos deste tipo, e ele é barato de evitar no começo e caro de retrofitar depois.

---

## Estrutura

### X-001 — Núcleo headless
`P0` · `V0` · decisão · dep: —

O núcleo de simulação roda inteiro sem cliente de render, por script, e é a única fonte de verdade do estado.

Poder rodar cognição sem abrir render é o que torna o projeto testável. É estrutural, independentemente de quantos processos o arranjo final tenha.

**Aceite:** uma simulação de vários dias roda por linha de comando, sem render, e produz estado final inspecionável.

### X-002 — Cassetes e replay
`P0` · `V0` · decisão · dep: X-001

Toda chamada de LLM é gravada e pode ser reproduzida, com manifesto que registra semente, preset e versão dos prompts.

**Aceite:** uma execução gravada é reproduzida integralmente sem tocar a rede e com custo zero.

### X-003 — Persistência
`P0` · `V2` · PDF 101-107 · dep: X-001

Conforme `SimulationState`. Mundo, agentes, memórias, opiniões, metas, leis e regras provisórias são serializados e restaurados sem perda.

O estado vivo **é** a forma salva, e salvar é serializá-lo sem projeção. Montar um objeto de save a partir do estado parece mais limpo e é a origem do defeito clássico: acrescenta-se um campo ao estado, esquece-se de acrescentá-lo à projeção, e a perda aparece dias depois num carregamento, sem erro nenhum. Só duas coisas fogem à regra, por não terem representação eficiente em JSON: as camadas densas de tile, que vão codificadas por repetição (`GridTileLayers`), e a posição dos geradores (`RngCursor`).

Restaurado sem perda inclui o que não é conteúdo do mundo mas decide o que vem depois: a posição de cada fluxo de aleatoriedade e o contador de identificadores. Sem o primeiro, a partida retomada sorteia de novo o que já tinha sorteado — o save preserva o estado e perde o futuro. Sem o segundo, ela recomeça a numerar do zero e passa a criar objetos com identificador existente, colisão que não dá erro e apenas sobrescreve.

**Aceite:** salvar e carregar produz estado idêntico campo a campo; salvar, carregar e salvar de novo produz texto idêntico; e a partida retomada devolve, no fluxo seguinte, exatamente o número que a original devolveria.

### X-004 — Determinismo por semente
`P0` · `V1` · decisão · dep: X-001

Toda aleatoriedade vem de geradores semeados e nomeados por subsistema. Nada usa fonte global de números aleatórios.

**Aceite:** duas execuções com a mesma semente e o mesmo cassete produzem sequências idênticas de eventos.

### X-005 — Log causal
`P0` · `V1` · decisão · dep: X-004

Conforme `CausalEntry`. Todo efeito registra o que o causou: regra da matriz, invocação do Validador, decisão de agente ou passagem de tempo.

É a memória do mundo, é determinística e é grátis — e é por isso que não existe resumo em prosa do Validador.

Grátis por tick, não por mês: o log tem janela de retenção declarada (`X-017`), e o que sai dela é descartado sem condensar, porque semente e cassete regeneram o trecho quando ele for preciso.

**Aceite:** qualquer estado do mundo dentro da janela de retenção pode ser rastreado até a causa que o produziu, e um estado anterior à janela é rastreável reexecutando a partir da semente.

### X-006 — Observabilidade
`P0` · `V4` · decisão · dep: X-005, L-016

Painel com custo, chamadas por agente, degradações, regras provisórias, métodos recorrentes e trilha de auditoria do Validador.

**Aceite:** cada um desses itens é consultável durante a simulação, sem pausá-la.

### X-007 — Protocolo cliente-núcleo
`P0` · `V0` · derivado · dep: X-001

Canal de mensagens entre núcleo e clientes, com handshake, estado inicial completo, atualizações incrementais e reconexão.

O detalhamento está em [05-PROTOCOLO.md](../05-PROTOCOLO.md).

**Aceite:** desconectar e reconectar o cliente restaura a visão correta sem reiniciar o núcleo.

### X-008 — Configuração orientada a dados
`P0` · `V1` · decisão · dep: —

Materiais, reações, condições, corpo, tiers e números de ajuste vivem em arquivos de configuração, não em código.

**Aceite:** alterar um número de comportamento não exige recompilar nem editar código.

---

## Qualidade

### X-009 — Tipos gerados dos schemas
`P0` · `V0` · decisão · dep: X-008

Os tipos usados no código são gerados a partir dos schemas, nunca escritos à mão em paralelo.

Duas representações do mesmo contrato divergem. Já divergiram neste projeto antes de existir código.

**Aceite:** alterar um schema e regenerar quebra a compilação onde o contrato mudou.

### X-010 — Validação de contratos
`P0` · `V0` · decisão · dep: X-009, L-020

Verificação automática de que schemas referenciados existem, arquivos declarados existem, e campos citados em prosa existem no schema associado.

**Aceite:** a verificação roda por comando único e falha nomeando arquivo e campo.

### X-011 — Testes determinísticos
`P0` · `V1` · decisão · dep: X-004

O substrato, o corpo e a engine de affordances são testados sem LLM. A cognição é testada em replay.

**Aceite:** a suíte roda inteira sem chave de API e sem acesso à rede.

### X-012 — Cenários de regressão
`P1` · `V5` · derivado · dep: X-011, X-002

Execuções gravadas servem de regressão: alterar código e reexecutar o mesmo cassete revela mudança de comportamento.

**Aceite:** uma alteração que muda o comportamento determinístico é detectada pela reexecução de um cenário gravado.

### X-013 — Só o ativo é avaliado
`P0` · `V1` · decisão · dep: X-004

Tiles sem estado transiente, corpos sem condição ativa e agentes pausados não consomem tempo de processamento.

É a decisão barata que resolve o problema de desempenho por inteiro, e vale mais que qualquer otimização de layout de memória num projeto cujo gargalo é token.

**Aceite:** um mapa cheio de tiles inertes e agentes saudáveis custa tempo de tick próximo de zero.

### X-014 — Falha isolada
`P0` · `V4` · derivado · dep: L-007

Erro em uma chamada, uma regra ou um agente não interrompe a simulação: o incidente é registrado e o subsistema degrada localmente.

**Aceite:** uma resposta malformada e uma regra provisória defeituosa são contidas sem travar a partida.

### X-015 — Migração de save
`P2` · `V7` · derivado · dep: X-003

Saves declaram versão. Carregar versão anterior migra ou recusa com mensagem clara — nunca carrega parcialmente.

**Aceite:** um save de versão incompatível é recusado com mensagem, sem corromper estado.

### X-016 — Ambiente reprodutível
`P1` · `V0` · derivado · dep: —

Dependências e versões declaradas, com instruções de instalação verificadas. O detalhamento está em [06-AMBIENTE.md](../06-AMBIENTE.md).

**Aceite:** uma máquina limpa chega a rodar a suíte seguindo apenas o documento de ambiente.

### X-017 — Nada cresce sem teto
`P0` · `V2` · derivado de auditoria de custo · dep: X-003, X-005, C-010, C-048

Todo depósito que recebe entrada por tick, por ação ou por dia declara **teto e política de descarte** em `tuning.json`. Depósito sem teto declarado é defeito, verificável na revisão e não em teste.

A meta é trinta dias simulados com dez agentes (`X-008`). Três depósitos recebem entrada continuamente e nenhum tinha teto, o que significa que o custo deles não estava no orçamento de ninguém: não aparecem no perfil de CPU, porque escrever é barato, e só aparecem no fim, quando o save não cabe ou o carregamento demora minutos. Cada um tem uma razão diferente para poder esquecer.

| Depósito | Cresce com | Política | Por que pode esquecer |
|---|---|---|---|
| Log causal (`X-005`) | Cada efeito de cada tick | Janela deslizante de dias simulados; o que sai da janela é descartado, não condensado | É **reconstituível**. Com semente (`X-004`) e cassete (`X-002`), reexecutar regenera o log idêntico. Guardar trinta dias de causalidade é guardar o que se pode recalcular de graça |
| Registro de atividade (`C-010`) | Cada ação resolvida, por agente | Janela em detalhe cheio; o que sai vira resumo do dia com contagens e as entradas de nota alta | É o fato contra o qual mentira é comparada — mas só se compara o que alguém ainda pode contestar. Mentira sobre anteontem se confere; sobre o ano passado, quem confere é a memória, que já condensou |
| Banco de fatos (`C-048`) | Cada veredito verdadeiro do Crivo | Teto por agente; despeja o de menor confiança que faz mais tempo que não é usado | Fato despejado que voltar a ser ouvido volta a entrar pelo caminho normal (`C-049`). Esquecer um boato que ninguém repetiu nem usou é o comportamento certo, não perda |

O log causal é o caso que mais engana: por ser determinístico e grátis de escrever, `X-005` o chama de "memória do mundo" e nada dizia sobre pará-lo. Mas grátis por tick não é grátis por mês.

**O registro de atividade continua sem ser reescrito.** `C-010` diz que nenhuma entrada é alterada, e continua valendo: condensar aqui é **descartar** entradas antigas em bloco depois de resumi-las, nunca editar uma entrada que fica. A distinção importa porque o valor do registro está em ser imutável.

**Aceite:** trinta dias simulados com dez agentes produzem um save cujo tamanho cresce sublinearmente com o número de dias depois que as janelas enchem, e nenhum dos três depósitos tem contagem de entradas que cresça monotonicamente com o tempo de simulação.

---

## Não-objetivos

**Multijogador e rede.** Um usuário, uma máquina.

**Serviço hospedado.** Roda local.

**Otimização prematura de memória.** Vetores contíguos e ausência de alocação por tick são otimizações para uma escala que este projeto não tem. A avaliação apenas do ativo (`X-013`) já resolve.

**Telemetria externa.** Nada sai da máquina além das chamadas de LLM.
