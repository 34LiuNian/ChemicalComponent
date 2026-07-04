/**
 * 分子渲染器 — 将 SMILES 渲染为 SVG 并挂载到 DOM 容器。
 *
 * 这是库的核心编排模块，组合以下子模块：
 * - rdkit-loader    → RDKit WASM 初始化
 * - molblock-utils  → Molblock 解析
 * - svg-utils       → SVG 后处理（颜色/字体/viewBox）
 * - coord-align     → 骨架对齐（可选）
 *
 * @module molecule-renderer
 */

import { loadRdkit } from './rdkit-loader.js';
import { postProcessSvg } from './svg-utils.js';
import { CoordAligner } from './coord-align.js';
import { rotateCoords } from './molblock-utils.js';

// ============================================================================
// 类型定义（JSDoc）
// ============================================================================

/**
 * @typedef {Object} RenderOptions
 * @property {string}        [fontFamily]     - SVG 字体族，默认 "'Times New Roman',Times,serif"
 * @property {CoordAligner}  [aligner]        - 坐标对齐器实例（可选）
 * @property {boolean}       [autoDisposeMol] - 渲染后自动释放 RDKit 分子，默认 true
 * @property {string}        [fontFile]       - RDKit C++ fontFile 路径（需 FS 构建），如 "/fonts/myfont.ttf"
 * @property {number}        [rotateDeg]      - 分子坐标旋转角度（度），正值=逆时针，在坐标对齐后通过 RDKit 原生 molblock API 应用
 */

/**
 * @typedef {Object} BatchRenderEntry
 * @property {string} id      - DOM 容器元素 ID
 * @property {string} smiles  - SMILES 字符串
 * @property {boolean} [large] - 是否为复杂分子（添加 .large CSS class）
 * @property {string} [label] - 分子标签文本
 */

// ============================================================================
// 常量
// ============================================================================

/** @type {RenderOptions} */
const DEFAULT_RENDER_OPTIONS = {
  fontFamily: "'Times New Roman',Times,serif",
  aligner: null,
  autoDisposeMol: true,
};

// ============================================================================
// 私有工具函数
// ============================================================================

/**
 * 从 RDKit 分子对象获取 SVG 字符串。
 * 依次尝试 get_svg_with_highlights → get_svg → get_svg_string。
 *
 * @param {object} mol - RDKit 分子对象
 * @param {RenderOptions} [opts] - 渲染选项
 * @returns {string}
 */
function _getMolSvg(mol, opts = {}) {
  // 构建绘制参数 JSON
  const drawParams = {
    width: -1, height: -1,
    fixedFontSize: 14, minFontSize: 8, maxFontSize: 22,
    bondLineWidth: 1,
    clearBackground: true, useBWAtomPalette: true,
    legend: '', atoms: [], bonds: [],
  };
  // ★ fontFile → RDKit C++ MolDraw2D::drawOptions().fontFile
  if (opts.fontFile) {
    drawParams.fontFile = opts.fontFile;
  }

  // 方法 1：get_svg_with_highlights（保留原子 path 供覆盖层使用）
  if (typeof mol.get_svg_with_highlights === 'function') {
    try {
      return mol.get_svg_with_highlights(JSON.stringify(drawParams));
    } catch (_) { /* 降级 */ }
  }

  // 方法 2：get_svg(-1, -1) 自然坐标尺寸
  if (typeof mol.get_svg === 'function') {
    try { return mol.get_svg(-1, -1); } catch (_) {
      try { return mol.get_svg(); } catch (_) { /* 降级 */ }
    }
  }

  // 方法 3：get_svg_string
  if (typeof mol.get_svg_string === 'function') {
    try { return mol.get_svg_string(-1, -1); } catch (_) { /* 降级 */ }
  }

  return '';
}

// ============================================================================
// 公开 API
// ============================================================================

/**
 * 渲染单个分子到指定 DOM 容器。
 *
 * @param {string}        containerId - DOM 元素 ID
 * @param {string}        smiles      - SMILES 字符串
 * @param {RenderOptions} [options]
 * @returns {Promise<boolean>} 是否渲染成功
 *
 * @example
 * await renderMolecule('molA', 'CCC1=CC(Cl)=CC=C1', {
 *   fontFamily: "'TNRLocal','Times New Roman',Times,serif",
 *   aligner: myAligner,
 * });
 */
export async function renderMolecule(containerId, smiles, options = {}) {
  const RDKit = await loadRdkit();
  if (!RDKit) return false;

  const container = document.getElementById(containerId);
  if (!container) {
    console.warn(`renderMolecule: 找不到容器 #${containerId}`);
    return false;
  }

  const opts = { ...DEFAULT_RENDER_OPTIONS, ...options };

  let mol = null;
  try {
    mol = RDKit.get_mol(smiles);
    if (!mol) {
      container.innerHTML = '<div class="chemol-error">无效 SMILES</div>';
      return false;
    }

    // 坐标对齐（如果有对齐器）
    if (opts.aligner) {
      await opts.aligner.align(mol);
    } else if (typeof mol.set_new_coords === 'function') {
      mol.set_new_coords();
    }

    // 分子坐标旋转（RDKit 原生 API：操作 molblock 坐标层）
    if (opts.rotateDeg) {
      const mb = mol.get_molblock();
      const rotatedMb = rotateCoords(mb, opts.rotateDeg);
      if (rotatedMb !== mb) {
        mol.delete();
        mol = RDKit.get_mol(rotatedMb);
      }
    }

    // 生成 SVG（传入 opts 以支持 fontFile 等原生绘制选项）
    let svg = _getMolSvg(mol, opts);
    svg = postProcessSvg(svg, { fontFamily: opts.fontFamily });

    if (!svg || !svg.includes('<svg')) {
      container.innerHTML = '<div class="chemol-error">无法生成 SVG</div>';
      return false;
    }

    // 写入 DOM
    container.innerHTML = svg;

    return true;
  } catch (err) {
    console.error(`renderMolecule(${containerId}):`, err);
    container.innerHTML = '<div class="chemol-error">渲染失败</div>';
    return false;
  } finally {
    if (mol && opts.autoDisposeMol) {
      try { mol.delete(); } catch (_) { /* noop */ }
    }
  }
}

/**
 * 批量渲染一组分子。
 *
 * @param {BatchRenderEntry[]} entries - 分子条目数组
 * @param {RenderOptions}      [options]
 * @returns {Promise<PromiseSettledResult<boolean>[]>}
 *
 * @example
 * await renderMolecules([
 *   { id: 'molA', smiles: 'CCC1=CC(Cl)=CC=C1', label: 'A' },
 *   { id: 'molB', smiles: 'CC(Br)C1=CC(Cl)=CC=C1', label: 'B' },
 * ], { aligner });
 */
export async function renderMolecules(entries, options = {}) {
  return Promise.allSettled(
    entries.map((e) => renderMolecule(e.id, e.smiles, options)),
  );
}

export { CoordAligner } from './coord-align.js';
