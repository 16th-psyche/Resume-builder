/* =========================================================
   app.js – ResumeForge Logic  (all 20 fixes applied)
   ========================================================= */

// ── State ─────────────────────────────────────────────────
let currentStep = 0;
let currentTemplate = 'classic';
let skills = [];
let experiences = [];
let educations = [];
let zoomLevel = 0.80;
let photoDataUrl = null;
let currentColor = '#1C1C1E';

// Guards / timers
let _isLoading = false;
let _nextId = 1;
let _toastTimer = null;
let _isGenerating = false;
let _saveTimer = null;      // debounce save (#15)
let _previewTimer = null;      // debounce preview
let _savedStateBefore = null;  // undo snapshot (#4)
let _expSortable = null;
let _eduSortable = null;

const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

// ── Sample data (#7) ──────────────────────────────────────
const SAMPLE_DATA = {
  firstName: 'Alex', lastName: 'Morgan',
  jobTitle: 'Senior Product Designer',
  email: 'alex.morgan@email.com', phone: '+1 (555) 234-5678',
  location: 'San Francisco, CA', website: 'https://alexmorgan.design',
  linkedin: 'linkedin.com/in/alexmorgan',
  summary: 'Creative and user-focused Product Designer with 6+ years of experience crafting intuitive digital experiences. Proven track record of leading end-to-end design processes that increase user engagement and drive measurable business outcomes.',
  skills: ['Figma', 'User Research', 'Prototyping', 'Design Systems', 'UX Writing', 'Usability Testing', 'React', 'Agile'],
  experiences: [
    { id: 900, position: 'Senior Product Designer', company: 'Stripe', startDate: '2021-03', endDate: '', current: true, description: '• Led redesign of the Stripe Dashboard, improving task completion rate by 34%\n• Managed a cross-functional team of 4 designers across 3 product verticals\n• Established and maintained a company-wide Design System used by 200+ engineers' },
    { id: 901, position: 'Product Designer', company: 'Airbnb', startDate: '2018-07', endDate: '2021-02', current: false, description: '• Designed end-to-end host onboarding flow, reducing drop-off by 22%\n• Conducted 60+ user interviews and synthesised insights into product decisions' },
  ],
  educations: [
    { id: 902, institution: 'Carnegie Mellon University', degree: 'Master of Human-Computer Interaction', field: '', startDate: '2016-09', endDate: '2018-05', gpa: '3.9 / 4.0' },
    { id: 903, institution: 'UC Berkeley', degree: 'Bachelor of Arts', field: 'Cognitive Science', startDate: '2012-09', endDate: '2016-05', gpa: '' },
  ],
};

// ── Helpers ───────────────────────────────────────────────
function nextId() { return _nextId++; }
function getExpById(id) { return experiences.find(e => e.id === id); }
function getEduById(id) { return educations.find(e => e.id === id); }

function san(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function isValidPhotoDataUrl(url) {
  if (!url || typeof url !== 'string') return false;
  return /^data:image\/(jpeg|png|webp|gif);base64,/.test(url);
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  const parts = dateStr.split('-');
  if (parts.length < 2) return dateStr;
  const month = parseInt(parts[1], 10);
  if (month < 1 || month > 12) return dateStr;
  return ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][month - 1] + ' ' + parts[0];
}

function formatDesc(text) {
  if (!text) return '';
  const lines = text.split('\n').map(l => l.replace(/^•\s*/, '').trim()).filter(Boolean);
  if (lines.length <= 1) return `<p class="entry-description">${san(lines[0] || '')}</p>`;
  return `<div class="entry-description"><ul>${lines.map(l => `<li>${san(l)}</li>`).join('')}</ul></div>`;
}

// ── Progress bar (#2) ─────────────────────────────────────
function updateProgressBar(index) {
  const fill = document.getElementById('stepProgressFill');
  const label = document.getElementById('stepProgressLabel');
  const total = document.querySelectorAll('.step-panel').length || 5;
  if (fill) fill.style.width = `${((index + 1) / total) * 100}%`;
  if (label) label.textContent = `Step ${index + 1} of ${total}`;
  const bar = fill && fill.closest('[role="progressbar"]');
  if (bar) bar.setAttribute('aria-valuenow', index + 1);
}

// ── Step Navigation ───────────────────────────────────────
function goToStep(index) {
  const panels = document.querySelectorAll('.step-panel');
  const btns = document.querySelectorAll('.step-btn');
  if (index < 0 || index >= panels.length) return;

  const exitingPanel = panels[currentStep];
  exitingPanel.classList.remove('active');
  exitingPanel.style.transform = index > currentStep ? 'translateX(-30px)' : 'translateX(30px)';
  setTimeout(() => { exitingPanel.style.transform = ''; }, 300);

  currentStep = index;
  panels[currentStep].classList.add('active');
  panels[currentStep].style.transform = 'translateX(0)';

  btns.forEach((btn, i) => {
    btn.classList.toggle('active', i === currentStep);
    btn.setAttribute('aria-selected', String(i === currentStep));
    btn.setAttribute('tabindex', i === currentStep ? '0' : '-1');
  });

  updateProgressBar(currentStep);
  updatePreview();
}

