import fs from 'fs';
import path from 'path';

const PROMPTS = {
  core: fs.readFileSync(
    path.resolve('prompts/system/coolbits-core.md'),
    'utf8'
  ),
  business: fs.readFileSync(
    path.resolve('prompts/system/coolbits-business.md'),
    'utf8'
  ),
  agency: fs.readFileSync(
    path.resolve('prompts/system/coolbits-agency.md'),
    'utf8'
  ),
  devops: fs.readFileSync(
    path.resolve('prompts/system/coolbits-devops.md'),
    'utf8'
  ),
  style: fs.readFileSync(
    path.resolve('prompts/system/coolbits-style.md'),
    'utf8'
  ),
  antiSpam: fs.readFileSync(
    path.resolve('prompts/system/coolbits-anti-spam.md'),
    'utf8'
  ),
};

export function classifyMessage(message) {
  const text = String(message || '').toLowerCase().trim();

  if (!text) {
    return {
      intent: 'smalltalk-safe',
      systemPrompt: PROMPTS.core,
    };
  }

  if (
    text.includes('hello') ||
    text.includes('hi ') ||
    text.includes('salut') ||
    text.includes('hey') ||
    text.includes('buna')
  ) {
    return {
      intent: 'smalltalk-safe',
      systemPrompt: PROMPTS.core,
    };
  }

  if (text.includes('coolbits')) {
    return {
      intent: 'about-us',
      systemPrompt: PROMPTS.core,
      redirectMessage:
        'CoolBits.ai is an independent AI development studio that designs, builds, and maintains small, sharp tools inside existing businesses.',
    };
  }

  if (
    text.includes('business') ||
    text.includes('automat') ||
    text.includes('proces') ||
    text.includes('workflow')
  ) {
    return {
      intent: 'business',
      systemPrompt: PROMPTS.business,
    };
  }

  if (
    text.includes('ads') ||
    text.includes('facebook') ||
    text.includes('google') ||
    text.includes('meta') ||
    text.includes('ppc') ||
    text.includes('campanie')
  ) {
    return {
      intent: 'agency',
      systemPrompt: PROMPTS.agency,
    };
  }

  if (
    text.includes('server') ||
    text.includes('deploy') ||
    text.includes('docker') ||
    text.includes('ci/cd') ||
    text.includes('cloud') ||
    text.includes('terraform')
  ) {
    return {
      intent: 'devops',
      systemPrompt: PROMPTS.devops,
    };
  }

  return {
    intent: 'smalltalk-safe',
    systemPrompt: PROMPTS.core,
  };
}
