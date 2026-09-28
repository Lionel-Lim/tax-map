import { AREA_SCHEMA_VERSION, ENGLAND_DATA_VERSION, SUPPORTED_DATA_VERSIONS, compareArea } from '../domain/tax/area.js';
import type { AreaRecord } from '../domain/tax/area.js';
import { POLICY_VERSION, validatePolicy } from '../domain/tax/policy.js';
import type { Policy } from '../domain/tax/policy.js';
import { isRecord, isStringList } from '../domain/tax/validation.js';

export type Fetcher = (url: string) => Promise<Pick<Response, 'ok' | 'status' | 'json'>>;
export type Geography = 'LAD' | 'MSOA';
export interface Artifact { bytes: number; sha256: string }
export interface AreaShard extends Artifact { path: string; records: number }
export interface Coverage { available: number; unavailable: number; total: number; unavailableReasons: Record<string, number> }
export interface ReleaseManifest {
  schemaVersion: string; releaseId: string; methodologyVersion: string;
  scope: string; publicReleaseReady: boolean;
  defaultComparison: string; sdltRuleVersion: string | null;
  policyVersions: string[]; propertyTypes: string[];
  artifacts: Record<string, Artifact>;
  coverage: Record<Geography, Coverage>;
  geographyVintages: Record<Geography, string>;
  sources: { id: string; referencePeriod: string; downloadUrl: string; sha256: string; bytes: number }[];
  initialAreasPath?: 'councils.json';
  areaShards?: Record<string, AreaShard>;
}
export interface SearchRecord {
  code: string; name: string; geography: Geography; parentCode: string | null;
  availability: 'available' | 'unavailable'; terms: string[];
}
export interface LoadedRelease {
  manifest: ReleaseManifest; policy: Policy; areas: AreaRecord[]; search: SearchRecord[];
  areaByCode: Map<string, AreaRecord>; searchByCode: Map<string, SearchRecord>; basePath: string;
  loadedDistricts: Set<string>;
  loadDistrict(ladCode: string): Promise<AreaRecord[]>;
  ensureArea(code: string): Promise<AreaRecord | undefined>;
}
export type DataErrorCode = 'unsupported-data-version' | 'unsupported-data-schema' | 'unsupported-policy-version' | 'invalid-data' | 'network-error';
export class DataLoadError extends Error {
  constructor(public readonly code: DataErrorCode, message: string) {
    super(message); this.name = 'DataLoadError';
  }
}
export const browserFetch: Fetcher = (url) => fetch(url);

export async function fetchJson(url: string, fetcher: Fetcher): Promise<unknown> {
  let response: Awaited<ReturnType<Fetcher>>;
  try { response = await fetcher(url); }
  catch { throw new DataLoadError('network-error', 'Could not load the pinned data. Check your connection and try again.'); }
  if (!response.ok) throw new DataLoadError('network-error', `The pinned data could not be loaded (HTTP ${response.status}). Try again.`);
  try { return await response.json(); }
  catch { throw new DataLoadError('invalid-data', 'A data file could not be read. Try again or report the unavailable release.'); }
}
function invalid(message: string): never { throw new DataLoadError('invalid-data', message); }
export function isArtifact(value: unknown): value is Artifact {
  return isRecord(value) && Number.isSafeInteger(value.bytes) && Number(value.bytes) > 0
    && typeof value.sha256 === 'string' && /^[0-9a-f]{64}$/.test(value.sha256);
}
export function assertSupportedDataVersion(version: string): void {
  if (!SUPPORTED_DATA_VERSIONS.some(supported => supported === version)) throw new DataLoadError('unsupported-data-version',
    `Data release “${version}” is unavailable or unsupported. Its results cannot be recreated with a different release.`);
}

