// Adapted from ~/Projects/glass-sky: the same cast-glass optics and volumetric sky,
// rendered with WebGL 2 so the artwork doesn't require WebGPU.
export const skyAspect = 11 / 7.5;

export const vertexSource = `#version 300 es
void main() {
  vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}
`;

const common = `
precision highp float;
out vec4 outputColor;
float hash2(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * .1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
float hash3(vec3 p) {
  vec3 p3 = fract(p * .1031);
  p3 += dot(p3, p3.zyx + 31.32);
  return fract((p3.x + p3.y) * p3.z);
}
float noise2(vec2 p) {
  vec2 i = floor(p), f = fract(p), b = f*f*(3.-2.*f);
  return mix(mix(hash2(i), hash2(i+vec2(1,0)), b.x),
             mix(hash2(i+vec2(0,1)), hash2(i+vec2(1,1)), b.x), b.y);
}
float noise3(vec3 p) {
  vec3 i = floor(p), f = fract(p), b = f*f*(3.-2.*f);
  return mix(
    mix(mix(hash3(i), hash3(i+vec3(1,0,0)),b.x), mix(hash3(i+vec3(0,1,0)),hash3(i+vec3(1,1,0)),b.x),b.y),
    mix(mix(hash3(i+vec3(0,0,1)),hash3(i+vec3(1,0,1)),b.x),mix(hash3(i+vec3(0,1,1)),hash3(i+vec3(1,1,1)),b.x),b.y),b.z);
}
float fbm3(vec3 p) {
  vec3 q = p; float a = .5, n = 0.;
  for (int i=0; i<5; i++) { n += a*noise3(q); q=q*2.02+vec3(17.1,9.2,13.7); a*=.5; }
  return n;
}
`;

export const skySource = `#version 300 es
${common}
uniform vec2 u_resolution;
float ellipsoid(vec3 p, vec3 center, vec3 radii) {
  return (1.-length((p-center)/radii))*min(radii.x,min(radii.y,radii.z));
}
float density(vec3 p) {
  float d = ellipsoid(p, vec3(-2.2,-.45,0.), vec3(2.4,.52,.85));
  d = max(d, ellipsoid(p,vec3(-1.8,-.04,.05),vec3(.62,.85,.58)));
  d = max(d, ellipsoid(p,vec3(-.9,-.28,-.1),vec3(.85,.61,.64)));
  d = max(d, ellipsoid(p,vec3(-3.1,-.2,.1),vec3(.71,.53,.66)));
  d = max(d, ellipsoid(p,vec3(2.7,.95,.05),vec3(2.25,.58,.75)));
  d = max(d, ellipsoid(p,vec3(2.25,1.33,-.12),vec3(.72,.89,.7)));
  d = max(d, ellipsoid(p,vec3(3.5,1.31,.08),vec3(.8,.62,.6)));
  d = max(d, ellipsoid(p,vec3(.95,.7,.0),vec3(.78,.4,.58)));
  d = max(d, ellipsoid(p,vec3(1.65,-2.3,.08),vec3(1.62,.24,.4)));
  d = max(d, ellipsoid(p,vec3(1.77,-2.1,-.04),vec3(.4,.4,.4)));
  d = max(d, ellipsoid(p,vec3(-3.4,2.3,.05),vec3(1.22,.23,.43)));
  // fbm3 is bounded by 0..1, so noise cannot add more than .36.
  // Avoid five noise octaves wherever the density is guaranteed to be zero.
  float n = 0.;
  if (d > -.36) n = fbm3(p*3.7);
  return max(0.,d+(n-.5)*.72)*6.;
}
void main() {
  vec2 uv = gl_FragCoord.xy / u_resolution;
  vec2 p = vec2((uv.x-.5)*11.,(.5-uv.y)*7.5);
  vec3 sky = mix(vec3(.027,.43,.76),vec3(.32,.68,.76),uv.y);
  vec3 light = normalize(vec3(-.65,1.,-1.3));
  float transmittance = 1.; vec3 cloud = vec3(0.);
  float jitter = hash2(gl_FragCoord.xy);
  for (int i=0; i<36; i++) {
    float z = -1.4 + (float(i)+jitter)*.078;
    vec3 pos = vec3(p,z);
    float den = density(pos);
    if (den > .001) {
      float shadow = density(pos+light*.18)*.45 + density(pos+light*.43)*.35;
      float illumination = exp(-shadow*1.5);
      vec3 shade = mix(vec3(.36,.57,.68),vec3(1.04,1.07,1.02),illumination);
      float opacity = 1.-exp(-den*.078*3.3);
      cloud += transmittance*opacity*shade;
      transmittance *= 1.-opacity;
      if (transmittance < .008) break;
    }
  }
  outputColor = vec4(sky*transmittance + cloud,1.);
}
`;

