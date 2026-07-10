/** Shared error type — importable from both browser code and Node tests. */
export class ApiError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}
