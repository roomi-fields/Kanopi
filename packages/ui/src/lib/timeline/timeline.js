// Vendorisé tel quel depuis BPscript/public/timeline.js — ne pas éditer la
// logique (intégration amont). Seule modification autorisée : l'export ESM en
// fin de fichier.
/**
 * BPscript Timeline — Canvas 2D interactive visualization
 *
 * Renders timed tokens as colored blocks on a zoomable, scrollable timeline.
 * Voices are stacked vertically. CV and control lanes appear below their voice.
 * Features: zoom (Ctrl+wheel), scroll (wheel/drag), auto-follow cursor,
 * block selection, hover tooltips, edge handles for future drag, minimap.
 */

// ============ Color palette ============

const VOICE_COLORS = [
  '#e05572', '#5b8dd9', '#3dc98a', '#d4994a', '#b07acc',
  '#45b7d1', '#e87c9e', '#7ce8a8', '#e9a845', '#8e94a8',
];

const COLORS = {
  bg: '#08090d',
  trackBg: '#0c0e14',
  trackBorder: '#1e2333',
  text: '#c8ccd8',
  textDim: '#505770',
  ruler: '#11141c',
  rulerText: '#505770',
  rulerLine: '#1e2333',
  cursor: '#7ce8a8',
  cursorGlow: 'rgba(124, 232, 168, 0.12)',
  selection: 'rgba(224, 85, 114, 0.25)',
  selectionBorder: '#e05572',
  gap: 'rgba(255,255,255,0.02)',
  silence: 'rgba(255,255,255,0.04)',
  controlMark: '#5b8dd9',
  cvMark: '#d4994a',
  headerBg: '#0c0e14',
  headerBorder: '#1e2333',
  edgeHandle: '#e8eaf0',
  minimap: 'rgba(224, 85, 114, 0.35)',
  minimapView: 'rgba(124, 232, 168, 0.2)',
  minimapBg: '#08090d',
};

// ============ TimelineRange — time↔pixel conversion ============

class TimelineRange {
  constructor(totalMs) {
    this.totalMs = totalMs;
    this.scrollX = 0;
    this.zoom = 1;           // pixels per ms
    this._viewWidth = 800;
  }

  setViewWidth(w) { this._viewWidth = w; }
  get viewWidth() { return this._viewWidth; }
  get visibleMs() { return this._viewWidth / this.zoom; }
  get scrollMs() { return this.scrollX / this.zoom; }

  msToX(ms) { return (ms * this.zoom) - this.scrollX; }
  xToMs(x) { return (x + this.scrollX) / this.zoom; }

  zoomAt(x, factor) {
    const ms = this.xToMs(x);
    this.zoom = Math.max(0.005, Math.min(20, this.zoom * factor));
    this.scrollX = (ms * this.zoom) - x;
    this.clampScroll();
  }

  fitToView() {
    this.zoom = this._viewWidth / Math.max(1, this.totalMs);
    this.scrollX = 0;
  }

  clampScroll() {
    const maxScroll = Math.max(0, this.totalMs * this.zoom - this._viewWidth);
    this.scrollX = Math.max(0, Math.min(maxScroll, this.scrollX));
  }

  /** Ensure a ms position is visible, scrolling if needed */
  ensureVisible(ms) {
    const x = this.msToX(ms);
    const margin = this._viewWidth * 0.15;
    if (x > this._viewWidth - margin) {
      this.scrollX = (ms * this.zoom) - this._viewWidth + margin;
      this.clampScroll();
    } else if (x < margin) {
      this.scrollX = (ms * this.zoom) - margin;
      this.clampScroll();
    }
  }
}

// ============ Layout constants ============

const HEADER_W = 80;
const TRACK_H = 28;
const CTRL_H = 16;
const CV_H = 20;
const RULER_H = 22;
const SECTION_BAND_H = 16; // head-rule section band (labeled segments), 0 when none
const MINIMAP_H = 18;
const VOICE_GAP = 6;
const STRUCT_LANE_H = 14; // height per nesting level in structure indicator lane
const BLOCK_RADIUS = 3;
const EDGE_HANDLE_W = 4; // edge handle hit zone width (px)

// ============ Timeline class ============

export class Timeline {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {Object} options
   * @param {Function} [options.onSelect] - callback(note, voiceIndex, blockIndex)
   * @param {Function} [options.onSeek] - callback(ms)
   * @param {Function} [options.onResize] - callback(voiceIdx, blockIdx, newStart, newEnd) — block edge drag
   */
  constructor(canvas, options = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.range = new TimelineRange(1000);
    this.onSelect = options.onSelect || null;
    this.onSeek = options.onSeek || null;
    this.onResize = options.onResize || null;
    this.onSelectGroup = options.onSelectGroup || null; // callback(groupIdx, group)
    this.onResizeGroup = options.onResizeGroup || null; // callback(groupIdx, group)

    // Data
    this.voices = [];
    this.silences = [];     // [{start, end}] — explicit silence/rest gaps
    this.polyGroups = [];   // [{start, end, voiceCount}] — polymetric groups from { , }
    // Head-rule sections ({name, startMs, endMs}) drawn as a labeled band along
    // the timeline INDEPENDENTLY of polymetry — a purely sequential grammar
    // (arabic: `S -> Sayr Rujoo Qarar`) has no `{ , }` groups, so the struct lane
    // stays empty; this band still shows its named segments. Set via setSections().
    this._sections = [];
    this._controlTable = null; // CT0 → [{key, value}]
    this._maxPolyDepth = 0;
    this.totalMs = 0;

    // State
    this._cursorMs = -1;
    this._selectedBlock = null;
    this._hoveredBlock = null;
    this._hoveredEdge = null;  // { voiceIdx, blockIdx, side: 'left'|'right' }
    this._selectedGroup = -1;  // polyGroup index
    this._hoveredGroup = -1;
    this._hoveredGroupEdge = null; // { gi, side: 'left'|'right', segment? }
    this._selectedSegment = null;
    this._hoveredSegment = null;
    this._isResizingGroup = false;
    this._resizeGroupIdx = -1;
    this._resizeGroupSide = null;
    this._resizeGroupOrigStart = 0;
    this._resizeGroupOrigEnd = 0;
    this._isDragging = false;
    this._isDraggingMinimap = false; // dragging the minimap viewport to scroll
    this._dragStartX = 0;
    this._dragStartScroll = 0;
    this._isResizing = false;  // edge drag in progress
    this._resizeEdge = null;   // { voiceIdx, blockIdx, side }
    this._resizeOrigMs = 0;    // original ms value of the edge being dragged
    this._autoFollow = true;
    this._animFrame = 0;

    // DPI
    this._dpr = window.devicePixelRatio || 1;

    this._bindEvents();
  }

  // ============ Data loading ============

