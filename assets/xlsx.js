/* ============================================================
 * 轻量 XLSX 生成器（无第三方依赖）
 * 使用 ZIP Store（不压缩）方式打包 OOXML，兼容 Excel / WPS / LibreOffice。
 * 用法：XLSXWriter.build([{ name, rows, headerRows?, widths?, filter? }]) -> Uint8Array
 * ============================================================ */
(function (global) {
  'use strict';

  const encoder = new TextEncoder();

  /* ---------- CRC32 ---------- */
  const CRC_TABLE = (function () {
    const table = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) {
        c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      }
      table[n] = c >>> 0;
    }
    return table;
  })();

  function crc32(bytes) {
    let c = 0xFFFFFFFF;
    for (let i = 0; i < bytes.length; i++) {
      c = CRC_TABLE[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
    }
    return (c ^ 0xFFFFFFFF) >>> 0;
  }

  /* ---------- ZIP（Store） ---------- */
  function zipStore(files) {
    const now = new Date();
    const dosTime = ((now.getHours() & 0x1F) << 11) | ((now.getMinutes() & 0x3F) << 5) | (Math.floor(now.getSeconds() / 2) & 0x1F);
    const dosDate = (((now.getFullYear() - 1980) & 0x7F) << 9) | (((now.getMonth() + 1) & 0x0F) << 5) | (now.getDate() & 0x1F);

    const localParts = [];
    const centralParts = [];
    let offset = 0;

    files.forEach(function (file) {
      const nameBytes = encoder.encode(file.name);
      const data = file.data;
      const crc = crc32(data);

      const local = new Uint8Array(30 + nameBytes.length);
      const lv = new DataView(local.buffer);
      lv.setUint32(0, 0x04034b50, true);
      lv.setUint16(4, 20, true);
      lv.setUint16(6, 0x0800, true);
      lv.setUint16(8, 0, true);
      lv.setUint16(10, dosTime, true);
      lv.setUint16(12, dosDate, true);
      lv.setUint32(14, crc, true);
      lv.setUint32(18, data.length, true);
      lv.setUint32(22, data.length, true);
      lv.setUint16(26, nameBytes.length, true);
      lv.setUint16(28, 0, true);
      local.set(nameBytes, 30);

      localParts.push(local, data);

      const central = new Uint8Array(46 + nameBytes.length);
      const cv = new DataView(central.buffer);
      cv.setUint32(0, 0x02014b50, true);
      cv.setUint16(4, 20, true);
      cv.setUint16(6, 20, true);
      cv.setUint16(8, 0x0800, true);
      cv.setUint16(10, 0, true);
      cv.setUint16(12, dosTime, true);
      cv.setUint16(14, dosDate, true);
      cv.setUint32(16, crc, true);
      cv.setUint32(20, data.length, true);
      cv.setUint32(24, data.length, true);
      cv.setUint16(28, nameBytes.length, true);
      cv.setUint16(30, 0, true);
      cv.setUint16(32, 0, true);
      cv.setUint16(34, 0, true);
      cv.setUint16(36, 0, true);
      cv.setUint32(38, 0, true);
      cv.setUint32(42, offset, true);
      central.set(nameBytes, 46);
      centralParts.push(central);

      offset += local.length + data.length;
    });

    let centralSize = 0;
    centralParts.forEach(function (p) { centralSize += p.length; });

    const end = new Uint8Array(22);
    const ev = new DataView(end.buffer);
    ev.setUint32(0, 0x06054b50, true);
    ev.setUint16(4, 0, true);
    ev.setUint16(6, 0, true);
    ev.setUint16(8, files.length, true);
    ev.setUint16(10, files.length, true);
    ev.setUint32(12, centralSize, true);
    ev.setUint32(16, offset, true);
    ev.setUint16(20, 0, true);

    const total = offset + centralSize + end.length;
    const out = new Uint8Array(total);
    let pos = 0;
    localParts.forEach(function (p) { out.set(p, pos); pos += p.length; });
    centralParts.forEach(function (p) { out.set(p, pos); pos += p.length; });
    out.set(end, pos);
    return out;
  }

  /* ---------- XML 工具 ---------- */
  function escapeXml(value) {
    return String(value)
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }

  function colName(index) {
    let n = index + 1;
    let s = '';
    while (n > 0) {
      const m = (n - 1) % 26;
      s = String.fromCharCode(65 + m) + s;
      n = Math.floor((n - 1) / 26);
    }
    return s;
  }

  function displayWidth(value) {
    const str = String(value);
    let w = 0;
    for (let i = 0; i < str.length; i++) {
      const code = str.charCodeAt(i);
      w += code > 255 ? 2 : 1;
    }
    return w;
  }

  function sanitizeSheetName(name, index) {
    let n = String(name || ('Sheet' + (index + 1))).replace(/[\[\]:*?\/\\]/g, ' ').trim();
    if (!n) n = 'Sheet' + (index + 1);
    if (n.length > 31) n = n.slice(0, 31);
    return n;
  }

  /* ---------- 工作表 XML ---------- */
  function sheetXml(sheet) {
    const rows = sheet.rows || [];
    const headerRows = sheet.headerRows === undefined ? 1 : sheet.headerRows;
    const maxCols = rows.reduce(function (m, r) { return Math.max(m, r.length); }, 0);

    const cols = [];
    if (sheet.widths && sheet.widths.length) {
      sheet.widths.forEach(function (w, i) {
        cols.push('<col min="' + (i + 1) + '" max="' + (i + 1) + '" width="' + w + '" customWidth="1"/>');
      });
    } else {
      for (let c = 0; c < maxCols; c++) {
        let max = 0;
        for (let r = 0; r < rows.length; r++) {
          if (rows[r][c] === undefined || rows[r][c] === null) continue;
          max = Math.max(max, displayWidth(rows[r][c]));
        }
        const width = Math.min(42, Math.max(8, max + 2));
        cols.push('<col min="' + (c + 1) + '" max="' + (c + 1) + '" width="' + width + '" customWidth="1"/>');
      }
    }

    const sheetRows = [];
    rows.forEach(function (row, rIndex) {
      const cells = [];
      row.forEach(function (cell, cIndex) {
        if (cell === undefined || cell === null || cell === '') return;
        const ref = colName(cIndex) + (rIndex + 1);
        const isHeader = rIndex < headerRows;
        const style = isHeader ? 1 : 2;
        if (typeof cell === 'number' && isFinite(cell)) {
          cells.push('<c r="' + ref + '" s="' + style + '"><v>' + cell + '</v></c>');
        } else if (typeof cell === 'boolean') {
          cells.push('<c r="' + ref + '" s="' + style + '" t="b"><v>' + (cell ? 1 : 0) + '</v></c>');
        } else {
          cells.push('<c r="' + ref + '" s="' + style + '" t="inlineStr"><is><t xml:space="preserve">' + escapeXml(cell) + '</t></is></c>');
        }
      });
      const ht = rIndex < headerRows ? ' ht="28" customHeight="1"' : '';
      sheetRows.push('<row r="' + (rIndex + 1) + '"' + ht + '>' + cells.join('') + '</row>');
    });

    const dimension = maxCols > 0 && rows.length > 0
      ? '<dimension ref="A1:' + colName(maxCols - 1) + rows.length + '"/>'
      : '<dimension ref="A1"/>';

    const freeze = sheet.freeze === false ? '' :
      '<pane ySplit="' + Math.max(1, headerRows) + '" topLeftCell="A' + (Math.max(1, headerRows) + 1) + '" activePane="bottomLeft" state="frozen"/>';

    const filter = sheet.filter
      ? '<autoFilter ref="A1:' + colName(Math.max(0, maxCols - 1)) + rows.length + '"/>'
      : '';

    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
      '<sheetViews><sheetView workbookViewId="0">' + freeze + '</sheetView></sheetViews>' +
      '<sheetFormatPr defaultRowHeight="18"/>' +
      '<cols>' + cols.join('') + '</cols>' +
      '<sheetData>' + sheetRows.join('') + '</sheetData>' +
      filter +
      '<pageMargins left="0.3" right="0.3" top="0.5" bottom="0.5" header="0.2" footer="0.2"/>' +
      '<pageSetup orientation="landscape" paperSize="9" fitToWidth="1" fitToHeight="0"/>' +
      '</worksheet>';
  }

  /* ---------- 工作簿 ---------- */
  function buildWorkbook(sheets) {
    const safeSheets = sheets.map(function (s, i) {
      return Object.assign({}, s, { _name: sanitizeSheetName(s.name, i) });
    });

    const contentTypes = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
      '<Default Extension="xml" ContentType="application/xml"/>' +
      '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
      safeSheets.map(function (s, i) {
        return '<Override PartName="/xl/worksheets/sheet' + (i + 1) + '.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>';
      }).join('') +
      '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
      '</Types>';

    const rootRels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
      '</Relationships>';

    const workbook = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" ' +
      'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
      '<bookViews><workbookView xWindow="0" yWindow="0" windowWidth="20000" windowHeight="10000"/></bookViews>' +
      '<sheets>' + safeSheets.map(function (s, i) {
        return '<sheet name="' + escapeXml(s._name) + '" sheetId="' + (i + 1) + '" r:id="rId' + (i + 1) + '"/>';
      }).join('') + '</sheets>' +
      '</workbook>';

    const workbookRels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      safeSheets.map(function (s, i) {
        return '<Relationship Id="rId' + (i + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet' + (i + 1) + '.xml"/>';
      }).join('') +
      '<Relationship Id="rId' + (safeSheets.length + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>' +
      '</Relationships>';

    const styles = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
      '<fonts count="2">' +
      '<font><sz val="11"/><color rgb="FF000000"/><name val="Calibri"/><family val="2"/></font>' +
      '<font><b/><sz val="11"/><color rgb="FF000000"/><name val="Calibri"/><family val="2"/></font>' +
      '</fonts>' +
      '<fills count="3">' +
      '<fill><patternFill patternType="none"/></fill>' +
      '<fill><patternFill patternType="gray125"/></fill>' +
      '<fill><patternFill patternType="solid"><fgColor rgb="FFE8F0F8"/><bgColor indexed="64"/></patternFill></fill>' +
      '</fills>' +
      '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>' +
      '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
      '<cellXfs count="3">' +
      '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' +
      '<xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>' +
      '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf>' +
      '</cellXfs>' +
      '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>' +
      '</styleSheet>';

    const files = [
      { name: '[Content_Types].xml', data: encoder.encode(contentTypes) },
      { name: '_rels/.rels', data: encoder.encode(rootRels) },
      { name: 'xl/workbook.xml', data: encoder.encode(workbook) },
      { name: 'xl/_rels/workbook.xml.rels', data: encoder.encode(workbookRels) },
      { name: 'xl/styles.xml', data: encoder.encode(styles) }
    ];

    safeSheets.forEach(function (s, i) {
      files.push({ name: 'xl/worksheets/sheet' + (i + 1) + '.xml', data: encoder.encode(sheetXml(s)) });
    });

    return zipStore(files);
  }

  const XLSXWriter = { build: buildWorkbook };
  global.XLSXWriter = XLSXWriter;
  if (typeof module !== 'undefined' && module.exports) module.exports = XLSXWriter;
})(typeof window !== 'undefined' ? window : globalThis);
