const PREFIX = "[ChatGPT Queue Steer]";

export function logInfo(message: string, ...args: unknown[]): void {
  console.info(PREFIX, message, ...args);
}

export function logWarn(message: string, ...args: unknown[]): void {
  console.warn(PREFIX, message, ...args);
}

export function logError(message: string, ...args: unknown[]): void {
  console.error(PREFIX, message, ...args);
}

export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === "string") {
    return error;
  }
  try {
    return JSON.stringify(error);
  } catch {
    return "Unknown error";
  }
}
