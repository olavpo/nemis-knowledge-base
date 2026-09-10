---
layout: base.njk
title: Watch all videos
permalink: /watch-all-videos/
hero:
  title: Watch all videos
  subtitle: Every training video in one place
---

<div class="grid">
{%- for guide in collections.guides %}
  {%- if guide.data.video %}
  {%- set gridTitle = guide.data.video.title or guide.data.title %}
  <div class="video-card">
    <div class="video-wrapper">
      <iframe src="https://player.vimeo.com/video/{{ guide.data.video.id }}" title="{{ gridTitle }}" allowfullscreen></iframe>
    </div>
    <div class="video-info">
      <div class="video-title-row">
        <div class="video-title"><a href="{{ guide.url | url }}">{{ gridTitle }}</a></div>
        {%- if guide.data.video.minutes %}<span class="video-meta">{{ guide.data.video.minutes }} min</span>{% endif -%}
      </div>
      {%- if guide.data.video.gridDownload %}<a class="download-link" href="https://drive.google.com/uc?export=download&id={{ guide.data.video.gridDownload }}" target="_blank" rel="noopener">&darr; Download</a>{% endif -%}
    </div>
  </div>
  {%- endif -%}
{%- endfor %}
</div>
