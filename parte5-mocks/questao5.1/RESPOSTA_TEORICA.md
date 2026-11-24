# Questão 5.1 – Mocks de APIs Externas (teórica)

Contexto: integração com marketplaces (Mercado Livre, Amazon) para publicar produtos, atualizar preço, processar pedidos e atualizar estoque.

## 5.1.a) Testar sem afetar os ambientes reais

Antes de tudo eu verificaria o que cada marketplace oferece, porque nem todos têm um sandbox separado.

No Mercado Livre, a documentação fala em usuários de teste, criados com o token da conta e informando o país. Não encontrei menção a uma URL de sandbox: o teste acontece na própria plataforma. É preciso ao menos um vendedor e um comprador, e há algumas regras:

- o limite é de 10 usuários de teste por conta;
- quem fica 60 dias sem atividade (comprar, perguntar, publicar) é removido;
- esses usuários só compram, vendem e perguntam em itens de teste, que são removidos periodicamente;
- os anúncios devem ficar na categoria "Others" e nunca em "gold" ou "gold_premium", para não aparecerem na home.

Como usuários e itens podem sumir, eu automatizaria a criação deles em vez de depender de um cadastro manual.

A Amazon (SP-API) tem um endpoint de sandbox com respostas simuladas para parte das operações. Serve para conferir o formato das requisições e respostas, mas não reproduz estoque, filas e limites reais.

Um erro nosso no Mercado Livre, como um loop de publicação, ainda consome rate limit de verdade e pode bloquear a aplicação. Por isso eu usaria mocks em todo PR e deixaria as contas de teste para poucos smoke tests periódicos, que confirmam se os mocks ainda representam a API.

Também criaria uma aplicação só para homologação no DevCenter, vinculada apenas aos usuários de teste e com credenciais nos secrets do CI. A credencial de produção não deve nem existir no CI, e uma lista de hosts permitidos impede uma chamada por engano. O que for criado em teste leva um prefixo reconhecível e é apagado no final.

## 5.1.b) Estratégia de mock e ferramentas

Nos testes de unidade, eu substituiria o cliente do marketplace por um stub ou fake. Nos de integração, subiria um servidor de mock e apontaria a URL base para ele, de modo que o sistema faça chamadas HTTP de verdade.

Para esse servidor, escolheria o WireMock. Ele não depende da linguagem do backend, roda em Docker e permite simular estado, atraso, timeout e conexão cortada, que é o que mais interessa em uma integração assim.

O MSW é muito bom para JavaScript, mas intercepta as chamadas dentro do processo, então não atende um backend em outra linguagem. O JSON Server serve para um protótipo ou CRUD simples e é fraco para simular falhas. Mockoon e Prism ajudam quando já existe uma especificação OpenAPI para gerar o mock.

Para o mock não se afastar da API real, eu gravaria respostas do sandbox ou das contas de teste como ponto de partida, versionaria os stubs e os revisaria quando o marketplace mudasse alguma coisa.

## 5.1.c) Simulação de erro 500, timeout e 429

**Erro 500.** O mock responde `500` de duas formas: só algumas vezes, e depois sempre. Espero novas tentativas com backoff exponencial e jitter, até um limite. O ponto mais importante é não duplicar pedido nem anúncio. Quando as tentativas acabam, o estado tem que ficar consistente, com log e alerta.

**Timeout.** O mock demora mais que o timeout do cliente. Verifico se a requisição é cancelada no tempo configurado, se repetir é seguro, se a fila continua andando e se o usuário recebe uma mensagem coerente. Se a falha persistir, o circuit breaker deve abrir.

**429.** O mock responde `429` com `Retry-After`. A documentação cita o erro `local_rate_limited`, pedindo para tentar de novo em alguns segundos. O sistema precisa esperar esse tempo, segurar as próximas chamadas em fila e registrar uma métrica. Se houver disputa, pedidos passam na frente de atualização de preço.

A pergunta não cita o 401 e o 403, mas eu os incluiria porque são fáceis de tratar errado.

**401, token expirado.** A documentação fala em 6 horas, mas o exemplo de resposta traz `expires_in: 10800`, que são 3. Então o código deve usar o valor que vier na resposta, e não um número fixo. O `refresh_token` vale 6 meses e só pode ser usado uma vez, já que cada renovação devolve um novo. Por isso o novo precisa ser salvo antes de usar o novo `access_token`, e duas renovações não podem acontecer ao mesmo tempo: reutilizar o antigo gera `invalid_grant` (400). Depois de renovar, a requisição é repetida uma única vez. Se a renovação for recusada, o erro deve deixar claro que é preciso autorizar de novo.

**403, sem permissão.** Acontece, por exemplo, ao usar o token de outro usuário, e há relatos de `403` em buscas públicas de anúncios. Ao contrário do 429, repetir não resolve. O sistema deve parar, gerar alerta e mostrar uma mensagem clara.

## 5.1.d) Validação de payload (schema validation)

Eu validaria os dois lados com JSON Schema ou OpenAPI, usando Ajv ou Zod. No que enviamos, o teste compara a requisição recebida pelo mock com o schema. No que recebemos, valida a resposta antes de o sistema usá-la.

No pipeline, isso entra nos testes de integração de cada PR, contra o mock, porque é rápido. À noite, rodaria a mesma validação contra o sandbox ou as contas de teste, para descobrir se a API mudou e o mock ficou para trás.

Os schemas ficam versionados no repositório. Seriam rigorosos com campos obrigatórios e tipos, mas aceitariam campos extras na resposta. Se o marketplace só acrescentar um campo novo, nosso teste não tem motivo para quebrar.

## 5.1.e) Mock vs. contract testing

O mock testa o nosso código contra aquilo que acreditamos que a API faz. É rápido, previsível e ótimo para simular falhas. O risco é a API real mudar e os testes continuarem passando.

O contract testing cobre esse ponto, verificando se o que acreditamos bate com a realidade. Ferramentas como o Pact funcionam muito bem quando controlamos os dois lados, como um front e a nossa própria API.

Com Mercado Livre e Amazon não é o caso, porque não controlamos o provedor e não dá para contar com eles rodando os nossos contratos. Então eu usaria mocks em todo PR, uma verificação periódica de schema contra o ambiente de teste ou a especificação oficial, e poucos smoke tests com contas de teste ou sandbox. Os mocks deixam o time trabalhar rápido, e a verificação periódica avisa quando eles deixaram de representar a API.
