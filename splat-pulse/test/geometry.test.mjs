import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { createGeometry, perspective, lookAt, multiply } = require('../src/geometry.js');
let passed = 0;
function test(name, fn) {
  fn();
  passed++;
  console.log('✓ ' + name);
}

test('固定种子生成三种完整形态和元数据', () => {
  const scene = createGeometry(8192);
  assert.equal(scene.count, 8192);
  assert.equal(scene.positions.length, 3);
  for (const positions of scene.positions) {
    assert.equal(positions.length, 8192 * 4);
    assert.ok(positions.every(Number.isFinite));
    assert.ok(positions.some((value) => value !== 0));
  }
  assert.equal(scene.normals.length, 8192 * 4);
  assert.equal(scene.meta.length, 8192 * 4);
});

test('几何生成可复现，形态不相同', () => {
  const a = createGeometry(4096, 42);
  const b = createGeometry(4096, 42);
  assert.deepEqual(a.positions[0], b.positions[0]);
  assert.notDeepEqual(a.positions[0], a.positions[1]);
  assert.notDeepEqual(a.positions[1], a.positions[2]);
});

test('主形态有真实三维纵深，不是平面点云', () => {
  const scene = createGeometry(8192);
  const extents = [0, 1, 2].map((axis) => {
    let min = Infinity, max = -Infinity;
    for (let i = 1400; i < scene.count; i++) {
      const v = scene.positions[0][i * 4 + axis];
      min = Math.min(min, v); max = Math.max(max, v);
    }
    return max - min;
  });
  assert.ok(extents.every((extent) => extent > 1), extents.join(','));
});

test('背景尘埃不随形态移动，所有高斯尺度为正', () => {
  const scene = createGeometry(4096);
  for (let i = 0; i < 100; i++) {
    for (let axis = 0; axis < 3; axis++) {
      assert.equal(scene.positions[0][i * 4 + axis], scene.positions[1][i * 4 + axis]);
      assert.equal(scene.positions[1][i * 4 + axis], scene.positions[2][i * 4 + axis]);
    }
  }
  for (let i = 0; i < scene.count; i++) assert.ok(scene.normals[i * 4 + 3] > 0);
});

test('相机矩阵有限且保持投影方向', () => {
  const view = lookAt([0, 0, 7.5], [0, 0, 0], [0, 1, 0]);
  const projection = perspective(Math.PI / 4, 1.6, 0.08, 80);
  const matrix = multiply(projection, view);
  assert.equal(matrix.length, 16);
  assert.ok(matrix.every(Number.isFinite));
  assert.equal(view[14], -7.5);
  assert.ok(Math.abs(matrix[15] - 7.5) < 0.001);
  assert.ok(matrix[14] > 7);
});

console.log(`\n${passed} geometry tests passed`);
