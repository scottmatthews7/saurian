// Skin our PROCEDURAL T-Rex (procmesh/trex.js) onto an ALREADY-LOADED rigged
// Quaternius trex.glb's OWN skeleton + OWN animation clips — by reusing the rig,
// not authoring animation. Game-integrated port of procgen/glb-skin.mjs.
//
// Approach (a reference-relative POSE RETARGET; no per-clip re-keying):
//   1. The glb is already imported by the game's loadDino (its skeleton drives
//      its own mesh; its 6 clips Walk/Run/Attack/Death/Idle/Jump are untouched).
//   2. Build a SECOND ("target") skeleton with the SAME hierarchy + bone names.
//      Each target bone's REST is refit onto OUR mesh: positioned at the matching
//      point on our (horizontal) anatomy, oriented to match the source bone's
//      rest orientation captured RELATIVE to a stable reference node.
//   3. Skin our mesh to the target skeleton (weights by proximity to the refit
//      bone segments, restricted per body part so a belly vert never grabs a leg
//      bone).
//   4. Every frame, LIVE-MIRROR: read each source bone's current pose RELATIVE
//      to the reference node and set the matching target bone to the same
//      reference-relative pose. Working relative to the glb's own import root
//      makes the retarget INVARIANT to the game moving / yawing / scaling that
//      root every frame — game motion is applied ONCE by parenting our target
//      armature + meshes under the same reference node, so the mirror only ever
//      transfers the authored animation, never the gameplay transform.
//
// Reads window.BABYLON (vendored global).

// Rest target positions in OUR model space (metres; +Z forward, Y up), read off
// trex.js's loft stations. .L mirrors .R (negate X). These place each glb bone
// on our horizontal anatomy.
const T = {
  root: [0, 0.05, -0.95],
  Body: [0, 3.42, -0.50],
  Hips: [0, 3.45, -1.05],
  Torso: [0, 3.42, 0.70],
  Shoulders: [0, 3.55, 2.20],
  Neck: [0, 4.00, 3.40],
  Head: [0, 4.50, 4.70],
  Back: [0, 3.43, -1.50],
  Tail1: [0, 3.42, -2.40],
  Tail2: [0, 3.38, -3.70],
  Tail3: [0, 3.35, -5.00],
  Tail4: [0, 3.34, -6.20],
  Tail5: [0, 3.34, -7.40],
  "BackLeg.R": [0.55, 3.35, -0.85],
  "BackUpLeg.R": [0.90, 2.55, -0.50],
  "BackLowLeg.R": [0.95, 1.50, -0.15],
  "BackFoot.R": [0.82, 0.18, -0.30],
  "FrontLeg.R": [0.60, 3.30, 2.35],
  "FrontUpLeg.R": [0.90, 2.95, 2.40],
  "FrontLowLeg.R": [0.95, 2.60, 2.60],
  "FrontFoot.R": [0.88, 2.45, 3.00],
};
for (const k of Object.keys(T)) {
  if (k.endsWith(".R")) { const v = T[k]; T[k.slice(0, -2) + ".L"] = [-v[0], v[1], v[2]]; }
}

// Candidate bones per trex.js TREX_PART id (which bones a vertex may bind to).
const PART_BONES = {
  0: ["Body", "Hips", "Torso", "Shoulders", "Neck", "Head", "Back",
      "Tail1", "Tail2", "Tail3", "Tail4", "Tail5"],          // BODY
  1: ["Neck", "Head"],                                        // HEAD (jaw/teeth/eyes)
  2: ["FrontLeg.R", "FrontUpLeg.R", "FrontLowLeg.R", "FrontFoot.R"], // ARM_R
  3: ["FrontLeg.L", "FrontUpLeg.L", "FrontLowLeg.L", "FrontFoot.L"], // ARM_L
  4: ["BackLeg.R", "BackUpLeg.R", "BackLowLeg.R", "BackFoot.R"],     // LEG_R
  5: ["BackLeg.L", "BackUpLeg.L", "BackLowLeg.L", "BackFoot.L"],     // LEG_L
};

