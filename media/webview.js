// Runs inside the VL preview webview: renders the SVG pushed by the extension
// host and provides canvas selection, element details and pan/zoom navigation.
(function () {
  'use strict';

  var vscode = acquireVsCodeApi();
  var viewport = document.getElementById('viewport');
  var scene = document.getElementById('scene');
  var statusEl = document.getElementById('status');
  var canvasSelect = document.getElementById('canvas-select');
  var detailsPanel = document.getElementById('details');
  var detailsContent = document.getElementById('details-content');

  var state = { scale: 1, tx: 0, ty: 0 };
  var svgInfo = null; // { width, height } of the current SVG
  var selectedElementId = null;
  var lastPointerDownId = null;
  var lastPointerDownTime = 0;

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

  function showRender(message) {
    scene.innerHTML = message.svg;
    svgInfo = parseSvgSize(message.svg);
    updateCanvasOptions(message.canvases, message.selectedCanvasId);
    fitToView();
    setSelectedElement(selectedElementId);
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
    var group = e.button === 0 ? selectedGroup(e) : null;
    var id = group ? group.getAttribute('data-element-id') : null;
    if (group && id) {
      if (lastPointerDownId === id && e.timeStamp - lastPointerDownTime < 450) {
        zoomToElement(group);
        lastPointerDownTime = 0;
        e.preventDefault();
      } else {
        lastPointerDownTime = e.timeStamp;
      }
      lastPointerDownId = id;
      setSelectedElement(id);
      vscode.postMessage({ type: 'selectElement', elementId: id });
    } else {
      lastPointerDownId = null;
    }
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

  // --- Canvas selection and details --------------------------------------------

  function updateCanvasOptions(canvases, selectedId) {
    canvasSelect.innerHTML = '';
    var whole = document.createElement('option');
    whole.value = '';
    whole.textContent = 'Whole document';
    canvasSelect.appendChild(whole);
    (canvases || []).forEach(function (canvas) {
      var option = document.createElement('option');
      option.value = canvas.id;
      option.textContent = canvas.name;
      canvasSelect.appendChild(option);
    });
    canvasSelect.value = selectedId === null ? '' : (selectedId || '');
    canvasSelect.disabled = !canvases || canvases.length === 0;
  }

  function setSelectedElement(id) {
    selectedElementId = id;
    var selected = scene.querySelectorAll('.element.selected');
    for (var i = 0; i < selected.length; i++) {
      selected[i].classList.remove('selected');
    }
    if (!id) { return; }
    var elements = scene.querySelectorAll('[data-element-id]');
    for (var j = 0; j < elements.length; j++) {
      if (elements[j].getAttribute('data-element-id') === id) {
        elements[j].classList.add('selected');
        return;
      }
    }
  }

  function clearDetails() {
    detailsPanel.hidden = true;
    detailsContent.innerHTML = '';
    setSelectedElement(null);
  }

  function selectedGroup(event) {
    if (!event.target || typeof event.target.closest !== 'function') { return null; }
    var group = event.target.closest('[data-element-id]');
    return group && scene.contains(group) ? group : null;
  }

  function zoomToElement(group) {
    if (!group || typeof group.getBBox !== 'function') { return; }
    var bounds = group.getBBox();
    if (!bounds.width || !bounds.height) { return; }
    var vw = viewport.clientWidth;
    var vh = viewport.clientHeight;
    var scale = Math.min((vw - 80) / bounds.width, (vh - 80) / bounds.height, 4);
    if (!isFinite(scale) || scale <= 0) { return; }
    state.scale = Math.max(0.02, scale);
    state.tx = vw / 2 - (bounds.x + bounds.width / 2) * state.scale;
    state.ty = vh / 2 - (bounds.y + bounds.height / 2) * state.scale;
    applyTransform();
  }

  canvasSelect.addEventListener('change', function () {
    selectedElementId = null;
    clearDetails();
    vscode.postMessage({ type: 'selectCanvas', canvasId: canvasSelect.value || null });
  });

  function addDetailRow(label, value) {
    var row = document.createElement('div');
    row.className = 'detail-row';
    var labelEl = document.createElement('span');
    labelEl.className = 'detail-label';
    labelEl.textContent = label + ': ';
    var valueEl = document.createElement('span');
    valueEl.className = 'detail-value';
    valueEl.textContent = value === undefined || value === null ? '—' : (value === '' ? '(empty)' : String(value));
    row.appendChild(labelEl);
    row.appendChild(valueEl);
    detailsContent.appendChild(row);
  }

  function addSectionTitle(text) {
    var title = document.createElement('h3');
    title.textContent = text;
    detailsContent.appendChild(title);
  }

  function addValueEditor(label, value, apply) {
    var row = document.createElement('div');
    row.className = 'editor-row';
    var labelEl = document.createElement('label');
    labelEl.textContent = label;
    var input = document.createElement('input');
    input.value = value === undefined || value === null ? '' : String(value);
    var button = document.createElement('button');
    button.type = 'button';
    button.textContent = 'Apply';
    button.addEventListener('click', function () { apply(input.value); });
    row.appendChild(labelEl);
    row.appendChild(input);
    row.appendChild(button);
    detailsContent.appendChild(row);
  }

  function showDetails(details) {
    detailsPanel.hidden = false;
    detailsContent.innerHTML = '';
    var title = document.createElement('h2');
    title.textContent = details.name;
    detailsContent.appendChild(title);
    addDetailRow('Kind', details.kind);
    addDetailRow('Category', details.category);
    addDetailRow('ID', details.id);
    addDetailRow('Bounds', details.bounds);
    if (details.comment !== undefined) {
      addDetailRow('Comment', details.comment);
    }

    if (details.kind === 'pad') {
      addSectionTitle('Saved value');
      if (details.editable) {
        addValueEditor('Value', details.value, function (value) {
          vscode.postMessage({ type: 'setPadValue', padId: details.id, value: value });
        });
      } else {
        addDetailRow('Value', details.value);
      }
    } else if (details.kind === 'node') {
      addSectionTitle('Pins');
      (details.pins || []).forEach(function (pin) {
        var label = pin.name + ' (' + pin.kind + (pin.hidden ? ', hidden' : '') + ')';
        if (pin.editable) {
          addValueEditor(label, pin.defaultValue, function (value) {
            vscode.postMessage({ type: 'setPinDefault', pinId: pin.id, value: value });
          });
        } else {
          addDetailRow(label, pin.defaultValue);
          if (pin.readOnlyReason) {
            var reason = document.createElement('div');
            reason.className = 'detail-readonly';
            reason.textContent = pin.readOnlyReason;
            detailsContent.appendChild(reason);
          }
        }
      });
    }

    var note = document.createElement('div');
    note.className = 'detail-note';
    note.textContent = 'Saved XML values only. Runtime values and vvvv type checking are not available.';
    detailsContent.appendChild(note);
  }

  // --- Messages from the extension host ---------------------------------------

  window.addEventListener('message', function (event) {
    var msg = event.data;
    if (!msg || typeof msg.type !== 'string') { return; }
    if (msg.type === 'render') {
      showRender(msg);
    } else if (msg.type === 'details') {
      showDetails(msg.details);
    } else if (msg.type === 'detailsEmpty') {
      clearDetails();
    } else if (msg.type === 'error') {
      setStatus(msg.message, true);
    } else if (msg.type === 'status') {
      setStatus(msg.message, false);
    }
  });

  vscode.postMessage({ type: 'ready' });
}());
