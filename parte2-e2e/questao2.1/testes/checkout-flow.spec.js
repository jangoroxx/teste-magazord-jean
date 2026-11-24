const { test, expect } = require('@playwright/test');
const { passo } = require('../../../utils/passo');
const { CheckoutPage } = require('./pages/checkout-page');
const { USERS, PRODUCTS, buildCheckoutData } = require('./fixtures/checkout-data');

test.use({ baseURL: 'https://www.saucedemo.com', testIdAttribute: 'data-test' });

test.describe('Checkout - SauceDemo', () => {
  let checkout;

  test.beforeEach(async ({ page }) => {
    checkout = new CheckoutPage(page);
  });

  test.afterEach(async () => {
    await checkout.cleanup();
  });

  test('fluxo completo: login → 2 produtos → checkout → confirmação', async ({ page }) => {
    const data = buildCheckoutData();

    await passo('Login com usuário padrão', async () => {
      await checkout.login(USERS.standard);
      await expect(page).toHaveURL(/inventory\.html/);
    });

    await passo('Adiciona 2 produtos ao carrinho', async () => {
      await checkout.addProducts([PRODUCTS.backpack, PRODUCTS.bikeLight]);
      await expect(checkout.cartBadge).toHaveText('2');
    });

    await passo('Carrinho mostra os 2 produtos', async () => {
      await checkout.openCart();
      expect(await checkout.itemNames()).toEqual(['Sauce Labs Backpack', 'Sauce Labs Bike Light']);
    });

    await passo('Preenche os dados do cliente', async () => {
      await checkout.startCheckout();
      await checkout.fillCustomerInfo(data);
    });
    await passo('Avança para o resumo do pedido', async () => {
      await checkout.continue();
      await expect(page).toHaveURL(/checkout-step-two\.html/);
    });

    await passo('Finaliza e confere a confirmação', async () => {
      await checkout.finish();
      await expect(page).toHaveURL(/checkout-complete\.html/);
      await expect(checkout.confirmationHeader).toHaveText('Thank you for your order!');
    });
  });

  test('resumo do pedido: subtotal é a soma dos itens e total ≥ subtotal', async () => {
    await passo('Login com usuário padrão', async () => {
      await checkout.login(USERS.standard);
    });
    await passo('Adiciona 2 produtos e abre o carrinho', async () => {
      await checkout.addProducts([PRODUCTS.backpack, PRODUCTS.boltShirt]);
      await checkout.openCart();
    });
    await passo('Preenche os dados e avança para o resumo', async () => {
      await checkout.startCheckout();
      await checkout.fillCustomerInfo(buildCheckoutData());
      await checkout.continue();
    });

    await passo('Subtotal é a soma dos itens e total ≥ subtotal', async () => {
      const prices = await checkout.itemPricesInCents();
      const sum = prices.reduce((a, b) => a + b, 0);
      expect(await checkout.subtotalInCents()).toBe(sum);
      expect(await checkout.totalInCents()).toBeGreaterThanOrEqual(sum); // total inclui imposto
    });
  });

  const camposObrigatorios = [
    { campo: 'firstName', mensagem: 'First Name is required' },
    { campo: 'lastName', mensagem: 'Last Name is required' },
    { campo: 'postalCode', mensagem: 'Postal Code is required' },
  ];
  for (const { campo, mensagem } of camposObrigatorios) {
    test(`validação: ${campo} vazio bloqueia o checkout`, async ({ page }) => {
      await passo('Login com usuário padrão', async () => {
        await checkout.login(USERS.standard);
      });
      await passo('Adiciona produto e inicia o checkout', async () => {
        await checkout.addProducts([PRODUCTS.backpack]);
        await checkout.openCart();
        await checkout.startCheckout();
      });
      await passo(`Envia o formulário com ${campo} vazio`, async () => {
        await checkout.fillCustomerInfo(buildCheckoutData({ [campo]: '' }));
        await checkout.continue();
      });

      await passo(`Mostra "${mensagem}" e não avança`, async () => {
        await expect(checkout.errorMessage).toContainText(mensagem);
        await expect(page).toHaveURL(/checkout-step-one\.html/); // não avança
      });
    });
  }

  test('usuário bloqueado não consegue logar', async ({ page }) => {
    await passo('Tenta login com usuário bloqueado', async () => {
      await checkout.login(USERS.locked);
    });
    await passo('Mostra erro de bloqueio e não entra na loja', async () => {
      await expect(checkout.errorMessage).toContainText('locked out');
      await expect(page).not.toHaveURL(/inventory\.html/);
    });
  });
});

// Fora do describe acima de propósito: não depende de navegador nem dos hooks de limpeza.
test.describe('[unit] gerador de dados', () => {
  test('[unit] produz dados válidos e diferentes a cada chamada', async () => {
    await passo('Gera dois clientes: válidos e diferentes entre si', async () => {
      const a = buildCheckoutData();
      const b = buildCheckoutData();
      for (const d of [a, b]) {
        expect(d.firstName).toBeTruthy();
        expect(d.lastName).toBeTruthy();
        expect(d.postalCode).toMatch(/^\d{5}-\d{3}$/);
      }
      expect(`${a.firstName}${a.lastName}${a.postalCode}`).not.toBe(`${b.firstName}${b.lastName}${b.postalCode}`);
    });
  });
});
