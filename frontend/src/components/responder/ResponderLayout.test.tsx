/**
 * Tests for ResponderLayout component
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render as rtlRender, screen } from '@testing-library/react';
import ResponderLayout from './ResponderLayout';
import { useResponderStore } from '../../store/responderStore';
import { useAuthStore } from '../../store/authStore';
import { MemoryRouter } from 'react-router-dom';
import { I18nextProvider } from 'react-i18next';
import i18n from '../../i18n';

// Mock the stores
vi.mock('../../store/responderStore', () => ({
  useResponderStore: vi.fn(),
}));

vi.mock('../../store/authStore', () => ({
  useAuthStore: vi.fn(),
  RESPONDER_COLORS: {
    ambulance: { bg: 'bg-red-50', text: 'text-red-700', accent: 'bg-red-600', gradient: 'from-red-500 to-red-600' },
    police: { bg: 'bg-indigo-50', text: 'text-indigo-700', accent: 'bg-indigo-600', gradient: 'from-indigo-500 to-indigo-600' },
    civil_defense: { bg: 'bg-orange-50', text: 'text-orange-700', accent: 'bg-orange-600', gradient: 'from-orange-500 to-orange-600' },
    firefighter: { bg: 'bg-red-50', text: 'text-red-800', accent: 'bg-red-700', gradient: 'from-red-600 to-red-700' },
  },
  RESPONDER_LABELS: {
    ambulance: 'Ambulance',
    police: 'Police',
    civil_defense: 'Civil Defense',
    firefighter: 'Firefighter',
  },
}));

const mockActiveCase = {
  id: 'test-001',
  caseNumber: 'AMB-2024-001',
  type: 'medical',
  priority: 'critical',
  status: 'pending',
  responderType: 'ambulance',
  briefDescription: 'Test case',
  pickupLocation: {
    lat: 31.9539,
    lng: 35.9106,
    address: '123 Main St',
  },
  dispatchPhone: '+962-6-911',
  createdAt: new Date().toISOString(),
  assignedAt: new Date().toISOString(),
};

// Custom render that wraps with providers but no nested router
function render(ui: React.ReactElement, options: { initialEntries?: string[] } = {}) {
  const { initialEntries = ['/ambulance'] } = options;
  return rtlRender(
    <I18nextProvider i18n={i18n}>
      <MemoryRouter initialEntries={initialEntries}>
        {ui}
      </MemoryRouter>
    </I18nextProvider>
  );
}

describe('ResponderLayout', () => {
  const mockLogout = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    (useResponderStore as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      activeCase: null,
      isConnected: true,
      isOnDuty: true,
    });
    (useAuthStore as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      logout: mockLogout,
    });
  });

  it('renders layout with navigation tabs', () => {
    render(
      <ResponderLayout
        responderType="ambulance"
        tabs={[
          { path: '', label: 'Case', icon: 'case' },
          { path: '/map', label: 'Map', icon: 'map' },
        ]}
      />
    );

    expect(screen.getByText('Case')).toBeInTheDocument();
    expect(screen.getByText('Map')).toBeInTheDocument();
  });

  it('renders header with responder type label', () => {
    render(
      <ResponderLayout
        responderType="ambulance"
        tabs={[{ path: '', label: 'Case', icon: 'case' }]}
      />
    );

    expect(screen.getByText('Ambulance')).toBeInTheDocument();
  });

  it('shows Active badge when active case exists', () => {
    (useResponderStore as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      activeCase: mockActiveCase,
      isConnected: true,
      isOnDuty: true,
    });

    render(
      <ResponderLayout
        responderType="ambulance"
        tabs={[{ path: '', label: 'Case', icon: 'case' }]}
      />
    );

    expect(screen.getByText('Active')).toBeInTheDocument();
  });

  it('does not show Active badge when no active case', () => {
    render(
      <ResponderLayout
        responderType="ambulance"
        tabs={[{ path: '', label: 'Case', icon: 'case' }]}
      />
    );

    expect(screen.queryByText('Active')).not.toBeInTheDocument();
  });

  it('shows Live status when connected', () => {
    render(
      <ResponderLayout
        responderType="ambulance"
        tabs={[{ path: '', label: 'Case', icon: 'case' }]}
      />
    );

    expect(screen.getByText('Live')).toBeInTheDocument();
  });

  it('shows Offline status when disconnected', () => {
    (useResponderStore as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      activeCase: null,
      isConnected: false,
      isOnDuty: true,
    });

    render(
      <ResponderLayout
        responderType="ambulance"
        tabs={[{ path: '', label: 'Case', icon: 'case' }]}
      />
    );

    expect(screen.getByText('Offline')).toBeInTheDocument();
  });

  it('renders all provided tabs', () => {
    const tabs = [
      { path: '', label: 'Case', icon: 'case' as const },
      { path: '/map', label: 'Map', icon: 'map' as const },
      { path: '/history', label: 'History', icon: 'history' as const },
    ];

    render(<ResponderLayout responderType="ambulance" tabs={tabs} />);

    tabs.forEach((tab) => {
      expect(screen.getByText(tab.label)).toBeInTheDocument();
    });
  });

  it('applies fixed positioning for bottom navigation', () => {
    render(
      <ResponderLayout
        responderType="ambulance"
        tabs={[{ path: '', label: 'Case', icon: 'case' }]}
      />
    );

    const nav = screen.getByRole('navigation');
    expect(nav).toHaveClass('fixed');
    expect(nav).toHaveClass('bottom-0');
  });

  it('renders logout button', () => {
    render(
      <ResponderLayout
        responderType="ambulance"
        tabs={[{ path: '', label: 'Case', icon: 'case' }]}
      />
    );

    const logoutButton = screen.getByLabelText('Logout');
    expect(logoutButton).toBeInTheDocument();
  });

  it('renders language toggle', () => {
    render(
      <ResponderLayout
        responderType="ambulance"
        tabs={[{ path: '', label: 'Case', icon: 'case' }]}
      />
    );

    // Should show AR or EN button
    expect(screen.getByText(/AR|EN/)).toBeInTheDocument();
  });

  it('renders correct label for police responder type', () => {
    render(
      <ResponderLayout
        responderType="police"
        tabs={[{ path: '', label: 'Case', icon: 'case' }]}
      />,
      { initialEntries: ['/police'] }
    );

    expect(screen.getByText('Police')).toBeInTheDocument();
  });
});
