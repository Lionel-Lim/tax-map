import type { AreaRecord } from '../domain/tax/area.js';
import { isRecord, isStringList } from '../domain/tax/validation.js';
import { browserFetch, DataLoadError, fetchJson, isArtifact } from './release.js';
import type { Fetcher, LoadedRelease } from './release.js';

const ENGLAND = 'E92000001';
const FIELDS = ['postcode', 'latitude', 'longitude', 'country', 'msoa21', 'sourceLad', 'status', 'terminationMonth', 'positionQuality'];
export interface PostcodeRecord {
  postcode: string; latitude: number | null; longitude: number | null; country: string | null;
  msoa21: string | null; sourceLad: string | null; status: 'current' | 'terminated';
  terminationMonth: string | null; positionQuality: string | null;
}
export type PostcodeStatus = 'found' | 'malformed' | 'unknown' | 'terminated' | 'outside-england'
  | 'outside-sample-coverage' | 'unavailable-area' | 'network-error';
export interface PostcodeResult {
  status: PostcodeStatus; message: string; record?: PostcodeRecord; area?: AreaRecord; reason?: string;
}
interface PostcodeIndex {
  schemaVersion: 1; fields: string[]; referencePeriod: string; countries: Record<string, string>;
  sampleMsoas: string[]; sampleLads: string[];
  shards: Record<string, { path: string; bytes: number; sha256: string; records: number }>;
}

/** Syntax is only a routing check. Country, existence and termination come from the pinned directory. */
export function normalisePostcode(input: string): string | null {
  const compact = input.replace(/\s/g, '').toUpperCase();
  // The historical directory also contains GIR, NOR and NPT outward codes.
  if (!/^[A-Z][A-Z0-9]{1,3}[0-9][A-Z]{2}$/.test(compact)) return null;
  return `${compact.slice(0, -3)} ${compact.slice(-3)}`;
}
function invalid(message: string): never { throw new DataLoadError('invalid-data', message); }
function validateIndex(value: unknown, release: LoadedRelease): PostcodeIndex {
  if (!isRecord(value) || value.schemaVersion !== 1 || !Array.isArray(value.fields) || value.fields.join('|') !== FIELDS.join('|')
    || value.referencePeriod !== '2025-05' || value.sourceId !== 'postcode-directory' || value.publicReleaseReady !== false
    || !isRecord(value.countries) || value.countries[ENGLAND] !== 'England'
    || !Object.values(value.countries).every(label => typeof label === 'string')
    || !isStringList(value.sampleMsoas) || !isStringList(value.sampleLads) || !isRecord(value.shards)) invalid('The postcode index is inconsistent with this release.');
  for (const [field, geography] of [['sampleMsoas', 'MSOA'], ['sampleLads', 'LAD']] as const) {
    const inventory = value[field] as string[];
    const expected = release.search.filter(area => area.geography === geography);
    if (inventory.length !== expected.length || new Set(inventory).size !== inventory.length
      || !inventory.every(code => release.searchByCode.get(code)?.geography === geography)) invalid('Postcode coverage does not match the area release.');
  }
  for (const [outward, shard] of Object.entries(value.shards)) {
    if (!/^[A-Z][A-Z0-9]{1,3}$/.test(outward) || !isRecord(shard) || !isArtifact(shard)
      || shard.path !== `postcodes/${outward}.json` || !Number.isSafeInteger(shard.records) || Number(shard.records) < 1) invalid('The postcode index contains an invalid shard.');
    const manifestEntry = release.manifest.artifacts[shard.path as string];
    if (!manifestEntry || manifestEntry.sha256 !== shard.sha256 || manifestEntry.bytes !== shard.bytes) invalid('The postcode shard metadata does not match the release manifest.');
  }
  return value as unknown as PostcodeIndex;
}
function validateShard(value: unknown, outward: string, index: PostcodeIndex): Map<string, PostcodeRecord> {
  if (!isRecord(value) || value.schemaVersion !== 1 || value.outward !== outward || !Array.isArray(value.rows)
    || value.rows.length !== index.shards[outward]?.records) invalid('The postcode shard is incomplete or has the wrong schema.');
  const records = new Map<string, PostcodeRecord>();
  const code = (v: unknown) => v === null || typeof v === 'string' && /^[A-Z]\d{8}$/.test(v);
  for (const row of value.rows) {
    if (!Array.isArray(row) || row.length !== FIELDS.length) invalid('The postcode shard contains an invalid record.');
    const [postcode, latitude, longitude, country, msoa21, sourceLad, status, terminationMonth, positionQuality] = row;
    if (typeof postcode !== 'string' || normalisePostcode(postcode) !== postcode || !postcode.startsWith(`${outward} `)
      || records.has(postcode) || !code(country) || !code(msoa21) || !code(sourceLad)
      || country !== null && !Object.hasOwn(index.countries, country)
      || status !== 'current' && status !== 'terminated'
      || status === 'current' && terminationMonth !== null
      || status === 'terminated' && (typeof terminationMonth !== 'string' || !/^\d{4}(0[1-9]|1[0-2])$/.test(terminationMonth))
      || positionQuality !== null && typeof positionQuality !== 'string') invalid('The postcode shard contains inconsistent source fields.');
    const noLocation = latitude === null && longitude === null;
    if (!noLocation && !(typeof latitude === 'number' && Number.isFinite(latitude) && latitude >= -90 && latitude <= 90
      && typeof longitude === 'number' && Number.isFinite(longitude) && longitude >= -180 && longitude <= 180)) invalid('The postcode location is invalid.');
    records.set(postcode, { postcode, latitude, longitude, country, msoa21, sourceLad, status, terminationMonth, positionQuality } as PostcodeRecord);
  }
  return records;
}

