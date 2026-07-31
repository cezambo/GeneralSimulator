# SPEC-S — Interação

Conversa, comunidade e conflito. É onde a cognição de um agente encontra a de outro e vira acontecimento social.

A mente que entra na conversa está em [SPEC-C](SPEC-C-cognicao.md). O corpo que ela percebe está em [SPEC-B](SPEC-B-corpo.md). A mediação das ações que ela produz está em [SPEC-V](SPEC-V-validador.md).

---

## Princípio de custo

Conversa é o gasto mais concentrado do projeto: uma conversa de cinco turnos entre três agentes custa mais chamadas do que um dia inteiro de pensamento de um agente. Três disciplinas contêm isso:

**A engine decide quem pode falar; o modelo decide o que se diz.** Elegibilidade, distância, bloqueadores e orçamento de turnos são determinísticos.

**Conflito não tem prompt próprio.** Briga é ação decidida no pensamento normal e mediada pelo Validador. Grito é fato perceptível gerado pela engine, não chamada por ouvinte.

**O pós-conversa é um lote, não um laço.** Impressões de todos os participantes viram uma passagem pelo classificador de dissonância, não uma por par.

---

## Conversa

### S-001 — Instância de conversa
`P0` · `V6` · PDF 484-495 · dep: A-001, A-010

Conforme `ConversationInstance`. Objeto temporário com participantes, transcrição, contagem de turnos, local e estado. Existe enquanto a conversa dura e é destruído ao encerrar, deixando apenas o payload.

Enquanto participa, o agente carrega a flag `in_conversation` e não recebe pensamento agendado.

**Aceite:** iniciar uma conversa cria a instância, marca os participantes, e encerrá-la libera todos sem resíduo de estado.

### S-002 — Handshake
`P0` · `V6` · PDF 484-490 · dep: S-001 · prompt: `social.handshake`

Antes de abrir conversa, o alvo aceita ou recusa, com motivo curto e fala de abertura opcional.

A checagem determinística vem **antes**: distância, flags, bloqueadores rígidos e orçamento. O modelo só é consultado quando o encontro é fisicamente possível e resta genuína escolha social.

**Aceite:** tentar conversar com quem está fora de alcance ou dormindo é recusado sem nenhuma chamada de LLM.

### S-003 — Bloqueadores rígidos
`P0` · `V6` · PDF 491-493 · dep: S-002

Combate, inconsciência, sono, morte e emergência corporal impedem conversa incondicionalmente. Não há negociação nem chamada.

**Aceite:** cada bloqueador rejeita a abertura de conversa de forma determinística.

### S-004 — Iniciativa
`P1` · `V6` · derivado de PDF 484-490 · dep: S-002, A-029

Quem inicia é decidido no pensamento normal, como qualquer ação. A propensão a iniciar é inclinada por extroversão, pelo sentimento com o alvo e por tópico não resolvido pendente (`S-011`).

**Aceite:** numa amostra, agentes extrovertidos iniciam mais conversas que introvertidos nas mesmas condições.

### S-005 — Turnos alternados
`P0` · `V6` · PDF 494-500 · dep: S-001 · prompt: `social.conversation_turn`

A conversa avança em turnos, um participante por vez, cada turno recebendo a transcrição acumulada e o orçamento restante. Um turno é uma chamada.

**Aceite:** a ordem dos turnos é determinística e cada turno vê tudo o que foi dito antes dele.

### S-006 — Orçamento de turnos
`P0` · `V6` · PDF 494-500 · dep: S-005, A-022

O número máximo de turnos é calculado antes de começar, a partir da média de habilidade social dos participantes e do número deles. É o teto de custo da conversa e é declarado em `tuning.json`.

**Aceite:** uma conversa nunca excede o teto calculado, e o teto é visível no painel antes do primeiro turno.

### S-007 — Extensão de turnos
`P1` · `V6` · derivado de PDF 494-500 · dep: S-006

Um participante pode pedir extensão. Concedida no máximo uma vez por conversa e apenas se houver orçamento global de chamadas disponível.

**Aceite:** o segundo pedido de extensão na mesma conversa é negado deterministicamente.

### S-008 — Encerramento
`P0` · `V6` · PDF 494-500 · dep: S-005

A conversa termina por esgotamento de turnos, por pedido explícito de um participante, por afastamento físico ou por bloqueador rígido superveniente.

