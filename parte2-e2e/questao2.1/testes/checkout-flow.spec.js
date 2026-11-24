const { test, expect } = require('@playwright/test');
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

    await checkout.login(USERS.standard);
    await expect(page).toHaveURL(/inventory\.html/);

    await checkout.addProducts([PRODUCTS.backpack, PRODUCTS.bikeLight]);
    await expect(checkout.cartBadge).toHaveText('2');

    await checkout.openCart();
    expect(await checkout.itemNames()).toEqual(['Sauce Labs Backpack', 'Sauce Labs Bike Light']);

    await checkout.startCheckout();
    await checkout.fillCustomerInfo(data);
    await checkout.continue();
    await expect(page).toHaveURL(/checkout-step-two\.html/);

    await checkout.finish();
    await expect(page).toHaveURL(/checkout-complete\.html/);
    await expect(checkout.confirmationHeader).toHaveText('Thank you for your order!');
  });

  test('resumo do pedido: subtotal é a soma dos itens e total ≥ subtotal', async () => {
    await checkout.login(USERS.standard);
    await checkout.addProducts([PRODUCTS.backpack, PRODUCTS.boltShirt]);
    await checkout.openCart();
    await checkout.startCheckout();
    await checkout.fillCustomerInfo(buildCheckoutData());
    await checkout.continue();

    const prices = await checkout.itemPricesInCents();
    const sum = prices.reduce((a, b) => a + b, 0);
    expect(await checkout.subtotalInCents()).toBe(sum);
    expect(await checkout.totalInCents()).toBeGreaterThanOrEqual(sum); // total inclui imposto
  });

  const camposObrigatorios = [
    { campo: 'firstName', mensagem: 'First Name is required' },
    { campo: 'lastName', mensagem: 'Last Name is required' },
    { campo: 'postalCode', mensagem: 'Postal Code is required' },
  ];
  for (const { campo, mensagem } of camposObrigatorios) {
    test(`validação: ${campo} vazio bloqueia o checkout`, async ({ page }) => {
      await checkout.login(USERS.standard);
      await checkout.addProducts([PRODUCTS.backpack]);
      await checkout.openCart();
      await checkout.startCheckout();
      await checkout.fillCustomerInfo(buildCheckoutData({ [campo]: '' }));
      await checkout.continue();

      await expect(checkout.errorMessage).toContainText(mensagem);
      await expect(page).toHaveURL(/checkout-step-one\.html/); // não avança
    });
  }

  test('usuário bloqueado não consegue logar', async ({ page }) => {
    await checkout.login(USERS.locked);
    await expect(checkout.errorMessage).toContainText('locked out');
    await expect(page).not.toHaveURL(/inventory\.html/);
  });
});

// Fora do describe acima de propósito: não depende de navegador nem dos hooks de limpeza.
test.describe('[unit] gerador de dados', () => {
  test('[unit] produz dados válidos e diferentes a cada chamada', async () => {
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
