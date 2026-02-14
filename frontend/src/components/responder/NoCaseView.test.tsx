/**
 * Tests for NoCaseView component
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '../../test/testUtils';
import NoCaseView from './NoCaseView';

describe('NoCaseView', () => {
  const defaultProps = {
    responderType: 'ambulance' as const,
    isConnected: true,
  };

  it('renders Standing By message when connected', () => {
    render(<NoCaseView {...defaultProps} />);

    expect(screen.getByText('Standing By')).toBeInTheDocument();
  });

  it('renders Connection Lost message when disconnected', () => {
    render(<NoCaseView {...defaultProps} isConnected={false} />);

    expect(screen.getByText('Connection Lost')).toBeInTheDocument();
  });

  it('shows Connected to Dispatch status when connected', () => {
    render(<NoCaseView {...defaultProps} />);

    expect(screen.getByText('Connected to Dispatch')).toBeInTheDocument();
  });

  it('shows Reconnecting status when disconnected', () => {
    render(<NoCaseView {...defaultProps} isConnected={false} />);

    expect(screen.getByText('Reconnecting...')).toBeInTheDocument();
  });

  it('displays appropriate message for ambulance responder', () => {
    render(<NoCaseView {...defaultProps} responderType="ambulance" />);

    expect(screen.getByText(/ambulance dispatch/i)).toBeInTheDocument();
  });

  it('displays appropriate message for police responder', () => {
    render(<NoCaseView {...defaultProps} responderType="police" />);

    expect(screen.getByText(/police dispatch/i)).toBeInTheDocument();
  });

  it('displays appropriate message for firefighter responder', () => {
    render(<NoCaseView {...defaultProps} responderType="firefighter" />);

    expect(screen.getByText(/fire(fighter)? dispatch/i)).toBeInTheDocument();
  });

  it('displays appropriate message for civil defense responder', () => {
    render(<NoCaseView {...defaultProps} responderType="civil_defense" />);

    expect(screen.getByText(/civil defense dispatch/i)).toBeInTheDocument();
  });

  it('renders Load Demo Case button when onLoadDemo provided', () => {
    const handleLoadDemo = vi.fn();
    render(<NoCaseView {...defaultProps} onLoadDemo={handleLoadDemo} />);

    expect(screen.getByText('Load Demo Case')).toBeInTheDocument();
  });

  it('calls onLoadDemo when demo button is clicked', () => {
    const handleLoadDemo = vi.fn();
    render(<NoCaseView {...defaultProps} onLoadDemo={handleLoadDemo} />);

    fireEvent.click(screen.getByText('Load Demo Case'));
    expect(handleLoadDemo).toHaveBeenCalledTimes(1);
  });

  it('does not render demo button when onLoadDemo not provided', () => {
    render(<NoCaseView {...defaultProps} />);

    expect(screen.queryByText('Load Demo Case')).not.toBeInTheDocument();
  });

  it('applies correct connection status styling', () => {
    const { rerender } = render(<NoCaseView {...defaultProps} isConnected={true} />);

    // Connected - green
    const connectedStatus = screen.getByText('Connected to Dispatch').closest('div');
    expect(connectedStatus).toHaveClass('bg-green-100');

    // Disconnected - red
    rerender(<NoCaseView {...defaultProps} isConnected={false} />);
    const disconnectedStatus = screen.getByText('Reconnecting...').closest('div');
    expect(disconnectedStatus).toHaveClass('bg-red-100');
  });
});
