/**
 * RDKit Loader — 管理 RDKit WASM 模块的加载与生命周期。
 *
 * 使用单例模式，确保整个页面只初始化一次 RDKit。
 * @module rdkit-loader
 */

/** @type {string} RDKit WASM 资源的 CDN 基础路径 */
const DEFAULT_CDN = 'https://cdn.jsdelivr.net/npm/@rdkit/rdkit@2024.3.5-1.0.0/dist';

/** @type {Promise<any>|null} 正在进行的加载 Promise（防止并发重复加载） */
let _loadingPromise = null;

/** @type {any|null} 已加载的 RDKit 模块实例 */
let _rdkitModule = null;

/** @type {string} 当前使用的 CDN 路径 */
let _cdnBase = DEFAULT_CDN;

/**
 * 设置 RDKit WASM 资源的 CDN 基础路径。
 * 必须在调用 {@link loadRdkit} 之前设置才生效。
 * 若已加载过，需要调用 {@link resetRdkit} 后重新调用 loadRdkit。
 *
 * @param {string} url - CDN 基础 URL，如 "https://cdn.jsdelivr.net/npm/@rdkit/rdkit@2024.3.5-1.0.0/dist"
 */
export function setRdkitCdn(url) {
  _cdnBase = url;
}

/**
 * 设置自定义 RDKit 构建路径并加载（支持本地或自构建版本）。
 *
 * 当你使用自构建的 RDKit（例如带 MCS 支持的版本）时，将编译产物
 * （RDKit_minimal.js + RDKit_minimal.wasm）放到可访问的目录后，
 * 调用此函数加载。
 *
 * @param {string} basePath - 自定义构建的基路径（URL 或相对路径）
 * @param {string} [jsFile='RDKit_minimal.js'] - JS 文件名（默认 RDKit_minimal.js）
 * @returns {Promise<any>} RDKit 模块对象
 *
 * @example
 * // 从 /rdkit-custom/ 目录加载自构建版本
 * const RDKit = await loadCustomRdkit('/rdkit-custom/');
 * if (RDKit.get_mcs_as_mol) {
 *   console.log('MCS 可用！');
 * }
 *
 * @example
 * // 从本地开发服务器加载
 * const RDKit = await loadCustomRdkit('http://localhost:8080/rdkit/');
 */
export async function loadCustomRdkit(basePath, jsFile = 'RDKit_minimal.js') {
  // 清空缓存，确保重新加载
  _cdnBase = basePath.replace(/\/?$/, '');
  _rdkitModule = null;
  _loadingPromise = null;

  const RDKit = await loadRdkitCore(jsFile);
  return RDKit;
}

/**
 * 重置 RDKit 模块缓存，允许重新加载（如切换 CDN/版本时使用）。
 * 注意：旧模块占用的 WASM 内存需要由调用方确保已释放。
 */
export function resetRdkit() {
  _rdkitModule = null;
  _loadingPromise = null;
}

/**
 * 返回已加载的 RDKit 模块（同步）。
 * 如果尚未加载，返回 null。
 *
 * @returns {any|null}
 */
export function getRdkit() {
  return _rdkitModule;
}

/**
 * 动态注入 RDKit JS 脚本（当页面未通过 <script> 标签加载时使用）。
 *
 * @param {string} [jsFile='RDKit_minimal.js'] - JS 文件名
 * @returns {Promise<void>}
 */
function injectScript(jsFile = 'RDKit_minimal.js') {
  return new Promise((resolve, reject) => {
    if (typeof initRDKitModule === 'function') return resolve();
    const script = document.createElement('script');
    script.src = `${_cdnBase}/${jsFile}`;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('无法加载 RDKit 脚本：' + script.src));
    document.head.appendChild(script);
  });
}

/**
 * 加载 RDKit 的核心实现（内部方法，支持自定义 jsFile 名称）。
 * @param {string} [jsFile='RDKit_minimal.js']
 * @returns {Promise<any>}
 */
async function loadRdkitCore(jsFile = 'RDKit_minimal.js') {
  _loadingPromise = (async () => {
    await injectScript(jsFile);

    if (window.RDKit) {
      _rdkitModule = window.RDKit;
      return _rdkitModule;
    }

    _rdkitModule = await initRDKitModule({
      locateFile: (path) => `${_cdnBase}/${path}`,
    });
    window.RDKit = _rdkitModule;
    return _rdkitModule;
  })();

  try {
    return await _loadingPromise;
  } catch (e) {
    _loadingPromise = null;
    throw e;
  }
}

/**
 * 初始化 RDKit WASM 模块。
 *
 * - 可安全重复调用：已加载时立即返回缓存实例。
 * - 并发调用只会触发一次初始化。
 *
 * @returns {Promise<any>} RDKit 模块对象（挂载到 window.RDKit）
 */
export async function loadRdkit() {
  if (_rdkitModule) return _rdkitModule;
  if (_loadingPromise) return _loadingPromise;
  return loadRdkitCore();
}
