/**
 * Every shader the vault scene uses, kept apart from the renderer that
 * drives them. They are a third of that file by volume and none of it is
 * TypeScript, which made the class hard to read end to end.
 */

export const coreVertexShader = /* glsl */ `
  uniform float uTime;
  uniform float uPulse;
  uniform float uCharge;
  uniform float uShock;
  uniform vec3 uAudio;
  uniform vec3 uStretch;
  uniform vec3 uSplitAxis;
  uniform float uSplit;
  uniform float uDamage;
  uniform float uShatter;
  attribute vec3 aCentroid;
  attribute vec3 aAxis;
  attribute vec2 aTumble;
  varying vec3 vNormal;
  varying vec3 vWorldPosition;
  varying float vNoise;
  varying float vDetail;

  float hash(vec3 p) {
    p = fract(p * 0.3183099 + 0.1);
    p *= 17.0;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
  }

  float noise3(vec3 p) {
    vec3 i = floor(p);
    vec3 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(mix(hash(i), hash(i + vec3(1,0,0)), f.x), mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
      mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x), mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y),
      f.z
    );
  }

  float fbm(vec3 p) {
    float value = 0.0;
    value += noise3(p) * 0.55;
    value += noise3(p * 2.03 + 7.1) * 0.28;
    value += noise3(p * 4.01 + 13.4) * 0.17;
    return value;
  }

  void main() {
    // Charging speeds the churn as well as swelling the surface.
    float churn = uTime * (1.0 + uCharge * 1.6);
    vec3 drift = vec3(churn * 0.055, -churn * 0.035, churn * 0.025);
    // Low frequency shapes the silhouette; high frequency carries the veins,
    // so the body can stay round while the cracks stay fine.
    float n = fbm(position * 1.85 + drift);
    float detail = fbm(position * 5.4 + drift * 0.55);
    float radius = length(position);
    float pulseWave = uPulse * sin(radius * 12.0 - uTime * 8.0) * 0.06;
    float shockWave = uShock * sin(radius * 22.0 - uTime * 19.0) * 0.11;
    float breath = uAudio.x * 0.07 + uAudio.y * 0.025;
    float swell = uCharge * (0.025 + n * 0.045);
    float relief = (n - 0.5) * 0.085 + (detail - 0.5) * 0.022;
    vec3 displaced = position + normal * (relief + pulseWave + shockWave + breath + swell);

    // Hauling the object through the air draws it out along the direction of
    // travel and pinches it across, the way a heavy drop of liquid behaves.
    vec3 pull = vec3(uStretch.xy, 0.0);
    float alignment = dot(normalize(position), pull);
    displaced += pull * alignment * uStretch.z;
    displaced -= normalize(position) * (1.0 - abs(alignment)) * uStretch.z * 0.35;

    // Thrown hard enough, it comes apart: the two halves separate along the
    // throw, and the seam pulls back as the break heals.
    float side = dot(normalize(position), uSplitAxis) >= 0.0 ? 1.0 : -1.0;
    displaced += uSplitAxis * side * uSplit;

    // Damage loosens the surface before it gives way entirely.
    displaced += normal * uDamage * (detail - 0.5) * 0.09;

    if (uShatter > 0.0) {
      // Every triangle becomes its own shard: flung out along its own bearing,
      // tumbling about its own axis, falling as it goes.
      vec3 local = displaced - aCentroid;
      float spin = uShatter * aTumble.x * 9.0;
      float c = cos(spin);
      float s = sin(spin);
      vec3 tumbled = local * c + cross(aAxis, local) * s + aAxis * dot(aAxis, local) * (1.0 - c);
      vec3 launched = aCentroid + normalize(aCentroid) * aTumble.y * uShatter * 2.6;
      launched.y -= 1.5 * uShatter * uShatter;
      displaced = launched + tumbled;
    }

    vec4 world = modelMatrix * vec4(displaced, 1.0);
    vWorldPosition = world.xyz;
    vNormal = normalize(mat3(modelMatrix) * normal);
    vNoise = n;
    vDetail = detail;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;
export const coreFragmentShader = /* glsl */ `
  uniform float uReveal;
  uniform float uPulse;
  uniform float uFailure;
  uniform float uCharge;
  uniform float uHeat;
  uniform float uDamage;
  uniform float uShatter;
  uniform float uInvite;
  uniform float uTime;
  uniform vec3 uAudio;
  uniform vec3 uPointer;
  varying vec3 vNormal;
  varying vec3 vWorldPosition;
  varying float vNoise;
  varying float vDetail;

  void main() {
    vec3 normal = normalize(vNormal);
    vec3 viewDirection = normalize(cameraPosition - vWorldPosition);
    float facingView = max(dot(normal, viewDirection), 0.0);
    float fresnel = pow(1.0 - facingView, 2.6);

    // Veins, not patches: light escapes only along the narrow band where the
    // high-frequency field crosses its threshold, widening under charge.
    float width = 0.016 + uCharge * 0.022 + uDamage * 0.026;
    float crack = abs(vDetail - 0.5);
    float vein = 1.0 - smoothstep(0.0, width, crack);
    float ember = 1.0 - smoothstep(0.0, width * 6.0, crack);

    // Damage opens a second, coarser network on top of the fine one: the deep
    // structural breaks, as opposed to the surface veining.
    float faultWidth = 0.012 + uDamage * 0.05;
    float fault = (1.0 - smoothstep(0.0, faultWidth, abs(vNoise - 0.47)))
      * smoothstep(0.02, 0.35, uDamage);
    vein = max(vein, fault);

    // Stone that has cooled unevenly, so the body is never a flat silhouette.
    float relief = smoothstep(0.35, 0.72, vNoise);
    float occlusion = mix(0.55, 1.0, relief);

    float facing = max(dot(normal, normalize(uPointer)), 0.0);
    vec3 obsidian = vec3(0.026, 0.022, 0.019);
    vec3 oldGold = vec3(0.62, 0.40, 0.18);
    // Struck repeatedly, the cracks run from gold up towards forge red, and a
    // failing object never fully cools between blows.
    float glowing = max(uHeat, uDamage * 0.75);
    vec3 heat = mix(vec3(0.96, 0.74, 0.42), vec3(1.0, 0.34, 0.13), glowing * 0.85);

    // A dark body first, then a rim, then the light coming out of the cracks.
    vec3 color = obsidian * occlusion;
    color += oldGold * fresnel * 0.46;
    // A hard glint keeps it reading as polished stone rather than matte clay.
    color += vec3(1.0, 0.88, 0.66) * pow(facingView, 22.0) * 0.09;
    // Left alone, it breathes: a slow swell along the veins, which is the only
    // hint a visitor gets that the object will answer if they reach for it.
    float breathing = 0.5 + 0.5 * sin(uTime * 1.9);
    color += heat * ember * (0.05 + uCharge * 0.1 + glowing * 0.5 + uInvite * breathing * 0.4) * occlusion;
    color += heat * vein * uInvite * breathing * 0.3;
    color += heat * vein * (0.55 + uPulse * 0.6 + uCharge * 0.85 + glowing * 1.15);
    // The side under the pointer runs hotter, so the object tracks your hand.
    color += heat * facing * vein * uCharge * 0.35;
    color += heat * (uFailure * fresnel * 0.14 + uAudio.z * fresnel * 0.2 + glowing * fresnel * 0.3);

    // Shards cool and dim as they scatter, so the shatter has an end.
    float dying = 1.0 - smoothstep(0.35, 1.0, uShatter);
    color *= mix(1.0, 0.35, smoothstep(0.0, 0.7, uShatter));
    float alpha = uReveal * (0.9 + fresnel * 0.1) * dying;
    gl_FragColor = vec4(color, alpha);
  }
