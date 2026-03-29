import * as Vec2 from 'vec2';
import Network from '../../../core/Network';
import Node from '../../../core/Node';
import Attractor from '../../../core/Attractor';
import Path from '../../../core/Path';
import { random } from '../../../core/Utilities';
import { setupKeyListeners } from '../../../core/KeyboardInteractions';
import Settings from './Settings';
import { Spirit1, Spirit1Extents } from './AttractorPatterns.generated';

let canvas, ctx;
let network;

let showHelp = false;

// Create initial conditions for simulation
let setup = () => {
  // Initialize canvas and context
  canvas = document.getElementById('sketch');
  ctx = canvas.getContext('2d');

  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;

  // Initialize simulation object
  network = new Network(ctx, Settings);

  // Add the bounds, attractors, and root nodes
  resetNetwork();

  // Set up common keyboard interaction listeners
  setupKeyListeners(network);

  // Build UI controls
  buildUI();

  // Begin animation loop
  requestAnimationFrame(update);
}

let resetNetwork = () => {
  network.reset();
  addAttractors();
  addRootNodes();
}

  let addAttractors = () => {
    let attractors = [];

    // Use canvas area (excluding sidebar) for scaling
    const canvasW = window.innerWidth - 272;
    const canvasH = window.innerHeight;

    // Scale the coordinates to fit within the canvas area
    const scale = Math.min(
      canvasW / Spirit1Extents.width,
      canvasH / Spirit1Extents.height
    ) * 0.8;

    // Center the pattern in the canvas area (offset for sidebar)
    const offsetX = (canvasW - (Spirit1Extents.width * scale)) / 2;
    const offsetY = (canvasH - (Spirit1Extents.height * scale)) / 2;

    for(let coords of Spirit1) {
      const x = (coords[0] - Spirit1Extents.minX) * scale + offsetX;
      const y = (coords[1] - Spirit1Extents.minY) * scale + offsetY;
      
      attractors.push(
        new Attractor(
          new Vec2(x, y),
          ctx,
          Settings
        )
      );
    }

    network.attractors = attractors;
  
    for(let attractor of network.attractors) {
      attractor.settings = network.settings;
    }
  }

  // Create the network with multiple root nodes spread across the text pattern
  let addRootNodes = () => {
    const canvasW = window.innerWidth - 272;
    const canvasH = window.innerHeight;
    const scale = Math.min(
      canvasW / Spirit1Extents.width,
      canvasH / Spirit1Extents.height
    ) * 0.8;
    const offsetX = (canvasW - (Spirit1Extents.width * scale)) / 2;
    const offsetY = (canvasH - (Spirit1Extents.height * scale)) / 2;

    // Pick evenly spaced seed points from the attractor data
    const numRoots = 8;
    const step = Math.floor(Spirit1.length / numRoots);
    for(let i = 0; i < numRoots; i++) {
      const idx = i * step;
      const coords = Spirit1[idx];
      const x = (coords[0] - Spirit1Extents.minX) * scale + offsetX;
      const y = (coords[1] - Spirit1Extents.minY) * scale + offsetY;

      network.addNode(
        new Node(
          null,
          new Vec2(x, y),
          false,
          ctx,
          Settings
        )
      );
    }
  }

// Main program loop
let update = (timestamp) => {
  network.update();
  network.draw();

  if(showHelp) {
    drawText();
  }

  requestAnimationFrame(update);
}

let drawText = () => {
  ctx.font = '16px sans-serif';
  ctx.fillStyle = 'rgba(255,255,255,.5)';
  ctx.fillText('Space=pause  r=reset  h=hide', 20, 30);
}

// Key commands specific to this sketch
document.addEventListener('keypress', (e) => {
  switch(e.key) {
    case 'r':
      resetNetwork();
      break;
    case 'h':
      showHelp = !showHelp;
      break;
  }
});


// ═══════════════════════════════════════════════════════════════════
// UI Controls
// ═══════════════════════════════════════════════════════════════════