// ── ARIA keyboard nav for step tabs (#18) ─────────────────
function initStepNavKeyboard() {
  const nav = document.getElementById('stepsNav');
  if (!nav) return;
  nav.addEventListener('keydown', e => {
    const btns = [...nav.querySelectorAll('.step-btn')];
    const idx = btns.indexOf(document.activeElement);
    if (idx === -1) return;
    if (e.key === 'ArrowRight') { e.preventDefault(); const n = Math.min(idx + 1, btns.length - 1); goToStep(n); btns[n].focus(); }
    if (e.key === 'ArrowLeft') { e.preventDefault(); const n = Math.max(idx - 1, 0); goToStep(n); btns[n].focus(); }
    if (e.key === 'Home') { e.preventDefault(); goToStep(0); btns[0].focus(); }
    if (e.key === 'End') { e.preventDefault(); goToStep(btns.length - 1); btns[btns.length - 1].focus(); }
  });
}

// ── Experience ────────────────────────────────────────────
function addExperience() {
  experiences.push({ id: nextId(), company: '', position: '', startDate: '', endDate: '', current: false, description: '' });
  renderExperiences();
  const list = document.getElementById('experienceList');
  const last = list.querySelector('.entry-card:last-child');
  if (last) last.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function removeExperience(id) {
  experiences = experiences.filter(e => e.id !== id);
  renderExperiences();
  updatePreview();
}

function updateExpField(id, field, value) {
  const exp = getExpById(id);
  if (exp) { exp[field] = value; scheduledPreview(); }
}

function toggleExpCurrent(id, checked) {
  const exp = getExpById(id);
  if (!exp) return;
  exp.current = checked;
  const endInput = document.getElementById('expEnd-' + id);
  if (endInput) endInput.disabled = checked;
  if (checked) exp.endDate = '';
  updatePreview();
}

function reorderExperiences(oldIndex, newIndex) {
  const [item] = experiences.splice(oldIndex, 1);
  experiences.splice(newIndex, 0, item);
  debouncedSave();
  updatePreview();
}

function renderExperiences() {
  const container = document.getElementById('experienceList');
  if (experiences.length === 0) {
    container.innerHTML = `<div class="empty-placeholder" style="min-height:120px"><p>No experience added yet. Click "Add Experience" below.</p></div>`;
    initExpSortable(); return;
  }
  container.innerHTML = experiences.map((exp, idx) => `
    <div class="entry-card" id="expCard-${exp.id}" data-id="${exp.id}">
      <div class="entry-card-header">
        <div style="display:flex;align-items:center;gap:8px">
          <span class="drag-handle" title="Drag to reorder">⠿</span>
          <span class="entry-card-title">Experience ${idx + 1}</span>
        </div>
        <button class="btn-remove" data-remove-exp="${exp.id}" title="Remove">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="3,6 5,6 21,6"/><path d="M19,6l-1,14a2,2,0,0,1-2,2H8a2,2,0,0,1-2-2L5,6"/><path d="M10,11v6"/><path d="M14,11v6"/></svg>
        </button>
      </div>
      <div class="form-grid">
        <div class="form-group"><label>Job Title</label>
          <input type="text" value="${san(exp.position)}" placeholder="Senior Developer" data-id="${exp.id}" data-field="position" /></div>
        <div class="form-group"><label>Company</label>
          <input type="text" value="${san(exp.company)}" placeholder="Acme Corp" data-id="${exp.id}" data-field="company" /></div>
        <div class="date-range">
          <div class="form-group"><label>Start Date</label>
            <input type="month" value="${san(exp.startDate)}" data-id="${exp.id}" data-field="startDate" /></div>
          <div class="form-group"><label>End Date</label>
            <input type="month" value="${san(exp.endDate)}" id="expEnd-${exp.id}" ${exp.current ? 'disabled' : ''} data-id="${exp.id}" data-field="endDate" /></div>
          <div class="present-toggle">
            <label>Present</label>
            <label class="toggle-switch">
              <input type="checkbox" ${exp.current ? 'checked' : ''} data-toggle-exp="${exp.id}">
              <span class="toggle-slider"></span>
            </label>
          </div>
        </div>
        <div class="form-group full"><label>Description</label>
          <textarea placeholder="• Led development of key features&#10;• Improved performance by 40%" data-id="${exp.id}" data-field="description">${san(exp.description)}</textarea></div>
      </div>
    </div>`).join('');

  // Auto-resize restored textareas (#9)
  container.querySelectorAll('textarea').forEach(autoResize);
  attachExpListeners(container);
  initExpSortable();
}

function attachExpListeners(container) {
  container.oninput = e => {
    const el = e.target, id = parseInt(el.dataset.id, 10), field = el.dataset.field;
    if (!isNaN(id) && field) { updateExpField(id, field, el.value); if (el.tagName === 'TEXTAREA') autoResize(el); }
  };
  container.onchange = e => {
    const el = e.target, expId = el.dataset.toggleExp ? parseInt(el.dataset.toggleExp, 10) : NaN;
    if (!isNaN(expId)) toggleExpCurrent(expId, el.checked);
  };
  container.onclick = e => {
    const btn = e.target.closest('[data-remove-exp]');
    if (btn) removeExperience(parseInt(btn.dataset.removeExp, 10));
  };
}

function initExpSortable() {
  if (typeof Sortable === 'undefined') return;
  if (_expSortable) { _expSortable.destroy(); _expSortable = null; }
  const el = document.getElementById('experienceList');
  if (!el || experiences.length === 0) return;
  _expSortable = Sortable.create(el, { handle: '.drag-handle', animation: 150, onEnd: e => reorderExperiences(e.oldIndex, e.newIndex) });
}

// ── Education ─────────────────────────────────────────────
function addEducation() {
  educations.push({ id: nextId(), institution: '', degree: '', field: '', startDate: '', endDate: '', gpa: '' });
  renderEducations();
  const list = document.getElementById('educationList');
  const last = list.querySelector('.entry-card:last-child');
  if (last) last.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function removeEducation(id) {
  educations = educations.filter(e => e.id !== id);
  renderEducations();
  updatePreview();
}

function updateEduField(id, field, value) {
  const edu = getEduById(id);
  if (edu) { edu[field] = value; scheduledPreview(); }
}

function reorderEducations(oldIndex, newIndex) {
  const [item] = educations.splice(oldIndex, 1);
  educations.splice(newIndex, 0, item);
  debouncedSave();
  updatePreview();
}

function renderEducations() {
  const container = document.getElementById('educationList');
  if (educations.length === 0) {
    container.innerHTML = `<div class="empty-placeholder" style="min-height:120px"><p>No education added yet. Click "Add Education" below.</p></div>`;
    initEduSortable(); return;
  }
  container.innerHTML = educations.map((edu, idx) => `
    <div class="entry-card" id="eduCard-${edu.id}" data-id="${edu.id}">
      <div class="entry-card-header">
        <div style="display:flex;align-items:center;gap:8px">
          <span class="drag-handle" title="Drag to reorder">⠿</span>
          <span class="entry-card-title">Education ${idx + 1}</span>
        </div>
        <button class="btn-remove" data-remove-edu="${edu.id}" title="Remove">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="3,6 5,6 21,6"/><path d="M19,6l-1,14a2,2,0,0,1-2,2H8a2,2,0,0,1-2-2L5,6"/><path d="M10,11v6"/><path d="M14,11v6"/></svg>
        </button>
      </div>
      <div class="form-grid">
        <div class="form-group full"><label>Institution</label>
          <input type="text" value="${san(edu.institution)}" placeholder="MIT" data-id="${edu.id}" data-field="institution" /></div>
        <div class="form-group"><label>Degree</label>
          <input type="text" value="${san(edu.degree)}" placeholder="Bachelor of Science" data-id="${edu.id}" data-field="degree" /></div>
        <div class="form-group"><label>Field of Study</label>
          <input type="text" value="${san(edu.field)}" placeholder="Computer Science" data-id="${edu.id}" data-field="field" /></div>
        <div class="form-group"><label>Start Year</label>
          <input type="month" value="${san(edu.startDate)}" data-id="${edu.id}" data-field="startDate" /></div>
        <div class="form-group"><label>End Year</label>
          <input type="month" value="${san(edu.endDate)}" data-id="${edu.id}" data-field="endDate" /></div>
        <div class="form-group"><label>GPA (optional)</label>
          <input type="text" value="${san(edu.gpa)}" placeholder="3.8 / 4.0" data-id="${edu.id}" data-field="gpa" /></div>
      </div>
    </div>`).join('');

  container.querySelectorAll('textarea').forEach(autoResize);
  attachEduListeners(container);
  initEduSortable();
}

function attachEduListeners(container) {
  container.oninput = e => {
    const el = e.target, id = parseInt(el.dataset.id, 10), field = el.dataset.field;
    if (!isNaN(id) && field) updateEduField(id, field, el.value);
  };
  container.onclick = e => {
    const btn = e.target.closest('[data-remove-edu]');
    if (btn) removeEducation(parseInt(btn.dataset.removeEdu, 10));
  };
}

function initEduSortable() {
  if (typeof Sortable === 'undefined') return;
  if (_eduSortable) { _eduSortable.destroy(); _eduSortable = null; }
  const el = document.getElementById('educationList');
  if (!el || educations.length === 0) return;
  _eduSortable = Sortable.create(el, { handle: '.drag-handle', animation: 150, onEnd: e => reorderEducations(e.oldIndex, e.newIndex) });
}

// ── Skills ────────────────────────────────────────────────
function handleSkillInput(e) {
  if (e.key === 'Enter' || e.key === ',') {
    e.preventDefault();
    const val = e.target.value.replace(',', '').trim();
    if (val) addSkillTag(val);
    e.target.value = '';
  } else if (e.key === 'Backspace' && e.target.value === '' && skills.length > 0) {
    skills.pop();
    renderSkillTags();
    refreshSkillSuggestions();
    updatePreview();
  }
}

function addSkillTag(name) {
  const trimmed = name.trim();
  if (!trimmed || skills.includes(trimmed)) return;
  skills.push(trimmed);
  renderSkillTags();
  refreshSkillSuggestions();
  updatePreview();
}

function renderSkillTags() {
  const container = document.getElementById('tagsContainer');
  container.innerHTML = skills.map((skill, idx) => `
    <span class="skill-tag">${san(skill)}
      <button data-idx="${idx}" aria-label="Remove ${san(skill)}">×</button>
    </span>`).join('');
  container.onclick = e => {
    const btn = e.target.closest('button[data-idx]');
    if (!btn) return;
    const idx = parseInt(btn.dataset.idx, 10);
    if (!isNaN(idx) && idx >= 0 && idx < skills.length) {
      skills.splice(idx, 1);
      renderSkillTags();
      refreshSkillSuggestions();
      updatePreview();
    }
  };
}

// Disable suggestion pills that are already added (#6)
function refreshSkillSuggestions() {
  document.querySelectorAll('.suggestions-list button').forEach(btn => {
    const isAdded = skills.includes(btn.textContent.trim());
    btn.disabled = isAdded;
    btn.classList.toggle('skill-used', isAdded);
  });
}

// ── Photo Upload ──────────────────────────────────────────
function handlePhotoUpload(event) {
  const file = event.target.files[0];
  if (!file) return;
  if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
    showToast('Please upload a JPEG, PNG, WebP, or GIF image.', 'error');
    event.target.value = '';
    return;
  }
  const reader = new FileReader();
  reader.onload = async e => {
    const result = e.target.result;
    if (!isValidPhotoDataUrl(result)) { showToast('Invalid image file.', 'error'); return; }
    // Resize to ≤400px, JPEG 0.85 before storing (#20)
    photoDataUrl = await resizeImageDataUrl(result, 400, 0.85);
    applyPhotoPreview(photoDataUrl);
    updatePreview();
  };
  reader.readAsDataURL(file);
}

// Canvas resize helper (#20)
function resizeImageDataUrl(dataUrl, maxPx, quality) {
  return new Promise(resolve => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxPx / Math.max(img.width, img.height));
      const w = Math.round(img.width * scale), h = Math.round(img.height * scale);
      const canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      canvas.getContext('2d').drawImage(img, 0, 0, w, h);
      resolve(canvas.toDataURL('image/jpeg', quality));
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}

function applyPhotoPreview(url) {
  const preview = document.getElementById('photoPreview');
  preview.style.backgroundImage = `url(${url})`;
  preview.style.backgroundSize = 'cover';
  preview.style.backgroundPosition = 'center';
  const svg = preview.querySelector('svg');
  const hint = preview.querySelector('.photo-upload-hint');
  if (svg) svg.style.display = 'none';
  if (hint) hint.style.display = 'none';
  document.getElementById('photoRemoveBtn').style.display = 'block';
}

function removePhoto() {
  photoDataUrl = null;
  const preview = document.getElementById('photoPreview');
  preview.style.backgroundImage = '';
  const svg = preview.querySelector('svg');
  const hint = preview.querySelector('.photo-upload-hint');
  if (svg) svg.style.display = '';
  if (hint) hint.style.display = '';
  document.getElementById('photoRemoveBtn').style.display = 'none';
  document.getElementById('photoInput').value = '';
  updatePreview();
}

// ── Color Theme ───────────────────────────────────────────
function selectColor(color) {
  currentColor = color;
  document.querySelectorAll('.color-swatch').forEach(el => el.classList.toggle('active', el.dataset.color === color));
  const page = document.getElementById('resumeOutput');
  const picker = document.getElementById('templatePicker');
  page.style.setProperty('--resume-header-color', color);
  if (picker) picker.style.setProperty('--tmpl-color', color);
  debouncedSave();
}

// ── Template ──────────────────────────────────────────────
function selectTemplate(name) {
  currentTemplate = name;
  document.querySelectorAll('.template-option').forEach(btn => btn.classList.toggle('active', btn.dataset.template === name));
  updatePreview();
}

// ── Build resume HTML ─────────────────────────────────────
function buildResumeHTML() {
  const firstName = document.getElementById('firstName').value;
  const lastName = document.getElementById('lastName').value;
  const jobTitle = document.getElementById('jobTitle').value;
  const email = document.getElementById('email').value;
  const phone = document.getElementById('phone').value;
  const location = document.getElementById('location').value;
  const website = document.getElementById('website').value;
  const linkedin = document.getElementById('linkedin').value;
  const summary = document.getElementById('summary').value;
  const fullName = `${firstName} ${lastName}`.trim() || 'Your Name';
  const hasData = firstName || lastName || jobTitle;

  if (!hasData && experiences.length === 0 && educations.length === 0 && skills.length === 0 && !summary) {
    return `
      <div class="empty-placeholder">
        <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" stroke-width="1.5"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14,2 14,8 20,8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10,9 9,9 8,9"/></svg>
        <p>Start filling in your details to see the live preview</p>
        <button class="btn-sample" onclick="loadSampleData()">✨ Load Sample Resume</button>
      </div>`;
  }

  const cI = (icon, val) => val ? `<span class="contact-item">${icon} ${san(val)}</span>` : '';
  const contactItems = [cI('📧', email), cI('📞', phone), cI('📍', location), cI('🌐', website), cI('🔗', linkedin)].filter(Boolean).join('');

  const summarySection = summary ? `<div class="resume-section"><div class="section-heading">Professional Summary</div><p class="resume-summary-text">${san(summary)}</p></div>` : '';

  const experienceSection = experiences.length > 0 ? `
    <div class="resume-section"><div class="section-heading">Experience</div>
      ${experiences.map(exp => `
        <div class="experience-entry">
          <div class="entry-header">
            <div class="entry-title">${san(exp.position) || 'Position'}</div>
            <div class="entry-dates">${formatDate(exp.startDate)} ${exp.startDate ? '–' : ''} ${exp.current ? 'Present' : formatDate(exp.endDate)}</div>
          </div>
          <div class="entry-subtitle">${san(exp.company)}</div>
          ${formatDesc(exp.description)}
        </div>`).join('')}
    </div>` : '';

  const educationSection = educations.length > 0 ? `
    <div class="resume-section"><div class="section-heading">Education</div>
      ${educations.map(edu => `
        <div class="education-entry">
          <div class="entry-header">
            <div class="entry-title">${san(edu.institution) || 'Institution'}</div>
            <div class="entry-dates">${formatDate(edu.startDate)} ${edu.startDate ? '–' : ''} ${formatDate(edu.endDate)}</div>
          </div>
          <div class="entry-subtitle">${[san(edu.degree), san(edu.field)].filter(Boolean).join(', ')}</div>
          ${edu.gpa ? `<p class="entry-description">GPA: ${san(edu.gpa)}</p>` : ''}
        </div>`).join('')}
    </div>` : '';

  const skillsSection = skills.length > 0 ? `
    <div class="resume-section"><div class="section-heading">Skills</div>
      <div class="skills-grid">${skills.map(s => `<span class="resume-skill-badge">${san(s)}</span>`).join('')}</div>
    </div>` : '';

  const safePhotoUrl = isValidPhotoDataUrl(photoDataUrl) ? photoDataUrl : null;
  const photoImg = safePhotoUrl ? `<img src="${safePhotoUrl}" class="resume-photo" alt="Profile photo" />` : '';

  if (currentTemplate === 'classic') {
    return `
      <div class="resume-header">
        ${photoImg}
        <div class="resume-header-text">
          <div class="resume-name">${san(fullName)}</div>
          ${jobTitle ? `<div class="resume-title">${san(jobTitle)}</div>` : ''}
          <div class="resume-contact">${contactItems}</div>
        </div>
      </div>
      <div class="resume-body">${summarySection}${experienceSection}${educationSection}${skillsSection}</div>`;
  }

  if (currentTemplate === 'modern') {
    const sidebarSkills = skills.length > 0 ? `<div class="sidebar-section"><div class="sidebar-section-label">Skills</div>${skills.map(s => `<span class="sidebar-skill-tag">${san(s)}</span>`).join('')}</div>` : '';
    const sidebarContact = (email || phone || location || website || linkedin) ? `
      <div class="sidebar-section"><div class="sidebar-section-label">Contact</div>
        ${[['📧', email], ['📞', phone], ['📍', location], ['🌐', website], ['🔗', linkedin]].filter(([, v]) => v).map(([i, v]) => `<div class="contact-item">${i} <span>${san(v)}</span></div>`).join('')}
      </div>` : '';
    return `
      <div class="resume-sidebar">
        ${safePhotoUrl ? `<img src="${safePhotoUrl}" class="resume-photo sidebar-photo" alt="Profile photo" />` : ''}
        <div class="sidebar-name">${san(fullName)}</div>
        ${jobTitle ? `<div class="sidebar-title">${san(jobTitle)}</div>` : ''}
        ${sidebarContact}${sidebarSkills}
      </div>
      <div class="resume-main">${summarySection}${experienceSection}${educationSection}</div>`;
  }

  // Minimal
  return `
    <div class="resume-header">
      ${photoImg}
      <div class="resume-header-text">
        <div class="resume-name">${san(fullName)}</div>
        ${jobTitle ? `<div class="resume-title">${san(jobTitle)}</div>` : ''}
        <div class="resume-contact">${contactItems}</div>
      </div>
    </div>
    <div class="resume-body">${summarySection}${experienceSection}${educationSection}${skillsSection}</div>`;
}

// ── Live Preview ──────────────────────────────────────────
function updatePreview() {
  const page = document.getElementById('resumeOutput');
  page.className = `resume-page tmpl-${currentTemplate}`;
  page.innerHTML = buildResumeHTML();
  page.style.setProperty('--resume-header-color', currentColor);

  const summary = document.getElementById('summary');
  const countEl = document.getElementById('summaryCount');
  const charWrap = countEl && countEl.closest('.char-count');
  if (summary && countEl) {
    const len = summary.value.length;
    countEl.textContent = len;
    if (charWrap) charWrap.classList.toggle('over-limit', len > 400);
  }
  debouncedSave();
}

function scheduledPreview() {
  clearTimeout(_previewTimer);
  _previewTimer = setTimeout(updatePreview, 150);
}

// ── Debounced Save (#15) ──────────────────────────────────
function debouncedSave() {
  clearTimeout(_saveTimer);
  _saveTimer = setTimeout(saveState, 400);
}

// ── Save / Restore State ──────────────────────────────────
function saveState() {
  const state = {
    currentStep, currentTemplate, currentColor,
    skills, experiences, educations, photoDataUrl,
    fields: {
      firstName: (document.getElementById('firstName') || {}).value || '',
      lastName: (document.getElementById('lastName') || {}).value || '',
      jobTitle: (document.getElementById('jobTitle') || {}).value || '',
      email: (document.getElementById('email') || {}).value || '',
      phone: (document.getElementById('phone') || {}).value || '',
      location: (document.getElementById('location') || {}).value || '',
      website: (document.getElementById('website') || {}).value || '',
      linkedin: (document.getElementById('linkedin') || {}).value || '',
      summary: (document.getElementById('summary') || {}).value || '',
    }
  };
  try {
    localStorage.setItem('resumeforge_state', JSON.stringify(state));
  } catch (e) {
    try { localStorage.setItem('resumeforge_state', JSON.stringify({ ...state, photoDataUrl: null, photoOmitted: true })); } catch (_) { }
  }
  if (!_isLoading) {
    const ind = document.getElementById('saveIndicator');
    if (ind) {
      ind.textContent = '✓ Saved';
      ind.classList.add('visible');
      clearTimeout(ind._hideTimer);
      ind._hideTimer = setTimeout(() => ind.classList.remove('visible'), 1800);
    }
  }
}

function loadState() {
  let raw;
  try { raw = localStorage.getItem('resumeforge_state'); } catch (e) { return; }
  if (!raw) return;
  let state;
  try { state = JSON.parse(raw); } catch (e) { return; }

  _isLoading = true;
  if (typeof state.currentStep === 'number') currentStep = state.currentStep;
  if (typeof state.currentTemplate === 'string') currentTemplate = state.currentTemplate;
  if (typeof state.currentColor === 'string') currentColor = state.currentColor;
  if (Array.isArray(state.skills)) skills = state.skills;
  if (Array.isArray(state.experiences)) {
    experiences = state.experiences.map(e => ({ id: Number(e.id), company: e.company || '', position: e.position || '', startDate: e.startDate || '', endDate: e.endDate || '', current: Boolean(e.current), description: e.description || '' }));
  }
  if (Array.isArray(state.educations)) {
    educations = state.educations.map(e => ({ id: Number(e.id), institution: e.institution || '', degree: e.degree || '', field: e.field || '', startDate: e.startDate || '', endDate: e.endDate || '', gpa: e.gpa || '' }));
  }
  const allIds = [...experiences, ...educations].map(e => e.id).filter(Number.isFinite);
  if (allIds.length > 0) _nextId = Math.max(...allIds) + 1;

  if (state.photoDataUrl && !state.photoOmitted && isValidPhotoDataUrl(state.photoDataUrl)) {
    photoDataUrl = state.photoDataUrl;
    applyPhotoPreview(photoDataUrl);
  }
  if (state.fields) {
    ['firstName', 'lastName', 'jobTitle', 'email', 'phone', 'location', 'website', 'linkedin', 'summary'].forEach(id => {
      const el = document.getElementById(id);
      if (el && state.fields[id] != null) el.value = state.fields[id];
    });
  }
  renderExperiences();
  renderEducations();
  renderSkillTags();
  refreshSkillSuggestions();
  selectTemplate(currentTemplate);
  selectColor(currentColor);

  const panels = document.querySelectorAll('.step-panel');
  const btns = document.querySelectorAll('.step-btn');
  panels.forEach((p, i) => { p.classList.toggle('active', i === currentStep); p.style.transform = ''; });
  btns.forEach((b, i) => {
    b.classList.toggle('active', i === currentStep);
    b.setAttribute('aria-selected', String(i === currentStep));
    b.setAttribute('tabindex', i === currentStep ? '0' : '-1');
  });

  // Auto-resize all restored textareas (#9)
  document.querySelectorAll('.step-panel textarea').forEach(autoResize);
  _isLoading = false;
}

// ── Load Sample Data (#7) ─────────────────────────────────
function loadSampleData() {
  const d = SAMPLE_DATA;
  ['firstName', 'lastName', 'jobTitle', 'email', 'phone', 'location', 'website', 'linkedin', 'summary'].forEach(id => {
    const el = document.getElementById(id);
    if (el && d[id] !== undefined) el.value = d[id];
  });
  skills = [...d.skills];
  experiences = d.experiences.map(e => ({ ...e, id: nextId() }));
  educations = d.educations.map(e => ({ ...e, id: nextId() }));
  renderSkillTags();
  refreshSkillSuggestions();
  renderExperiences();
  renderEducations();
  updatePreview();
  showToast('Sample resume loaded!', 'success');
}

// ── Clear Data – modal + in-place reset (#4, #16) ─────────
function openClearModal() { document.getElementById('clearModal').classList.add('open'); }
function closeClearModal() { document.getElementById('clearModal').classList.remove('open'); }

function confirmClear() {
  closeClearModal();
  // Snapshot current state for undo
  try { _savedStateBefore = localStorage.getItem('resumeforge_state'); } catch (_) { }

  // In-place reset (#16 – no location.reload())
  currentStep = 0; currentTemplate = 'classic'; currentColor = '#1C1C1E';
  skills = []; experiences = []; educations = []; photoDataUrl = null; _nextId = 1;

  ['firstName', 'lastName', 'jobTitle', 'email', 'phone', 'location', 'website', 'linkedin', 'summary'].forEach(id => {
    const el = document.getElementById(id); if (el) el.value = '';
  });
  removePhoto();
  document.querySelectorAll('.field-error').forEach(el => el.remove());
  document.querySelectorAll('input.invalid').forEach(el => el.classList.remove('invalid'));

  renderExperiences();
  renderEducations();
  renderSkillTags();
  refreshSkillSuggestions();
  selectTemplate('classic');
  selectColor('#1C1C1E');

  const panels = document.querySelectorAll('.step-panel');
  const btns = document.querySelectorAll('.step-btn');
  panels.forEach((p, i) => { p.classList.toggle('active', i === 0); p.style.transform = ''; });
  btns.forEach((b, i) => { b.classList.toggle('active', i === 0); b.setAttribute('aria-selected', String(i === 0)); b.setAttribute('tabindex', i === 0 ? '0' : '-1'); });
  updateProgressBar(0);

  try { localStorage.removeItem('resumeforge_state'); } catch (_) { }
  updatePreview();
  showToastWithUndo('All data cleared.', undoClear, 5000);
}

function undoClear() {
  if (!_savedStateBefore) return;
  try { localStorage.setItem('resumeforge_state', _savedStateBefore); } catch (_) { }
  _savedStateBefore = null;
  loadState();
  updatePreview();
  showToast('Restored!', 'success');
}

// ── Field Validation (#3) ─────────────────────────────────
function validateField(el) {
  const val = el.value.trim();
  let error = '';
  if (el.id === 'email' && val && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val)) error = 'Please enter a valid email address.';
  if (el.id === 'phone' && val && !/^[\d\s\+\-\(\)\.]{7,20}$/.test(val)) error = 'Please enter a valid phone number.';
  if (el.id === 'website' && val && !/^https?:\/\/.+/.test(val)) error = 'URL must start with http:// or https://';
  const existing = el.parentElement.querySelector('.field-error');
  if (existing) existing.remove();
  el.classList.remove('invalid');
  if (error) {
    el.classList.add('invalid');
    const span = document.createElement('span');
    span.className = 'field-error'; span.textContent = error;
    el.parentElement.appendChild(span);
  }
  return !error;
}

