import fs from 'fs';
import path from 'path';
import runner from '@babel/helper-plugin-test-runner';
import MiniCssExtractPlugin from 'mini-css-extract-plugin';
import webpack from 'webpack';

// This is a rough draft for a css-compatibility test.

// NOTE: Not to be considered an example of how tests should be written;
// on contrary, it is an example of how to not write test ;)

// A very wrong way to set up for a Webpack compilation, specific to a single
// particular test case, rather multiple tests we probably want to do.
const compiler = webpack({
  // Context should be the current folder for paths in generated classnames
  // match babel.
  context: path.resolve(__dirname, '..'),
  entry: './test/fixtures/css-loader_compatibility/generated_hashes/style.css',
  mode: 'production',
  module: {
    rules: [{
      test: /\.css$/,
      // type: 'asset/resource',
      use: [
        MiniCssExtractPlugin.loader,
        {
          loader: 'css-loader',
          options: {
            modules: {
              // A very goofy way to set the template which is used in the test
              // on Babel side.
              localIdentName: '[path]__[local]__[hash:base64:5]',
            },
          },
        },
      ],
    }],
  },
  plugins: [
    new MiniCssExtractPlugin({
      filename: '[id].css',
    }),
  ],
});

afterAll((done) => {
  compiler.hooks.shouldEmit.tap('Test', () => {
    return false;
  });
  compiler.run((error, stats) => {
    // A very goofy way to extract compiled CSS from Webpack compilation stats.
    const cssChunkName = Object.keys(stats.compilation.assets)
      .find((key) => {
        return key.endsWith('.css');
      });
    let asset = stats.compilation.assets[cssChunkName];
    if (asset._source) {
      asset = asset._source;
    }
    const compiledCss = asset._value || asset._children.map(({_value}) => {
      return _value;
    }).join('\n');

    // A super-goofy way to compare hashes to Babel outputs.
    const names = compiledCss.match(/\.(\w|-)*/g);
    const out = fs.readFileSync(`${__dirname}/fixtures/css-loader_compatibility/generated_hashes/output.mjs`, 'utf8');
    names.forEach((name) => {
      if (!out.includes(`"${name.slice(1)}"`)) {
        done(new Error('Not compatible to current css-loader'));
      }
    });

    done();
  });
});

runner(__dirname);
