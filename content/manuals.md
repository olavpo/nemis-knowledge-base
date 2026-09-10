---
layout: base.njk
title: Manuals
permalink: /manuals/
hero:
  title: Reference manuals
  subtitle: Full handbooks for download and offline reference
  icon: true
---

<div class="section">
  <div class="section-label">Manuals</div>
  {%- for manual in manuals %}
  {%- set pdf = manual.file | pdfMeta %}
  <a class="card" href="{{ ('/assets/pdfs/' + manual.file) | url }}">
    <div class="card-text">
      <div class="card-title">{{ manual.title }}</div>
      <div class="card-desc">{{ manual.description }}</div>
      <div class="card-tags">
        <span class="tag tag-pdf">PDF</span>
        <span class="tag tag-size">{{ pdf.size }}</span>
      </div>
    </div>
    <div class="card-download">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
        <polyline points="7 10 12 15 17 10"/>
        <line x1="12" y1="15" x2="12" y2="3"/>
      </svg>
      <span>Download</span>
    </div>
  </a>
  {%- endfor %}
</div>
