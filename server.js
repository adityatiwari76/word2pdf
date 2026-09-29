const express = require('express');
const multer = require('multer');
const rateLimit = require('express-rate-limit');
const { spawn } = require('child_process');
const fs = require('fs');
const fsp = fs.promises;
const os = require('os');
const path = require('path');
const { pathToFileURL } = require('url');

// ---------- Settings (override with environment variables) ----------
const PORT = process.env.PORT || 3000;
const MAX_FILE_MB = Number(process.env.MAX_FILE_MB || 20);
const MAX_CONCURRENT = Number(process.env.MAX_CONCURRENT || 2); // conversions at the same time
const CONVERT_TIMEOUT_MS = Number(process.env.CONVERT_TIMEOUT_MS || 90000);
const ALLOWED_EXT = new Set(['.doc', '.docx', '.odt', '.rtf']);

const WORK_ROOT = path.join(os.tmpdir(), 'word2pdf');
fs.mkdirSync(WORK_ROOT, { recursive: true });

// ---------- Find LibreOffice ----------
function findSoffice() {
  if (process.env.SOFFICE_PATH) return process.env.SOFFICE_PATH;
  const candidates = {
    win32: [
      'C:\\Program Files\\LibreOffice\\program\\soffice.exe',
      'C:\\Program Files (x86)\\LibreOffice\\program\\soffice.exe',
    ],
    darwin: ['/Applications/LibreOffice.app/Contents/MacOS/soffice'],
    linux: ['/usr/bin/soffice', '/usr/local/bin/soffice', '/opt/libreoffice/program/soffice'],
  }[process.platform] || [];
  return candidates.find((p) => fs.existsSync(p)) || 'soffice'; // fall back to PATH
}
const SOFFICE = findSoffice();

// ---------- Tiny job queue so the server is not overloaded ----------
let running = 0;
const waiting = [];
function acquire() {
  return new Promise((resolve) => {
    if (running < MAX_CONCURRENT) { running++; resolve(); }
    else waiting.push(resolve);
  });
}
function release() {
  const next = waiting.shift();
  if (next) next(); else running--;
}

// ---------- Run LibreOffice ----------
function convertToPdf(inputPath, outDir, profileDir) {
  return new Promise((resolve, reject) => {
    const args = [
      `-env:UserInstallation=${pathToFileURL(profileDir).href}`, // separate profile per job
      '--headless', '--norestore', '--nolockcheck',
      '--convert-to', 'pdf',
      '--outdir', outDir,
      inputPath,
    ];
    const child = spawn(SOFFICE, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stderr = '';
    child.stderr.on('data', (d) => (stderr += d));

    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error('Conversion took too long.'));
    }, CONVERT_TIMEOUT_MS);

    child.on('error', (err) => {
      clearTimeout(timer);
      reject(new Error(
        err.code === 'ENOENT'
          ? 'LibreOffice is not installed on the server.'
          : err.message
      ));
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      const pdfPath = path.join(outDir, path.parse(inputPath).name + '.pdf');
      if (code === 0 && fs.existsSync(pdfPath)) resolve(pdfPath);
      else reject(new Error('Could not convert this file. ' + stderr.slice(0, 200)));
    });
  });
}

// ---------- Upload handling ----------
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, req.jobDir),
  filename: (req, file, cb) => cb(null, 'input' + path.extname(file.originalname).toLowerCase()),
});
const upload = multer({
  storage,
  limits: { fileSize: MAX_FILE_MB * 1024 * 1024, files: 1 },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (ALLOWED_EXT.has(ext)) return cb(null, true);
    cb(new Error('UNSUPPORTED_TYPE'));
  },
});

// ---------- App ----------
const app = express();
app.set('trust proxy', 1); // needed when hosted behind a proxy (Render, Railway, Nginx...)
app.use(express.static(path.join(__dirname, 'public')));

app.get('/health', (req, res) => res.json({ ok: true }));

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30, // 30 conversions per 15 minutes per visitor
  message: { error: 'Too many conversions. Please try again in a few minutes.' },
});

// Give each request its own temporary folder
async function makeJobDir(req, res, next) {
  try {
    req.jobDir = await fsp.mkdtemp(path.join(WORK_ROOT, 'job-'));
    res.on('close', () => fsp.rm(req.jobDir, { recursive: true, force: true }).catch(() => {}));
    next();
  } catch (e) { next(e); }
}

app.post('/api/convert', limiter, makeJobDir, upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Choose a file to convert.' });

  const originalName = Buffer.from(req.file.originalname, 'latin1').toString('utf8');
  const downloadName = path.parse(originalName).name + '.pdf';
  const profileDir = path.join(req.jobDir, 'profile');

  await acquire();
  try {
    const pdfPath = await convertToPdf(req.file.path, req.jobDir, profileDir);
    res.download(pdfPath, downloadName);
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: err.message });
  } finally {
    release();
  }
});

// Friendly error messages
app.use((err, req, res, next) => {
  if (err.code === 'LIMIT_FILE_SIZE')
    return res.status(413).json({ error: `File is too large. The limit is ${MAX_FILE_MB} MB.` });
  if (err.message === 'UNSUPPORTED_TYPE')
    return res.status(400).json({ error: 'Only .doc, .docx, .odt and .rtf files are supported.' });
  console.error(err);
  res.status(500).json({ error: 'Something went wrong on the server.' });
});

app.listen(PORT, () => {
  console.log(`Word to PDF is running at http://localhost:${PORT}`);
  console.log(`Using LibreOffice at: ${SOFFICE}`);
});
