// 3D-просмотр модели (three.js).
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { matColor } from './model.js';

export class Viewer {
  constructor(el, model, onPick) {
    this.el = el; this.model = model; this.onPick = onPick;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(getComputedStyle(document.body).getPropertyValue('--bg3d').trim() || '#eef1f4');
    this.camera = new THREE.PerspectiveCamera(40, 1, 5, 200000);
    this.renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    el.appendChild(this.renderer.domElement);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.addEventListener('change', () => this.render());

    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x8a8f99, 2.2));
    const dl = new THREE.DirectionalLight(0xffffff, 1.6); dl.position.set(1, 1.6, 1.2); this.scene.add(dl);
    const dl2 = new THREE.DirectionalLight(0xffffff, 0.5); dl2.position.set(-1, 0.4, -1); this.scene.add(dl2);

    this.root = new THREE.Group(); this.scene.add(this.root);
    this.holeGroup = new THREE.Group(); this.holeGroup.visible = false; this.scene.add(this.holeGroup);
    this.items = [];
    this.selected = null; this.ghost = false; this.explode = 0; this.block = ''; this.showFurn = true;
    this.build();
    this.fit('iso');

    new ResizeObserver(() => this.resize()).observe(el);
    this.resize();
    const tick = () => { if (this.controls.update()) this.render(); requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
    this.bindPick();
  }

  build() {
    const lineMat = new THREE.LineBasicMaterial({ color: 0x1b1f24, transparent: true, opacity: 0.45 });
    const box = new THREE.Box3();
    for (const p of this.model.parts) {
      if (!p.outer.length) continue;
      const shape = new THREE.Shape(p.outer.map(q => new THREE.Vector2(q[0], q[1])));
      for (const l of p.loops) if (l.pts !== p.outer) shape.holes.push(new THREE.Path(l.pts.map(q => new THREE.Vector2(q[0], q[1]))));
      const geo = new THREE.ExtrudeGeometry(shape, { depth: p.t, bevelEnabled: false, curveSegments: 8 });
      geo.translate(0, 0, p.z0);
      const col = p.buy ? '#a7adb5' : (p.col || matColor(p.mat));
      const mat = new THREE.MeshStandardMaterial({ color: col, roughness: p.buy ? 0.4 : 0.85, metalness: p.buy ? 0.5 : 0, transparent: true, opacity: 1,
        polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 });
      const mesh = new THREE.Mesh(geo, mat);
      const lines = new THREE.LineSegments(new THREE.EdgesGeometry(geo, 25), lineMat.clone());
      const g = new THREE.Group(); g.add(mesh); g.add(lines);
      const m = p.m;
      const M = new THREE.Matrix4().set(m[3], m[6], m[9], m[0], m[4], m[7], m[10], m[1], m[5], m[8], m[11], m[2], 0, 0, 0, 1);
      const inner = new THREE.Group(); inner.matrixAutoUpdate = false; inner.matrix.copy(M); inner.add(g);
      const outer = new THREE.Group(); outer.add(inner);
      this.root.add(outer);
      mesh.userData.item = { part: p, obj: outer, mesh, lines, base: col };
      this.items.push(mesh.userData.item);
    }
    // Фурнитура без своей геометрии — полупрозрачный габарит.
    const withGeo = new Set(this.model.parts.filter(p => p.buy).map(p => p.fi));
    this.furnBoxes = new THREE.Group(); this.scene.add(this.furnBoxes);
    (this.model.furn || []).forEach((f, i) => {
      if (withGeo.has(i) || !f.gab) return;
      const s = [f.gab[3] - f.gab[0], f.gab[4] - f.gab[1], f.gab[5] - f.gab[2]];
      if (s.some(v => v <= 0)) return;
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(...s), new THREE.MeshStandardMaterial({ color: 0x7d8792, transparent: true, opacity: 0.55, metalness: 0.4, roughness: 0.4 }));
      mesh.position.set(f.gab[0] + s[0] / 2, f.gab[1] + s[1] / 2, f.gab[2] + s[2] / 2);
      this.furnBoxes.add(mesh);
    });
    // Отверстия
    const hm = new THREE.MeshBasicMaterial({ color: 0xd2232a });
    for (const h of this.model.holes || []) {
      const r = h.dia / 2, len = Math.max(h.dep, 2);
      const c = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 12), hm);
      const d = new THREE.Vector3(...h.d).normalize();
      c.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d);
      c.position.set(...h.p).addScaledVector(d, len / 2);
      this.holeGroup.add(c);
    }
    this.root.updateMatrixWorld(true);
    for (const it of this.items) {
      box.setFromObject(it.obj);
      it.center = box.getCenter(new THREE.Vector3());
    }
    this.bbox = new THREE.Box3().setFromObject(this.root);
    this.center = this.bbox.getCenter(new THREE.Vector3());
  }

  resize() {
    const w = this.el.clientWidth, h = this.el.clientHeight;
    if (!w || !h) return;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
    this.render();
  }
  render() { this.renderer.render(this.scene, this.camera); }

  visibleBox() {
    const b = new THREE.Box3();
    for (const it of this.items) if (it.obj.visible && it.mesh.material.opacity > 0.5) b.expandByObject(it.obj);
    return b.isEmpty() ? this.bbox.clone() : b;
  }

  fit(view = 'iso', box) {
    box = box || this.visibleBox();
    const c = box.getCenter(new THREE.Vector3()), s = box.getSize(new THREE.Vector3());
    const r = Math.max(s.length() / 2, 50);
    const vf = THREE.MathUtils.degToRad(this.camera.fov / 2);
    const hf = Math.atan(Math.tan(vf) * this.camera.aspect);
    const dist = r / Math.sin(Math.min(vf, hf)) * 1.02;
    const dirs = { front: [0, 0, 1], side: [1, 0, 0], top: [0, 1, 0.0001], iso: [0.55, 0.45, 1] };
    const d = new THREE.Vector3(...(dirs[view] || dirs.iso)).normalize();
    this.camera.position.copy(c).addScaledVector(d, dist);
    this.controls.target.copy(c);
    this.camera.near = dist / 100; this.camera.far = dist * 20; this.camera.updateProjectionMatrix();
    this.controls.update(); this.render();
  }

  setExplode(k) {
    this.explode = k;
    for (const it of this.items) it.obj.position.copy(it.center).sub(this.center).multiplyScalar(k);
    this.render();
  }

  applyVisibility() {
    for (const it of this.items) {
      const p = it.part;
      it.obj.visible = p.buy ? (this.showFurn && !this.block) : (!this.block || p.block === this.block);
      const sel = this.selected && this.selected.part === p;
      const op = (this.ghost && this.selected && !sel) ? 0.12 : 1;
      it.mesh.material.opacity = op; it.mesh.material.depthWrite = op === 1;
      it.lines.material.opacity = op === 1 ? 0.45 : 0.08;
      it.mesh.material.emissive.set(sel ? 0xff7a00 : 0x000000);
      it.mesh.material.emissiveIntensity = sel ? 0.4 : 0;
    }
    this.furnBoxes.visible = this.showFurn && !this.block;
    this.render();
  }

  setBlock(b) { this.block = b; this.applyVisibility(); this.fit('iso'); }

  select(part, opts = {}) {
    this.selected = part ? this.items.find(it => it.part === part) : null;
    this.ghost = !!(part && opts.ghost);
    this.applyVisibility();
    if (part && opts.focus) {
      const b = new THREE.Box3().setFromObject(this.selected.obj);
      const all = this.visibleBox();
      // Показываем деталь в контексте изделия, но ближе.
      const mix = new THREE.Box3(b.min.clone().lerp(all.min, 0.5), b.max.clone().lerp(all.max, 0.5));
      this.fit('iso', mix);
    }
  }

  bindPick() {
    const ray = new THREE.Raycaster(), v = new THREE.Vector2();
    let down = null;
    const cv = this.renderer.domElement;
    cv.addEventListener('pointerdown', e => { down = [e.clientX, e.clientY]; });
    cv.addEventListener('pointerup', e => {
      if (!down || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 6) return;
      const r = cv.getBoundingClientRect();
      v.set((e.clientX - r.left) / r.width * 2 - 1, -(e.clientY - r.top) / r.height * 2 + 1);
      ray.setFromCamera(v, this.camera);
      const meshes = this.items.filter(it => it.obj.visible && it.mesh.material.opacity > 0.5).map(it => it.mesh);
      const hit = ray.intersectObjects(meshes, false)[0];
      this.onPick(hit ? hit.object.userData.item.part : null);
    });
  }

  toggleHoles(on) { this.holeGroup.visible = on; this.render(); }
  toggleFurn(on) { this.showFurn = on; this.applyVisibility(); }
}
