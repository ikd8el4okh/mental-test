/* ============================================================
 * 医生端应用：页面渲染、评分交互、患者管理、导出
 * ============================================================ */
(function () {
  'use strict';

  const KEY = 'psy-scale-workbench-v1';
  const SCALES = window.SCALES;
  const PACKAGES = window.PACKAGES;
  const ITEM_INDEX = window.ITEM_INDEX;
  const Core = window.Core;
  const Exporter = window.Exporter;
  const XLSXWriter = window.XLSXWriter;

  const AppState = {
    data: { version: 1, patients: [], settings: { assessor: '' } },
    search: '',
    storageAvailable: true,
    pendingImport: null,
    toastTimer: null
  };

  const STATUS_META = {
    completed: { label: '已完成', cls: 'status-done' },
    in_progress: { label: '进行中', cls: 'status-progress' },
    not_started: { label: '未开始', cls: 'status-idle' }
  };

  const SCALE_SHORT = { HAMD17: 'HAMD', HAMA: 'HAMA', MADRS: 'MADRS' };

  /* ---------------- 图标 ---------------- */
  const I = {
    back: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>',
    right: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18l6-6-6-6"/></svg>',
    left: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>',
    plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M5 12h14"/></svg>',
    download: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M7 10l5 5 5-5"/><path d="M12 15V3"/></svg>',
    print: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9V2h12v7"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><path d="M6 14h12v8H6z"/></svg>',
    doc: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M9 13h6M9 17h6"/></svg>',
    trash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/></svg>',
    check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg>',
    alert: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4M12 17h.01"/></svg>',
    info: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg>',
    x: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6L6 18M6 6l12 12"/></svg>',
    search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.3-4.3"/></svg>',
    shield: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>',
    chevronDown: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg>'
  };

  /* ---------------- 工具函数 ---------------- */
  function esc(value) {
    return String(value === null || value === undefined ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function $(sel) { return document.querySelector(sel); }

  function findPatient(id) { return Core.findPatient(AppState.data.patients, id); }

  function parseRoute() {
    const raw = (location.hash || '#/').replace(/^#\/?/, '');
    const parts = raw.split('/').filter(Boolean);
    if (parts[0] === 'assess' && parts[1]) {
      const round = parseInt(parts[2], 10);
      return { view: 'assess', id: parts[1], round: isNaN(round) ? 1 : round };
    }
    if (parts[0] === 'report' && parts[1]) {
      return { view: 'report', id: parts[1] };
    }
    return { view: 'dashboard' };
  }

  function navigate(hash) {
    if (location.hash === hash) {
      render();
    } else {
      location.hash = hash;
    }
  }

  function toast(message, tone) {
    const el = $('#toast');
    if (!el) return;
    el.textContent = message;
    el.className = 'toast show' + (tone ? ' toast-' + tone : '');
    clearTimeout(AppState.toastTimer);
    AppState.toastTimer = setTimeout(function () {
      el.className = 'toast';
    }, 2600);
  }

  /* ---------------- 存储 ---------------- */
  function probeStorage() {
    try {
      localStorage.setItem(KEY + '.probe', '1');
      localStorage.removeItem(KEY + '.probe');
      return true;
    } catch (e) {
      return false;
    }
  }

  function load() {
    AppState.storageAvailable = probeStorage();
    if (!AppState.storageAvailable) return;
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (parsed && Array.isArray(parsed.patients)) {
        AppState.data = parsed;
      }
    } catch (e) {
      console.warn('读取本地数据失败', e);
    }
    if (!AppState.data.patients) AppState.data.patients = [];
    if (!AppState.data.settings) AppState.data.settings = { assessor: '' };
    AppState.data.patients.forEach(Core.ensureShape);
  }

  function save() {
    AppState.data.updatedAt = Core.nowISO();
    if (!AppState.storageAvailable) return false;
    try {
      localStorage.setItem(KEY, JSON.stringify(AppState.data));
      return true;
    } catch (e) {
      AppState.storageAvailable = false;
      updateSaveState();
      return false;
    }
  }

  function updateSaveState() {
    const el = $('#save-state');
    if (!el) return;
    el.textContent = AppState.storageAvailable
      ? '已自动保存 ' + Core.nowTime()
      : '本地存储不可用，数据仅保留在当前页面';
    el.classList.toggle('save-error', !AppState.storageAvailable);
  }

  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1200);
  }

  function exportPatients(patients, format) {
    if (!patients || !patients.length) {
      toast('没有可导出的患者数据', 'warn');
      return;
    }
    if (format === 'csv') {
      const csv = Exporter.buildLongCsv(patients);
      downloadBlob(new Blob([csv], { type: 'text/csv;charset=utf-8' }), Exporter.fileName(patients, 'csv'));
      toast('CSV 长表已导出', 'success');
      return;
    }
    const sheets = Exporter.buildSheets(patients);
    const bytes = XLSXWriter.build(sheets);
    downloadBlob(new Blob([bytes], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    }), Exporter.fileName(patients, 'xlsx'));
    toast('Excel 已导出（含汇总、三表明细与逐项长表）', 'success');
  }

  /* ---------------- 患者与评分辅助 ---------------- */
  function roundDone(patient, round) {
    if (!round.items.length) {
      const pkgStats = Core.packageStats(patient);
      return !!(pkgStats && pkgStats.complete);
    }
    return round.items.every(function (code) {
      const meta = ITEM_INDEX[code];
      return meta && Core.answerOf(patient, meta.scaleId, meta.item.code) !== null;
    });
  }

  function autoCode() {
    const used = {};
    AppState.data.patients.forEach(function (p) { used[p.code] = true; });
    let n = AppState.data.patients.length + 1;
    let code = 'P' + String(n).padStart(3, '0');
    while (used[code]) {
      n += 1;
      code = 'P' + String(n).padStart(3, '0');
    }
    return code;
  }

  function patientMeta(pkg) {
    return pkg.tag + ' · ' + pkg.name;
  }

  function statusBadge(patient) {
    const st = Core.patientStatus(patient);
    const meta = STATUS_META[st] || STATUS_META.not_started;
    return '<span class="status-badge ' + meta.cls + '">' + meta.label + '</span>';
  }

  function totalChips(patient) {
    const pkg = PACKAGES[patient.packageId];
    if (!pkg) return '';
    return pkg.scaleIds.map(function (sid) {
      const st = Core.scaleStats(patient, sid);
      const total = st.complete ? st.total : '—';
      const title = st.complete && st.severity ? sid + '：' + st.total + ' 分（' + st.severity.label + '）' : sid + '：未完成';
      return '<span class="total-chip' + (st.complete ? '' : ' is-muted') + '" title="' + esc(title) + '">' +
        SCALE_SHORT[sid] + ' <b>' + total + '</b></span>';
    }).join('');
  }

  /* ---------------- 渲染：整体 ---------------- */
  function render() {
    const route = parseRoute();
    if (route.view === 'assess') {
      const patient = findPatient(route.id);
      if (!patient) { navigate('#/'); return; }
      renderAssess(patient, route.round);
    } else if (route.view === 'report') {
      const patient = findPatient(route.id);
      if (!patient) { navigate('#/'); return; }
      renderReport(patient);
    } else {
      renderDashboard();
    }
    window.scrollTo(0, 0);
  }

  /* ---------------- 渲染：主页 ---------------- */
  function renderDashboard() {
    const patients = AppState.data.patients;
    const completed = patients.filter(function (p) { return !!p.completedAt; }).length;
    const inProgress = patients.length - completed;

    $('#app').innerHTML =
      topbarHtml() +
      '<main class="page">' +
        '<section class="overview-stats">' +
          '<div class="stat"><b>' + patients.length + '</b><span>患者记录</span></div>' +
          '<div class="stat"><b>' + completed + '</b><span>已完成</span></div>' +
          '<div class="stat"><b>' + inProgress + '</b><span>进行中</span></div>' +
          '<div class="stat"><b>3</b><span>量表</span></div>' +
        '</section>' +

        (AppState.storageAvailable ? '' :
          '<div class="alert alert-warn storage-warning">' + I.alert +
          '<div><b>当前浏览器无法使用本地存储</b><span>刷新或关闭页面后数据会丢失，请及时导出 Excel 备份。</span></div></div>') +

        '<section class="package-section">' +
          '<div class="section-head"><h2>选择评估组合</h2></div>' +
          '<div class="pkg-grid">' + PACKAGES_LIST.map(pkgCardHtml).join('') + '</div>' +
        '</section>' +

        '<section class="records">' +
          '<div class="section-head records-head">' +
            '<div><h2>患者记录</h2><p id="records-stats">' + recordsStatsText() + '</p></div>' +
            '<div class="search-box">' + I.search + '<input id="patient-search" type="search" placeholder="搜索姓名 / 编号 / 评估者" value="' + esc(AppState.search) + '" autocomplete="off"></div>' +
          '</div>' +
          '<div id="records-area">' + recordsAreaHtml() + '</div>' +
        '</section>' +

        '<section class="guide-grid">' +
          '<div class="guide-card"><span class="guide-icon">1</span><h3>评估流程</h3><p>选择组合 → 填写患者信息 → 按轮次念话术并评分 → 第 14 轮核对 → 查看汇总并导出。评分随点随存。</p></div>' +
          '<div class="guide-card"><span class="guide-icon">2</span><h3>条目与观察</h3><p>HAMD-17 共 17 项（52 分）、HAMA 共 14 项（56 分）、MADRS 共 10 项（60 分）。H8、H9、A14、M1 为观察条目，在观察轮统一评分。</p></div>' +
          '<div class="guide-card"><span class="guide-icon">3</span><h3>数据与隐私</h3><p>数据仅保存在本机浏览器，不上传服务器。可备份 / 导入 JSON；Excel 导出包含汇总、三表逐项明细与逐项长表。</p></div>' +
        '</section>' +
      '</main>' +
      '<footer class="app-footer"><p>' + esc(window.APP_INFO.disclaimer) + '</p><p class="footer-meta">' + esc(window.APP_INFO.title) + ' v' + esc(window.APP_INFO.version) + ' · 数据存储于本机浏览器</p></footer>';
  }

  const PACKAGES_LIST = window.PACKAGE_ORDER.map(function (id) { return PACKAGES[id]; });

  function pkgCardHtml(pkg) {
    const isFull = pkg.id === 'pkg_full';
    const scales = pkg.scaleIds.map(function (sid) {
      const s = SCALES[sid];
      return '<li><span class="scale-key" style="background:' + s.accent + '"></span><b>' + s.short + '</b><span>' + s.name + '</span><em>' + s.items.length + ' 项</em></li>';
    }).join('');
    return '<article class="pkg-card ' + (isFull ? 'pkg-full' : 'pkg-first') + '">' +
      '<div class="pkg-card-top"><span class="pkg-tag">' + pkg.tag + '</span><span class="pkg-time">' + pkg.time + '</span></div>' +
      '<h3>' + pkg.name + '</h3>' +
      '<p class="pkg-desc">' + pkg.desc + '</p>' +
      '<ul class="pkg-scales">' + scales + '</ul>' +
      '<div class="pkg-foot"><span>' + pkg.rounds.length + ' 轮访谈 · ' + pkg.itemCount + ' 个评分条目</span>' +
        '<button class="btn btn-primary" data-action="new-patient" data-pkg="' + pkg.id + '">' + I.plus + '新建评估</button></div>' +
      '</article>';
  }

  function recordsStatsText() {
    const patients = AppState.data.patients;
    const completed = patients.filter(function (p) { return !!p.completedAt; }).length;
    return '共 ' + patients.length + ' 位患者 · 已完成 ' + completed + ' · 进行中 ' + (patients.length - completed);
  }

  function filteredPatients() {
    const q = AppState.search.trim().toLowerCase();
    const list = AppState.data.patients.slice().sort(function (a, b) {
      return String(b.updatedAt || '').localeCompare(String(a.updatedAt || ''));
    });
    if (!q) return list;
    return list.filter(function (p) {
      return [p.name, p.code, p.assessor, p.gender, p.date].join(' ').toLowerCase().indexOf(q) !== -1;
    });
  }

  function rowActionsHtml(p) {
    return '<div class="row-actions">' +
      '<button class="icon-btn" title="继续评估" aria-label="继续评估" data-action="continue" data-id="' + p.id + '">' + I.right + '</button>' +
      '<button class="icon-btn" title="查看报告" aria-label="查看报告" data-action="report" data-id="' + p.id + '">' + I.doc + '</button>' +
      '<button class="icon-btn" title="导出该患者 Excel" aria-label="导出该患者 Excel" data-action="export-one" data-id="' + p.id + '">' + I.download + '</button>' +
      '<button class="icon-btn danger" title="删除患者" aria-label="删除患者" data-action="delete-patient" data-id="' + p.id + '">' + I.trash + '</button>' +
    '</div>';
  }

  function recordsAreaHtml() {
    const list = filteredPatients();
    if (!AppState.data.patients.length) {
      return '<div class="empty-state">' +
        '<div class="empty-icon">' + I.doc + '</div>' +
        '<h3>还没有患者记录</h3>' +
        '<p>从上方选择评估组合，创建第一位患者后即可开始逐轮访谈评分。</p>' +
        '</div>';
    }
    if (!list.length) {
      return '<div class="empty-state small"><h3>没有匹配的患者</h3><p>试试其他姓名、编号或评估者关键词。</p></div>';
    }
    const rows = list.map(function (p) {
      const pkg = PACKAGES[p.packageId];
      const stats = Core.packageStats(p);
      const avatar = (p.name || '患').slice(0, 1);
      return '<tr>' +
        '<td><div class="patient-cell"><span class="avatar">' + esc(avatar) + '</span><div><b>' + esc(p.name || '未命名') + '</b><span>' + esc(p.code || '—') + ' · ' + esc(p.gender || '—') +
          (p.age ? ' · ' + esc(p.age) + ' 岁' : '') + '</span></div></div></td>' +
        '<td><span class="pkg-pill ' + (pkg && pkg.id === 'pkg_full' ? 'is-full' : '') + '">' + esc(patientMeta(pkg)) + '</span></td>' +
        '<td class="date-cell">' + esc(p.date || '—') + '</td>' +
        '<td><div class="mini-progress"><span style="width:' + stats.percent + '%"></span></div><span class="mini-progress-text">' + stats.answered + '/' + stats.totalItems + '</span></td>' +
        '<td><div class="total-chips">' + totalChips(p) + '</div></td>' +
        '<td>' + statusBadge(p) + '</td>' +
        '<td>' + rowActionsHtml(p) + '</td>' +
      '</tr>';
    }).join('');

    const cards = list.map(function (p) {
      const pkg = PACKAGES[p.packageId];
      const stats = Core.packageStats(p);
      const avatar = (p.name || '患').slice(0, 1);
      return '<article class="record-card">' +
        '<div class="record-card-head">' +
          '<div class="patient-cell"><span class="avatar">' + esc(avatar) + '</span><div><b>' + esc(p.name || '未命名') + '</b><span>' + esc(p.code || '—') + ' · ' + esc(p.gender || '—') +
            (p.age ? ' · ' + esc(p.age) + ' 岁' : '') + '</span></div></div>' +
          statusBadge(p) +
        '</div>' +
        '<div class="record-card-meta"><span class="pkg-pill ' + (pkg && pkg.id === 'pkg_full' ? 'is-full' : '') + '">' + esc(patientMeta(pkg)) + '</span><span>' + esc(p.date || '—') + '</span></div>' +
        '<div class="record-card-progress"><div class="mini-progress"><span style="width:' + stats.percent + '%"></span></div><span class="mini-progress-text">' + stats.answered + '/' + stats.totalItems + ' 项</span></div>' +
        '<div class="record-card-foot"><div class="total-chips">' + totalChips(p) + '</div>' + rowActionsHtml(p) + '</div>' +
      '</article>';
    }).join('');

    return '<div class="table-scroll desktop-records"><table class="records-table">' +
      '<thead><tr><th>患者</th><th>量表组合</th><th>评估日期</th><th>完成度</th><th>总分</th><th>状态</th><th class="actions-col">操作</th></tr></thead>' +
      '<tbody>' + rows + '</tbody></table></div>' +
      '<div class="record-cards mobile-records">' + cards + '</div>';
  }

  function updateRecordsTable() {
    const area = $('#records-area');
    if (area) area.innerHTML = recordsAreaHtml();
    const stats = $('#records-stats');
    if (stats) stats.textContent = recordsStatsText();
  }

  function topbarHtml() {
    return '<header class="topbar">' +
      '<div class="brand"><span class="brand-mark">量</span><div class="brand-text"><h1>' + esc(window.APP_INFO.title) + '</h1><p>' + esc(window.APP_INFO.subtitle) + '</p></div></div>' +
      '<div class="topbar-actions">' +
        '<div class="menu-wrap">' +
          '<button class="btn btn-ghost" data-action="toggle-menu">数据管理 ' + I.chevronDown + '</button>' +
          '<div class="menu" id="data-menu" hidden>' +
            '<button data-action="export-csv">' + I.download + '导出 CSV（长表）</button>' +
            '<button data-action="backup-json">' + I.doc + '备份数据（JSON）</button>' +
            '<button data-action="import-json">' + I.doc + '导入备份（JSON）</button>' +
            '<div class="menu-sep"></div>' +
            '<button data-action="load-demo">载入演示数据</button>' +
            '<button class="danger" data-action="clear-all">' + I.trash + '清空全部数据</button>' +
          '</div>' +
        '</div>' +
        '<button class="btn btn-primary" data-action="export-excel">' + I.download + '导出全部 Excel</button>' +
      '</div>' +
    '</header>';
  }

  /* ---------------- 渲染：评估页 ---------------- */
  function renderAssess(patient, requestedRound) {
    const pkg = PACKAGES[patient.packageId];
    if (!pkg) { toast('患者数据缺少量表组合', 'error'); navigate('#/'); return; }
    const rounds = pkg.rounds;
    const idx = Math.min(Math.max(requestedRound || 1, 1), rounds.length);
    const round = rounds[idx - 1];
    if (patient.currentRound !== idx) {
      patient.currentRound = idx;
      save();
    }
    const pkgStats = Core.packageStats(patient);
    const scaleStats = pkgStats.scales;

    $('#app').innerHTML =
      '<header class="topbar compact">' +
        '<button class="btn btn-ghost back-btn" data-action="go-dashboard">' + I.back + '返回列表</button>' +
        '<div class="assess-info">' +
          '<span class="pkg-tag">' + pkg.tag + '</span>' +
          '<strong>' + esc(Core.displayName(patient)) + '</strong>' +
          (patient.code ? '<span class="pid">' + esc(patient.code) + '</span>' : '') +
          '<span class="assess-pkg">' + esc(pkg.name) + '</span>' +
        '</div>' +
        '<div class="assess-tools">' +
          '<span class="save-state" id="save-state">' + (AppState.storageAvailable ? '已自动保存 ' + Core.nowTime() : '本地存储不可用') + '</span>' +
          '<button class="btn btn-ghost" data-action="report">查看汇总</button>' +
        '</div>' +
      '</header>' +

      '<div class="assess-progress">' +
        '<div class="stepper" role="tablist" aria-label="评估轮次">' + stepperHtml(patient, pkg, idx) + '</div>' +
        '<div class="progress-row">' +
          '<div class="progress-track"><span id="progress-fill" style="width:' + pkgStats.percent + '%"></span></div>' +
          '<span class="progress-label" id="progress-text">已完成 <b>' + pkgStats.answered + '</b>/' + pkgStats.totalItems + ' 项 · 第 ' + idx + '/' + rounds.length + ' 轮</span>' +
        '</div>' +
      '</div>' +

      '<main class="assess-main">' +
        '<section class="script-panel">' +
          '<div class="panel-top"><span class="eyebrow">评估者自然话术</span><span class="round-chip">第 ' + round.no + ' / ' + rounds.length + ' 轮</span></div>' +
          '<blockquote class="script">' + esc(round.script) + '</blockquote>' +
          (round.example && round.example !== '—'
            ? '<details class="example-box"><summary>患者示例回答 <span>参考，不必逐字念</span></summary><p>' + esc(round.example) + '</p></details>'
            : '') +
          '<div class="coverage"><span class="coverage-label">覆盖条目</span><div class="chips">' + coverageChips(round) + '</div></div>' +
          (round.hints || []).map(function (hint) {
            return '<div class="hint">' + I.alert + '<span>' + esc(hint) + '</span></div>';
          }).join('') +
          '<div class="script-tip">' + I.info + '<span>先自然提问并倾听，再根据回答与观察在右侧完成评分；评分会自动保存。</span></div>' +
        '</section>' +

        '<section class="items-panel">' +
          '<div class="items-head"><div><h2>' + (round.items.length ? '对应条目与评分' : '核对与完成') + '</h2>' +
            '<p>' + (round.items.length ? '本页 ' + round.items.length + ' 个条目，逐项选择最符合的评分。' : '本页无新增评分条目，请核对完成情况。') + '</p></div>' +
            (round.observation ? '<span class="obs-badge">观察评分页</span>' : '') +
          '</div>' +
          (round.items.length
            ? round.items.map(function (code) { return itemCardHtml(patient, code); }).join('')
            : summaryPanelHtml(patient, pkg, scaleStats)) +
        '</section>' +
      '</main>' +

      '<footer class="assess-footer">' +
        '<button class="btn btn-ghost" data-action="prev-round"' + (idx === 1 ? ' disabled' : '') + '>' + I.left + '上一轮</button>' +
        '<div class="footer-center"><span>第 ' + idx + ' / ' + rounds.length + ' 轮</span><small>评分自动保存在本机浏览器</small></div>' +
        '<button class="btn ' + (idx === rounds.length ? 'btn-primary' : 'btn-secondary') + '" data-action="next-round">' +
          (idx === rounds.length ? '查看汇总' : '下一轮') + (idx === rounds.length ? '' : I.right) + '</button>' +
      '</footer>';
  }

  function stepperHtml(patient, pkg, current) {
    return pkg.rounds.map(function (round) {
      const done = roundDone(patient, round);
      const cls = round.no === current ? 'current' : (done ? 'done' : '');
      const label = round.no === current ? '当前第 ' + round.no + ' 轮' : '第 ' + round.no + ' 轮';
      return '<button class="step ' + cls + '" role="tab" aria-selected="' + (round.no === current) + '" data-action="goto-round" data-round="' + round.no + '" title="' + label + '">' +
        (done && round.no !== current ? I.check : '<span>' + round.no + '</span>') + '</button>';
    }).join('');
  }

  function coverageChips(round) {
    if (!round.items.length) {
      return '<span class="chip chip-muted">' + esc(round.coverage) + '</span>';
    }
    return round.items.map(function (code) {
      const meta = ITEM_INDEX[code];
      const scale = SCALES[meta.scaleId];
      return '<span class="chip scale-chip" style="--accent:' + scale.accent + '">' + code + ' ' + esc(meta.item.name) + '</span>';
    }).join('');
  }

  function itemCardHtml(patient, code) {
    const meta = ITEM_INDEX[code];
    const scale = SCALES[meta.scaleId];
    const item = meta.item;
    const value = Core.answerOf(patient, meta.scaleId, code);
    const method = (patient.methods[meta.scaleId] && patient.methods[meta.scaleId][code]) || '';
    let options = '';
    if (item.kind === 'weight') {
      options = '<div class="options-wrap weight">' + Object.keys(item.methods).map(function (m) {
        const group = item.methods[m];
        const selectedMethod = method || 'A';
        return '<div class="weight-group"><div class="weight-label">' + esc(group.label) + '</div><div class="options">' +
          group.options.map(function (opt) {
            const selected = value === opt.v && selectedMethod === m;
            return optionBtn(meta.scaleId, code, opt, selected, m);
          }).join('') + '</div></div>';
      }).join('') + '</div>';
    } else {
      const compact = meta.scaleId === 'HAMA' ? ' opts-compact' : '';
      options = '<div class="options' + compact + '" role="radiogroup" aria-label="' + esc(code + ' ' + item.name) + '">' +
        item.options.map(function (opt) {
          return optionBtn(meta.scaleId, code, opt, value === opt.v, '');
        }).join('') + '</div>';
    }

    let current = '<span class="muted">尚未评分</span>';
    if (value === 'NA') {
      current = '<b>不计入总分</b><span class="muted"> · 不能肯定 / 不适用</span>';
    } else if (value !== null) {
      const label = Core.answerLabel(meta.scaleId, code, value, method);
      current = '当前 <b>' + value + ' 分</b><span class="muted"> · ' + esc(label) + '</span>' +
        (method ? '<span class="method-tag">按 ' + esc(method) + ' 评定</span>' : '');
    }

    return '<article class="item-card scale-' + meta.scaleId + '" id="item-' + code + '" data-code="' + code + '">' +
      '<div class="item-head">' +
        '<span class="code-chip" style="--accent:' + scale.accent + '">' + code + '</span>' +
        '<div class="item-title">' +
          '<div class="item-name">' + esc(item.name) + '<span class="scale-label">' + scale.short + '</span>' +
            (item.observed ? '<span class="obs-badge">观察</span>' : '') + '</div>' +
          (item.desc ? '<p class="item-desc">' + esc(item.desc) + '</p>' : '') +
        '</div>' +
        '<span class="item-max">0—' + item.max + ' 分</span>' +
      '</div>' +
      options +
      '<div class="item-current">' + current + '</div>' +
    '</article>';
  }

  function optionBtn(scaleId, code, opt, selected, method) {
    return '<button type="button" class="opt' + (selected ? ' selected' : '') + '" role="radio" aria-checked="' + selected + '"' +
      ' data-action="score" data-scale="' + scaleId + '" data-code="' + code + '" data-value="' + esc(String(opt.v)) + '"' +
      (method ? ' data-method="' + method + '"' : '') + '>' +
      '<span class="opt-num">' + (opt.v === 'NA' ? '—' : opt.v) + '</span>' +
      '<span class="opt-text">' + esc(opt.t) + '</span>' +
    '</button>';
  }

  function summaryPanelHtml(patient, pkg, scaleStats) {
    const pkgStats = Core.packageStats(patient);
    const warnings = Core.safetyWarnings(patient);
    const scales = pkg.scaleIds.map(function (sid) {
      const scale = SCALES[sid];
      const st = scaleStats[sid];
      const missing = st.missing.map(function (item) {
        const roundNo = Core.roundOfItem(patient, sid, item.code);
        return '<button class="chip chip-missing" data-action="goto-round" data-round="' + roundNo + '" title="前往第 ' + roundNo + ' 轮补评">' +
          item.code + ' ' + esc(item.name) + '</button>';
      }).join('');
      return '<div class="summary-scale">' +
        '<div class="summary-scale-head">' +
          '<span class="scale-dot" style="background:' + scale.accent + '"></span>' +
          '<b>' + scale.short + '</b>' +
          '<span class="summary-total">' + (st.complete ? st.total : '—') + ' <small>/ ' + st.maxScore + '</small></span>' +
          (st.complete && st.severity ? '<span class="severity-badge tone-' + st.severity.tone + '">' + st.severity.label + '</span>' : '<span class="severity-badge tone-idle">待完成</span>') +
        '</div>' +
        '<div class="progress-track slim"><span style="width:' + Math.round((st.answered / st.totalItems) * 100) + '%"></span></div>' +
        '<div class="summary-scale-meta">已评 ' + st.answered + '/' + st.totalItems + ' 项' +
          (st.naCodes.length ? ' · 不计入 ' + st.naCodes.join('、') : '') + '</div>' +
        (missing ? '<div class="missing-row"><span>未评：</span>' + missing + '</div>' : '') +
      '</div>';
    }).join('');

    const canComplete = pkgStats.complete && !patient.completedAt;
    return '<div class="summary-panel">' +
      '<div class="summary-title"><h3>核对三表完成情况</h3><p>' + (pkgStats.complete ? '所有条目已评分，可完成评估并查看汇总报告。' : '仍有 ' + pkgStats.missing.length + ' 项未评分，点击未评条目可直接跳转补评。') + '</p></div>' +
      scales +
      (warnings.length ? '<div class="alert alert-danger">' + I.alert + '<div>' + warnings.map(function (w) { return '<p>' + esc(w) + '</p>'; }).join('') + '</div></div>' : '') +
      '<div class="summary-actions">' +
        (patient.completedAt
          ? '<button class="btn btn-primary" data-action="report">查看汇总报告</button>'
          : '<button class="btn btn-primary" data-action="complete-assessment"' + (canComplete ? '' : ' disabled') + '>完成评估并查看报告</button>') +
        '<button class="btn btn-ghost" data-action="report">先看汇总</button>' +
      '</div>' +
      (pkgStats.complete ? '' : '<p class="summary-note">提示：完成全部条目后，“完成评估”按钮才会启用。</p>') +
    '</div>';
  }

  /* ---------------- 评分交互 ---------------- */
  function handleScore(btn) {
    const route = parseRoute();
    const patient = findPatient(route.id);
    if (!patient) return;
    const scaleId = btn.dataset.scale;
    const code = btn.dataset.code;
    const raw = btn.dataset.value;
    const method = btn.dataset.method || '';
    const value = raw === 'NA' ? 'NA' : Number(raw);
    Core.setAnswer(patient, scaleId, code, value, method || null);
    save();

    const card = btn.closest('.item-card');
    if (card) card.outerHTML = itemCardHtml(patient, code);
    updateProgressUI(patient);
  }

  function updateProgressUI(patient) {
    const pkg = PACKAGES[patient.packageId];
    if (!pkg) return;
    const pkgStats = Core.packageStats(patient);
    const route = parseRoute();
    const idx = route.view === 'assess' ? route.round : patient.currentRound;

    const fill = $('#progress-fill');
    if (fill) fill.style.width = pkgStats.percent + '%';
    const text = $('#progress-text');
    if (text) text.innerHTML = '已完成 <b>' + pkgStats.answered + '</b>/' + pkgStats.totalItems + ' 项 · 第 ' + idx + '/' + pkg.rounds.length + ' 轮';

    document.querySelectorAll('.stepper .step').forEach(function (stepBtn) {
      const round = pkg.rounds[parseInt(stepBtn.dataset.round, 10) - 1];
      if (!round) return;
      const done = roundDone(patient, round);
      stepBtn.classList.toggle('done', done && round.no !== idx);
      stepBtn.classList.toggle('current', round.no === idx);
      stepBtn.innerHTML = (done && round.no !== idx) ? I.check : '<span>' + round.no + '</span>';
    });
    updateSaveState();
  }

  /* ---------------- 渲染：报告页 ---------------- */
  function renderReport(patient) {
    const pkg = PACKAGES[patient.packageId];
    if (!pkg) { toast('患者数据缺少量表组合', 'error'); navigate('#/'); return; }
    const pkgStats = Core.packageStats(patient);
    const warnings = Core.safetyWarnings(patient);

    const cards = pkg.scaleIds.map(function (sid) {
      const scale = SCALES[sid];
      const st = pkgStats.scales[sid];
      const tone = st.complete && st.severity ? st.severity.tone : 'idle';
      return '<div class="score-card tone-' + tone + '">' +
        '<div class="score-card-head"><span class="score-scale">' + scale.short + '</span><span class="score-status">' + (st.complete ? '已完成' : '未完成') + '</span></div>' +
        '<div class="score-number">' + (st.complete ? st.total : '—') + '<small>/ ' + st.maxScore + '</small></div>' +
        '<div class="score-bottom">' +
          (st.complete && st.severity ? '<span class="severity-badge tone-' + st.severity.tone + '">' + st.severity.label + '</span>' : '<span class="severity-badge tone-idle">待完成</span>') +
          '<span class="score-count">已评 ' + st.answered + '/' + st.totalItems + '</span>' +
        '</div>' +
      '</div>';
    }).join('');

    const details = pkg.scaleIds.map(function (sid) {
      return reportScaleSection(patient, sid, pkgStats.scales[sid]);
    }).join('');

    const missing = pkgStats.missing;
    const missingBox = missing.length
      ? '<div class="alert alert-warn no-print">' + I.alert +
          '<div><b>还有 ' + missing.length + ' 项未评分</b><span>完成全部条目后可出具完整报告。</span>' +
          '<div class="missing-row">' + missing.map(function (m) {
            const rn = Core.roundOfItem(patient, m.scaleId, m.item.code);
            return '<button class="chip chip-missing" data-action="goto-round" data-round="' + rn + '">' + m.item.code + ' ' + esc(m.item.name) + '</button>';
          }).join('') + '</div></div></div>'
      : '';

    const canMarkComplete = pkgStats.complete && !patient.completedAt;

    $('#app').innerHTML =
      '<header class="topbar compact no-print">' +
        '<button class="btn btn-ghost back-btn" data-action="go-dashboard">' + I.back + '返回列表</button>' +
        '<div class="assess-info"><span class="pkg-tag">' + pkg.tag + '</span><strong>' + esc(Core.displayName(patient)) + '</strong>' +
          (patient.code ? '<span class="pid">' + esc(patient.code) + '</span>' : '') +
          '<span class="assess-pkg">评估报告</span></div>' +
        '<div class="assess-tools">' +
          '<button class="btn btn-ghost" data-action="print-report">' + I.print + '打印</button>' +
          '<button class="btn btn-primary" data-action="export-one" data-id="' + patient.id + '">' + I.download + '导出 Excel</button>' +
        '</div>' +
      '</header>' +

      '<main class="page report-page">' +
        missingBox +
        '<article class="report" id="print-report">' +
          '<header class="report-head">' +
            '<div class="report-brand">' + esc(window.APP_INFO.title) + ' · 评估报告</div>' +
            '<div class="report-name-row"><h1>' + esc(Core.displayName(patient)) + '</h1>' + statusBadge(patient) + '</div>' +
            '<div class="report-meta">' +
              '<span><em>患者编号</em>' + esc(patient.code || '—') + '</span>' +
              '<span><em>性别</em>' + esc(patient.gender || '—') + '</span>' +
              '<span><em>年龄</em>' + (patient.age ? esc(patient.age) + ' 岁' : '—') + '</span>' +
              '<span><em>评估日期</em>' + esc(patient.date || '—') + '</span>' +
              '<span><em>评估者</em>' + esc(patient.assessor || '—') + '</span>' +
              '<span><em>量表组合</em>' + esc(pkg.name) + '</span>' +
            '</div>' +
          '</header>' +
          '<section class="score-grid' + (pkg.scaleIds.length === 2 ? ' cols-2' : '') + '">' + cards + '</section>' +
          (warnings.length ? '<div class="alert alert-danger report-safety">' + I.alert + '<div>' + warnings.map(function (w) { return '<p>' + esc(w) + '</p>'; }).join('') + '</div></div>' : '') +
          '<section class="report-details">' + details + '</section>' +
          '<footer class="report-foot">' +
            '<div class="report-notes">' + pkg.scaleIds.map(function (sid) {
              const scale = SCALES[sid];
              return '<p><b>' + scale.short + '：</b>' + scale.note + '</p>';
            }).join('') + '</div>' +
            '<p class="disclaimer">' + esc(window.APP_INFO.disclaimer) + '</p>' +
            '<div class="report-sign"><span>报告生成时间：' + Core.nowISO().slice(0, 16).replace('T', ' ') + '</span><span>工具版本：v' + esc(window.APP_INFO.version) + '</span></div>' +
          '</footer>' +
        '</article>' +
        '<div class="report-actions no-print">' +
          (canMarkComplete ? '<button class="btn btn-primary" data-action="mark-complete">' + I.check + '标记为已完成</button>' : '') +
          (!pkgStats.complete ? '<button class="btn btn-secondary" data-action="continue" data-id="' + patient.id + '">继续评估（第 ' + Core.firstIncompleteRound(patient) + ' 轮）</button>' : '') +
          '<button class="btn btn-ghost" data-action="print-report">' + I.print + '打印报告</button>' +
          '<button class="btn btn-ghost" data-action="go-dashboard">返回患者列表</button>' +
        '</div>' +
      '</main>';
  }

  function reportScaleSection(patient, sid, stat) {
    const scale = SCALES[sid];
    const rows = scale.items.map(function (item) {
      const value = Core.answerOf(patient, sid, item.code);
      const method = (patient.methods[sid] && patient.methods[sid][item.code]) || '';
      let scoreCell;
      let labelCell;
      let rowCls = '';
      if (value === 'NA') {
        scoreCell = '<span class="score-na">不计入</span>';
        labelCell = '不能肯定 / 不适用';
      } else if (value === null) {
        scoreCell = '<span class="score-missing">未评</span>';
        labelCell = '—';
        rowCls = ' class="is-missing"';
      } else {
        scoreCell = '<b>' + value + '</b>';
        labelCell = Core.answerLabel(sid, item.code, value, method);
        if (method) labelCell = '按 ' + method + ' 评定：' + labelCell;
      }
      return '<tr' + rowCls + '><td><span class="code-inline">' + item.code + '</span>' + esc(item.name) + (item.observed ? '<span class="obs-inline">观察</span>' : '') + '</td>' +
        '<td class="score-cell">' + scoreCell + '</td><td class="label-cell">' + esc(labelCell) + '</td></tr>';
    }).join('');

    return '<section class="report-scale">' +
      '<div class="report-scale-head">' +
        '<div class="scale-title"><span class="scale-dot" style="background:' + scale.accent + '"></span><h3>' + scale.fullName + '</h3></div>' +
        '<div class="scale-result">' +
          '<span class="scale-total">' + (stat.complete ? stat.total : '—') + ' <small>/ ' + stat.maxScore + ' 分</small></span>' +
          (stat.complete && stat.severity ? '<span class="severity-badge tone-' + stat.severity.tone + '">' + stat.severity.label + '</span>' : '<span class="severity-badge tone-idle">未完成</span>') +
        '</div>' +
      '</div>' +
      '<table class="score-table"><thead><tr><th>条目</th><th class="score-col">评分</th><th>评分说明</th></tr></thead><tbody>' + rows + '</tbody></table>' +
      '<p class="scale-note">' + esc(scale.note) + '</p>' +
    '</section>';
  }

  /* ---------------- 弹窗 ---------------- */
  function openModal(html) {
    const root = $('#modal-root');
    root.innerHTML = '<div class="modal-backdrop"><div class="modal" role="dialog" aria-modal="true">' + html + '</div></div>';
    document.body.classList.add('modal-open');
    const first = root.querySelector('input, select, button');
    if (first) setTimeout(function () { first.focus(); }, 30);
  }

  function closeModal() {
    const root = $('#modal-root');
    if (!root.innerHTML) return;
    root.innerHTML = '';
    document.body.classList.remove('modal-open');
  }

  function openNewPatient(pkgId) {
    const pkg = PACKAGES[pkgId];
    if (!pkg) return;
    openModal(
      '<div class="modal-head"><div><h3>新建评估</h3><p>' + esc(pkg.tag + ' · ' + pkg.name + ' · ' + pkg.rounds.length + ' 轮 · ' + pkg.itemCount + ' 项') + '</p></div>' +
        '<button class="icon-btn" data-action="close-modal" aria-label="关闭">' + I.x + '</button></div>' +
      '<form id="new-patient-form" data-pkg="' + pkgId + '">' +
        '<div class="modal-body">' +
          '<div class="form-grid">' +
            '<label class="field"><span>患者姓名 <i>*</i></span><input name="name" required placeholder="请输入姓名" maxlength="30"></label>' +
            '<label class="field"><span>患者编号</span><input name="code" placeholder="留空自动生成" maxlength="30"></label>' +
            '<label class="field"><span>性别</span><select name="gender"><option value="">未填写</option><option>男</option><option>女</option></select></label>' +
            '<label class="field"><span>年龄</span><input name="age" type="number" min="0" max="120" placeholder="岁"></label>' +
            '<label class="field"><span>评估日期 <i>*</i></span><input name="date" type="date" required value="' + Core.todayISO() + '"></label>' +
            '<label class="field"><span>评估者</span><input name="assessor" placeholder="医生 / 评估员姓名" maxlength="30" value="' + esc(AppState.data.settings.assessor || '') + '"></label>' +
          '</div>' +
          '<p class="form-note">' + I.info + '<span>创建后从第 1 轮开始；评分与进度会自动保存在本机浏览器。</span></p>' +
        '</div>' +
        '<div class="modal-foot"><button type="button" class="btn btn-ghost" data-action="close-modal">取消</button>' +
          '<button type="submit" class="btn btn-primary">创建并开始评估</button></div>' +
      '</form>'
    );
  }

  function openConfirm(opts) {
    openModal(
      '<div class="modal-head"><div><h3>' + esc(opts.title) + '</h3></div>' +
        '<button class="icon-btn" data-action="close-modal" aria-label="关闭">' + I.x + '</button></div>' +
      '<div class="modal-body"><p class="confirm-text">' + opts.message + '</p></div>' +
      '<div class="modal-foot"><button class="btn btn-ghost" data-action="close-modal">取消</button>' +
        '<button class="btn ' + (opts.danger ? 'btn-danger' : 'btn-primary') + '" data-action="' + opts.action + '"' +
        (opts.patientId ? ' data-id="' + opts.patientId + '"' : '') + '>' + esc(opts.confirmLabel) + '</button></div>'
    );
  }

  function createPatientFromForm(form) {
    const data = new FormData(form);
    const pkgId = form.dataset.pkg;
    const pkg = PACKAGES[pkgId];
    if (!pkg) return;
    const name = String(data.get('name') || '').trim();
    if (!name) { toast('请填写患者姓名', 'warn'); return; }
    const code = String(data.get('code') || '').trim() || autoCode();
    const patient = Core.createPatient({
      name: name,
      code: code,
      gender: String(data.get('gender') || ''),
      age: String(data.get('age') || ''),
      date: String(data.get('date') || Core.todayISO()),
      assessor: String(data.get('assessor') || '').trim(),
      packageId: pkgId
    });
    patient.currentRound = 1;
    AppState.data.patients.push(patient);
    AppState.data.settings.assessor = patient.assessor || AppState.data.settings.assessor || '';
    save();
    closeModal();
    toast('已创建评估：' + patient.name + '（' + pkg.tag + '）', 'success');
    navigate('#/assess/' + patient.id + '/1');
  }

  function deletePatient(id) {
    const patient = findPatient(id);
    if (!patient) return;
    AppState.data.patients = AppState.data.patients.filter(function (p) { return p.id !== id; });
    save();
    closeModal();
    toast('已删除患者记录：' + (patient.name || '未命名'), 'success');
    const route = parseRoute();
    if (route.id === id) navigate('#/'); else { updateRecordsTable(); }
  }

  function importJsonFile(file) {
    const reader = new FileReader();
    reader.onload = function () {
      try {
        const parsed = JSON.parse(String(reader.result));
        const rawList = Array.isArray(parsed) ? parsed : (parsed && Array.isArray(parsed.patients) ? parsed.patients : null);
        if (!rawList) throw new Error('文件不是有效的备份格式');
        const list = normalizeImportedPatients(rawList);
        if (!list.length) throw new Error('备份中没有可导入的患者记录');
        AppState.pendingImport = list;
        openConfirm({
          title: '导入备份',
          message: '将导入 <b>' + list.length + '</b> 位患者，并<b>覆盖</b>当前 ' + AppState.data.patients.length + ' 位患者的本地记录。是否继续？',
          confirmLabel: '覆盖并导入',
          action: 'confirm-import',
          danger: true
        });
      } catch (e) {
        toast('导入失败：' + e.message, 'error');
      }
    };
    reader.readAsText(file, 'utf-8');
  }

  function normalizeImportedPatients(rawList) {
    const seen = {};
    const list = [];
    rawList.forEach(function (raw) {
      if (!raw || typeof raw !== 'object') return;
      if (!PACKAGES[raw.packageId]) return;
      const p = Core.createPatient({
        name: raw.name,
        code: raw.code,
        gender: raw.gender,
        age: raw.age,
        date: raw.date,
        assessor: raw.assessor,
        packageId: raw.packageId
      });
      p.answers = raw.answers && typeof raw.answers === 'object' ? raw.answers : Core.createEmptyAnswers();
      p.methods = raw.methods && typeof raw.methods === 'object' ? raw.methods : { HAMD17: {}, HAMA: {}, MADRS: {} };
      p.completedAt = raw.completedAt || null;
      p.currentRound = raw.currentRound || 1;
      p.notes = raw.notes || '';
      p.createdAt = raw.createdAt || p.createdAt;
      p.updatedAt = raw.updatedAt || p.updatedAt;
      Core.ensureShape(p);
      sanitizeImportedAnswers(p);
      if (!p.name && !p.code) return;
      let id = raw.id ? String(raw.id) : p.id;
      if (!/^[A-Za-z0-9_-]{1,64}$/.test(id) || seen[id]) id = p.id;
      seen[id] = true;
      p.id = id;
      list.push(p);
    });
    return list;
  }

  function sanitizeImportedAnswers(patient) {
    const cleanAnswers = {};
    const cleanMethods = {};
    window.SCALE_ORDER.forEach(function (sid) {
      const rawAns = (patient.answers && patient.answers[sid]) || {};
      const rawMethods = (patient.methods && patient.methods[sid]) || {};
      const clean = {};
      const methods = {};
      window.SCALES[sid].items.forEach(function (item) {
        const value = rawAns[item.code];
        if (item.kind === 'weight') {
          const method = rawMethods[item.code] === 'B' ? 'B' : 'A';
          if (typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= item.max) {
            clean[item.code] = value;
            methods[item.code] = method;
          }
          return;
        }
        if (value === 'NA' && item.code === 'H14') {
          clean[item.code] = 'NA';
          return;
        }
        if (typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= item.max) {
          clean[item.code] = value;
        }
      });
      cleanAnswers[sid] = clean;
      cleanMethods[sid] = methods;
    });
    patient.answers = cleanAnswers;
    patient.methods = cleanMethods;
  }

  function backupJson() {
    const payload = {
      app: 'psy-scale-workbench',
      version: 1,
      exportedAt: Core.nowISO(),
      patients: AppState.data.patients
    };
    downloadBlob(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json;charset=utf-8' }), '心理量表评估_备份_' + Core.todayISO() + '.json');
    toast('备份 JSON 已导出', 'success');
  }

  /* ---------------- 演示数据 ---------------- */
  function fillAnswers(patient, map) {
    Object.keys(map).forEach(function (sid) {
      const values = map[sid];
      Object.keys(values).forEach(function (code) {
        Core.setAnswer(patient, sid, code, values[code], values[code + '_method'] || null);
      });
    });
  }

  function loadDemoPatients() {
    const today = Core.todayISO();
    const a = Core.createPatient({
      name: '张伟（演示）', code: 'DEMO-001', gender: '男', age: '42', date: today,
      assessor: '演示医生', packageId: 'pkg_hamd_hama'
    });
    fillAnswers(a, {
      HAMD17: {
        H1: 2, H2: 1, H3: 1, H4: 2, H5: 2, H6: 1, H7: 2, H8: 2, H9: 0,
        H10: 1, H11: 2, H12: 1, H13: 1, H14: 1, H15: 1, H16: 1, H17: 1, H16_method: 'B'
      },
      HAMA: { A1: 2, A2: 2, A3: 1, A4: 2, A5: 2, A6: 2, A7: 2, A8: 1, A9: 1, A10: 1, A11: 2, A12: 1, A13: 2, A14: 1 }
    });
    a.completedAt = Core.nowISO();
    a.currentRound = 14;

    const b = Core.createPatient({
      name: '李敏（演示）', code: 'DEMO-002', gender: '女', age: '35', date: today,
      assessor: '演示医生', packageId: 'pkg_full'
    });
    fillAnswers(b, {
      HAMD17: {
        H1: 2, H2: 1, H3: 1, H4: 1, H5: 1, H6: 1, H7: 2, H8: 1, H9: 1,
        H10: 1, H11: 1, H12: 1, H13: 1, H14: 1, H15: 1, H16: 1, H17: 1, H16_method: 'A'
      },
      HAMA: { A1: 2, A2: 2, A3: 2, A4: 1, A5: 1, A6: 2, A7: 2, A8: 1, A9: 1, A10: 1, A11: 2, A12: 1, A13: 2, A14: 1 },
      MADRS: { M1: 4, M2: 4, M3: 2, M4: 4, M5: 2, M7: 2, M8: 2 }
    });
    b.currentRound = 8;

    AppState.data.patients.push(a, b);
    save();
    renderDashboard();
    toast('已载入 2 位演示患者，可用于熟悉流程', 'success');
  }

  /* ---------------- 事件 ---------------- */
  function onClick(event) {
    const menu = document.querySelector('.menu');
    if (menu && !menu.hidden && !event.target.closest('.menu-wrap')) menu.hidden = true;

    const actionEl = event.target.closest('[data-action]');
    if (!actionEl) {
      if (event.target.classList && event.target.classList.contains('modal-backdrop')) closeModal();
      return;
    }
    const action = actionEl.dataset.action;

    if (action === 'score') {
      event.preventDefault();
      handleScore(actionEl);
      return;
    }

    const route = parseRoute();
    const routePatient = route.id ? findPatient(route.id) : null;

    switch (action) {
      case 'new-patient':
        openNewPatient(actionEl.dataset.pkg);
        break;
      case 'close-modal':
        closeModal();
        break;
      case 'go-dashboard':
        navigate('#/');
        break;
      case 'toggle-menu': {
        const m = document.querySelector('.menu');
        if (m) m.hidden = !m.hidden;
        break;
      }
      case 'goto-round':
        if (route.view === 'assess') {
          navigate('#/assess/' + route.id + '/' + actionEl.dataset.round);
        } else if (routePatient) {
          navigate('#/assess/' + routePatient.id + '/' + actionEl.dataset.round);
        }
        break;
      case 'prev-round':
        if (route.view === 'assess' && route.round > 1) {
          navigate('#/assess/' + route.id + '/' + (route.round - 1));
        }
        break;
      case 'next-round': {
        if (route.view !== 'assess') break;
        const pkg = PACKAGES[routePatient.packageId];
        const idx = Math.min(Math.max(route.round, 1), pkg.rounds.length);
        if (idx >= pkg.rounds.length) navigate('#/report/' + route.id);
        else navigate('#/assess/' + route.id + '/' + (idx + 1));
        break;
      }
      case 'report':
        if (routePatient) navigate('#/report/' + routePatient.id);
        else if (actionEl.dataset.id) navigate('#/report/' + actionEl.dataset.id);
        break;
      case 'continue': {
        const p = findPatient(actionEl.dataset.id) || routePatient;
        if (!p) break;
        navigate('#/assess/' + p.id + '/' + Core.firstIncompleteRound(p));
        break;
      }
      case 'complete-assessment': {
        if (!routePatient) break;
        const pkgStats = Core.packageStats(routePatient);
        if (!pkgStats.complete) {
          toast('还有 ' + pkgStats.missing.length + ' 项未评分，暂时不能完成', 'warn');
          break;
        }
        if (!routePatient.completedAt) {
          routePatient.completedAt = Core.nowISO();
          routePatient.updatedAt = Core.nowISO();
          save();
          toast('评估已完成', 'success');
        }
        navigate('#/report/' + routePatient.id);
        break;
      }
      case 'mark-complete': {
        if (!routePatient) break;
        routePatient.completedAt = Core.nowISO();
        routePatient.updatedAt = Core.nowISO();
        save();
        toast('已标记为完成', 'success');
        renderReport(routePatient);
        break;
      }
      case 'print-report':
        window.print();
        break;
      case 'export-one': {
        const p = findPatient(actionEl.dataset.id);
        if (p) exportPatients([p], 'xlsx');
        break;
      }
      case 'export-excel':
        exportPatients(AppState.data.patients, 'xlsx');
        break;
      case 'export-csv':
        exportPatients(AppState.data.patients, 'csv');
        break;
      case 'backup-json':
        backupJson();
        break;
      case 'import-json': {
        const input = $('#import-file');
        if (input) { input.value = ''; input.click(); }
        break;
      }
      case 'load-demo':
        loadDemoPatients();
        break;
      case 'delete-patient': {
        const p = findPatient(actionEl.dataset.id);
        if (!p) break;
        openConfirm({
          title: '删除患者记录',
          message: '确定删除 <b>' + esc(Core.displayName(p)) + '</b> 的全部评估记录吗？该操作不可撤销，建议先导出备份。',
          confirmLabel: '确认删除',
          action: 'confirm-delete',
          patientId: p.id,
          danger: true
        });
        break;
      }
      case 'confirm-delete':
        deletePatient(actionEl.dataset.id);
        break;
      case 'clear-all':
        openConfirm({
          title: '清空全部数据',
          message: '将删除本机浏览器中的全部 <b>' + AppState.data.patients.length + '</b> 位患者记录，且不可恢复。建议先导出 Excel 或备份 JSON。',
          confirmLabel: '确认清空',
          action: 'confirm-clear',
          danger: true
        });
        break;
      case 'confirm-clear':
        AppState.data.patients = [];
        save();
        closeModal();
        toast('已清空全部数据', 'success');
        navigate('#/');
        break;
      case 'confirm-import':
        if (AppState.pendingImport) {
          AppState.data.patients = AppState.pendingImport;
          AppState.pendingImport = null;
          save();
          closeModal();
          toast('备份已导入', 'success');
          navigate('#/');
        }
        break;
      default:
        break;
    }
  }

  function onSubmit(event) {
    if (event.target && event.target.id === 'new-patient-form') {
      event.preventDefault();
      createPatientFromForm(event.target);
    }
  }

  function onInput(event) {
    if (event.target && event.target.id === 'patient-search') {
      AppState.search = event.target.value;
      updateRecordsTable();
    }
  }

  function onKeydown(event) {
    if (event.key === 'Escape') closeModal();
  }

  function boot() {
    load();
    document.addEventListener('click', onClick);
    document.addEventListener('submit', onSubmit);
    document.addEventListener('input', onInput);
    document.addEventListener('keydown', onKeydown);
    const fileInput = $('#import-file');
    if (fileInput) {
      fileInput.addEventListener('change', function () {
        if (fileInput.files && fileInput.files[0]) importJsonFile(fileInput.files[0]);
      });
    }
    window.addEventListener('hashchange', render);
    render();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
