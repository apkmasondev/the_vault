import { describe, expect, it } from 'vitest';
import { copyForCue } from '../src/components/Experience';
import { operatorTrace } from '../src/components/Finale';

describe('directional narrative copy', () => {
  it('describes the physical sequence when it runs backwards', () => {
    expect(copyForCue('opening', false, true)).toEqual([
      'CONTAINMENT APERTURE',
      'CLOSING',
    ]);
  });

  it('keeps permanent destruction ahead of scroll direction', () => {
    expect(copyForCue('stability', true, true)).toEqual([
      'NOTHING LEFT TO CONTAIN',
      'THE CHAMBER HOLDS DUST',
    ]);
  });
});

describe('operator trace', () => {
  it('records the most consequential outcome', () => {
    expect(operatorTrace({ contacts: 9, strikes: 7, resonant: true, destroyed: true }))
      .toBe('OPERATOR CAUSED TOTAL SPECIMEN LOSS');
  });

  it('distinguishes contact, force and refusal', () => {
    expect(operatorTrace({ contacts: 2, strikes: 0, resonant: false, destroyed: false }))
      .toBe('DIRECT CONTACT CONFIRMED');
    expect(operatorTrace({ contacts: 2, strikes: 1, resonant: false, destroyed: false }))
      .toBe('FORCE APPLIED TO SPECIMEN');
    expect(operatorTrace({ contacts: 0, strikes: 0, resonant: false, destroyed: false }))
      .toBe('OPERATOR REFUSED CONTACT');
  });

  it('labels reduced-motion observation mode without blaming the operator', () => {
    expect(operatorTrace({
      contacts: 0,
      strikes: 0,
      resonant: false,
      destroyed: false,
      observationOnly: true,
    })).toBe('OBSERVATION MODE — NO CONTACT REQUESTED');
  });
});