**Aceite:** cada uma das quatro causas encerra a conversa e produz o payload pós-conversa.

### S-009 — Proposta de realocação
`P2` · `V6` · PDF 501-508 · dep: S-005

Um participante propõe mover a conversa para outro lugar, com destino e motivo.

**Aceite:** a proposta registra destino e motivo e suspende o avanço de turnos até a votação.

### S-010 — Votação de realocação
`P2` · `V6` · PDF 501-508 · dep: S-009 · prompt: `social.relocation_vote`

Cada outro participante aceita ou recusa; recusa exige explicação, que vira fala na transcrição. Unanimidade move a conversa; qualquer recusa a mantém no lugar.

**Aceite:** uma recusa impede a mudança e a explicação aparece como turno na transcrição.

### S-011 — Tópico não resolvido
`P1` · `V6` · derivado de PDF 494-500 · dep: S-012

Conversa encerrada com assunto em aberto registra o tópico e gera inclinação a retomar com o mesmo interlocutor.

É o que faz uma discussão interrompida voltar, em vez de sumir porque o orçamento acabou.

**Aceite:** um tópico não resolvido eleva a propensão de iniciativa daquele par nos ciclos seguintes.

### S-012 — Payload pós-conversa
`P0` · `V6` · PDF 509-516 · dep: S-008 · prompt: `social.post_conversation`

Ao encerrar, cada participante produz impressões cruas e deltas de sentimento pelos demais. É a ponte da conversa para a cognição.

**Aceite:** encerrar uma conversa produz, para cada participante, impressões identificadas e um delta por interlocutor.

### S-013 — Delta de sentimento
`P0` · `V6` · PDF 509-516 · dep: S-012, A-029

O delta de −10 a +10 é aplicado imediatamente à relação numérica. A opinião social textual só muda por ruptura (`C-029`), não por delta.

Separar os dois é o que permite ao agente gostar menos de alguém sem mudar o que pensa dele — e é a pressão que acaba rompendo a crença.

**Aceite:** um delta negativo altera o número na hora e deixa a nuance textual intacta.

### S-014 — Impressões alimentam a dissonância
`P0` · `V6` · decisão · dep: S-012, C-025

As impressões que um participante tirou da conversa entram **todas numa** passagem pelo classificador de dissonância, com pré-filtro por tópico (`C-030`). Uma passagem por participante, e dentro dela todas as impressões daquela pessoa de uma vez.

A unidade é o participante, e não a conversa, porque o classificador julga impressão contra **as opiniões de quem teve a impressão**. Uma passagem única para a mesa inteira teria de carregar as opiniões de todos os presentes no mesmo contexto, e o modelo passaria a decidir contra crenças de várias pessoas ao mesmo tempo — o que não é caro, é errado. O que `C-025` economiza é a explosão de pares: seis impressões contra vinte opiniões são uma chamada e não cento e vinte. O número de participantes multiplica; o número de pares, não.

**Aceite:** uma conversa de três participantes gera três chamadas de classificação, uma por participante, e não uma por par de impressão e opinião.

---

## Presença e escuta

### S-015 — Conversa multiparte
`P1` · `V6` · PDF 484-495 · dep: S-001

Mais de dois participantes na mesma instância, com teto declarado. O orçamento de turnos considera o número de participantes.

**Aceite:** três agentes conversam na mesma instância e cada um recebe a fala dos outros dois.

### S-016 — Entrada e saída
`P2` · `V6` · derivado · dep: S-015

Um agente se junta a uma conversa em andamento ou sai dela sem encerrá-la, desde que respeitado o teto de participantes.

**Aceite:** quem entra recebe a transcrição corrente; quem sai gera payload próprio sem encerrar a conversa dos demais.

### S-017 — Escuta por terceiros
`P1` · `V6` · derivado de PDF 512-516 · dep: A-009, S-005

Quem está dentro do raio de audição percebe a fala como **fato perceptível**, sem participar nem gastar chamada. O fato entra na percepção e pode virar impressão no próximo pensamento.

É o que permite fofoca, flagrante e mal-entendido sem nenhum sistema dedicado.

**Aceite:** um agente próximo a uma conversa da qual não participa registra o que foi dito como percepção, sem chamada de LLM.

