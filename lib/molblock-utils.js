/**
 * Molblock 工具函数 — 纯函数，对 RDKit molblock 字符串进行解析与变换。
 *
 * 所有函数均无副作用，不依赖 DOM，可在 Node/Worker 中使用。
 * @module molblock-utils
 */

/**
 * 从 molblock 中提取原子信息。
 *
 * @param {string} molblock - RDKit 生成的 V2000/V3000 molblock 字符串
 * @returns {{ index: number, symbol: string }[]} 原子数组，index 从 0 开始
 *
 * @example
 * const atoms = parseAtoms(mol.get_molblock());
 * // [{ index: 0, symbol: "C" }, { index: 1, symbol: "Cl" }, ...]
 */
export function parseAtoms(molblock) {
  const lines = String(molblock || '').split(/\r?\n/);
  const countsIdx = lines.findIndex(
    (line) => /V2000/.test(line) && /^\s*\d+\s+\d+/.test(line),
  );
  if (countsIdx === -1) return [];

  const atomCount = parseInt(lines[countsIdx].slice(0, 3), 10);
  if (!Number.isFinite(atomCount) || atomCount <= 0) return [];

  /** @type {{ index: number, symbol: string }[]} */
  const atoms = [];
  for (let i = 0; i < atomCount; i++) {
    const line = lines[countsIdx + 1 + i] || '';
    const parts = line.trim().split(/\s+/);
    const symbol = parts[3];
    if (symbol) atoms.push({ index: i, symbol });
  }
  return atoms;
}

/**
 * 在 molblock 层面对所有原子坐标进行 2D 旋转。
 * 仅改变坐标，不影响键、电荷等其它信息。
 *
 * @param {string} molblock - 原始 molblock
 * @param {number} angleDeg - 旋转角度（度），正值 = 逆时针
 * @returns {string} 旋转后的 molblock
 */
export function rotateCoords(molblock, angleDeg) {
  const rad = (angleDeg * Math.PI) / 180;
  const cosA = Math.cos(rad);
  const sinA = Math.sin(rad);

  const lines = molblock.split('\n');
  const countsIdx = lines.findIndex(
    (line) => /V2000/.test(line) && /^\s*\d+\s+\d+/.test(line),
  );
  if (countsIdx === -1) return molblock;

  const atomCount = parseInt(lines[countsIdx].slice(0, 3), 10);
  if (!Number.isFinite(atomCount) || atomCount <= 0) return molblock;

  for (let i = 0; i < atomCount; i++) {
    const li = countsIdx + 1 + i;
    const line = lines[li];
    const x = parseFloat(line.slice(0, 10));
    const y = parseFloat(line.slice(10, 20));
    const z = parseFloat(line.slice(20, 30));
    const rest = line.slice(30);

    const nx = x * cosA - y * sinA;
    const ny = x * sinA + y * cosA;

    lines[li] =
      nx.toFixed(4).padStart(10) +
      ny.toFixed(4).padStart(10) +
      z.toFixed(4).padStart(10) +
      rest;
  }
  return lines.join('\n');
}
