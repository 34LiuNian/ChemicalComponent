/**
 * 原子标签覆盖层 — 用 SVG <text> 元素替换 RDKit 通过 <path> 绘制的原子符号。
 *
 * 解决的问题：RDKit 使用路径（path）绘制原子符号文本，导致无法通过 CSS
 * font-family 改变字体。本模块读取 molblock 中的原子信息，计算每个原子标签
 * 的包围盒，然后用标准 <text> 元素覆盖，使其继承页面字体。
 *
 * @module atom-overlay
 */

import { parseAtoms } from './molblock-utils.js';

/**
 * 计算多个 SVG BBox 的并集包围盒。
 *
 * @param {SVGRect[]} boxes
 * @returns {{ x: number, y: number, width: number, height: number }|null}
 */
function unionBBox(boxes) {
  if (!boxes.length) return null;
  let x1 = Infinity; let y1 = Infinity;
  let x2 = -Infinity; let y2 = -Infinity;
  for (const b of boxes) {
    if (!b || !Number.isFinite(b.x) || !Number.isFinite(b.y)) continue;
    if (b.width <= 0 || b.height <= 0) continue;
    x1 = Math.min(x1, b.x);
    y1 = Math.min(y1, b.y);
    x2 = Math.max(x2, b.x + b.width);
    y2 = Math.max(y2, b.y + b.height);
  }
  if (!Number.isFinite(x1)) return null;
  return { x: x1, y: y1, width: x2 - x1, height: y2 - y1 };
}

/**
 * 覆盖层选项。
 *
 * @typedef {Object} AtomOverlayOptions
 * @property {string}   [fontFamily]  - CSS font-family，默认 "'Times New Roman',Times,serif"
 * @property {string[]} [skipSymbols] - 跳过的元素符号，默认 ["C", "H"]（碳氢不显示标签）
 * @property {number}   [fontSizeMin] - 最小字号，默认 9
 * @property {number}   [fontSizeMax] - 最大字号，默认 24
 * @property {number}   [fontSizeRatio] - 字号与包围盒高度比值，默认 1.16
 */

/** @type {AtomOverlayOptions} */
const DEFAULT_OPTIONS = {
  fontFamily: "'Times New Roman',Times,serif",
  skipSymbols: ['C', 'H'],
  fontSizeMin: 9,
  fontSizeMax: 24,
  fontSizeRatio: 1.16,
};

/**
 * 在 SVG 元素上对非 C/H 原子用 <text> 覆盖 RDKit 的 <path> 标签。
 *
 * @param {SVGSVGElement} svgEl  - DOM 中的 SVG 根元素
 * @param {object}        mol    - RDKit 分子对象（需有 get_molblock 方法）
 * @param {AtomOverlayOptions} [options]
 */
export function overlayAtomLabels(svgEl, mol, options = {}) {
  if (!svgEl || !mol || typeof mol.get_molblock !== 'function') return;

  const opts = { ...DEFAULT_OPTIONS, ...options };
  const atoms = parseAtoms(mol.get_molblock());
  if (!atoms.length) return;

  const svgNS = 'http://www.w3.org/2000/svg';

  // 按 atom index 预分组 DOM 元素（O(n) 单次遍历）
  /** @type {Record<string, Element[]>} */
  const atomGroups = {};
  for (const el of svgEl.querySelectorAll('[class*="atom-"]')) {
    const cls = el.getAttribute('class') || '';
    if (/\bbond-\d+\b/.test(cls)) continue; // 跳过 bond 元素
    const m = cls.match(/atom-(\d+)/);
    if (m) {
      (atomGroups[m[1]] || (atomGroups[m[1]] = [])).push(el);
    }
  }

  const fragment = document.createDocumentFragment();
  const fontStyle = `font-family:${opts.fontFamily};paint-order:fill;`;

  for (const atom of atoms) {
    if (opts.skipSymbols.includes(atom.symbol)) continue;

    const labelElements = atomGroups[String(atom.index)];
    if (!labelElements || !labelElements.length) continue;

    const boxes = labelElements
      .map((el) => {
        try { return el.getBBox(); } catch (_) { return null; }
      })
      .filter(Boolean);
    const box = unionBBox(boxes);
    if (!box) continue;

    // 隐藏 RDKit 原始 path 标签
    for (const el of labelElements) el.setAttribute('visibility', 'hidden');

    // 创建 <text> 覆盖层
    const text = document.createElementNS(svgNS, 'text');
    const fontSize = Math.max(
      opts.fontSizeMin,
      Math.min(opts.fontSizeMax, box.height * opts.fontSizeRatio),
    );
    text.textContent = atom.symbol;
    text.setAttribute('x', String(box.x + box.width / 2));
    text.setAttribute('y', String(box.y + box.height / 2));
    text.setAttribute('font-size', String(fontSize));
    text.setAttribute('text-anchor', 'middle');
    text.setAttribute('dominant-baseline', 'middle');
    text.setAttribute('class', `chemol-atom-label atom-${atom.index}`);
    text.setAttribute('fill', '#000000');
    text.setAttribute('stroke', 'none');
    text.setAttribute('style', fontStyle);

    fragment.appendChild(text);
  }

  svgEl.appendChild(fragment);
}
