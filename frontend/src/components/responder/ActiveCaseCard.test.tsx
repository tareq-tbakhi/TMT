/**
 * Tests for ActiveCaseCard component
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '../../test/testUtils';
import ActiveCaseCard from './ActiveCaseCard';
import type { AssignedCase } from '../../types/responderTypes';

const mockCase: AssignedCase = {
  id: 'test-001',
  caseNumber: 'AMB-2024-001',
  type: 'medical',
  priority: 'critical',
  status: 'pending',
  responderType: 'ambulance',
  briefDescription: 'Cardiac arrest - 65yo male',
  victimCount: 1,
  notes: 'Family on scene',
  pickupLocation: {
    lat: 31.9539,
    lng: 35.9106,
    address: '123 Main St, Amman',
    landmark: 'Near City Mall',
  },
  destination: {
    lat: 31.9654,
    lng: 35.9310,
    name: 'Jordan Hospital',
    address: 'Queen Rania St, Amman',
    type: 'hospital',
    phone: '+962-6-560-8080',
  },
  aiRecommendations: ['Prepare defibrillator'],
  dispatchPhone: '+962-6-911',
  createdAt: new Date().toISOString(),
  assignedAt: new Date().toISOString(),
};

describe('ActiveCaseCard', () => {
  it('renders case information correctly', () => {
    render(
      <ActiveCaseCard caseData={mockCase} responderType="ambulance" />
    );

    expect(screen.getByText('Cardiac arrest - 65yo male')).toBeInTheDocument();
    expect(screen.getByText('AMB-2024-001')).toBeInTheDocument();
    expect(screen.getByText(/critical/i)).toBeInTheDocument();
  });

  it('renders pickup location', () => {
    render(
      <ActiveCaseCard caseData={mockCase} responderType="ambulance" />
    );

    expect(screen.getByText('123 Main St, Amman')).toBeInTheDocument();
    expect(screen.getByText('Near City Mall')).toBeInTheDocument();
  });

  it('renders destination when provided', () => {
    render(
      <ActiveCaseCard caseData={mockCase} responderType="ambulance" />
    );

    expect(screen.getByText('Jordan Hospital')).toBeInTheDocument();
    expect(screen.getByText('Queen Rania St, Amman')).toBeInTheDocument();
  });

  it('renders victim count when provided', () => {
    render(
      <ActiveCaseCard caseData={mockCase} responderType="ambulance" />
    );

    expect(screen.getByText('1 person')).toBeInTheDocument();
  });

  it('renders plural victim count correctly', () => {
    const caseWithMultipleVictims = { ...mockCase, victimCount: 3 };
    render(
      <ActiveCaseCard caseData={caseWithMultipleVictims} responderType="ambulance" />
    );

    expect(screen.getByText('3 people')).toBeInTheDocument();
  });

  it('renders navigate button when onNavigate provided', () => {
    const handleNavigate = vi.fn();
    render(
      <ActiveCaseCard
        caseData={mockCase}
        responderType="ambulance"
        onNavigate={handleNavigate}
      />
    );

    const navigateButton = screen.getByText('Navigate to Location');
    expect(navigateButton).toBeInTheDocument();

    fireEvent.click(navigateButton);
    expect(handleNavigate).toHaveBeenCalledTimes(1);
  });

  it('does not render navigate button when onNavigate not provided', () => {
    render(
      <ActiveCaseCard caseData={mockCase} responderType="ambulance" />
    );

    expect(screen.queryByText('Navigate to Location')).not.toBeInTheDocument();
  });

  it('renders dispatch phone link', () => {
    render(
      <ActiveCaseCard caseData={mockCase} responderType="ambulance" />
    );

    const dispatchLink = screen.getByText('Dispatch');
    expect(dispatchLink).toBeInTheDocument();
    expect(dispatchLink.closest('a')).toHaveAttribute('href', 'tel:+962-6-911');
  });

  it('applies correct priority styling for critical', () => {
    render(
      <ActiveCaseCard caseData={mockCase} responderType="ambulance" />
    );

    // Check for priority banner
    expect(screen.getByText(/critical priority/i)).toBeInTheDocument();
  });

  it('applies correct priority styling for different priorities', () => {
    const lowPriorityCase = { ...mockCase, priority: 'low' as const };
    render(
      <ActiveCaseCard caseData={lowPriorityCase} responderType="ambulance" />
    );

    expect(screen.getByText(/low priority/i)).toBeInTheDocument();
  });

  it('handles case without destination', () => {
    const caseWithoutDestination = { ...mockCase, destination: undefined };
    render(
      <ActiveCaseCard caseData={caseWithoutDestination} responderType="ambulance" />
    );

    expect(screen.queryByText('Jordan Hospital')).not.toBeInTheDocument();
    expect(screen.getByText('123 Main St, Amman')).toBeInTheDocument();
  });

  it('handles case without landmark', () => {
    const caseWithoutLandmark = {
      ...mockCase,
      pickupLocation: { ...mockCase.pickupLocation, landmark: undefined },
    };
    render(
      <ActiveCaseCard caseData={caseWithoutLandmark} responderType="ambulance" />
    );

    expect(screen.queryByText('Near City Mall')).not.toBeInTheDocument();
  });
});
