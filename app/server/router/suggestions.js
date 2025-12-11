const LANGUAGE_MAP = {
  en: [
    'Business automation: describe the workflow you want to simplify.',
    'Agency services: share the channel or platform you are optimizing (Google Ads, Meta, etc.).',
    'DevOps integrations: mention the cloud or system you need to stabilize.',
    'About CoolBits.ai: ask me how we work and what we can deliver next.',
  ],
  es: [
    'Automatización empresarial: describe el proceso que deseas simplificar.',
    'Servicios de agencia: indica la plataforma en la que trabajas (Google Ads, Meta, etc.).',
    'Integraciones DevOps: menciona la nube o sistema que necesitas estabilizar.',
    'Sobre CoolBits.ai: pregúntame cómo trabajamos y qué podemos entregar a continuación.',
  ],
  fr: [
    'Automatisation métier : décris le processus que tu veux simplifier.',
    'Services agence : indique la plateforme que tu optimises (Google Ads, Meta, etc.).',
    'Intégrations DevOps : mentionne le cloud ou le système que tu dois stabiliser.',
    'À propos de CoolBits.ai : demande comment nous opérons et ce que nous pouvons livrer.'
  ],
  de: [
    'Business-Automatisierung: Beschreibe den Prozess, den du vereinfachen möchtest.',
    'Agentur-Services: Nenne die Plattform (Google Ads, Meta usw.), die du optimierst.',
    'DevOps-Integrationen: Teile mit, welche Cloud oder welches System stabilisiert werden muss.',
    'Über CoolBits.ai: Frag mich, wie wir arbeiten und was wir als Nächstes liefern können.'
  ],
  ro: [
    'Automatizare business: descrie fluxul pe care vrei să îl simplifici.',
    'Servicii de agenție: spune care platformă (Google Ads, Meta etc.) optimizezi.',
    'Integrări DevOps: menționează cloud-ul sau sistemul care trebuie stabilizat.',
    'Despre CoolBits.ai: întreabă-mă cum lucrăm și ce putem livra în continuare.',
  ],
};

export function getSuggestions(userLanguage = 'en') {
  const lang = String(userLanguage || 'en').slice(0, 2).toLowerCase();
  return LANGUAGE_MAP[lang] || LANGUAGE_MAP.en;
}