### S-018 — Fala pública e privada
`P2` · `V6` · derivado · dep: S-017

A fala declara alcance. Sussurro reduz o raio; grito o amplia. O alcance determina quem recebe o fato perceptível.

**Aceite:** um sussurro não é registrado por quem está fora do raio reduzido.

### S-019 — Orçamento social
`P0` · `V6` · decisão · dep: S-006, C-007

As chamadas de conversa debitam do mesmo orçamento diário do agente que o pensamento. Ao se aproximar do teto, o agente recusa handshakes não urgentes antes de degradar o pensamento.

Conversa é o gasto que mais facilmente estoura o dia. O agente precisa poder ficar quieto por economia.

**Aceite:** um agente próximo do teto recusa abertura de conversa e o motivo aparece no painel.

---

## Comunidade

### S-020 — Assembleia
`P1` · `V7` · PDF 525-540 · dep: S-015

Reunião de todos os agentes conscientes e disponíveis, convocada por evento grave ou por cadência.

**Aceite:** convocar assembleia reúne todos os elegíveis e exclui inconscientes, mortos e ausentes.

### S-021 — Comitê
`P1` · `V7` · PDF 525-540 · dep: S-020, A-022

Reunião restrita aos agentes de maior habilidade no tema. O critério de seleção é determinístico e lê do sistema de habilidades.

**Aceite:** um comitê de medicina convoca os agentes de maior habilidade médica, sem chamada de LLM na seleção.

### S-022 — Convocação
`P1` · `V7` · derivado · dep: S-020

Agentes convocados interrompem a rotina e se deslocam ao local da reunião. Quem não pode comparecer fica registrado como ausente.

**Aceite:** a convocação altera o destino dos convocados e registra ausências com motivo.

### S-023 — Turno de reunião
`P1` · `V7` · PDF 525-540 · dep: S-020 · prompt: `community.meeting_turn`

Turnos de reunião usam o mesmo contrato de fala da conversa, com contexto adicional de leis vigentes e estado da colônia.

**Aceite:** um turno de reunião produz fala válida contra o mesmo schema do turno de conversa.

### S-024 — Ata
`P0` · `V7` · PDF 525-545 · dep: S-023 · prompt: `community.meeting_verdict`

Ao fim da reunião, uma chamada produz a ata: narrativa do consenso, operações sobre metas comunitárias, mudanças mecânicas, leis novas e dissidências registradas.

**Aceite:** uma reunião produz exatamente uma ata, e a ata é a única saída que altera estado comunitário.

### S-025 — Lei da comunidade
`P1` · `V7` · PDF 541-545 · dep: S-024

Conforme `CommunityLaw`. Norma vigente com texto, momento de promulgação e reunião de origem. Entra no contexto dos agentes e do Validador.

**Aceite:** uma lei promulgada aparece no contexto de pensamento dos agentes e no do Validador a partir do ciclo seguinte.

### S-026 — Efeito mecânico da lei
`P2` · `V7` · PDF 541-545 · dep: S-025

Uma lei pode alterar parâmetro declarado da simulação, dentro de um conjunto fechado de alvos permitidos. Fora desse conjunto, a lei é apenas texto que orienta comportamento.

O conjunto fechado é o que impede uma assembleia de reescrever a física.

**Aceite:** uma lei que altera alvo permitido muda o parâmetro; uma que cita alvo não permitido é promulgada como norma textual sem efeito mecânico.

### S-027 — Dissidência
`P1` · `V7` · derivado de PDF 525-545 · dep: S-024

Quem discorda fica registrado na ata com motivo. A dissidência vira impressão para o dissidente e para quem a testemunhou.

**Aceite:** um dissidente registrado gera impressão sobre a decisão e sobre quem a defendeu.

### S-028 — Metas comunitárias
`P1` · `V7` · PDF 525-540 · dep: S-024, C-034

A ata adiciona, remove ou altera metas da comunidade, que entram no contexto dos agentes e inclinam a meta terciária conforme a função.

**Aceite:** uma meta comunitária nova aparece no contexto e influencia a meta do dia dos agentes cuja função a serve.

### S-029 — Violação de lei
`P2` · `V7` · derivado · dep: S-025

Agir contra lei vigente é permitido — a lei não é restrição de engine. A violação, quando percebida, é fato perceptível e gera impressão nos que viram.

