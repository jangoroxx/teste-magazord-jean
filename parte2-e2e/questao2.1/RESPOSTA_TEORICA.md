# Questão 2.1 – Fluxo de Checkout

## 2.1.a) Garantir que cada execução use um cupom válido diferente

O princípio é **nunca depender de dados "compartilhados e consumíveis"**. Em ordem de preferência:

1. **Gerar o cupom no `beforeEach` via API/seed** (endpoint administrativo, *factory* ou script no banco de testes), com código único (prefixo + UUID/timestamp), validade e regra "uso único". No `afterEach`, remover ou invalidar o cupom.
2. **Paralelismo:** como cada worker roda em paralelo, o cupom é criado por teste (ou por worker, usando `testInfo.workerIndex`), nunca um valor fixo no código.
3. **Se não houver API para criar cupons:** um *pool* pré-carregado, com reserva atômica (cada teste "retira" um cupom do pool) e rotina de reposição.
4. **Ambiente resetável:** banco de testes com snapshot/restore ou *containers* descartáveis, para a massa voltar ao estado inicial.

Além do caminho feliz, testo deliberadamente o cenário **"cupom já utilizado"**: consumo o cupom e tento usá-lo de novo, esperando a rejeição.

> Observação: o SauceDemo não possui cupom nem pagamento. No teste prático apliquei o mesmo princípio aos dados que existem lá (nome, sobrenome e CEP gerados dinamicamente com Faker a cada execução).

## 2.1.b) Validar a confirmação do pedido sem depender de e-mail real

Valido o **resultado** e não o provedor de e-mail:

- **UI:** mensagem/número de confirmação exibidos na tela final.
- **API/Banco:** consulto o pedido criado (status, itens, total, cupom aplicado) para garantir que o que a tela mostrou foi realmente persistido.
- **E-mail:** uso uma caixa de e-mail falsa no ambiente de teste (Mailpit, MailHog, Mailtrap ou Ethereal), consultável por API, e valido destinatário, assunto e conteúdo (número do pedido, valores). Alternativas: validar a mensagem publicada na fila/evento de "pedido confirmado" ou mockar o provedor (SES/SendGrid) e checar o payload enviado.

O objetivo é testar que o sistema **dispara** a notificação certa com o conteúdo certo, de forma determinística e sem enviar e-mails de verdade.
