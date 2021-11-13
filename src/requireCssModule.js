// @flow

import {
  readFileSync,
} from 'fs';
import {
  dirname,
  resolve,
} from 'path';
import Parser from '@dr.pogodin/postcss-modules-parser';
import postcss from 'postcss';
import ExtractImports from 'postcss-modules-extract-imports';
import LocalByDefault from 'postcss-modules-local-by-default';
import newScopePlugin from 'postcss-modules-scope';
import Values from 'postcss-modules-values';
import getLocalIdent, {
  unescape,
} from './getLocalIdent';
import optionsDefaults from './schemas/optionsDefaults';
import type {
  GenerateScopedNameConfigurationType,
  StyleModuleMapType,
} from './types';

/* eslint-disable flowtype/no-mixed */
type PluginType = string | $ReadOnlyArray<[string, mixed]>;

/* eslint-enable flowtype/no-mixed */

type FiletypeOptionsType = {|
  +syntax: string,
  +plugins?: $ReadOnlyArray<PluginType>,
|};

type FiletypesConfigurationType = {
  [key: string]: FiletypeOptionsType,
  ...
};

/* eslint-disable flowtype/no-weak-types */
type SyntaxType = Function | Object;

/* eslint-enable flowtype/no-weak-types */

type OptionsType = {|
  filetypes: FiletypesConfigurationType,
  generateScopedName?: GenerateScopedNameConfigurationType,
  context?: string,
|};

const getFiletypeOptions = (cssSourceFilePath: string, filetypes: FiletypesConfigurationType): ?FiletypeOptionsType => {
  const extension = cssSourceFilePath.slice(cssSourceFilePath.lastIndexOf('.'));
  const filetype = filetypes ? filetypes[extension] : null;

  return filetype;
};

const getSyntax = (filetypeOptions: FiletypeOptionsType): ?(SyntaxType) => {
  if (!filetypeOptions || !filetypeOptions.syntax) {
    return null;
  }

  // eslint-disable-next-line import/no-dynamic-require
  return require(filetypeOptions.syntax);
};

const getExtraPlugins = (filetypeOptions: ?FiletypeOptionsType): $ReadOnlyArray<*> => {
  if (!filetypeOptions || !filetypeOptions.plugins) {
    return [];
  }

  return filetypeOptions.plugins.map((plugin) => {
    if (Array.isArray(plugin)) {
      const [pluginName, pluginOptions] = plugin;

      // eslint-disable-next-line import/no-dynamic-require
      return require(pluginName)(pluginOptions);
    }

    // eslint-disable-next-line import/no-dynamic-require
    return require(plugin);
  });
};

const getTokens = (
  extraPluginsRunner,
  runner,
  cssSourceFilePath: string,
  filetypeOptions: ?FiletypeOptionsType,
): StyleModuleMapType => {
  // eslint-disable-next-line flowtype/no-weak-types
  const options: Object = {
    from: cssSourceFilePath,
  };

  if (filetypeOptions) {
    options.syntax = getSyntax(filetypeOptions);
  }

  let res = readFileSync(cssSourceFilePath, 'utf-8');

  if (extraPluginsRunner) {
    res = extraPluginsRunner.process(res, options);
  }

  res = runner.process(res, options);

  for (const message of res
    .warnings()) {
    // eslint-disable-next-line no-console
    console.warn(message.text);
  }

  return res.root.tokens;
};

export default (cssSourceFilePath: string, options: OptionsType): StyleModuleMapType => {
  // eslint-disable-next-line prefer-const
  let runner;

  let generateScopedName;

  if (options.generateScopedName && typeof options.generateScopedName === 'function') {
    generateScopedName = options.generateScopedName;
  } else {
    generateScopedName = (clazz, resourcePath) => {
      return getLocalIdent(
        // TODO: The loader context used by "css-loader" may has additional
        // stuff inside this argument (loader context), allowing for some edge
        // cases (though, presumably not with a typical configurations)
        // we don't support (yet?).
        {resourcePath},

        options.generateScopedName || optionsDefaults.generateScopedName,
        unescape(clazz),
        {
          context: options.context || process.cwd(),

          // TODO: These options should match their counterparts in Webpack
          // configuration:
          //  - https://webpack.js.org/configuration/output/#outputhashdigest
          //  - https://webpack.js.org/configuration/output/#outputhashdigestlength
          //  - https://webpack.js.org/configuration/output/#outputhashfunction
          //  - https://webpack.js.org/configuration/output/#outputhashsalt
          // and they should be exposed as babel-plugin-react-css-modules
          // options. However, for now they are just hardcoded equal to
          // the Webpack's default settings.
          hashDigest: 'hex',
          hashDigestLength: 20,
          hashFunction: 'md4',
          hashSalt: '',

          // TODO: This one allows for some path modifications during
          // the transform. Probably, not a Webpack param.
          regExp: '',
        },
      );
    };
  }

  const filetypeOptions = getFiletypeOptions(cssSourceFilePath, options.filetypes);

  const fetch = (to: string, from: string) => {
    const fromDirectoryPath = dirname(from);
    const toPath = resolve(fromDirectoryPath, to);

    return getTokens(undefined, runner, toPath, filetypeOptions);
  };

  const extraPlugins = getExtraPlugins(filetypeOptions);

  const extraPluginsRunner = extraPlugins.length && postcss(extraPlugins);

  const plugins = [
    Values,
    LocalByDefault,
    ExtractImports,
    newScopePlugin({
      generateScopedName,
    }),
    new Parser({
      fetch,
    }),
  ];

  runner = postcss(plugins);

  return getTokens(
    extraPluginsRunner,
    runner,
    cssSourceFilePath,
    filetypeOptions,
  );
};
