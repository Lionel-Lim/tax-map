import { readFile } from 'node:fs/promises';
import { ENGLAND_DATA_VERSION } from '$lib/domain/tax/area.js';
import type { AreaRecord } from '$lib/domain/tax/area.js';

/** Prerender a compact coverage report; never ship the full provenance dataset to this page. */
export async function load() {
  const root = `.build/public-static/data/public-v1/${ENGLAND_DATA_VERSION}`;
  const [manifest, dataset] = await Promise.all([
    readFile(`${root}/manifest.json`, 'utf8').then(JSON.parse),
    readFile(`${root}/areas.json`, 'utf8').then(JSON.parse),
  ]);
  const areas = dataset.areas as AreaRecord[];
  const councils = areas.filter(area => area.geography === 'LAD').map(council => {
    const neighbourhoods = areas.filter(area => area.parentCode === council.code);
    return { code: council.code, name: council.name, availability: council.availability,
      available: neighbourhoods.filter(area => area.availability === 'available').length, total: neighbourhoods.length };
  }).sort((a,b) => a.name.localeCompare(b.name));
  return { releaseId: ENGLAND_DATA_VERSION, councils,
    publicPostcodes: manifest.distribution as { postcodeRecords: number; postcodeShards: number },
    coverage: manifest.coverage as Record<'LAD' | 'MSOA', { total: number; available: number; unavailable: number }>,
    postcodeCoverage: manifest.postcodeCoverage as { currentEnglishPostcodes: number; withAvailableMsoa: number },
    dwellingCoverage: manifest.dwellingCoverage.MSOA as { reportedDwellingsInAvailableAreas: number; totalReportedDwellings: number },
    boundaryExclusions: areas.filter(area => area.unavailableReasons.includes('boundary-invalid')).map(area => ({ code: area.code, name: area.name })),
  };
}
