# Ambiente de Desenvolvimento

Como configurar a máquina e o Cursor para que agentes de IA consigam trabalhar nas três partes do projeto com verificação real do resultado.

---

## 1. Instalações

| Item | Versão | Nota |
|------|--------|------|
| Node.js | 20+ | núcleo e painel |
| Godot | 4.5+ | **build padrão**, não a .NET |
| Chave OpenRouter | — | em `OPENROUTER_API_KEY` |

A build padrão do Godot basta porque o cliente é GDScript. Isso evita o problema documentado de `.csproj` sem geração não-interativa e mantém o ferramental de agente no caminho mais bem suportado. Ver ADR-001.

Godot é portátil no Windows: um único executável, sem instalador. Anote o caminho completo — será usado na configuração abaixo.

---

## 2. Cursor + Godot

O Cursor não substitui o Godot. Os dois rodam lado a lado: o Cursor edita os arquivos, o Godot executa.

### 2.1 Extensão de linguagem

Instalar **`godot-tools`** no Cursor. Como o Cursor é construído sobre o ecossistema de extensões do VS Code, a extensão oficial da equipe do Godot funciona direto.

Ela conecta no language server do Godot e dá autocompletar, ir-para-definição e diagnóstico corretos. O benefício menos óbvio e mais valioso: ela ancora o modelo na API do Godot 4 real do projeto, cortando a tendência de gerar código do Godot 3.

O language server só existe enquanto o **editor do Godot estiver aberto** com o projeto carregado. Sem Godot aberto, não há diagnóstico.

### 2.2 Godot abrindo scripts no Cursor

Em `Editor → Editor Settings → Text Editor → External`:

- marcar **Use External Editor**
- **Exec Path**: caminho completo do executável do Cursor (`C:\Users\cvnzc\AppData\Local\Programs\Cursor\Cursor.exe`)
- **Exec Flags**: `{project} --goto {file}:{line}:{col}`

Duplo clique num script dentro do Godot passa a abrir no Cursor na linha exata.

### 2.3 Recarga automática

Em `Editor Settings → Text Editor → Behavior`, ligar **Auto Reload Scripts on External Change**. Sem isso, o que o agente salva não aparece no Godot até você forçar.

---

## 3. Verificação pelos agentes

O ponto crítico de um projeto conduzido por IA: o agente precisa **ver o resultado**, não só escrever código. Cada parte tem seu caminho.

### `sim-core` — o caso fácil

Terminal puro. `vitest` para testes, `npm run sim -- --days 30 --headless --replay` para rodadas longas. O agente lê a saída diretamente. Nenhuma ferramenta especial necessária.

É por isso que a maior parte da lógica mora aqui.

### `panel-web` — ferramentas de navegador

O Cursor tem ferramentas de navegador de primeira mão. O agente navega, tira screenshot, clica, preenche formulário, lê o console e inspeciona o DOM. Ciclo de verificação completo, sem instalar nada.

### `client-godot` — o caso que exige cuidado

Sem ferramenta extra, o agente escreve GDScript e roda `godot --headless --path client-godot` para pegar erro de parse e teste automatizado, mas fica cego quanto ao visual.

Existem pontes MCP para Godot que resolvem isso — edição da árvore de cena ao vivo com undo, debugger com breakpoints, controle do jogo rodando com injeção de input, screenshot e comparação de frames, pintura de TileMapLayer com autotiling.

**Recomendação:** tratar como bônus, não como base. Esses projetos são jovens e o fluxo de trabalho não deve depender deles. A regra que protege o projeto: **manter o cliente Godot fino o suficiente para que erro visual seja óbvio a olho nu.** Se verificar o cliente exigir ferramental sofisticado, é sinal de que lógica demais vazou para lá.

---

## 4. Fluxo de trabalho típico

```
Terminal 1:  npm run dev              # sim-core + panel-web, hot reload
Terminal 2:  npm run test:watch       # testes do núcleo
Godot:       aberto no projeto, play quando quiser ver o mundo
Navegador:   localhost:5173           # painéis
```

Para iterar em prompt, nada disso precisa reiniciar — o carregador relê o arquivo.

Para rodada longa de cognição, nada além do Terminal 1 é necessário.

---

## 5. Variáveis de ambiente

```
OPENROUTER_API_KEY=...
SIM_CORE_PORT=8787
SIM_LLM_MODE=hybrid          # live | hybrid | replay
SIM_CASSETTE_DIR=cassettes
```

`.env` fica fora do controle de versão. `config/models.example.json` é o modelo para criar o `config/models.json` local.
