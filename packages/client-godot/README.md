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

## Controles

| Input | Ação |
|-------|------|
| WASD / setas | Pan |
| Botão do meio + arrastar | Pan |
| Roda do mouse | Zoom |
| Espaço | Pausa / retoma |
| 1 / 2 / 3 / 4 | Velocidade 1, 2, 5, 20 |
| V | Liga/desliga cone de visão |

Com `npm run sim -- serve` (padrão), o núcleo acende uma chama em (1,1). Tiles em chamas ficam alaranjados; resíduo (cinza/carvão) escurece. `SIM_FIRE=0` desliga o seed.

## O que o cliente faz / não faz

Faz: desenhar snapshot, interpolar visualmente posição recebida, enviar `cmd.sim.setSpeed`.

Não faz: pathfinding, validação de construção, movimento autoritativo, LLM.

## Verificação headless (parse)

```bash
godot --headless --path packages/client-godot --quit-after 1
```

Se o projeto importa sem erro, o exit code é 0.
