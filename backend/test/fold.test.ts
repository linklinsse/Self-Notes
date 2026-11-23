import { describe, expect, it } from 'vitest';
import { categoryNameKey, contentKey, fold, searchKey, titleKey } from '../src/lib/fold.js';

describe('folded keys', () => {
  it('NOTE-10: fold ignores case, accents and compatibility forms', () => {
    expect(fold('Été À PARIS')).toBe('ete a paris');
    expect(fold('Crème Brûlée')).toBe('creme brulee');
    expect(fold('ﬁchier Ⅳ')).toBe('fichier iv');
    expect(fold('Ελληνικά')).toBe('ελληνικα');
  });

  it('NOTE-10: search keys hold no LIKE wildcard', () => {
    expect(searchKey('100% my_file')).not.toMatch(/[%_]/);
    expect(searchKey('Ｆｕｌｌ％')).toBe(searchKey('full%'));
  });

  it('NOTE-9: blank titles have no key, so they sort last', () => {
    expect(titleKey('  ')).toBeNull();
    expect(titleKey(' Zèbre ')).toBe('zebre');
  });

  it('NOTE-17: locked content is never indexed', () => {
    expect(contentKey('Secret', true)).toBe('');
    expect(contentKey('Secret', false)).toBe('secret');
  });

  it('CAT-1: category names clash regardless of case, not of accents', () => {
    expect(categoryNameKey('Travail')).toBe(categoryNameKey('TRAVAIL'));
    expect(categoryNameKey('Été')).toBe(categoryNameKey('ÉTÉ'));
    expect(categoryNameKey('Été')).not.toBe(categoryNameKey('Ete'));
  });
});
