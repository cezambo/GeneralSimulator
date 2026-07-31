# Protocolo Núcleo ↔ Clientes

O arranjo híbrido (ADR-001) só se sustenta se a fronteira for disciplinada. Este documento é o contrato.

---

## 1. Regra fundamental

**O núcleo é a única autoridade sobre o mundo. Clientes não decidem nada.**

O cliente Godot não valida construção, não calcula pathfinding, não move agente, não altera inventário. Ele desenha o que recebe e envia o que o usuário pediu. Se alguma dessas decisões vazar para o GDScript, o arranjo perde o sentido.

Teste prático para saber se algo pertence ao núcleo: *se eu rodar a simulação headless por 30 dias sem cliente nenhum, isso precisa acontecer?* Se sim, é núcleo.

---

## 2. Transporte

WebSocket em `localhost`, porta padrão `8787`. Dois tipos de cliente conectam ao mesmo servidor:

- `client-godot` — o jogo
- `panel-web` — os painéis de dados

Ambos falam o mesmo protocolo e recebem os mesmos eventos, filtrados por subscrição. O painel web pode estar fechado sem afetar a simulação.

Sem autenticação (local). Reconexão automática com `world.snapshot` completo a cada nova conexão.

---

## 3. Envelope

```jsonc
{
  "v": 1,              // versão do protocolo
  "type": "agents.update",
  "seq": 4821,         // sequencial por remetente, detecta perda
  "simTime": 187430,   // minutos de tempo simulado
  "payload": { }
}
```

Requisição/resposta usa correlação:

```jsonc
{ "v": 1, "type": "req.agent.detail", "reqId": "r-88", "payload": { "agentId": "ag_03" } }
{ "v": 1, "type": "res.agent.detail", "reqId": "r-88", "payload": { } }
{ "v": 1, "type": "res.error",        "reqId": "r-88", "payload": { "code": "NOT_FOUND", "message": "" } }
```

---

## 4. Núcleo → Cliente

### 4.1 Estado

| Tipo | Quando | Conteúdo |
|------|--------|----------|
| `world.snapshot` | ao conectar, ao carregar save | mapa completo, tiles, objetos, agentes, relógio, modo |
| `world.delta` | quando algo muda | tiles alterados, objetos criados/removidos/movidos |
| `agents.update` | ~15 Hz enquanto rodando | transforms e estado visível dos agentes |
| `clock.update` | a cada tick | tempo simulado, velocidade, pausado |

### 4.2 Movimento — trajetórias, não posições

O ponto mais importante do desempenho. O núcleo **não** transmite posição a cada frame. Ele transmite a trajetória e o cliente interpola.

```jsonc
{
  "type": "agents.update",
  "payload": {
    "agents": [
      {
        "id": "ag_03",
        "pos": { "x": 12.4, "y": 8.1 },      // posição contínua, não travada no grid
        "rot": 137.5,                          // graus
        "motion": {                            // ausente se parado
          "path": [ {"x":13,"y":8}, {"x":14,"y":9} ],
          "speed": 2.4,                        // tiles por minuto simulado
          "etaSimTime": 187436
        },
        "flags": ["thinking"],                 // thinking, sleeping, in_conversation, combat, unconscious
        "vision": { "angle": 120, "range": 15 }
      }
    ]
  }
}
```

O cliente interpola ao longo de `path` e extrapola entre atualizações. Movimento fica suave mesmo com atualização esparsa, e a autoridade continua no núcleo.

### 4.3 Eventos

Coisas que aconteceram e merecem retorno visual ou sonoro.

| Tipo | Uso |
|------|-----|
| `event.speech` | balão de fala sobre o agente |
| `event.thought` | indicador de pensamento (opcional, debug) |
| `event.gm.narration` | narrativa do Validador, vai para timeline |
| `event.mutation` | mutação de mundo aplicada pelo Validador (fogo, dano, destruição) |
| `event.combat` | ataque, grito semântico com raio |
| `event.social` | conversa iniciada, encerrada, realocação |
| `event.cognition` | ruptura de opinião, meta trocada, capricho disparado |
| `event.llm` | chamada iniciada/concluída, custo, modelo usado (só painel) |
| `event.error` | falha de LLM, budget estourado, JSON irreparável |