const MAX_INFLUENCERS = 4;

function decompose(B, m) {
  const s = new B.Vector3(), q = new B.Quaternion(), t = new B.Vector3();
  m.decompose(s, q, t);
  return { s, q, t };
}
function rotateVec(B, q, v) {
  const out = new B.Vector3();
  v.rotateByQuaternionToRef(q, out);
  return out;
}
function distToSeg(B, p, a, b) {
  const ab = b.subtract(a);
  const len2 = B.Vector3.Dot(ab, ab) || 1e-9;
  let tt = B.Vector3.Dot(p.subtract(a), ab) / len2;
  tt = Math.max(0, Math.min(1, tt));
  return B.Vector3.Distance(p, a.add(ab.scale(tt)));
}
function unionBounds(B, meshes) {
  let mn = new B.Vector3(1e9, 1e9, 1e9), mx = new B.Vector3(-1e9, -1e9, -1e9);
  for (const m of meshes) {
    m.computeWorldMatrix(true); m.refreshBoundingInfo(true);
    const bb = m.getBoundingInfo().boundingBox;
    mn = B.Vector3.Minimize(mn, bb.minimumWorld); mx = B.Vector3.Maximize(mx, bb.maximumWorld);
  }
  return { mn, mx };
}

/**
 * Skin our procedural creature onto an already-imported rig and wire the live
 * mirror. `rig` is { skeleton, renderableMeshes, refNode } where refNode is the
 * stable node the mirror reads bone poses relative to AND under which our target
 * armature + meshes are parented (so the game's per-frame root motion applies
 * once, via parenting, and never leaks into the retarget).
 *
 * IMPORTANT: call BEFORE the game scales/moves refNode, with the source skeleton
 * at its authored rest, so the rest capture + size ratio are taken at identity.
 *
 * Returns { skinned, targetSkeleton, dispose }.
 */