function buildUI() {
  const sidebar = document.createElement('div');
  sidebar.id = 'controls-sidebar';
  sidebar.innerHTML = `
    <div class="sidebar-header">
      <div class="sidebar-title">Space Colonization</div>
      <div class="sidebar-version">Spirit</div>
    </div>

    <hr class="divider" />

    <!-- SIMULATION -->
    <div>
      <button class="section-btn" data-section="simulation">
        <span class="section-title">Simulation</span>
        <span class="section-chevron">▾</span>
      </button>
      <div class="section-body" id="section-simulation">
        <div class="slider-row">
          <span class="slider-label">Segment</span>
          <input type="range" id="ctrl-segment" min="1" max="10" step="0.5" value="${network.settings.SegmentLength}" />
          <span class="slider-value" id="val-segment">${network.settings.SegmentLength}</span>
        </div>
        <div class="slider-row">
          <span class="slider-label">Attract</span>
          <input type="range" id="ctrl-attract" min="3" max="80" step="1" value="${network.settings.AttractionDistance}" />
          <span class="slider-value" id="val-attract">${network.settings.AttractionDistance}</span>
        </div>
        <div class="slider-row">
          <span class="slider-label">Kill Dist</span>
          <input type="range" id="ctrl-kill" min="1" max="20" step="0.5" value="${network.settings.KillDistance}" />
          <span class="slider-value" id="val-kill">${network.settings.KillDistance}</span>
        </div>
        <div class="mode-toggle" style="margin-top:4px">
          <button class="mode-btn ${network.settings.VenationType==='Open'?'active':''}" data-venation="Open">Open</button>
          <button class="mode-btn ${network.settings.VenationType==='Closed'?'active':''}" data-venation="Closed">Closed</button>
        </div>
      </div>
    </div>

    <hr class="divider" />

    <!-- RENDERING -->
    <div>
      <button class="section-btn" data-section="rendering">
        <span class="section-title">Rendering</span>
        <span class="section-chevron">▾</span>
      </button>
      <div class="section-body" id="section-rendering">
        <div class="slider-row">
          <span class="slider-label">Branch W</span>
          <input type="range" id="ctrl-branch" min="0.5" max="5" step="0.1" value="${network.settings.BranchThickness}" />
          <span class="slider-value" id="val-branch">${network.settings.BranchThickness}</span>
        </div>
        <div class="slider-row">
          <span class="slider-label">Tip W</span>
          <input type="range" id="ctrl-tip" min="0.5" max="5" step="0.1" value="${network.settings.TipThickness}" />
          <span class="slider-value" id="val-tip">${network.settings.TipThickness}</span>
        </div>
        <div class="mode-toggle" style="margin-top:4px">
          <button class="mode-btn ${network.settings.RenderMode==='Lines'?'active':''}" data-render="Lines">Lines</button>
          <button class="mode-btn ${network.settings.RenderMode==='Dots'?'active':''}" data-render="Dots">Dots</button>
        </div>
      </div>
    </div>

    <hr class="divider" />

    <!-- TOGGLES -->
    <div>
      <button class="section-btn" data-section="toggles">
        <span class="section-title">Visibility</span>
        <span class="section-chevron">▾</span>
      </button>
      <div class="section-body" id="section-toggles">
        <label class="toggle-row"><input type="checkbox" id="chk-nodes" ${network.settings.ShowNodes?'checked':''} /><span>Nodes</span></label>
        <label class="toggle-row"><input type="checkbox" id="chk-attractors" ${network.settings.ShowAttractors?'checked':''} /><span>Attractors</span></label>
        <label class="toggle-row"><input type="checkbox" id="chk-tips" ${network.settings.ShowTips?'checked':''} /><span>Tips</span></label>
        <label class="toggle-row"><input type="checkbox" id="chk-influence" ${network.settings.ShowInfluenceLines?'checked':''} /><span>Influence Lines</span></label>
        <label class="toggle-row"><input type="checkbox" id="chk-attract-zones" ${network.settings.ShowAttractionZones?'checked':''} /><span>Attraction Zones</span></label>
        <label class="toggle-row"><input type="checkbox" id="chk-kill-zones" ${network.settings.ShowKillZones?'checked':''} /><span>Kill Zones</span></label>
        <label class="toggle-row"><input type="checkbox" id="chk-canalization" ${network.settings.EnableCanalization?'checked':''} /><span>Canalization</span></label>
        <label class="toggle-row"><input type="checkbox" id="chk-opacity" ${network.settings.EnableOpacityBlending?'checked':''} /><span>Opacity Blending</span></label>
      </div>
    </div>

    <hr class="divider" />

    <!-- ACTIONS -->
    <div style="padding:12px 16px;display:flex;flex-direction:column;gap:8px">
      <button class="btn-action" id="btn-pause">${network.settings.IsPaused ? '▶ Resume' : '⏸ Pause'}</button>
      <button class="btn-action btn-reset" id="btn-reset">↻ Reset</button>
    </div>

    <!-- INFO -->
    <div style="padding:8px 16px">
      <div class="info-card">
        <span class="info-card-label">Nodes</span>
        <span class="info-card-value" id="info-nodes">0</span>
      </div>
      <div class="info-card" style="margin-top:6px">
        <span class="info-card-label">Attractors</span>
        <span class="info-card-value" id="info-attractors">0</span>
      </div>
    </div>
  `;

  document.body.appendChild(sidebar);
  bindUI();

  // Update info counts periodically
  setInterval(() => {
    const nodesEl = document.getElementById('info-nodes');
    const attractorsEl = document.getElementById('info-attractors');
    if(nodesEl) nodesEl.textContent = network.nodes.length;
    if(attractorsEl) attractorsEl.textContent = network.attractors.length;
  }, 500);
}

