import { ENV } from "./config.js";

// ENVIRONMENT REALISM — image-based lighting + post-processing.
//
// This module owns everything that turns the scene from "2002 flat shading"
// into a photographic finish: an HDRI environment map (CC0 Poly Haven) driving
// image-based lighting + a real sky dome with reflections, and a post-process
// stack (ACES tonemap, filmic colour grade, SSAO contact shadows, bloom, a
// shallow depth of field, vignette + grain).
//
// Kept separate from world.js (geometry/materials) and game.js (sim) so the
// realism pass merges cleanly. game.js calls buildEnv(scene, camera) once.

// Loads the HDRI and wires image-based lighting + a visible sky dome.
// Returns the environment texture (or null if it failed to load) so the caller
// can decide on a fallback. Failure is non-fatal — the painted gradient
// skydome in world.js remains as a backstop.
export function setupImageBasedLighting(scene) {
  const B = window.BABYLON;
  try {
    // Equirectangular .hdr -> prefiltered cube for IBL. Babylon reads the .hdr
    // directly via HDRCubeTexture (no .env conversion step needed in-browser).
    const hdr = new B.HDRCubeTexture(ENV.hdriPath, scene, ENV.hdriSize, false, true, false, true);
    scene.environmentTexture = hdr;
    scene.environmentIntensity = ENV.iblIntensity;

    // The HDRI is loaded for IBL above. The VISIBLE sky is the user's pick: by
    // default the painted gradient dome (built in world.js) shows, and the HDRI
    // skybox is suppressed. Set ENV.showHdriSkybox=true to display the
    // photographic HDRI dome instead.
    let skybox = null;
    if (ENV.showHdriSkybox) {
      skybox = scene.createDefaultSkybox(hdr, true, ENV.hdriSize * 4, ENV.skyboxBlur, true);
      if (skybox) { skybox.isPickable = false; skybox.infiniteDistance = true; skybox.applyFog = false; }
    }
    return { hdr, skybox };
  } catch (e) {
    // Non-fatal: IBL is an enhancement; the directional/hemi lights + gradient
    // dome in world.js keep the scene lit and skied if the HDRI is missing.
    console.warn("[env] HDRI/IBL unavailable, falling back to gradient sky:", e && e.message);
    return null;
  }
}

// Builds the post-processing pipeline on the given camera. Returns a handle
// exposing the pipeline + ssao so the caller can tweak/dispose if needed.
export function setupPostProcessing(scene, camera) {
  const B = window.BABYLON;

  const pipeline = new B.DefaultRenderingPipeline("envPipe", true, scene, [camera]);

  // --- Tonemap + exposure (ACES) -----------------------------------------
  const ip = pipeline.imageProcessing;
  ip.toneMappingEnabled = true;
  ip.toneMappingType = B.ImageProcessingConfiguration.TONEMAPPING_ACES;
  ip.exposure = ENV.exposure;
  ip.contrast = ENV.contrast;

  // --- Filmic colour grade (ColorCurves) ---------------------------------
  // Global desaturation kills the cartoon vividness; a cool-shadow / warm-
  // highlight split gives a naturalistic film look.
  const curves = new B.ColorCurves();
  curves.globalSaturation = ENV.globalSaturation;
  curves.globalHue = ENV.globalHue;
  curves.highlightsSaturation = ENV.highlightsSaturation;
  curves.shadowsHue = ENV.shadowsHue;
  curves.shadowsSaturation = ENV.shadowsSaturation;
  ip.colorCurves = curves;
  ip.colorCurvesEnabled = true;

  // --- Vignette + grain (photographic finish) ----------------------------
  ip.vignetteEnabled = true;
  ip.vignetteWeight = ENV.vignetteWeight;
  ip.vignetteCameraFov = camera.fov;
  pipeline.grainEnabled = true;
  pipeline.grain.intensity = ENV.grainIntensity;
  pipeline.grain.animated = true;

  // --- Bloom -------------------------------------------------------------
  pipeline.bloomEnabled = true;
  pipeline.bloomThreshold = ENV.bloomThreshold;
  pipeline.bloomWeight = ENV.bloomWeight;
  pipeline.bloomScale = ENV.bloomScale;

  // --- Depth of field (subtle cinematic focus) ---------------------------
  pipeline.depthOfFieldEnabled = true;
  pipeline.depthOfFieldBlurLevel = B.DepthOfFieldEffectBlurLevel.Low; // cheapest blur tier — a subtle look, perf-friendly
  pipeline.depthOfField.focusDistance = ENV.dofFocusDistance;
  pipeline.depthOfField.focalLength = ENV.dofFocalLength;
  pipeline.depthOfField.fStop = ENV.dofFStop;

  // --- FXAA (cheap edge AA on top of everything) -------------------------
  pipeline.fxaaEnabled = true;

  // --- SSAO2 — screen-space ambient occlusion ----------------------------
  // A separate pipeline (SSAO writes its own combine pass). Grounds objects
  // with soft contact shadows — a big chunk of the "realistic" read.
  let ssao = null;
  try {
    ssao = new B.SSAO2RenderingPipeline("envSSAO", scene, {
      ssaoRatio: ENV.ssaoRatio,
      blurRatio: 1,
    }, [camera]);
    ssao.radius = ENV.ssaoRadius;
    ssao.totalStrength = ENV.ssaoStrength;
    ssao.samples = ENV.ssaoSamples;
    ssao.expensiveBlur = true;
    ssao.maxZ = 250;
  } catch (e) {
    // SSAO2 needs WebGL2 + depth-texture support; degrade gracefully.
    console.warn("[env] SSAO2 unavailable, continuing without AO:", e && e.message);
  }

  return { pipeline, ssao };
}

// One-call entry used by game.js: IBL + post-processing together.
export function buildEnv(scene, camera) {
  const ibl = setupImageBasedLighting(scene);
  const post = setupPostProcessing(scene, camera);
  return { ...post, ibl };
}
