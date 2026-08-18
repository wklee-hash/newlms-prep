/*
 * prep.js — the New LMS upload contract as data: what a notebook must satisfy,
 * and how to rewrite one so it does. No DOM in here; index.html draws the
 * screen, and `node prep.js` loads the same pure functions for scripted runs.
 *
 * Every verdict cites the kb dict row it comes from, so a guide-only WARN can be
 * overruled on sight. Severity follows provenance:
 *
 *   FAIL  measured against the live system — the upload or the admin page breaks
 *   WARN  written in a 2025 guide, never re-measured
 *   INFO  measured to be accepted either way; recorded only so drift is visible
 *
 * Deliberately NOT modelled on a downloaded live notebook: prod holds 614 Steps
 * whose titles carry no period (dict 1234), so a live file is a sample of the
 * broken population, not a spec. Downloaded files also carry an admin-assigned
 * `step_id` that a fresh upload must not have.
 *
 * Measured 2026-08-18 (owner, CV-AI-DATA-3 yolo node): the raw notebook — no
 * _extra anywhere, no sections — was REJECTED at upload; the converted file
 * (every code cell carrying _extra, markdown cells carrying none, 2 sections)
 * uploaded fine. So: code-cell _extra is required (FAIL), markdown cells need
 * no _extra, and stored outputs / non-3.8 versions were never the breaker.
 */

