import { DomainError } from '@/domain/errors/domain-error';

export interface PageRequest {
  page: number;
  pageSize: number;
}

export interface PageResult<T> {
  items: T[];
  page: number;
  nextPage: number | null;
  totalCount: number | null;
}

export function validatePageRequest(request: PageRequest): void {
  if (!Number.isInteger(request.page) || request.page < 1) {
    throw new DomainError(
      'Page must be an integer greater than or equal to 1.',
    );
  }
  if (!Number.isInteger(request.pageSize) || request.pageSize < 1) {
    throw new DomainError(
      'Page size must be an integer greater than or equal to 1.',
    );
  }
}
