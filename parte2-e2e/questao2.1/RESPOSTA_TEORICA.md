# Questão 2.1 – Fluxo de Checkout

## 2.1.a) Garantir que cada execução use um cupom válido diferente

Cupom de uso único não combina com valor fixo no código: passa na primeira execução e quebra na segunda. O que eu faria é criar o cupom no `beforeEach`, por uma API administrativa ou direto no banco de testes, com um código único (um prefixo mais UUID ou timestamp), validade e a regra de uso único. No `afterEach`, o teste apaga ou invalida o que criou. Como cada teste tem o seu cupom, eles podem rodar em paralelo sem um usar o do outro. Se fosse caro criar um por teste, eu prepararia um conjunto por worker, usando o `testInfo.workerIndex`.

Se não houvesse como criar cupons, eu manteria uma lista pré-carregada, da qual cada teste retira um. Essa retirada precisa ser atômica, para dois testes não pegarem o mesmo, e a lista precisa de uma rotina de reposição. Outra saída é restaurar o banco de testes a partir de um snapshot, ou subir um container descartável a cada execução.

Além do caminho feliz, vale testar o cupom já utilizado: uso uma vez, tento de novo e espero a rejeição.

> O SauceDemo não tem cupom nem pagamento. No teste prático apliquei a mesma ideia ao que existe lá: nome, sobrenome e CEP são gerados com Faker a cada execução.

## 2.1.b) Validar a confirmação do pedido sem depender de e-mail real

Primeiro olho a tela final: a mensagem de confirmação e o número do pedido. Só que a tela pode mostrar sucesso sem o pedido ter sido gravado, então consulto também a API ou o banco e confiro status, itens, total e cupom aplicado.

Para o e-mail, eu usaria uma caixa falsa no ambiente de teste, como Mailpit ou Mailtrap, que dá para consultar por API. Ali verifico destinatário, assunto e conteúdo, principalmente o número do pedido e os valores. Se isso não for possível, dá para verificar a mensagem de "pedido confirmado" na fila, ou mockar o provedor (SES, SendGrid) e conferir o que seria enviado.

A entrega do e-mail fica com o provedor. O que nos cabe garantir é que o sistema disparou a notificação certa, com o conteúdo certo, para a pessoa certa.