(function (root) {
  'use strict';

  var LEVELS = ['입문', '초급', '중급', '고급', '심화'];
  var ABSTRACT = ['들어가기', '정리하기', '시작하기', '끝내기', '요약'];
  var SECTION_KEYS = ['custom_type', 'level', 'progress_type', 'section_id',
                      'section_time', 'section_type', 'title'];
  var CUSTOM_TYPES = ['section', 'warning_box', 'video_embed', 'quiz_component',
                      'quiz_choice', 'quiz_short_answer', 'code_explainer',
                      'submit', 'table_of_contents', 'lecture_code'];
  var SECTION_TYPES = ['practice', 'lecture'];

  function extra(cell) {
    return (cell && cell.metadata && cell.metadata._extra) || null;
  }
  function isSection(cell) {
    return cell.cell_type === 'raw' && ((extra(cell) || {}).custom_type === 'section');
  }
  function src(cell) {
    var s = cell.source;
    return Array.isArray(s) ? s.join('') : (s || '');
  }
  function f(sev, ref, where, msg) {
    return { sev: sev, ref: ref, where: where, msg: msg };
  }

  /* ---------------------------------------------------------------- rules -- */

  function findings(nb) {
    var out = [];
    var cells = (nb && nb.cells) || [];
    var meta = (nb && nb.metadata) || {};

    // root
    if (!meta.kernelspec) {
      out.push(f('FAIL', 'dict 929', 'root',
        'metadata.kernelspec is missing — the editor 500s on upload'));
    }
    if (!meta.language_info) {
      out.push(f('FAIL', 'dict 929', 'root',
        'metadata.language_info is missing — the editor 500s on upload'));
    }
    if (nb.nbformat !== 4) {
      out.push(f('FAIL', 'nbformat', 'root',
        'nbformat is not 4 (found ' + (nb.nbformat === undefined ? 'none' : nb.nbformat) + ')'));
    }
    if (meta.language_info && String(meta.language_info.version || '') !== '3.8') {
      out.push(f('INFO', 'dict 929', 'root',
        'language_info.version is ' + (meta.language_info.version || 'unset') +
        '; the guide and live nodes both say 3.8'));
    }
    var sections = cells.filter(isSection);
    if (sections.length === 0) {
      out.push(f('WARN', 'dict 930', 'root',
        'no section cell found — the upload creates no step at all'));
    }

    var seen = 0;
    cells.forEach(function (cell, i) {
      var where = 'cell ' + i;
      var x = extra(cell);

      if (isSection(cell)) {
        seen += 1;
        var missing = SECTION_KEYS.filter(function (k) { return !(k in x); });
        if (missing.length) {
          out.push(f('FAIL', 'dict 405', where,
            'section _extra is missing ' + missing.join(', ')));
        }
        var title = String(x.title || '');
        if (title.indexOf('.') === -1) {
          out.push(f('FAIL', 'dict 1234', where,
            'section title has no period: "' + title + '" — the whole NodeVersion admin page ' +
            '500s, and the title is frozen at upload'));
        }
        if (x.step_id !== undefined && x.step_id !== null) {
          out.push(f('WARN', 'dict 1234', where,
            'section _extra carries step_id ' + x.step_id +
            ' — this file came off a live node; admin assigns it at upload'));
        }
        if (title.replace(/^[^.]*\.\s*/, '').trim() === '') {
          out.push(f('WARN', 'dict 919', where,
            'section title is empty apart from its number; the guide requires a title'));
        }
        if (title.length > 30) {
          out.push(f('WARN', 'dict 919', where,
            'section title is ' + title.length + ' chars; the guide caps titles at 30'));
        }
        if (ABSTRACT.some(function (w) { return title.indexOf(w) !== -1; })) {
          out.push(f('WARN', 'dict 912', where,
            'section title contains an abstract word as a substring ' +
            '(들어가기/정리하기/시작하기/끝내기/요약): "' + title + '"'));
        }
        if (x.level !== undefined && LEVELS.indexOf(x.level) === -1) {
          out.push(f('WARN', 'dict 919', where,
            'level "' + x.level + '" is outside ' + LEVELS.join('/')));
        }
        if (x.progress_type !== 'conditional') {
          out.push(f('WARN', 'dict 405', where,
            'section progress_type is "' + (x.progress_type || 'unset') +
            '"; sections are conditional'));
        }
        if (x.section_time !== undefined && typeof x.section_time !== 'string') {
          out.push(f('INFO', 'dict 405', where,
            'section_time is a ' + typeof x.section_time +
            '; upload accepts it, live nodes store a string'));
        }
        if (x.section_type !== undefined && SECTION_TYPES.indexOf(x.section_type) === -1) {
          out.push(f('INFO', 'dict 405', where,
            'section_type is "' + x.section_type +
            '"; upload accepts it, live nodes store practice/lecture'));
        }
        if (src(cell).length > 0) {
          out.push(f('WARN', 'dict 930', where,
            'section raw cell has a non-empty source; it should be empty'));
        }
        var want = 'sec_' + seen;
        if (x.section_id !== want) {
          out.push(f('WARN', 'dict 930', where,
            'section_id is ' + (x.section_id || 'unset') + ', expected ' + want + ' by position'));
        }
      } else if (cell.cell_type === 'raw') {
        var ct = (x && x.custom_type) || '';
        if (!ct) {
          out.push(f('WARN', 'dict 684', where,
            'raw cell has no _extra.custom_type — it renders as nothing and creates no component'));
        } else if (CUSTOM_TYPES.indexOf(ct) === -1) {
          out.push(f('WARN', 'dict 684', where,
            'raw cell custom_type "' + ct + '" is not one of ' + CUSTOM_TYPES.join(', ')));
        }
      } else if (cell.cell_type === 'code') {
        if (!x) {
          out.push(f('FAIL', '실측 0818', where,
            'code cell has no _extra — the upload rejects the file ' +
            '(measured 2026-08-18, CV-AI-DATA-3 yolo node)'));
        } else if (x.custom_type !== 'code') {
          out.push(f('WARN', 'dict 405', where,
            'code cell _extra.custom_type is "' + (x.custom_type || 'unset') +
            '", expected "code"'));
        }
        if ((cell.outputs || []).length > 0) {
          out.push(f('WARN', 'outputs', where,
            'code cell still carries ' + cell.outputs.length + ' stored output(s)'));
        }
        if (cell.execution_count !== null && cell.execution_count !== undefined) {
          out.push(f('WARN', 'outputs', where,
            'code cell still carries execution_count ' + cell.execution_count));
        }
      } else if (cell.cell_type === 'markdown') {
        if (cell.attachments) {
          out.push(f('WARN', 'size', where,
            'markdown cell embeds ' + Object.keys(cell.attachments).length +
            ' base64 attachment(s); link the image instead'));
        }
      }
    });

    // a section block must hold at least one markdown cell (dict 930). A VOD node
    // puts a video_embed raw cell between the section and its markdown, so the
    // rule is per block, not "the next cell".
    var starts = [];
    cells.forEach(function (c, i) { if (isSection(c)) starts.push(i); });
    starts.forEach(function (s, n) {
      var end = (n + 1 < starts.length) ? starts[n + 1] : cells.length;
      var hasMd = cells.slice(s + 1, end).some(function (c) { return c.cell_type === 'markdown'; });
      if (!hasMd) {
        out.push(f('WARN', 'dict 930', 'cell ' + s,
          'section "' + ((extra(cells[s]) || {}).title || '') +
          '" has no markdown cell before the next section'));
      }
    });

    var rank = { FAIL: 0, WARN: 1, INFO: 2 };
    return out.sort(function (a, b) { return rank[a.sev] - rank[b.sev]; });
  }

  /* --------------------------------------------------------------- reading -- */

  /** The editable shape the form binds to: one row per section, in cell order. */
  function readSections(nb) {
    var rows = [];
    (nb.cells || []).forEach(function (cell, i) {
      if (!isSection(cell)) return;
      var x = extra(cell) || {};
      rows.push({
        origin: 'existing',
        cell: i,
        title: String(x.title || ''),
        minutes: String(x.section_time === undefined ? '' : x.section_time),
        type: x.section_type || 'practice'
      });
    });
    return rows;
  }

  function readLevel(nb) {
    var found = [];
    (nb.cells || []).forEach(function (c) {
      var x = extra(c);
      if (x && x.level && found.indexOf(x.level) === -1) found.push(x.level);
    });
    return found.length === 1 ? found[0] : '';
  }

  function nodeCodeFromName(name) {
    var stem = String(name || '').replace(/\.ipynb$/, '');
    var m = stem.match(/^[A-Z][A-Z0-9]*(-[A-Z0-9]+)*/);
    return m ? m[0] : '';
  }

  /** Name the output after the node code when the input does not carry it. */
  function outputName(srcName, code) {
    var stem = String(srcName || 'notebook').replace(/\.ipynb$/, '');
    if (stem.indexOf('_NewLMS') !== -1) return stem + '-prepped';
    if (code && stem.indexOf(code) === -1) return code + '_NewLMS';
    return stem + '_NewLMS';
  }

  /** The title a section gets when it has no period yet (dict 1234). */
  function proposeTitle(code, ordinal, current) {
    var t = String(current || '');
    if (t.indexOf('.') !== -1) return t;
    return (code ? code + '-' + ordinal : String(ordinal)) + '. ' + t;
  }

  /* ------------------------------------------------------------ converting -- */

  function sectionCell(id, s, level) {
    return {
      cell_type: 'raw',
      id: id,
      metadata: {
        _extra: {
          custom_type: 'section',
          level: level,
          progress_type: 'conditional',
          section_id: '',           // filled in by renumbering below
          section_time: String(s.minutes === '' || s.minutes === undefined ? '15' : s.minutes),
          section_type: s.type || 'practice',
          title: s.title || ''
        },
        editable: true,
        raw_mimetype: '',
        slideshow: { slide_type: '' },
        tags: []
      },
      source: []
    };
  }

  function cellId(i) {
    // Deterministic, so converting the same input twice gives the same bytes.
    return ('00000000' + i.toString(16)).slice(-8);
  }

  /**
   * answers = {
   *   code, level, langVersion,
   *   sections: [{origin:'existing', cell, title, minutes, type} |
   *              {origin:'new', at, title, minutes, type}],
   *   fillCodeExtra, stripOutputs, dropStepId
   * }
   */
  function convert(nb, answers) {
    var a = answers || {};
    var level = a.level || '입문';
    var out = JSON.parse(JSON.stringify(nb));
    var byCell = {}, inserts = {};
    (a.sections || []).forEach(function (s) {
      if (s.origin === 'new') {
        (inserts[s.at] = inserts[s.at] || []).push(s);
      } else {
        byCell[s.cell] = s;
      }
    });

    var cells = [];
    (out.cells || []).forEach(function (cell, i) {
      (inserts[i] || []).forEach(function (s) {
        cells.push(sectionCell(cellId(cells.length), s, level));
      });

      var c = cell;
      var x = extra(c);
      if (byCell[i] !== undefined && x) {
        x.title = byCell[i].title;
        x.section_time = String(byCell[i].minutes);
        x.section_type = byCell[i].type;
      }
      if (x) x.level = level;
      if (x && a.dropStepId && x.step_id !== undefined) delete x.step_id;

      if (c.cell_type === 'code') {
        if (a.fillCodeExtra && !x) {
          c.metadata = c.metadata || {};
          c.metadata._extra = {
            custom_type: 'code', level: level, progress_type: 'simple', title: ''
          };
        }
        if (a.stripOutputs) {
          c.outputs = [];
          c.execution_count = null;
        }
      }
      cells.push(c);
    });
    (inserts[(out.cells || []).length] || []).forEach(function (s) {
      cells.push(sectionCell(cellId(cells.length), s, level));
    });

    // section_id follows position, always (dict 930)
    var n = 0;
    cells.forEach(function (c) {
      if (isSection(c)) { n += 1; c.metadata._extra.section_id = 'sec_' + n; }
    });

    out.cells = cells;
    out.metadata = out.metadata || {};
    out.metadata.kernelspec = {
      display_name: 'Python 3 (ipykernel)', language: 'python', name: 'python3'
    };
    out.metadata.language_info = { name: 'python', version: a.langVersion || '3.8' };
    out.nbformat = 4;
    out.nbformat_minor = 5;
    return out;
  }

  /** What the write will change, for the screen shown before downloading. */
  function plan(nb, answers) {
    var a = answers || {};
    var cells = nb.cells || [];
    var retitled = (a.sections || []).filter(function (s) {
      if (s.origin !== 'existing') return false;
      return ((extra(cells[s.cell]) || {}).title || '') !== s.title;
    }).length;
    return {
      newSections: (a.sections || []).filter(function (s) { return s.origin === 'new'; }).length,
      sections: (a.sections || []).length,
      retitled: retitled,
      codeExtraFilled: a.fillCodeExtra
        ? cells.filter(function (c) { return c.cell_type === 'code' && !extra(c); }).length : 0,
      outputsCleared: a.stripOutputs
        ? cells.filter(function (c) {
            return c.cell_type === 'code' &&
              (((c.outputs || []).length > 0) ||
               (c.execution_count !== null && c.execution_count !== undefined));
          }).length : 0,
      levelStamped: cells.filter(function (c) { return !!extra(c); }).length,
      stepIdsDropped: a.dropStepId
        ? cells.filter(function (c) {
            var x = extra(c); return x && x.step_id !== undefined && x.step_id !== null;
          }).length : 0
    };
  }

  /** The admin-side work order: values that never enter the notebook. */
  function answerSheet(srcName, answers) {
    var a = answers || {};
    var admin = a.admin || {};
    var lines = [
      '# newlms answers for ' + srcName,
      '# 이 값들은 노트북에 안 들어간다. 장고 어드민에서 손으로 넣는다.',
      '',
      'node_title=' + (admin.nodeTitle || '확인 필요'),
      'nodeversion_id=' + (admin.nodeVersionId || '?'),
      'storage_path=' + (admin.storagePath || '?'),
      'node_slug=' + (admin.nodeSlug || '확인 필요'),
      '',
      '# storage_path: GCS {코스코드}-{순서}-{추가정보}/data, 실습환경 ~/data 로 마운트 (dict 120).',
      '#   노드 이름으로 짐작 금지 — E-7-L 노드가 DS-ML-10/data 를 쓴다 (dict 363).',
      '# node_title: 마침표가 든 "{코드}. 제목" 형태여야 한다. Node.title 의 RegexValidator',
      '#   ("Node title contain slug or number")가 다른 형태의 저장을 막는다. Step 제목',
      '#   마침표 규칙(dict 1234)과는 별개의 검증이다.',
      '# node_slug: 노드마다 하나씩 손으로 짓는다. 관측된 형식 {ipynb스템}_newlms_{MMDD}',
      '#   (예: 1-1-1_newlms_250331) 또는 jupyter-test-{스템}-{MMDD}. 입력 위치는',
      '#   NodeVersion 폼의 Resource Slug 드롭다운이다 (2026-08-18 어드민 화면 확인).',
      '# 업로드는 노드 버전 하위에 스텝을 만들지 않은 상태에서 한다 (Django 업로드 가이드).',
      '',
      'code=' + (a.code || ''),
      'level=' + (a.level || ''),
      'lang_version=' + (a.langVersion || '')
    ];
    (a.sections || []).forEach(function (s, i) {
      lines.push('section.' + (i + 1) + '=' + s.title + ' | ' + s.minutes + 'min | ' + s.type);
    });
    return lines.join('\n') + '\n';
  }

  root.findings = findings;
  root.readSections = readSections;
  root.readLevel = readLevel;
  root.nodeCodeFromName = nodeCodeFromName;
  root.outputName = outputName;
  root.proposeTitle = proposeTitle;
  root.convert = convert;
  root.plan = plan;
  root.answerSheet = answerSheet;
  root.LEVELS = LEVELS;
  root.SECTION_TYPES = SECTION_TYPES;
})(typeof module !== 'undefined' && module.exports ? module.exports : (window.NewLMS = {}));
