const path = require('path');
const { generateScopedNameFactory } = require('../../../../src/utils');

module.exports = {
  plugins: [
    [
      path.resolve(__dirname, '../../../../src'), {
        generateScopedName: generateScopedNameFactory(
          '[path]__[local]__[hash:base64:5]'
        ),
      },
    ],
  ],
  sourceType: 'module',
};
