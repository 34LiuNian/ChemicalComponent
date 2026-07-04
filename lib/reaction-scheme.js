/**
 * ReactionScheme — 反应式布局生成器。
 *
 * 从结构化数据生成分子-箭头交替的反应式 HTML 结构，
 * 并将渲染逻辑封装在内部，彻底解耦"数据"与"展示"。
 *
 * @module reaction-scheme
 *
 * @example
 * const scheme = new ReactionScheme('#reaction-container', [
 *   { type: 'mol', id: 'molA', smiles: 'CCC', label: 'A' },
 *   { type: 'arrow', top: 'Br₂', bottom: 'AIBN' },
 *   { type: 'mol', id: 'molB', smiles: 'CCBr', label: 'B' },
 * ]);
 * await scheme.render({ fontFamily: "'Times New Roman',Times,serif" });
 * scheme.dispose();
 */

import { renderMolecules } from './molecule-renderer.js';
import { CoordAligner } from './coord-align.js';

// ============================================================================
// 类型定义（JSDoc）
// ============================================================================

/**
 * @typedef {Object} MolStep   - 分子步骤
 * @property {'mol'}     type
 * @property {string}    id       - DOM 元素 ID
 * @property {string}    smiles   - SMILES 字符串
 * @property {string}    [label]  - 分子标签文字（如 "A", "B"）
 * @property {boolean}   [large]  - 是否为复杂分子
 * @property {number}    [width]  - SVG 宽度（像素），默认 -1（自然尺寸）
 * @property {number}    [height] - SVG 高度（像素），默认 -1（自然尺寸）
 */

/**
 * @typedef {Object} ArrowStep - 箭头步骤
 * @property {'arrow'}  type
 * @property {string}   top      - 箭头上方条件文本（支持 HTML）
 * @property {string}   [bottom] - 箭头下方条件文本（支持 HTML）
 */

/** @typedef {MolStep | ArrowStep} SchemeStep */

/**
 * @typedef {Object} SchemeOptions
 * @property {string}  [fontFamily]          - SVG 字体
 * @property {string}  [molClass]            - 分子容器的额外 CSS class
 * @property {string}  [arrowClass]          - 箭头容器的额外 CSS class
 * @property {object}  [aligner]             - CoordAligner 实例
 * @property {boolean|{rotateDeg?:number}} [autoAlign]
 *   - true：自动检测公共骨架并对齐
 *   - { rotateDeg: -30 }：对齐后再旋转 -30°
 */

// ============================================================================
// 内部 ID 生成
// ============================================================================

let _uidCounter = 0;
function uid() { return `cs-${++_uidCounter}`; }

// ============================================================================
// 私有：构建 DOM
// ============================================================================

/**
 * 创建分子包装器 DOM。
 * @param {MolStep} step
 * @returns {{ wrapper: HTMLElement, container: HTMLElement }}
 */
function _buildMolWrapper(step) {
  const wrapper = document.createElement('div');
  wrapper.className = 'chemol-mol-wrapper';

  const container = document.createElement('div');
  container.id = step.id;
  container.className = 'chemol-mol-container' + (step.large ? ' chemol-large' : '');
  container.textContent = '⏳';  // loading indicator
  wrapper.appendChild(container);

  if (step.label) {
    const label = document.createElement('div');
    label.className = 'chemol-mol-label';
    label.textContent = step.label;
    wrapper.appendChild(label);
  }

  return { wrapper, container };
}

/**
 * 创建箭头包装器 DOM。
 * @param {ArrowStep} step
 * @returns {HTMLElement}
 */
function _buildArrowWrapper(step) {
  const wrapper = document.createElement('div');
  wrapper.className = 'chemol-arrow-wrapper';

  if (step.top) {
    const top = document.createElement('div');
    top.className = 'chemol-arrow-text chemol-arrow-top';
    top.innerHTML = step.top;
    wrapper.appendChild(top);
  }

  const arrow = document.createElement('div');
  arrow.className = 'chemol-arrow';
  wrapper.appendChild(arrow);

  if (step.bottom) {
    const bottom = document.createElement('div');
    bottom.className = 'chemol-arrow-text chemol-arrow-bottom';
    bottom.innerHTML = step.bottom;
    wrapper.appendChild(bottom);
  }

  return wrapper;
}

// ============================================================================
// ReactionScheme 类
// ============================================================================

export class ReactionScheme {
  /** @type {HTMLElement} */
  _container;

  /** @type {SchemeStep[]} */
  _steps;

  /** @type {MolStep[]} 只读的分子步骤列表（用于渲染） */
  _molSteps;

  /** @type {string} 容器的唯一 class，用于限域 resize 回调 */
  _scopeClass;

