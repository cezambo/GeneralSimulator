#!/usr/bin/env node
// X-009: os tipos TypeScript são gerados dos schemas, nunca escritos à mão.
//
// schemas/ é a fonte única (02-ARQUITETURA seção 9). Tipo escrito à mão ao lado
// de um schema é uma segunda verdade sobre a mesma forma, e as duas divergem no
// primeiro campo que alguém acrescenta com pressa.
//
// Com --check não escreve nada e falha se o arquivo em disco estiver diferente
// do que seria gerado. É o modo do CI e do `npm run check`: garante que ninguém
// editou o gerado à mão nem esqueceu de regerar depois de mexer no schema.

import { compile } from 'json-schema-to-typescript';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SCHEMAS = join(ROOT, 'schemas');
const OUT_DIR = join(ROOT, 'packages', 'sim-core', 'src', 'types');

const checkOnly = process.argv.includes('--check');

const SOURCES = [
  { schema: 'domain.schema.json', out: 'domain.ts', title: 'Domain' },
  { schema: 'llm-io.schema.json', out: 'llm-io.ts', title: 'LlmIo' },
];

const BANNER = (schema) =>
  [
    '/* eslint-disable */',
    '/**',
    ` * GERADO DE schemas/${schema}. NÃO EDITAR À MÃO.`,
    ' *',
    ' * Regerar com `npm run types`. X-009.',
    ' */',
    '',
  ].join('\n');

let diverged = false;

for (const { schema, out, title } of SOURCES) {
  const schemaPath = join(SCHEMAS, schema);
  if (!existsSync(schemaPath)) {
    console.error(`schema ausente: ${schema}`);
    process.exit(1);
  }

  const parsed = JSON.parse(readFileSync(schemaPath, 'utf8'));

  // O schema não tem tipo raiz: é uma sacola de $defs (X-003 ainda espera um
  // SimulationState, e ele não existe). Sem raiz, o compilador geraria uma
  // interface vazia e nada mais, então declaramos uma raiz sintética que
  // referencia cada $def para forçar a emissão de todos.
  const root = {
    $id: parsed.$id,
    title,
    type: 'object',
    additionalProperties: false,
    properties: Object.fromEntries(
      Object.keys(parsed.$defs ?? {}).map((name) => [name, { $ref: `#/$defs/${name}` }]),
    ),
    $defs: parsed.$defs,
  };

  const body = await compile(root, title, {
    bannerComment: '',
    additionalProperties: false,
    declareExternallyReferenced: true,
    unreachableDefinitions: true,
    style: { singleQuote: true, semi: true, printWidth: 100 },
    cwd: SCHEMAS,
  });

  const content = BANNER(schema) + body;
  const outPath = join(OUT_DIR, out);

  if (checkOnly) {
    const atual = existsSync(outPath) ? readFileSync(outPath, 'utf8') : '';
    if (atual !== content) {
      console.error(`✗ ${out} está fora de sincronia com ${schema} — rode \`npm run types\``);
      diverged = true;
    } else {
      console.log(`✓ ${out} em sincronia com ${schema}`);
    }
    continue;
  }

  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(outPath, content, 'utf8');
  const count = Object.keys(parsed.$defs ?? {}).length;
  console.log(`✓ ${out}: ${count} tipos de ${schema}`);
}

if (diverged) process.exit(1);
