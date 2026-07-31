import compression from 'compression';
import type { Request, RequestHandler, Response } from 'express';

export const RESPONSE_COMPRESSION_THRESHOLD_BYTES = 1024;

const JSON_OR_TEXT_CONTENT_TYPE =
  /^(?:text\/|application\/(?:[\w!#$&^_.+-]+\+)?json\b)/i;

export function shouldCompressResponse(
  request: Request,
  response: Response,
): boolean {
  const contentEncoding = response.getHeader('Content-Encoding');
  if (
    contentEncoding !== undefined &&
    String(contentEncoding).toLowerCase() !== 'identity'
  ) {
    return false;
  }

  const contentType = response.getHeader('Content-Type');
  if (
    contentType === undefined ||
    !JSON_OR_TEXT_CONTENT_TYPE.test(String(contentType))
  ) {
    return false;
  }

  return compression.filter(request, response);
}

export function responseCompression(): RequestHandler {
  return compression({
    enforceEncoding: 'identity',
    filter: shouldCompressResponse,
    threshold: RESPONSE_COMPRESSION_THRESHOLD_BYTES,
  });
}
