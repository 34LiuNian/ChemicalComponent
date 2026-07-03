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
 *
 * @param {string} url - CDN 基础 URL，如 "https://cdn.jsdelivr.net/npm/@rdkit/rdkit@2024.3.5-1.0.0/dist"
 */
export function setRdkitCdn(url) {
  _cdnBase = url;
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
 * @returns {Promise<void>}
 */
function injectScript() {
  return new Promise((resolve, reject) => {
    if (typeof initRDKitModule === 'function') return resolve();
    const script = document.createElement('script');
    script.src = `${_cdnBase}/RDKit_minimal.js`;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('无法加载 RDKit 脚本：' + script.src));
    document.head.appendChild(script);
  });
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

  _loadingPromise = (async () => {
    await injectScript();

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
