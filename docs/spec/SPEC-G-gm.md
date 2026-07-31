# SPEC-G — Game Master

O mediador invisível. Interpreta a intenção que o pensamento produziu, decide o que acontece e altera o mundo para corresponder.

O substrato que ele **não** precisa simular está em [SPEC-R](SPEC-R-substrato.md); a fronteira biológica equivalente está em [SPEC-B](SPEC-B-corpo.md). A mente cuja intenção ele recebe está em [SPEC-C](SPEC-C-cognicao.md).

---

## A tese

O GM existe porque nenhuma engine consegue enumerar antecipadamente tudo que uma pessoa pode inventar de fazer. Ele não é porteiro nem juiz: é a fonte de **causação nova**.

Isso define o documento inteiro por subtração. Quanto mais a engine resolve sozinha, menos o GM é chamado — e cada regra que ele promove é uma chamada que deixa de existir para sempre. Um GM bem projetado fica progressivamente mais barato ao longo de uma partida.

---

## Papel e fronteira

### G-001 — Mediador invisível
`P0` · `V4` · PDF 82-87 · dep: C-006 · prompt: `gm.evaluate_high`

O GM recebe intenção em linguagem natural mais contexto, e devolve veredito, narrativa, mutações e retorno diegético. Os agentes não sabem que ele existe e nunca falam com ele.

Há **um** prompt de GM. Não existe caminho rápido nem caminho lento: existe o caminho determinístico da engine e existe o GM.

**Aceite:** nenhum texto que chega a um agente revela a existência do GM, e o sistema tem exatamente um prompt de mediação.

### G-002 — Affordance-first
`P0` · `V4` · decisão · dep: W-031, C-008

Se a `actionType` da intenção casa com uma affordance declarada do alvo e a proximidade já foi validada (`A-010`), a engine executa **sem chamada de LLM**, com retorno diegético por template.

Chamar um modelo para autorizar sentar numa cadeira seria a chamada de maior volume e menor retorno do sistema. O GM só entra quando a intenção não encontra affordance — que é exatamente o caso interessante.

**Aceite:** sentar, pegar item visível, abrir porta destrancada, comer e largar item geram zero invocação de GM.

### G-003 — Postura permissiva
`P0` · `V4` · PDF 82-87 · dep: G-001

A postura padrão é materializar. Diante de uma ação improvável, o GM prefere executar com custo, ou reinterpretar, antes de negar.

Isso substitui a aprovação binária do documento original e é o que permite ao agente tentar qualquer coisa.

**Aceite:** numa amostra de ações implausíveis, a proporção de `denied` é minoritária.

### G-004 — Hierarquia de veredito
`P0` · `V4` · PDF 82-87 · dep: G-003

Quatro vereditos em ordem de preferência: `executed`, `partial`, `reinterpreted`, `denied`. A negação é último recurso, reservada a instrução do usuário, lei inviolável ou impossibilidade total sem adaptação.

**Aceite:** cada veredito é produzido pelo menos uma vez numa bateria de ações variadas, e `denied` sempre cita qual das três causas o justificou.

### G-005 — Mutação de mundo
`P0` · `V4` · PDF 82-87 · dep: G-004

Conforme `WorldMutation`. Toda resposta lista alterações concretas de estado com tipo, alvo e campos alterados. Narrativa sem mutação não altera nada.

**Aceite:** um veredito `executed` que descreve mudança física sem emitir mutação correspondente é rejeitado na validação.

### G-006 — Retorno diegético
`P0` · `V4` · PDF 82-87 · dep: G-004

O agente nunca vê linguagem de sistema. Recebe sensação, percepção e consequência: não "ação inválida", mas "a maçaneta não cede".

**Aceite:** nenhum retorno ao agente contém vocabulário de sistema, código de erro ou menção a regra.

### G-007 — O GM não simula física
`P0` · `V4` · decisão · dep: R-044, B-043

Quando a ação tem caminho causal já modelado — encostar, arremessar, derrubar, mergulhar, pisar em, esfaquear, cair — o GM apenas autoriza e para. A engine faz o resto.

