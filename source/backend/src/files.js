const express = require('express');

/* Shared rules for every file people upload: student submissions (US-14) and
   the files lecturers attach to assignments and announcements.

   SRS-22: the limits. MAX_UPLOAD_MB is per file; one upload request has its
   own cap so it stays well under MySQL's 64 MB packet limit. */
const MAX_MB = Number(process.env.MAX_UPLOAD_MB) || 10;
const MAX_FILES = 10;
const MAX_TOTAL_MB = 25;
const MAX_LINKS = 5;
const MB = 1024 * 1024;

/* What each allowed type is sent back as. The type comes from the file
   name here on the server - never from what the browser claimed - so a file
   cannot pretend to be a web page. */
const MIME = {
  pdf: 'application/pdf',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  ppt: 'application/vnd.ms-powerpoint',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  zip: 'application/zip',
  txt: 'text/plain; charset=utf-8',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
};
const TYPES = Object.keys(MIME);

/* The browser can show these itself, so "Open" shows them in a new tab like
   Google Drive does. Everything else is downloaded. */
const VIEWABLE = ['pdf', 'txt', 'png', 'jpg', 'jpeg'];

const LIMITS = { maxMb: MAX_MB, maxFiles: MAX_FILES, maxTotalMb: MAX_TOTAL_MB, maxLinks: MAX_LINKS,
                 types: TYPES, viewable: VIEWABLE };

const extOf = (name) => (String(name).toLowerCase().match(/\.([a-z0-9]+)$/) || [])[1] || '';

/** A file name that is safe to store and to send back in a header. */
function cleanName(raw) {
  const name = String(raw || '').replace(/[\\/]/g, '_').replace(/[\u0000-\u001f"]/g, '').trim();
  return name.slice(-200);                // keep the end, it has the extension
}

/**
 * Files arrive as one JSON body, { files: [{ name, data }], ... }, with data
 * in base64. It has its own content type so the app-wide JSON parser (100 KB)
 * leaves it alone and this one reads it with room for the whole upload.
 * Too big -> 413 with the limits, not a generic server error.
 */
const UPLOAD_TYPE = 'application/vnd.ku-upload+json';
const parser = express.json({ type: UPLOAD_TYPE, limit: Math.ceil(MAX_TOTAL_MB * 1.4) * MB });
function readUpload(req, res, next) {
  parser(req, res, (err) => {
    if (err && err.type === 'entity.too.large') {
      return res.status(413).json({ error: `The files add up to more than ${MAX_TOTAL_MB} MB`, limits: LIMITS });
    }
    next(err);
  });
}

/**
 * Checks every file before anything is saved. Returns { error } or { files },
 * where each file is { name, mime, data }.
 */
function checkFiles(incoming, { allowEmpty = false } = {}) {
  const list = Array.isArray(incoming) ? incoming : [];
  if (!list.length && !allowEmpty) return { error: 'Choose at least one file' };
  if (list.length > MAX_FILES) return { error: `You can upload up to ${MAX_FILES} files at once` };

  const files = [];
  const seen = new Set();
  let total = 0;
  for (const f of list) {
    const name = cleanName(f && f.name);
    const data = Buffer.from(String((f && f.data) || ''), 'base64');
    const ext = extOf(name);
    if (!name) return { error: 'Every file needs a name' };
    if (!TYPES.includes(ext)) return { error: `"${name}" is not an allowed type. Use ${TYPES.join(', ')}` };
    if (!data.length) return { error: `"${name}" is empty` };
    if (data.length > MAX_MB * MB) return { error: `"${name}" is larger than ${MAX_MB} MB` };
    if (seen.has(name.toLowerCase())) return { error: `Two files are called "${name}"` };
    seen.add(name.toLowerCase());
    total += data.length;
    files.push({ name, mime: MIME[ext], data });
  }
  if (total > MAX_TOTAL_MB * MB) return { error: `The files add up to more than ${MAX_TOTAL_MB} MB` };
  return { files };
}

/**
 * Checks links (Google Drive, YouTube, GitHub ...). Only web links, http or
 * https - never javascript: or anything else a click could run.
 * Returns { error } or { links }, each link as { url, site }.
 */
function checkLinks(incoming, max = MAX_LINKS) {
  const list = Array.isArray(incoming) ? incoming : [];
  if (list.length > max) return { error: `You can add up to ${max} links` };
  const links = [];
  for (const raw of list) {
    const text = String(raw || '').trim();
    let url;
    try { url = new URL(text); } catch { return { error: `"${text.slice(0, 60)}" is not a valid link` }; }
    if (!['http:', 'https:'].includes(url.protocol)) return { error: 'Links must start with http:// or https://' };
    if (url.href.length > 2000) return { error: 'That link is too long' };
    if (!links.some(l => l.url === url.href)) links.push({ url: url.href, site: url.hostname.slice(0, 200) });
  }
  return { links };
}

/**
 * Sends a stored file. ?view=1 opens it in the browser when the browser can
 * show that type; otherwise, and always for other types, it downloads.
 */
function sendFile(req, res, row) {
  const ext = extOf(row.file_name);
  const inline = req.query.view === '1' && VIEWABLE.includes(ext);
  res.setHeader('Content-Type', MIME[ext] || 'application/octet-stream');
  res.setHeader('Content-Length', row.content.length);
  res.setHeader('Content-Disposition',
    `${inline ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(row.file_name)}`);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.end(row.content);
}

module.exports = { LIMITS, UPLOAD_TYPE, readUpload, checkFiles, checkLinks, sendFile, cleanName, extOf };
