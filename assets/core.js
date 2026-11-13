/* ============================================================
 * 核心逻辑：评分、总分、严重程度、完成度、安全提示
 * 不依赖 DOM，可在浏览器与 Node 中复用。
 * ============================================================ */
(function (global) {
  'use strict';

  const SCALES = global.SCALES;
  const PACKAGES = global.PACKAGES;
  const ITEM_INDEX = global.ITEM_INDEX;
  const SCALE_ORDER = global.SCALE_ORDER;

  const SEVERITY_TONES = {
    HAMD17: ['ok', 'mild', 'mod', 'severe'],
    HAMA: ['ok', 'watch', 'mild', 'mod', 'severe'],
    MADRS: ['ok', 'mild', 'mod', 'severe']
  };

  function pad2(n) { return (n < 10 ? '0' : '') + n; }

  function nowISO() { return new Date().toISOString(); }

  function todayISO() {
    const d = new Date();
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
  }

  function nowTime() {
    const d = new Date();
    return pad2(d.getHours()) + ':' + pad2(d.getMinutes());
  }

  function uid(prefix) {
    return (prefix || 'id') + '_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
  }

  function getPackage(id) {
    return PACKAGES[id] || null;
  }

  function getScale(id) {
    return SCALES[id] || null;
  }

  function createEmptyAnswers() {
    return { HAMD17: {}, HAMA: {}, MADRS: {} };
  }

  function createPatient(opts) {
    opts = opts || {};
    const t = nowISO();
    return {
      id: uid('p'),
      code: (opts.code || '').trim(),
      name: (opts.name || '').trim(),
      gender: opts.gender || '',
      age: opts.age === 0 || opts.age ? String(opts.age) : '',
      date: opts.date || todayISO(),
      assessor: (opts.assessor || '').trim(),
      packageId: opts.packageId,
      answers: createEmptyAnswers(),
      methods: { HAMD17: {}, HAMA: {}, MADRS: {} },
      currentRound: 1,
      notes: '',
      createdAt: t,
      updatedAt: t,
      completedAt: null
    };
  }

  function findPatient(patients, id) {
    if (!patients) return null;
    for (let i = 0; i < patients.length; i++) {
      if (patients[i].id === id) return patients[i];
    }
    return null;
  }

  function ensureShape(patient) {
    if (!patient.answers) patient.answers = createEmptyAnswers();
    SCALE_ORDER.forEach(function (sid) {
      if (!patient.answers[sid]) patient.answers[sid] = {};
    });
    if (!patient.methods) patient.methods = { HAMD17: {}, HAMA: {}, MADRS: {} };
    SCALE_ORDER.forEach(function (sid) {
      if (!patient.methods[sid]) patient.methods[sid] = {};
    });
    return patient;
  }

  function answerOf(patient, scaleId, code) {
    ensureShape(patient);
    const v = patient.answers[scaleId][code];
    return (v === undefined || v === null || v === '') ? null : v;
  }

  function setAnswer(patient, scaleId, code, value, method) {
    ensureShape(patient);
    if (value === null || value === undefined || value === '') {
      delete patient.answers[scaleId][code];
    } else {
      patient.answers[scaleId][code] = value;
    }
    if (method) {
      patient.methods[scaleId][code] = method;
    }
    patient.updatedAt = nowISO();
    return patient;
  }

  function getOption(scaleId, code, value, method) {
    const meta = ITEM_INDEX[code];
    if (!meta) return null;
    const item = meta.item;
    if (value === 'NA') {
      for (let i = 0; i < item.options.length; i++) {
        if (item.options[i].v === 'NA') return item.options[i];
      }
      return null;
    }
    if (item.kind === 'weight') {
      const m = item.methods[method || 'A'];
      if (!m) return null;
      for (let i = 0; i < m.options.length; i++) {
        if (m.options[i].v === value) return m.options[i];
      }
      return null;
    }
    for (let i = 0; i < item.options.length; i++) {
      if (item.options[i].v === value) return item.options[i];
    }
    return null;
  }

  function answerLabel(scaleId, code, value, method) {
    if (value === null || value === undefined) return '';
    const opt = getOption(scaleId, code, value, method);
    if (!opt) return '';
    if (value === 'NA') return opt.t;
    return opt.t;
  }

  function scaleStats(patient, scaleId) {
    const scale = SCALES[scaleId];
    if (!scale) return null;
    ensureShape(patient);
    const ans = patient.answers[scaleId];
    let total = 0;
    let answered = 0;
    let maxScore = 0;
    const missing = [];
    const naCodes = [];
    scale.items.forEach(function (item) {
      const v = ans[item.code];
      if (v === 'NA') {
        answered += 1;
        naCodes.push(item.code);
        return;
      }
      maxScore += item.max;
      if (typeof v === 'number' && !isNaN(v)) {
        total += v;
        answered += 1;
      } else {
        missing.push(item);
      }
    });
    const complete = missing.length === 0;
    return {
      scaleId: scaleId,
      total: total,
      answered: answered,
      totalItems: scale.items.length,
      missing: missing,
      naCodes: naCodes,
      complete: complete,
      maxScore: maxScore,
      severity: complete ? severityOf(scaleId, total) : null
    };
  }

  function severityOf(scaleId, total) {
    if (scaleId === 'HAMD17') {
      if (total <= 7) return { label: '无抑郁症状', tone: 'ok' };
      if (total <= 16) return { label: '可能有轻度抑郁', tone: 'mild' };
      if (total <= 23) return { label: '可能有中度抑郁', tone: 'mod' };
      return { label: '严重抑郁', tone: 'severe' };
    }
    if (scaleId === 'HAMA') {
      if (total >= 29) return { label: '可能为严重焦虑', tone: 'severe' };
      if (total >= 21) return { label: '肯定有明显焦虑', tone: 'mod' };
      if (total >= 14) return { label: '肯定有焦虑', tone: 'mild' };
      if (total >= 7) return { label: '可能有焦虑', tone: 'watch' };
      return { label: '没有焦虑症状', tone: 'ok' };
    }
    if (scaleId === 'MADRS') {
      if (total >= 35) return { label: '极度抑郁', tone: 'severe' };
      if (total >= 30) return { label: '重度抑郁', tone: 'severe' };
      if (total >= 22) return { label: '中度抑郁', tone: 'mod' };
      if (total >= 12) return { label: '轻度抑郁', tone: 'mild' };
      return { label: '缓解期', tone: 'ok' };
    }
    return null;
  }

  function packageStats(patient) {
    const pkg = PACKAGES[patient.packageId];
    if (!pkg) return null;
    let totalItems = 0;
    let answered = 0;
    let missing = [];
    const scales = {};
    pkg.scaleIds.forEach(function (sid) {
      const st = scaleStats(patient, sid);
      scales[sid] = st;
      totalItems += st.totalItems;
      answered += st.answered;
      st.missing.forEach(function (item) {
        missing.push({ scaleId: sid, item: item });
      });
    });
    const complete = missing.length === 0;
    return {
      packageId: pkg.id,
      totalItems: totalItems,
      answered: answered,
      missing: missing,
      complete: complete,
      percent: totalItems ? Math.round((answered / totalItems) * 100) : 0,
      scales: scales
    };
  }

  function patientStatus(patient) {
    if (patient.completedAt) return 'completed';
    const pkg = PACKAGES[patient.packageId];
    if (!pkg) return 'in_progress';
    let answered = 0;
    pkg.scaleIds.forEach(function (sid) {
      answered += scaleStats(patient, sid).answered;
    });
    return answered > 0 ? 'in_progress' : 'not_started';
  }

  function safetyWarnings(patient) {
    const pkg = PACKAGES[patient.packageId];
    const out = [];
    if (!pkg) return out;
    if (pkg.scaleIds.indexOf('HAMD17') !== -1) {
      const v = answerOf(patient, 'HAMD17', 'H3');
      if (typeof v === 'number' && v >= 1) {
        out.push('HAMD-17 第3项“自杀”评分为 ' + v + ' 分，请立即进行安全评估并记录处置。');
      }
    }
    if (pkg.scaleIds.indexOf('MADRS') !== -1) {
      const v = answerOf(patient, 'MADRS', 'M10');
      if (typeof v === 'number' && v >= 1) {
        out.push('MADRS 第10项“自杀观念”评分为 ' + v + ' 分，请立即进行安全评估并记录处置。');
      }
    }
    return out;
  }

  function firstIncompleteRound(patient) {
    const pkg = PACKAGES[patient.packageId];
    if (!pkg) return 1;
    for (let i = 0; i < pkg.rounds.length; i++) {
      const r = pkg.rounds[i];
      for (let j = 0; j < r.items.length; j++) {
        const meta = ITEM_INDEX[r.items[j]];
        if (!meta) continue;
        const v = answerOf(patient, meta.scaleId, meta.item.code);
        if (v === null) return r.no;
      }
    }
    return pkg.rounds.length;
  }

  function roundOfItem(patient, scaleId, code) {
    const pkg = PACKAGES[patient.packageId];
    if (!pkg) return 1;
    for (let i = 0; i < pkg.rounds.length; i++) {
      if (pkg.rounds[i].items.indexOf(code) !== -1) return pkg.rounds[i].no;
    }
    return 1;
  }

  function scaleTotalFor(patient, scaleId) {
    const st = scaleStats(patient, scaleId);
    return st && st.complete ? st.total : null;
  }

  function formatDate(value) {
    if (!value) return '';
    return String(value);
  }

  function displayName(patient) {
    return patient.name || patient.code || '未命名';
  }

  function itemDefinitions(patient) {
    const pkg = PACKAGES[patient.packageId];
    if (!pkg) return [];
    const out = [];
    pkg.scaleIds.forEach(function (sid) {
      SCALES[sid].items.forEach(function (item) {
        out.push({ scaleId: sid, item: item });
      });
    });
    return out;
  }

  const Core = {
    nowISO: nowISO,
    todayISO: todayISO,
    nowTime: nowTime,
    uid: uid,
    getPackage: getPackage,
    getScale: getScale,
    createPatient: createPatient,
    createEmptyAnswers: createEmptyAnswers,
    findPatient: findPatient,
    ensureShape: ensureShape,
    answerOf: answerOf,
    setAnswer: setAnswer,
    getOption: getOption,
    answerLabel: answerLabel,
    scaleStats: scaleStats,
    packageStats: packageStats,
    severityOf: severityOf,
    patientStatus: patientStatus,
    safetyWarnings: safetyWarnings,
    firstIncompleteRound: firstIncompleteRound,
    roundOfItem: roundOfItem,
    scaleTotalFor: scaleTotalFor,
    formatDate: formatDate,
    displayName: displayName,
    itemDefinitions: itemDefinitions
  };

  global.Core = Core;
  if (typeof module !== 'undefined' && module.exports) module.exports = Core;
})(typeof window !== 'undefined' ? window : globalThis);
