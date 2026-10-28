// Domain errors carry an HTTP status so route handlers and server actions can
// map them consistently. Cross-org access is reported as NotFound (404).
export class AppError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
  ) {
    super(message);
  }
}

export class NotFound extends AppError {
  constructor(what = "Not found") {
    super(what, 404, "not_found");
  }
}

export class Forbidden extends AppError {
  constructor(message = "You don't have permission to do that") {
    super(message, 403, "forbidden");
  }
}

export class Unauthenticated extends AppError {
  constructor() {
    super("Sign in required", 401, "unauthenticated");
  }
}

export class Conflict extends AppError {
  constructor(message: string) {
    super(message, 409, "conflict");
  }
}

export class Invalid extends AppError {
  constructor(message: string) {
    super(message, 422, "invalid");
  }
}

export class RateLimited extends AppError {
  constructor() {
    super("Too many requests. Please wait and try again.", 429, "rate_limited");
  }
}

export class NotEntitled extends AppError {
  constructor(message: string) {
    super(message, 402, "not_entitled");
  }
}