function validateManifest(value: unknown, dataVersion: string): ReleaseManifest {
  if (!isRecord(value)) invalid('The release manifest is invalid.');
  if (value.schemaVersion !== AREA_SCHEMA_VERSION) throw new DataLoadError('unsupported-data-schema', 'This data schema is not supported.');
  if (value.releaseId !== dataVersion) invalid('The loaded release does not match the requested version.');
  if (!isStringList(value.policyVersions) || value.policyVersions.length !== 1 || value.policyVersions[0] !== POLICY_VERSION) {
    throw new DataLoadError('unsupported-policy-version', 'The data release declares an unsupported policy.');
  }
  const national = dataVersion === ENGLAND_DATA_VERSION;
  if (value.methodologyVersion !== 'phase0-v1' || value.scope !== (national ? 'england' : 'five-authority-sample')
    || value.publicReleaseReady !== false || value.defaultComparison !== 'ongoing-owner' || value.sdltRuleVersion !== null
    || !Array.isArray(value.propertyTypes) || value.propertyTypes.length !== 1 || value.propertyTypes[0] !== 'all'
    || !isRecord(value.artifacts) || !isRecord(value.coverage) || !isRecord(value.geographyVintages)
    || !Array.isArray(value.sources)) invalid('The pinned release metadata is inconsistent.');
  const required = national ? ['councils.json', 'search.json', 'policy.json', 'postcodes/index.json', 'boundaries/lad.geojson']
    : ['areas.json', 'search.json', 'policy.json', 'postcodes/index.json', 'boundaries/lad.geojson', 'boundaries/msoa.geojson'];
  for (const path of required) {
    if (!isArtifact(value.artifacts[path])) invalid(`The release is missing metadata for ${path}.`);
  }
  for (const geography of ['LAD', 'MSOA']) {
    const coverage = value.coverage[geography];
    if (!isRecord(coverage) || !['available', 'unavailable', 'total'].every(k => Number.isSafeInteger(coverage[k]) && Number(coverage[k]) >= 0)
      || Number(coverage.available) + Number(coverage.unavailable) !== coverage.total || !isRecord(coverage.unavailableReasons)
      || !Object.values(coverage.unavailableReasons).every(n => Number.isSafeInteger(n) && Number(n) >= 0)
      || typeof value.geographyVintages[geography] !== 'string') invalid('The release coverage metadata is invalid.');
  }
  for (const source of value.sources) {
    if (!isRecord(source) || !isArtifact(source) || typeof source.id !== 'string' || typeof source.referencePeriod !== 'string'
      || typeof source.downloadUrl !== 'string' || !source.downloadUrl.startsWith('https://')) invalid('The release source metadata is invalid.');
  }
  if (national) {
    if (value.initialAreasPath !== 'councils.json' || !isRecord(value.areaShards)) invalid('The England release has no valid neighbourhood shard inventory.');
    let total = 0;
    for (const [parent, shard] of Object.entries(value.areaShards)) {
      if (!/^E\d{8}$/.test(parent) || !isRecord(shard) || !isArtifact(shard)
        || shard.path !== `areas/msoa/${parent}.json` || !Number.isSafeInteger(shard.records) || Number(shard.records) < 1) {
        invalid('The neighbourhood shard inventory contains an invalid district.');
      }
      const artifact = value.artifacts[shard.path as string];
      if (!isArtifact(artifact) || artifact.bytes !== shard.bytes || artifact.sha256 !== shard.sha256) {
        invalid('Neighbourhood shard metadata does not match the release artifact inventory.');
      }
      total += Number(shard.records);
    }
    if (total !== Number((value.coverage.MSOA as Record<string, unknown>).total)) invalid('Neighbourhood shard counts do not match release coverage.');
  } else if (value.initialAreasPath !== undefined || value.areaShards !== undefined) {
    invalid('The original sample must retain its complete area artifact.');
  }
  return value as unknown as ReleaseManifest;
}

