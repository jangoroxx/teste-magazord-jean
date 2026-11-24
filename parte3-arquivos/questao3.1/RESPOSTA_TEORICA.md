# Questão 3.1 – Importação de CSV

## 3.1.a) Como validar que todas as 1000 linhas foram processadas corretamente

Uso **reconciliação** entre o que entrou e o que foi persistido:

- **Contagem fechando:** `linhas lidas = linhas importadas + linhas rejeitadas`, e as rejeitadas com motivo (linha/coluna). O relatório final da importação precisa bater com isso.
- **Conferência no destino:** consulta no banco (ou API) comparando total de registros, e verificação campo a campo (ou *hash* por linha) entre o CSV de origem e o dado salvo, com amostragem de fronteira: primeira, última e uma linha do meio.
- **Regras de negócio e relacionamentos:** chaves estrangeiras existentes, duplicatas tratadas conforme a regra (ignorar, atualizar ou rejeitar) e idempotência (importar o mesmo arquivo duas vezes não duplica).
- **Dados reproduzíveis:** o gerador de CSV aceita quantidade e, se necessário, *seed* fixa, para que uma falha possa ser reproduzida.
- **Não funcionais:** tempo de processamento, uso de memória e comportamento na fronteira (999, 1000 e 1001 linhas).

## 3.1.b) Como testar cenários de erro (arquivo corrompido, dados inválidos)

Monto uma matriz de arquivos problemáticos:

- vazio; só cabeçalho; cabeçalho errado/ausente; delimitador errado (`;` em vez de `,`);
- codificação (UTF-8 com BOM, Latin-1); binário/truncado (corrompido); aspas não fechadas;
- colunas a mais ou a menos; tipos inválidos (idade "abc", e-mail sem `@`); valores fora de faixa;
- duplicatas; chave estrangeira inexistente; linhas em branco; arquivo acima do limite de tamanho;
- *CSV injection* (células iniciando com `=`, `+`, `-`, `@`).

Para cada um, valido: **mensagem de erro clara** (linha e coluna), **política de importação definida** (tudo ou nada vs. parcial com relatório), que **nada fica persistido pela metade** quando a regra é atômica, que a UI não trava e que há log/auditoria.

> Observação: o site de exemplo (`the-internet.herokuapp.com/upload`) não valida conteúdo; ele aceita qualquer arquivo. Por isso, nos testes práticos, o conteúdo inválido é comprovado por um validador próprio e o comportamento do site é apenas registrado, sem fingir que ele rejeita o arquivo. Num sistema real, a asserção seria a mensagem de erro e a ausência de dados persistidos.
