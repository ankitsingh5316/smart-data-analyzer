export interface FilterOperator {
  id: string;
  label: string;
  kind: 'value' | 'range' | 'none';
}

export const FILTER_OPERATORS: FilterOperator[] = [
  { id: 'eq', label: 'Equals', kind: 'value' },
  { id: 'neq', label: 'Not equals', kind: 'value' },
  { id: 'contains', label: 'Contains', kind: 'value' },
  { id: 'not_contains', label: 'Does not contain', kind: 'value' },
  { id: 'gt', label: 'Greater than', kind: 'value' },
  { id: 'lt', label: 'Less than', kind: 'value' },
  { id: 'between', label: 'Between', kind: 'range' },
  { id: 'starts_with', label: 'Starts with', kind: 'value' },
  { id: 'ends_with', label: 'Ends with', kind: 'value' },
  { id: 'is_empty', label: 'Is empty', kind: 'none' },
  { id: 'is_not_empty', label: 'Is not empty', kind: 'none' },
  { id: 'date_range', label: 'Date range', kind: 'range' }
];

export function operatorKind(id: string): FilterOperator['kind'] {
  return FILTER_OPERATORS.find((item) => item.id === id)?.kind ?? 'value';
}