Emitir efeito que a matriz já produziria aplica tudo duas vezes.

**Aceite:** arremessar objeto aceso em material inflamável produz zero `engine_effect`; esfaquear alguém produz zero `apply_condition`.

### G-008 — Causação nova
`P0` · `V4` · decisão · dep: G-007, R-043

O território exclusivo do GM é criar estado que nenhuma regra sabia produzir. A matriz sabe o que acontece dado que um estado existe; ela não enumera as maneiras de uma pessoa inventar de criá-lo.

Esfregar gravetos até pegar fogo é caso do GM. Arremessar tocha em palha não é.

**Aceite:** um método improvisado plausível que nenhuma regra cobre produz `engine_effect` com justificativa; um método já coberto não produz.

---

## Contexto exposto ao GM

### G-009 — Instantâneo do substrato
`P0` · `V4` · derivado de R-041 · dep: R-041

Materiais, etiquetas, estados ativos, coberturas, temperatura, integridade e o vocabulário de efeitos invocáveis no escopo da ação.

**Aceite:** o prompt do GM contém os efeitos que ele pode invocar, e nenhum efeito fora dessa lista é aceito na resposta.

### G-010 — Resumo da matriz
`P0` · `V4` · derivado de R-042 · dep: R-042, G-007

Descrição em linguagem natural do que a engine já resolve sozinha naquele escopo. É o que permite ao GM saber quando **não** agir.

**Aceite:** remover o resumo do prompt aumenta mensuravelmente a taxa de efeitos duplicados.

### G-011 — Exposição do corpo
`P0` · `V5` · derivado de B-034 · dep: B-034

Árvore de partes com material corrente, condições, capacidades derivadas e operações biológicas invocáveis, para os corpos em escopo.

O corpo entra pelo mesmo canal do substrato, no mesmo formato, porque é o mesmo catálogo de materiais.

**Aceite:** o prompt do GM descreve os corpos presentes com o mesmo vocabulário que descreve tiles e objetos.

### G-012 — Resumo da matriz de lesão
`P0` · `V5` · derivado de B-035 · dep: B-035, G-007

O equivalente biológico do resumo da matriz: o que a lesão já resolve sozinha, para faca, queda, fogo, frio, corrosivo e veneno.

**Aceite:** o resumo de lesão tem o mesmo peso e o mesmo lugar no prompt que o resumo da matriz.

### G-013 — Causa contra derivado
`P0` · `V5` · decisão · dep: B-036, G-005

O GM escreve **causas**: condição, material de parte, presença de parte, substância. Nunca escreve valores derivados: capacidade, dor total, sangue total, temperatura corporal, estado de vida.

O motivo imediato é que escrever em campo derivado é apagado no recálculo seguinte. O efeito colateral é melhor que o motivo: para matar alguém, o GM precisa destruir uma parte vital, então morte narrativa nasce com a mesma cadeia causal auditável de qualquer outra.

**Aceite:** o validador rejeita qualquer mutação cujo caminho esteja marcado como derivado no schema.

### G-014 — Leis invioláveis
`P0` · `V4` · PDF 82-87 · dep: G-004

Regras do cenário que o GM não contorna, declaradas na geração e presentes em todo prompt de mediação. São uma das três causas legítimas de negação.

**Aceite:** uma ação que viola lei inviolável é negada com referência à lei.

### G-015 — Instruções do usuário
`P0` · `V4` · PDF 82-87 · dep: G-004

Orientações do usuário têm prioridade máxima sobre o julgamento do GM e aparecem no topo do prompt.

**Aceite:** uma instrução do usuário que proíbe algo prevalece sobre a postura permissiva.

### G-016 — Registro de plausibilidade
`P0` · `V5` · derivado de B-044 · dep: B-044

O cenário declara quais operações o GM pode escolher. A engine sempre suporta transmutar ossos; é o cenário que diz se este mundo permite. Vilarejo comum não permite; cenário sobrenatural permite.

Sem isso, o modelo julgaria o gênero do mundo a cada chamada, e deriva tonal é o modo de falha mais difícil de recuperar num GM de LLM.