  load(tokens, { cvTable = null, controlTable = null, source = '' } = {}) {
    if (!tokens || tokens.length === 0) {
      this.voices = [];
      this.silences = [];
      this.totalMs = 0;
      this.render();
      return;
    }

    const cvNames = new Set();
    if (cvTable) for (const cv of cvTable) cvNames.add(cv.name);

    const notes = [];
    const controls = [];
    const cvTokens = [];
    const silences = [];
    const polyGroups = []; // [{start, end, voiceCount}] from structural markers

    // Parse structural markers { , } to detect polymetric groups
    let polyStack = []; // stack of {startMs, voiceIdx (count of , seen)}
    let openCounter = 0;
    for (let ti = 0; ti < tokens.length; ti++) {
      const t = tokens[ti];
      if (t.token === '{') {
        polyStack.push({ start: t.start, voices: 1, openOrder: openCounter++ });
      } else if (t.token === ',' && polyStack.length > 0) {
        polyStack[polyStack.length - 1].voices++;
      } else if (t.token === '}' && polyStack.length > 0) {
        const group = polyStack.pop();
        polyGroups.push({ start: group.start, end: t.end, voiceCount: group.voices, openOrder: group.openOrder });
      } else if (t.token.startsWith('_') && t.token !== '_') {
        t._srcIdx = ti;
        controls.push(t);
      } else if (cvNames.has(t.token)) {
        cvTokens.push(t);
      } else if (t.token === '-' && t.end > t.start) {
        silences.push(t);
      } else if (t.token !== '_' && t.token !== '-' && t.end > t.start
                 && t.token !== '{' && t.token !== '}' && t.token !== ',') {
        t._srcIdx = ti; // index in original tokens array for writeback
        notes.push(t);
      }
    }

    // Reduce, not spread: a large derivation would overflow Math.max's arg limit.
    this.totalMs = tokens.reduce((m, t) => (t.end > m ? t.end : m), 1);
    this.range.totalMs = this.totalMs;
    this.silences = silences;
    this._controlTable = controlTable;

    // Tag each note with the polyGroup indices it belongs to (by token stream position)
    // Track nesting depth for structure lane layout
    const polyGroupRanges = []; // [{srcStart, srcEnd, voices, depth}]
    {
      let pStack = [];
      for (let ti = 0; ti < tokens.length; ti++) {
        const t = tokens[ti];
        if (t.token === '{') pStack.push({ srcStart: ti, voices: 1, depth: pStack.length });
        else if (t.token === ',' && pStack.length > 0) pStack[pStack.length - 1].voices++;
        else if (t.token === '}' && pStack.length > 0) {
          const pg = pStack.pop();
          // Push in same order as polyGroups (close-order), alignment by index
          polyGroupRanges.push({ srcStart: pg.srcStart, srcEnd: ti, voices: pg.voices, depth: pg.depth });
        }
      }
    }

    // Group notes into non-overlapping voices
    const voiceNotes = [];
    for (const n of notes) {
      let placed = false;
      for (const v of voiceNotes) {
        const last = v[v.length - 1];
        if (n.start >= last.end - 1) {
          v.push(n);
          placed = true;
          break;
        }
      }
      if (!placed) voiceNotes.push([n]);
    }

    // Assign controls to voices using stream order:
    // each control belongs to the voice containing the next note in the original token stream.
    // Build a map: srcIdx → voiceIdx for each note
    const voiceControls = voiceNotes.map(() => []);
    const noteToVoice = new Map();
    for (let vi = 0; vi < voiceNotes.length; vi++) {
      for (const n of voiceNotes[vi]) {
        if (n._srcIdx != null) noteToVoice.set(n._srcIdx, vi);
      }
    }
    // For each control, find the next note after it in the stream
    for (const ctrl of controls) {
      if (ctrl._srcIdx == null) {
        // No index — fall back to first voice
        voiceControls[0].push(ctrl);
        continue;
      }
      let targetVoice = 0;
      // Scan forward from control's position to find the next note
      for (let si = ctrl._srcIdx + 1; si < tokens.length && si < ctrl._srcIdx + 20; si++) {
        if (noteToVoice.has(si)) {
          targetVoice = noteToVoice.get(si);
          break;
        }
      }
      voiceControls[targetVoice].push(ctrl);
    }

    // Assign CV tokens to closest voice
    const cvByVoice = voiceNotes.map(() => []);
    for (const cvt of cvTokens) {
      let bestVoice = 0, bestDist = Infinity;
      for (let vi = 0; vi < voiceNotes.length; vi++) {
        for (const n of voiceNotes[vi]) {
          const dist = Math.abs(n.start - cvt.start);
          if (dist < bestDist) { bestDist = dist; bestVoice = vi; }
        }
      }
      cvByVoice[bestVoice].push(cvt);
    }

    this.voices = voiceNotes.map((notes, i) => ({
      label: `voice ${i + 1}`,
      notes,
      controls: voiceControls[i],
      cv: cvByVoice[i],
      color: VOICE_COLORS[i % VOICE_COLORS.length],
    }));

    // Resolve polyGroup → voiceIndices using token stream positions
    this.polyGroups = polyGroups.map((pg, pgi) => {
      const pgr = polyGroupRanges[pgi];
      if (!pgr) return pg;
      // Find which voices have notes whose _srcIdx falls within this group's token range
      const voiceIndices = new Set();
      for (let vi = 0; vi < this.voices.length; vi++) {
        for (const n of this.voices[vi].notes) {
          if (n._srcIdx != null && n._srcIdx > pgr.srcStart && n._srcIdx < pgr.srcEnd) {
            voiceIndices.add(vi);
          }
        }
      }
      // Also tag each note with its polyGroup index for constraint solver scoping
      for (const vi of voiceIndices) {
        for (const n of this.voices[vi].notes) {
          if (n._srcIdx != null && n._srcIdx > pgr.srcStart && n._srcIdx < pgr.srcEnd) {
            // Store the innermost (deepest) group for each note
            if (n._polyGroupIdx == null || pgr.depth > (polyGroupRanges[n._polyGroupIdx]?.depth ?? -1)) {
              n._polyGroupIdx = pgi;
            }
          }
        }
      }
      return { ...pg, voiceIndices: [...voiceIndices], depth: pgr.depth };
    });

    // Extract structural names from BPscript source
    this._structNames = { groupLabels: {}, ruleElements: [] };
    if (source) {
      // 1. Find explicit labels: "name:{" → label for each { by openOrder
      const groupLabels = {};
      let braceCount = 0;
      for (let i = 0; i < source.length; i++) {
        if (source[i] === '/' && source[i + 1] === '/') {
          i = source.indexOf('\n', i); if (i < 0) break; continue;
        }
        if (source[i] === '{') {
          const before = source.substring(Math.max(0, i - 40), i);
          const match = before.match(/(\w+)\s*:\s*$/);
          if (match) groupLabels[braceCount] = match[1];
          braceCount++;
        }
      }
      for (const pg of this.polyGroups) {
        if (pg.openOrder != null && groupLabels[pg.openOrder]) {
          pg.label = groupLabels[pg.openOrder];
        }
      }

      // 2. Parse rule RHS elements to name segments and groups at depth 0.
      // Find the top-level rule (first rule whose RHS contains {})
      // Format: "LHS -> elem1 {voices} elem2 {voices} elem3"
      const ruleElements = []; // [{type:'sym'|'group', name, openOrder}] in order
      const lines = source.split('\n');
      for (const line of lines) {
        const ruleMatch = line.match(/^\s*(\w+)\s*->\s*(.+)$/);
        if (!ruleMatch) continue;
        const rhs = ruleMatch[2].trim();
        // Check if this rule contains top-level braces
        let hasTopBrace = false;
        let d = 0;
        for (const ch of rhs) {
          if (ch === '{') { if (d === 0) hasTopBrace = true; d++; }
          else if (ch === '}') d--;
        }
        if (!hasTopBrace) continue;

        // Parse elements: symbols and {…} groups in order
        let oi = 0, pos = 0;
        while (pos < rhs.length) {
          // Skip whitespace
          while (pos < rhs.length && rhs[pos] === ' ') pos++;
          if (pos >= rhs.length) break;

          if (rhs[pos] === '{') {
            // Find matching }
            let depth = 0, start = pos;
            while (pos < rhs.length) {
              if (rhs[pos] === '{') depth++;
              else if (rhs[pos] === '}') { depth--; if (depth === 0) { pos++; break; } }
              pos++;
            }
            // Skip qualifiers after }
            while (pos < rhs.length && (rhs[pos] === '[' || rhs[pos] === '(')) {
              const close = rhs[pos] === '[' ? ']' : ')';
              while (pos < rhs.length && rhs[pos] !== close) pos++;
              if (pos < rhs.length) pos++;
            }
            ruleElements.push({ type: 'group', name: null, openOrder: oi++ });
          } else if (rhs[pos] === '/' && rhs[pos + 1] === '/') {
            break; // comment
          } else {
            // Symbol name (possibly with label: prefix before next {)
            let name = '';
            while (pos < rhs.length && rhs[pos] !== ' ' && rhs[pos] !== '{') {
              name += rhs[pos]; pos++;
            }
            // Check if it's a label for the next group (name:)
            if (name.endsWith(':') && pos < rhs.length && rhs[pos] === '{') {
              // label for next group — skip, already handled above
              continue;
            }
            if (name) ruleElements.push({ type: 'sym', name });
          }
        }
        if (ruleElements.length > 0) break; // use first rule with braces
      }
      this._structNames.ruleElements = ruleElements;
    }

    // Build structSegments: siblings at each depth level.
    // At depth 0: [gap, group, gap, group, gap, ...] spanning the full timeline.
    // Inside each group at depth d: [gap, subgroup, gap, ...] spanning the group.
    this.structSegments = this._buildStructSegments(polyGroupRanges, tokens);

    // Calculate max nesting depth for structure lane height
    this._maxPolyDepth = Math.max(
      this.polyGroups.reduce((m, g) => Math.max(m, (g.depth || 0) + 1), 0),
      this.structSegments.length > 0 ? 1 : 0
    );

    this._selectedBlock = null;
    this._hoveredBlock = null;
    this._hoveredEdge = null;
    this.resize();
    this.range.fitToView();
    this.render();
  }

  // ============ Sizing ============

  resize() {
    const parent = this.canvas.parentElement;
    const rect = parent?.getBoundingClientRect() || { width: 800, height: 300 };
    // Account for parent padding (clientWidth excludes scrollbar, padding is subtracted)
    const style = parent ? getComputedStyle(parent) : {};
    const padL = parseFloat(style.paddingLeft) || 0;
    const padR = parseFloat(style.paddingRight) || 0;
    const w = Math.floor((parent?.clientWidth || rect.width) - padL - padR);
    const h = Math.max(80, this._calcHeight());
    this._dpr = window.devicePixelRatio || 1;
    this.canvas.width = w * this._dpr;
    this.canvas.height = h * this._dpr;
    this.canvas.style.width = w + 'px';
    this.canvas.style.height = h + 'px';
    this.ctx.setTransform(this._dpr, 0, 0, this._dpr, 0, 0);
    this.range.setViewWidth(w - HEADER_W);
  }

  _calcHeight() {
    let h = this._bodyTop() + this._structLaneHeight() + MINIMAP_H;
    for (const v of this.voices) {
      h += TRACK_H + VOICE_GAP;
      if (v.controls.length > 0) h += CTRL_H;
      if (v.cv.length > 0) h += CV_H;
    }
    return Math.max(60, h + 8);
  }

  // ============ Rendering ============

  render() {
    const { ctx, canvas } = this;
    const w = canvas.width / this._dpr;
    const h = canvas.height / this._dpr;

    ctx.fillStyle = COLORS.bg;
    ctx.fillRect(0, 0, w, h);

    if (this.voices.length === 0) {
      ctx.fillStyle = COLORS.textDim;
      ctx.font = '12px Consolas, monospace';
      ctx.textAlign = 'center';
      ctx.fillText('(no tokens)', w / 2, h / 2);
      return;
    }

    // Ruler
    this._drawRuler(ctx, w);

    // Head-rule section band (below the ruler, above the struct lane). Drawn for
    // a purely sequential grammar that has no polymetric struct lane.
    const bandH = this._sectionBandHeight();
    if (bandH > 0) {
      this._drawSectionBand(ctx, w, RULER_H, bandH);
    }

    // Structure lane (above voices)
    const structH = this._structLaneHeight();
    if (structH > 0) {
      this._drawStructLane(ctx, w, RULER_H + bandH, structH);
    }

    // Voices
    let y = this._bodyTop() + structH;
    for (let vi = 0; vi < this.voices.length; vi++) {
      y = this._drawVoice(ctx, this.voices[vi], vi, y, w);
      y += VOICE_GAP;
    }

    // Light tint on voices in polymetric groups
    this._drawPolyGroups(ctx, w);

    // Minimap
    this._drawMinimap(ctx, w, h);

    // Playback cursor (full height, with glow)
    if (this._cursorMs >= 0) {
      const cx = HEADER_W + this.range.msToX(this._cursorMs);
      if (cx >= HEADER_W && cx <= w) {
        // Glow
        ctx.fillStyle = COLORS.cursorGlow;
        ctx.fillRect(cx - 3, RULER_H, 6, h - RULER_H - MINIMAP_H);
        // Line
        ctx.strokeStyle = COLORS.cursor;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(cx, RULER_H);
        ctx.lineTo(cx, h - MINIMAP_H);
        ctx.stroke();
        // Triangle on ruler
        ctx.fillStyle = COLORS.cursor;
        ctx.beginPath();
        ctx.moveTo(cx - 4, RULER_H);
        ctx.lineTo(cx + 4, RULER_H);
        ctx.lineTo(cx, RULER_H - 5);
        ctx.closePath();
        ctx.fill();
      }
    }
  }

