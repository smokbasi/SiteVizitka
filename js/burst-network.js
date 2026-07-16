/**
 * BurstNetwork — Stripe-style radiating line visualization.
 * Canvas-based, mouse-interactive physics with depth layers + chase iridescence.
 *
 * @example
 * const burst = new BurstNetwork(document.getElementById('burst'), {
 *   lineColor: 'rgba(91, 141, 239, 0.4)',
 *   lineCount: 200,
 * });
 * burst.start();
 */
(function (global) {
  'use strict';

  var ACCENT = { r: 91, g: 141, b: 239 };
  var TAU = Math.PI * 2;

  var LAYER_STYLES = [
    { lineOpacity: 0.52, lineWidthMul: 1.28, nodeOpacity: 0.82, nodeRadiusMul: 1.0 },
    { lineOpacity: 0.30, lineWidthMul: 1.0, nodeOpacity: 0.50, nodeRadiusMul: 0.74 },
    { lineOpacity: 0.15, lineWidthMul: 0.72, nodeOpacity: 0.24, nodeRadiusMul: 0.52 },
  ];

  var DEFAULTS = {
    lineCount: 200,
    minLength: 0.35,
    maxLength: 0.95,
    nodeRatio: 1.0,
    lineWidth: 1,
    lineColor: 'rgba(91, 141, 239, 0.35)',
    nodeColor: 'rgba(91, 141, 239, 0.65)',
    nodeRadius: 2.5,
    originYOffset: 0.02,
    gradientInner: 'rgba(91, 141, 239, 0.14)',
    gradientOuter: 'rgba(15, 17, 23, 0)',
    interactionRadius: 360,
    interactionStrength: 0.78,
    spring: 0.065,
    springRadial: null,
    springRadialInward: 0.028,
    springTangential: 0.032,
    yRepulsionBoost: 2.2,
    damping: 0.88,
    mouseSmoothing: 0.26,
    layerWeights: [0.22, 0.33, 0.45],
    promoteDwellMs: 520,
    promoteLerp: 0.11,
    promoteDecay: 0.045,
    promoteHitRadius: null,
    promoteHitRadiusMul: 0.375,
    iridescenceHitRadius: null,
    iridescenceHitRadiusMul: 0.55,
    iridescenceStartMs: 475,
    iridescencePhaseSpeed: 0.0028,
    clusterDotCount: 20,
    ambientCycleMinMs: 4200,
    ambientCycleMaxMs: 7600,
    ambientLayerAmplitude: 0.82,
    ambientLayerLerp: 0.038,
    ambientPromoteBlend: 0.9,
    neighborRepulsionRadius: 44,
    neighborRepulsionStrength: 0.075,
    layerRepulsionScale: [1.0, 0.52, 0.22],
    edgeMotionAmplitude: 3.4,
    edgeMotionSpeed: 0.00165,
  };

  function rand(min, max) {
    return min + Math.random() * (max - min);
  }

  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  function clamp(v, lo, hi) {
    return v < lo ? lo : v > hi ? hi : v;
  }

  function rgba(r, g, b, a) {
    return 'rgba(' + Math.round(r) + ',' + Math.round(g) + ',' + Math.round(b) + ',' + a + ')';
  }

  function hsla(h, s, l, a) {
    return 'hsla(' + h + ',' + s + '%,' + l + '%,' + a + ')';
  }

  function pickLayer(weights) {
    var r = Math.random();
    var acc = 0;
    for (var i = 0; i < weights.length; i++) {
      acc += weights[i];
      if (r < acc) return i;
    }
    return weights.length - 1;
  }

  function styleForLayer(visualLayer) {
    var t = clamp(visualLayer, 0, 2);
    var i0 = Math.floor(t);
    var i1 = Math.min(2, i0 + 1);
    var f = t - i0;
    var a = LAYER_STYLES[i0];
    var b = LAYER_STYLES[i1];
    return {
      lineOpacity: lerp(a.lineOpacity, b.lineOpacity, f),
      lineWidthMul: lerp(a.lineWidthMul, b.lineWidthMul, f),
      nodeOpacity: lerp(a.nodeOpacity, b.nodeOpacity, f),
      nodeRadiusMul: lerp(a.nodeRadiusMul, b.nodeRadiusMul, f),
    };
  }

  function iridescentStops(phase, alpha, irBlend) {
    var stops = [];
    for (var s = 0; s <= 4; s++) {
      var t = s / 4;
      if (irBlend > 0.01) {
        var hue = (t * 140 + phase * 72 + Math.sin(t * 6.28 + phase) * 18) % 360;
        var sat = lerp(48, 58 + Math.sin(t * 5 + phase * 1.4) * 22, irBlend);
        var lit = lerp(58, 52 + Math.cos(t * 4 + phase * 0.9) * 14, irBlend);
        stops.push({ t: t, color: hsla(hue, sat, lit, alpha) });
      } else {
        stops.push({ t: t, color: rgba(ACCENT.r, ACCENT.g, ACCENT.b, alpha) });
      }
    }
    return stops;
  }

  function BurstNetwork(canvas, options) {
    if (!canvas || !canvas.getContext) {
      throw new Error('BurstNetwork requires a canvas element');
    }

    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.opts = Object.assign({}, DEFAULTS, options || {});
    if (options && options.chaseHitRadius != null && options.promoteHitRadius == null) {
      this.opts.promoteHitRadius = options.chaseHitRadius;
    }
    if (this.opts.promoteHitRadius == null) {
      this.opts.promoteHitRadius = this.opts.interactionRadius * this.opts.promoteHitRadiusMul;
    }
    if (this.opts.iridescenceHitRadius == null) {
      this.opts.iridescenceHitRadius = this.opts.promoteHitRadius * this.opts.iridescenceHitRadiusMul;
    }
    this.lines = [];
    this.clusterDots = [];
    this.running = false;
    this.rafId = 0;
    this.width = 0;
    this.height = 0;
    this.dpr = 1;
    this.origin = { x: 0, y: 0 };
    this.mouse = { x: 0, y: 0, active: false, sx: 0, sy: 0 };
    this.reducedMotion = global.matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.lastFrame = 0;
    this.iridescencePhase = 0;
    this._drawOrder = [];
    this._simPoints = [];

    this._onResize = this._handleResize.bind(this);
    this._onMove = this._handleMove.bind(this);
    this._onLeave = this._handleLeave.bind(this);
    this._onFrame = this._frame.bind(this);

    this._buildLines();
    this._buildClusterDots();
    this._handleResize();
  }

  BurstNetwork.prototype._buildLines = function () {
    var opts = this.opts;
    var count = opts.lineCount;
    var minLen = opts.minLength;
    var maxLen = opts.maxLength;
    var weights = opts.layerWeights;
    this.lines = [];

    for (var i = 0; i < count; i++) {
      var t = count > 1 ? i / (count - 1) : 0.5;
      var angle = lerp(-Math.PI + 0.15, -0.15, t) + rand(-0.012, 0.012);
      var lengthFactor = rand(minLen, maxLen);
      var defaultLayer = pickLayer(weights);
      var hasNode = Math.random() < opts.nodeRatio;

      this.lines.push({
        id: i,
        angle: angle,
        lengthFactor: lengthFactor,
        hasNode: hasNode,
        defaultLayer: defaultLayer,
        visualLayer: defaultLayer,
        ambientPhase: rand(0, TAU),
        ambientPeriod: rand(opts.ambientCycleMinMs, opts.ambientCycleMaxMs),
        dwellTime: 0,
        iridescenceDwellTime: 0,
        iridescence: 0,
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
      });
    }
  };

  BurstNetwork.prototype._buildClusterDots = function () {
    var opts = this.opts;
    var weights = opts.layerWeights;
    this.clusterDots = [];

    for (var i = 0; i < opts.clusterDotCount; i++) {
      var defaultLayer = pickLayer([0.45, 0.35, 0.2]);
      this.clusterDots.push({
        id: 'c' + i,
        angle: rand(-Math.PI + 0.12, -0.12),
        distFactor: rand(0.04, 0.2),
        defaultLayer: defaultLayer,
        visualLayer: defaultLayer,
        ambientPhase: rand(0, TAU),
        ambientPeriod: rand(opts.ambientCycleMinMs * 0.85, opts.ambientCycleMaxMs * 0.95),
        dwellTime: 0,
        iridescenceDwellTime: 0,
        iridescence: 0,
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
      });
    }
  };

  BurstNetwork.prototype._handleResize = function () {
    var rect = this.canvas.getBoundingClientRect();
    this.dpr = Math.min(global.devicePixelRatio || 1, 2);
    this.width = Math.max(rect.width, 1);
    this.height = Math.max(rect.height, 1);

    this.canvas.width = Math.round(this.width * this.dpr);
    this.canvas.height = Math.round(this.height * this.dpr);
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);

    this.origin.x = this.width * 0.5;
    this.origin.y = this.height * (1 + this.opts.originYOffset);

    var i;
    for (i = 0; i < this.lines.length; i++) {
      this._resetPoint(this.lines[i]);
    }
    for (i = 0; i < this.clusterDots.length; i++) {
      this._resetClusterDot(this.clusterDots[i]);
    }
  };

  BurstNetwork.prototype._resetPoint = function (line) {
    var rest = this._restPoint(line);
    line.x = rest.x;
    line.y = rest.y;
    line.vx = 0;
    line.vy = 0;
  };

  BurstNetwork.prototype._resetClusterDot = function (dot) {
    var rest = this._restClusterPoint(dot);
    dot.x = rest.x;
    dot.y = rest.y;
    dot.vx = 0;
    dot.vy = 0;
  };

  BurstNetwork.prototype._restPoint = function (line) {
    var span = Math.min(this.width, this.height);
    var len = span * line.lengthFactor;
    return {
      x: this.origin.x + Math.cos(line.angle) * len,
      y: this.origin.y + Math.sin(line.angle) * len,
    };
  };

  BurstNetwork.prototype._restClusterPoint = function (dot) {
    var span = Math.min(this.width, this.height);
    var len = span * dot.distFactor;
    return {
      x: this.origin.x + Math.cos(dot.angle) * len,
      y: this.origin.y + Math.sin(dot.angle) * len,
    };
  };

  BurstNetwork.prototype._ambientTargetLayer = function (entity, nowMs) {
    if (this.reducedMotion) return entity.defaultLayer;
    var wave = Math.sin((nowMs / entity.ambientPeriod) * TAU + entity.ambientPhase);
    return clamp(entity.defaultLayer + wave * this.opts.ambientLayerAmplitude, 0, 2);
  };

  BurstNetwork.prototype._edgeFactor = function (entity) {
    var span = Math.min(this.width, this.height) || 1;
    var rest = entity.lengthFactor != null
      ? this._restPoint(entity)
      : this._restClusterPoint(entity);
    var dx = rest.x - this.origin.x;
    var dy = rest.y - this.origin.y;
    var dist = Math.sqrt(dx * dx + dy * dy) / span;
    var angleEdge = clamp(Math.abs(entity.angle + Math.PI * 0.5) / (Math.PI * 0.5 - 0.12), 0, 1);
    var yEdge = clamp(1 - (rest.y / Math.max(this.height, 1)), 0, 1);
    return clamp(dist * 0.45 + angleEdge * 0.35 + yEdge * 0.35, 0, 1);
  };

  BurstNetwork.prototype._applySpring = function (pt, rest) {
    var opts = this.opts;
    var origin = this.origin;
    var springRadial = opts.springRadial != null ? opts.springRadial : opts.spring;
    var sdx = rest.x - pt.x;
    var sdy = rest.y - pt.y;
    var orx = rest.x - origin.x;
    var ory = rest.y - origin.y;
    var orLen = Math.sqrt(orx * orx + ory * ory) || 1;
    var ux = orx / orLen;
    var uy = ory / orLen;
    var radialDisp = sdx * ux + sdy * uy;
    var radialK = radialDisp < 0 ? opts.springRadialInward : springRadial;
    var tanDx = sdx - ux * radialDisp;
    var tanDy = sdy - uy * radialDisp;
    pt.vx += ux * radialDisp * radialK + tanDx * opts.springTangential;
    pt.vy += uy * radialDisp * radialK + tanDy * opts.springTangential;
  };

  BurstNetwork.prototype._handleMove = function (event) {
    var rect = this.canvas.getBoundingClientRect();
    this.mouse.x = event.clientX - rect.left;
    this.mouse.y = event.clientY - rect.top;
    this.mouse.active = true;
  };

  BurstNetwork.prototype._handleLeave = function () {
    this.mouse.active = false;
  };

  BurstNetwork.prototype._updateEntityLayerAndChase = function (entity, dt, nowMs, mx, my, promoteR2, irR2, interact) {
    var opts = this.opts;
    var dx = entity.x - mx;
    var dy = entity.y - my;
    var dist2 = dx * dx + dy * dy;
    var nearPromote = interact && dist2 < promoteR2;
    var nearIridescent = interact && dist2 < irR2;
    var ambientTarget = this._ambientTargetLayer(entity, nowMs);
    var promoteStrength = 0;

    if (nearPromote) {
      entity.dwellTime += dt;
      if (entity.dwellTime >= opts.promoteDwellMs && entity.defaultLayer > 0) {
        promoteStrength = clamp(entity.dwellTime / (opts.promoteDwellMs + 280), 0, 1);
        ambientTarget = lerp(ambientTarget, 0, promoteStrength * opts.ambientPromoteBlend);
      }
    } else {
      entity.dwellTime = Math.max(0, entity.dwellTime - dt * 1.8);
    }

    var layerSpeed = nearPromote ? opts.promoteLerp : opts.ambientLayerLerp;
    if (!nearPromote) {
      entity.visualLayer = lerp(entity.visualLayer, ambientTarget, opts.promoteDecay);
    } else {
      entity.visualLayer = lerp(entity.visualLayer, ambientTarget, layerSpeed);
    }

    if (nearIridescent) {
      entity.iridescenceDwellTime += dt;
    } else {
      entity.iridescenceDwellTime = Math.max(0, entity.iridescenceDwellTime - dt * 1.8);
    }

    var irTarget = 0;
    if (nearIridescent && entity.iridescenceDwellTime >= opts.iridescenceStartMs) {
      irTarget = this.reducedMotion ? 0.35 : 1;
    }
    var irSpeed = irTarget > entity.iridescence ? 0.055 : 0.07;
    entity.iridescence = lerp(entity.iridescence, irTarget, irSpeed);
  };

  BurstNetwork.prototype._updateLayerAndChase = function (dt, nowMs) {
    var opts = this.opts;
    var mx = this.mouse.sx;
    var my = this.mouse.sy;
    var promoteR2 = opts.promoteHitRadius * opts.promoteHitRadius;
    var irR2 = opts.iridescenceHitRadius * opts.iridescenceHitRadius;
    var interact = this.mouse.active;
    var i;

    for (i = 0; i < this.lines.length; i++) {
      this._updateEntityLayerAndChase(this.lines[i], dt, nowMs, mx, my, promoteR2, irR2, interact);
    }
    for (i = 0; i < this.clusterDots.length; i++) {
      this._updateEntityLayerAndChase(this.clusterDots[i], dt, nowMs, mx, my, promoteR2, irR2, interact);
    }
  };

  BurstNetwork.prototype._rebuildDrawOrder = function () {
    var order = this._drawOrder;
    var lines = this.lines;
    order.length = lines.length;
    for (var i = 0; i < lines.length; i++) order[i] = i;
    order.sort(function (a, b) {
      return lines[b].visualLayer - lines[a].visualLayer;
    });
  };

  BurstNetwork.prototype._drawBackground = function () {
    var ctx = this.ctx;
    var cx = this.width * 0.5;
    var cy = this.height * 0.72;
    var r = Math.max(this.width, this.height) * 0.75;

    var grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    grad.addColorStop(0, this.opts.gradientInner);
    grad.addColorStop(1, this.opts.gradientOuter);

    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, this.width, this.height);
  };

  BurstNetwork.prototype._strokeSegment = function (x0, y0, x1, y1, style, ir, phase, lineAlpha) {
    var ctx = this.ctx;
    var opts = this.opts;
    ctx.lineWidth = opts.lineWidth * style.lineWidthMul;
    ctx.lineCap = 'round';

    if (ir > 0.02) {
      var grad = ctx.createLinearGradient(x0, y0, x1, y1);
      var stops = iridescentStops(phase, lineAlpha, ir);
      for (var s = 0; s < stops.length; s++) {
        grad.addColorStop(stops[s].t, stops[s].color);
      }
      ctx.strokeStyle = grad;
    } else {
      ctx.strokeStyle = rgba(ACCENT.r, ACCENT.g, ACCENT.b, lineAlpha);
    }

    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    ctx.stroke();
  };

  BurstNetwork.prototype._drawNode = function (x, y, style, ir, phase, nodeAlpha, nodeScale) {
    var ctx = this.ctx;
    var opts = this.opts;
    var nodeR = opts.nodeRadius * style.nodeRadiusMul * (nodeScale || 1);
    if (ir > 0.02) {
      var nh = (phase * 95 + x * 0.07 + y * 0.05) % 360;
      ctx.fillStyle = hsla(nh, 62, 58, nodeAlpha * (0.55 + ir * 0.45));
    } else {
      ctx.fillStyle = rgba(ACCENT.r, ACCENT.g, ACCENT.b, nodeAlpha);
    }
    ctx.beginPath();
    ctx.arc(x, y, nodeR, 0, TAU);
    ctx.fill();
  };

  BurstNetwork.prototype._drawLine = function (line) {
    var origin = this.origin;
    var style = styleForLayer(line.visualLayer);
    var lineAlpha = style.lineOpacity;
    var nodeAlpha = style.nodeOpacity;
    var ir = line.iridescence;
    var phase = this.iridescencePhase;

    this._strokeSegment(origin.x, origin.y, line.x, line.y, style, ir, phase, lineAlpha);

    if (line.hasNode) {
      this._drawNode(line.x, line.y, style, ir, phase, nodeAlpha, 1);
    }
  };

  BurstNetwork.prototype._drawClusterDot = function (dot) {
    var style = styleForLayer(dot.visualLayer);
    var ir = dot.iridescence;
    var phase = this.iridescencePhase;
    this._drawNode(dot.x, dot.y, style, ir, phase, style.nodeOpacity, 0.78);
  };

  BurstNetwork.prototype._gatherSimPoints = function () {
    var pts = this._simPoints;
    pts.length = 0;
    var i;
    var line;

    for (i = 0; i < this.lines.length; i++) {
      line = this.lines[i];
      pts.push({ pt: line, layer: line.visualLayer, kind: 'end' });
    }
    for (i = 0; i < this.clusterDots.length; i++) {
      pts.push({ pt: this.clusterDots[i], layer: this.clusterDots[i].visualLayer, kind: 'cluster' });
    }
    return pts;
  };

  BurstNetwork.prototype._applyNeighborRepulsion = function (simPoints) {
    var opts = this.opts;
    var radius = opts.neighborRepulsionRadius;
    var r2 = radius * radius;
    var base = opts.neighborRepulsionStrength;
    var scales = opts.layerRepulsionScale;
    var n = simPoints.length;

    for (var i = 0; i < n; i++) {
      var a = simPoints[i];
      for (var j = i + 1; j < n; j++) {
        var b = simPoints[j];
        var dx = a.pt.x - b.pt.x;
        var dy = a.pt.y - b.pt.y;
        var dist2 = dx * dx + dy * dy;
        if (dist2 >= r2 || dist2 < 0.25) continue;

        var dist = Math.sqrt(dist2);
        var layerDiff = Math.abs(a.layer - b.layer);
        var layerA = clamp(Math.round(a.layer), 0, 2);
        var layerB = clamp(Math.round(b.layer), 0, 2);
        var strength = base * (scales[layerA] + scales[layerB]) * 0.5;
        strength *= 0.65 + layerDiff * 0.55;
        var push = (1 - dist / radius) * strength;
        var nx = dx / dist;
        var ny = dy / dist;
        a.pt.vx += nx * push;
        a.pt.vy += ny * push;
        b.pt.vx -= nx * push;
        b.pt.vy -= ny * push;
      }
    }
  };

  BurstNetwork.prototype._applyEdgeMotion = function (entity, nowMs) {
    if (this.reducedMotion) return;
    var factor = this._edgeFactor(entity);
    if (factor < 0.08) return;
    var amp = this.opts.edgeMotionAmplitude * factor;
    var osc = Math.sin(nowMs * this.opts.edgeMotionSpeed + entity.ambientPhase);
    entity.vy += osc * amp * 0.14;
  };

  BurstNetwork.prototype._applyMouseRepulsion = function (pt, mx, my) {
    var opts = this.opts;
    var dx = pt.x - mx;
    var dy = pt.y - my;
    var dist = Math.sqrt(dx * dx + dy * dy) || 1;
    if (dist < opts.interactionRadius) {
      var push = (1 - dist / opts.interactionRadius) * opts.interactionStrength;
      pt.vx += (dx / dist) * push;
      pt.vy += (dy / dist) * push * opts.yRepulsionBoost;
    }
  };

  BurstNetwork.prototype._simulate = function (nowMs) {
    var opts = this.opts;
    var mx = this.mouse.sx;
    var my = this.mouse.sy;
    var interact = !this.reducedMotion && this.mouse.active;
    var i;
    var line;

    for (i = 0; i < this.lines.length; i++) {
      line = this.lines[i];
      var rest = this._restPoint(line);

      if (interact) this._applyMouseRepulsion(line, mx, my);
      this._applyEdgeMotion(line, nowMs);
      this._applySpring(line, rest);
      line.vx *= opts.damping;
      line.vy *= opts.damping;
      line.x += line.vx;
      line.y += line.vy;
    }

    for (i = 0; i < this.clusterDots.length; i++) {
      var dot = this.clusterDots[i];
      var dotRest = this._restClusterPoint(dot);
      if (interact) this._applyMouseRepulsion(dot, mx, my);
      this._applyEdgeMotion(dot, nowMs);
      this._applySpring(dot, dotRest);
      dot.vx *= opts.damping;
      dot.vy *= opts.damping;
      dot.x += dot.vx;
      dot.y += dot.vy;
    }

    if (!this.reducedMotion) {
      this._applyNeighborRepulsion(this._gatherSimPoints());
    }

    if (interact) {
      this.mouse.sx = lerp(this.mouse.sx, this.mouse.x, opts.mouseSmoothing);
      this.mouse.sy = lerp(this.mouse.sy, this.mouse.y, opts.mouseSmoothing);
    }
  };

  BurstNetwork.prototype._draw = function () {
    var ctx = this.ctx;
    var i;

    ctx.clearRect(0, 0, this.width, this.height);
    this._drawBackground();

    var cluster = this.clusterDots.slice().sort(function (a, b) {
      return b.visualLayer - a.visualLayer;
    });
    for (i = 0; i < cluster.length; i++) {
      this._drawClusterDot(cluster[i]);
    }

    this._rebuildDrawOrder();
    var order = this._drawOrder;
    for (i = 0; i < order.length; i++) {
      this._drawLine(this.lines[order[i]]);
    }
  };

  BurstNetwork.prototype._frame = function (now) {
    if (!this.running) return;
    if (!this.lastFrame) this.lastFrame = now;
    var dt = Math.min(now - this.lastFrame, 48);
    this.lastFrame = now;

    if (!this.reducedMotion) {
      this.iridescencePhase += dt * this.opts.iridescencePhaseSpeed;
    }

    this._updateLayerAndChase(dt, now);
    this._simulate(now);
    this._draw();
    this.rafId = global.requestAnimationFrame(this._onFrame);
  };

  BurstNetwork.prototype.start = function () {
    if (this.running) return this;

    this.running = true;
    this.lastFrame = 0;
    this.canvas.addEventListener('pointermove', this._onMove, { passive: true });
    this.canvas.addEventListener('pointerleave', this._onLeave);
    global.addEventListener('resize', this._onResize);

    if (typeof ResizeObserver !== 'undefined') {
      this._ro = new ResizeObserver(this._onResize);
      this._ro.observe(this.canvas);
    }

    this.mouse.sx = this.width * 0.5;
    this.mouse.sy = this.height * 0.5;
    this.rafId = global.requestAnimationFrame(this._onFrame);
    return this;
  };

  BurstNetwork.prototype.stop = function () {
    this.running = false;
    global.cancelAnimationFrame(this.rafId);
    this.canvas.removeEventListener('pointermove', this._onMove);
    this.canvas.removeEventListener('pointerleave', this._onLeave);
    global.removeEventListener('resize', this._onResize);
    if (this._ro) {
      this._ro.disconnect();
      this._ro = null;
    }
    return this;
  };

  BurstNetwork.prototype.destroy = function () {
    this.stop();
    this.lines = [];
    this.clusterDots = [];
    return this;
  };

  global.BurstNetwork = BurstNetwork;
})(typeof window !== 'undefined' ? window : globalThis);