function bindUI() {
  // Slider bindings
  const sliders = [
    { id: 'ctrl-segment', val: 'val-segment', key: 'SegmentLength', parse: parseFloat },
    { id: 'ctrl-attract', val: 'val-attract', key: 'AttractionDistance', parse: parseFloat },
    { id: 'ctrl-kill', val: 'val-kill', key: 'KillDistance', parse: parseFloat },
    { id: 'ctrl-branch', val: 'val-branch', key: 'BranchThickness', parse: parseFloat },
    { id: 'ctrl-tip', val: 'val-tip', key: 'TipThickness', parse: parseFloat },
  ];

  for(let s of sliders) {
    const el = document.getElementById(s.id);
    const valEl = document.getElementById(s.val);
    el.addEventListener('input', () => {
      const v = s.parse(el.value);
      network.settings[s.key] = v;
      Settings[s.key] = v;
      valEl.textContent = v;
    });
  }

  // Venation type
  document.querySelectorAll('[data-venation]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('[data-venation]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const v = btn.getAttribute('data-venation');
      network.settings.VenationType = v;
      Settings.VenationType = v;
    });
  });

  // Render mode
  document.querySelectorAll('[data-render]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('[data-render]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const v = btn.getAttribute('data-render');
      network.settings.RenderMode = v;
      Settings.RenderMode = v;
    });
  });

  // Toggle checkboxes
  const toggles = [
    { id: 'chk-nodes', key: 'ShowNodes' },
    { id: 'chk-attractors', fn: () => network.toggleAttractors() },
    { id: 'chk-tips', fn: () => network.toggleTips() },
    { id: 'chk-influence', key: 'ShowInfluenceLines' },
    { id: 'chk-attract-zones', fn: () => network.toggleAttractionZones() },
    { id: 'chk-kill-zones', fn: () => network.toggleKillZones() },
    { id: 'chk-canalization', fn: () => network.toggleCanalization() },
    { id: 'chk-opacity', fn: () => network.toggleOpacityBlending() },
  ];

  for(let t of toggles) {
    const el = document.getElementById(t.id);
    el.addEventListener('change', () => {
      if(t.fn) {
        t.fn();
      } else {
        network.settings[t.key] = el.checked;
        Settings[t.key] = el.checked;
      }
    });
  }

  // Section accordion
  document.querySelectorAll('[data-section]').forEach(btn => {
    btn.addEventListener('click', () => {
      const target = btn.getAttribute('data-section');
      const body = document.getElementById('section-' + target);
      const chevron = btn.querySelector('.section-chevron');
      if(!body) return;
      const isOpen = !body.classList.contains('hidden');
      body.classList.toggle('hidden', isOpen);
      if(chevron) chevron.textContent = isOpen ? '▸' : '▾';
    });
  });

  // Pause / Reset
  document.getElementById('btn-pause').addEventListener('click', () => {
    network.togglePause();
    document.getElementById('btn-pause').textContent = network.settings.IsPaused ? '▶ Resume' : '⏸ Pause';
  });

  document.getElementById('btn-reset').addEventListener('click', () => {
    resetNetwork();
  });
}


// Kick off the application
setup();