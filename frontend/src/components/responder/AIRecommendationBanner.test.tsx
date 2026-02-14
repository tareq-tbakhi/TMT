/**
 * Tests for AIRecommendationBanner component
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '../../test/testUtils';
import AIRecommendationBanner from './AIRecommendationBanner';

describe('AIRecommendationBanner', () => {
  it('renders nothing when recommendations array is empty', () => {
    const { container } = render(<AIRecommendationBanner recommendations={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing when recommendations is undefined', () => {
    const { container } = render(<AIRecommendationBanner recommendations={undefined as any} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders AI recommendations header', () => {
    render(<AIRecommendationBanner recommendations={['Test recommendation']} />);

    expect(screen.getByText('AI Recommendations')).toBeInTheDocument();
  });

  it('renders AI badge', () => {
    render(<AIRecommendationBanner recommendations={['Test recommendation']} />);

    expect(screen.getByText('AI')).toBeInTheDocument();
  });

  it('renders single recommendation', () => {
    render(<AIRecommendationBanner recommendations={['Prepare defibrillator']} />);

    expect(screen.getByText('Prepare defibrillator')).toBeInTheDocument();
  });

  it('renders multiple recommendations with numbered items', () => {
    const recommendations = [
      'Prepare defibrillator',
      'Bring oxygen tank',
      'Alert hospital',
    ];
    render(<AIRecommendationBanner recommendations={recommendations} />);

    recommendations.forEach((rec) => {
      expect(screen.getByText(rec)).toBeInTheDocument();
    });

    // Check for numbered indicators
    expect(screen.getByText('1')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
  });

  it('uses custom title when provided', () => {
    render(
      <AIRecommendationBanner
        recommendations={['Test']}
        title="Equipment Needed"
      />
    );

    expect(screen.getByText('Equipment Needed')).toBeInTheDocument();
  });

  it('applies info variant styling by default', () => {
    render(<AIRecommendationBanner recommendations={['Test']} />);

    const banner = screen.getByText('AI Recommendations').closest('div')?.parentElement?.parentElement;
    expect(banner).toHaveClass('bg-blue-50');
  });

  it('applies warning variant styling', () => {
    render(
      <AIRecommendationBanner recommendations={['Test']} variant="warning" />
    );

    const banner = screen.getByText('AI Recommendations').closest('div')?.parentElement?.parentElement;
    expect(banner).toHaveClass('bg-amber-50');
  });

  it('applies equipment variant styling', () => {
    render(
      <AIRecommendationBanner recommendations={['Test']} variant="equipment" />
    );

    const banner = screen.getByText('AI Recommendations').closest('div')?.parentElement?.parentElement;
    expect(banner).toHaveClass('bg-purple-50');
  });
});
