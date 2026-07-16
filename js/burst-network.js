/**
 * BurstNetwork — Stripe-style radiating line visualization.
 * Canvas-based, mouse-interactive physics simulation.
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

  var DEFAULTS = {
    lineCount: 200,
    minLength: 0.35,
    maxLength: 0.95,
    nodeRatio: 0.55,
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
  };

  function rand(min, max) {
    return min + Math.random() * (max - min);
  }

  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  function BurstNetwork(canvas, options) {
    if (!canvas || !canvas.getContext) {
      throw new Error('BurstNetwork requires a canvas element');
    }

    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.opts = Object.assign({}, DEFAULTS, options || {});
    this.lines = [];
    this.running = false;
    this.rafId = 0;
    this.width = 0;
    this.height = 0;
    this.dpr = 1;
    this.origin = { x: 0, y: 0 };
    this.mouse = { x: 0, y: 0, active: false, sx: 0, sy: 0 };
    this.reducedMotion = global.matchMedia('(prefers-reduced-motion: reduce)').matches;

    this._onResize = this._handleResize.bind(this);
    this._onMove = this._handleMove.bind(this);
    this._onLeave = this._handleLeave.bind(this);
    this._onFrame = this._frame.bind(this);

    this._buildLines();
    this._handleResize();
  }

  BurstNetwork.prototype._buildLines = function () {
    var count = this.opts.lineCount;
    var minLen = this.opts.minLength;
    var maxLen = this.opts.maxLength;
    this.lines = [];

    for (var i = 0; i < count; i++) {
      var t = count > 1 ? i / (count - 1) : 0.5;
      var angle = lerp(-Math.PI + 0.15, -0.15, t) + rand(-0.012, 0.012);
      var lengthFactor = rand(minLen, maxLen);
      var hasNode = Math.random() < this.opts.nodeRatio;

      this.lines.push({
        angle: angle,
        lengthFactor: lengthFactor,
        hasNode: hasNode,
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

    for (var i = 0; i < this.lines.length; i++) {
      var line = this.lines[i];
      var rest = this._restPoint(line);
      line.x = rest.x;
      line.y = rest.y;
      line.vx = 0;
      line.vy = 0;
    }
  };

  BurstNetwork.prototype._restPoint = function (line) {
    var span = Math.min(this.width, this.height);
    var len = span * line.lengthFactor;
    return {
      x: this.origin.x + Math.cos(line.angle) * len,
      y: this.origin.y + Math.sin(line.angle) * len,
    };
  };

  BurstNetwork.prototype._applySpring = function (line, rest) {
    var opts = this.opts;
    var origin = this.origin;
    var springRadial = opts.springRadial != null ? opts.springRadial : opts.spring;
    var sdx = rest.x - line.x;
    var sdy = rest.y - line.y;
    var orx = rest.x - origin.x;
    var ory = rest.y - origin.y;
    var orLen = Math.sqrt(orx * orx + ory * ory) || 1;
    var ux = orx / orLen;
    var uy = ory / orLen;
    var radialDisp = sdx * ux + sdy * uy;
    var radialK = radialDisp < 0 ? opts.springRadialInward : springRadial;
    var tanDx = sdx - ux * radialDisp;
    var tanDy = sdy - uy * radialDisp;
    line.vx += ux * radialDisp * radialK + tanDx * opts.springTangential;
    line.vy += uy * radialDisp * radialK + tanDy * opts.springTangential;
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

  BurstNetwork.prototype._simulate = function () {
    var opts = this.opts;
    var origin = this.origin;
    var mx = this.mouse.sx;
    var my = this.mouse.sy;
    var interact = !this.reducedMotion && this.mouse.active;

    for (var i = 0; i < this.lines.length; i++) {
      var line = this.lines[i];
      var rest = this._restPoint(line);

      if (interact) {
        var dx = line.x - mx;
        var dy = line.y - my;
        var dist = Math.sqrt(dx * dx + dy * dy) || 1;
        if (dist < opts.interactionRadius) {
          var push = (1 - dist / opts.interactionRadius) * opts.interactionStrength;
          line.vx += (dx / dist) * push;
          line.vy += (dy / dist) * push * opts.yRepulsionBoost;
        }
      }

      this._applySpring(line, rest);
      line.vx *= opts.damping;
      line.vy *= opts.damping;
      line.x += line.vx;
      line.y += line.vy;
    }

    if (interact) {
      this.mouse.sx = lerp(this.mouse.sx, this.mouse.x, opts.mouseSmoothing);
      this.mouse.sy = lerp(this.mouse.sy, this.mouse.y, opts.mouseSmoothing);
    }
  };

  BurstNetwork.prototype._draw = function () {
    var ctx = this.ctx;
    var origin = this.origin;
    var opts = this.opts;

    ctx.clearRect(0, 0, this.width, this.height);
    this._drawBackground();

    ctx.lineWidth = opts.lineWidth;
    ctx.strokeStyle = opts.lineColor;
    ctx.fillStyle = opts.nodeColor;

    ctx.beginPath();
    for (var i = 0; i < this.lines.length; i++) {
      var line = this.lines[i];
      ctx.moveTo(origin.x, origin.y);
      ctx.lineTo(line.x, line.y);
    }
    ctx.stroke();

    for (var j = 0; j < this.lines.length; j++) {
      var ln = this.lines[j];
      if (!ln.hasNode) continue;
      ctx.beginPath();
      ctx.arc(ln.x, ln.y, opts.nodeRadius, 0, Math.PI * 2);
      ctx.fill();
    }
  };

  BurstNetwork.prototype._frame = function () {
    if (!this.running) return;
    this._simulate();
    this._draw();
    this.rafId = global.requestAnimationFrame(this._onFrame);
  };

  BurstNetwork.prototype.start = function () {
    if (this.running) return this;

    this.running = true;
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
    return this;
  };

  global.BurstNetwork = BurstNetwork;
})(typeof window !== 'undefined' ? window : globalThis);