O painel web assina tudo. O cliente Godot assina só o que tem representação visual.

---

## 5. Cliente → Núcleo

### 5.1 Controle de simulação

```
cmd.sim.setSpeed      { speed: 0 | 1 | 2 | 4 | 8 }   // 0 = pausado
cmd.sim.setMode       { mode: "normal" | "construction" }
cmd.sim.save          { slot: string }
cmd.sim.load          { slot: string }
```

Entrar em modo construção pausa automaticamente (requisito do PDF).

### 5.2 Manipulação direta

```
cmd.entity.grab       { entityId }
cmd.entity.drop       { entityId, pos: {x, y} }
cmd.entity.contextAction { entityId, actionId, params }
```

Arrastar não é o cliente movendo nada. Ele pede; o núcleo valida e responde com `world.delta` ou `res.error`.

### 5.3 Construção

```
cmd.build.paintTile   { tileType, materialId, cells: [{x,y}] }
cmd.build.placeObject { objectDefId, pos, rotation }
cmd.build.remove      { target: "tile" | "object", cells | objectId }
cmd.build.rotate      { objectId, degrees }
cmd.build.undo        { }
cmd.build.redo        { }
cmd.build.createCustomItem { name, description, category, materialId }

cmd.tool.apply        { effect: "wet" | "extinguish", cells: [{x,y}] }  // GM em tempo real (modo normal)
cmd.world.toggleDoor  { x, y }  // abre/fecha porta; revalida path (modo normal)
```

O histórico de undo vive no núcleo, não no cliente. É a única forma de manter consistência quando o mesmo mundo é editado por comando e por LLM.

### 5.4 Consultas

```
req.agent.detail      { agentId }        → perfil completo, memórias, opiniões, metas, log
req.agent.memories    { agentId, layer } → camada específica da waterfall
req.world.region      { x, y, w, h }     → tiles e objetos de uma região
req.catalog.models    { tier }           → catálogo OpenRouter filtrado por capacidade
req.trace.call        { callId }         → prompt renderizado, resposta crua, custo
```

### 5.5 Edição cognitiva pelo usuário

Requisito explícito do PDF: o usuário altera pensamentos, memórias e personalidade.

```
cmd.agent.setPersonality { agentId, traits, traitsText }
cmd.agent.addMemory      { agentId, layer, text }
cmd.agent.editMemory     { agentId, memoryId, text }
cmd.agent.deleteMemory   { agentId, memoryId }
cmd.agent.injectThought  { agentId, text }
cmd.agent.setGoal        { agentId, level, text }
cmd.agent.editOpinion    { agentId, opinionId, nuanceDescription }
```

### 5.6 Validador e configuração

```
cmd.gm.setInstructions   { text, expiresAtSimTime? }
cmd.config.setPreset     { presetId }
cmd.config.setBinding    { tier, provider, model, params }
cmd.config.setTuning     { key, value }
cmd.debug.toggle         { flag, value }   // visionCones, pathLines, thoughtBubbles
cmd.llm.setMode          { mode: "live" | "hybrid" | "replay" }
```

---

## 6. Tipos compartilhados

`schemas/` é a fonte única. Dele derivam:

- tipos TypeScript do núcleo e do painel (geração automática)
- validação em runtime das mensagens
- documentação do protocolo

O cliente Godot **não** gera tipos. Ele lê dicionários do JSON diretamente — é cliente fino, e manter geração de código GDScript sincronizada custaria mais do que resolve. Em troca, o núcleo valida toda mensagem que recebe e responde `res.error` com mensagem clara em vez de falhar em silêncio.

---

## 7. Desenvolvimento

```
npm run dev        # sim-core + panel-web, com hot reload de prompts
godot --path client-godot     # ou abrir no editor e dar play
npm run sim -- --days 30 --headless --replay   # sem cliente nenhum
```

O cliente Godot mostra estado "núcleo desconectado" e tenta reconectar sozinho. Fechar e reabrir o Godot nunca derruba a simulação.

---

## 8. Versionamento

`v` no envelope. Mudança incompatível incrementa a versão; o núcleo rejeita cliente de versão diferente com mensagem explícita, em vez de deixar acontecer erro obscuro no meio de uma sessão.