**Aceite:** com o registro padrão, uma operação não autorizada é rejeitada antes de tocar o estado.

---

## Percepção e registro

### G-017 — Testemunhas
`P0` · `V4` · derivado de PDF 82-87 · dep: R-034, A-007

A resposta declara quem percebeu o evento e por qual sentido. Fumaça densa, escuridão e parede bloqueiam. Se ninguém viu, ninguém viu.

**Aceite:** um evento atrás de parede não gera testemunha, e um evento em cômodo iluminado gera testemunha para cada agente presente com linha de visão.

### G-018 — Proporcionalidade e impersonalidade
`P1` · `V4` · PDF 82-87 · dep: G-004

A consequência corresponde à ação e ao contexto, nem mais nem menos. O GM não tem opinião, emoção nem favoritismo: o mundo reage física e socialmente, não eticamente.

**Aceite:** numa amostra, ações moralmente carregadas não recebem consequência desproporcional à sua materialidade.

### G-019 — Candidato a marcante
`P1` · `V5` · derivado · dep: G-004, C-014

O GM sinaliza quando um desfecho é forte candidato a memória marcante — falha crítica em momento de vida ou morte, perda irreversível, violência presenciada.

É sinalização, não decisão: a seleção de marcantes (`C-014`) continua sendo do agente.

**Aceite:** um desfecho letal ou mutilante é sinalizado, e a sinalização eleva a chance de eleição sem forçá-la.

### G-020 — Justificativa auditável
`P0` · `V4` · decisão · dep: G-005

Toda mutação carrega justificativa. Em `engine_effect`, a justificativa precisa explicar **por que nenhuma regra existente cobria o caso**.

É o que torna a duplicação detectável em auditoria em vez de invisível.

**Aceite:** um `engine_effect` sem justificativa que cite a lacuna é rejeitado na validação.

---

## Promoção de regra

### G-021 — Promoção generalizada
`P0` · `V4` · decisão · dep: G-008, R-046, B-045

Ao invocar causação nova, o GM decide também se aquele julgamento **generaliza**: se o método deve virar regra sistêmica acionável por parâmetros do jogo sem LLM, ou se foi caso a caso.

É o mecanismo que faz o custo cair ao longo da partida em vez de ficar constante.

**Aceite:** toda resposta que invoca causação nova traz veredito de generalização preenchido.

### G-022 — Vocabulário fechado por domínio
`P0` · `V4` · decisão · dep: G-021

A regra proposta precisa ser expressável no vocabulário fechado do domínio que ela toca:

| Domínio | Forma da regra |
|---------|----------------|
| `substrate` | ocasião, condições em etiquetas, efeito nomeado, chance |
| `body` | operação, condição, seletor de parte |
| `social` | template de fato perceptível, viés de relação |
| `cognition` | tópico, `stance` resultante |
| `community` | template de norma, alvo mecânico permitido |

O GM nunca inventa primitiva nova de engine. Ele apenas combina as que existem.

**Aceite:** uma regra que cita efeito, operação ou alvo fora do vocabulário do seu domínio é rejeitada.

### G-023 — Queda forçada para caso único
`P0` · `V4` · decisão · dep: G-022

Se o julgamento não é expressável no vocabulário fechado, o veredito é **forçado** a caso único. Não há caminho pelo qual uma regra malformada entre na matriz.

**Aceite:** uma proposta que falha a validação de vocabulário é convertida em caso único e registrada como tal, sem erro de execução.

### G-024 — Regra provisória entra viva
`P0` · `V4` · decisão · dep: G-022

A regra aprovada na validação passa a valer **imediatamente**, marcada com autoria do GM, momento e julgamento de origem, e registrada no log causal.

Entrar viva na hora é o ponto: é isso que poupa as rechamadas. Uma fila de aprovação humana antes da ativação devolveria o custo que o mecanismo existe para eliminar.

**Aceite:** o mesmo método improvisado, repetido logo em seguida, resolve pela regra provisória sem nova chamada de GM.

### G-025 — Ciclo de vida da regra
`P1` · `V4` · decisão · dep: G-024

