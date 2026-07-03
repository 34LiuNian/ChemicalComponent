/**
 * ChemolRenderer — RDKit 分子渲染库入口
 *
 * 一个轻量的、模块化的 RDKit JS 分子渲染库，专注于：
 * - 化学反应式排版（SMILES → SVG）
 * - Times New Roman 字体支持（原子标签 <text> 覆盖）
 * - 公共骨架坐标对齐
 * - 批量渲染 & 生命周期管理
 *
 * @module chemol-renderer
 * @example
 * import { renderMolecule, renderMolecules, CoordAligner, setRdkitCdn } from './lib/index.js';
 *
 * setRdkitCdn('https://cdn.jsdelivr.net/npm/@rdkit/rdkit@2024.3.5-1.0.0/dist');
 *
 * const aligner = new CoordAligner({ templateSmiles: 'CC1=CC(Cl)=CC=C1' });
 * await renderMolecules([
 *   { id: 'molA', smiles: 'CCC1=CC(Cl)=CC=C1' },
 *   { id: 'molB', smiles: 'CC(Br)C1=CC(Cl)=CC=C1' },
 * ], { aligner });
 * aligner.dispose();
 */

// 主 API
export {
  renderMolecule,
  renderMolecules,
  loadRdkit,
  getRdkit,
  setRdkitCdn,
  loadCustomRdkit,
  resetRdkit,
} from './molecule-renderer.js';

// 反应式布局
export { ReactionScheme, renderReactionScheme } from './reaction-scheme.js';

// 子模块（高级用法）
export { CoordAligner } from './coord-align.js';
export {
  postProcessSvg,
  normalizeColors,
  injectViewBox,
  injectFontFamily,
} from './svg-utils.js';
export { overlayAtomLabels } from './atom-overlay.js';
export { parseAtoms, rotateCoords } from './molblock-utils.js';
