const path = require('path');

module.exports = {
  plugins: [
    [
      path.resolve(__dirname, '../../../../src'), {
        generateScopedName: '[path]__[local]__[hash:base64:5]',
      },
    ],
  ],
  sourceType: 'module',
};
