# Questão 3.1 – Importação de CSV

## 3.1.a) Como validar que todas as 1000 linhas foram processadas corretamente

A primeira conferência é a conta fechar: linhas lidas têm que ser iguais às importadas mais as rejeitadas, e cada rejeitada precisa trazer o motivo, com linha e coluna. O relatório da importação tem que mostrar esses mesmos números.

Só a contagem não basta, porque podem existir 1000 registros com dados trocados. Por isso eu compararia o CSV com o que foi salvo, campo a campo ou por um hash de cada linha, consultando o banco ou a API. A primeira linha, a última e uma do meio eu conferiria sempre de forma explícita, porque erro de índice costuma aparecer nas pontas.

Depois vêm as regras de negócio: se as chaves estrangeiras existem, se as duplicatas foram tratadas como combinado (ignorar, atualizar ou rejeitar) e se importar o mesmo arquivo duas vezes não duplica os dados.

Também testaria 999, 1000 e 1001 linhas, para pegar problema na fronteira, e acompanharia tempo e memória. Para que uma falha possa ser reproduzida, o gerador de dados precisa poder usar uma seed fixa.

## 3.1.b) Como testar cenários de erro (arquivo corrompido, dados inválidos)

Eu montaria um conjunto de arquivos com problema, cada um com um defeito só, para saber o que causou o erro:

- Arquivo: vazio, só com cabeçalho, truncado, binário ou acima do tamanho permitido.
- Estrutura: cabeçalho errado ou ausente, `;` no lugar de `,`, aspas não fechadas, colunas a mais ou a menos, linhas em branco.
- Codificação: UTF-8 com BOM e Latin-1, que aparecem bastante em planilhas exportadas.
- Dados: idade "abc", e-mail sem `@`, valor fora da faixa, duplicata, chave estrangeira inexistente.
- Segurança: células começando com `=`, `+`, `-` ou `@` (CSV injection).

Em cada caso, espero uma mensagem que ajude o usuário a corrigir o arquivo, dizendo a linha e a coluna quando fizer sentido. A tela não pode travar e o erro precisa ficar registrado em log.

Antes de escrever esses testes é preciso definir com o time se a importação é tudo ou nada ou se aceita parte do arquivo e devolve um relatório. Se for tudo ou nada, nenhum registro pode ficar salvo depois de uma falha.

> O site de exemplo (`the-internet.herokuapp.com/upload`) aceita qualquer arquivo e não valida o conteúdo. Por isso, nos testes práticos, um validador próprio reprova o conteúdo e o teste confirma que o site aceitou o upload ("File Uploaded!"). Não faria sentido fingir uma rejeição que não existe. Em um sistema real, eu verificaria a mensagem de erro e que nada foi salvo.
