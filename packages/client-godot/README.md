# client-godot

Cliente de renderização em Godot 4 (GDScript): tilemap simples, câmera, agentes placeholder e HUD. **Cliente fino** — a autoridade é o `sim-core` via WebSocket (`05-PROTOCOLO.md`).

## Pré-requisito

1. Godot **4.5+**, build padrão (não .NET).
2. Núcleo no ar:

```bash
npm run sim -- serve
```

Porta padrão: `8787` (`SIM_PORT` para mudar).

## Abrir

```text
Godot → Import → packages/client-godot/project.godot → Play (F5)
```

Ou:

```bash
godot --path packages/client-godot
```

**Agentes (Cursor):** se o utilizador reportar “núcleo desconectado” (ou ao depurar a demo), ler `packages/client-godot/.local/core-connection.json` + o final de `.local/core-connection.log`, e no terminal do `npm run sim -- serve` as linhas JSON `client_connected` / `client_disconnected`. Não confiar só no Output do editor Godot.

## Controles

| Input | Ação |
|-------|------|
| WASD / setas | Pan |
| Botão do meio + arrastar | Pan |
| Roda do mouse | Zoom |
| Espaço | Pausa / retoma |
| 1 / 2 / 3 / 4 | Velocidade 1, 2, 5, 20 |
| Clique no agente | Selecionar |
| Clique no chão (com seleção) | Pedir caminho (`cmd.agent.move`) |
| Clique na porta | Abrir / fechar (`cmd.world.toggleDoor`) |
| Hover | Info do tile (e do pawn selecionado) no HUD |
| G | Ferramenta RT: água (`wet`) — molha; apaga fogo se houver |
| Q | Ferramenta RT: apagar fogo (`extinguish`) |
| Botão direito (com ferramenta RT) | Cancela a ferramenta |
| C | Entrar/sair do modo construção (pausa) |
| B / N / F / R | Parede pedra (corta fogo) / parede madeira / chão / porta |
| E ou botão direito | Apagar tile (volta a chão) — não apaga fogo |
| T | Colocar cadeira |
| M | Mover móvel (origem → destino) |
| . | Girar móvel sob o cursor (+90°) |
| X | Remover móvel na célula |
| Z / Y | Undo / redo |
| Arrastar (construção) | Pintar / apagar células |
| F6 | Salvar slot `demo` |
| F7 | Carregar slot `demo` |
| V | Liga/desliga cone de visão |

Com `npm run sim -- serve` (padrão), o núcleo acende uma chama em (1,1). Tiles em chamas ficam alaranjados; molhados azuis; integridade baixa escurece. Móvel consumido deixa carvão/cinza no chão. `SIM_FIRE=0` desliga o seed. Caminhos são recalculados se uma parede cortar a rota.

## O que o cliente faz / não faz

Faz: desenhar snapshot, suavizar posição, desenhar trajetória do selecionado, enviar `cmd.sim.setSpeed` / `cmd.agent.move`.

Não faz: pathfinding, validação de construção, movimento autoritativo, LLM.

## Verificação headless (parse)

```bash
godot --headless --path packages/client-godot --quit-after 1
```

Se o projeto importa sem erro, o exit code é 0.
