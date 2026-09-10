---
layout: base.njk
title: Manuals
permalink: /manuals/
hero:
  title: Reference manuals
  subtitle: Full handbooks for download and offline reference
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
    <div class="card-arrow">&darr;</div>
  </a>
  {%- endfor %}
</div>
