import { type Server } from 'node:http';
import * as http from 'node:http';
import { gunzipSync, gzipSync } from 'node:zlib';
import express from 'express';
import {
  RESPONSE_COMPRESSION_THRESHOLD_BYTES,
  responseCompression,
} from '../src/common/http/response-compression';

type RawResponse = {
  body: Buffer;
  headers: http.IncomingHttpHeaders;
  statusCode: number;
};

const largeJson = {
  data: Array.from({ length: 200 }, (_, index) => ({
    id: `appointment-${index}`,
    status: 'CONFIRMED',
    consultationType: 'VIDEO',
    instructions: 'Please join five minutes before the consultation.',
  })),
};
const largeJsonBuffer = Buffer.from(JSON.stringify(largeJson));
const precompressedJson = gzipSync(largeJsonBuffer);

describe('response compression (e2e)', () => {
  let server: Server;
  let port: number;

  beforeAll(async () => {
    const app = express();
    app.use(responseCompression());
    app.get('/large-json', (_request, response) => response.json(largeJson));
    app.get('/large-text', (_request, response) =>
      response
        .type('text/plain')
        .send('AsaanCare response compression. '.repeat(200)),
    );
    app.get('/small-json', (_request, response) =>
      response.json({ message: 'small' }),
    );
    app.get('/precompressed-json', (_request, response) => {
      response.setHeader('Content-Type', 'application/json; charset=utf-8');
      response.setHeader('Content-Encoding', 'gzip');
      response.send(precompressedJson);
    });
    app.get('/image', (_request, response) =>
      response.type('image/png').send(Buffer.alloc(4096, 0xab)),
    );

    await new Promise<void>((resolve, reject) => {
      server = app.listen(0, '127.0.0.1', (error?: Error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
    const address = server.address();
    if (address === null || typeof address === 'string') {
      throw new Error(
        'Expected the compression test server to use a TCP port.',
      );
    }
    port = address.port;
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  });

  it('negotiates gzip for JSON above the threshold and materially reduces wire bytes', async () => {
    expect(largeJsonBuffer.length).toBeGreaterThan(
      RESPONSE_COMPRESSION_THRESHOLD_BYTES,
    );

    const identity = await getRaw('/large-json');
    const compressed = await getRaw('/large-json', 'gzip');

    expect(identity.headers['content-encoding']).toBeUndefined();
    expect(compressed.headers['content-encoding']).toBe('gzip');
    expect(compressed.headers.vary).toContain('Accept-Encoding');
    expect(compressed.body.length).toBeLessThan(identity.body.length * 0.35);
    expect(JSON.parse(gunzipSync(compressed.body).toString('utf8'))).toEqual(
      largeJson,
    );
  });

  it('compresses large text responses when gzip is accepted', async () => {
    const response = await getRaw('/large-text', 'gzip');

    expect(response.headers['content-encoding']).toBe('gzip');
    expect(gunzipSync(response.body).toString('utf8')).toBe(
      'AsaanCare response compression. '.repeat(200),
    );
  });

  it('does not compress responses below the threshold', async () => {
    const response = await getRaw('/small-json', 'gzip');

    expect(response.headers['content-encoding']).toBeUndefined();
    expect(JSON.parse(response.body.toString('utf8'))).toEqual({
      message: 'small',
    });
  });

  it('does not compress without an acceptable content encoding', async () => {
    const response = await getRaw('/large-json', 'identity');

    expect(response.headers['content-encoding']).toBeUndefined();
    expect(JSON.parse(response.body.toString('utf8'))).toEqual(largeJson);
  });

  it('does not double-compress a response that is already encoded', async () => {
    const response = await getRaw('/precompressed-json', 'gzip');

    expect(response.headers['content-encoding']).toBe('gzip');
    expect(response.body.equals(precompressedJson)).toBe(true);
    expect(JSON.parse(gunzipSync(response.body).toString('utf8'))).toEqual(
      largeJson,
    );
  });

  it('does not compress already-compressed media types', async () => {
    const response = await getRaw('/image', 'gzip');

    expect(response.headers['content-encoding']).toBeUndefined();
    expect(response.body).toEqual(Buffer.alloc(4096, 0xab));
  });

  function getRaw(path: string, acceptEncoding?: string): Promise<RawResponse> {
    return new Promise((resolve, reject) => {
      const request = http.get(
        {
          host: '127.0.0.1',
          port,
          path,
          headers: acceptEncoding
            ? { 'Accept-Encoding': acceptEncoding }
            : undefined,
        },
        (response) => {
          const chunks: Buffer[] = [];
          response.on('data', (chunk: Buffer) => chunks.push(chunk));
          response.on('end', () =>
            resolve({
              body: Buffer.concat(chunks),
              headers: response.headers,
              statusCode: response.statusCode ?? 0,
            }),
          );
        },
      );
      request.on('error', reject);
    });
  }
});
