// This module provides a stable implementation of getLocalIdent(),
// and generateScopedName() functions, which may be used to override
// default classname generation algorithms of `css-loader` and this
// plugin, to be independent of internal `css-loader` changes that
// from time-to-time alter the output classnames without solid reasons.

/* eslint-disable import/no-commonjs */

const fs = require('fs');
const path = require('path');
const cssesc = require('cssesc');
const {interpolateName} = require('loader-utils');

/**
 * Normalizes file path to OS-independent format (adopted from css-loader).
 *
 * @ignore
 * @param {string} file
 * @returns {string}
 */
const normalizePath = (file) => {
  return path.sep === '\\' ? file.replaceAll('\\', '/') : file;
};

const filenameReservedRegex = /["*/:<>?\\|]/gu;

// eslint-disable-next-line no-control-regex
const reControlChars = /[\u0000-\u001F\u0080-\u009F]/gu;

const escapeLocalident = (localident) => {
  return cssesc(
    localident
      // For `[hash]` placeholder
      .replace(/^((-?\d)|--)/u, '_$1')
      .replace(filenameReservedRegex, '-')
      .replace(reControlChars, '-')
      .replaceAll('.', '-'),
    {isIdentifier: true},
  );
};

/**
 * Returns the name of package containing the folder; i.e. it recursively looks
 * up from the folder for the closest package.json file, and returns the name in
 * that file. It also caches the results from previously fisited folders.
 *
 * @ignore
 * @param {string} folder
 * @returns {string}
 */
const getPackageInfo = (folder) => {
  let res = getPackageInfo.cache[folder];
  if (!res) {
    const pp = path.resolve(folder, 'package.json');
    /* eslint-disable import/no-dynamic-require */
    res = fs.existsSync(pp) ? {
      name: require(pp).name,
      root: folder,
    } : getPackageInfo(path.resolve(folder, '..'));
    /* eslint-enable import/no-dynamic-require */
    getPackageInfo.cache[folder] = res;
  }

  return res;
};

getPackageInfo.cache = {};

const getLocalIdent = (
  {resourcePath},
  localIdentName,
  localName,
  options = {},
) => {
  const packageInfo = getPackageInfo(path.dirname(resourcePath));
  const request = normalizePath(path.relative(packageInfo.root, resourcePath));

  return interpolateName({
    resourcePath,
  }, localIdentName, {
    ...options,
    content: `${packageInfo.name + request}\u0000${localName}`,
    context: packageInfo.root,
  }).replace(/\[package\]/giu, packageInfo.name)
    .replace(/\[local\]/giu, localName)
    .replaceAll('@', '-');
};

const generateScopedNameFactory = (localIdentName) => {
  return (localName, assetPath) => {
    return escapeLocalident(
      getLocalIdent(
        {resourcePath: assetPath},
        localIdentName,
        localName,
        {},
      ),
    );
  };
};

module.exports = {
  generateScopedNameFactory,
  getLocalIdent,
};
