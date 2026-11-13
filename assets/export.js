/* ============================================================
 * 导出层：把患者数据整理为 Excel 工作表 / CSV 长表
 * 依赖 data.js、core.js（通过 global 访问）
 * ============================================================ */
(function (global) {
  'use strict';

  const SCALES = global.SCALES;
  const PACKAGES = global.PACKAGES;
  const Core = global.Core;

  function statusText(status) {
    if (status === 'completed') return '已完成';
    if (status === 'in_progress') return '进行中';
    return '未开始';
  }

  function pkgName(patient) {
    const pkg = PACKAGES[patient.packageId];
    return pkg ? pkg.name : patient.packageId || '';
  }

  function completionText(pkgStats) {
    return pkgStats.answered + '/' + pkgStats.totalItems + '（' + pkgStats.percent + '%）';
  }

  function totalCell(stat) {
    return stat && stat.complete ? stat.total : '';
  }

  function severityCell(stat) {
    return stat && stat.complete && stat.severity ? stat.severity.label : '';
  }

  function itemHeader(scaleId) {
    return SCALES[scaleId].items.map(function (item) {
      return item.code + ' ' + item.name;
    });
  }

  function scaleSheet(patients, scaleId) {
    const scale = SCALES[scaleId];
    const header = ['患者编号', '姓名', '性别', '年龄', '评估日期', '评估者', '量表组合', '完成状态']
      .concat(itemHeader(scaleId))
      .concat([scale.short + '总分', '严重程度', '评分备注']);
    const rows = [header];

    patients.forEach(function (patient) {
      const stat = Core.scaleStats(patient, scaleId);
      const filled = stat.answered;
      if (filled === 0) {
        // 未做该量表（例如场一未评 MADRS）仍保留一行，便于核对
        const row = [patient.code, patient.name, patient.gender, patient.age, patient.date, patient.assessor, pkgName(patient), '未评估']
          .concat(scale.items.map(function () { return ''; }))
          .concat(['', '', '']);
        rows.push(row);
        return;
      }
      const notes = [];
      if (stat.naCodes.length) notes.push('H14 不计入总分');
      const method = patient.methods && patient.methods[scaleId] && patient.methods[scaleId].H16;
      if (method) notes.push('H16 按 ' + method + ' 评定');
      if (stat.missing.length) notes.push('未评条目：' + stat.missing.map(function (i) { return i.code; }).join('、'));
      const row = [patient.code, patient.name, patient.gender, patient.age, patient.date, patient.assessor, pkgName(patient), stat.complete ? '已完成' : '进行中']
        .concat(scale.items.map(function (item) {
          const v = Core.answerOf(patient, scaleId, item.code);
          if (v === null) return '';
          if (v === 'NA') return '不计入';
          return v;
        }))
        .concat([totalCell(stat), severityCell(stat), notes.join('；')]);
      rows.push(row);
    });

    return {
      name: scale.short + ' 明细',
      rows: rows,
      filter: true
    };
  }

  function summarySheet(patients) {
    const header = ['序号', '患者编号', '姓名', '性别', '年龄', '评估日期', '评估者', '量表组合', '完成状态']
      .concat([
        '完成度',
        'HAMD-17 总分', 'HAMD-17 严重程度',
        'HAMA 总分', 'HAMA 严重程度',
        'MADRS 总分', 'MADRS 严重程度',
        '安全提示', '备注'
      ]);
    const rows = [header];
    patients.forEach(function (patient, index) {
      const pkgStats = Core.packageStats(patient);
      const scales = pkgStats ? pkgStats.scales : {};
      const warnings = Core.safetyWarnings(patient);
      const row = [
        index + 1,
        patient.code,
        patient.name,
        patient.gender,
        patient.age,
        patient.date,
        patient.assessor,
        pkgName(patient),
        statusText(Core.patientStatus(patient))
      ].concat([
        pkgStats ? completionText(pkgStats) : '',
        totalCell(scales.HAMD17), severityCell(scales.HAMD17),
        totalCell(scales.HAMA), severityCell(scales.HAMA),
        totalCell(scales.MADRS), severityCell(scales.MADRS),
        warnings.length ? warnings.join('；') : '无',
        patient.notes || ''
      ]);
      rows.push(row);
    });
    return { name: '汇总', rows: rows, widths: [6, 12, 10, 6, 6, 12, 10, 24, 9, 12, 10, 14, 8, 12, 8, 12, 48, 30], filter: true };
  }

  function longSheet(patients) {
    const header = ['患者编号', '姓名', '性别', '年龄', '评估日期', '评估者', '量表组合', '量表', '条目编码', '条目名称', '评分', '评分说明', '观察条目'];
    const rows = [header];
    patients.forEach(function (patient) {
      const pkg = PACKAGES[patient.packageId];
      if (!pkg) return;
      pkg.scaleIds.forEach(function (scaleId) {
        const scale = SCALES[scaleId];
        const stat = Core.scaleStats(patient, scaleId);
        scale.items.forEach(function (item) {
          const v = Core.answerOf(patient, scaleId, item.code);
          const method = item.kind === 'weight' && patient.methods && patient.methods[scaleId]
            ? patient.methods[scaleId][item.code] : '';
          let scoreCell = '';
          let label = '';
          if (v === 'NA') {
            scoreCell = '不计入';
            label = '不能肯定 / 不适用';
          } else if (v !== null) {
            scoreCell = v;
            label = Core.answerLabel(scaleId, item.code, v, method);
            if (method) label = '按 ' + method + ' 评定：' + label;
          }
          rows.push([
            patient.code, patient.name, patient.gender, patient.age, patient.date, patient.assessor,
            pkg.name, scale.fullName, item.code, item.name, scoreCell, label, item.observed ? '是' : ''
          ]);
        });
      });
    });
    return { name: '逐项明细-长表', rows: rows, widths: [12, 10, 6, 6, 12, 10, 26, 26, 8, 14, 8, 42, 8], filter: true };
  }

  function buildSheets(patients) {
    if (!patients || !patients.length) return [];
    return [
      summarySheet(patients),
      scaleSheet(patients, 'HAMD17'),
      scaleSheet(patients, 'HAMA'),
      scaleSheet(patients, 'MADRS'),
      longSheet(patients)
    ];
  }

  function csvEscape(value) {
    const s = value === null || value === undefined ? '' : String(value);
    if (/[",\n\r]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
    return s;
  }

  function buildLongCsv(patients) {
    const sheet = longSheet(patients);
    const lines = sheet.rows.map(function (row) {
      return row.map(csvEscape).join(',');
    });
    return '\uFEFF' + lines.join('\r\n');
  }

  function fileName(patients, ext) {
    const today = Core.todayISO();
    if (patients.length === 1) {
      const p = patients[0];
      const safe = (p.name || p.code || '患者').replace(/[\\/:*?"<>|]/g, '_');
      return '心理量表评估_' + safe + '_' + today + '.' + ext;
    }
    return '心理量表评估_全部患者_' + today + '.' + ext;
  }

  global.Exporter = {
    buildSheets: buildSheets,
    buildLongCsv: buildLongCsv,
    fileName: fileName,
    statusText: statusText
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = global.Exporter;
})(typeof window !== 'undefined' ? window : globalThis);
