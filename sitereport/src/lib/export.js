import ExcelJS from 'exceljs';
import { blobToDataUrl } from './image';
import { bufferToBase64, getXlsxMime, isNativePlatform, saveXlsxToFiles } from './native';

export async function exportToXlsx({ projectName, protocolDate, protocolDescription, columns, entries }) {
  const workbook = await buildWorkbook({ projectName, protocolDate, protocolDescription, columns, entries });
  const buffer = await workbook.xlsx.writeBuffer();
  const filename = buildFilename(projectName, protocolDate);
  const base64 = bufferToBase64(buffer);

  if (isNativePlatform()) {
    await saveXlsxToFiles({ filename, base64Data: base64 });
    return { filename, base64 };
  }

  const blob = new Blob([buffer], { type: getXlsxMime() });
  const url = URL.createObjectURL(blob);

  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();

  URL.revokeObjectURL(url);
  return { filename, base64 };
}

export async function exportToXlsxData({ projectName, protocolDate, protocolDescription, columns, entries }) {
  const workbook = await buildWorkbook({ projectName, protocolDate, protocolDescription, columns, entries });
  const buffer = await workbook.xlsx.writeBuffer();
  const filename = buildFilename(projectName, protocolDate);
  const base64 = bufferToBase64(buffer);
  return { filename, base64 };
}

export async function exportToXlsxShare({
  projectName,
  protocolDate,
  protocolDescription,
  columns,
  entries,
  shareFn
}) {
  const workbook = await buildWorkbook({ projectName, protocolDate, protocolDescription, columns, entries });
  const buffer = await workbook.xlsx.writeBuffer();
  const filename = buildFilename(projectName, protocolDate);
  const base64 = bufferToBase64(buffer);

  await shareFn({ filename, base64Data: base64 });
  return { filename, base64 };
}

