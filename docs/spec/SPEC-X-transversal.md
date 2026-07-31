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

Mundo, agentes, memórias, opiniões, metas, leis e regras provisórias são serializados e restaurados sem perda.

**Aceite:** salvar e carregar produz estado idêntico campo a campo.

### X-004 — Determinismo por semente
`P0` · `V1` · decisão · dep: X-001

Toda aleatoriedade vem de geradores semeados e nomeados por subsistema. Nada usa fonte global de números aleatórios.

**Aceite:** duas execuções com a mesma semente e o mesmo cassete produzem sequências idênticas de eventos.

### X-005 — Log causal
`P0` · `V1` · decisão · dep: X-004

Todo efeito registra o que o causou: regra da matriz, invocação do Validador, decisão de agente ou passagem de tempo.

É a memória do mundo, é determinística e é grátis — e é por isso que não existe resumo em prosa do Validador.

**Aceite:** qualquer estado do mundo pode ser rastreado até a causa que o produziu.

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

---

## Não-objetivos

**Multijogador e rede.** Um usuário, uma máquina.

**Serviço hospedado.** Roda local.

**Otimização prematura de memória.** Vetores contíguos e ausência de alocação por tick são otimizações para uma escala que este projeto não tem. A avaliação apenas do ativo (`X-013`) já resolve.

**Telemetria externa.** Nada sai da máquina além das chamadas de LLM.
