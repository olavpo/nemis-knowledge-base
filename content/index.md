---
layout: base.njk
title: DNEMIS Knowledge Base
hero: true
sections:
  - key: mobile
    label: Mobile phone
    title: Using your mobile phone
    description: Using the DNEMIS app on your Android phone
  - key: computer
    label: Computer or laptop
    title: Using your computer or laptop
    description: Via any web browser (Chrome, Firefox or Edge)
---

{% for group in sections %}
{% include "section.njk" %}
{% if not loop.last %}<hr class="divider">{% endif %}
{% endfor %}
