/**
 * getLocalIdent() function taken from css-loader@5.2.4
 */

import path from 'path';
import {
  interpolateName,
} from 'loader-utils';

const filenameReservedRegex = /["*/:<>?\\|]/g;
// eslint-disable-next-line no-control-regex
const reControlChars = /[\u0000-\u001f\u0080-\u009f]/g;

const normalizePath = (file) => {
  return path.sep === '\\' ? file.replace(/\\/g, '/') : file;
};

const regexSingleEscape = /[ -,./:-@[\]^`{-~]/;
const regexExcessiveSpaces = /(^|\\+)?(\\[\dA-F]{1,6}) (?![\d A-Fa-f])/g;

const escape = (string) => {
  let output = '';
  let counter = 0;

  while (counter < string.length) {
    const character = string.charAt(counter++);

    let value;

    // eslint-disable-next-line no-control-regex
    if (/[\t\n\u000B\f\r]/.test(character)) {
      const codePoint = character.charCodeAt();

      value = `\\${codePoint.toString(16).toUpperCase()} `;
    } else if (character === '\\' || regexSingleEscape.test(character)) {
      value = `\\${character}`;
    } else {
      value = character;
    }

    output += value;
  }

  const firstChar = string.charAt(0);

  if (/^-[\d-]/.test(output)) {
    output = `\\-${output.slice(1)}`;
  } else if (/\d/.test(firstChar)) {
    output = `\\3${firstChar} ${output.slice(1)}`;
  }

  // Remove spaces after `\HEX` escapes that are not followed by a hex digit,
  // since they’re redundant. Note that this is only possible if the escape
  // sequence isn’t preceded by an odd number of backslashes.
  output = output.replace(regexExcessiveSpaces, (aa, bb, cc) => {
    if (bb && bb.length % 2) {
      // It’s not safe to remove the space, so don’t.
      return aa;
    }

    // Strip the space.
    return (bb || '') + cc;
  });

  return output;
};

const escapeLocalIdent = (localident) => {
  return escape(
    localident

      // For `[hash]` placeholder
      .replace(/^((-?\d)|--)/, '_$1')
      .replace(filenameReservedRegex, '-')
      .replace(reControlChars, '-')
      .replace(/\./g, '-'),
  );
};

export default function getLocalIdent (
  loaderContext,
  localIdentName,
  localName,
  options,
) {
  let relativeMatchResource = '';
  const {context, hashPrefix} = options;
  const {_module: mdl, resourcePath} = loaderContext;

  if (mdl && mdl.matchResource) {
    relativeMatchResource = `${normalizePath(
      path.relative(context, mdl.matchResource),
    )}\u0000`;
  }

  const relativeResourcePath = normalizePath(
    path.relative(context, resourcePath),
  );

  options.content = `${hashPrefix}${relativeMatchResource}${
    relativeResourcePath}\u0000${localName}`;

  const ident = interpolateName(loaderContext, localIdentName, options)
    .replace(/\[local]/gi, localName);

  return escapeLocalIdent(ident);
}
