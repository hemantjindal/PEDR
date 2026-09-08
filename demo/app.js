(function () {
  'use strict';
  var E = PEDR;
  var REFERENCE = '2026-09-11';   // Friday of w/c 7 Sep 2026
  var WEEK = '2026-W37';

  var PROJECTS = [
    { id: 'p1', userId: 'u', code: '1042', name: 'Battersea Square Phase 2', client: 'BSQ Developments',
      sector: 'Residential', valueGbp: 48000000, procurement: 'Two stage D&B', contractForm: 'JCT D&B 2016',
      isCaseStudy: true, notes: null, aliases: ['BSQ', 'Battersea'], archived: false, createdAt: '' },
    { id: 'p2', userId: 'u', code: '1088', name: 'Nine Elms Fit-Out', client: 'Argent Estates',
      sector: 'Commercial', valueGbp: 6500000, procurement: 'Traditional', contractForm: 'JCT SBC/Q',
      isCaseStudy: false, notes: null, aliases: ['Nine Elms', 'NEF'], archived: false, createdAt: '' },
    { id: 'p3', userId: 'u', code: '1103', name: 'Hackney Depot Refurbishment', client: 'LB Hackney',
      sector: 'Public', valueGbp: 2100000, procurement: 'Framework', contractForm: 'JCT IC',
      isCaseStudy: false, notes: null, aliases: ['Hackney', 'Depot'], archived: false, createdAt: '' }
  ];

  var SAMPLES = {
    week: 'w/c 7 Sep\n' +
      'mon - battersea, worked up the stair details with Tom. 4h. sent the wrong revision first, had to reissue\n' +
      'tue: all day on 1042 tender package\n' +
      'wed - site visit nine elms with Sarah Chen from Mace. missed the drainage connection detail entirely\n' +
      'thurs - cpd lunchtime talk on the building safety act\n' +
      'fri half day, planning submission for BSQ',
    teams: 'Monday, 7 September 2026\n' +
      'Sarah Chen  10:32\n' +
      'Can you send over the curtain wall head detail for 1042?\n\n' +
      'Alex Demo  10:45\n' +
      'Just issued it, RFI 042 response. The head condition does not work with the new soffit level so I have flagged it to the engineer.\n\n' +
      'Sarah Chen  10:47\n' +
      'thanks\n\n' +
      'Alex Demo  14:10\n' +
      'Spent the afternoon on the Nine Elms site inspection with Tom Reilly. Missed the drainage connection detail entirely, had to go back.',
    timesheet: 'Date,Job No,Project Name,Phase,Hours,Narrative\n' +
      '07/09/2026,1042,Battersea Square Phase 2,4,3.5,Stair balustrade details for tender\n' +
      '07/09/2026,1088,Nine Elms Fit-Out,5,4,Site inspection and snagging list\n' +
      '08/09/2026,1042,Battersea Square Phase 2,4,7.5,Tender package coordination\n' +
      '09/09/2026,1103,Hackney Depot Refurbishment,3,7.5,Planning submission drawings',
    lazy: 'mon - worked on drawings\n' +
      'tue - drawings\n' +
      'wed - meetings\n' +
      'thu - cad\n' +
      'fri - admin'
  };

  var $ = function (s) { return document.querySelector(s); };
  var raw = $('#raw'), out = $('#out'), tally = $('#tally'),
      kindEl = $('#kind'), card = $('#scorecard');

  function esc(t) {
    return String(t == null ? '' : t)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  var KIND_LABEL = { freeform: 'notes', teams: 'Teams chat', timesheet: 'timesheet', unknown: 'empty' };

  function render() {
    var text = raw.value;
    var result = E.parseDump(text, { reference: REFERENCE, projects: PROJECTS, me: 'Alex Demo' });
    var entries = result.entries;

    kindEl.textContent = 'read as ' + (KIND_LABEL[result.kind] || result.kind);

    if (!entries.length) {
      out.innerHTML = '<div class="empty">Nothing to file yet. Type a line about a day.</div>';
      tally.textContent = 'nothing yet';
      card.innerHTML = '<div class="empty">The week scores once there is something in it.</div>';
      return;
    }

    var mins = entries.reduce(function (s, e) { return s + e.minutes; }, 0);
    var days = Object.keys(entries.reduce(function (a, e) { a[e.date] = 1; return a; }, {})).length;
    tally.textContent = entries.length + (entries.length === 1 ? ' entry · ' : ' entries · ') +
      days + (days === 1 ? ' day · ' : ' days · ') + E.formatDuration(mins);

    out.innerHTML = entries.map(function (e) {
      var project = PROJECTS.filter(function (p) { return p.id === e.projectId; })[0];
      var st = e.stage === null || e.stage === undefined ? null : E.stage(e.stage);
      var office = e.officeCategory ? E.officeCategory(e.officeCategory) : null;
      var chips = [];

      if (project) chips.push('<span class="chip chip-ink">' + esc(project.code) + '</span>');
      else if (e.projectHint) chips.push('<span class="chip">? ' + esc(e.projectHint) + '</span>');
      if (office) chips.push('<span class="chip">' + esc(office.name) + '</span>');
      if (st) chips.push('<span class="chip">Stage ' + st.code + ' · ' + esc(st.short) + '</span>');
      e.criteria.forEach(function (c) { chips.push('<span class="chip">' + esc(c) + '</span>'); });

      var hours = e.minutes > 0
        ? '<span class="ref">' + esc(E.formatDuration(e.minutes)) + '</span>'
        : '<span class="ref faint" title="No duration was stated, so none was invented">— no hours stated</span>';

      var lines = '';
      if (e.people.length) {
        lines += '<div class="entry-line"><span class="label">With</span>' +
          '<span class="dim">' + esc(e.people.join(', ')) + '</span></div>';
      }
      if (e.wentWrong) {
        lines += '<div class="entry-line"><span class="label">Wrong</span>' +
          '<span class="wrong">' + esc(e.wentWrong) + '</span></div>';
      }
      if (e.learned) {
        lines += '<div class="entry-line"><span class="label">Learnt</span>' +
          '<span class="learned">' + esc(e.learned) + '</span></div>';
      }

      return '<div class="entry">' +
        '<div class="entry-top">' +
          '<span class="ref">' + esc(E.formatDate(e.date, { weekday: true, year: false })) + '</span>' +
          chips.join('') +
          '<span style="margin-left:auto">' + hours + '</span>' +
        '</div>' +
        '<div class="entry-act">' + esc(e.activity) + '</div>' +
        lines +
        (e.provenance ? '<div class="prov">from — ' + esc(e.provenance) + '</div>' : '') +
      '</div>';
    }).join('');

    renderScore(entries);
  }

  function renderScore(drafts) {
    // scoreWeek wants stored entries; a draft is one minus its database columns.
    var entries = drafts.map(function (e) {
      var c = Object.assign({}, e);
      c.id = 'x'; c.userId = 'u'; c.dumpId = null; c.verified = true;
      c.createdAt = ''; c.updatedAt = '';
      return c;
    });
    var s = E.scoreWeek(WEEK, entries);

    var strip = '';
    for (var i = 0; i < 13; i++) {
      // The week being scored sits last; the rest of the quarter is unwritten.
      var d = i === 12 ? bandOf(s.score) : 0;
      strip += '<span class="cell" data-d="' + d + '"></span>';
    }

    card.innerHTML =
      '<div class="sheet-head"><div>' +
        '<span class="label">This week, out of 100</span>' +
        '<h2 style="margin-top:3px">Score</h2>' +
      '</div><span class="chip' + (s.score >= 85 ? ' chip-ink' : s.score < 60 ? ' chip-rev' : '') + '">' +
        esc(s.bandLabel) + '</span></div>' +
      '<div class="score-top">' +
        '<span class="score-fig">' + s.score + '</span>' +
        '<span class="label">of 100</span>' +
      '</div>' +
      s.components.map(function (c) {
        return '<div class="crit">' +
          '<span class="mark ' + (c.earned > 0 ? 'mark-yes' : 'mark-no') + '"></span>' +
          '<span class="small"' + (c.earned > 0 ? ' style="color:var(--ink-2)"' : '') + '>' +
            esc(c.label) + '</span>' +
          '<span class="crit-pts">' + c.earned + '/' + c.points + '</span>' +
        '</div>';
      }).join('') +
      (s.nextBestAction
        ? '<div class="note note-rev" style="margin-top:12px">' +
            '<span class="label" style="padding-top:2px;flex:none;color:var(--revision-ink)">Next</span>' +
            '<span>' + esc(s.nextBestAction) + '</span></div>'
        : '<div class="note" style="margin-top:12px">' +
            '<span class="label" style="padding-top:2px;flex:none">Clear</span>' +
            '<span>Full marks. An examiner could ask a follow-up about every line of this.</span></div>') +
      '<div style="margin-top:14px">' +
        '<span class="label" style="margin-bottom:6px">This week in its quarter · 13 weeks to a sheet</span>' +
        '<div class="strip">' + strip + '</div>' +
      '</div>';
  }

  function bandOf(score) {
    if (score <= 0) return 0;
    if (score < 40) return 1;
    if (score < 60) return 2;
    if (score < 80) return 3;
    if (score < 95) return 4;
    return 5;
  }

  var timer;
  raw.addEventListener('input', function () {
    clearTimeout(timer);
    timer = setTimeout(render, 140);
    Array.prototype.forEach.call(document.querySelectorAll('[data-sample]'), function (b) {
      b.setAttribute('aria-pressed', 'false');
    });
  });

  Array.prototype.forEach.call(document.querySelectorAll('[data-sample]'), function (btn) {
    btn.addEventListener('click', function () {
      Array.prototype.forEach.call(document.querySelectorAll('[data-sample]'), function (b) {
        b.setAttribute('aria-pressed', String(b === btn));
      });
      raw.value = SAMPLES[btn.dataset.sample];
      render();
    });
  });

  // Opens already parsed, so the first frame shows what it does.
  raw.value = SAMPLES.week;
  render();
})();