export function skinProceduralToRig(scene, procRoot, rig, refNode) {
  const B = window.BABYLON;
  const meta = procRoot.metadata && procRoot.metadata.skin;
  if (!meta) throw new Error("procedural root has no metadata.skin (rebuild trex.js)");
  const src = rig.skeleton;
  src.returnToRest();

  // Reference frame: the inverse world matrix of refNode at rest. Every source
  // pose is read relative to this, so moving/scaling/yawing refNode at runtime
  // is invisible to the retarget.
  refNode.computeWorldMatrix(true);
  const invRefRest = B.Matrix.Invert(refNode.getWorldMatrix());

  // --- 1. capture each source bone's REST pose relative to refNode -----------
  const srcByName = {};
  for (const bone of src.bones) {
    const node = bone.getTransformNode();
    node.computeWorldMatrix(true);
    const rel = decompose(B, node.getWorldMatrix().multiply(invRefRest));
    srcByName[bone.name] = {
      bone, node, restRot: rel.q.clone(), restPos: rel.t.clone(),
      parent: bone.getParent() ? bone.getParent().name : null,
    };
  }

  // --- 2. build the target skeleton: refit rest onto our anatomy --------------
  // Bone-rest table comes from the creature's metadata (meta.boneRest) when it
  // supplies one (e.g. the raptor, built at its own scale), else the built-in
  // T-Rex table. PART_BONES is keyed by bone name and shared (Quaternius rigs
  // reuse the same bone names across species).
  const RESTTBL = meta.boneRest || T;
  const targetSkeleton = new B.Skeleton("procTarget", "procTarget", scene);
  const armature = new B.TransformNode("procTargetArmature", scene);
  const tBones = {}, tNodes = {};
  const restWorldRot = {}, restWorldPos = {};
  for (const bone of src.bones) {
    const name = bone.name;
    const s = srcByName[name];
    if (!RESTTBL[name]) throw new Error("no rest target for bone " + name);
    const Pw = new B.Vector3(RESTTBL[name][0], RESTTBL[name][1], RESTTBL[name][2]);
    const Wr = s.restRot.clone();             // match source rest orientation
    const pName = s.parent;
    const pRot = pName ? restWorldRot[pName] : B.Quaternion.Identity();
    const pPos = pName ? restWorldPos[pName] : B.Vector3.Zero();
    const invPRot = B.Quaternion.Inverse(pRot);
    const localR = invPRot.multiply(Wr);
    const localT = rotateVec(B, invPRot, Pw.subtract(pPos));
    restWorldRot[name] = Wr; restWorldPos[name] = Pw;

    const localMatrix = B.Matrix.Compose(B.Vector3.One(), localR, localT);
    const parentBone = pName ? tBones[pName] : null;
    tBones[name] = new B.Bone(name, targetSkeleton, parentBone, localMatrix, localMatrix.clone());

    const tn = new B.TransformNode(name, scene);
    tn.parent = pName ? tNodes[pName] : armature;
    tn.rotationQuaternion = localR.clone();
    tn.position = localT.clone();
    tNodes[name] = tn;
    tBones[name].linkTransformNode(tn);
  }
  targetSkeleton.returnToRest();
  targetSkeleton.prepare();

  // --- 3. per-axis translation retarget scale (our size / glb rest size) ------
  // The mirror's translation channels are read in REF-RELATIVE space (refNode
  // stripped out), so the glb size must be measured in that same space — i.e.
  // with the gameplay transform (scale/pos/yaw the AI puts on refNode) removed.
  // Neutralise refNode for the measurement, then restore it.
  const our = unionBounds(B, meta.skinnedMeshes);
  src.returnToRest();
  const savedScale = refNode.scaling.clone();
  const savedPos = refNode.position.clone();
  const savedRot = refNode.rotationQuaternion ? refNode.rotationQuaternion.clone() : null;
  const savedEuler = refNode.rotation.clone();
  refNode.scaling.setAll(1); refNode.position.setAll(0); refNode.rotation.setAll(0);
  if (refNode.rotationQuaternion) refNode.rotationQuaternion = B.Quaternion.Identity();
  refNode.computeWorldMatrix(true);
  const glb = unionBounds(B, rig.renderableMeshes);
  refNode.scaling.copyFrom(savedScale); refNode.position.copyFrom(savedPos);
  refNode.rotation.copyFrom(savedEuler);
  if (savedRot) refNode.rotationQuaternion = savedRot;
  refNode.computeWorldMatrix(true);
  const oS = our.mx.subtract(our.mn), gS = glb.mx.subtract(glb.mn);
  const r = (a, b) => (Math.abs(b) > 1e-5 ? a / b : 1);
  const transScale = new B.Vector3(r(oS.x, gS.x), r(oS.y, gS.y), r(oS.z, gS.z));

  // --- 4. skin every mesh -----------------------------------------------------
  const boneIndex = {};
  targetSkeleton.bones.forEach((b, i) => (boneIndex[b.name] = i));
  const segHead = {}, segTail = {};
  for (const b of targetSkeleton.bones) {
    const pn = srcByName[b.name].parent;
    segHead[b.name] = pn ? restWorldPos[pn] : restWorldPos[b.name];
    segTail[b.name] = restWorldPos[b.name];
  }

  const skinned = [];
  for (const mesh of meta.skinnedMeshes) {
    skinMesh(B, mesh, mesh.metadata && mesh.metadata.partIds, targetSkeleton,
      boneIndex, segHead, segTail, null);
    mesh.parent = armature;
    skinned.push(mesh);
  }
  // eyes + mouth ride the Head bone rigidly. Bake their local transform into
  // verts first (they aren't merged, so their .position/.scaling must be folded
  // in or they'd skin from raw local space and float away from the head).
  const headIdx = boneIndex["Head"];
  for (const hm of meta.headMeshes || []) {
    hm.bakeCurrentTransformIntoVertices();
    rigidSkin(B, hm, headIdx, targetSkeleton);
    hm.parent = armature;
    skinned.push(hm);
  }

  // Parent our whole rig under the reference node so the game's per-frame root
  // transform (position / yaw / scale) carries our mesh along for free.
  armature.parent = refNode;

  // --- live mirror: source ref-relative pose -> target, every frame -----------
  const order = src.bones.map((b) => b.name); // parents before children
  const curRot = {}, curPos = {};
  function mirror() {
    refNode.computeWorldMatrix(true);
    const invRef = B.Matrix.Invert(refNode.getWorldMatrix());
    for (const name of order) {
      const s = srcByName[name];
      s.node.computeWorldMatrix(true);
      const rel = decompose(B, s.node.getWorldMatrix().multiply(invRef));
      const Wr = rel.q;                                 // desired ref-relative rot
      const delta = rel.t.subtract(s.restPos);          // ref-relative translation delta
      const Wp = new B.Vector3(
        restWorldPos[name].x + delta.x * transScale.x,
        restWorldPos[name].y + delta.y * transScale.y,
        restWorldPos[name].z + delta.z * transScale.z);
      const pName = s.parent;
      const pRot = pName ? curRot[pName] : B.Quaternion.Identity();
      const pPos = pName ? curPos[pName] : B.Vector3.Zero();
      const invPRot = B.Quaternion.Inverse(pRot);
      const tn = tNodes[name];
      if (!tn.rotationQuaternion) tn.rotationQuaternion = new B.Quaternion();
      invPRot.multiplyToRef(Wr, tn.rotationQuaternion);
      tn.position.copyFrom(rotateVec(B, invPRot, Wp.subtract(pPos)));
      curRot[name] = Wr; curPos[name] = Wp;
    }
    targetSkeleton.prepare();
  }
  const obs = scene.onAfterAnimationsObservable.add(mirror);
  mirror(); // pose at current source state (rest)

  return {
    skinned, targetSkeleton, armature,
    dispose() {
      scene.onAfterAnimationsObservable.remove(obs);
      targetSkeleton.dispose();
      for (const tn of Object.values(tNodes)) tn.dispose();
      armature.dispose();
    },
  };
}

