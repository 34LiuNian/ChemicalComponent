/**
 * 坐标对齐 — 基于公共子结构的分子 2D 坐标对齐。
 *
 * 通过 RDKit 的 generate_aligned_coords 将一组分子按模板骨架对齐，
 * 保证反应式中苯环等公共结构的朝向一致。
 *
 * @module coord-align
 */

import { loadRdkit } from './rdkit-loader.js';
import { rotateCoords } from './molblock-utils.js';

/**
 * 对齐器配置。
 *
 * @typedef {Object} AlignerConfig
 * @property {string}     templateSmiles - 公共骨架的 SMILES（如 "CC1=CC(Cl)=CC=C1"）
 * @property {number}     [rotateDeg]    - 模板生成后额外旋转的角度（molblock 层面），默认 0
 * @property {number}     [normalize]    - normalize_depiction 的 canonicalize 参数，默认 -1
 */

/**
 * 分子坐标对齐器。
 *
 * @example
 * const aligner = new CoordAligner({ templateSmiles: 'CC1=CC(Cl)=CC=C1', rotateDeg: -30 });
 * const mol = RDKit.get_mol('CCC1=CC(Cl)=CC=C1');
 * aligner.align(mol);  // mol 的坐标被对齐到模板朝向
 * aligner.dispose();   // 释放模板分子内存
 */
export class CoordAligner {
  /** @type {any|null} RDKit 模板分子 */
  _templateMol = null;

  /** @type {boolean} 是否已尝试过初始化（无论成功/失败，不重复） */
  _initAttempted = false;

  /** @type {AlignerConfig} */
  _config;

  /**
   * 构造函数只保存配置，模板分子延迟到首次 align() 时创建。
   * 这样可以在 RDKit 尚未加载时就实例化 CoordAligner。
   *
   * @param {AlignerConfig} config
   */
  constructor(config) {
    this._config = { rotateDeg: 0, normalize: -1, ...config };
  }

  /** @private 确保模板分子已初始化（懒加载 + 幂等） */
  async _ensureTemplate() {
    if (this._initAttempted) return;
    this._initAttempted = true;

    const RDKit = await loadRdkit();
    if (!RDKit) {
      console.warn('CoordAligner: RDKit 加载失败，对齐功能不可用');
      return;
    }

    try {
      let tmpl = RDKit.get_mol(this._config.templateSmiles);
      if (!tmpl) return;

      // 生成 2D 坐标
      if (typeof tmpl.set_new_coords === 'function') {
        tmpl.set_new_coords();
      } else {
        tmpl.get_svg(10, 10);
      }

      // 归一化朝向
      if (
        typeof tmpl.normalize_depiction === 'function' &&
        this._config.normalize !== 0
      ) {
        tmpl.normalize_depiction(this._config.normalize, -1);
      }

      // molblock 层面额外旋转
      if (this._config.rotateDeg) {
        const mb = tmpl.get_molblock();
        const rotatedMb = rotateCoords(mb, this._config.rotateDeg);
        if (rotatedMb !== mb) {
          tmpl.delete();
          tmpl = RDKit.get_mol(rotatedMb);
        }
      }

      this._templateMol = tmpl;
    } catch (e) {
      console.warn('CoordAligner: 模板初始化失败', e);
    }
  }

  /**
   * 将目标分子的坐标对齐到模板骨架。
   * 首次调用会自动等待 RDKit 加载并创建模板分子。
   *
   * @param {object} mol - RDKit 分子对象
   * @returns {Promise<boolean>} 是否对齐成功
   */
  async align(mol) {
    await this._ensureTemplate();
    if (!this._templateMol || !mol) return false;

    try {
      mol.generate_aligned_coords(
        this._templateMol,
        JSON.stringify({ acceptFailure: true }),
      );
      return true;
    } catch (_) {
      // 降级：用 RDKit 默认坐标生成
      if (typeof mol.set_new_coords === 'function') {
        mol.set_new_coords();
      }
      return false;
    }
  }

  /**
   * 释放模板分子占用的 WASM 内存。
   */
  dispose() {
    if (this._templateMol) {
      try { this._templateMol.delete(); } catch (_) { /* noop */ }
      this._templateMol = null;
    }
  }
}