  _drawRuler(ctx, w) {
    const range = this.range;
    ctx.fillStyle = COLORS.ruler;
    ctx.fillRect(HEADER_W, 0, w - HEADER_W, RULER_H);

    ctx.fillStyle = COLORS.headerBg;
    ctx.fillRect(0, 0, HEADER_W, RULER_H);
    ctx.strokeStyle = COLORS.headerBorder;
    ctx.strokeRect(0, 0, HEADER_W, RULER_H);

    // Adaptive tick interval
    const minTickPx = 60;
    const intervals = [10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 30000, 60000];
    let tickMs = intervals.find(i => i * range.zoom >= minTickPx) || 60000;

    // Sub-ticks (smaller intermediate ticks)
    const subDiv = tickMs >= 1000 ? 4 : tickMs >= 200 ? 5 : 2;
    const subTickMs = tickMs / subDiv;

    const startMs = Math.floor(range.scrollMs / subTickMs) * subTickMs;
    const endMs = range.scrollMs + range.visibleMs;

    ctx.font = '10px Consolas, monospace';
    ctx.textAlign = 'left';

    for (let ms = startMs; ms <= endMs; ms += subTickMs) {
      const x = HEADER_W + range.msToX(ms);
      if (x < HEADER_W) continue;
      if (x > w) break;

      const isMajor = Math.abs(ms % tickMs) < 0.5;

      // Tick line
      ctx.strokeStyle = isMajor ? COLORS.rulerText : COLORS.rulerLine;
      ctx.lineWidth = isMajor ? 1 : 0.5;
      ctx.beginPath();
      ctx.moveTo(x, RULER_H - (isMajor ? 8 : 4));
      ctx.lineTo(x, RULER_H);
      ctx.stroke();

      // Vertical guide line through tracks
      if (isMajor) {
        ctx.strokeStyle = 'rgba(255,255,255,0.04)';
        ctx.lineWidth = 0.5;
        ctx.beginPath();
        ctx.moveTo(x, RULER_H);
        ctx.lineTo(x, this._calcHeight() - MINIMAP_H);
        ctx.stroke();
      }

      // Label (major ticks only)
      if (isMajor) {
        ctx.fillStyle = COLORS.rulerText;
        const label = ms >= 1000 ? (ms / 1000).toFixed(ms % 1000 === 0 ? 0 : 1) + 's' : ms + 'ms';
        ctx.fillText(label, x + 3, RULER_H - 4);
      }
    }

    // Bottom border
    ctx.strokeStyle = COLORS.trackBorder;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, RULER_H);
    ctx.lineTo(w, RULER_H);
    ctx.stroke();
  }

  _drawVoice(ctx, voice, voiceIdx, y, w) {
    const range = this.range;

    // Track header
    ctx.fillStyle = COLORS.headerBg;
    ctx.fillRect(0, y, HEADER_W, TRACK_H);
    ctx.strokeStyle = COLORS.headerBorder;
    ctx.strokeRect(0, y, HEADER_W, TRACK_H);

    // Color dot
    ctx.fillStyle = voice.color;
    ctx.beginPath();
    ctx.arc(8, y + TRACK_H / 2, 4, 0, Math.PI * 2);
    ctx.fill();

    // Label
    ctx.fillStyle = COLORS.text;
    ctx.font = '10px Consolas, monospace';
    ctx.textAlign = 'left';
    ctx.fillText(voice.label, 16, y + TRACK_H / 2 + 4);

    // Note count
    ctx.fillStyle = COLORS.textDim;
    ctx.font = '9px Consolas, monospace';
    ctx.textAlign = 'right';
    ctx.fillText(`${voice.notes.length}`, HEADER_W - 6, y + TRACK_H / 2 + 4);

    // Track background
    ctx.fillStyle = COLORS.trackBg;
    ctx.fillRect(HEADER_W, y, w - HEADER_W, TRACK_H);

    // Draw silences in this voice's time range
    for (const s of this.silences) {
      const sx1 = HEADER_W + range.msToX(s.start);
      const sx2 = HEADER_W + range.msToX(s.end);
      if (sx2 < HEADER_W || sx1 > w) continue;
      const csx1 = Math.max(HEADER_W, sx1);
      const csx2 = Math.min(w, sx2);
      if (csx2 - csx1 < 1) continue;
      ctx.fillStyle = COLORS.silence;
      ctx.fillRect(csx1, y, csx2 - csx1, TRACK_H);
      // Dash pattern for silence
      if (csx2 - csx1 > 12) {
        ctx.fillStyle = COLORS.textDim;
        ctx.font = '9px Consolas, monospace';
        ctx.textAlign = 'center';
        ctx.fillText('–', (csx1 + csx2) / 2, y + TRACK_H / 2 + 3);
      }
    }

    // Note blocks
    for (let bi = 0; bi < voice.notes.length; bi++) {
      const n = voice.notes[bi];
      const x1 = HEADER_W + range.msToX(n.start);
      const x2 = HEADER_W + range.msToX(n.end);

      if (x2 < HEADER_W || x1 > w) continue;
      const cx1 = Math.max(HEADER_W, x1);
      const cx2 = Math.min(w, x2);
      const cw = cx2 - cx1;
      if (cw < 0.5) continue;

      // Gaps between notes
      if (bi > 0) {
        const prev = voice.notes[bi - 1];
        if (n.start > prev.end + 1) {
          const gx1 = Math.max(HEADER_W, HEADER_W + range.msToX(prev.end));
          const gx2 = Math.min(w, x1);
          if (gx2 > gx1) {
            ctx.fillStyle = COLORS.gap;
            ctx.fillRect(gx1, y, gx2 - gx1, TRACK_H);
          }
        }
      }

      const isSelected = this._selectedBlock?.voiceIdx === voiceIdx && this._selectedBlock?.blockIdx === bi;
      const isHovered = this._hoveredBlock?.voiceIdx === voiceIdx && this._hoveredBlock?.blockIdx === bi;

      // Block fill
      const alpha = isSelected ? 1.0 : isHovered ? 0.9 : 0.75;
      ctx.globalAlpha = alpha;
      ctx.fillStyle = bi % 2 === 0 ? voice.color : this._darken(voice.color, 0.15);
      this._roundRect(ctx, cx1, y + 1, cw, TRACK_H - 2, Math.min(BLOCK_RADIUS, cw / 2));
      ctx.fill();
      ctx.globalAlpha = 1;

      // Selection border
      if (isSelected) {
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 1.5;
        this._roundRect(ctx, cx1, y + 1, cw, TRACK_H - 2, Math.min(BLOCK_RADIUS, cw / 2));
        ctx.stroke();
      }

      // Label
      if (cw > 20) {
        ctx.fillStyle = '#fff';
        ctx.font = '11px Consolas, monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const maxChars = Math.floor((cw - 8) / 7);
        const label = n.token.length > maxChars ? n.token.substring(0, maxChars) : n.token;
        ctx.fillText(label, cx1 + cw / 2, y + TRACK_H / 2);
        ctx.textBaseline = 'alphabetic';
      } else if (cw > 4) {
        // Thin block — just a dot
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.arc(cx1 + cw / 2, y + TRACK_H / 2, 1.5, 0, Math.PI * 2);
        ctx.fill();
      }

      // Edge handles (visible on hover for future drag — Phase 3.4)
      if (isHovered && cw > 10) {
        ctx.fillStyle = COLORS.edgeHandle;
        ctx.globalAlpha = 0.5;
        // Left handle
        this._roundRect(ctx, cx1, y + 4, 3, TRACK_H - 8, 1.5);
        ctx.fill();
        // Right handle
        this._roundRect(ctx, cx2 - 3, y + 4, 3, TRACK_H - 8, 1.5);
        ctx.fill();
        ctx.globalAlpha = 1;
      }
    }

    y += TRACK_H;

    // Control lane
    if (voice.controls.length > 0) {
      ctx.fillStyle = 'rgba(13, 27, 42, 0.5)';
      ctx.fillRect(HEADER_W, y, w - HEADER_W, CTRL_H);

      ctx.font = '9px Consolas, monospace';
      ctx.textAlign = 'left';

      for (const c of voice.controls) {
        const label = this._resolveControlLabel(c.token);
        if (label === null) continue; // skip scope-end markers
        const x = HEADER_W + range.msToX(c.start);
        if (x < HEADER_W || x > w) continue;
        // Vertical line
        ctx.strokeStyle = COLORS.controlMark;
        ctx.lineWidth = 0.5;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x, y + CTRL_H);
        ctx.stroke();
        // Label
        ctx.fillStyle = COLORS.controlMark;
        ctx.fillText(label, x + 2, y + CTRL_H - 3);
      }
      y += CTRL_H;
    }

    // CV tracks
    if (voice.cv.length > 0) {
      ctx.fillStyle = COLORS.headerBg;
      ctx.fillRect(0, y, HEADER_W, CV_H);
      ctx.strokeStyle = COLORS.headerBorder;
      ctx.strokeRect(0, y, HEADER_W, CV_H);
      ctx.fillStyle = COLORS.cvMark;
      ctx.font = '9px Consolas, monospace';
      ctx.textAlign = 'left';
      ctx.beginPath();
      ctx.arc(8, y + CV_H / 2, 3, 0, Math.PI * 2);
      ctx.fill();
      const cvLabel = voice.cv[0]?.token || 'CV';
      ctx.fillText(cvLabel, 16, y + CV_H / 2 + 3);

      ctx.fillStyle = 'rgba(233, 168, 69, 0.08)';
      ctx.fillRect(HEADER_W, y, w - HEADER_W, CV_H);

      for (const cvt of voice.cv) {
        const x = HEADER_W + range.msToX(cvt.start);
        if (x < HEADER_W || x > w) continue;
        ctx.strokeStyle = COLORS.cvMark;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x, y + 2);
        ctx.lineTo(x, y + CV_H - 2);
        ctx.stroke();
        // Diamond marker
        ctx.fillStyle = COLORS.cvMark;
        ctx.beginPath();
        ctx.moveTo(x, y + 3);
        ctx.lineTo(x + 3, y + CV_H / 2);
        ctx.lineTo(x, y + CV_H - 3);
        ctx.lineTo(x - 3, y + CV_H / 2);
        ctx.closePath();
        ctx.fill();
      }
      y += CV_H;
    }

    return y;
  }

  /**
   * Compute Y position of each voice track (top edge).
   * Returns array of {top, bottom} for each voice index.
   */
  /**
   * Build structural segments: at each depth, identify gaps between polyGroups.
   * These gaps represent non-polymetric siblings (e.g., Intro, Coda).
   * Returns array of {start, end, depth, type:'gap', label, voiceIndices, srcStart, srcEnd}.
   */
  _buildStructSegments(polyGroupRanges, tokens) {
    const segments = [];
    if (this.polyGroups.length === 0) return segments;

    // Group polyGroups by depth
    const byDepth = {};
    for (let gi = 0; gi < this.polyGroups.length; gi++) {
      const d = this.polyGroups[gi].depth || 0;
      if (!byDepth[d]) byDepth[d] = [];
      byDepth[d].push(gi);
    }

    for (const [depthStr, groupIndices] of Object.entries(byDepth)) {
      const depth = parseInt(depthStr);

      // Determine the parent span for this depth
      let parentStart, parentEnd, parentSrcStart, parentSrcEnd;
      if (depth === 0) {
        parentStart = 0;
        parentEnd = this.totalMs;
        parentSrcStart = 0;
        parentSrcEnd = tokens.length - 1;
      } else {
        // Find the enclosing polyGroup at depth-1
        // For each group at this depth, its parent is at depth-1 containing it
        continue; // For now, only handle depth 0 — extend later
      }

      // Sort groups at this depth by start time
      const sorted = groupIndices
        .map(gi => ({ gi, g: this.polyGroups[gi] }))
        .sort((a, b) => a.g.start - b.g.start);

      // Build name list for gaps from parsed rule elements
      const gapNames = (this._structNames?.ruleElements || [])
        .filter(e => e.type === 'sym')
        .map(e => e.name);
      let gapIdx = 0;

      // Build gaps between groups
      let cursor = parentStart;
      for (const { gi, g } of sorted) {
        if (g.start - cursor > 5) { // meaningful gap (>5ms)
          const vis = new Set();
          for (let vi = 0; vi < this.voices.length; vi++) {
            if (this.voices[vi].notes.some(n => n.start >= cursor && n.end <= g.start + 1)) {
              vis.add(vi);
            }
          }

          segments.push({
            start: cursor,
            end: g.start,
            depth,
            type: 'gap',
            label: gapNames[gapIdx] || '...',
            voiceIndices: [...vis],
          });
          gapIdx++;
        }
        cursor = g.end;
      }
      // Trailing gap after last group
      if (parentEnd - cursor > 5) {
        const vis = new Set();
        let hasNotes = false;
        for (let vi = 0; vi < this.voices.length; vi++) {
          if (this.voices[vi].notes.some(n => n.start >= cursor && n.end <= parentEnd + 1)) {
            vis.add(vi);
            hasNotes = true;
          }
        }
        if (hasNotes) {
          segments.push({
            start: cursor,
            end: parentEnd,
            depth,
            type: 'gap',
            label: gapNames[gapIdx] || '...',
            voiceIndices: [...vis],
          });
        }
      }
    }
    return segments;
  }

  _structLaneHeight() {
    return (this._maxPolyDepth || 0) * STRUCT_LANE_H;
  }

  // Height reserved for the head-rule section band (0 when no sections are set).
  _sectionBandHeight() {
    return this._sections && this._sections.length > 0 ? SECTION_BAND_H : 0;
  }

  // Top of the BODY (struct lane + voices) — below the ruler and the optional
  // section band. The band sits between the ruler and the struct lane.
  _bodyTop() {
    return RULER_H + this._sectionBandHeight();
  }

  _voiceYPositions() {
    const positions = [];
    let y = this._bodyTop() + this._structLaneHeight();
    for (const v of this.voices) {
      const top = y;
      y += TRACK_H;
      if (v.controls.length > 0) y += CTRL_H;
      if (v.cv.length > 0) y += CV_H;
      positions.push({ top, bottom: y });
      y += VOICE_GAP;
    }
    return positions;
  }

  /**
   * Draw structure indicators above voices: one line + chevron per polyGroup,
   * stacked by nesting depth (depth 0 = closest to voices, higher = above).
   */
  /**
   * Build a unified list of all structure items (polyGroups + gap segments)
   * for rendering and hit testing in the struct lane.
   * Each item: {start, end, depth, type: 'group'|'gap', label, itemIdx, groupIdx?}
   */
  _buildStructItems() {
    const items = [];

    // Add polyGroups
    for (let gi = 0; gi < this.polyGroups.length; gi++) {
      const g = this.polyGroups[gi];
      items.push({
        start: g.start, end: g.end,
        depth: g.depth || 0,
        type: 'group',
        label: g.label || `{${g.voiceCount}}`,
        groupIdx: gi,
      });
    }

    // Add gap segments
    for (const seg of this.structSegments) {
      items.push({
        start: seg.start, end: seg.end,
        depth: seg.depth,
        type: 'gap',
        label: seg.label,
        segment: seg,
      });
    }

    return items;
  }

  /**
   * Draw the head-rule sections as a labeled band along the timeline. Each
   * section is a colored segment spanning [startMs, endMs] with its name
   * centered; thin separators mark the boundaries. Independent of polymetry, so
   * a sequential grammar (no `{ , }`) still shows its named structure.
   */
  _drawSectionBand(ctx, w, top, bandH) {
    const range = this.range;
    const sectionColors = [
      'rgba(91, 141, 217, 0.30)',
      'rgba(61, 201, 138, 0.30)',
      'rgba(212, 153, 74, 0.30)',
      'rgba(176, 122, 204, 0.30)',
      'rgba(224, 85, 114, 0.30)',
      'rgba(69, 183, 209, 0.30)',
    ];

    // Band background + header cell.
    ctx.fillStyle = COLORS.headerBg;
    ctx.fillRect(0, top, HEADER_W, bandH);
    ctx.fillStyle = COLORS.textDim;
    ctx.font = '9px Consolas, monospace';
    ctx.textAlign = 'left';
    ctx.fillText('sect', 4, top + bandH / 2 + 3);

    for (let i = 0; i < this._sections.length; i++) {
      const s = this._sections[i];
      const x1 = HEADER_W + range.msToX(s.startMs);
      const x2 = HEADER_W + range.msToX(s.endMs);
      const segW = x2 - x1;
      if (x2 < HEADER_W || x1 > w) continue;
      const color = sectionColors[i % sectionColors.length];
      ctx.fillStyle = color;
      ctx.fillRect(Math.max(HEADER_W, x1), top + 1, segW, bandH - 2);
      // Boundary separator.
      ctx.strokeStyle = 'rgba(255,255,255,0.18)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x1, top);
      ctx.lineTo(x1, top + bandH);
      ctx.stroke();
      // Centered label (only when the segment is wide enough to read).
      if (segW > 26 && s.name) {
        ctx.fillStyle = COLORS.text;
        ctx.font = '9px Consolas, monospace';
        ctx.textAlign = 'center';
        const cx = Math.max(HEADER_W, x1) + Math.min(segW, x2 - Math.max(HEADER_W, x1)) / 2;
        ctx.fillText(s.name, cx, top + bandH / 2 + 3);
      }
    }
    ctx.textAlign = 'left';
  }

  _drawStructLane(ctx, w, laneTop, laneH) {
    const items = this._buildStructItems();
    if (items.length === 0) return;
    const range = this.range;

    const structColors = [
      'rgba(0, 255, 136, 0.7)',
      'rgba(74, 144, 217, 0.7)',
      'rgba(233, 168, 69, 0.7)',
      'rgba(199, 125, 186, 0.7)',
      'rgba(233, 69, 96, 0.7)',
      'rgba(69, 183, 209, 0.7)',
    ];

    // Background for structure lane
    ctx.fillStyle = 'rgba(13, 27, 42, 0.6)';
    ctx.fillRect(HEADER_W, laneTop, w - HEADER_W, laneH);
    ctx.strokeStyle = 'rgba(255,255,255,0.06)';
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.moveTo(HEADER_W, laneTop + laneH);
    ctx.lineTo(w, laneTop + laneH);
    ctx.stroke();

    // Header label
    ctx.fillStyle = COLORS.textDim;
    ctx.font = '8px Consolas, monospace';
    ctx.textAlign = 'left';
    ctx.fillText('struct', 4, laneTop + laneH / 2 + 3);

    // Sort items: render in a stable order by depth then start
    items.sort((a, b) => a.depth - b.depth || a.start - b.start);

    // Pre-compute fixed extremities per depth
    const extremes = {};
    for (const it of items) {
      const d = it.depth;
      if (!extremes[d]) extremes[d] = { minStart: it.start, maxEnd: it.end };
      extremes[d].minStart = Math.min(extremes[d].minStart, it.start);
      extremes[d].maxEnd = Math.max(extremes[d].maxEnd, it.end);
    }

    // Assign a stable color index per item at each depth
    const colorCounters = {};

    for (const item of items) {
      const depth = item.depth;
      if (!(depth in colorCounters)) colorCounters[depth] = 0;
      const ci = colorCounters[depth]++;

      const rowY = laneTop + laneH - (depth + 1) * STRUCT_LANE_H + STRUCT_LANE_H / 2;

      const x1 = HEADER_W + range.msToX(item.start);
      const x2 = HEADER_W + range.msToX(item.end);
      if (x2 < HEADER_W || x1 > w) continue;

      const cx1 = Math.max(HEADER_W, x1);
      const cx2 = Math.min(w, x2);
      if (cx2 - cx1 < 4) continue;

      // Selection/hover state — use groupIdx for groups, segment ref for gaps
      const isSelectedGroup = item.type === 'group' && item.groupIdx === this._selectedGroup;
      const isHoveredGroup = item.type === 'group' && item.groupIdx === this._hoveredGroup;
      const isSelectedSeg = item.type === 'gap' && this._selectedSegment === item.segment;
      const isHoveredSeg = item.type === 'gap' && this._hoveredSegment === item.segment;
      const isSelected = isSelectedGroup || isSelectedSeg;
      const isHovered = isHoveredGroup || isHoveredSeg;

      const alpha = isSelected ? 1.0 : isHovered ? 0.85 : 0.7;
      const color = structColors[ci % structColors.length].replace(/[\d.]+\)$/, alpha + ')');
      const lineW = isSelected ? 2.5 : isHovered ? 2 : 1.5;

      // Horizontal line
      ctx.strokeStyle = color;
      ctx.lineWidth = lineW;
      ctx.beginPath();
      ctx.moveTo(cx1, rowY);
      ctx.lineTo(cx2, rowY);
      ctx.stroke();

      // Edge handles: chevron ▼ for internal edges, bar | for fixed extremities
      const chevW = 5;
      const chevH = 5;
      const ext = extremes[depth];
      const isLeftFixed = Math.abs(item.start - ext.minStart) < 2;
      const isRightFixed = Math.abs(item.end - ext.maxEnd) < 2;
      const hovEdge = this._hoveredGroupEdge;
      const hovGi = item.type === 'group' ? item.groupIdx : -1;
      const isLeftH = hovEdge && ((hovEdge.gi === hovGi && hovGi >= 0) || (hovEdge.segment === item.segment)) && hovEdge.side === 'left';
      const isRightH = hovEdge && ((hovEdge.gi === hovGi && hovGi >= 0) || (hovEdge.segment === item.segment)) && hovEdge.side === 'right';

      if (x1 >= HEADER_W) {
        if (isLeftFixed) {
          // Fixed bar — not draggable
          ctx.strokeStyle = structColors[ci % structColors.length].replace(/[\d.]+\)$/, '0.4)');
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(cx1, rowY - chevH);
          ctx.lineTo(cx1, rowY + chevH);
          ctx.stroke();
        } else {
          // Draggable chevron ▼
          ctx.fillStyle = structColors[ci % structColors.length].replace(/[\d.]+\)$/, (isLeftH ? 1.0 : alpha) + ')');
          ctx.beginPath();
          ctx.moveTo(cx1 - chevW, rowY - chevH);
          ctx.lineTo(cx1 + chevW, rowY - chevH);
          ctx.lineTo(cx1, rowY + chevH);
          ctx.closePath();
          ctx.fill();
        }
      }
      if (x2 <= w) {
        if (isRightFixed) {
          // Fixed bar
          ctx.strokeStyle = structColors[ci % structColors.length].replace(/[\d.]+\)$/, '0.4)');
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(cx2, rowY - chevH);
          ctx.lineTo(cx2, rowY + chevH);
          ctx.stroke();
        } else {
          // Draggable chevron ▼
          ctx.fillStyle = structColors[ci % structColors.length].replace(/[\d.]+\)$/, (isRightH ? 1.0 : alpha) + ')');
          ctx.beginPath();
          ctx.moveTo(cx2 - chevW, rowY - chevH);
          ctx.lineTo(cx2 + chevW, rowY - chevH);
          ctx.lineTo(cx2, rowY + chevH);
          ctx.closePath();
          ctx.fill();
        }
      }

      // Label at center
      if (cx2 - cx1 > 25) {
        ctx.fillStyle = color;
        ctx.font = '8px Consolas, monospace';
        ctx.textAlign = 'center';
        ctx.fillText(item.label, (cx1 + cx2) / 2, rowY + 3);
      }
    }
  }

  /** Light background tint on voices belonging to polymetric groups */
  _drawPolyGroups(ctx, w) {
    if (this.polyGroups.length === 0) return;
    const range = this.range;
    const voiceYs = this._voiceYPositions();

    const polyTints = [
      'rgba(0, 255, 136, ##)',
      'rgba(74, 144, 217, ##)',
      'rgba(233, 168, 69, ##)',
      'rgba(199, 125, 186, ##)',
    ];

    for (let gi = 0; gi < this.polyGroups.length; gi++) {
      const g = this.polyGroups[gi];
      const x1 = HEADER_W + range.msToX(g.start);
      const x2 = HEADER_W + range.msToX(g.end);
      if (x2 < HEADER_W || x1 > w) continue;
      const cx1 = Math.max(HEADER_W, x1);
      const cx2 = Math.min(w, x2);
      const cw = cx2 - cx1;
      if (cw < 2) continue;

      // Scope to correct voices
      const vis = g.voiceIndices || [];
      let yTop = Infinity, yBottom = -Infinity;
      for (const vi of vis) {
        if (voiceYs[vi]) {
          yTop = Math.min(yTop, voiceYs[vi].top);
          yBottom = Math.max(yBottom, voiceYs[vi].bottom);
        }
      }
      if (yTop === Infinity) continue;

      const ci = gi % polyTints.length;
      const isSelected = gi === this._selectedGroup;
      const isHovered = gi === this._hoveredGroup;
      const alpha = isSelected ? 0.15 : isHovered ? 0.10 : 0.05;

      ctx.fillStyle = polyTints[ci].replace('##', alpha);
      ctx.fillRect(cx1, yTop, cw, yBottom - yTop);
    }
  }

  _drawMinimap(ctx, w, h) {
    const mmY = h - MINIMAP_H;
    const mmW = w - HEADER_W;

    // Background
    ctx.fillStyle = COLORS.minimapBg;
    ctx.fillRect(HEADER_W, mmY, mmW, MINIMAP_H);

    // Border
    ctx.strokeStyle = COLORS.trackBorder;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(HEADER_W, mmY);
    ctx.lineTo(w, mmY);
    ctx.stroke();

    // Header
    ctx.fillStyle = COLORS.headerBg;
    ctx.fillRect(0, mmY, HEADER_W, MINIMAP_H);

    if (this.totalMs === 0) return;

    // Draw all blocks as thin rectangles
    const scale = mmW / this.totalMs;
    for (const voice of this.voices) {
      for (const n of voice.notes) {
        const x = HEADER_W + n.start * scale;
        const bw = Math.max(1, (n.end - n.start) * scale);
        ctx.fillStyle = voice.color;
        ctx.globalAlpha = 0.5;
        ctx.fillRect(x, mmY + 2, bw, MINIMAP_H - 4);
      }
    }
    ctx.globalAlpha = 1;

    // Viewport indicator
    const vpX = HEADER_W + (this.range.scrollMs * scale);
    const vpW = Math.max(4, this.range.visibleMs * scale);
    ctx.fillStyle = COLORS.minimapView;
    ctx.fillRect(vpX, mmY, vpW, MINIMAP_H);
    ctx.strokeStyle = COLORS.cursor;
    ctx.lineWidth = 0.5;
    ctx.strokeRect(vpX, mmY, vpW, MINIMAP_H);

    // Cursor position in minimap
    if (this._cursorMs >= 0) {
      const cx = HEADER_W + this._cursorMs * scale;
      ctx.strokeStyle = COLORS.cursor;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(cx, mmY);
      ctx.lineTo(cx, mmY + MINIMAP_H);
      ctx.stroke();
    }
  }

  // ============ Playback cursor ============

  setCursor(ms) {
    this._cursorMs = ms;
    if (this._autoFollow) {
      this.range.ensureVisible(ms);
    }
    this._scheduleRender();
  }

  // Synchronous variant of setCursor: paints THIS frame instead of deferring to a
  // rAF. The caller is already inside its own coalescing rAF, so the extra
  // _scheduleRender() hop is a full frame of cursor lag behind the heard audio.
  // A render scheduled by a prior setCursor is cancelled so we don't double-paint.
  setCursorNow(ms) {
    this._cursorMs = ms;
    if (this._autoFollow) {
      this.range.ensureVisible(ms);
    }
    if (this._animFrame) {
      cancelAnimationFrame(this._animFrame);
      this._animFrame = 0;
    }
    this.render();
  }

  clearCursor() {
    this._cursorMs = -1;
    this._scheduleRender();
  }

  /**
   * Set the head-rule sections drawn as a labeled band along the timeline,
   * INDEPENDENTLY of the polymetric struct lane. `sections` is
   * `[{ name, startMs, endMs }]`; an empty/absent list hides the band. This is
   * what makes a purely sequential grammar (no `{ , }` groups) show its named
   * segments. The band reserves its own row, so re-layout + repaint after.
   */
  setSections(sections) {
    this._sections = Array.isArray(sections) ? sections : [];
    this.resize();
    this.render();
  }

  // Center the viewport on the timeline position under minimap x `mx` (canvas
  // coords). Used by both the minimap click and the minimap drag.
  _minimapScrollTo(mx, rectWidth) {
    const mmW = rectWidth - HEADER_W;
    if (mmW <= 0) return;
    const frac = Math.max(0, Math.min(1, (mx - HEADER_W) / mmW));
    const targetMs = frac * this.totalMs;
    this.range.scrollX = targetMs * this.range.zoom - this.range.viewWidth / 2;
    this.range.clampScroll();
  }

  // ============ Events ============

  _bindEvents() {
    // Wheel: Ctrl = zoom, shift = horizontal scroll, otherwise = scroll
    this.canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      const rect = this.canvas.getBoundingClientRect();
      const x = e.clientX - rect.left - HEADER_W;

      if (e.ctrlKey || e.metaKey) {
        const factor = e.deltaY < 0 ? 1.25 : 1 / 1.25;
        this.range.zoomAt(x, factor);
        this._autoFollow = false; // user took manual control
      } else {
        const delta = e.shiftKey ? e.deltaY : (e.deltaX || e.deltaY);
        this.range.scrollX += delta * 1.5;
        this.range.clampScroll();
        this._autoFollow = false;
      }
      this.render();
    }, { passive: false });

    // Mouse down
    this.canvas.addEventListener('mousedown', (e) => {
      const rect = this.canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      const h = rect.height;

      // Minimap: click centers the viewport on the click, and HOLDING starts a
      // drag that scrolls the timeline as the mouse moves (the draggable
      // viewport/scrollbar behavior). Centering on press makes the viewport jump
      // under the cursor so the subsequent drag feels like grabbing it.
      if (my >= h - MINIMAP_H && mx > HEADER_W) {
        this._isDraggingMinimap = true;
        this.canvas.style.cursor = 'grabbing';
        this._minimapScrollTo(mx, rect.width);
        this._autoFollow = false;
        this.render();
        return;
      }

      // Ruler click → seek
      if (my < RULER_H && mx > HEADER_W) {
        const ms = this.range.xToMs(mx - HEADER_W);
        if (this.onSeek) this.onSeek(Math.max(0, ms));
        return;
      }

      // Structure lane: edge drag on any struct item (group or gap segment)
      const structEdge = this._structEdgeHitTest(mx, my);
      if (structEdge) {
        this._initStructResize(structEdge);
        this.canvas.style.cursor = 'col-resize';
        e.preventDefault();
        this.render();
        return;
      }

      // Structure lane: click on body → select
      const structHit = this._structHitTest(mx, my);
      if (structHit) {
        this._selectedBlock = null;
        if (structHit.type === 'group') {
          this._selectedGroup = structHit.gi;
          this._selectedSegment = null;
          if (this.onSelectGroup) {
            this.onSelectGroup(structHit.gi, this.polyGroups[structHit.gi]);
          }
        } else {
          this._selectedSegment = structHit.segment;
          this._selectedGroup = -1;
        }
        this.render();
        return;
      }

      // Edge drag → resize block with constraint solver
      const edge = this._edgeHitTest(mx, my);
      if (edge) {
        this._isResizing = true;
        this._resizeEdge = edge;
        const voice = this.voices[edge.voiceIdx];
        const n = voice.notes[edge.blockIdx];
        this._resizeOrigMs = edge.side === 'left' ? n.start : n.end;
        this._resizeOrigDurations = voice.notes.map(note => note.end - note.start);
        this._resizeOrigPositions = voice.notes.map(note => ({ start: note.start, end: note.end }));
        this.canvas.style.cursor = 'col-resize';
        e.preventDefault();
        return;
      }

      // Block click → select
      const hit = this._hitTest(mx, my);
      if (hit) {
        this._selectedBlock = hit;
        this._selectedGroup = -1;
        if (this.onSelect) {
          const n = this.voices[hit.voiceIdx].notes[hit.blockIdx];
          this.onSelect(n, hit.voiceIdx, hit.blockIdx);
        }
        this.render();
        return;
      }

      // Drag to scroll
      this._isDragging = true;
      this._dragStartX = e.clientX;
      this._dragStartScroll = this.range.scrollX;
      this.canvas.style.cursor = 'grabbing';
      this._autoFollow = false;
    });

    // Double-click → fit to view
    this.canvas.addEventListener('dblclick', (e) => {
      const rect = this.canvas.getBoundingClientRect();
      const my = e.clientY - rect.top;
      if (my > RULER_H) {
        this.range.fitToView();
        this._autoFollow = true;
        this.render();
      }
    });

    this.canvas.addEventListener('mousemove', (e) => {
      // Minimap drag in progress → scroll the timeline to follow the cursor.
      if (this._isDraggingMinimap) {
        const rect = this.canvas.getBoundingClientRect();
        const mx = e.clientX - rect.left;
        this._minimapScrollTo(mx, rect.width);
        this.render();
        return;
      }

      // Group resize in progress
      if (this._isResizingGroup) {
        const rect = this.canvas.getBoundingClientRect();
        const mx = e.clientX - rect.left;
        const newMs = Math.max(0, Math.min(this.totalMs, this.range.xToMs(mx - HEADER_W)));
        this._solveGroupResize(newMs);
        this.render();
        return;
      }

      // Edge resize in progress — constraint solver
      if (this._isResizing && this._resizeEdge) {
        const rect = this.canvas.getBoundingClientRect();
        const mx = e.clientX - rect.left;
        const newMs = Math.max(0, Math.min(this.totalMs, this.range.xToMs(mx - HEADER_W)));
        this._solveResize(newMs);
        this.render();
        return;
      }

      if (this._isDragging) {
        const dx = e.clientX - this._dragStartX;
        this.range.scrollX = this._dragStartScroll - dx;
        this.range.clampScroll();
        this.render();
        return;
      }

      const rect = this.canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;

      // Check struct edge hover (chevron handles)
      const gEdge = this._structEdgeHitTest(mx, my);
      const prevGroupEdge = this._hoveredGroupEdge;
      this._hoveredGroupEdge = gEdge;

      // Check struct body hover
      const structHit = this._structHitTest(mx, my);
      const gIdx = structHit?.type === 'group' ? structHit.gi : (gEdge?.gi >= 0 ? gEdge.gi : -1);
      const prevGroup = this._hoveredGroup;
      this._hoveredGroup = gIdx;
      this._hoveredSegment = structHit?.type === 'gap' ? structHit.segment : null;

      // Check edge hover (only if not on a struct item)
      const inStructLane = gEdge || structHit;
      const edge = inStructLane ? null : this._edgeHitTest(mx, my);
      const prevEdge = this._hoveredEdge;
      this._hoveredEdge = edge;

      // Check block hover
      const hit = inStructLane ? null : this._hitTest(mx, my);
      const prev = this._hoveredBlock;
      this._hoveredBlock = hit;

      if (gEdge) {
        this.canvas.style.cursor = 'col-resize';
        if (gEdge.gi >= 0) {
          const g = this.polyGroups[gEdge.gi];
          this.canvas.title = `Drag to resize {${g.voiceCount} voices}`;
        } else if (gEdge.segment) {
          this.canvas.title = `Drag to resize ${gEdge.segment.label}`;
        }
      } else if (structHit) {
        this.canvas.style.cursor = 'pointer';
        if (structHit.type === 'group') {
          const g = this.polyGroups[structHit.gi];
          this.canvas.title = `{${g.voiceCount} voices} ${g.start}–${g.end}ms`;
        } else {
          this.canvas.title = `${structHit.segment.label} ${structHit.segment.start}–${structHit.segment.end}ms`;
        }
      } else if (edge) {
        this.canvas.style.cursor = 'col-resize';
        const en = this.voices[edge.voiceIdx].notes[edge.blockIdx];
        this.canvas.title = `Drag to resize ${en.token} (${en.end - en.start}ms)`;
      } else if (hit) {
        this.canvas.style.cursor = 'pointer';
        const n = this.voices[hit.voiceIdx].notes[hit.blockIdx];
        const dur = n.end - n.start;
        this.canvas.title = `${n.token}: ${n.start}–${n.end}ms (${dur}ms)`;
      } else if (my >= rect.height - MINIMAP_H && mx > HEADER_W) {
        this.canvas.style.cursor = 'pointer';
        this.canvas.title = 'Click to navigate';
      } else {
        this.canvas.style.cursor = mx > HEADER_W ? 'grab' : 'default';
        this.canvas.title = '';
      }

      if (hit?.voiceIdx !== prev?.voiceIdx || hit?.blockIdx !== prev?.blockIdx
          || edge?.blockIdx !== prevEdge?.blockIdx || edge?.side !== prevEdge?.side
          || gIdx !== prevGroup
          || gEdge?.gi !== prevGroupEdge?.gi || gEdge?.side !== prevGroupEdge?.side) {
        this.render();
      }
    });

    window.addEventListener('mouseup', () => {
      // Minimap drag end
      if (this._isDraggingMinimap) {
        this._isDraggingMinimap = false;
        this.canvas.style.cursor = 'grab';
        this.render();
        return;
      }

      // Group resize end
      if (this._isResizingGroup) {
        const gi = this._resizeGroupIdx;
        this._isResizingGroup = false;
        this.canvas.style.cursor = 'grab';
        if (this.onResizeGroup && gi >= 0) {
          const g = this.polyGroups[gi];
          const origSpan = this._resizeGroupOrigEnd - this._resizeGroupOrigStart;
          const newSpan = g.end - g.start;
          const ratio = origSpan > 0 ? newSpan / origSpan : 1;
          this.onResizeGroup(gi, { ...g, ratio });
        }
        this._resizeGroupOrigNotes = null;
        this._resizeGroupOrigChildren = null;
        this._resizeSiblings = null;
        this._resizeOrigSegments = null;
        this.render();
        return;
      }

      if (this._isResizing && this._resizeEdge) {
        const { voiceIdx, blockIdx } = this._resizeEdge;
        const voice = this.voices[voiceIdx];
        this._isResizing = false;
        this.canvas.style.cursor = 'grab';
        // Notify with scoped block timings + ratios
        if (this.onResize) {
          const groupInfo = this._findGroupSiblings(voice, blockIdx);
          const scopeIndices = groupInfo ? groupInfo.indices : voice.notes.map((_, i) => i);
          const spanStart = groupInfo ? groupInfo.spanStart : this._findVoiceSpan(voice).start;
          const spanEnd = groupInfo ? groupInfo.spanEnd : this._findVoiceSpan(voice).end;
          const totalSpan = spanEnd - spanStart;
          const equalShare = totalSpan / scopeIndices.length;
          const resized = scopeIndices.map(i => {
            const nn = voice.notes[i];
            return {
              token: nn.token,
              start: nn.start,
              end: nn.end,
              srcIdx: nn._srcIdx,
              ratio: (nn.end - nn.start) / equalShare,
            };
          });
          this.onResize(voiceIdx, blockIdx, resized);
        }
        this._resizeEdge = null;
        this.render();
        return;
      }
      if (this._isDragging) {
        this._isDragging = false;
        this.canvas.style.cursor = 'grab';
      }
    });

    // Resize observer
    if (window.ResizeObserver && this.canvas.parentElement) {
      this._resizeObs = new ResizeObserver(() => {
        this.resize();
        this.render();
      });
      this._resizeObs.observe(this.canvas.parentElement);
    }
  }

  _hitTest(mx, my) {
    let y = this._bodyTop() + this._structLaneHeight();
    for (let vi = 0; vi < this.voices.length; vi++) {
      const voice = this.voices[vi];
      if (my >= y && my < y + TRACK_H) {
        for (let bi = 0; bi < voice.notes.length; bi++) {
          const n = voice.notes[bi];
          const x1 = HEADER_W + this.range.msToX(n.start);
          const x2 = HEADER_W + this.range.msToX(n.end);
          if (mx >= x1 && mx <= x2) {
            return { voiceIdx: vi, blockIdx: bi };
          }
        }
      }
      y += TRACK_H;
      if (voice.controls.length > 0) y += CTRL_H;
      if (voice.cv.length > 0) y += CV_H;
      y += VOICE_GAP;
    }
    return null;
  }

  _edgeHitTest(mx, my) {
    let y = this._bodyTop() + this._structLaneHeight();
    for (let vi = 0; vi < this.voices.length; vi++) {
      const voice = this.voices[vi];
      if (my >= y && my < y + TRACK_H) {
        for (let bi = 0; bi < voice.notes.length; bi++) {
          const n = voice.notes[bi];
          const x1 = HEADER_W + this.range.msToX(n.start);
          const x2 = HEADER_W + this.range.msToX(n.end);
          if (Math.abs(mx - x1) <= EDGE_HANDLE_W && bi > 0) {
            return { voiceIdx: vi, blockIdx: bi, side: 'left' };
          }
          if (Math.abs(mx - x2) <= EDGE_HANDLE_W) {
            return { voiceIdx: vi, blockIdx: bi, side: 'right' };
          }
        }
      }
      y += TRACK_H;
      if (voice.controls.length > 0) y += CTRL_H;
      if (voice.cv.length > 0) y += CV_H;
      y += VOICE_GAP;
    }
    return null;
  }

  /**
   * Hit test in structure lane — returns {type:'group', gi} or {type:'gap', segment} or null.
   */
  _structHitTest(mx, my) {
    const structH = this._structLaneHeight();
    if (structH === 0) return null;
    const laneTop = this._bodyTop();
    if (my < laneTop || my > laneTop + structH || mx < HEADER_W) return null;

    const items = this._buildStructItems();
    for (const item of items) {
      const depth = item.depth;
      const rowY = laneTop + structH - (depth + 1) * STRUCT_LANE_H;
      if (my < rowY || my > rowY + STRUCT_LANE_H) continue;
      const x1 = HEADER_W + this.range.msToX(item.start);
      const x2 = HEADER_W + this.range.msToX(item.end);
      if (mx >= x1 && mx <= x2) {
        return item.type === 'group'
          ? { type: 'group', gi: item.groupIdx }
          : { type: 'gap', segment: item.segment };
      }
    }
    return null;
  }

  /**
   * Hit test for structure lane edge handles.
   * Returns {gi, side, segment?} or null.
   */
  _structEdgeHitTest(mx, my) {
    const structH = this._structLaneHeight();
    if (structH === 0) return null;
    const laneTop = this._bodyTop();
    if (my < laneTop || my > laneTop + structH || mx < HEADER_W) return null;

    const hitZone = 10;
    const items = this._buildStructItems();

    // Pre-compute fixed extremities per depth (first start, last end)
    const extremes = {}; // depth → {minStart, maxEnd}
    for (const it of items) {
      const d = it.depth;
      if (!extremes[d]) extremes[d] = { minStart: it.start, maxEnd: it.end };
      extremes[d].minStart = Math.min(extremes[d].minStart, it.start);
      extremes[d].maxEnd = Math.max(extremes[d].maxEnd, it.end);
    }

    for (const item of items) {
      const depth = item.depth;
      const rowY = laneTop + structH - (depth + 1) * STRUCT_LANE_H;
      if (my < rowY || my > rowY + STRUCT_LANE_H) continue;
      const x1 = HEADER_W + this.range.msToX(item.start);
      const x2 = HEADER_W + this.range.msToX(item.end);
      const ext = extremes[depth];

      // Left edge — skip if it's the absolute first start at this depth
      if (Math.abs(mx - x1) <= hitZone && Math.abs(item.start - ext.minStart) > 1) {
        return item.type === 'group'
          ? { gi: item.groupIdx, side: 'left' }
          : { gi: -1, side: 'left', segment: item.segment };
      }
      // Right edge — skip if it's the absolute last end at this depth
      if (Math.abs(mx - x2) <= hitZone && Math.abs(item.end - ext.maxEnd) > 1) {
        return item.type === 'group'
          ? { gi: item.groupIdx, side: 'right' }
          : { gi: -1, side: 'right', segment: item.segment };
      }
    }
    return null;
  }

  // ============ Struct resize init ============

  /**
   * Initialize a structural resize. Collects all siblings at the same depth
   * and stores their original positions for proportional redistribution.
   * Works for both polyGroups and gap segments.
   */
  _initStructResize(structEdge) {
    // Get the dragged item
    const isGroup = structEdge.gi >= 0;
    const draggedItem = isGroup
      ? this.polyGroups[structEdge.gi]
      : structEdge.segment;
    if (!draggedItem) return;

    const depth = isGroup ? (draggedItem.depth || 0) : draggedItem.depth;

    this._isResizingGroup = true;
    this._resizeGroupSide = structEdge.side;
    this._resizeGroupIdx = isGroup ? structEdge.gi : -1;
    this._resizeGroupOrigStart = draggedItem.start;
    this._resizeGroupOrigEnd = draggedItem.end;
    this._selectedGroup = isGroup ? structEdge.gi : -1;
    this._selectedSegment = isGroup ? null : structEdge.segment;
    this._selectedBlock = null;

    // Collect ALL siblings at same depth — groups and segments
    const items = this._buildStructItems().filter(it => it.depth === depth);
    items.sort((a, b) => a.start - b.start);

    // Build set of voice indices owned by groups at this depth
    const groupVoicesAtDepth = new Set();
    for (const it of items) {
      if (it.type === 'group') {
        const g = this.polyGroups[it.groupIdx];
        for (const vi of (g.voiceIndices || [])) groupVoicesAtDepth.add(vi);
      }
    }

    // Find the two adjacent siblings sharing the dragged boundary.
    // Left edge of item[i] = boundary between item[i-1] and item[i].
    // Right edge of item[i] = boundary between item[i] and item[i+1].
    const draggedItemIdx = items.findIndex(it =>
      (isGroup && it.type === 'group' && it.groupIdx === structEdge.gi)
      || (!isGroup && it.type === 'gap' && it.segment === structEdge.segment)
    );
    let leftIdx, rightIdx;
    if (structEdge.side === 'left') {
      leftIdx = draggedItemIdx - 1;
      rightIdx = draggedItemIdx;
    } else {
      leftIdx = draggedItemIdx;
      rightIdx = draggedItemIdx + 1;
    }
    // Only keep the two affected siblings
    const affectedItems = [];
    if (leftIdx >= 0 && leftIdx < items.length) affectedItems.push(items[leftIdx]);
    if (rightIdx >= 0 && rightIdx < items.length) affectedItems.push(items[rightIdx]);

    // Store original siblings, pre-assign notes to each
    this._resizeSiblings = affectedItems.map(it => {
      const sib = {
        start: it.start, end: it.end,
        origStart: it.start, origEnd: it.end,
        origDur: it.end - it.start,
        type: it.type, groupIdx: it.groupIdx, segment: it.segment,
        isDragged: (isGroup && it.type === 'group' && it.groupIdx === structEdge.gi)
          || (!isGroup && it.type === 'gap' && it.segment === structEdge.segment),
        notes: [], // [{vi, idx, origStart, dur}] — pre-assigned notes
        childGroups: [], // [{idx, origStart, origEnd}]
        childSegments: [], // [{segment, origStart, origEnd}]
      };

      // Assign notes:
      // - Groups: only notes in the group's voiceIndices
      // - Gaps: all notes that start within the gap's time range
      //   (time range is enough since gaps don't overlap with groups)
      const allowedVoices = it.type === 'group'
        ? new Set(this.polyGroups[it.groupIdx].voiceIndices || [])
        : null;

      for (let vi = 0; vi < this.voices.length; vi++) {
        if (allowedVoices && !allowedVoices.has(vi)) continue;

        for (let ni = 0; ni < this.voices[vi].notes.length; ni++) {
          const n = this.voices[vi].notes[ni];
          if (n.start >= it.start - 1 && n.start < it.end) {
            sib.notes.push({ vi, idx: ni, origStart: n.start, dur: n.end - n.start });
          }
        }
      }

      // Assign child polyGroups that start inside this sibling
      for (let ci = 0; ci < this.polyGroups.length; ci++) {
        const child = this.polyGroups[ci];
        if ((child.depth || 0) > depth && child.start >= it.start - 1 && child.start < it.end) {
          sib.childGroups.push({ idx: ci, origStart: child.start, origEnd: child.end });
        }
      }

      // Assign child segments
      for (const seg of this.structSegments) {
        if (seg.depth > depth && seg.start >= it.start - 1 && seg.start < it.end) {
          sib.childSegments.push({ segment: seg, origStart: seg.start, origEnd: seg.end });
        }
      }

      return sib;
    });
  }

  // ============ Constraint solver ============

  /**
   * Structural resize: drag a boundary between two adjacent siblings.
   * The boundary moves to targetMs. Left sibling grows/shrinks on the right,
   * right sibling grows/shrinks on the left. Everything else stays fixed.
   */
  _solveGroupResize(targetMs) {
    const siblings = this._resizeSiblings;
    if (!siblings || siblings.length < 2) return;

    const left = siblings[0];
    const right = siblings[1];
    const minDur = 10;

    // Clamp boundary
    const boundary = Math.max(left.origStart + minDur, Math.min(right.origEnd - minDur, targetMs));

    // Left sibling: start stays, end = boundary
    left.start = left.origStart;
    left.end = boundary;

    // Right sibling: start = boundary, end stays
    right.start = boundary;
    right.end = right.origEnd;

    // Update data from the new sibling positions using pre-assigned notes
    for (const sib of siblings) {
      const origDur = sib.origDur;
      const newSibDur = sib.end - sib.start;
      const sibScale = origDur > 0 ? newSibDur / origDur : 1;

      // Update polyGroup bounds
      if (sib.type === 'group' && sib.groupIdx != null) {
        this.polyGroups[sib.groupIdx].start = sib.start;
        this.polyGroups[sib.groupIdx].end = sib.end;
      }

      // Update gap segment bounds
      if (sib.type === 'gap' && sib.segment) {
        sib.segment.start = sib.start;
        sib.segment.end = sib.end;
      }

      // Scale pre-assigned notes
      for (const { vi, idx, origStart: nOs, dur: nDur } of sib.notes) {
        const n = this.voices[vi].notes[idx];
        if (!n) continue;
        const relStart = origDur > 0 ? (nOs - sib.origStart) / origDur : 0;
        n.start = Math.round(sib.start + relStart * newSibDur);
        n.end = Math.round(n.start + Math.max(5, nDur * sibScale));
      }

      // Scale pre-assigned child polyGroups
      for (const { idx, origStart: cOs, origEnd: cOe } of sib.childGroups) {
        const child = this.polyGroups[idx];
        const relS = origDur > 0 ? (cOs - sib.origStart) / origDur : 0;
        const relE = origDur > 0 ? (cOe - sib.origStart) / origDur : 1;
        child.start = Math.round(sib.start + relS * newSibDur);
        child.end = Math.round(sib.start + relE * newSibDur);
      }

      // Scale pre-assigned child segments
      for (const { segment: seg, origStart: sOs, origEnd: sOe } of sib.childSegments) {
        const relS = origDur > 0 ? (sOs - sib.origStart) / origDur : 0;
        const relE = origDur > 0 ? (sOe - sib.origStart) / origDur : 1;
        seg.start = Math.round(sib.start + relS * newSibDur);
        seg.end = Math.round(sib.start + relE * newSibDur);
      }
    }
  }

  /**
   * Find the time span of a voice (first note start → last note end).
   */
  _findVoiceSpan(voice) {
    if (voice.notes.length === 0) return { start: 0, end: 0 };
    return {
      start: voice.notes[0].start,
      end: voice.notes[voice.notes.length - 1].end,
    };
  }

  /**
   * Constraint solver: when dragging a block edge, recalculate all siblings
   * proportionally so the total span stays constant.
   *
   * Algorithm (Mode 1 — fixed span):
   * 1. Calculate the new duration for the dragged block
   * 2. The delta (change) is distributed uniformly among all OTHER blocks
   * 3. Each sibling loses/gains the same proportion of the delta
   * 4. Minimum block duration: 10ms
   */
  /**
   * Find siblings: notes in the same innermost polyGroup as notes[blockIdx].
   * Returns { indices, spanStart, spanEnd } or null if no group found (use full voice).
   */
  _findGroupSiblings(voice, blockIdx) {
    const n = voice.notes[blockIdx];
    const pgIdx = n._polyGroupIdx;
    if (pgIdx == null) return null;

    const g = this.polyGroups[pgIdx];
    if (!g) return null;

    // Find all notes in this voice that belong to the same group
    const indices = [];
    for (let i = 0; i < voice.notes.length; i++) {
      if (voice.notes[i]._polyGroupIdx === pgIdx) {
        indices.push(i);
      }
    }
    if (indices.length <= 1) return null;
    return { indices, spanStart: g.start, spanEnd: g.end };
  }

  _solveResize(targetMs) {
    const { voiceIdx, blockIdx, side } = this._resizeEdge;
    const voice = this.voices[voiceIdx];
    const notes = voice.notes;
    const orig = this._resizeOrigPositions;

    if (!orig || !this._resizeOrigDurations) return;

    // Determine scope: same polyGroup siblings, or full voice if no group
    const groupInfo = this._findGroupSiblings(voice, blockIdx);
    const scopeIndices = groupInfo ? groupInfo.indices : notes.map((_, i) => i);
    const spanStart = groupInfo ? groupInfo.spanStart : this._findVoiceSpan(voice).start;
    const spanEnd = groupInfo ? groupInfo.spanEnd : this._findVoiceSpan(voice).end;
    const totalSpan = spanEnd - spanStart;

    if (scopeIndices.length <= 1) return;

    const minDur = Math.max(10, totalSpan * 0.02);

    // Use ORIGINAL positions for calculating new duration
    const origStart = orig[blockIdx].start;
    const origEnd = orig[blockIdx].end;
    const origDur = this._resizeOrigDurations[blockIdx];

    let newDur;
    if (side === 'right') {
      // Right edge moves, left edge anchored at original start
      newDur = targetMs - origStart;
    } else {
      // Left edge moves, right edge anchored at original end
      newDur = origEnd - targetMs;
    }

    // Clamp
    const maxDur = totalSpan - (scopeIndices.length - 1) * minDur;
    newDur = Math.max(minDur, Math.min(maxDur, newDur));

    const delta = newDur - origDur;

    // Determine which siblings absorb the delta
    // Right drag: blocks AFTER the dragged one compress/expand
    // Left drag: blocks BEFORE the dragged one compress/expand
    const affectedIndices = side === 'right'
      ? scopeIndices.filter(i => i > blockIdx)
      : scopeIndices.filter(i => i < blockIdx);

    let affectedTotalOrig = 0;
    for (const i of affectedIndices) affectedTotalOrig += this._resizeOrigDurations[i];
    if (affectedTotalOrig <= 0 && delta > 0) return;

    // Calculate new durations
    const newDurations = new Map();
    for (const i of scopeIndices) {
      if (i === blockIdx) {
        newDurations.set(i, newDur);
      } else if (affectedIndices.includes(i)) {
        // Absorb delta proportionally
        const share = this._resizeOrigDurations[i] / affectedTotalOrig;
        newDurations.set(i, Math.max(minDur, this._resizeOrigDurations[i] - delta * share));
      } else {
        // Unaffected: keep original duration
        newDurations.set(i, this._resizeOrigDurations[i]);
      }
    }

    // Normalize to keep total span exact
    let rawTotal = 0;
    for (const d of newDurations.values()) rawTotal += d;
    const scale = totalSpan / rawTotal;
    for (const [i, d] of newDurations) newDurations.set(i, Math.round(d * scale));

    // Apply sequentially from spanStart
    let cursor = spanStart;
    for (const i of scopeIndices) {
      notes[i].start = cursor;
      notes[i].end = cursor + newDurations.get(i);
      cursor += newDurations.get(i);
    }
    // Fix rounding at boundaries
    notes[scopeIndices[0]].start = spanStart;
    notes[scopeIndices[scopeIndices.length - 1]].end = spanEnd;
  }

  // ============ Helpers ============

  _resolveControlLabel(token) {
    // _script(CT 0) or _script(CT0) → look up in controlTable
    const scriptMatch = token.match(/^_script\((.+)\)$/);
    if (scriptMatch) {
      const ctId = scriptMatch[1].trim();
      if (this._controlTable) {
        // Try exact match, then trimmed/normalized match
        const entry = this._controlTable.find(e =>
          e.id === ctId || e.id.replace(/\s+/g, '') === ctId.replace(/\s+/g, '')
        );
        if (entry?.assignments && typeof entry.assignments === 'object') {
          const pairs = Object.entries(entry.assignments);
          if (pairs.length > 0) {
            return pairs.map(([k, v]) => `${k}:${v}`).join(', ');
          }
          // scope end — empty assignments
          if (entry.scope === 'end') return null; // hide end markers
        }
      }
      // _e suffix = scope end, hide it
      if (ctId.endsWith('_e')) return null;
      return ctId;
    }
    // _vel(80) → vel:80, _chan(1) → chan:1
    const directMatch = token.match(/^_(\w+)\((.+)\)$/);
    if (directMatch) {
      return `${directMatch[1]}:${directMatch[2]}`;
    }
    return token;
  }

  _scheduleRender() {
    if (this._animFrame) return;
    this._animFrame = requestAnimationFrame(() => {
      this._animFrame = 0;
      this.render();
    });
  }

  _roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.arcTo(x + w, y, x + w, y + r, r);
    ctx.lineTo(x + w, y + h - r);
    ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
    ctx.lineTo(x + r, y + h);
    ctx.arcTo(x, y + h, x, y + h - r, r);
    ctx.lineTo(x, y + r);
    ctx.arcTo(x, y, x + r, y, r);
    ctx.closePath();
  }

  _darken(hex, amount) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    const f = 1 - amount;
    return `rgb(${Math.round(r * f)}, ${Math.round(g * f)}, ${Math.round(b * f)})`;
  }

  destroy() {
    if (this._resizeObs) this._resizeObs.disconnect();
    if (this._animFrame) cancelAnimationFrame(this._animFrame);
  }
}
