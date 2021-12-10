module.exports = {
  extends: ['airbnb-base', 'plugin:flowtype/recommended'],
  parser: '@babel/eslint-parser',
  plugins: ['flowtype', '@babel'],
  rules: {
    'no-plusplus': 0,
  },
};
