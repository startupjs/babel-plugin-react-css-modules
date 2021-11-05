import fs from 'fs';
import path from 'path';
import runner from '@babel/helper-plugin-test-runner';
import MiniCssExtractPlugin from 'mini-css-extract-plugin';
import webpack from 'webpack';
import {
  getLocalIdent,
} from '../src/utils';

// This is a rough draft for a css-compatibility test.

// NOTE: Not to be considered an example of how tests should be written;
// on contrary, it is an example of how to not write test ;)

// A very wrong way to set up for a Webpack compilation, specific to a single
// particular test case, rather multiple tests we probably want to do.
const compilerA = webpack({
  // Context should be the current folder for paths in generated classnames
  // match babel.
  context: path.resolve(__dirname, '..'),
  entry: './test/fixtures/css-loader_compatibility/generated_hashes/style.css',
  mode: 'production',
  module: {
    rules: [{
      test: /\.css$/u,
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

// And this is just copy/paste for a different Webpack config...
// as noted above, this is bad test code, to be refactored later.
const compilerB = webpack({
  // Context should be the current folder for paths in generated classnames
  // match babel.
  context: path.resolve(__dirname, '..'),
  entry: './test/fixtures/css-loader_compatibility/stable_classnames/style.css',
  mode: 'production',
  module: {
    rules: [{
      test: /\.css$/u,
      // type: 'asset/resource',
      use: [
        MiniCssExtractPlugin.loader,
        {
          loader: 'css-loader',
          options: {
            modules: {
              getLocalIdent,
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
  compilerA.hooks.shouldEmit.tap('Test', () => {
    return false;
  });
  compilerB.hooks.shouldEmit.tap('Test', () => {
    return false;
  });

  const completed = {};
  const onCompleted = (id) => {
    completed[id] = true;
    if (completed.A && completed.B) {
      done();
    }
  };

  compilerA.run((error, stats) => {
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
    const names = compiledCss.match(/\.(\w|-)*/gu);
    const out = fs.readFileSync(`${__dirname}/fixtures/css-loader_compatibility/generated_hashes/output.mjs`, 'utf8');

    for (const name of names) {
      if (!out.includes(`"${name.slice(1)}"`)) {
        const msg = `[A] Not compatible to current css-loader\n\nOUTPUT:\n${
          out}\nMISSES CLASS:\n${name}`;
        return done(new Error(msg));
      }
    }

    return onCompleted('A');
  });
  compilerB.run((error, stats) => {
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
    const names = compiledCss.match(/\.[A-Za-z0-9_\\+-]*/gu);
    const out = fs.readFileSync(`${__dirname}/fixtures/css-loader_compatibility/stable_classnames/output.mjs`, 'utf8');

    for (const name of names) {
      if (!out.includes(`"${name.slice(1)}"`)) {
        const msg = `[B] Not compatible to current css-loader\n\nOUTPUT:\n${
          out}\nMISSES CLASS:\n[${name.slice(1)}]`;
        return done(new Error(msg));
      }
    }

    return onCompleted('B');
  });
});

runner(__dirname);
