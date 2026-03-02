# ResumeForge

A clean, fast, browser-based resume builder with live preview and one-click PDF export. No sign-up, no server, no build step — just open and start typing.

## Features

- **Live Preview** — see your resume update in real time as you type
- **3 Templates** — Classic, Modern, and Minimal layouts
- **PDF Export** — downloads a perfectly formatted A4 PDF via html2pdf.js
- **Photo Upload** — add a profile photo (JPEG, PNG, WebP, GIF)
- **Drag & Drop Ordering** — reorder work experience and education entries
- **Auto-Save** — progress is saved to `localStorage` automatically
- **Undo** — revert the last destructive action
- **Color Accent** — pick a custom accent colour for your resume header
- **Sample Data** — load example content to see how it looks instantly
- **Zero Dependencies** — no npm, no bundler, no framework

## Getting Started

Clone the repo and open `index.html` directly in your browser:

```bash
git clone https://github.com/your-username/resume-builder.git
cd resume-builder
open index.html        # macOS
# or just double-click index.html in your file manager
```

No installation required.

## Project Structure

```
resume-builder/
├── index.html    # App shell and multi-step form
├── app.js        # All application logic
├── style.css     # Design system and template styles
└── README.md
```

## Templates

| Template | Description |
|----------|-------------|
| **Classic** | Full-width dark header with name, title, and contact info |
| **Modern** | Two-column layout with a dark sidebar for contact and skills |
| **Minimal** | Clean, single-column design with a bold border separator |

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Markup | HTML5 |
| Styling | CSS3 (custom properties, grid, flexbox) |
| Logic | Vanilla JavaScript (ES6+) |
| PDF Export | [html2pdf.js v0.10.1](https://github.com/eKoopmans/html2pdf.js) via CDN |
| Fonts | System font stack (no external fonts) |

## Browser Support

Works in any modern browser that supports CSS custom properties and the FileReader API (Chrome, Firefox, Safari, Edge).

## License

MIT
