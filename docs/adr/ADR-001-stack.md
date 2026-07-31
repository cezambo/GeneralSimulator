# ADR-001 — Arranjo híbrido: núcleo TypeScript, cliente Godot, painéis web

**Data:** 31/07/2026
**Status:** aceito

---

## Contexto

O projeto precisa de três coisas que raramente convivem bem na mesma tecnologia:

1. **Lógica de simulação complexa** — waterfall de memória, grafo de opiniões, máquina de estados de conversa multi-agente, orquestração assíncrona de ~35 prompts, contabilidade de custo, gravação e replay de chamadas LLM. Milhares de linhas de lógica que se beneficiam muito de tipagem estática e boa refatoração.

2. **Render top-down de tilemap** com movimento e rotação contínuos (não travados no grid), câmera, pathfinding e um modo construção.

3. **UI densa de dados** — inspetor de agente com dez abas editáveis, seletor de modelos filtrável sobre 364 opções, timeline, visualizador de trace, dashboard de custo.

Restrição relevante: o desenvolvimento será conduzido por agentes de IA, não escrito à mão. Isso torna a qualidade do ferramental de agente um critério de primeira ordem, não um detalhe.

## Opções consideradas

**Monorepo TypeScript puro (React + PixiJS).** Melhor para (1) e (3), ferramental de IA mais forte, e o Cursor tem ferramentas de navegador de primeira mão — o agente consegue navegar, clicar, tirar screenshot e ler o console do que construiu. Perde o Godot, que o usuário já conhece, e exige construir tilemap, câmera e A* à mão.

**Godot 4 + C# monolítico.** Boa para (1) e (2). Descoberta que pesou contra: as pontes MCP que dão capacidade real aos agentes no Godot cobrem GDScript e não C# — seus language servers e debuggers não falam C#. Além disso o build padrão do Godot não suporta C# (arquivo `.cs` salva, não anexa a nada, falha em silêncio), exigindo a build .NET, e a geração do `.csproj` não tem caminho não-interativo.

**Godot 4 + GDScript monolítico.** Melhor ferramental de agente para Godot, sem build especial. Mas GDScript é frágil para (1) — tipagem estática opcional, refatoração em escala arriscada, async HTTP desajeitado — e (3) em Control nodes custa várias vezes o que custa em React.

**Híbrido de três partes.** Escolhido.

## Decisão

| Parte | Tecnologia |
|-------|-----------|
| `sim-core` — simulação, cognição, GM, camada LLM | TypeScript / Node |
| `client-godot` — mundo, câmera, input, UI sobre o mapa | Godot 4 + GDScript |
| `panel-web` — painéis densos de leitura e configuração | React |

Comunicação entre núcleo e cliente por WebSocket em localhost.

## Consequências

**Positivas**

- Cada parte usa a ferramenta em que é forte, sem concessão em nenhuma das três frentes.
- A separação núcleo/cliente deixa de depender de disciplina e passa a ser fisicamente imposta. O núcleo não consegue importar render nem que se queira.
- `sim-core` é testável por completo com `vitest` no terminal — sem editor, sem render, rápido e barato. Bug de cognição fica isolado de bug de render por construção.
- O cliente não precisa da build .NET do Godot nem de `.csproj`. Build padrão basta, e GDScript é onde o ferramental de agente para Godot é melhor.
- O agente consegue verificar o painel web com as ferramentas de navegador do Cursor, e o cliente Godot via `godot --headless` e pontes MCP quando disponíveis.
- Simular 30 dias headless durante a noite não exige abrir o Godot.

**Negativas**

- Duas fronteiras de processo. Toda funcionalidade que atravessa o limite exige trabalho de protocolo.
- Dois runtimes para iniciar em desenvolvimento.
- Depuração atravessando o limite é mais trabalhosa, parcialmente compensada pelo núcleo ser testável isolado.
- Os tipos precisam ser derivados de uma fonte única (`schemas/`) para não divergirem entre TS e GDScript.

**Risco principal e mitigação**

Lógica de simulação vazar para o GDScript. Se isso acontecer, o arranjo perde a razão de existir e vira o pior dos dois mundos. Mitigação: o cliente é fino por contrato — recebe estado e envia comandos, nunca decide nada sobre o mundo. Nem construção, nem validação, nem pathfinding.

## Notas de implementação

- Godot 4.5 ou superior, **build padrão** (não .NET).
- Protocolo especificado em `docs/05-PROTOCOLO.md`.
- `schemas/` como fonte única; tipos TS gerados a partir dele.
- O painel web é servido pelo próprio processo do `sim-core`.
