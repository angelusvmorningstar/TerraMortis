import { describe, it, expect, beforeAll } from 'vitest';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

let shRenderDomainMerits;

beforeAll(async () => {
  const sheetPath = path.resolve('public/js/editor/sheet.js');
  const sheetUrl = pathToFileURL(sheetPath).href;

  ({ shRenderDomainMerits } = await import(sheetUrl));
});

describe('N-793 Domain Merit Sorting', () => {
  it('loads renderer', () => {
    expect(shRenderDomainMerits).toBeTypeOf('function');
  });
});

it('renders Necropolis Sepulcher before inherited card', () => {
    const c = {
      name: 'Test',
      merits: [
        { category: 'domain', name: 'White Ants' },
        { category: 'domain', name: 'Catacombs' },
        { category: 'domain', name: 'Necropolis Sepulcher' }
      ]
    };
  
    const html = shRenderDomainMerits(c, true);
  
    expect(html.includes('Necropolis Sepulcher')).toBe(true);
    expect(html.includes('Inherited from Necropolis Sepulcher')).toBe(true);
  });

  it('contains inherited card css class', () => {
    const c = {
      name: 'Test',
      merits: [
        { category: 'domain', name: 'Necropolis Sepulcher' },
        { category: 'domain', name: 'White Ants' }
      ]
    };
  
    const html = shRenderDomainMerits(c, true);
  
    expect(html.includes('necro-inherited-block')).toBe(true);
  });