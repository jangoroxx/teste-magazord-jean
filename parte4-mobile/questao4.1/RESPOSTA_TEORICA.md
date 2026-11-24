# Questão 4.1 – Automação Mobile (teórica)

Contexto: app iOS e Android com geolocalização, câmera, push, storage offline e sincronização.

## 4.1.a) Escolha da ferramenta

| Critério | Appium 2 | Maestro | Detox |
|---|---|---|---|
| Plataformas | iOS + Android (nativo, híbrido, RN) | iOS + Android | Foco em React Native |
| Escrita dos testes | Código (JS/TS, Java, Python...) | YAML declarativo | JS/TS |
| Curva de aprendizado | Maior (drivers, capabilities, setup) | Baixa | Média |
| Estabilidade | Depende de boas esperas/seletores | Auto-wait embutido, tende a ser mais estável | Gray-box, muito estável |
| Acesso a recursos do dispositivo | Amplo (permissões, geolocalização, rede, push via comandos do SO) | Mais limitado, cobre o essencial | Limitado ao app |
| Device farms/CI | Suporte amplo (BrowserStack, Sauce Labs, Firebase Test Lab) | Maestro Cloud e CI simples | Mais manual |

**Minha escolha:** **Appium 2 (UiAutomator2 + XCUITest)** como base, porque o contexto exige controlar recursos do dispositivo (localização, câmera, rede, permissões, push) e rodar em device farms. **Maestro** entra para os fluxos críticos de regressão/smoke, pela velocidade de escrita e baixo custo de manutenção. **Detox** só faria sentido se o app fosse React Native. Em um time pequeno, eu começaria com um piloto de Maestro e usaria Appium para os cenários que ele não cobrir.

## 4.1.b) Como mockar geolocalização, câmera e push

- **Geolocalização:** Android: `adb emu geo fix <lon> <lat>` ou `setGeoLocation` do Appium; iOS: `xcrun simctl location booted set <lat>,<lon>`; no Maestro, `setLocation`. Valido também rotas/trajetos simulados e o caso de permissão negada.
- **Câmera:** no emulador Android, câmera virtual com imagem injetada; no simulador iOS não há câmera real, então uso um *seam* no app (build de teste ou injeção de dependência que devolve uma imagem fixa) ou o recurso de *image injection* de device farms. Valido o fluxo com foto válida, permissão negada e falha de captura.
- **Push:** iOS: `xcrun simctl push booted <bundleId> payload.apns`; Android: envio via FCM de teste/endpoint do backend de homologação. Valido o recebimento, o toque que abre a tela correta (*deep link*) e o comportamento com app em primeiro plano, segundo plano e fechado.

## 4.1.c) Mesmos testes em iOS e Android sem duplicar código

- **Page/Screen Objects** com uma interface comum e implementação específica de plataforma apenas onde a UI difere.
- **Seletores por identificador de acessibilidade** (`accessibilityId`/`testID`), combinados com o time de desenvolvimento, em vez de XPath.
- Testes escritos no nível do **fluxo de negócio**, e a plataforma escolhida por configuração (`PLATFORM=android|ios` carregando as *capabilities* certas).
- Massa de dados, utilitários e asserções compartilhados. No Maestro, um único fluxo com `appId` parametrizado e `runFlow` condicional por plataforma.

## 4.1.d) Setup local e em CI/CD

**Local:** Node + JDK; Android SDK com AVDs (emuladores); Xcode com simuladores (macOS); Appium 2 com os drivers UiAutomator2 e XCUITest; `appium-doctor` para validar; builds de debug do app (`.apk`/`.app`); variáveis de ambiente para URLs e credenciais de homologação.

**CI/CD:** (1) build do app e publicação como artefato; (2) Android em runner Linux com KVM (emulador) e iOS em runner macOS, ou device cloud (BrowserStack, Sauce Labs, Firebase Test Lab); (3) subir o Appium; (4) executar os testes em paralelo (*sharding*); (5) coletar vídeo, logs e screenshots como artefatos; (6) *retries* limitados e relatório. Estratégia: **smoke a cada PR** e **regressão completa à noite**.

## 4.1.e) Validar sincronização e offline sem backend real

- **Backend controlado:** servidor mock (WireMock, MockServer ou Mockoon) com respostas determinísticas: sucesso, `409` de conflito, `500`, timeout e respostas lentas.
- **Controle de rede:** modo avião/`setConnectivity` do Appium, `adb shell svc wifi/data`, ou um proxy de falhas (Toxiproxy/mitmproxy) para cortar ou atrasar a conexão.
- **Cenários:** (1) criar/editar dados offline → verificar que ficam no storage local e **persistem após fechar e reabrir o app**; (2) reconectar → verificar no mock que as requisições chegaram **na ordem certa, com o payload esperado e chave de idempotência**; (3) conflito (mesmo registro alterado em dois lugares) conforme a regra definida (ex.: *last-write-wins*); (4) queda de conexão no meio da sincronização → *retry* com *backoff*, sem perda nem duplicação; (5) limpeza do estado local entre testes.

A asserção principal é sobre as **requisições capturadas pelo mock** e o estado local do app, e não sobre um backend real.
