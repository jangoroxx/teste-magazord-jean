# Questão 4.1 – Automação Mobile (teórica)

Contexto: app iOS e Android com geolocalização, câmera, push, storage offline e sincronização.

## 4.1.a) Escolha da ferramenta

Eu escolheria o Appium 2, com UiAutomator2 no Android e XCUITest no iOS. O que pesa é o contexto: o app depende de localização, câmera, rede, permissões e push, e o Appium é o que dá mais controle sobre esses recursos. Ele também roda bem em device farms, como BrowserStack e Sauce Labs. O preço é um setup mais trabalhoso e testes que dependem bastante de boas esperas e bons seletores.

| | Appium 2 | Maestro | Detox |
|---|---|---|---|
| Plataformas | iOS e Android | iOS e Android | Foco em React Native |
| Escrita | Código (JS, Java, Python...) | YAML | JS/TS |
| Aprendizado | Mais difícil | Fácil | Médio |
| Estabilidade | Depende de esperas e seletores | Boa, espera automática | Muito boa |
| Recursos do dispositivo | Amplo | O essencial | Limitado ao app |
| Device farms e CI | Suporte amplo | Maestro Cloud, CI simples | Mais manual |

O Maestro eu usaria nos fluxos de smoke, porque é rápido de escrever e fácil de manter. Se o time fosse pequeno, inverteria a ordem: começaria com um piloto em Maestro e traria o Appium só para o que ele não cobrisse. O Detox só entraria na conversa se o app fosse React Native.

## 4.1.b) Como mockar geolocalização, câmera e push

A geolocalização é a mais simples. No Android uso `adb emu geo fix <lon> <lat>` (a longitude vem primeiro) ou o `setGeoLocation` do Appium. No iOS, `xcrun simctl location booted set <lat>,<lon>`. O Maestro tem o `setLocation`. Além de um ponto fixo, eu testaria um trajeto e a permissão negada.

A câmera dá mais trabalho. O emulador Android tem câmera virtual e permite injetar uma imagem, mas o simulador de iOS não tem câmera real. Nesse caso eu combinaria com os desenvolvedores um build de teste que devolve uma imagem fixa, ou usaria a injeção de imagem de um device farm. Os casos são foto válida, permissão negada e falha na captura.

Para push, no simulador iOS uso `xcrun simctl push booted <bundleId> payload.apns`. No Android, envio por um FCM de teste ou pelo backend de homologação. Testaria com o app aberto, em segundo plano e fechado, e se tocar na notificação leva à tela certa.

## 4.1.c) Mesmos testes em iOS e Android sem duplicar código

O teste descreve o fluxo de negócio e não sabe em qual plataforma está rodando. Os detalhes ficam nos Screen Objects, com uma interface comum e código específico só onde as telas são realmente diferentes. A plataforma vem da configuração (`PLATFORM=android` ou `ios`), que carrega as capabilities certas.

O que mais ajuda é combinar com o time de desenvolvimento o uso de identificadores de acessibilidade (`accessibilityId` ou `testID`) iguais nas duas plataformas. Com isso quase não precisa de XPath. Massa de dados, utilitários e asserções são os mesmos para as duas. No Maestro, o equivalente é um fluxo único, com `appId` parametrizado e `runFlow` condicional.

## 4.1.d) Setup local e em CI/CD

Na máquina local são necessários Node, JDK, Android SDK com emuladores e, em um Mac, Xcode com simuladores. Por cima disso vêm o Appium 2 com os dois drivers, o `appium-doctor` para conferir a instalação e os builds de debug do app (`.apk` e `.app`). URLs e credenciais de homologação ficam em variáveis de ambiente.

No CI, o pipeline gera o build e o publica como artefato. O Android roda em runner Linux com KVM e o iOS precisa de runner macOS. Se manter isso ficar caro, um device farm resolve os dois. Com o Appium no ar, os testes rodam divididos em paralelo, com poucas retentativas, e o pipeline guarda vídeo, logs e screenshots junto do relatório.

Eu rodaria o smoke a cada PR e a regressão completa à noite, porque teste mobile é lento demais para segurar todo PR.

## 4.1.e) Validar sincronização e offline sem backend real

Eu colocaria um servidor de mock no lugar do backend (WireMock ou Mockoon), para decidir o que ele responde: sucesso, `409` de conflito, `500`, timeout ou lentidão. Para a rede, usaria modo avião, `setConnectivity` do Appium ou `adb shell svc wifi/data`. Quando precisasse cortar ou atrasar a conexão no meio de uma chamada, um proxy como o Toxiproxy.

Com isso, testaria:

1. Criar e editar dados offline, fechar o app, reabrir e ver se continuam lá.
2. Reconectar e verificar no mock se as requisições chegaram na ordem, com o payload certo e com chave de idempotência.
3. Alterar o mesmo registro em dois lugares e ver se o conflito segue a regra definida (por exemplo, vale a última alteração).
4. Derrubar a conexão no meio da sincronização e ver se o app tenta de novo com backoff, sem perder nem duplicar nada.

O estado local é limpo entre os testes. A verificação se apoia em dois lugares: o que o mock recebeu e o que ficou salvo no aparelho.
