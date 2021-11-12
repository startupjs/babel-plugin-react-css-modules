module.exports = {
  plugins: [
    [
      '../../../../src',
      {
        filetypes: {
          '.less': {
            syntax: 'postcss-less',
            plugins: ['postcss-nested']
          }
        },
        generateScopedName: '[local]-[hash:base64:10]',
        webpackHotModuleReloading: true
      }
    ]
  ]
}
