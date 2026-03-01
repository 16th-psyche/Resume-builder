/* =========================================================
   app.js – ResumeForge Logic
   ========================================================= */

// ── State ────────────────────────────────────────────────
let currentStep     = 0;
let currentTemplate = 'classic';
let skills          = [];
let experiences     = [];
let educations      = [];
let zoomLevel       = 0.80;
let photoDataUrl    = null;
let currentColor    = '#1C1C1E';

// Guards and counters
let _isLoading    = false;  // suppresses saveState indicator during restore
let _nextId       = 1;      // monotonic ID counter (L-8: avoids Date.now() collisions)
let _toastTimer   = null;   // debounce handle for showToast (M-8)
let _isGenerating = false;  // prevents concurrent PDF generation (L-9)

// ── Allowed image types (whitelist) ──────────────────────
const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

// ── Helper: stable monotonic ID ──────────────────────────
function nextId() { return _nextId++; }

// ── Helper: look up entry by id (H-4) ────────────────────
function getExpById(id) { return experiences.find(e => e.id === id); }
function getEduById(id) { return educations.find(e => e.id === id); }

// ── Helper: sanitize — HTML entities + attribute quotes (H-1) ──
function san(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ── Helper: validate photo data URL before innerHTML injection (C-1) ──
function isValidPhotoDataUrl(url) {
  if (!url || typeof url !== 'string') return false;
  return /^data:image\/(jpeg|png|webp|gif);base64,/.test(url);
}

// ── Helper: format date ───────────────────────────────────
function formatDate(dateStr) {
  if (!dateStr) return '';
  const parts = dateStr.split('-');
  if (parts.length < 2) return dateStr;
  const year  = parts[0];
  const month = parseInt(parts[1], 10);
  if (month < 1 || month > 12) return dateStr;
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${months[month - 1]} ${year}`;
}

// ── Helper: description lines → bullets ──────────────────
function formatDesc(text) {
  if (!text) return '';
  const lines = text.split('\n').map(l => l.replace(/^•\s*/, '').trim()).filter(Boolean);
  if (lines.length <= 1) return `<p class="entry-description">${san(lines[0] || '')}</p>`;
  return `<div class="entry-description"><ul>${lines.map(l => `<li>${san(l)}</li>`).join('')}</ul></div>`;
}

// ── Step Navigation ──────────────────────────────────────
function goToStep(index) {
  const panels = document.querySelectorAll('.step-panel');
  const btns   = document.querySelectorAll('.step-btn');

  // Bounds check (C-4)
  if (index < 0 || index >= panels.length) return;

  const exitingPanel = panels[currentStep];
  exitingPanel.classList.remove('active');
  exitingPanel.style.transform = index > currentStep ? 'translateX(-30px)' : 'translateX(30px)';
  // Clear stale inline transform so back-navigation entry animation works correctly (H-7)
  setTimeout(() => { exitingPanel.style.transform = ''; }, 300);

  currentStep = index;

  panels[currentStep].classList.add('active');
  panels[currentStep].style.transform = 'translateX(0)';

  btns.forEach((btn, i) => btn.classList.toggle('active', i === currentStep));

  updatePreview();
}

// ── Experience ───────────────────────────────────────────
function addExperience() {
  experiences.push({
    id: nextId(), company: '', position: '', startDate: '', endDate: '', current: false, description: ''
  });
  renderExperiences();
}

function removeExperience(id) {
  experiences = experiences.filter(e => e.id !== id);
  renderExperiences();
  updatePreview();
}

// Field helpers — avoid positional index drift after deletion (H-4)
function updateExpField(id, field, value) {
  const exp = getExpById(id);
  if (exp) { exp[field] = value; updatePreview(); }
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

function renderExperiences() {
  const container = document.getElementById('experienceList');
  if (experiences.length === 0) {
    container.innerHTML = `
      <div class="empty-placeholder" style="min-height:120px">
        <p>No experience added yet. Click "Add Experience" below.</p>
      </div>`;
    return;
  }
  // Use san() on all value attributes (C-3); oninput uses id-based helpers, not index (H-4)
  container.innerHTML = experiences.map((exp, idx) => `
    <div class="entry-card" id="expCard-${exp.id}">
      <div class="entry-card-header">
        <span class="entry-card-title">Experience ${idx + 1}</span>
        <button class="btn-remove" onclick="removeExperience(${exp.id})" title="Remove">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="3,6 5,6 21,6"/><path d="M19,6l-1,14a2,2,0,0,1-2,2H8a2,2,0,0,1-2-2L5,6"/><path d="M10,11v6"/><path d="M14,11v6"/></svg>
        </button>
      </div>
      <div class="form-grid">
        <div class="form-group">
          <label>Job Title</label>
          <input type="text" value="${san(exp.position)}" placeholder="Senior Developer"
            oninput="updateExpField(${exp.id}, 'position', this.value)" />
        </div>
        <div class="form-group">
          <label>Company</label>
          <input type="text" value="${san(exp.company)}" placeholder="Acme Corp"
            oninput="updateExpField(${exp.id}, 'company', this.value)" />
        </div>
        <div class="date-range">
          <div class="form-group">
            <label>Start Date</label>
            <input type="month" value="${san(exp.startDate)}"
              oninput="updateExpField(${exp.id}, 'startDate', this.value)" />
          </div>
          <div class="form-group">
            <label>End Date</label>
            <input type="month" value="${san(exp.endDate)}" id="expEnd-${exp.id}"
              ${exp.current ? 'disabled' : ''}
              oninput="updateExpField(${exp.id}, 'endDate', this.value)" />
          </div>
          <div class="present-toggle">
            <label>Present</label>
            <label class="toggle-switch">
              <input type="checkbox" ${exp.current ? 'checked' : ''}
                onchange="toggleExpCurrent(${exp.id}, this.checked)">
              <span class="toggle-slider"></span>
            </label>
          </div>
        </div>
        <div class="form-group full">
          <label>Description</label>
          <textarea placeholder="• Led development of key features&#10;• Improved performance by 40%&#10;• Mentored junior developers"
            oninput="updateExpField(${exp.id}, 'description', this.value); autoResize(this)"
            >${san(exp.description)}</textarea>
        </div>
      </div>
    </div>
  `).join('');
}

// ── Education ────────────────────────────────────────────
function addEducation() {
  educations.push({
    id: nextId(), institution: '', degree: '', field: '', startDate: '', endDate: '', gpa: ''
  });
  renderEducations();
}

function removeEducation(id) {
  educations = educations.filter(e => e.id !== id);
  renderEducations();
  updatePreview();
}

function updateEduField(id, field, value) {
  const edu = getEduById(id);
  if (edu) { edu[field] = value; updatePreview(); }
}

function renderEducations() {
  const container = document.getElementById('educationList');
  if (educations.length === 0) {
    container.innerHTML = `
      <div class="empty-placeholder" style="min-height:120px">
        <p>No education added yet. Click "Add Education" below.</p>
      </div>`;
    return;
  }
  // Use san() on all value attributes (C-3); oninput uses id-based helpers (H-4)
  container.innerHTML = educations.map((edu, idx) => `
    <div class="entry-card" id="eduCard-${edu.id}">
      <div class="entry-card-header">
        <span class="entry-card-title">Education ${idx + 1}</span>
        <button class="btn-remove" onclick="removeEducation(${edu.id})" title="Remove">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="3,6 5,6 21,6"/><path d="M19,6l-1,14a2,2,0,0,1-2,2H8a2,2,0,0,1-2-2L5,6"/><path d="M10,11v6"/><path d="M14,11v6"/></svg>
        </button>
      </div>
      <div class="form-grid">
        <div class="form-group full">
          <label>Institution</label>
          <input type="text" value="${san(edu.institution)}" placeholder="MIT"
            oninput="updateEduField(${edu.id}, 'institution', this.value)" />
        </div>
        <div class="form-group">
          <label>Degree</label>
          <input type="text" value="${san(edu.degree)}" placeholder="Bachelor of Science"
            oninput="updateEduField(${edu.id}, 'degree', this.value)" />
        </div>
        <div class="form-group">
          <label>Field of Study</label>
          <input type="text" value="${san(edu.field)}" placeholder="Computer Science"
            oninput="updateEduField(${edu.id}, 'field', this.value)" />
        </div>
        <div class="form-group">
          <label>Start Year</label>
          <input type="month" value="${san(edu.startDate)}"
            oninput="updateEduField(${edu.id}, 'startDate', this.value)" />
        </div>
        <div class="form-group">
          <label>End Year</label>
          <input type="month" value="${san(edu.endDate)}"
            oninput="updateEduField(${edu.id}, 'endDate', this.value)" />
        </div>
        <div class="form-group">
          <label>GPA (optional)</label>
          <input type="text" value="${san(edu.gpa)}" placeholder="3.8 / 4.0"
            oninput="updateEduField(${edu.id}, 'gpa', this.value)" />
        </div>
      </div>
    </div>
  `).join('');
}

// ── Skills ───────────────────────────────────────────────
function handleSkillInput(e) {
  if (e.key === 'Enter' || e.key === ',') {
    e.preventDefault();
    const val = e.target.value.replace(',', '').trim();
    if (val) addSkillTag(val);
    e.target.value = '';
  } else if (e.key === 'Backspace' && e.target.value === '' && skills.length > 0) {
    // Use pop() directly — avoids H-3 issue of matching by skill text with special chars
    skills.pop();
    renderSkillTags();
    updatePreview();
  }
}

function addSkillTag(name) {
  const trimmed = name.trim();
  if (!trimmed || skills.includes(trimmed)) return;
  skills.push(trimmed);
  renderSkillTags();
  updatePreview();
}

function renderSkillTags() {
  const container = document.getElementById('tagsContainer');
  // Use san() for display text (C-2); event delegation with data-idx avoids
  // inline onclick injection with raw skill text (C-2, H-3)
  container.innerHTML = skills.map((skill, idx) => `
    <span class="skill-tag">
      ${san(skill)}
      <button data-idx="${idx}" aria-label="Remove ${san(skill)}">×</button>
    </span>
  `).join('');
  // Replace delegated listener each render (only one listener at a time)
  container.onclick = (e) => {
    const btn = e.target.closest('button[data-idx]');
    if (!btn) return;
    const idx = parseInt(btn.dataset.idx, 10);
    if (!isNaN(idx) && idx >= 0 && idx < skills.length) {
      skills.splice(idx, 1);
      renderSkillTags();
      updatePreview();
    }
  };
}

// ── Photo Upload ──────────────────────────────────────────
function handlePhotoUpload(event) {
  const file = event.target.files[0];
  if (!file) return;

  // Whitelist validation — rejects SVG and other script-capable formats (H-2)
  if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
    showToast('Please upload a JPEG, PNG, WebP, or GIF image.', 'error');
    event.target.value = '';
    return;
  }

  const reader = new FileReader();
  reader.onload = (e) => {
    const result = e.target.result;

    // Validate data URL prefix before injecting into DOM (C-1)
    if (!isValidPhotoDataUrl(result)) {
      showToast('Invalid image file.', 'error');
      return;
    }

    photoDataUrl = result;
    const preview = document.getElementById('photoPreview');
    preview.style.backgroundImage    = `url(${photoDataUrl})`;
    preview.style.backgroundSize     = 'cover';
    preview.style.backgroundPosition = 'center';
    const svg  = preview.querySelector('svg');
    const hint = preview.querySelector('.photo-upload-hint');
    if (svg)  svg.style.display  = 'none';
    if (hint) hint.style.display = 'none';
    document.getElementById('photoRemoveBtn').style.display = 'block';
    updatePreview();
  };
  reader.readAsDataURL(file);
}

function removePhoto() {
  photoDataUrl = null;
  const preview = document.getElementById('photoPreview');
  preview.style.backgroundImage = '';
  const svg  = preview.querySelector('svg');
  const hint = preview.querySelector('.photo-upload-hint');
  if (svg)  svg.style.display  = '';
  if (hint) hint.style.display = '';
  document.getElementById('photoRemoveBtn').style.display = 'none';
  document.getElementById('photoInput').value = '';
  updatePreview();
}

// ── Color Theme ───────────────────────────────────────────
function selectColor(color) {
  currentColor = color;
  document.querySelectorAll('.color-swatch').forEach(el => {
    el.classList.toggle('active', el.dataset.color === color);
  });
  const page = document.getElementById('resumeOutput');
  page.style.setProperty('--resume-header-color', color);
  const picker = document.getElementById('templatePicker');
  if (picker) picker.style.setProperty('--tmpl-color', color);
  saveState();
}

// ── Template ─────────────────────────────────────────────
function selectTemplate(name) {
  currentTemplate = name;
  document.querySelectorAll('.template-option').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.template === name);
  });
  updatePreview();
}

// ── Build resume HTML ─────────────────────────────────────
function buildResumeHTML() {
  const firstName = document.getElementById('firstName').value;
  const lastName  = document.getElementById('lastName').value;
  const jobTitle  = document.getElementById('jobTitle').value;
  const email     = document.getElementById('email').value;
  const phone     = document.getElementById('phone').value;
  const location  = document.getElementById('location').value;
  const website   = document.getElementById('website').value;
  const linkedin  = document.getElementById('linkedin').value;
  const summary   = document.getElementById('summary').value;

  const fullName = `${firstName} ${lastName}`.trim() || 'Your Name';
  const hasData  = firstName || lastName || jobTitle;

  if (!hasData && experiences.length === 0 && educations.length === 0 && skills.length === 0 && !summary) {
    return `
      <div class="empty-placeholder">
        <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" stroke-width="1.5"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14,2 14,8 20,8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10,9 9,9 8,9"/></svg>
        <p>Start filling in your details to see the live preview</p>
      </div>`;
  }

  const emailIcon    = '📧';
  const phoneIcon    = '📞';
  const locationIcon = '📍';
  const webIcon      = '🌐';
  const linkedinIcon = '🔗';

  const contactItems = [
    email    ? `<span class="contact-item">${emailIcon} ${san(email)}</span>`       : '',
    phone    ? `<span class="contact-item">${phoneIcon} ${san(phone)}</span>`       : '',
    location ? `<span class="contact-item">${locationIcon} ${san(location)}</span>` : '',
    website  ? `<span class="contact-item">${webIcon} ${san(website)}</span>`       : '',
    linkedin ? `<span class="contact-item">${linkedinIcon} ${san(linkedin)}</span>` : '',
  ].filter(Boolean).join('');

  const summarySection = summary ? `
    <div class="resume-section">
      <div class="section-heading">Professional Summary</div>
      <p class="resume-summary-text">${san(summary)}</p>
    </div>` : '';

  const experienceSection = experiences.length > 0 ? `
    <div class="resume-section">
      <div class="section-heading">Experience</div>
      ${experiences.map(exp => `
        <div class="experience-entry">
          <div class="entry-header">
            <div class="entry-title">${san(exp.position) || 'Position'}</div>
            <div class="entry-dates">
              ${formatDate(exp.startDate)} ${exp.startDate ? '–' : ''} ${exp.current ? 'Present' : formatDate(exp.endDate)}
            </div>
          </div>
          <div class="entry-subtitle">${san(exp.company)}</div>
          ${formatDesc(exp.description)}
        </div>
      `).join('')}
    </div>` : '';

  const educationSection = educations.length > 0 ? `
    <div class="resume-section">
      <div class="section-heading">Education</div>
      ${educations.map(edu => `
        <div class="education-entry">
          <div class="entry-header">
            <div class="entry-title">${san(edu.institution) || 'Institution'}</div>
            <div class="entry-dates">
              ${formatDate(edu.startDate)} ${edu.startDate ? '–' : ''} ${formatDate(edu.endDate)}
            </div>
          </div>
          <div class="entry-subtitle">${[san(edu.degree), san(edu.field)].filter(Boolean).join(', ')}</div>
          ${edu.gpa ? `<p class="entry-description">GPA: ${san(edu.gpa)}</p>` : ''}
        </div>
      `).join('')}
    </div>` : '';

  const skillsSection = skills.length > 0 ? `
    <div class="resume-section">
      <div class="section-heading">Skills</div>
      <div class="skills-grid">
        ${skills.map(s => `<span class="resume-skill-badge">${san(s)}</span>`).join('')}
      </div>
    </div>` : '';

  // Validate photo data URL before injecting into innerHTML (C-1)
  const safePhotoUrl = isValidPhotoDataUrl(photoDataUrl) ? photoDataUrl : null;

  // ── Classic Template ──
  if (currentTemplate === 'classic') {
    return `
      <div class="resume-header">
        ${safePhotoUrl ? `<img src="${safePhotoUrl}" class="resume-photo" alt="Profile photo" />` : ''}
        <div class="resume-header-text">
          <div class="resume-name">${san(fullName)}</div>
          ${jobTitle ? `<div class="resume-title">${san(jobTitle)}</div>` : ''}
          <div class="resume-contact">${contactItems}</div>
        </div>
      </div>
      <div class="resume-body">
        ${summarySection}${experienceSection}${educationSection}${skillsSection}
      </div>`;
  }

  // ── Modern Template ──
  if (currentTemplate === 'modern') {
    const sidebarSkills = skills.length > 0 ? `
      <div class="sidebar-section">
        <div class="sidebar-section-label">Skills</div>
        ${skills.map(s => `<span class="sidebar-skill-tag">${san(s)}</span>`).join('')}
      </div>` : '';

    const sidebarContact = (email || phone || location || website || linkedin) ? `
      <div class="sidebar-section">
        <div class="sidebar-section-label">Contact</div>
        ${email    ? `<div class="contact-item">${emailIcon} <span>${san(email)}</span></div>`       : ''}
        ${phone    ? `<div class="contact-item">${phoneIcon} <span>${san(phone)}</span></div>`       : ''}
        ${location ? `<div class="contact-item">${locationIcon} <span>${san(location)}</span></div>` : ''}
        ${website  ? `<div class="contact-item">${webIcon} <span>${san(website)}</span></div>`       : ''}
        ${linkedin ? `<div class="contact-item">${linkedinIcon} <span>${san(linkedin)}</span></div>` : ''}
      </div>` : '';

    return `
      <div class="resume-sidebar">
        ${safePhotoUrl ? `<img src="${safePhotoUrl}" class="resume-photo sidebar-photo" alt="Profile photo" />` : ''}
        <div class="sidebar-name">${san(fullName)}</div>
        ${jobTitle ? `<div class="sidebar-title">${san(jobTitle)}</div>` : ''}
        ${sidebarContact}
        ${sidebarSkills}
      </div>
      <div class="resume-main">
        ${summarySection}${experienceSection}${educationSection}
      </div>`;
  }

  // ── Minimal Template ──
  return `
    <div class="resume-header">
      ${safePhotoUrl ? `<img src="${safePhotoUrl}" class="resume-photo" alt="Profile photo" />` : ''}
      <div class="resume-header-text">
        <div class="resume-name">${san(fullName)}</div>
        ${jobTitle ? `<div class="resume-title">${san(jobTitle)}</div>` : ''}
        <div class="resume-contact">${contactItems}</div>
      </div>
    </div>
    <div class="resume-body">
      ${summarySection}${experienceSection}${educationSection}${skillsSection}
    </div>`;
}

// ── Live Preview ──────────────────────────────────────────
function updatePreview() {
  const page = document.getElementById('resumeOutput');

  page.className = 'resume-page';
  page.classList.add(`tmpl-${currentTemplate}`);

  page.innerHTML = buildResumeHTML();

  // Re-apply color variable after innerHTML replacement resets child inline styles
  page.style.setProperty('--resume-header-color', currentColor);

  // Summary char count with over-limit indicator
  const summary = document.getElementById('summary');
  if (summary) {
    const len = summary.value.length;
    const countEl = document.getElementById('summaryCount');
    const charCountEl = countEl && countEl.closest('.char-count');
    countEl.textContent = len;
    if (charCountEl) charCountEl.classList.toggle('over-limit', len > 400);
  }

  saveState();
}

// ── Save / Restore State ──────────────────────────────────
function saveState() {
  const state = {
    currentStep,
    currentTemplate,
    currentColor,
    skills,
    experiences,
    educations,
    photoDataUrl,
    fields: {
      firstName: (document.getElementById('firstName') || {}).value || '',
      lastName:  (document.getElementById('lastName')  || {}).value || '',
      jobTitle:  (document.getElementById('jobTitle')  || {}).value || '',
      email:     (document.getElementById('email')     || {}).value || '',
      phone:     (document.getElementById('phone')     || {}).value || '',
      location:  (document.getElementById('location')  || {}).value || '',
      website:   (document.getElementById('website')   || {}).value || '',
      linkedin:  (document.getElementById('linkedin')  || {}).value || '',
      summary:   (document.getElementById('summary')   || {}).value || '',
    }
  };

  try {
    localStorage.setItem('resumeforge_state', JSON.stringify(state));
  } catch (e) {
    // Quota exceeded — retry without the photo
    const stateFallback = Object.assign({}, state, { photoDataUrl: null, photoOmitted: true });
    try {
      localStorage.setItem('resumeforge_state', JSON.stringify(stateFallback));
    } catch (e2) {
      // Storage completely full — silently skip
    }
  }

  if (!_isLoading) {
    const indicator = document.getElementById('saveIndicator');
    if (indicator) {
      indicator.textContent = '\u2713 Saved';
      indicator.classList.add('visible');
      clearTimeout(indicator._hideTimer);
      indicator._hideTimer = setTimeout(() => indicator.classList.remove('visible'), 1800);
    }
  }
}

function loadState() {
  let raw;
  try {
    raw = localStorage.getItem('resumeforge_state');
  } catch (e) {
    return; // Storage unavailable
  }
  if (!raw) return;

  let state;
  try {
    state = JSON.parse(raw);
  } catch (e) {
    return; // Corrupt data — start fresh
  }

  _isLoading = true;

  // ── Restore scalar state ──
  if (typeof state.currentStep     === 'number') currentStep     = state.currentStep;
  if (typeof state.currentTemplate === 'string') currentTemplate = state.currentTemplate;
  if (typeof state.currentColor    === 'string') currentColor    = state.currentColor;

  // ── Restore arrays ──
  if (Array.isArray(state.skills)) skills = state.skills;
  if (Array.isArray(state.experiences)) {
    experiences = state.experiences.map(e => ({
      id:          Number(e.id),
      company:     e.company     || '',
      position:    e.position    || '',
      startDate:   e.startDate   || '',
      endDate:     e.endDate     || '',
      current:     Boolean(e.current),
      description: e.description || ''
    }));
  }
  if (Array.isArray(state.educations)) {
    educations = state.educations.map(e => ({
      id:          Number(e.id),
      institution: e.institution || '',
      degree:      e.degree      || '',
      field:       e.field       || '',
      startDate:   e.startDate   || '',
      endDate:     e.endDate     || '',
      gpa:         e.gpa         || ''
    }));
  }

  // Advance _nextId past all restored IDs to prevent collisions (L-8)
  const allIds = [...experiences, ...educations].map(e => e.id).filter(Number.isFinite);
  if (allIds.length > 0) _nextId = Math.max(...allIds) + 1;

  // ── Restore photo (with data URL validation) ──
  if (state.photoDataUrl && !state.photoOmitted && isValidPhotoDataUrl(state.photoDataUrl)) {
    photoDataUrl = state.photoDataUrl;
    const preview = document.getElementById('photoPreview');
    if (preview) {
      preview.style.backgroundImage    = `url(${photoDataUrl})`;
      preview.style.backgroundSize     = 'cover';
      preview.style.backgroundPosition = 'center';
      const svg  = preview.querySelector('svg');
      const hint = preview.querySelector('.photo-upload-hint');
      if (svg)  svg.style.display  = 'none';
      if (hint) hint.style.display = 'none';
    }
    const removeBtn = document.getElementById('photoRemoveBtn');
    if (removeBtn) removeBtn.style.display = 'block';
  }

  // ── Restore form fields ──
  if (state.fields) {
    const fieldIds = ['firstName','lastName','jobTitle','email','phone','location','website','linkedin','summary'];
    fieldIds.forEach(id => {
      const el = document.getElementById(id);
      if (el && state.fields[id] != null) el.value = state.fields[id];
    });
  }

  // ── Render dynamic lists ──
  renderExperiences();
  renderEducations();
  renderSkillTags();

  // ── Restore template + color UI ──
  selectTemplate(currentTemplate);
  selectColor(currentColor);

  // ── Restore step without animation ──
  const panels = document.querySelectorAll('.step-panel');
  const btns   = document.querySelectorAll('.step-btn');
  panels.forEach((panel, i) => {
    panel.classList.toggle('active', i === currentStep);
    panel.style.transform = '';
  });
  btns.forEach((btn, i) => btn.classList.toggle('active', i === currentStep));

  _isLoading = false;
  // updatePreview() is called by DOMContentLoaded after loadState() returns
}

// ── Clear all data ────────────────────────────────────────
function clearData() {
  if (!confirm('Clear all data and start over?')) return;
  try { localStorage.removeItem('resumeforge_state'); } catch (e) {}
  location.reload();
}

// ── Zoom ──────────────────────────────────────────────────
function adjustZoom(delta) {
  zoomLevel = Math.min(1.2, Math.max(0.4, zoomLevel + delta));
  document.getElementById('previewZoomWrapper').style.transform = `scale(${zoomLevel})`;
  document.getElementById('zoomLabel').textContent = `${Math.round(zoomLevel * 100)}%`;
}

window.addEventListener('DOMContentLoaded', () => {
  document.getElementById('previewZoomWrapper').style.transform = `scale(${zoomLevel})`;
  document.getElementById('zoomLabel').textContent = `${Math.round(zoomLevel * 100)}%`;

  loadState();

  const hasSavedState = (() => {
    try { return !!localStorage.getItem('resumeforge_state'); } catch (e) { return false; }
  })();

  if (!hasSavedState) {
    renderExperiences();
    renderEducations();
    selectColor(currentColor);
  }

  updatePreview();
});

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
  // Debounce: clear previous timer so rapid calls don't dismiss early (M-8)
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => toast.classList.remove('show'), 3000);
}

// ── PDF Download ──────────────────────────────────────────
async function downloadPDF() {
  // Prevent concurrent generation (L-9)
  if (_isGenerating) return;

  const source = document.getElementById('resumeOutput');

  // Guard against empty resume export (H-6)
  if (source.querySelector('.empty-placeholder')) {
    showToast('Please fill in some details before downloading.', 'error');
    return;
  }

  _isGenerating = true;
  const btn = document.getElementById('downloadBtn');
  const origText = btn.innerHTML;
  btn.innerHTML = `<svg class="spin" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12a9 9 0 11-6.219-8.56"/></svg> Generating…`;
  btn.disabled = true;

  const clone = source.cloneNode(true);

  // Resolve CSS custom property to a concrete color before html2canvas renders.
  // html2canvas cannot read CSS variables from external stylesheets (H-5).
  const resolvedColor = getComputedStyle(source).getPropertyValue('--resume-header-color').trim() || currentColor;
  clone.style.setProperty('--resume-header-color', resolvedColor);
  const headerEl = clone.querySelector('.resume-header') || clone.querySelector('.resume-sidebar');
  if (headerEl) headerEl.style.background = resolvedColor;

  clone.style.width      = '794px';
  clone.style.minHeight  = '';
  clone.style.boxShadow  = 'none';
  clone.style.fontFamily = "'Inter', Arial, sans-serif";

  const wrapper = document.createElement('div');
  wrapper.style.cssText = 'position:fixed;left:-9999px;top:0;width:794px;background:#fff';
  document.body.appendChild(wrapper);
  wrapper.appendChild(clone);

  await document.fonts.ready;

  const firstName = document.getElementById('firstName').value || 'Resume';
  const lastName  = document.getElementById('lastName').value  || '';
  const filename  = `${firstName}${lastName ? '_' + lastName : ''}_Resume.pdf`;

  const opt = {
    margin:      [0, 0, 0, 0],
    filename,
    image:       { type: 'jpeg', quality: 0.98 },
    html2canvas: { scale: 2, useCORS: true, letterRendering: true, logging: false },
    jsPDF:       { unit: 'px', format: [794, 1122], orientation: 'portrait' },
    pagebreak:   { mode: ['avoid-all', 'css', 'legacy'] },
  };

  try {
    await html2pdf().set(opt).from(clone).save();
    showToast('Resume downloaded successfully!', 'success');
  } catch (err) {
    console.error(err);
    showToast('Download failed. Please try again.', 'error');
  } finally {
    document.body.removeChild(wrapper);
    btn.innerHTML = origText;
    btn.disabled  = false;
    _isGenerating = false;
  }
}

// ── CSS for spin animation (injected) ────────────────────
const spinStyle = document.createElement('style');
spinStyle.textContent = `
  @keyframes spin { to { transform: rotate(360deg); } }
  .spin { animation: spin 1s linear infinite; }
`;
document.head.appendChild(spinStyle);