function attachValidation() {
  ['email', 'phone', 'website'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('blur', () => validateField(el));
  });
}

// ── Zoom ─────────────────────────────────────────────────
function adjustZoom(delta) {
  const next = Math.min(1.2, Math.max(0.4, zoomLevel + delta));
  if (next === zoomLevel) return;
  zoomLevel = next;
  document.getElementById('previewZoomWrapper').style.transform = `scale(${zoomLevel})`;
  document.getElementById('zoomLabel').textContent = `${Math.round(zoomLevel * 100)}%`;
  updateZoomButtons();
}

function updateZoomButtons() {
  const out = document.getElementById('zoomOutBtn');
  const inn = document.getElementById('zoomInBtn');
  if (out) out.disabled = zoomLevel <= 0.4;
  if (inn) inn.disabled = zoomLevel >= 1.2;
}

// ── Mobile Preview Toggle (#1) ────────────────────────────
function togglePreview() {
  const preview = document.getElementById('previewPanel');
  const builder = document.getElementById('builderPanel');
  const btn = document.getElementById('previewToggle');
  const showing = preview.classList.toggle('mobile-visible');
  builder.classList.toggle('mobile-hidden', showing);
  if (btn) btn.textContent = showing ? '✏️ Edit' : '👁 Preview';
}