async function buildWorkbook({ projectName, protocolDate, protocolDescription, columns, entries }) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'SiteReport';
  workbook.created = new Date();

  const worksheet = workbook.addWorksheet('Protokoll');

  const totalCols = 1 + columns.length;
  const minCellWidthPx = 160;
  const minCellHeightPx = 110;
  const maxCellWidthPx = 360;
  const maxCellHeightPx = 260;
  const colPx = (colWidth) => colWidth * 7 + 5;
  const rowPx = (rowHeightPts) => rowHeightPts * (96 / 72);
  const colWidthFromPx = (px) => Math.max(1, Math.round((px - 5) / 7));
  const rowHeightFromPx = (px) => Math.max(1, Math.round(px / (96 / 72)));
  const imageMarginPx = 0;

  worksheet.addRow([`Projekt: ${projectName || ''}`]);
  worksheet.addRow([`Datum: ${protocolDate || ''}`]);
  worksheet.addRow([`Beschreibung: ${protocolDescription || ''}`]);
  worksheet.addRow([]);

  // Merge metadata rows across full table width
  if (totalCols > 1) {
    worksheet.mergeCells(1, 1, 1, totalCols);
    worksheet.mergeCells(2, 1, 2, totalCols);
    worksheet.mergeCells(3, 1, 3, totalCols);
  }

  const headerStartRow = 5;
  const photoColumn = columns.find((c) => c.isPhoto);
  const photoColIndex = photoColumn ? columns.indexOf(photoColumn) + 2 : null;
  const photoCache = new Map();
  let maxImgW = 0;
  let maxImgH = 0;
  for (const entry of entries) {
    if (!entry.photoBlob) continue;
    const dataUrl = await blobToDataUrl(entry.photoBlob);
    const { width, height } = await getImageSize(dataUrl);
    photoCache.set(entry.id, { dataUrl, width, height });
    maxImgW = Math.max(maxImgW, width || 0);
    maxImgH = Math.max(maxImgH, height || 0);
  }
  const desiredCellWidthPx = Math.min(
    maxCellWidthPx,
    maxImgW ? Math.max(maxImgW + imageMarginPx * 2, minCellWidthPx) : minCellWidthPx
  );
  const desiredCellHeightPx = Math.min(
    maxCellHeightPx,
    Math.max(minCellHeightPx, maxImgH || minCellHeightPx)
  );
  const photoColWidth = colWidthFromPx(desiredCellWidthPx);
  const rowHeight = rowHeightFromPx(desiredCellHeightPx);
  const cellWidthPx = colPx(photoColWidth);
  const cellHeightPx = rowPx(rowHeight);
  const headerRowValues = ['Nr.', ...columns.map((col) => col.name)];

  worksheet.spliceRows(headerStartRow, 0, headerRowValues);

  const headerRow = worksheet.getRow(headerStartRow);
  for (let c = 1; c <= totalCols; c += 1) {
    const cell = headerRow.getCell(c);
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F2937' } };
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
  }
  headerRow.height = 22;

  worksheet.getColumn(1).width = 6;
  columns.forEach((col, idx) => {
    const columnIndex = idx + 2;
    worksheet.getColumn(columnIndex).width = col.isPhoto ? photoColWidth : 22;
  });


  let rowNumber = 1;
  for (const entry of entries) {
    const rowValues = [rowNumber];
    for (const col of columns) {
      if (!col.isPhoto) {
        rowValues.push(entry.fields?.[col.name] ?? '');
      } else {
        rowValues.push('');
      }
    }
    const row = worksheet.addRow(rowValues);
    row.height = rowHeight;
    row.alignment = { vertical: 'middle', horizontal: 'left', wrapText: true };

    columns.forEach((col, idx) => {
      if (col.type === 'number') {
        const cell = row.getCell(idx + 2);
        cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
      }
    });

    if (photoColIndex && entry.photoBlob) {
      const cached = photoCache.get(entry.id);
      const dataUrl = cached?.dataUrl || (await blobToDataUrl(entry.photoBlob));
      const base64 = stripDataUrlPrefix(dataUrl);
      const extension = getImageExtension(entry.photoBlob.type);
      const imageId = workbook.addImage({
        base64,
        extension
      });

      const imgW = cached?.width || 1;
      const imgH = cached?.height || 1;
      const maxW = Math.max(1, cellWidthPx - imageMarginPx * 2);
      const maxH = Math.max(1, cellHeightPx - imageMarginPx * 2);
      let scale = Math.min(maxW / imgW, maxH / imgH);
      if (!Number.isFinite(scale) || scale <= 0) {
        scale = 1;
      }
      const scaledW = imgW * scale;
      const scaledH = imgH * scale;
      const offsetXPx = (cellWidthPx - scaledW) / 2;
      const offsetYPx = (cellHeightPx - scaledH) / 2;
      const insetCol = offsetXPx / cellWidthPx;
      const insetRow = offsetYPx / cellHeightPx;

      worksheet.addImage(imageId, {
        tl: { col: photoColIndex - 1 + insetCol, row: row.number - 1 + insetRow },
        ext: { width: Math.max(1, scaledW), height: Math.max(1, scaledH) },
        editAs: 'oneCell'
      });
    }
    rowNumber += 1;
  }

  const tableRange = {
    from: { row: headerStartRow, col: 1 },
    to: { row: headerStartRow + entries.length, col: totalCols }
  };

  for (let r = tableRange.from.row; r <= tableRange.to.row; r += 1) {
    const row = worksheet.getRow(r);
    for (let c = tableRange.from.col; c <= tableRange.to.col; c += 1) {
      const cell = row.getCell(c);
      cell.border = {
        top: { style: 'thin', color: { argb: 'FFE5E7EB' } },
        left: { style: 'thin', color: { argb: 'FFE5E7EB' } },
        bottom: { style: 'thin', color: { argb: 'FFE5E7EB' } },
        right: { style: 'thin', color: { argb: 'FFE5E7EB' } }
      };
    }
  }

  return workbook;
}

function sanitizeFilename(name) {
  const clean = (name || 'protokoll').replace(/[^a-z0-9\-_. ]/gi, '_').trim();
  return clean.length ? clean : 'protokoll';
}

function buildFilename(projectName, protocolDate) {
  const namePart = sanitizeFilename(projectName);
  const datePart = sanitizeFilename(protocolDate || new Date().toISOString().slice(0, 10));
  return `${namePart}_${datePart}.xlsx`;
}

function getImageExtension(mime) {
  if (!mime) return 'jpeg';
  if (mime.includes('png')) return 'png';
  if (mime.includes('webp')) return 'webp';
  if (mime.includes('heic') || mime.includes('heif')) return 'jpeg';
  return 'jpeg';
}

function getImageSize(dataUrl) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.width || 1, height: img.height || 1 });
    img.onerror = () => resolve({ width: 1, height: 1 });
    img.src = dataUrl;
  });
}

function stripDataUrlPrefix(dataUrl) {
  const idx = dataUrl.indexOf(',');
  return idx === -1 ? dataUrl : dataUrl.slice(idx + 1);
}
