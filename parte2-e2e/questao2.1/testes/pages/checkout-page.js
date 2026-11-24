const { expect } = require('@playwright/test');

/**
 * Page Object do fluxo de compra do SauceDemo.
 * Usa getByTestId (configurado para o atributo `data-test` no spec).
 */
class CheckoutPage {
  constructor(page) {
    this.page = page;
    this.cartBadge = page.getByTestId('shopping-cart-badge');
    this.errorMessage = page.getByTestId('error');
    this.confirmationHeader = page.getByTestId('complete-header');
  }

  async login({ username, password }) {
    await this.page.goto('/');
    await this.page.getByTestId('username').fill(username);
    await this.page.getByTestId('password').fill(password);
    await this.page.getByTestId('login-button').click();
  }

  async addProducts(slugs) {
    for (const slug of slugs) {
      await this.page.getByTestId(`add-to-cart-${slug}`).click();
    }
  }

  async openCart() {
    await this.page.getByTestId('shopping-cart-link').click();
    await expect(this.page).toHaveURL(/cart\.html/);
  }

  async startCheckout() {
    await this.page.getByTestId('checkout').click();
    await expect(this.page).toHaveURL(/checkout-step-one\.html/);
  }

  async fillCustomerInfo({ firstName, lastName, postalCode }) {
    await this.page.getByTestId('firstName').fill(firstName);
    await this.page.getByTestId('lastName').fill(lastName);
    await this.page.getByTestId('postalCode').fill(postalCode);
  }

  async continue() {
    await this.page.getByTestId('continue').click();
  }

  async finish() {
    await this.page.getByTestId('finish').click();
  }

  /** Nomes dos itens exibidos na tela atual (carrinho ou resumo). */
  async itemNames() {
    return this.page.getByTestId('inventory-item-name').allTextContents();
  }

  /** Preços dos itens em centavos (evita erro de ponto flutuante). */
  async itemPricesInCents() {
    const texts = await this.page.getByTestId('inventory-item-price').allTextContents();
    return texts.map((t) => Math.round(parseFloat(t.replace('$', '')) * 100));
  }

  async subtotalInCents() {
    const text = await this.page.getByTestId('subtotal-label').textContent();
    return Math.round(parseFloat(text.match(/\$([\d.]+)/)[1]) * 100);
  }

  async totalInCents() {
    const text = await this.page.getByTestId('total-label').textContent();
    return Math.round(parseFloat(text.match(/\$([\d.]+)/)[1]) * 100);
  }

  /** Limpeza de estado do navegador após cada teste (cookies, localStorage, sessionStorage). */
  async cleanup() {
    await this.page.context().clearCookies();
    try {
      await this.page.evaluate(() => { window.localStorage.clear(); window.sessionStorage.clear(); });
    } catch {
      // página pode estar em about:blank ou já fechada; o contexto isolado do Playwright cobre esse caso
    }
  }
}

module.exports = { CheckoutPage };