`;
export const particleVertexShader = /* glsl */ `
  uniform float uTime;
  uniform float uReveal;
  uniform float uPulse;
  uniform float uCharge;
  uniform float uPixelScale;
  uniform vec3 uAudio;
  varying float vAlpha;
  void main() {
    vec3 p = position;
    p.y += sin(uTime * 0.15 + p.x * 1.7) * 0.09;
    float distanceFromCore = max(length(p.xy), 0.3);
    // Charge and impacts push the field outward from the core.
    p.xy *= 1.0 + (uPulse * 0.16 + uCharge * 0.1 + uAudio.x * 0.06) / distanceFromCore;
    vec4 mvPosition = modelViewMatrix * vec4(p, 1.0);
    // Sized against the drawing buffer so these stay fine embers at every
    // resolution rather than becoming lens blobs on a small viewport.
    gl_PointSize = (0.9 + fract(p.x * 17.13) * 1.5) * (17.0 / -mvPosition.z) * uPixelScale;
    vAlpha = (0.1 + fract(p.z * 23.17) * 0.4) * (0.16 + uReveal * 0.84) * (1.0 + uAudio.y * 0.5);
    gl_Position = projectionMatrix * mvPosition;
  }
`;
export const particleFragmentShader = /* glsl */ `
  varying float vAlpha;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    float alpha = smoothstep(0.5, 0.05, d) * vAlpha;
    gl_FragColor = vec4(0.78, 0.65, 0.47, alpha);
  }
