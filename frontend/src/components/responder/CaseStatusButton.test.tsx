/**
 * Tests for CaseStatusButton component
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '../../test/testUtils';
import CaseStatusButton from './CaseStatusButton';
import type { CaseStatus } from '../../types/responderTypes';

describe('CaseStatusButton', () => {
  const defaultProps = {
    currentStatus: 'pending' as CaseStatus,
    responderType: 'ambulance' as const,
    onStatusChange: vi.fn(),
  };

  it('renders Accept Case button for pending status', () => {
    render(<CaseStatusButton {...defaultProps} />);

    expect(screen.getByText('Accept Case')).toBeInTheDocument();
  });

  it('renders Start Route button for accepted status', () => {
    render(
      <CaseStatusButton {...defaultProps} currentStatus="accepted" />
    );

    expect(screen.getByText('Start Route')).toBeInTheDocument();
  });

  it('renders Arrived on Scene button for en_route status', () => {
    render(
      <CaseStatusButton {...defaultProps} currentStatus="en_route" />
    );

    expect(screen.getByText('Arrived on Scene')).toBeInTheDocument();
  });

  it('renders Start Transport button for on_scene status', () => {
    render(
      <CaseStatusButton
        {...defaultProps}
        currentStatus="on_scene"
      />
    );

    expect(screen.getByText('Start Transport')).toBeInTheDocument();
  });

  it('renders Complete Case button for transporting status', () => {
    render(
      <CaseStatusButton {...defaultProps} currentStatus="transporting" />
    );

    expect(screen.getByText('Complete Case')).toBeInTheDocument();
  });

  it('renders Case Completed message for completed status', () => {
    render(
      <CaseStatusButton {...defaultProps} currentStatus="completed" />
    );

    expect(screen.getByText('Case Completed')).toBeInTheDocument();
    // Should not be a button
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('calls onStatusChange with correct next status when clicked', () => {
    const handleStatusChange = vi.fn();
    render(
      <CaseStatusButton
        {...defaultProps}
        currentStatus="pending"
        onStatusChange={handleStatusChange}
      />
    );

    fireEvent.click(screen.getByText('Accept Case'));
    expect(handleStatusChange).toHaveBeenCalledWith('accepted');
  });

  it('progresses through status flow correctly', () => {
    const handleStatusChange = vi.fn();
    const { rerender } = render(
      <CaseStatusButton
        {...defaultProps}
        currentStatus="pending"
        onStatusChange={handleStatusChange}
      />
    );

    // pending -> accepted
    fireEvent.click(screen.getByText('Accept Case'));
    expect(handleStatusChange).toHaveBeenCalledWith('accepted');

    // accepted -> en_route
    rerender(
      <CaseStatusButton
        {...defaultProps}
        currentStatus="accepted"
        onStatusChange={handleStatusChange}
      />
    );
    fireEvent.click(screen.getByText('Start Route'));
    expect(handleStatusChange).toHaveBeenCalledWith('en_route');

    // en_route -> on_scene
    rerender(
      <CaseStatusButton
        {...defaultProps}
        currentStatus="en_route"
        onStatusChange={handleStatusChange}
      />
    );
    fireEvent.click(screen.getByText('Arrived on Scene'));
    expect(handleStatusChange).toHaveBeenCalledWith('on_scene');

    // on_scene -> transporting
    rerender(
      <CaseStatusButton
        {...defaultProps}
        currentStatus="on_scene"
        onStatusChange={handleStatusChange}
      />
    );
    fireEvent.click(screen.getByText('Start Transport'));
    expect(handleStatusChange).toHaveBeenCalledWith('transporting');

    // transporting -> completed
    rerender(
      <CaseStatusButton
        {...defaultProps}
        currentStatus="transporting"
        onStatusChange={handleStatusChange}
      />
    );
    fireEvent.click(screen.getByText('Complete Case'));
    expect(handleStatusChange).toHaveBeenCalledWith('completed');
  });

  it('applies disabled styling when disabled', () => {
    render(
      <CaseStatusButton {...defaultProps} disabled />
    );

    const button = screen.getByRole('button');
    expect(button).toBeDisabled();
  });

  it('has large touch target for emergency use', () => {
    render(<CaseStatusButton {...defaultProps} />);

    const button = screen.getByRole('button');
    expect(button).toHaveStyle({ minHeight: '72px' });
  });
});
