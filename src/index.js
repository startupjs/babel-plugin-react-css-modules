// @flow

import {
  dirname,
  resolve,
} from 'path';
import babelPluginJsxSyntax from '@babel/plugin-syntax-jsx';
import BabelTypes from '@babel/types';
import Ajv from 'ajv';
import ajvKeywords from 'ajv-keywords';
import attributeNameExists from './attributeNameExists';
import createObjectExpression from './createObjectExpression';
import createSpreadMapper from './createSpreadMapper';
import handleSpreadClassName from './handleSpreadClassName';
import replaceJsxExpressionContainer from './replaceJsxExpressionContainer';
import requireCssModule from './requireCssModule';
import resolveStringLiteral from './resolveStringLiteral';
import optionsDefaults from './schemas/optionsDefaults';
import optionsSchema from './schemas/optionsSchema.json';

const ajv = new Ajv({
  $data: true,
});

ajvKeywords(ajv);

const validate = ajv.compile(optionsSchema);

const getTargetResourcePath = (path: *, stats: *) => {
  const targetFileDirectoryPath = dirname(stats.file.opts.filename);

  if (path.node.source.value.startsWith('.')) {
    return resolve(targetFileDirectoryPath, path.node.source.value);
  }

  return require.resolve(path.node.source.value);
};

const isFilenameExcluded = (filename, exclude) => filename.match(new RegExp(exclude, 'u'));

const notForPlugin = (path: *, stats: *) => {
  const extension = path.node.source.value.lastIndexOf('.') > -1
    ? path.node.source.value.slice(path.node.source.value.lastIndexOf('.'))
    : null;

  if (extension !== '.css') {
    const { filetypes } = stats.opts;
    if (!filetypes || !filetypes[extension]) return true;
  }

  const filename = getTargetResourcePath(path, stats);

  if (stats.opts.exclude && isFilenameExcluded(filename, stats.opts.exclude)) {
    return true;
  }

  return false;
};

