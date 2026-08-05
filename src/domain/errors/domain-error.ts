export class DomainError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DomainError';
  }
}

export class RepositoryError extends Error {
  constructor(
    message = 'The mock repository could not complete this request.',
  ) {
    super(message);
    this.name = 'RepositoryError';
  }
}