`;
/**
 * Large defocused motes drifting in the opened chamber. Deliberately few, very
 * faint and very soft — the atmosphere comes from their movement, not from
 * their presence, and anything heavier reads as dirt on the lens.
 */
export const moteVertexShader = /* glsl */ `
  uniform float uTime;
  uniform float uOpen;
  uniform float uPixelScale;
  varying float vAlpha;

  void main() {
    vec3 p = position;
    float seed = fract(p.x * 13.71 + p.y * 7.33 + 0.37);
    // Convection: they rise slowly and sway, wrapping around the chamber.
    p.y = mod(p.y + uTime * (0.018 + seed * 0.042) + 2.2, 4.4) - 2.2;
    p.x += sin(uTime * (0.05 + seed * 0.07) + seed * 26.0) * 0.34;
    vec4 mvPosition = modelViewMatrix * vec4(p, 1.0);
    gl_PointSize = (26.0 + seed * 54.0) * (13.0 / -mvPosition.z) * uPixelScale;
    // Fading in at the edges of their travel keeps them from popping.
    float edge = 1.0 - smoothstep(1.5, 2.2, abs(p.y));
    vAlpha = uOpen * edge * (0.075 + seed * 0.105);
    gl_Position = projectionMatrix * mvPosition;
  }
`;
export const moteFragmentShader = /* glsl */ `
  varying float vAlpha;
  void main() {
    float d = length(gl_PointCoord - 0.5) * 2.0;
    if (d > 1.0) discard;
    // A soft body with a slightly firmer edge, the way defocused light behaves.
    float body = pow(1.0 - d, 1.7);
    float rim = smoothstep(0.92, 0.66, d) * 0.3;
    gl_FragColor = vec4(vec3(0.88, 0.76, 0.57), (body * 0.6 + rim) * vAlpha);
  }
`;
/**
 * Shards knocked loose when the object strikes a wall. One burst per pool: the
 * whole pool shares an origin and a launch time, and each point derives its own
 * direction from seeds baked into its attribute, so firing a burst costs a
 * handful of uniform writes rather than a buffer rewrite.
 */
export const debrisVertexShader = /* glsl */ `
  uniform float uTime;
  uniform float uBurstTime;
  uniform float uStrength;
  uniform float uPixelScale;
  uniform vec3 uOrigin;
  uniform vec3 uNormal;
  varying float vAlpha;
  varying float vHeat;

  void main() {
    float age = uTime - uBurstTime;
    float life = 0.8 + fract(position.z * 7.31) * 0.9;
    if (age < 0.0 || age > life || uStrength <= 0.0) {
      // Park spent shards outside the frustum rather than drawing them.
      gl_Position = vec4(3.0, 3.0, 3.0, 1.0);
      vAlpha = 0.0;
      vHeat = 0.0;
      return;
    }

    // Scattered around the wall normal, but biased along it.
    vec3 direction = normalize(uNormal * 1.3 + normalize(position));
    float speed = (1.0 + fract(position.x * 13.17) * 2.3) * uStrength;

    vec3 p = uOrigin + direction * speed * age;
    p.y -= 1.9 * age * age;

    vec4 mvPosition = modelViewMatrix * vec4(p, 1.0);
    float fade = 1.0 - age / life;
    gl_PointSize = (1.3 + fract(position.y * 19.7) * 2.5) * (30.0 / -mvPosition.z) * uPixelScale * fade;
    vAlpha = fade * fade;
    vHeat = clamp(1.0 - age * 1.7, 0.0, 1.0);
    gl_Position = projectionMatrix * mvPosition;
  }
`;
export const debrisFragmentShader = /* glsl */ `
  varying float vAlpha;
  varying float vHeat;
  void main() {
    float d = length(gl_PointCoord - 0.5) * 2.0;
    if (d > 1.0) discard;
    // Cooling as they fall: white hot, then gold, then dead stone.
    vec3 colour = mix(vec3(0.5, 0.33, 0.2), vec3(1.0, 0.88, 0.62), vHeat);
    gl_FragColor = vec4(colour, (1.0 - d * d) * vAlpha);
  }