function validateAreas(value: unknown, manifest: ReleaseManifest): AreaRecord[] {
  if (!isRecord(value) || value.schemaVersion !== AREA_SCHEMA_VERSION || value.releaseId !== manifest.releaseId || !Array.isArray(value.areas)) {
    invalid('Area statistics do not match the requested release.');
  }
  const seen = new Set<string>();
  for (const candidate of value.areas) {
    // Use the same structural, provenance and exact-baseline validation as the calculation engine.
    const result = compareArea(candidate, { dataVersion: manifest.releaseId, dataSchemaVersion: manifest.schemaVersion,
      policyVersion: POLICY_VERSION, mode: 'ongoing-owner', jurisdiction: 'England', residenceScope: 'primary-residence' });
    if (!isRecord(candidate) || typeof candidate.code !== 'string' || result.status === 'invalid-input' || result.status !== candidate.availability) {
      invalid('An area statistic has invalid inputs or provenance.');
    }
    if (seen.has(candidate.code)) invalid('The release contains duplicate area codes.');
    seen.add(candidate.code);
  }
  return value.areas as AreaRecord[];
}

function validateCoverage(rows: { geography: Geography; availability: 'available' | 'unavailable' }[], manifest: ReleaseManifest, geographies: Geography[] = ['LAD', 'MSOA']): void {
  for (const geography of geographies) {
    const members = rows.filter(area => area.geography === geography), coverage = manifest.coverage[geography];
    if (members.length !== coverage.total || members.filter(area => area.availability === 'available').length !== coverage.available) {
      invalid('Area coverage does not match the release manifest.');
    }
  }
}
function matchesSearch(area: AreaRecord, row: SearchRecord | undefined): boolean {
  return row !== undefined && row.name === area.name && row.geography === area.geography
    && row.parentCode === area.parentCode && row.availability === area.availability;
}
function validateSearch(value: unknown, manifest: ReleaseManifest): SearchRecord[] {
  if (!isRecord(value) || value.schemaVersion !== AREA_SCHEMA_VERSION || !Array.isArray(value.areas)
    || value.releaseId !== undefined && value.releaseId !== manifest.releaseId) invalid('The area search index is invalid.');
  const seen = new Set<string>();
  for (const row of value.areas) {
    if (!isRecord(row) || typeof row.code !== 'string' || !/^E\d{8}$/.test(row.code) || seen.has(row.code)
      || typeof row.name !== 'string' || !row.name.trim() || !isStringList(row.terms) || !row.terms.length
      || row.geography !== 'LAD' && row.geography !== 'MSOA'
      || row.availability !== 'available' && row.availability !== 'unavailable'
      || row.geography === 'LAD' && row.parentCode !== null
      || row.geography === 'MSOA' && (typeof row.parentCode !== 'string' || !/^E\d{8}$/.test(row.parentCode))) {
      invalid('An area search record is invalid.');
    }
    seen.add(row.code);
  }
  const search = value.areas as SearchRecord[], byCode = new Map(search.map(row => [row.code, row]));
  validateCoverage(search, manifest);
  for (const row of search) {
    if (row.geography === 'MSOA' && byCode.get(row.parentCode!)?.geography !== 'LAD') invalid('An area has no matching parent authority.');
  }
  if (manifest.areaShards) {
    const councils = search.filter(row => row.geography === 'LAD');
    if (Object.keys(manifest.areaShards).length !== councils.length) invalid('The district inventory does not match the search index.');
    const counts = new Map<string, number>();
    for (const row of search) if (row.geography === 'MSOA') counts.set(row.parentCode!, (counts.get(row.parentCode!) ?? 0) + 1);
    for (const council of councils) {
      if (manifest.areaShards[council.code]?.records !== (counts.get(council.code) ?? 0)) invalid('A district shard count does not match the search index.');
    }
  }
  return search;
}