export default ({
  types,
}: {|
  types: typeof BabelTypes,
|}): { ... } => {
  const filenameMap = {};

  let skip = false;

  const setupFileForRuntimeResolution = (path, filename) => {
    const programPath = path.findParent((parentPath) => parentPath.isProgram());

    filenameMap[filename].importedHelperIndentifier = programPath.scope.generateUidIdentifier('getClassName');
    filenameMap[filename].styleModuleImportMapIdentifier = programPath.scope.generateUidIdentifier('styleModuleImportMap');

    programPath.unshiftContainer(
      'body',
      types.importDeclaration(
        [
          types.importDefaultSpecifier(
            filenameMap[filename].importedHelperIndentifier,
          ),
        ],
        types.stringLiteral('@dr.pogodin/babel-plugin-react-css-modules/dist/browser/getClassName'),
      ),
    );

    const firstNonImportDeclarationNode = programPath.get('body').find((node) => !types.isImportDeclaration(node));

    firstNonImportDeclarationNode.insertBefore(
      types.variableDeclaration(
        'const',
        [
          types.variableDeclarator(
            types.cloneNode(
              filenameMap[filename].styleModuleImportMapIdentifier,
            ),
            createObjectExpression(types, filenameMap[filename].styleModuleImportMap),
          ),
        ],
      ),
    );
  };

  const addWebpackHotModuleAccept = (path) => {
    const test = types.memberExpression(types.identifier('module'), types.identifier('hot'));
    const consequent = types.blockStatement([
      types.expressionStatement(
        types.callExpression(
          types.memberExpression(
            types.memberExpression(types.identifier('module'), types.identifier('hot')),
            types.identifier('accept'),
          ),
          [
            types.stringLiteral(path.node.source.value),
            types.functionExpression(null, [], types.blockStatement([
              types.expressionStatement(
                types.callExpression(
                  types.identifier('require'),
                  [types.stringLiteral(path.node.source.value)],
                ),
              ),
            ])),
          ],
        ),
      ),
    ]);

    const programPath = path.findParent((parentPath) => parentPath.isProgram());

    const firstNonImportDeclarationNode = programPath.get('body').find((node) => !types.isImportDeclaration(node));

    const hotAcceptStatement = types.ifStatement(test, consequent);

    if (firstNonImportDeclarationNode) {
      firstNonImportDeclarationNode.insertBefore(hotAcceptStatement);
    } else {
      programPath.pushContainer('body', hotAcceptStatement);
    }
  };

  return {
    inherits: babelPluginJsxSyntax,
    visitor: {
      ImportDeclaration(path: *, stats: *): void {
        if (skip || notForPlugin(path, stats)) {
          return;
        }

        const { filename } = stats.file.opts;
        const targetResourcePath = getTargetResourcePath(path, stats);

        let styleImportName: string;

        if (path.node.specifiers.length === 0) {
          // use imported file path as import name
          styleImportName = path.node.source.value;
        } else if (path.node.specifiers.length === 1) {
          styleImportName = path.node.specifiers[0].local.name;
        } else {
          // eslint-disable-next-line no-console
          console.warn('Please report your use case. https://github.com/birdofpreyru/babel-plugin-react-css-modules/issues/new?title=Unexpected+use+case.');

          throw new Error('Unexpected use case.');
        }

        filenameMap[filename]
          .styleModuleImportMap[styleImportName] = requireCssModule(
            targetResourcePath,
            {
              context: stats.opts.context,
              filetypes: stats.opts.filetypes || {},
              generateScopedName: stats.opts.generateScopedName,
              transform: stats.opts.transform
            },
          );

        if (stats.opts.webpackHotModuleReloading) {
          addWebpackHotModuleAccept(path);
        }

        if (stats.opts.removeImport) {
          path.remove();
        }
      },
      JSXElement(path: *, stats: *): void {
        if (skip) {
          return;
        }

        const { filename } = stats.file.opts;

        if (stats.opts.exclude && isFilenameExcluded(filename, stats.opts.exclude)) {
          return;
        }

        let { attributeNames } = optionsDefaults;

        if (stats.opts && stats.opts.attributeNames) {
          attributeNames = { ...attributeNames, ...stats.opts.attributeNames };
        }

        const attributes = path.node.openingElement.attributes
          .filter((attribute) => typeof attribute.name !== 'undefined' && typeof attributeNames[attribute.name.name] === 'string');

        if (attributes.length === 0) {
          return;
        }

        const {
          handleMissingStyleName = optionsDefaults.handleMissingStyleName,
          autoResolveMultipleImports = optionsDefaults.autoResolveMultipleImports,
        } = stats.opts || {};

        const spreadMap = createSpreadMapper(path, stats);

        attributes.forEach((attribute) => {
          const destinationName = attributeNames[attribute.name.name];

          const options = {
            autoResolveMultipleImports,
            handleMissingStyleName,
          };

          if (types.isStringLiteral(attribute.value)) {
            resolveStringLiteral(
              path,
              filenameMap[filename].styleModuleImportMap,
              attribute,
              destinationName,
              options,
            );
          } else if (types.isJSXExpressionContainer(attribute.value)) {
            if (!filenameMap[filename].importedHelperIndentifier) {
              setupFileForRuntimeResolution(path, filename);
            }

            replaceJsxExpressionContainer(
              types,
              path,
              attribute,
              destinationName,
              filenameMap[filename].importedHelperIndentifier,
              types.cloneNode(filenameMap[filename].styleModuleImportMapIdentifier),
              options,
            );
          }

          if (spreadMap[destinationName]) {
            handleSpreadClassName(
              path,
              destinationName,
              spreadMap[destinationName],
            );
          }
        });
      },
      Program(path: *, stats: *): void {
        if (!validate(stats.opts)) {
          // eslint-disable-next-line no-console
          console.error(validate.errors);

          throw new Error('Invalid configuration');
        }

        const { filename } = stats.file.opts;

        filenameMap[filename] = {
          styleModuleImportMap: {},
        };

        if (stats.opts.skip && !attributeNameExists(path, stats)) {
          skip = true;
        }
      },
    },
  };
};