Lei que a engine impõe não produz drama. Lei que se pode quebrar, e cuja quebra é vista, produz.

**Aceite:** violar uma lei não é bloqueado pela engine e gera impressão em cada testemunha.

---

## Conflito

### S-030 — Conflito sem prompt dedicado
`P0` · `V6` · decisão · dep: C-001, V-001

Agressão, defesa e fuga são decididas no pensamento normal, como qualquer ação, e mediadas pelo Validador quando não há affordance. Não existe prompt de escolha tática nem de narração de combate.

O documento de visão lista combate tático detalhado como não-objetivo. Conflito aqui é escolha de agência — atacar, fugir, intervir, assistir — não posicionamento.

**Aceite:** uma agressão completa percorre pensamento e Validador pelo mesmo caminho de qualquer outra ação, sem prompt específico de combate.

### S-031 — Grito como fato perceptível
`P0` · `V6` · decisão · dep: A-009, S-017

O grito é gerado pela engine como fato perceptível num raio ampliado, com texto vindo da fala do agente. **Não há chamada de LLM por ouvinte.**

Uma chamada por ouvinte por grito significa até nove chamadas num único instante de combate, que é justamente quando a latência mais importa.

**Aceite:** um grito com nove ouvintes gera zero chamada de LLM e nove fatos perceptíveis.

### S-032 — Viés de relação na escuta
`P1` · `V6` · decisão · dep: S-031, A-029

O fato perceptível do grito chega ao ouvinte acompanhado de um viés derivado do sentimento com quem gritou: inclinação a obedecer, ignorar ou contrariar. O pensamento normal do ouvinte interpreta o fato já enviesado.

**Aceite:** o mesmo grito produz viés oposto em dois ouvintes com sentimentos opostos pelo emissor, sem chamada extra.

### S-033 — Testemunho de violência
`P1` · `V6` · derivado · dep: S-030, R-034

Quem vê violência registra fato perceptível sujeito a visão, luz e oclusão. Quem não viu não sabe, mesmo estando perto.

**Aceite:** um agente do outro lado de uma parede não registra a agressão; um no mesmo cômodo iluminado registra.

### S-034 — Fuga
`P1` · `V6` · derivado · dep: S-030, B-014

Fugir é ação normal, inclinada por medo, dor, consciência e sentimento pelo agressor. Não é estado especial de máquina.

**Aceite:** um agente ferido diante de agressor temido escolhe fuga com frequência mensuravelmente maior que um saudável.

### S-035 — Consequência social da violência
`P0` · `V6` · decisão · dep: S-033, C-025

Violência testemunhada vira impressão de alta intensidade contra as opiniões sobre o agressor e sobre a vítima, e é forte candidata a marcante.

É onde o físico vira social: o sangue que não foi lavado (`B-032`) acusa depois, e a testemunha muda de opinião sem que ninguém escreva a cena.

**Aceite:** presenciar uma agressão gera impressão de intensidade máxima contra as opiniões sobre os envolvidos.

### S-036 — Intervenção de terceiros
`P2` · `V6` · derivado · dep: S-033, S-030

Testemunhar violência é gatilho reativo de pensamento. Intervir, chamar ajuda ou não fazer nada são decisões normais, e a omissão também é percebida por quem estava lá.

Quem assistiu sem agir vira assunto. Isso não precisa de sistema.

**Aceite:** uma agressão presenciada dispara pensamento reativo nas testemunhas no mesmo ciclo.

---

## Fronteira com o Validador

O Validador medeia as ações que a interação produz, não a interação em si. Ele não escreve fala, não decide quem fala e não altera transcrição.

A promoção de regra no domínio `social`, especificada em [SPEC-V](SPEC-V-validador.md), permite que um julgamento vire template de fato perceptível com viés de relação — o mesmo mecanismo do grito, generalizado para outros gestos que se repetem.

---

## Não-objetivos

**Combate tático detalhado.** Sem grade de iniciativa, alcance de arma, cobertura ou cálculo de acerto por membro. Conflito é agência.

**Rede social explícita.** Não há grafo de facções, clãs ou alianças. Grupo é consequência de opiniões convergentes, não estrutura declarada.

**Linguagem e barreira idiomática.** Todos se entendem.

**Economia e comércio.** Troca de posse existe (`A-026`); preço, moeda e mercado não.