/** A release-local cache avoids repeated downloads; failed requests are evicted so retry can recover. */
export function createPostcodeLookup(release: LoadedRelease, options: { fetcher?: Fetcher } = {}): { lookup(input: string): Promise<PostcodeResult> } {
  const fetcher = options.fetcher ?? browserFetch;
  let indexPromise: Promise<PostcodeIndex> | undefined;
  const shardPromises = new Map<string, Promise<Map<string, PostcodeRecord>>>();
  const getIndex = () => {
    indexPromise ??= fetchJson(`${release.basePath}/postcodes/index.json`, fetcher)
      .then(value => validateIndex(value, release)).catch(error => { indexPromise = undefined; throw error; });
    return indexPromise;
  };
  const getShard = (outward: string, index: PostcodeIndex) => {
    let promise = shardPromises.get(outward);
    if (!promise) {
      // Derive this fixed local path from the validated outward code, never from the full postcode.
      promise = fetchJson(`${release.basePath}/postcodes/${outward}.json`, fetcher)
        .then(value => validateShard(value, outward, index)).catch(error => { shardPromises.delete(outward); throw error; });
      shardPromises.set(outward, promise);
    }
    return promise;
  };
  return { async lookup(input: string): Promise<PostcodeResult> {
    const postcode = normalisePostcode(input);
    if (!postcode) return { status: 'malformed', message: 'Enter a full postcode, for example LE1 1RE.' };
    try {
      const index = await getIndex(), outward = postcode.split(' ')[0]!;
      const unknown = (): PostcodeResult => ({ status: 'unknown', message: 'This postcode is not in the May 2025 directory. It may be newer; try searching for an area instead.' });
      if (!Object.hasOwn(index.shards, outward)) return unknown();
      const record = (await getShard(outward, index)).get(postcode);
      if (!record) return unknown();
      if (record.status === 'terminated') return { status: 'terminated', record,
        message: `This postcode was terminated in ${record.terminationMonth!.slice(0, 4)}-${record.terminationMonth!.slice(4)}. Search for a current postcode or an area.` };
      if (record.country === null) return { status: 'unavailable-area', record, reason: 'country-unavailable',
        message: 'The directory has no country assignment for this postcode, so a supported estimate cannot be selected.' };
      if (record.country !== ENGLAND) return { status: 'outside-england', record,
        message: `This postcode is in ${index.countries[record.country]}. This comparison covers England only.` };
      if (!record.msoa21) return { status: 'unavailable-area', record, reason: 'geography-unavailable',
        message: 'This English postcode has no neighbourhood assignment in the pinned directory. Search for an area instead.' };
      if (!index.sampleMsoas.includes(record.msoa21)) return release.manifest.scope === 'england'
        ? { status: 'unavailable-area', record, reason: 'geography-unavailable',
          message: 'This English postcode has no supported neighbourhood in the pinned England release. Search for an area instead.' }
        : { status: 'outside-sample-coverage', record,
          message: 'This is a known English postcode outside the five-authority sample. Search a sample area to explore the comparison.' };
      const area = await release.ensureArea(record.msoa21);
      if (!area) return { status: 'unavailable-area', record, reason: 'area-missing', message: 'The neighbourhood statistics are unavailable in this release.' };
      if (area.availability === 'unavailable') return { status: 'unavailable-area', record, area,
        reason: area.unavailableReasons.join(', '), message: `${area.name} is in ${release.manifest.scope === 'england' ? 'this release' : 'the sample'}, but required inputs are unavailable. The area details explain the missing data.` };
      if (area.parentCode !== record.sourceLad) return { status: 'unavailable-area', record, reason: 'geography-needs-review',
        message: 'The postcode and neighbourhood have conflicting authority assignments. No postcode estimate can be selected.' };
      return { status: 'found', record, area, message: `Selected ${area.name}. This is a neighbourhood estimate, not an individual property valuation.` };
    } catch (error) {
      return { status: 'network-error', reason: error instanceof DataLoadError ? error.code : 'network-error',
        message: error instanceof Error ? error.message : 'The postcode data could not be loaded. Try again.' };
    }
  } };
}
