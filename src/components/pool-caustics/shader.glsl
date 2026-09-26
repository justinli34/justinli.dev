// ============================================================
//  Pool Caustics v2  —  ShaderToy (Image タブに貼り付け)
//  参照動画に合わせて調整：ドメインワープ＋ボロノイ境界で
//  「細く明るい線でできた丸みのある網目」を作る方式
// ============================================================

// ---- 調整パラメータ ----
#define SPEED      0.50     // 動きの速さ
#define SCALE      3.3     // セルの細かさ（大きいほど小さいセル）
#define YSQ        1.9    // 縦圧縮（>1 でセルが横長＝斜め見下ろし）
#define PERSP      0.10     // 上ほど細かくなる奥行き感
#define WARP       0.45    // 線のうねり量
#define WFREQ      0.75    // うねりの周波数
#define JITTER     0.9     // セル形状のランダムさ
#define ORBIT      0.15    // セル中心の揺れ速度
#define LINE_W     0.15   // 線の太さ
#define GLOW       0.40    // 線の周りのにじみ
#define LINE_B     0.6    // 線の明るさ
#define LAYER2     0.10    // 奥の薄い二重線
#define REFL       0.40    // 水面に映る空の白っぽいムラ
#define LINE_FADE  0.55    // 線の途切れ具合（小さいほど線が消えやすい）
#define SOFT       1.4     // 線の芯の柔らかさ（小さいほどぼける）
#define DISP       0.013   // 色収差（虹色のフリンジ）
#define PRESET 0           // 0: 濃いティール（写真）  1: 淡いアクア（長尺動画）
#if PRESET == 0
const vec3 DEEP    = vec3(0.05, 0.44, 0.50);
const vec3 SHALLOW = vec3(0.42, 0.72, 0.74);
#else
const vec3 DEEP    = vec3(0.35, 0.62, 0.64);
const vec3 SHALLOW = vec3(0.58, 0.78, 0.80);
#endif
#define FLOW  vec2(0.0, 0.25)   // 水面全体の流れ（向きと速さ）

// ---- ノイズ（quintic 補間のグラディエントノイズ）----
vec2 hash2(vec2 p){
    p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
    return -1.0 + 2.0 * fract(sin(p) * 43758.5453123);
}
float gnoise(vec2 p){
    vec2 i = floor(p), f = fract(p);
    vec2 u = f*f*f*(f*(f*6.0 - 15.0) + 10.0);
    return mix(mix(dot(hash2(i), f),
                   dot(hash2(i + vec2(1,0)), f - vec2(1,0)), u.x),
               mix(dot(hash2(i + vec2(0,1)), f - vec2(0,1)),
                   dot(hash2(i + vec2(1,1)), f - vec2(1,1)), u.x), u.y);
}
vec2 h22(vec2 p){
    return fract(sin(vec2(dot(p, vec2(127.1, 311.7)),
                          dot(p, vec2(269.5, 183.3)))) * 43758.5453);
}

// ---- 動くボロノイ：F1, F2 ----
vec2 voronoi(vec2 p, float t){
    vec2 ip = floor(p), fp = fract(p);
    float F1 = 9.0, F2 = 9.0;
    for (int j = -1; j <= 1; j++)
    for (int i = -1; i <= 1; i++){
        vec2 g = vec2(i, j);
        vec2 h = h22(ip + g);
        vec2 o = 0.5 + 0.5 * JITTER * sin(vec2(t*ORBIT*(1.0 + h.x)      + 6.2831*h.x,
                                               t*ORBIT*(1.0 + h.y)*1.3  + 6.2831*h.y));
        float d = length(g + o - fp);
        if (d < F1){ F2 = F1; F1 = d; } else F2 = min(F2, d);
    }
    return vec2(F1, F2);
}

// ---- 水面のうねり（ドメインワープ）----
vec2 warp(vec2 p, float t){
    vec2 q = p * WFREQ;
    float wx = gnoise(q + vec2( 0.30, -0.20)*t) + 0.5*gnoise(q*2.1 + vec2(-0.50,  0.40)*t);
    float wy = gnoise(q + vec2(5.2, 1.3) + vec2(-0.25, 0.30)*t)
             + 0.5*gnoise(q*2.1 + vec2(3.1, 0.0) + vec2(0.45, -0.35)*t);
    return p + 2.0 * WARP * vec2(wx, wy);
}

// 線の強さ（x）と F1（y）
vec2 lines(vec2 p, float t, float w, float glow){
    vec2 F = voronoi(warp(p, t), t);
    float e = F.y - F.x;                         // セル境界までの距離
    float core = pow(clamp(1.0 - e / w, 0.0, 1.0), SOFT);
    return vec2(core + glow * exp(-e / (w * 4.0)), F.x);
}

void mainImage(out vec4 fragColor, in vec2 fragCoord){
    vec2 uv = (fragCoord - 0.5 * iResolution.xy) / iResolution.y;
    float t  = iTime * SPEED;
    float pe = 1.0 + PERSP * (uv.y + 0.5);
    vec2  p  = vec2(uv.x * pe, uv.y * YSQ * pe * pe) * SCALE + FLOW * t;   // 縦は pe^2 で圧縮＝遠くほど横長

    // 線の明るさを場所ごとにムラにする（写真の「消えかけた線」）
    float mod_ = clamp(LINE_FADE + 1.1 * gnoise(p*0.9 + vec2(0.2, -0.15)*t), 0.25, 1.0);

    vec3 L; float F1 = 0.0;
    for (int c = 0; c < 3; c++){
        float dd = DISP * 3.0 * float(c - 1);
        vec2 a = lines(p + dd, t, LINE_W, GLOW);
        vec2 b = lines(p*1.7 + vec2(7.3, 2.1), t*1.2, LINE_W*2.5, 0.0);
        L[c] = a.x * mod_ + LAYER2 * b.x;
        if (c == 2) F1 = a.y;
    }

    float g   = gnoise(p*0.4 + vec2(0.1*t, 0.0)) * 0.5 + 0.5;
    vec3  col = mix(DEEP, SHALLOW, clamp(g + 0.2*(1.0 - F1), 0.0, 1.0));
    // 水面反射（白っぽいにじみ斑）
    vec2  rp   = warp(p*0.8 + vec2(3.7, 1.9), t*0.8);
    float refl = smoothstep(0.25, 0.65, gnoise(rp) + 0.5*gnoise(rp*2.3));
    col = mix(col, vec3(0.80, 0.95, 0.96), REFL * refl);
    col += L * LINE_B;

    fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
