const MAX_MB = 20;
const ALLOWED = ['doc', 'docx', 'odt', 'rtf'];
const BLUE = '#2f5bea';
const RED = '#ce2f1b';
const MIN_WORKING_MS = 1100; // keeps the scanning animation visible even for fast conversions

const $ = (id) => document.getElementById(id);
const fileInput = $('fileInput'), front = $('front'), back = $('back');
const headline = $('headline'), lead = $('lead'), ghost = $('ghost'), badge = $('badge');
const frontTitle = $('frontTitle'), frontSub = $('frontSub');
const backTitle = $('backTitle'), backSub = $('backSub');
const errorEl = $('error'), statusEl = $('status');
const convertBtn = $('convertBtn'), downloadLink = $('downloadLink'), resetBtn = $('resetBtn');
const themeMeta = document.querySelector('meta[name="theme-color"]');
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const COPY = {
  idle:    { h: 'Word in.\nPDF out.',
             p: 'Drop in a Word file and get a PDF back in seconds. No sign-up, and your file is deleted the moment it is converted.',
             s: '' },
  ready:   { h: 'Word in.\nPDF out.',
             p: 'Your file is only used to make the PDF, then it is deleted. Ready when you are.',
             s: 'File selected.' },
  working: { h: 'Converting\nyour file.',
             p: 'This usually takes a few seconds.',
             s: 'Converting your file.' },
  done:    { h: 'Your PDF\nis ready.',
             p: 'Download it below. Nothing is kept on our server.',
             s: 'Conversion finished. Your PDF is ready to download.' },
};

let state = 'idle', file = null, pdfUrl = null;

const ext = (name) => name.split('.').pop().toLowerCase();
const fmtSize = (b) => (b < 1024 * 1024 ? Math.max(1, Math.round(b / 1024)) + ' KB' : (b / 1024 / 1024).toFixed(1) + ' MB');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function setState(next) {
  state = next;
  document.body.dataset.state = next;
  headline.textContent = COPY[next].h;
  lead.textContent = COPY[next].p;
  statusEl.textContent = COPY[next].s;
  themeMeta.content = next === 'done' ? RED : BLUE;
  fileInput.disabled = next === 'working';
  front.setAttribute('aria-hidden', String(next === 'done'));
  back.setAttribute('aria-hidden', String(next !== 'done'));
}

function showError(msg) {
  errorEl.textContent = msg;
  errorEl.hidden = !msg;
}

function setFile(f) {
  showError('');
  if (!f) return;
  if (!ALLOWED.includes(ext(f.name))) return showError('Only .doc, .docx, .odt and .rtf files are supported.');
  if (f.size > MAX_MB * 1024 * 1024) return showError(`This file is larger than ${MAX_MB} MB.`);

  file = f;
  const type = ext(f.name).toUpperCase();
  badge.textContent = type;
  ghost.textContent = type;
  frontTitle.textContent = f.name;
  frontSub.textContent = `${fmtSize(f.size)}. Choose a different file any time.`;
  setState('ready');
}

function reset() {
  if (pdfUrl) URL.revokeObjectURL(pdfUrl);
  pdfUrl = null; file = null; fileInput.value = '';
  badge.textContent = 'DOCX';
  ghost.textContent = 'DOCX';
  frontTitle.textContent = 'Drop a Word file here';
  frontSub.textContent = 'or tap to browse. .doc, .docx, .odt and .rtf, up to 20 MB.';
  showError('');
  setState('idle');
}

fileInput.addEventListener('change', () => setFile(fileInput.files[0]));
resetBtn.addEventListener('click', reset);

convertBtn.addEventListener('click', async () => {
  if (!file) return;
  showError('');
  setState('working');
  const started = Date.now();

  const form = new FormData();
  form.append('file', file);

  try {
    const res = await fetch('/api/convert', { method: 'POST', body: form });
    if (!res.ok) {
      let msg = 'Conversion failed. Please try again.';
      try { msg = (await res.json()).error || msg; } catch {}
      throw new Error(msg);
    }
    const blob = await res.blob();

    const wait = MIN_WORKING_MS - (Date.now() - started);
    if (wait > 0 && !reduceMotion) await sleep(wait);

    if (pdfUrl) URL.revokeObjectURL(pdfUrl);
    pdfUrl = URL.createObjectURL(blob);
    const pdfName = file.name.replace(/\.[^.]+$/, '') + '.pdf';
    downloadLink.href = pdfUrl;
    downloadLink.download = pdfName;
    backTitle.textContent = pdfName;
    backSub.textContent = `${fmtSize(blob.size)}. Ready to download.`;
    ghost.textContent = 'PDF';
    setState('done');
  } catch (err) {
    showError(err.message);
    setState('ready');
  }
});

/* ---------- Drag and drop anywhere on the page ---------- */
let dragDepth = 0;
const hasFiles = (e) => e.dataTransfer && Array.from(e.dataTransfer.types || []).includes('Files');

window.addEventListener('dragenter', (e) => {
  if (!hasFiles(e)) return;
  dragDepth++;
  document.body.classList.add('dragging');
});
window.addEventListener('dragleave', (e) => {
  if (!hasFiles(e)) return;
  dragDepth = Math.max(0, dragDepth - 1);
  if (dragDepth === 0) document.body.classList.remove('dragging');
});
window.addEventListener('dragover', (e) => { if (hasFiles(e)) e.preventDefault(); });
window.addEventListener('drop', (e) => {
  e.preventDefault();
  dragDepth = 0;
  document.body.classList.remove('dragging');
  if (state === 'working') return;
  const f = e.dataTransfer && e.dataTransfer.files[0];
  if (!f) return;
  if (state === 'done') reset();
  setFile(f);
});
