import { Request, Response, NextFunction } from 'express';
import { ApiError } from '../types';
import { Logger } from '../utils/logger';

export class AppError extends Error {
  constructor(
    public statusCode: number,
    public code: string,
    message: string,
    public details?: unknown
  ) {
    super(message);
    this.name = 'AppError';
    Error.captureStackTrace(this, this.constructor);
  }
}

export const errorHandler = (
  err: Error | AppError,
  req: Request,
  res: Response,
  _next: NextFunction
): void => {
  Logger.error('Error occurred', {
    error: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method,
  });

  if (err instanceof AppError) {
    const errorResponse: { success: boolean; error: ApiError; timestamp: number } = {
      success: false,
      error: {
        code: err.code,
        message: err.message,
        statusCode: err.statusCode,
        details: err.details,
      },
      timestamp: Date.now(),
    };

    res.status(err.statusCode).json(errorResponse);
    return;
  }

  // Handle unexpected errors
  const errorResponse: { success: boolean; error: ApiError; timestamp: number } = {
    success: false,
    error: {
      code: 'INTERNAL_SERVER_ERROR',
      message: 'An unexpected error occurred',
      statusCode: 500,
    },
    timestamp: Date.now(),
  };

  res.status(500).json(errorResponse);
};

export const notFoundHandler = (req: Request, res: Response): void => {
  const errorResponse: { success: boolean; error: ApiError; timestamp: number } = {
    success: false,
    error: {
      code: 'NOT_FOUND',
      message: `Route ${req.method} ${req.path} not found`,
      statusCode: 404,
    },
    timestamp: Date.now(),
  };

  res.status(404).json(errorResponse);
};