export const glassSource = `#version 300 es
${common}
uniform vec2 u_resolution;
uniform vec2 u_grid;
uniform vec2 u_pointer;
uniform float u_time;
uniform float u_morph;
uniform float u_aspect;
uniform sampler2D u_sky;
float roundedBox(vec2 p, vec2 size, float radius) {
  vec2 q = abs(p)-size+radius;
  return min(max(q.x,q.y),0.)+length(max(q,vec2(0.)))-radius;
}
float gauss(float x, float c, float w) {
  float v = (x-c)/w; return exp(-v*v);
}
// Blend distance fields, not grid counts: every seam melts away continuously,
// with no partially cropped tiles or integer-grid jumps during the scroll.
float edgeDistance(vec2 local, vec2 face) {
  float aspect = u_aspect;
  float tile = -roundedBox(local,vec2(.478),.039);
  float block = -roundedBox(face,vec2(aspect*.5-.006,.494),.025);
  return mix(tile,block,u_morph);
}
float profile(float d) {
  return .135*smoothstep(0.,.095,d)
      + .025*gauss(d,.035,.015)
      - .019*gauss(d,.071,.013)
      + .017*gauss(d,.112,.014)
      - .008*gauss(d,.143,.021)
      + .018*smoothstep(.16,.46,d);
}
vec3 skyAt(vec2 p) {
  float t = u_time;
  vec2 drift = vec2(sin(t*.012)*.09,cos(t*.009)*.012);
  vec2 warp = vec2(sin(p.y*16.+t*.06),cos(p.x*12.+t*.035))*.0015;
  return texture(u_sky,clamp(p+drift+warp,vec2(.005),vec2(.995))).rgb;
}
void main() {
  vec2 frag = vec2(gl_FragCoord.x,u_resolution.y-gl_FragCoord.y);
  vec2 screen = frag/u_resolution;
  float aspect = u_aspect;
  float span = mix(u_grid.y,1.,u_morph);
  float zoomOut = span/(aspect<.8 ? 2.24 : 2.65);
  vec2 ratio = vec2(aspect,1.);
  vec2 id = floor(screen*u_grid);
  vec2 local = fract(screen*u_grid)-.5;
  float seed = mix(hash2(id+3.8),hash2(vec2(3.8)),u_morph);
  float seed2 = mix(hash2(id+17.3),hash2(vec2(17.3)),u_morph);
  vec2 face = (screen-.5)*ratio;
  vec2 p = mix(local,face,u_morph);
  vec2 r = p+vec2(seed*15.,seed2*12.);
  vec2 waviness = vec2(
    sin(p.y*16.+seed*19.)*.0019+sin(p.y*47.+seed2*9.)*.0008,
    sin(p.x*19.+seed2*22.)*.0017+sin(p.x*51.+seed*6.)*.0007);
  local += waviness; face += waviness; p += waviness;
  float d = edgeDistance(local,face);
  float aa = span/u_resolution.y;
  float glassMask = smoothstep(-aa,aa,d);
  if (d < -aa*2.) { outputColor = vec4(0.); return; }

  float eps = .0007;
  vec2 ex = vec2(eps,0.), ey = vec2(0.,eps);
  vec2 gradient = vec2(edgeDistance(local+ex,face+ex)-edgeDistance(local-ex,face-ex),
                       edgeDistance(local+ey,face+ey)-edgeDistance(local-ey,face-ey))/(eps*2.);
  vec2 outward = -normalize(gradient+vec2(.000001));
  float slope = (profile(d+.0005)-profile(d-.0005))/.001;
  vec2 imperfections = vec2(
    (noise2(r*6.)-.5)*.010 + sin(p.y*17.+seed*10.)*.002,
    (noise2(r*7.+8.)-.5)*.010 + sin(p.x*19.+seed2*10.)*.002);
  vec2 bulgeP = mix(local,face/ratio,u_morph);
  vec2 faceBulge = bulgeP * pow(length(bulgeP)*1.3,2.)*.065;
  float rim = 1.-smoothstep(.115,.175,d);
  vec3 normal = normalize(vec3(outward*slope*.85+imperfections*7.,1.));
  vec3 transmittedRay = refract(vec3(0.,0.,-1.),normal,1./1.52);
  float opticalPath = .18/max(-transmittedRay.z,.15);
  vec2 throughBlock = transmittedRay.xy*opticalPath;
  vec2 distortion = throughBlock + outward*.014*gauss(d,.112,.028)
                  + imperfections + faceBulge;
  // Cover the pane rather than stretching the cloudscape as its shape changes.
  // The sky's world-space extent is 11 by 7.5, independent of texture resolution.
  float skyAspect = ${skyAspect};
  vec2 skyCrop = vec2(min(1.,aspect/skyAspect),min(1.,skyAspect/aspect));
  vec2 skyUV = (screen-.5)*skyCrop*.83+vec2(.5);
  vec2 refractionScale = skyCrop/(ratio*zoomOut);
  skyUV += (distortion+vec2(seed-.5,seed2-.5)*.014)*refractionScale;
  vec2 dispersion = outward * .0025*rim * refractionScale;
  vec3 color = vec3(skyAt(skyUV+dispersion).r,skyAt(skyUV).g,skyAt(skyUV-dispersion).b);
  float thickness = opticalPath*.55 + rim*.58 + gauss(d,.085,.018)*.38;
  color *= exp(-vec3(1.25,.45,.17)*thickness);
  color *= vec3(.87,.98,1.02);

  float fresnel = .045 + .82*pow(1.-max(normal.z,0.),3.);
  vec3 reflected = skyAt(vec2(.5)+normal.xy*.4)*vec3(.65,.86,.88);
  reflected = mix(reflected,vec3(.67,.82,.82),smoothstep(-.2,.5,-normal.y)*.38);
  color = mix(color,reflected,min(.78,fresnel+rim*.14));

  vec2 rearSize = mix(vec2(.443),vec2(aspect*.5-.041,.459),u_morph);
  float rearDistance = -roundedBox(p+throughBlock*.34,rearSize,.034);
  float rearLip = gauss(rearDistance,.009,.003);
  float rearShadow = gauss(rearDistance,.020,.007);
  color *= 1.-rearShadow*rim*.24;
  color += skyAt(skyUV+throughBlock*.24*refractionScale)*rearLip*rim*.19;
  float sidewallShade = .38+.62*clamp(dot(outward,normalize(vec2(.6,.8))),0.,1.);
  color *= 1.-gauss(d,.061,.024)*sidewallShade*.25;
  color *= 1.-exp(-max(d,0.)*110.)*.38;

  vec3 light = normalize(vec3(vec2(-.48,-.62)+u_pointer*.10,1.2));
  float glint = pow(max(dot(normal,light),0.),42.);
  float glint2 = pow(max(dot(normal,normalize(vec3(.8,.2,.85))),0.),70.);
  float broken = .55+.45*noise2(r*vec2(10.,15.));
  color += vec3(.7,.89,.93)*(glint*.72+glint2*.24)*rim*broken;
  float directional = .34+.66*clamp(dot(outward,normalize(vec2(-.45,-.8)))*.5+.5,0.,1.);
  color += vec3(.45,.8,.85)*gauss(d,.016,.0032)*directional*broken;
  color -= vec3(.04,.10,.12)*gauss(d,.030,.004);
  color += vec3(.45,.63,.64)*gauss(d,.041,.0024)*directional*broken;
  color *= 1.-gauss(d,.087,.007)*.36;
  color += vec3(.57,.78,.81)*gauss(d,.117,.003)*directional*broken;
  color += vec3(.29,.47,.49)*gauss(d,.139,.002)*broken;
  float striation = pow(noise2(vec2(d*450.,dot(p,vec2(1.))*8.)+seed*21.),6.);
  color += striation*rim*vec3(.24,.34,.33);
  color *= 1.-.055*pow(length(bulgeP)/.68,2.);
  color += (hash2(frag)-.5)*.009;
  color *= 1.-.11*pow(length((screen-.5)*vec2(1.,.8)),1.8);
  outputColor = vec4(color*glassMask,glassMask);
}
`;
