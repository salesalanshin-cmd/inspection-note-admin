import path from 'node:path';

/** node --test가 확장자 없는 상대 import를 읽도록 .js를 붙인다. */
export async function resolve(specifier, context, nextResolve) {
  const ext = path.extname(specifier);
  if ((specifier.startsWith('./') || specifier.startsWith('../')) && !ext) {
    return nextResolve(`${specifier}.js`, context);
  }
  return nextResolve(specifier, context);
}
