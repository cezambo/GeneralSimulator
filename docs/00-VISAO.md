# Visão e Escopo

---

## 1. O que é

Um simulador de vida social em vista de cima, num mundo em grid com tiles, onde um número escolhido de agentes controlados por LLM vivem, percebem, pensam, formam memórias e opiniões, interagem entre si e com o ambiente, e evoluem psicologicamente ao longo de dias, estações e anos simulados.

Um Game Master invisível, também LLM, media toda tentativa de ação e altera o mundo para corresponder ao que os agentes tentam fazer.

O usuário observa, pausa, constrói, edita mentes e instrui o GM.

---

## 2. A tese

Simuladores sociais normalmente escolhem entre duas coisas ruins: comportamento escrito à mão, que é coerente mas previsível; ou comportamento aleatório, que surpreende mas não significa nada.

A tese aqui é que **coerência e surpresa saem juntas** se três coisas forem verdadeiras ao mesmo tempo:

1. O agente tem estado interno persistente e causal — o que ele viveu determina o que ele acredita, e o que ele acredita determina o que ele quer.
2. O mundo responde a quase tudo que ele tenta, em vez de recusar o que não estava previsto.
3. Nada disso é roteirizado, nem mesmo os momentos extremos.

Se a tese estiver certa, a narrativa não precisa ser escrita. Ela acontece.

---

## 3. O que faz este projeto diferente

**O GM é permissivo, não é porteiro.** A postura padrão é materializar. Diante de uma ação improvável, o GM prefere executar com custo, ou reinterpretar, antes de negar. Isso substitui a validação binária do documento original e é o que permite que um agente tente qualquer coisa.

**A engine decide o possível, a LLM decide a intenção.** Geometria, pathfinding, colisão e affordances são computados. O agente escolhe o que querer, nunca como calcular. Isso mantém a LLM fazendo o que ela faz bem e fora do que ela faz mal.

**Não há roteiro em lugar nenhum**, nem nas crises. Saúde mental afeta *como o agente raciocina e o que ele deseja*, jamais sobrescreve sua agência com uma sequência pré-planejada.

**Prompts são conteúdo, não código.** Trinta e poucos prompts em arquivos editáveis, com modelo escolhível por nível de pensamento. Ajustar comportamento em teste não recompila nada.

---

## 4. Para quem

**O criador.** Monta cenários, observa emergência, edita personalidades e memórias, constrói ambientes, ajusta prompts. Precisa de controle fino sem quebrar a simulação, e de entender *por que* algo aconteceu.

**O observador.** Aperta play e assiste. Precisa de leitura clara do que está acontecendo sem abrir painel nenhum.

**O experimentador.** Liga cones de visão, lê pensamentos crus, inspeciona traces de LLM, instrui o GM, exporta logs, compara rodadas.

São três modos do mesmo usuário, não três pessoas.

---

## 5. Casos de uso centrais

1. **Preparar** — informar quantidade de pessoas e, opcionalmente, descrever o cenário. Mundo, cidade e habitantes são gerados a partir disso.
2. **Simular** — agentes vivem ciclos diários autônomos, trabalham, conversam, mudam de ideia, perseguem objetivos.
3. **Intervir** — editar memória, personalidade ou meta de alguém; arrastar pessoas e objetos; construir e demolir.
4. **Pressionar** — instruir o GM, provocar escassez, introduzir um evento e observar a resposta coletiva.
5. **Investigar** — abrir uma mente, ler a cascata de memórias, ver qual opinião rompeu e qual meta isso invalidou.

---

## 6. Definição de sucesso

O projeto funciona quando, numa sessão de trinta minutos, acontece pelo menos um evento que o criador não previu, que ele consegue explicar rastreando o estado dos agentes, e que faz sentido em retrospecto.

Falha silenciosa a evitar: agentes coerentes mas inertes, que nunca surpreendem. É pior do que agentes caóticos, porque parece que está funcionando.

---

## 7. Métricas honestas

Só o que dá pra medir de verdade:

| O que | Como | Alvo |
|-------|------|------|
| Eventos significativos | contagem de marcantes por agente por dia simulado | ≥ 1 |
| Rupturas de opinião | contagem por agente por estação, e se mudaram comportamento observável | > 0 |
| Coerência de persona | leitura manual amostrada de 20 pensamentos, julgados contra a ficha | maioria aprovada |
| Custo por dia simulado | soma real das chamadas | dentro do teto configurado |
| Reprodutibilidade | duas execuções em replay com mesma seed | estado final idêntico |

Deliberadamente ausentes: prazos em meses e percentuais de qualidade. Não há base para estimá-los, e números inventados atrapalham mais do que ajudam.

---

## 8. Não-objetivos

Fora de escopo, com a razão:

| Não faremos | Por quê |
|-------------|---------|
| Multiplayer ou rede | não serve à tese |
| 3D ou animação elaborada | o custo visual não retorna em emergência narrativa |
| Economia com moeda, mercado e preços | complexidade alta, ganho narrativo baixo no início |
| Árvore de crafting profunda | o GM cobre combinação de itens sem sistema dedicado |
| Modding por terceiros | a arquitetura não impede, mas nada será exposto como API pública |
| Combate tático detalhado | conflito existe, mas a escolha é de agência, não de posicionamento fino |
| Geração de sprites por IA | arte é placeholder até que o resto funcione |

---

## 9. Restrições assumidas

- Máquina única, local. Sem servidor.
- Chave de API fornecida pelo usuário.
- Testes rodados majoritariamente em modelos abertos baratos, o que impõe prompts tolerantes a modelo fraco.
- Desenvolvimento conduzido por agentes de IA, o que impõe requisitos fechados e verificáveis.
- Português do Brasil como idioma diegético e de interface.

---

## 10. Princípio de projeto

Elegância e eficiência são meta geral. Onde a mecânica exige complexidade — o ciclo de dissonância, a cascata de memória, a máquina de conversa multi-agente — a complexidade é aceita sem disfarce, porque reduzi-la destruiria o comportamento que justifica o projeto.

O que não se aceita é complexidade **acidental**: quatro prompts onde um parametrizado resolve, dois lugares definindo o mesmo contrato, número mágico espalhado pelo código, ou camada de indireção que não paga o próprio custo.

Na dúvida entre cobrir mais ou aprofundar menos, cobrir mais — desde que cada item coberto seja fechado e verificável.
