import { DomainError } from '@/domain/errors/domain-error';

export function validateUserScore(score: number | null): number | null {
  if (score === null) return null;
  if (!Number.isInteger(score) || score < 1 || score > 10) {
    throw new DomainError(
      'A user score must be a whole number between 1 and 10.',
    );
  }
  return score;
}
