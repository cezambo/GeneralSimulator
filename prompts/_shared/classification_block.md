# Bloco compartilhado — classificação de dissonância

⚑ **Isto é um bloco, não um prompt.** Não tem entrada no registro, não tem tier e não é chamado sozinho. Ele é incluído por quem já está lendo o material necessário:

- `social.post_conversation` — a quente, ao fim da conversa
- `cognition.nightly_appraisal` — no lote noturno

Era o prompt `cognition.dissonance_classifier`, aposentado por `C-025` quando as duas cadências foram fundidas nos dois hospedeiros. Nos dois momentos, outra chamada já lia as mesmas impressões contra as mesmas opiniões um instante antes, e a chamada separada existia só para renderizar o mesmo contexto de novo.

O bloco **não declara variáveis**. Cada hospedeiro monta as próprias seções de dados, porque o que muda entre os dois é justamente de onde as impressões vêm: num caso o próprio modelo acabou de escrevê-las, no outro elas vêm do dia.

**Por que continua importando:** é o único ponto do sistema que decide se uma experiência **contradiz** ou **reforça** uma crença. Sem ele o buffer de dissonância nunca enche, a ruptura (`cognition.opinion_burst`) nunca dispara, e a revisão reativa de metas (`cognition.goal_revise`) nunca acontece.

---

Compare as experiências com as crenças atuais desta pessoa e classifique a relação entre elas.

Para cada par de experiência e crença que tiver relação relevante, classifique como:

- **conflito** — a experiência contradiz a crença
- **sinergia** — a experiência confirma a crença

Regras:

1. **Só reporte pares com relação real.** A maioria dos pares não tem relação nenhuma. Omita esses. Se nenhuma experiência tiver relação com nenhuma crença, devolva a lista vazia — é resposta válida e comum.
2. **Uma experiência pode afetar várias crenças.**
3. **Viés de confirmação.** Teimosia alta favorece sinergia nos casos ambíguos; flexibilidade alta favorece conflito.
4. **Intensidade** de 1 a 3: 1 é evidência fraca, 3 é evidência frontal.
5. Justificativa curta — no máximo uma oração por par.

Você classifica **todas** as experiências contra **todas** as crenças relevantes de uma vez. Julgar par a par multiplicaria o custo por N×M, e é por isso que as crenças já chegam pré-filtradas por tópico.

---

## Notas de teste

- **Excesso de classificações** é o modo de falha mais comum em modelo fraco. Se aparecer, reforce a regra 1 com exemplo negativo no hospedeiro.
- `intensity` alimenta quantas entradas vão para o buffer. Considere somar intensidade em vez de contar entradas.
- Nos dois hospedeiros a classificação divide a resposta com outra tarefa, e é essa divisão que quebra primeiro num tier pequeno. O sintoma é classificação que ignora as impressões da própria resposta. O recuo está descrito em `C-025`.

**minTierTestado:** _(preencher no primeiro playtest)_