function skinMesh(B, mesh, partIds, skeleton, boneIndex, segHead, segTail, rigidName) {
  const pos = mesh.getVerticesData(B.VertexBuffer.PositionKind);
  const n = pos.length / 3;
  const mi = new Float32Array(n * 4), mw = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) {
    const p = new B.Vector3(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]);
    let names;
    if (rigidName) names = [rigidName];
    else names = PART_BONES[partIds ? partIds[i] : 0] || PART_BONES[0];
    const cand = [];
    for (const bn of names) {
      if (boneIndex[bn] == null) continue;
      cand.push({ bn, d: distToSeg(B, p, segHead[bn], segTail[bn]) });
    }
    cand.sort((x, y) => x.d - y.d);
    const top = cand.slice(0, MAX_INFLUENCERS);
    let sum = 0;
    const w = top.map((c) => { const ww = 1 / (c.d * c.d + 1e-4); sum += ww; return ww; });
    for (let k = 0; k < MAX_INFLUENCERS; k++) {
      if (k < top.length) { mi[i * 4 + k] = boneIndex[top[k].bn]; mw[i * 4 + k] = w[k] / sum; }
      else { mi[i * 4 + k] = 0; mw[i * 4 + k] = 0; }
    }
  }
  mesh.setVerticesData(B.VertexBuffer.MatricesIndicesKind, mi, false);
  mesh.setVerticesData(B.VertexBuffer.MatricesWeightsKind, mw, false);
  mesh.numBoneInfluencers = MAX_INFLUENCERS;
  mesh.skeleton = skeleton;
}

function rigidSkin(B, mesh, boneIdx, skeleton) {
  const n = mesh.getTotalVertices();
  const mi = new Float32Array(n * 4), mw = new Float32Array(n * 4);
  for (let v = 0; v < n; v++) { mi[v * 4] = boneIdx || 0; mw[v * 4] = 1; }
  mesh.setVerticesData(B.VertexBuffer.MatricesIndicesKind, mi, false);
  mesh.setVerticesData(B.VertexBuffer.MatricesWeightsKind, mw, false);
  mesh.numBoneInfluencers = 1;
  mesh.skeleton = skeleton;
}