`;
/**
 * The molten interior. The scene carries no depth buffer, so this cannot be
 * hidden behind the shell and revealed by the gap. Instead its light is
 * concentrated along the seam and added over the top, which reads as light
 * escaping the break rather than as a ball inside a ball.
 */
export const heartVertexShader = /* glsl */ `
  varying vec3 vNormal;
  varying vec3 vWorldPosition;
  varying vec3 vLocal;
  void main() {
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorldPosition = world.xyz;
    vLocal = position;
    vNormal = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;
export const heartFragmentShader = /* glsl */ `
  uniform float uSplit;
  uniform float uShatter;
  uniform float uReveal;
  uniform float uTime;
  uniform vec3 uSplitAxis;
  varying vec3 vNormal;
  varying vec3 vWorldPosition;
  varying vec3 vLocal;
  void main() {
    vec3 viewDirection = normalize(cameraPosition - vWorldPosition);
    float fresnel = pow(1.0 - max(dot(normalize(vNormal), viewDirection), 0.0), 1.5);
    float flicker = 0.82 + sin(uTime * 7.3) * 0.12 + sin(uTime * 17.1) * 0.06;
    // Brightest across the seam, falling away toward the poles of the break.
    float seam = 1.0 - smoothstep(0.0, 0.62, abs(dot(normalize(vLocal), uSplitAxis)));
    vec3 color = mix(vec3(1.0, 0.44, 0.11), vec3(1.0, 0.97, 0.9), fresnel * 0.6 + seam * 0.4);
    float opened = smoothstep(0.01, 0.08, uSplit) * (0.25 + seam * 1.35);
    // When it finally breaks apart the whole interior is exposed, flares, and
    // burns out with the shards.
    float pyre = smoothstep(0.0, 0.06, uShatter) * (1.0 - smoothstep(0.12, 0.72, uShatter)) * 2.4;
    float exposure = uReveal * flicker * max(opened, pyre);
    gl_FragColor = vec4(color * exposure, exposure * 0.85);
  }
`;
/**
 * Smoke rolling up from the floor of the chamber. The footage freezes when the
 * live scene takes over, and its smoke freezes with it, so this carries the
 * motion on from where the film stops.
 *
 * Built by warping a noise field with itself — the offsets are what make it
 * curl and fold rather than slide, which is the whole difference between smoke
 * and a scrolling texture.
 */
export const smokeVertexShader = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;
export const smokeFragmentShader = /* glsl */ `
  uniform float uTime;
  uniform float uAmount;
  uniform float uSeed;
  uniform float uAgitation;
  varying vec2 vUv;

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
  }

  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
      mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x),
      f.y
    );
  }

  float fbm(vec2 p) {
    float value = noise(p) * 0.5;
    value += noise(p * 2.03 + 3.1) * 0.29;
    value += noise(p * 4.11 + 7.7) * 0.15;
    return value;
  }

  void main() {
    vec2 uv = vUv + uSeed;
    float rise = uTime * 0.08;

    // Warp the field with a sample of itself, twice.
    vec2 warp = vec2(
      fbm(uv * 2.1 - vec2(0.0, rise)),
      fbm(uv * 2.1 + vec2(4.7, 1.3) - vec2(0.0, rise * 1.25))
    );
    float density = fbm(uv * 2.4 + warp * (1.5 + uAgitation * 0.9) - vec2(0.0, rise * 0.8));

    // A column: thick along the floor, thinning as it climbs and at the walls.
    float column = 1.0 - smoothstep(0.02, 0.92, vUv.y);
    float walls = smoothstep(0.0, 0.26, vUv.x) * smoothstep(1.0, 0.74, vUv.x);
    // The field sits around 0.47, so the threshold has to straddle that or
    // almost everything is cut away. Keeping the range narrow is what separates
    // it into wisps instead of laying down an even fog.
    float body = smoothstep(0.36, 0.585, density);

    float alpha = body * column * walls * uAmount;
    // Premultiplied: the canvas is composited that way, and without this the
    // colour arrives at full strength however thin the smoke is.
    gl_FragColor = vec4(vec3(0.83, 0.79, 0.72) * alpha, alpha);
  }
`;
export const fogVertexShader = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;
export const fogFragmentShader = /* glsl */ `
  uniform float uTime;
  uniform float uReveal;
  uniform float uFailure;
  uniform float uCharge;
  varying vec2 vUv;

  float random(vec2 p) { return fract(sin(dot(p, vec2(12.9898,78.233))) * 43758.5453); }
  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(random(i), random(i + vec2(1,0)), f.x), mix(random(i + vec2(0,1)), random(i + vec2(1,1)), f.x), f.y);
  }

  void main() {
    vec2 centered = vUv - 0.5;
    float radial = 1.0 - smoothstep(0.04, 0.62, length(centered));
    float mist = noise(vUv * 4.2 + vec2(uTime * 0.015, -uTime * 0.01));
    mist += noise(vUv * 8.0 - vec2(uTime * 0.009, 0.0)) * 0.35;
    float alpha = (0.012 + uReveal * 0.045 + uFailure * 0.02 + uCharge * 0.02) * mist * (0.35 + radial * 0.65);
    gl_FragColor = vec4(0.62, 0.54, 0.4, alpha);
  }
`;
