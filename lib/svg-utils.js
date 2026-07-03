/**
 * SVG 工具函数 — 对 RDKit 生成的 SVG 字符串进行后处理。
 *
 * 所有函数均为纯函数，不依赖 DOM。
 * @module svg-utils
 */

/**
 * SVG 后处理选项。
 *
 * @typedef {Object} SvgPostProcessOptions
 * @property {string}  [fontFamily] - 注入到 SVG 根元素的 font-family，默认 Times New Roman 系
 * @property {boolean} [forceBlack] - 是否将所有非白颜色强制转为黑色，默认 true
 * @property {boolean} [addViewBox] - 是否根据 width/height 自动添加 viewBox，默认 true
 */

/**
 * 将 SVG 字符串中所有非白 (#FFFFFF) 颜色统一为黑色。
 *
 * @param {string} svg - 原始 SVG 字符串
 * @returns {string}
 */
export function normalizeColors(svg) {
  return svg.replace(/#([0-9a-fA-F]{6})/g, (_m, c) =>
    c.toUpperCase() === 'FFFFFF' ? '#FFFFFF' : '#000000',
  );
}

/**
 * 从 SVG width/height 属性生成 viewBox，使 SVG 支持响应式缩放。
 *
 * @param {string} svg - 原始 SVG 字符串
 * @returns {string} 注入 viewBox 后的 SVG 字符串
 */
export function injectViewBox(svg) {
  const wm = svg.match(/width="(\d+)"/);
  const hm = svg.match(/height="(\d+)"/);
  if (
    !wm ||
    !hm ||
    !Number.isFinite(+wm[1]) ||
    !Number.isFinite(+hm[1])
  ) {
    return svg;
  }
  const vb = ` viewBox="0 0 ${wm[1]} ${hm[1]}" preserveAspectRatio="xMidYMid meet"`;
  return svg.replace(/<svg/, `<svg${vb}`);
}

/**
 * 向 SVG 根元素注入 font-family 和内联样式。
 *
 * @param {string} svg - 原始 SVG 字符串
 * @param {string} fontFamily - CSS font-family 值
 * @returns {string}
 */
export function injectFontFamily(svg, fontFamily) {
  return svg.replace(
    /<svg/,
    `<svg style="font-family:${fontFamily};"`,
  );
}

/**
 * SVG 后处理主函数 — 依次执行颜色归一 / viewBox / 字体注入。
 *
 * @param {string} svg - RDKit 生成的原始 SVG
 * @param {SvgPostProcessOptions} [options]
 * @returns {string} 处理后的 SVG
 */
export function postProcessSvg(svg, options = {}) {
  if (!svg || !svg.includes('<svg')) return svg;

  const {
    fontFamily = "'Times New Roman',Times,serif",
    forceBlack = true,
    addViewBox = true,
  } = options;

  let result = svg;

  if (forceBlack) result = normalizeColors(result);
  if (addViewBox) result = injectViewBox(result);
  result = injectFontFamily(result, fontFamily);

  return result;
}