// ── Auto-resize textarea ──────────────────────────────────
function autoResize(el) {
  el.style.height = 'auto';
  el.style.height = el.scrollHeight + 'px';
}

// ── Toast ─────────────────────────────────────────────────
function showToast(msg, type = '') {
  const toast = document.getElementById('toast');
  toast.textContent = msg;
  toast.className = `toast ${type} show`;
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => toast.classList.remove('show'), 3000);
}

function showToastWithUndo(msg, undoFn, duration = 5000) {
  const toast = document.getElementById('toast');
  toast.innerHTML = `${msg} <button class="toast-undo-btn" id="toastUndoBtn">Undo</button>`;
  toast.className = 'toast show';
  clearTimeout(_toastTimer);
  const btn = document.getElementById('toastUndoBtn');
  if (btn) btn.onclick = () => { toast.classList.remove('show'); undoFn(); };
  _toastTimer = setTimeout(() => toast.classList.remove('show'), duration);
}

function showToastWithLink(msg, linkText, href) {
  const toast = document.getElementById('toast');
  toast.innerHTML = `${msg}<a href="${href}" target="_blank" style="color:#93c5fd;text-decoration:underline;font-weight:600;margin-left:4px">${linkText}</a>`;
  toast.className = 'toast show';
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => toast.classList.remove('show'), 8000);
}

