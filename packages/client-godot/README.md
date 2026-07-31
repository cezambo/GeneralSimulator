# client-godot

Cliente de renderização em Godot 4 com GDScript: tilemap, câmera, input e UI no mundo.

**Ainda não começou.** Entra em V1 ([04-ROADMAP.md](../../docs/04-ROADMAP.md)).

Não é um workspace npm — Godot gerencia o próprio projeto, e `project.godot` nasce quando o editor abrir aqui pela primeira vez. Build padrão do Godot, não a .NET: o cliente é GDScript e não precisa de `.csproj` (ADR-001, [06-AMBIENTE.md](../../docs/06-AMBIENTE.md)).

## A regra que protege o projeto

**Manter o cliente fino o suficiente para que erro visual seja óbvio a olho nu.**

O agente escreve GDScript e roda `godot --headless --path packages/client-godot` para pegar erro de parse, mas fica cego quanto ao visual. Existem pontes MCP que resolvem isso e são bônus, não base.

Se verificar o cliente passar a exigir ferramental sofisticado, é sinal de que lógica demais vazou para cá — e o lugar dela é `sim-core`, onde a verificação é um terminal e um teste.
