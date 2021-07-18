/**
 * getLocalIdent() function taken from css-loader@5.2.4
 */

import path from 'path';
import TemplatedPathPlugin from 'webpack/lib/TemplatedPathPlugin';
import createHash from 'webpack/lib/util/createHash';

/**
 * Interpolates path template according to data.
 *
 * NOTE: The current "css-loader" relies on Webpack compilation mechanics,
 * build around tappable plugins. Here we expose the core logic of Webpack's
 * TemplatePathPlugin to make it usable without hooks, and Webpack's compilation
 * object. This has pros and cons: on one hand it allows to easily keep our
 * plugin functional in a way it worked before, on the negative side it now
 * may be sensitive to the exact Webpack version, in addition to css-loader.
 * Overall, it seems a reasonable solution for now.
 *
 * @param {string} path
 * @param {object} data
 * @returns {string}
 */
let getPath;
{
  // NOTE: This codeblock just exploits the current implementation of underlying
  // TemplatedPathPlugin, see:
  // https://github.com/webpack/webpack/blob/7102df3bb52a33529ff5db4fdf34484d2a359a49/lib/TemplatedPathPlugin.js#L308-L319
  // It just applies the plugin to mock compiler & compilation to get access to
  // the core logic function, which is copied to getPath() to be reused directly
  // when needed.
  const mockCompilation = {
    hooks: {
      assetPath: {
        tap: (_, fn) => {
          getPath = fn;
        },
      },
    },
    tap: (_, fn) => {
      fn(mockCompilation);
    },
  };
  const mockCompiler = {
    hooks: {compilation: mockCompilation},
  };
  new TemplatedPathPlugin().apply(mockCompiler);
}

const filenameReservedRegex = /["*/:<>?\\|]/g;
// eslint-disable-next-line no-control-regex
const reControlChars = /[\u0000-\u001f\u0080-\u009f]/g;

const normalizePath = (file) => {
  return path.sep === '\\' ? file.replace(/\\/g, '/') : file;
};

const regexSingleEscape = /[ -,./:-@[\]^`{-~]/;
const regexExcessiveSpaces =
  /(^|\\+)?(\\[\dA-F]{1,6}) (?![\d A-Fa-f])/g;

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

const gobbleHex = (string) => {
  const lower = string.toLowerCase();
  let hex = '';
  let spaceTerminated = false;

  for (let index = 0; index < 6 && lower[index] !== undefined; index++) {
    const code = lower.charCodeAt(index);

    // check to see if we are dealing with a valid hex char [a-f|0-9]
    const valid = code >= 97 && code <= 102 || code >= 48 && code <= 57;

    // https://drafts.csswg.org/css-syntax/#consume-escaped-code-point
    spaceTerminated = code === 32;

    if (!valid) {
      break;
    }

    hex += lower[index];
  }

  if (hex.length === 0) {
    return undefined;
  }

  const codePoint = Number.parseInt(hex, 16);

  const isSurrogate = codePoint >= 0xD8_00 && codePoint <= 0xDF_FF;

  // Add special case for
  // "If this number is zero, or is for a surrogate, or is greater than the maximum allowed code point"
  // https://drafts.csswg.org/css-syntax/#maximum-allowed-code-point
  if (isSurrogate || codePoint === 0x00_00 || codePoint > 0x10_FF_FF) {
    return ['\uFFFD', hex.length + (spaceTerminated ? 1 : 0)];
  }

  return [
    String.fromCodePoint(codePoint),
    hex.length + (spaceTerminated ? 1 : 0),
  ];
};

export const unescape = (string) => {
  if (!string.includes('\\')) {
    return string;
  }

  let returnValue = '';

  for (let index = 0; index < string.length; index++) {
    if (string[index] === '\\') {
      const gobbled = gobbleHex(string.slice(index + 1, index + 7));

      if (gobbled !== undefined) {
        returnValue += gobbled[0];
        index += gobbled[1];
        continue;
      }

      // Retain a pair of \\ if double escaped `\\\\`
      // https://github.com/postcss/postcss-selector-parser/commit/268c9a7656fb53f543dc620aa5b73a30ec3ff20e
      if (string[index + 1] === '\\') {
        returnValue += '\\';
        index += 1;
        continue;
      }

      // if \\ is at the end of the string retain it
      // https://github.com/postcss/postcss-selector-parser/commit/01a6b346e3612ce1ab20219acc26abdc259ccefb
      if (string.length === index + 1) {
        returnValue += string[index];
      }

      continue;
    }

    returnValue += string[index];
  }

  return returnValue;
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
  const {context} = options;
  const {_module: mdl, resourcePath} = loaderContext;

  // TODO: This does not have any effect now, as the parent function always
  // pass `localContext` with the only field `resourcePath`. Though, this block
  // of code comes from `css-loader` implementation, and presumably in some
  // cases it is important. However, as nobody has complained about related
  // problems so far, it is probably not that important at the moment for us.
  if (mdl && mdl.matchResource) {
    relativeMatchResource = `${normalizePath(
      path.relative(context, mdl.matchResource),
    )}\u0000`;
  }

  const relativeResourcePath = normalizePath(
    path.relative(context, resourcePath),
  );

  options.content = `${relativeMatchResource}${
    relativeResourcePath}\u0000${localName}`;

  let {
    hashFunction,
    hashDigest,
    hashDigestLength,
  } = options;
  const mathes = localIdentName.match(
    /\[(?:([^:\]]+):)?(hash|contenthash|fullhash)(?::([a-z]+\d*))?(?::(\d+))?]/i,
  );

  if (mathes) {
    const hashName = mathes[2] || hashFunction;

    hashFunction = mathes[1] || hashFunction;
    hashDigest = mathes[3] || hashDigest;
    hashDigestLength = mathes[4] || hashDigestLength;

    // `hash` and `contenthash` are same in `loader-utils` context
    // let's keep `hash` for backward compatibility

    // eslint-disable-next-line no-param-reassign
    localIdentName = localIdentName.replace(
      /\[(?:([^:\]]+):)?(?:hash|contenthash|fullhash)(?::([a-z]+\d*))?(?::(\d+))?]/gi,
      () => {
        return hashName === 'fullhash' ? '[fullhash]' : '[contenthash]';
      },
    );
  }

  const hash = createHash(hashFunction);
  const {hashSalt} = options;

  if (hashSalt) {
    hash.update(hashSalt);
  }

  hash.update(options.content);

  const localIdentHash = hash
    .digest(hashDigest)
    .slice(0, hashDigestLength)
    .replace(/[+/]/g, '_')
    .replace(/^\d/g, '_');

  // TODO need improve on webpack side, we should allow to pass
  // hash/contentHash without chunk property, also `data` for `getPath` should
  // be looks good without chunk property
  const ext = path.extname(loaderContext.resourcePath);
  const base = path.basename(loaderContext.resourcePath);
  const name = base.slice(0, base.length - ext.length);
  const data = {
    chunk: {
      contentHash: localIdentHash,
      hash: localIdentHash,
      name,
    },
    contentHash: localIdentHash,
    filename: path.relative(options.context, loaderContext.resourcePath),
  };

  let ident = getPath(localIdentName, data).replace(/\[local]/gi, localName);

  if (options.regExp) {
    const match = resourcePath.match(options.regExp);

    if (match) {
      match.forEach((matched, i) => {
        ident = ident.replace(new RegExp(`\\[${i}\\]`, 'ig'), matched);
      });
    }
  }

  return escapeLocalIdent(ident);
}