Quatro estados: proposta, provisória, permanente, rejeitada. O humano promove ou rejeita no painel. Rejeitar desativa a regra dali em diante, mas **não** desfaz os efeitos já causados por ela — o passado da simulação é imutável.

**Aceite:** rejeitar uma regra provisória impede disparos futuros e preserva o estado que ela já produziu.

### G-026 — Não-duplicação imediata
`P0` · `V4` · decisão · dep: G-024, R-044

Uma regra provisória recém-criada passa a contar para a proibição de duplicação no mesmo instante em que nasce, e entra no resumo da matriz (`G-010`) do próximo prompt.

Sem isso, o GM continuaria sendo chamado para o caso que ele mesmo acabou de resolver.

**Aceite:** após promover uma regra, o resumo da matriz do próximo prompt já a menciona.

### G-027 — Salvaguardas
`P1` · `V4` · decisão · dep: G-024

Teto de regras provisórias vivas simultaneamente; detecção de regra que dispara com frequência anômala; e conflito entre provisória e permanente resolvido sempre a favor da permanente.

**Aceite:** ultrapassar o teto impede novas promoções até que alguma seja revisada, e uma provisória que contradiz uma permanente nunca prevalece.

### G-028 — Dívida de matriz
`P1` · `V4` · derivado de R-045 · dep: G-021

Invocação recorrente do mesmo método é dívida: sinal de que falta regra determinística. O painel lista os métodos mais invocados que ainda não viraram regra.

É o único item de observabilidade do projeto que se paga em dinheiro.

**Aceite:** o mesmo método invocado três vezes sem promoção aparece no topo da lista de dívida.

---

## Operação

### G-029 — Trilha de auditoria
`P1` · `V4` · derivado · dep: G-020

Toda invocação registra intenção recebida, contexto enviado, resposta bruta, mutações aplicadas e mutações rejeitadas pelo validador.

**Aceite:** qualquer evento do mundo pode ser rastreado até a invocação que o causou, ou até a regra da matriz que o produziu.

### G-030 — Determinismo por replay
`P0` · `V0` · decisão · dep: X-002

Em modo replay, a mesma invocação devolve a mesma resposta a partir do cassete, sem chamada de rede.

**Aceite:** duas execuções em replay produzem sequência idêntica de mutações.

### G-031 — Custo do GM
`P0` · `V4` · decisão · dep: C-007, G-002

As invocações de GM debitam do orçamento do agente que agiu. Ao estourar, ações sem affordance falham por template diegético em vez de invocar o GM.

**Aceite:** um agente sem orçamento continua agindo por affordance e recebe retorno diegético ao tentar o que exigiria mediação.

### G-032 — Falha e reparo
`P0` · `V4` · derivado · dep: L-007

Resposta que não valida contra o schema passa por um passe de reparo. Persistindo a falha, a ação resolve por caminho determinístico degradado e o incidente é registrado.

**Aceite:** uma resposta malformada nunca trava a simulação nem aplica mutação parcial.

### G-033 — Timeline narrativa
`P2` · `V7` · PDF 82-87 · dep: G-005

As narrativas em terceira pessoa alimentam a linha do tempo e a exportação de log narrativo.

**Aceite:** a exportação de uma partida produz texto legível na ordem cronológica dos eventos.

### G-034 — Painel de instruções
`P1` · `V4` · PDF 82-87 · dep: G-015

O usuário edita as instruções ativas ao GM durante a simulação, com efeito a partir da próxima invocação.

**Aceite:** alterar a instrução muda o comportamento do GM sem reiniciar a simulação.

---

## Não-objetivos

**Memória em prosa do GM.** A coerência entre dias vem do estado do mundo, que é autoritativo na engine, e do log causal determinístico. Um resumo narrativo seria segunda fonte de verdade inflando o prompt mais chamado.

**GM como narrador onisciente.** Ele descreve consequência, não interioridade. O que os agentes pensam é da cognição.

**GM com agenda.** Nada de mestre que empurra história. A tensão vem dos agentes.

**Dois níveis de GM.** Um prompt. A alternativa ao GM é a engine, não um GM mais barato.
