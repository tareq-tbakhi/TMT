/**
 * Tests for EquipmentChecklist component
 */

import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '../../test/testUtils';
import EquipmentChecklist from './EquipmentChecklist';

const mockEquipment = [
  'Fire Extinguisher',
  'First Aid Kit',
  'Flashlight',
];

describe('EquipmentChecklist', () => {
  it('renders nothing when equipment array is empty', () => {
    const { container } = render(<EquipmentChecklist equipment={[]} />);
    expect(container.firstChild).toBeNull();
  });

  // Note: The component expects valid equipment array - this test verifies behavior with empty array only
  // Undefined equipment would be a programming error that TypeScript prevents

  it('renders equipment list with default title', () => {
    render(<EquipmentChecklist equipment={mockEquipment} />);

    expect(screen.getByText('Required Equipment')).toBeInTheDocument();
  });

  it('renders custom title when provided', () => {
    render(<EquipmentChecklist equipment={mockEquipment} title="Safety Gear" />);

    expect(screen.getByText('Safety Gear')).toBeInTheDocument();
  });

  it('renders all equipment items', () => {
    render(<EquipmentChecklist equipment={mockEquipment} />);

    expect(screen.getByText('Fire Extinguisher')).toBeInTheDocument();
    expect(screen.getByText('First Aid Kit')).toBeInTheDocument();
    expect(screen.getByText('Flashlight')).toBeInTheDocument();
  });

  it('shows initial progress as 0/total', () => {
    render(<EquipmentChecklist equipment={mockEquipment} />);

    expect(screen.getByText('0/3')).toBeInTheDocument();
  });

  it('toggles item checked state when clicked', () => {
    render(<EquipmentChecklist equipment={mockEquipment} />);

    // Click on Fire Extinguisher
    const fireExtButton = screen.getByText('Fire Extinguisher').closest('button');
    fireEvent.click(fireExtButton!);

    // Progress should update
    expect(screen.getByText('1/3')).toBeInTheDocument();
  });

  it('updates progress when multiple items are checked', () => {
    render(<EquipmentChecklist equipment={mockEquipment} />);

    // Click on all items
    fireEvent.click(screen.getByText('Fire Extinguisher').closest('button')!);
    fireEvent.click(screen.getByText('First Aid Kit').closest('button')!);

    expect(screen.getByText('2/3')).toBeInTheDocument();
  });

  it('shows Ready badge when all items are checked', () => {
    render(<EquipmentChecklist equipment={mockEquipment} />);

    // Click on all items
    mockEquipment.forEach((item) => {
      fireEvent.click(screen.getByText(item).closest('button')!);
    });

    expect(screen.getByText('Ready')).toBeInTheDocument();
    expect(screen.getByText('All Equipment Ready')).toBeInTheDocument();
  });

  it('unchecks item when clicked again', () => {
    render(<EquipmentChecklist equipment={mockEquipment} />);

    const fireExtButton = screen.getByText('Fire Extinguisher').closest('button');

    // Check
    fireEvent.click(fireExtButton!);
    expect(screen.getByText('1/3')).toBeInTheDocument();

    // Uncheck
    fireEvent.click(fireExtButton!);
    expect(screen.getByText('0/3')).toBeInTheDocument();
  });

  it('applies strikethrough styling to checked items', () => {
    render(<EquipmentChecklist equipment={mockEquipment} />);

    const fireExtButton = screen.getByText('Fire Extinguisher').closest('button');
    fireEvent.click(fireExtButton!);

    // The text span should have line-through class
    const textSpan = screen.getByText('Fire Extinguisher');
    expect(textSpan).toHaveClass('line-through');
  });

  it('applies green background to checked items', () => {
    render(<EquipmentChecklist equipment={mockEquipment} />);

    const fireExtButton = screen.getByText('Fire Extinguisher').closest('button');
    fireEvent.click(fireExtButton!);

    expect(fireExtButton).toHaveClass('bg-green-50');
  });
});