  /** @type {(() => void) | null} resize 事件解绑函数 */
  _unbindResize = null;

  /** @type {ScheduleOptions | null} 最近的渲染选项（用于重渲染） */
  _lastOptions = null;

  /**
   * @param {string | HTMLElement} container - 容器元素或其 CSS 选择器
   * @param {SchemeStep[]} steps - 反应式步骤定义
   */
  constructor(container, steps) {
    this._container =
      typeof container === 'string'
        ? document.querySelector(container)
        : container;
    if (!this._container) throw new Error(`ReactionScheme: 找不到容器`);

    this._steps = steps;
    this._molSteps = /** @type {MolStep[]} */ (steps.filter((s) => s.type === 'mol'));
    this._scopeClass = `cs-scope-${uid()}`;
  }

  /**
   * 将步骤数据渲染为 DOM 结构，并挂载到容器。
   * 可以多次调用（会清空重建）。
   *
   * @returns {this}
   */
  build() {
    this._container.innerHTML = '';
    this._container.className = `chemol-reaction-row ${this._scopeClass}`;

    for (const step of this._steps) {
      if (step.type === 'mol') {
        this._container.appendChild(_buildMolWrapper(step).wrapper);
      } else if (step.type === 'arrow') {
        this._container.appendChild(_buildArrowWrapper(step));
      }
    }

    return this;
  }

  /**
   * 批量渲染所有分子。
   *
   * @param {import('./molecule-renderer.js').RenderOptions & SchemeOptions} [options]
   * @returns {Promise<boolean>} 是否全部成功
   */
  async render(options = {}) {
    // 确保 options 不为 null（resize 重渲染可能传入 null）
    options = options || {};

    // 保存本次选项，供 resize 重渲染使用
    this._lastOptions = options;

    // 确保 DOM 已构建
    if (!this._container.hasChildNodes()) {
      this.build();
    }

    // ── autoAlign 简写 ──────────────────────────────────
    let aligner = options.aligner || null;
    if (options.autoAlign && !aligner) {
      const cfg = typeof options.autoAlign === 'object' ? options.autoAlign : {};
      aligner = await CoordAligner.fromSteps(this._steps, cfg);
    }

    const renderOpts = {
      fontFamily: options.fontFamily,
      fontFile: options.fontFile,
      aligner,
      rotateDeg: options.rotateDeg,
    };

    const results = await renderMolecules(this._molSteps, renderOpts);
    const allOk = results.every((r) => r.status === 'fulfilled' && r.value);

    if (!allOk) {
      const failed = results.filter((r) => r.status === 'rejected' || !r.value);
      console.warn(`ReactionScheme: ${failed.length}/${results.length} 个分子渲染失败`);
    }

    return allOk;
  }

  /**
   * 启用窗口 resize 防抖重渲染。
   * 可以自定义防抖延迟，传入 0 或 false 取消之前绑定的监听。
   *
   * @param {number} [delay=500] 防抖延迟（毫秒），传入 0 禁用
   * @returns {this}
   */
  enableResize(delay = 500) {
    // 解绑旧的
    if (this._unbindResize) {
      this._unbindResize();
      this._unbindResize = null;
    }

    if (delay <= 0) return this;

    let timer;
    const handler = () => {
      clearTimeout(timer);
      timer = setTimeout(() => this.render(this._lastOptions), delay);
    };
    window.addEventListener('resize', handler);
    this._unbindResize = () => window.removeEventListener('resize', handler);

    return this;
  }

  /**
   * 获取分子步骤列表。
   * @returns {MolStep[]}
   */
  getMoleculeSteps() {
    return [...this._molSteps];
  }

  /**
   * 释放对齐器（如果有）及 resize 监听器。
   */
  dispose() {
    if (this._unbindResize) {
      this._unbindResize();
      this._unbindResize = null;
    }
  }
}

/**
 * 便捷函数：一行完成创建 + 构建 + 渲染。
 *
 * @param {string | HTMLElement} container
 * @param {SchemeStep[]} steps
 * @param {import('./molecule-renderer.js').RenderOptions & SchemeOptions} [options]
 * @returns {Promise<ReactionScheme>}
 *
 * @example
 * const scheme = await renderReactionScheme('#root', steps, { fontFamily, aligner });
 */
export async function renderReactionScheme(container, steps, options = {}) {
  const scheme = new ReactionScheme(container, steps);
  scheme.build();

  // resize 是 scheme 级选项，不传给 render()
  const { resize, ...renderOpts } = options;

  await scheme.render(renderOpts);

  if (resize !== false) {
    scheme.enableResize(typeof resize === 'number' ? resize : 500);
  }

  return scheme;
}
