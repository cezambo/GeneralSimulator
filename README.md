# Simulador de Interações

Simulador de vida social em vista de cima, num mundo em grid com tiles, onde agentes controlados por LLM vivem, pensam, formam memórias e opiniões, interagem entre si e evoluem psicologicamente. Um Game Master invisível, também LLM, media as ações e altera o mundo para corresponder ao que os agentes tentam fazer.

Não é um jogo de sobrevivência com diálogos escritos à mão. É um laboratório de emergência narrativa.

---

## Estado atual

**Fase de planejamento.** Ainda não há código. A especificação e a biblioteca de prompts estão em construção.

---

## Por onde começar a ler

| Documento | Conteúdo |
|-----------|----------|
| [`docs/AUDITORIA.md`](docs/AUDITORIA.md) | O que existe, o que falta, o que está quebrado |
| [`docs/02-ARQUITETURA.md`](docs/02-ARQUITETURA.md) | Como o projeto é estruturado e por quê |
| [`docs/03-CAMADA-LLM.md`](docs/03-CAMADA-LLM.md) | Provider-agnostic via OpenRouter, tiers, seleção de modelo |
| [`docs/04-ROADMAP.md`](docs/04-ROADMAP.md) | Fatias verticais, mundo primeiro |
| [`docs/05-PROTOCOLO.md`](docs/05-PROTOCOLO.md) | Contrato entre núcleo e clientes |
| [`docs/07-REFERENCIAS-SISTEMICAS.md`](docs/07-REFERENCIAS-SISTEMICAS.md) | Como Dwarf Fortress, Brogue, Noita, Qud e BOTW constroem emergência, e o que tomamos de cada um |
| [`docs/spec/`](docs/spec/) | Requisitos atômicos, identificados e verificáveis |
| [`docs/adr/`](docs/adr/) | Decisões arquiteturais registradas |
| [`prompts/README.md`](prompts/README.md) | Como a biblioteca de prompts funciona |

---

## Arquitetura em uma imagem

```
sim-core  (TypeScript / Node)          ← única autoridade sobre o mundo
   mundo, agentes, cognição, GM, orquestração de LLM
        │
        │  WebSocket localhost:8787
        ├──────────────────────────┐
        ▼                          ▼
client-godot                   panel-web
(Godot 4 + GDScript)           (React)
render, câmera, input,         inspetor de agente, seletor
UI sobre o mapa                de modelos, timeline, custo
```

O núcleo roda sozinho, sem cliente nenhum. Simular 30 dias headless não exige abrir o Godot.

---

## Estrutura do repositório

```
docs/          especificação, arquitetura, decisões
prompts/       biblioteca editável de prompts (~35, em construção)
schemas/       JSON Schema — fonte única dos contratos de dados
config/        dados do simulador: materiais, reações, corpo, condições, modelos, ajustes
cassettes/     gravações de LLM para replay determinístico
packages/      código (ainda não criado)
```

---

## Princípios que guiam o projeto

**O GM é permissivo.** Quase toda ação plausível é materializada no mundo. Negar é último recurso; o normal é executar, executar com custo, ou reinterpretar.

**A engine decide o possível, a LLM decide a intenção.** Pathfinding, geometria e affordances vêm do núcleo. Agentes escolhem o que querer, não como calcular.

**O substrato roda sozinho; o GM só cria causa nova.** Fogo, temperatura, líquidos, gases, coberturas, luz, som e odor são simulados por regras determinísticas em dado, sem chamar modelo nenhum. O GM não simula física — decide apenas se um efeito começa, e só quando nenhuma regra já responderia isso. Invocação recorrente do GM é dívida: vira linha na matriz.

**O corpo é o mesmo motor, com outra topologia.** Anatomia é uma árvore de 25 partes onde tile vira parte, estado transiente vira condição e campo calculado vira capacidade. Consciência multiplica movimento, manipulação e fala — então um pulmão perfurado piora a firmeza da mão sem que exista regra ligando os dois.

**Existe um catálogo de materiais só.** Pele, músculo e osso ficam nele ao lado de carvalho, ferro e vidro, no mesmo formato. Osso é uma entrada única, e serve tanto para um porrete quanto para um fêmur. Daí sai a coisa mais divertida do desenho: o GM pode transmutar o material de uma parte do corpo, e as consequências se calculam sozinhas — osso virado vidro para de cicatrizar porque perdeu a etiqueta de tecido vivo, e estilhaça porque vidro estilhaça. Ninguém escreveu regra para ossos de vidro.

**O GM muta causas; a engine deriva o resto.** Ele aplica condição, troca material, destrói parte. Nunca escreve quanta consciência alguém tem, nem se está vivo — isso é calculado. A regra existe porque escrever em campo derivado seria apagado no recálculo seguinte, mas o efeito colateral é melhor que a regra: morte causada pela narrativa nasce com a mesma cadeia causal auditável de qualquer outra.

**O físico existe para o social.** Fumaça bloqueia a testemunha. Sangue nas mãos é evidência. Uma tosse persistente vira assunto, medo e lei comunitária. Um sistema físico que a cognição não enxerga é custo sem retorno.

**Rico na simulação, resumido no contexto.** O gargalo é token, não CPU. Odor = descritor de 1–5 palavras; poça = material dominante + descritor; integridade unificada absorve desgaste.

**Promoção generalizada.** Improviso do GM vira regra provisória cross-domain (`generalization` com `domain` + vocabulário fechado), revisável no painel. Portão: registro de plausibilidade do cenário.

**Pipeline de 2 chamadas.** Pensamento embute intenção; GM só quando affordance não cobre. Profundidade por consciência (B-014), sem roteador LLM.

**Prompts não são código.** Vivem em arquivos Markdown editáveis, com modelo configurável por menu. Ajustar comportamento durante teste não deve exigir recompilar nada.

**Nada de modelo hardcoded.** Prompts declaram capacidades; a UI atribui modelos. Qualquer modelo de qualquer provedor, por nível de pensamento.

**Toda chamada de LLM é gravada.** Sem replay determinístico, comportamento emergente é indepurável.

---

## Requisitos de ambiente

- Node.js 20+
- Godot 4.5+ (build padrão — **não** é necessária a build .NET)
- Chave de API do OpenRouter em `OPENROUTER_API_KEY`

Para desenvolvimento com IA no Cursor, ver `docs/06-AMBIENTE.md`.