// ── PDF Download ──────────────────────────────────────────
async function downloadPDF() {
  if (_isGenerating) return;
  const source = document.getElementById('resumeOutput');
  if (source.querySelector('.empty-placeholder')) {
    showToast('Please fill in some details before downloading.', 'error'); return;
  }
  _isGenerating = true;
  const btn = document.getElementById('downloadBtn');
  const origHTML = btn.innerHTML;
  btn.innerHTML = `<svg class="spin" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12a9 9 0 11-6.219-8.56"/></svg> Generating…`;
  btn.disabled = true;

  // ── Clone & prepare ────────────────────────────────────
  const clone = source.cloneNode(true);
  const resolvedColor = getComputedStyle(source).getPropertyValue('--resume-header-color').trim() || currentColor;
  clone.style.setProperty('--resume-header-color', resolvedColor);
  const headerEl = clone.querySelector('.resume-header') || clone.querySelector('.resume-sidebar');
  if (headerEl) headerEl.style.background = resolvedColor;

  // Critical: set min-height to 0 via inline style (overrides the 1122px CSS class rule)
  // Without this, html2canvas sees a 1122px-tall element even for short resumes,
  // causing the content to appear on page 2 with a blank page 1.
  clone.style.width = '794px';
  clone.style.minHeight = '0';
  clone.style.height = 'auto';
  clone.style.boxShadow = 'none';
  clone.style.position = 'relative';

  const wrapper = document.createElement('div');
  wrapper.style.cssText = 'position:fixed;left:-9999px;top:0;width:794px;background:#fff;overflow:visible';
  document.body.appendChild(wrapper);
  wrapper.appendChild(clone);
  await document.fonts.ready;

  const A4_W = 794;   // CSS px — A4 width at 96dpi
  const A4_H = 1122;  // CSS px — A4 height at 96dpi
  const SCALE = 2;     // render resolution multiplier

  try {
    // ── Render entire resume to one high-res canvas ────────
    const canvas = await html2canvas(clone, {
      scale: SCALE,
      useCORS: true,
      allowTaint: false,
      logging: false,
      width: A4_W,
      windowWidth: A4_W,
      scrollX: 0,
      scrollY: 0,
    });

    // ── Slice canvas page-by-page into jsPDF ──────────────
    // Each PDF page = A4_H CSS px = A4_H * SCALE canvas px
    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF({ unit: 'px', format: [A4_W, A4_H], orientation: 'portrait' });

    const pageCanvasH = A4_H * SCALE;
    let yPos = 0;   // current Y offset in canvas pixels
    let page = 0;

    while (yPos < canvas.height) {
      if (page > 0) pdf.addPage([A4_W, A4_H]);

      const sliceH = Math.min(pageCanvasH, canvas.height - yPos);
      const pageCanvas = document.createElement('canvas');
      pageCanvas.width = canvas.width;
      pageCanvas.height = sliceH;
      pageCanvas.getContext('2d').drawImage(
        canvas,
        0, yPos, canvas.width, sliceH,  // source rect (from full canvas)
        0, 0, canvas.width, sliceH   // dest rect   (on page canvas)
      );

      // sliceH / SCALE converts canvas px → CSS px for jsPDF placement
      pdf.addImage(pageCanvas.toDataURL('image/jpeg', 0.98), 'JPEG', 0, 0, A4_W, sliceH / SCALE);
      yPos += pageCanvasH;
      page++;
    }

    const firstName = document.getElementById('firstName').value.trim() || 'Resume';
    const lastName = document.getElementById('lastName').value.trim() || '';
    const filename = `${firstName}${lastName ? '_' + lastName : ''}_Resume.pdf`;

    const pdfBlob = pdf.output('blob');
    const blobUrl = URL.createObjectURL(pdfBlob);

    // ── Approach 1: <a download> — real Chrome/Safari/Firefox save to Downloads ──
    const link = document.createElement('a');
    link.href = blobUrl;
    link.download = filename;
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    // ── Approach 2: also open PDF in a new tab as a reliable fallback ──────────
    // Works in restricted/Playwright environments where <a download> is intercepted.
    // User sees the real PDF and can press ⌘S (or Ctrl+S) to save with the right name.
    setTimeout(() => {
      const tab = window.open(blobUrl, '_blank');
      if (tab) {
        showToast(`PDF ready — press ⌘S in the new tab to save as "${filename}"`, 'success');
      } else {
        // Pop-ups blocked — offer a clickable link inside the toast
        showToastWithLink('PDF ready — ', 'Open PDF', blobUrl);
      }
      setTimeout(() => URL.revokeObjectURL(blobUrl), 60000);
    }, 600);
  } catch (err) {
    console.error(err);
    showToast('Download failed. Please try again.', 'error');
  } finally {
    document.body.removeChild(wrapper);
    btn.innerHTML = origHTML;
    btn.disabled = false;
    _isGenerating = false;
  }
}

// ── Init ──────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', () => {
  // Zoom setup
  document.getElementById('previewZoomWrapper').style.transform = `scale(${zoomLevel})`;
  document.getElementById('zoomLabel').textContent = `${Math.round(zoomLevel * 100)}%`;
  updateZoomButtons();

  // Init template picker with default color
  const picker = document.getElementById('templatePicker');
  if (picker) picker.style.setProperty('--tmpl-color', currentColor);

  loadState();

  const hasSavedState = (() => { try { return !!localStorage.getItem('resumeforge_state'); } catch (_) { return false; } })();
  if (!hasSavedState) {
    renderExperiences();
    renderEducations();
    selectColor(currentColor);
  }

  updatePreview();
  updateProgressBar(currentStep);
  attachValidation();
  initStepNavKeyboard();
  refreshSkillSuggestions();
});
