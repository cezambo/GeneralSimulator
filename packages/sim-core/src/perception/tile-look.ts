/**
 * Prosa de inspeção de tile (look / hover). Legível estilo DF/Brogue, sem
 * números crus de intensidade — o cliente pode prefixar coordenadas.
 *
 * Não é relato de agente (A-031): é o que o jogador lê ao apontar o cursor.
 * Estados wet/smoky aqui são etiquetas de tile, não líquidos/gases V2.
 */

export interface TileLookState {
  readonly type: string;
  readonly intensity: number;
}

export interface TileLookInput {
  readonly type: string;
  readonly materialId: string;
  readonly states?: readonly TileLookState[];
  readonly integrity?: number;
  readonly temperature?: number;
  /** Campos densos do tile (ex.: porta aberta). */
  readonly state?: Record<string, unknown>;
  /** Móveis/itens no tile (só defId amigável). */
  readonly objects?: readonly { defId: string }[];
}

const AMBIENT_C = 20;

/** Frase(s) em português sobre o que o tile está a revelar. */
export function describeTileLook(input: TileLookInput): string {
  const noun = tileNoun(input.type, input.materialId, input.state);
  const bits: string[] = [noun];

  const integrityBit = integrityPhrase(input.integrity);
  if (integrityBit) bits.push(integrityBit);

  const tempBit = temperaturePhrase(input.temperature);
  if (tempBit) bits.push(tempBit);

  for (const st of input.states ?? []) {
    if (st.intensity <= 0) continue;
    const p = statePhrase(st.type, st.intensity);
    if (p) bits.push(p);
  }

  const objBit = objectsPhrase(input.objects);
  if (objBit) bits.push(objBit);

  // Uma linha compacta; o cliente pode partir em duas se quiser.
  return bits.join(' · ');
}

function tileNoun(
  type: string,
  materialId: string,
  state: Record<string, unknown> | undefined,
): string {
  const mat = materialLabel(materialId);
  switch (type) {
    case 'wall':
      return `parede de ${mat}`;
    case 'floor':
      if (materialId === 'cinza' || materialId === 'carvao' || materialId === 'lascas') {
        return `chão com ${mat}`;
      }
      return `chão de ${mat}`;
    case 'door': {
      const open = Boolean(state?.['isOpen']);
      return `porta de ${mat} (${open ? 'aberta' : 'fechada'})`;
    }
    case 'road':
      return `caminho de ${mat}`;
    case 'water':
      return `água (${mat})`;
    case 'roof':
      return `telhado de ${mat}`;
    default:
      return `${type} de ${mat}`;
  }
}

function materialLabel(id: string): string {
  switch (id) {
    case 'pinho':
      return 'pinho';
    case 'madeira':
      return 'madeira';
    case 'pedra':
      return 'pedra';
    case 'carvao':
      return 'carvão';
    case 'cinza':
      return 'cinza';
    case 'lascas':
      return 'lascas';
    case 'ferro':
      return 'ferro';
    case 'aco':
      return 'aço';
    case 'vidro':
      return 'vidro';
    case 'terra':
      return 'terra';
    case 'areia':
      return 'areia';
    default:
      return id.replace(/_/g, ' ');
  }
}

function integrityPhrase(integrity: number | undefined): string | undefined {
  if (integrity === undefined) return undefined;
  if (integrity >= 95) return undefined;
  if (integrity >= 70) return 'um pouco danificado';
  if (integrity >= 40) return 'bem danificado';
  if (integrity > 0) return 'quase a desabar';
  return 'destruído';
}

function temperaturePhrase(temperature: number | undefined): string | undefined {
  if (temperature === undefined) return undefined;
  const t = temperature;
  // Demo V1 usa °C (ambiente ~20). Kelvin (~288) cairia no ramo "frio".
  if (t >= 250) return 'ardente';
  if (t >= 120) return 'muito quente';
  if (t >= 55) return 'quente';
  if (t >= AMBIENT_C + 12) return 'morno';
  if (t <= 0) return 'gelado';
  if (t < AMBIENT_C - 8) return 'frio';
  return undefined;
}

function statePhrase(type: string, intensity: number): string | undefined {
  switch (type) {
    case 'burning':
      if (intensity >= 70) return 'em chamas';
      if (intensity >= 35) return 'queimando';
      return 'chamejando fraco';
    case 'wet':
      if (intensity >= 70) return 'encharcado';
      if (intensity >= 35) return 'molhado';
      return 'úmido';
    case 'smoky':
      if (intensity >= 60) return 'cheio de fumaça';
      if (intensity >= 25) return 'fumegante';
      return 'com cheiro de fumaça';
    case 'frozen':
      return 'congelado';
    default:
      return type;
  }
}

function objectsPhrase(objects: readonly { defId: string }[] | undefined): string | undefined {
  if (!objects || objects.length === 0) return undefined;
  const names = objects.map((o) => objectLabel(o.defId));
  if (names.length === 1) return `com ${names[0]}`;
  if (names.length === 2) return `com ${names[0]} e ${names[1]}`;
  return `com ${names.slice(0, -1).join(', ')} e ${names[names.length - 1]}`;
}

function objectLabel(defId: string): string {
  const raw = defId.replace(/_/g, ' ');
  // "cadeira madeira" → artigo + nome curto
  if (raw.startsWith('cadeira')) return `uma ${raw}`;
  if (raw.startsWith('mesa')) return `uma ${raw}`;
  if (raw.startsWith('cama')) return `uma ${raw}`;
  if (raw.startsWith('banco')) return `um ${raw}`;
  return raw;
}
