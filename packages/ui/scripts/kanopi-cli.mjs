#!/usr/bin/env node
// kanopi-cli — pilote `window.kanopi` (la façade de pilotage, cf. lib/pilot/kanopi-api.ts) depuis
// un terminal, via Playwright (Chrome headless pointé sur le serveur de dev). Troisième front :
// même API que l'UI, sans clic manuel. NE réimplémente rien — chaque commande = un appel
// `window.kanopi.*`. Outil de DEV/test (l'API façade est DEV-only).
//
// Usage :
//   node scripts/kanopi-cli.mjs <commande> [args...]        # une commande
//   node scripts/kanopi-cli.mjs run <fichier.kanopi>        # un script (une commande par ligne)
//   cat repro.kanopi | node scripts/kanopi-cli.mjs run -    # depuis stdin
// Options : KANOPI_BASE_URL (défaut http://localhost:5173) · --headed (fenêtre visible).
//
// Commandes (délèguent à window.kanopi) :
//   eval | play | pause | stop | hush | toggleLoop | toggleReRandom
//   setTempo <bpm>
//   load <nom-de-carte>                     # charge une scène de la bibliothèque (clic carte)
//   inspect <clé> [args]                    # structure | transportState | effectiveTempo | loop |
//                                           #   reRandom | generation | flat | modulations [input]
//   clearObserved                           # vide le tampon d'observation des modulations
//   wait <ms>                               # pause (utile entre play et une mesure)

/* global document, window */
// Les callbacks passés à `page.evaluate` / `page.waitForFunction` s'exécutent dans le NAVIGATEUR
// (Playwright), où `document`/`window` existent — PAS dans ce process Node. Déclaré pour eslint.
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';

const BASE_URL = process.env.KANOPI_BASE_URL || process.env.KANOPI_URL || 'http://localhost:5173';
const HEADED = process.argv.includes('--headed');

/** Découpe un script (une commande par ligne, `#` = commentaire, lignes vides ignorées). */
function parseScript(text) {
  return text
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#'))
    .map(tokenize);
}

/** Tokenise une ligne en respectant les guillemets (pour les noms de scène avec espaces). */
function tokenize(line) {
  const out = [];
  const re = /"([^"]*)"|'([^']*)'|(\S+)/g;
  let m;
  while ((m = re.exec(line)) !== null) out.push(m[1] ?? m[2] ?? m[3]);
  return out;
}

/** Coerce un argument "171" → 171, "true"/"false" → booléen ; sinon string. */
function coerce(a) {
  if (a === 'true') return true;
  if (a === 'false') return false;
  if (a !== '' && !Number.isNaN(Number(a))) return Number(a);
  return a;
}

/** Exécute UNE commande sur la page (délègue à window.kanopi ou à un helper DOM pour `load`). */
async function runCommand(page, tokens) {
  const [name, ...rawArgs] = tokens;
  const args = rawArgs.filter((a) => a !== '--headed').map(coerce);

  if (name === 'wait') {
    await page.waitForTimeout(Number(args[0] ?? 0));
    return undefined;
  }

  if (name === 'load') {
    // Phase 1 : le chargement passe par l'UI (bibliothèque). Clic sur la carte dont le titre
    // contient <nom>. (Un `kanopi.loadScene(id)` propre = ajout phase 2 quand l'action sera
    // extraite du composant en service.)
    const wanted = String(args[0] ?? '');
    return page.evaluate(async (needle) => {
      const btn = document.querySelector('button[title="Library"]');
      if (btn) btn.click();
      await new Promise((r) => setTimeout(r, 400));
      const card = [...document.querySelectorAll('article.card')].find((el) =>
        (el.textContent || '').toLowerCase().includes(needle.toLowerCase())
      );
      if (!card) throw new Error(`scène introuvable dans la bibliothèque: "${needle}"`);
      const load = [...card.querySelectorAll('button')].find((b) =>
        /load|charger/i.test(b.textContent || '')
      );
      (load || card.querySelector('button')).click();
      await new Promise((r) => setTimeout(r, 500));
      return { loaded: needle };
    }, wanted);
  }

  // Générique : window.kanopi[name](...args) ou window.kanopi.inspect[key](...args).
  return page.evaluate(
    async ({ name, args }) => {
      const k = window.kanopi;
      if (!k) throw new Error('window.kanopi absent — DEV-only, le serveur tourne-t-il ?');
      if (name === 'inspect') {
        const [key, ...rest] = args;
        const fn = k.inspect?.[key];
        if (typeof fn !== 'function') throw new Error(`inspect inconnu: ${key}`);
        return fn.apply(k.inspect, rest);
      }
      const fn = k[name];
      if (typeof fn !== 'function') throw new Error(`commande inconnue: ${name}`);
      return await fn.apply(k, args);
    },
    { name, args }
  );
}

async function main() {
  const argv = process.argv.slice(2).filter((a) => a !== '--headed');
  if (argv.length === 0) {
    console.error('usage: kanopi-cli <commande> [args] | run <fichier|->  (--headed pour voir)');
    process.exit(2);
  }

  let commands;
  if (argv[0] === 'run') {
    const src = argv[1] === '-' ? readFileSync(0, 'utf8') : readFileSync(argv[1], 'utf8');
    commands = parseScript(src);
  } else {
    commands = [argv];
  }

  const browser = await chromium.launch({ headless: !HEADED });
  const page = await browser.newPage();
  try {
    await page.goto(BASE_URL, { waitUntil: 'load' });
    await page.waitForFunction(() => !!window.kanopi, null, { timeout: 15000 });
    for (const cmd of commands) {
      const result = await runCommand(page, cmd);
      if (result !== undefined) console.log(JSON.stringify(result));
    }
  } finally {
    await browser.close();
  }
}

main().catch((e) => {
  console.error('kanopi-cli:', e.message);
  process.exit(1);
});
