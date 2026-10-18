import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { OMNIBAR_CONTRACT_VERSION } from './omnibar-contract';

// Provenance: ./omnibar-contract is src/omnibar-contract/ from openmrs-esm-omnibar-app at 8f0565d
// (8f0565d9103687a053cf6c2d432279d76115ef93, branch feat/provider-contract), copied byte for byte.
// Don't edit the copy: fix the omnibar and copy the folder again, then update these hashes.
const vendoredFrom = '8f0565d9103687a053cf6c2d432279d76115ef93';
const sha256ByFile = {
  'README.md': '423d743ed214de7c8a77e5a9ef878f9d41b9120595c2534433bb9d704cf9ac51',
  'index.ts': '275cd95a992b02e4a239e88d64c0f70404f51a3f1696d91a7505a3bca60853ba',
  'provider-boundary.tsx': 'c48a90eeeffc40a9f5e06610d6f1a4cb2be63f05ba40e6d2d2eb1ca4cdeee40d',
  'query-hints.ts': 'fced175451550eefac9d55bd72ca8e0447c5cad884c007e0bf4fa8b6c12d37d7',
  'server-unreachable.ts': '3983b518545d58a0f09e7753bf5e63bc43c306578706eff3a4bbd21c2c1008e3',
  'types.ts': '90224005686e2339a01910808abd02c39ff1d4cf289db3ff641300c5b6c9f89e',
};

const folder = join(dirname(fileURLToPath(import.meta.url)), 'omnibar-contract');

describe(`the omnibar contract copied from omnibar ${vendoredFrom.slice(0, 7)}`, () => {
  it('has exactly the files of that commit, byte for byte', () => {
    expect(readdirSync(folder).sort()).toEqual(Object.keys(sha256ByFile).sort());
    for (const [file, sha256] of Object.entries(sha256ByFile)) {
      expect([file, createHash('sha256').update(readFileSync(join(folder, file))).digest('hex')]).toEqual([
        file,
        sha256,
      ]);
    }
  });

  it('is contract version 1', () => {
    expect(OMNIBAR_CONTRACT_VERSION).toBe(1);
  });
});
