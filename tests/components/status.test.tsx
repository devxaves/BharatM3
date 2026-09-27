// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { ConfidenceMeter, MatchTypeBadge, StatusBadge, scoreTone } from '@/components/ui/status';
import { ReasonCodes, reasonTone } from '@/components/review/comparison';

describe('semantic status components', () => {
  it('match type badge uses human labels and marks vetoes', () => {
    render(<MatchTypeBadge type="RELATED_BUT_NOT_EQUIVALENT" vetoed />);
    const el = screen.getByTitle('RELATED_BUT_NOT_EQUIVALENT');
    expect(el).toHaveTextContent('Related · not equiv.');
    expect(el.className).toMatch(/veto/);
  });

  it('confidence meter shows the score and strikes it through when vetoed', () => {
    const { container } = render(<ConfidenceMeter score={0.912} vetoed />);
    const value = screen.getByText('0.912');
    expect(value.className).toMatch(/line-through/);
    expect(container.querySelector('[title*="vetoed"]')).not.toBeNull();
  });

  it('confidence tones follow routing thresholds: ≥0.95 high, 0.75–0.95 amber, else neutral; veto overrides', () => {
    expect(scoreTone(0.97)).toBe('high');
    expect(scoreTone(0.8)).toBe('amber');
    expect(scoreTone(0.5)).toBe('neutral');
    expect(scoreTone(0.99, true)).toBe('veto');
  });

  it('status badge renders the decision state', () => {
    render(<StatusBadge status="APPROVED" />);
    expect(screen.getByText('Approved')).toBeInTheDocument();
  });

  it('reason codes are colour-coded by governance meaning, never colour alone (code text always shown)', () => {
    render(<ReasonCodes codes={['VETO_PRESSURE_CLASS_MISMATCH', 'ATTRIBUTE_FINGERPRINT_MATCH', 'ATTR_CONFLICT:SEAL_TYPE']} />);
    expect(screen.getByText('VETO_PRESSURE_CLASS_MISMATCH')).toBeInTheDocument();
    expect(reasonTone('VETO_PRESSURE_CLASS_MISMATCH')).toBe('veto');
    expect(reasonTone('ATTRIBUTE_FINGERPRINT_MATCH')).toBe('high');
    expect(reasonTone('ATTR_CONFLICT:SEAL_TYPE')).toBe('amber');
  });
});
