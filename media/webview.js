// Runs inside the VL preview webview: renders the SVG pushed by the extension
// host and provides zoom-to-cursor / drag-to-pan navigation.
(function () {
  'use strict';

  var vscode = acquireVsCodeApi();
  var viewport = document.getElementById('viewport');
  var scene = document.getElementById('scene');
  var statusEl = document.getElementById('status');

  var state = { scale: 1, tx: 0, ty: 0 };
  var svgInfo = null; // { width, height } of the current SVG

  function applyTransform() {
    scene.style.transform = 'translate(' + state.tx + 'px,' + state.ty + 'px) scale(' + state.scale + ')';
  }

  function fitToView() {
    if (!svgInfo) { return; }
    var vw = viewport.clientWidth;
    var vh = viewport.clientHeight;
    var pad = 24;
    var scale = Math.min(
      (vw - pad * 2) / svgInfo.width,
      (vh - pad * 2) / svgInfo.height
    );
    // Clamp so tiny patches do not blow up beyond 2x and huge ones stay sane.
    scale = Math.max(0.02, Math.min(scale, 2));
    state.scale = scale;
    state.tx = (vw - svgInfo.width * scale) / 2;
    state.ty = (vh - svgInfo.height * scale) / 2;
    applyTransform();
  }

  function setStatus(text, isError) {
    statusEl.textContent = text || '';
    statusEl.className = isError ? 'error' : '';
  }

  function parseSvgSize(svgMarkup) {
    var parser = new DOMParser();
    var doc = parser.parseFromString(svgMarkup, 'image/svg+xml');
    var svg = doc.documentElement;
    if (!svg || svg.nodeName.toLowerCase() !== 'svg') { return null; }
    var width = parseFloat(svg.getAttribute('width'));
    var height = parseFloat(svg.getAttribute('height'));
    if (!isFinite(width) || !isFinite(height)) {
      var viewBox = (svg.getAttribute('viewBox') || '').split(/[\s,]+/).map(parseFloat);
      if (viewBox.length === 4 && isFinite(viewBox[2]) && isFinite(viewBox[3])) {
        width = viewBox[2];
        height = viewBox[3];
      }
    }
    if (!isFinite(width) || !isFinite(height)) { return null; }
    return { width: width, height: height };
  }

  function showRender(svgMarkup) {
    scene.innerHTML = svgMarkup;
    svgInfo = parseSvgSize(svgMarkup);
    fitToView();
    setStatus('');
  }

  // --- Pan / zoom interaction -------------------------------------------------

  viewport.addEventListener('wheel', function (e) {
    e.preventDefault();
    if (!svgInfo) { return; }
    var factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
    var rect = viewport.getBoundingClientRect();
    var mx = e.clientX - rect.left;
    var my = e.clientY - rect.top;
    var next = state.scale * factor;
    next = Math.max(0.02, Math.min(next, 16));
    factor = next / state.scale;
    state.scale = next;
    // Zoom around the cursor.
    state.tx = mx - (mx - state.tx) * factor;
    state.ty = my - (my - state.ty) * factor;
    applyTransform();
  }, { passive: false });

  var dragging = false;
  var lastX = 0;
  var lastY = 0;

  viewport.addEventListener('pointerdown', function (e) {
    if (e.button !== 0 && e.button !== 1) { return; }
    dragging = true;
    lastX = e.clientX;
    lastY = e.clientY;
    viewport.classList.add('dragging');
    viewport.setPointerCapture(e.pointerId);
  });

  viewport.addEventListener('pointermove', function (e) {
    if (!dragging) { return; }
    state.tx += e.clientX - lastX;
    state.ty += e.clientY - lastY;
    lastX = e.clientX;
    lastY = e.clientY;
    applyTransform();
  });

  function endDrag() {
    dragging = false;
    viewport.classList.remove('dragging');
  }
  viewport.addEventListener('pointerup', endDrag);
  viewport.addEventListener('pointercancel', endDrag);

  document.getElementById('zoom-in').addEventListener('click', function () {
    state.scale = Math.min(state.scale * 1.25, 16);
    applyTransform();
  });
  document.getElementById('zoom-out').addEventListener('click', function () {
    state.scale = Math.max(state.scale / 1.25, 0.02);
    applyTransform();
  });
  document.getElementById('zoom-fit').addEventListener('click', fitToView);
  document.getElementById('zoom-100').addEventListener('click', function () {
    state.scale = 1;
    applyTransform();
  });

  window.addEventListener('resize', fitToView);

  // --- Messages from the extension host ---------------------------------------

  window.addEventListener('message', function (event) {
    var msg = event.data;
    if (!msg || typeof msg.type !== 'string') { return; }
    if (msg.type === 'render') {
      showRender(msg.svg);
    } else if (msg.type === 'error') {
      setStatus(msg.message, true);
    } else if (msg.type === 'status') {
      setStatus(msg.message, false);
    }
  });

  vscode.postMessage({ type: 'ready' });
}());