/** Explicit versions never resolve through the active pointer or fall back to a newer release. */
export async function loadRelease(options: { dataVersion?: string; fetcher?: Fetcher } = {}): Promise<LoadedRelease> {
  const dataVersion = options.dataVersion ?? ENGLAND_DATA_VERSION, fetcher = options.fetcher ?? browserFetch;
  assertSupportedDataVersion(dataVersion);
  const basePath = `/data/${dataVersion}`;
  const manifest = validateManifest(await fetchJson(`${basePath}/manifest.json`, fetcher), dataVersion);
  const [rawAreas, rawSearch, rawPolicy] = await Promise.all([
    fetchJson(`${basePath}/${manifest.initialAreasPath ?? 'areas.json'}`, fetcher), fetchJson(`${basePath}/search.json`, fetcher), fetchJson(`${basePath}/policy.json`, fetcher),
  ]);
  const checkedPolicy = validatePolicy(rawPolicy);
  if (!checkedPolicy.valid) throw new DataLoadError('unsupported-policy-version', 'The loaded policy does not match the supported policy version.');
  const areas = validateAreas(rawAreas, manifest), search = validateSearch(rawSearch, manifest);
  const searchByCode = new Map(search.map(row => [row.code, row]));
  for (const area of areas) if (!matchesSearch(area, searchByCode.get(area.code))) invalid('The initial statistics do not match the search index.');
  if (manifest.areaShards && areas.some(area => area.geography !== 'LAD')) invalid('England initial statistics must contain councils only.');
  validateCoverage(areas, manifest, manifest.areaShards ? ['LAD'] : ['LAD', 'MSOA']);
  const areaByCode = new Map(areas.map(area => [area.code, area]));
  const districts = new Map<string, SearchRecord[]>();
  for (const row of search) {
    if (row.geography !== 'MSOA') continue;
    const members = districts.get(row.parentCode!) ?? [];
    members.push(row); districts.set(row.parentCode!, members);
  }
  const loadedDistricts = new Set<string>(manifest.areaShards ? [] : [...districts.keys()]);
  const districtPromises = new Map<string, Promise<AreaRecord[]>>();
  const loadDistrict = (ladCode: string): Promise<AreaRecord[]> => {
    if (searchByCode.get(ladCode)?.geography !== 'LAD') return Promise.reject(new DataLoadError('invalid-data', 'The requested council is not part of this release.'));
    if (loadedDistricts.has(ladCode)) return Promise.resolve((districts.get(ladCode) ?? []).map(row => areaByCode.get(row.code)!));
    let promise = districtPromises.get(ladCode);
    if (!promise) {
      const shard = manifest.areaShards?.[ladCode];
      if (!shard) return Promise.reject(new DataLoadError('invalid-data', 'The requested council has no neighbourhood shard.'));
      promise = fetchJson(`${basePath}/${shard.path}`, fetcher).then(value => {
        if (!isRecord(value) || value.parentCode !== ladCode) invalid('The neighbourhood shard belongs to a different council.');
        const rows = validateAreas(value, manifest);
        if (rows.length !== shard.records) invalid('The neighbourhood shard is incomplete.');
        for (const area of rows) {
          if (area.geography !== 'MSOA' || area.parentCode !== ladCode || areaByCode.has(area.code)
            || !matchesSearch(area, searchByCode.get(area.code))) invalid('A neighbourhood shard does not match its search metadata.');
        }
        // Validate the whole district before exposing any of it to callers.
        for (const area of rows) areaByCode.set(area.code, area);
        loadedDistricts.add(ladCode);
        return rows;
      }).catch(error => { districtPromises.delete(ladCode); throw error; });
      districtPromises.set(ladCode, promise);
    }
    return promise;
  };
  const ensureArea = async (code: string): Promise<AreaRecord | undefined> => {
    const existing = areaByCode.get(code);
    if (existing) return existing;
    const row = searchByCode.get(code);
    if (!row) return undefined;
    if (row.geography === 'MSOA') await loadDistrict(row.parentCode!);
    return areaByCode.get(code);
  };
  return { manifest, policy: checkedPolicy.policy, areas, search, areaByCode, searchByCode, basePath, loadedDistricts, loadDistrict, ensureArea };
}

/** Name/code lookup remains usable without the map or a postcode request. */
export function searchAreas(release: LoadedRelease, input: string, geography?: Geography): SearchRecord[] {
  const query = input.trim().toLocaleLowerCase('en-GB');
  return release.search.filter(row => (!geography || row.geography === geography)
    && (!query || row.terms.some(term => term.toLocaleLowerCase('en-GB').includes(query))));
}
