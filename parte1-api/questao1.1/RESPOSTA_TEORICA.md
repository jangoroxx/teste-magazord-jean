# Questão 1.1 – Rate Limiting e Autenticação com Token

## 1.1.a) Como estruturar os testes de rate limiting e o comportamento ao exceder o limite

Eu começaria pelo mais barato, que é olhar os headers em uma chamada real. Verifico se `X-RateLimit-Limit`, `X-RateLimit-Remaining` e `X-RateLimit-Reset` vieram, se são numéricos e se fazem sentido: `remaining` entre 0 e o limite, `reset` no futuro, limite de 60 sem autenticação e de pelo menos 5000 com token. Também comparo duas chamadas seguidas, porque dentro da mesma janela o `remaining` não pode aumentar.

Para testar o limite estourado eu não gastaria o limite real da GitHub API. É lento, deixa o teste instável e atrapalha quem usa o mesmo IP, inclusive o CI. Por isso simulei a resposta, `403` com `remaining = 0` ou `429` com `Retry-After`, e testei se o cliente reconhece o rate limit, se não o confunde com um `403` de permissão (em que o `remaining` ainda é maior que zero) e se calcula certo o tempo de espera. São os testes marcados com `[mock]`. Em um cliente real eu também testaria o backoff, ou seja, se ele espera em vez de tentar de novo na hora. Isso eu não implementei aqui.

Estourar o limite de verdade eu deixaria para um teste separado, marcado como `@slow` e rodando só à noite, em um ambiente nosso com limite baixo e credencial própria. Ali dá para percorrer o ciclo inteiro: estourar, receber o erro, passar a janela (com o relógio controlado, para não ficar esperando) e voltar a ser atendido.

Quando o limite é excedido, eu confiro o status, o corpo do erro e se `Retry-After` e `Reset` batem. Confiro também se nenhuma operação se perdeu ou foi duplicada e se o bloqueio vale só para aquela chave ou IP, já que um consumidor não pode derrubar o outro.

## 1.1.b) Obter e reutilizar o token entre os testes

Criei a classe `TokenManager`, em `utils/api-helper.js`, que guarda o token em memória. O `getToken()` só faz login quando ainda não há token ou quando o atual venceu. Quem precisa fazer uma chamada autenticada usa o `authedGet()`, que já monta o header `Authorization: Bearer <token>`.

Um cuidado que tomei foi com pedidos simultâneos. Se vários testes pedem o token ao mesmo tempo, todos esperam a mesma Promise e acontece um login só (o chamado *single-flight*). Sem isso, seria fácil esbarrar no limite de login e ter testes falhando de forma intermitente.

Em um projeto maior eu levaria a mesma ideia para um `globalSetup`, que autentica uma vez e salva em arquivo, ou para uma fixture com escopo de worker. Assim cada worker tem o seu token e não precisa logar a cada teste.

## 1.1.c) Detectar expiração e tratar o cenário

Uso duas abordagens juntas. Na primeira, o cliente sabe quando o token vence (`expiresAt`) e renova um pouco antes, com uma margem de segurança (`safetyMs`).

A segunda cobre o caso em que o servidor recusa o token mesmo assim. Ao receber um `401`, o cliente renova e repete a requisição uma única vez. Se vier outro `401`, ele devolve o erro para quem chamou e não entra em loop, porque aí o problema provavelmente é a credencial, e não a expiração. Existe ainda o `401` que chega atrasado, de um token que outra requisição já renovou. Nesse caso o cliente não faz outro login, só repete com o token atual.

Para não esperar 2 minutos em cada teste, o relógio (`now`) pode ser passado de fora: avanço o tempo e verifico se o novo login aconteceu. Também testei o servidor invalidando o token antes do prazo. Como o ReqRes devolve um token fixo que nunca expira, essa parte é simulada com um TTL curto e um cliente falso que responde `401`. Deixei isso registrado no README.
