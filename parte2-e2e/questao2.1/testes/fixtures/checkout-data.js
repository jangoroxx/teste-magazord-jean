// Gerador de dados dinâmicos: cada execução usa nome, sobrenome e CEP diferentes.
const { fakerPT_BR: faker } = require('@faker-js/faker');

const USERS = {
  standard: { username: 'standard_user', password: 'secret_sauce' },
  locked: { username: 'locked_out_user', password: 'secret_sauce' },
};

// slugs usados nos data-test dos botões do SauceDemo
const PRODUCTS = {
  backpack: 'sauce-labs-backpack',
  bikeLight: 'sauce-labs-bike-light',
  boltShirt: 'sauce-labs-bolt-t-shirt',
};

function buildCheckoutData(overrides = {}) {
  return {
    firstName: faker.person.firstName(),
    lastName: faker.person.lastName(),
    postalCode: faker.location.zipCode('#####-###'),
    ...overrides,
  };
}

module.exports = { USERS, PRODUCTS, buildCheckoutData };
